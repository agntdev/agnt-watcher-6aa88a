import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { fetchBatchPrices } from "../coingecko.js";
import { getUserProfile, getWatchlist, getAllUserIds } from "../storage.js";
import { now } from "../clock.js";

const composer = new Composer<Ctx>();

// Track which users have already received today's summary
const sentToday = new Set<string>();
let lastResetDay = "";

function resetDaily(): void {
  const today = now().toISOString().slice(0, 10);
  if (today !== lastResetDay) {
    sentToday.clear();
    lastResetDay = today;
  }
}

// Send morning summary to a single user
async function sendMorningSummary(
  ctx: Ctx,
  userId: number,
): Promise<void> {
  const profile = getUserProfile(userId);
  if (!profile || !profile.morningSummaryEnabled) return;

  const tz = profile.timezone;
  const nowDate = now();
  const localHour = parseInt(
    nowDate.toLocaleTimeString("en-US", { timeZone: tz, hour: "2-digit", hour12: false }),
    10,
  );
  const localMinute = parseInt(
    nowDate.toLocaleTimeString("en-US", { timeZone: tz, minute: "2-digit", hour12: false }),
    10,
  );

  // Parse summary time (HH:MM)
  const [summaryHour, summaryMinute] = profile.morningSummaryTime.split(":").map(Number);

  // Check if it's time (within 1-minute window)
  if (localHour !== summaryHour || localMinute !== summaryMinute) return;

  const key = `${userId}:${nowDate.toISOString().slice(0, 10)}`;
  if (sentToday.has(key)) return;
  sentToday.add(key);

  const watchlist = getWatchlist(userId);
  if (watchlist.length === 0) return;

  const coinIds = [...new Set(watchlist.map((w) => w.coinId))];
  const prices = await fetchBatchPrices(coinIds);

  const lines = watchlist.map((w) => {
    const p = prices[w.coinId];
    if (!p) return `• ${w.ticker} — unavailable`;
    const arrow = p.change1hPercent >= 0 ? "▲" : "▼";
    return `• ${w.ticker} — $${p.priceUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${arrow}${p.change1hPercent >= 0 ? "+" : ""}${p.change1hPercent.toFixed(1)}% 1h)`;
  });

  const message =
    `🌅 Good morning! Here's your crypto overview:\n\n` +
    lines.join("\n") +
    `\n\nHave a great day!`;

  try {
    await ctx.api.sendMessage(userId, message);
  } catch {
    // User may have blocked the bot — silently skip
  }
}

// Check all users every minute for morning summary time
async function checkMorningSummaries(ctx: Ctx): Promise<void> {
  resetDaily();
  const userIds = getAllUserIds();
  for (const uid of userIds) {
    await sendMorningSummary(ctx, uid);
  }
}

// Run check on every update (lightweight — just checks if it's time)
composer.on("message", async (ctx, next) => {
  await checkMorningSummaries(ctx);
  return next();
});

composer.on("callback_query", async (ctx, next) => {
  await checkMorningSummaries(ctx);
  return next();
});

export default composer;
