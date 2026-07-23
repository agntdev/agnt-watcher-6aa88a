import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import {
  getUserCount,
  getUserAlertCount,
  getAllAlerts,
  getAllUserIds,
  getWatchlist,
} from "../storage.js";

const OWNER_IDS = (process.env.OWNER_IDS ?? "")
  .split(",")
  .map((s) => parseInt(s.trim(), 10))
  .filter((n) => !isNaN(n));

function isOwner(userId: number): boolean {
  if (OWNER_IDS.length === 0) return false;
  return OWNER_IDS.includes(userId);
}

const composer = new Composer<Ctx>();

// Hidden command — /owner
composer.command("owner", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId || !isOwner(userId)) {
    await ctx.reply("This command is restricted to the bot owner.");
    return;
  }
  await renderDashboard(ctx);
});

// Also accessible via button (if wired in, but kept hidden from main menu)
composer.callbackQuery("owner:dashboard", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId || !isOwner(userId)) {
    await ctx.answerCallbackQuery({ text: "Owner only", show_alert: true });
    return;
  }
  await ctx.answerCallbackQuery();
  await renderDashboardInline(ctx);
});

async function renderDashboard(ctx: Ctx): Promise<void> {
  const totalUsers = getUserCount();
  const totalAlerts = getUserAlertCount();
  const allAlerts = getAllAlerts();

  // Top alerts by frequency (alerts with most recent fires)
  const topAlerts = [...allAlerts]
    .sort((a, b) => b.lastFiredAt - a.lastFiredAt)
    .slice(0, 10);

  const topLines = topAlerts.length > 0
    ? topAlerts.map((a, i) => `${i + 1}. ${a.ticker} ${a.type === "threshold" ? a.direction + " $" + a.value : a.direction + " " + a.value + "%"} (user ${a.userId})`).join("\n")
    : "No alerts fired yet.";

  // Watchlist distribution
  const allUserIds = getAllUserIds();
  let totalWatchlist = 0;
  for (const uid of allUserIds) {
    totalWatchlist += getWatchlist(uid).length;
  }

  await ctx.reply(
    `📊 Owner Dashboard\n\n` +
    `👥 Total users: ${totalUsers}\n` +
    `🔔 Total alerts: ${totalAlerts}\n` +
    `📋 Total watchlist items: ${totalWatchlist}\n\n` +
    `🏆 Top alerts by recency:\n${topLines}`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("🔄 Refresh", "owner:dashboard")],
        [inlineButton("⬅️ Back", "menu:main")],
      ]),
    },
  );
}

async function renderDashboardInline(ctx: Ctx): Promise<void> {
  const totalUsers = getUserCount();
  const totalAlerts = getUserAlertCount();
  const allAlerts = getAllAlerts();

  const topAlerts = [...allAlerts]
    .sort((a, b) => b.lastFiredAt - a.lastFiredAt)
    .slice(0, 10);

  const topLines = topAlerts.length > 0
    ? topAlerts.map((a, i) => `${i + 1}. ${a.ticker} ${a.type === "threshold" ? a.direction + " $" + a.value : a.direction + " " + a.value + "%"} (user ${a.userId})`).join("\n")
    : "No alerts fired yet.";

  const allUserIds = getAllUserIds();
  let totalWatchlist = 0;
  for (const uid of allUserIds) {
    totalWatchlist += getWatchlist(uid).length;
  }

  await ctx.editMessageText(
    `📊 Owner Dashboard\n\n` +
    `👥 Total users: ${totalUsers}\n` +
    `🔔 Total alerts: ${totalAlerts}\n` +
    `📋 Total watchlist items: ${totalWatchlist}\n\n` +
    `🏆 Top alerts by recency:\n${topLines}`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("🔄 Refresh", "owner:dashboard")],
        [inlineButton("⬅️ Back", "menu:main")],
      ]),
    },
  );
}

export default composer;
