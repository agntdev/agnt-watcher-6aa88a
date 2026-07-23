import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem, inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { tickerToCoinId, fetchPrice, type CoinPrice } from "../coingecko.js";
import { getWatchlist, getUserProfile } from "../storage.js";
import { now } from "../clock.js";

registerMainMenuItem({ label: "💰 Price", data: "price:show", order: 10 });

const composer = new Composer<Ctx>();

function formatPrice(price: CoinPrice): string {
  const arrow = price.change1hPercent >= 0 ? "▲" : "▼";
  const changeStr = price.change1hPercent >= 0
    ? `+${price.change1hPercent.toFixed(2)}%`
    : `${price.change1hPercent.toFixed(2)}%`;

  let capStr = "";
  if (price.marketCapUsd >= 1e12) {
    capStr = `Market cap: $${(price.marketCapUsd / 1e12).toFixed(1)}T`;
  } else if (price.marketCapUsd >= 1e9) {
    capStr = `Market cap: $${(price.marketCapUsd / 1e9).toFixed(1)}B`;
  } else if (price.marketCapUsd >= 1e6) {
    capStr = `Market cap: $${(price.marketCapUsd / 1e6).toFixed(1)}M`;
  }

  return (
    `💰 ${price.ticker} — $${formatUsd(price.priceUsd)}\n` +
    `${arrow} 1h: ${changeStr} | 24h: ${price.change24hPercent >= 0 ? "+" : ""}${price.change24hPercent.toFixed(2)}%\n` +
    (capStr ? `${capStr}\n` : "")
  ).trim();
}

function formatUsd(n: number): string {
  if (n >= 1) return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 0.01) return n.toFixed(4);
  return n.toFixed(6);
}

composer.command("price", async (ctx) => {
  const text = (ctx.message?.text ?? "").replace(/^\/price\s*/i, "").trim().toUpperCase();
  if (!text) {
    await ctx.reply("Usage: /price BTC — or tap 💰 Price below to check your watchlist.", {
      reply_markup: inlineKeyboard([[inlineButton("📋 My watchlist", "watchlist:add")]]),
    });
    return;
  }

  await sendPriceReply(ctx, text);
});

composer.callbackQuery("price:show", async (ctx) => {
  await ctx.answerCallbackQuery();
  const userId = ctx.from?.id;
  if (!userId) return;

  const profile = getUserProfile(userId);
  const watchlist = getWatchlist(userId);

  if (watchlist.length === 0) {
    await ctx.editMessageText(
      "Your watchlist is empty — add some coins first.",
      {
        reply_markup: inlineKeyboard([
          [inlineButton("➕ Add coin", "watchlist:add")],
          [inlineButton("⬅️ Back to menu", "menu:main")],
        ]),
      },
    );
    return;
  }

  const coinIds = [...new Set(watchlist.map((w) => w.coinId))];
  const { fetchBatchPrices } = await import("../coingecko.js");
  const prices = await fetchBatchPrices(coinIds);

  if (Object.keys(prices).length === 0) {
    await ctx.editMessageText(
      "Couldn't fetch prices right now — try again in a moment.",
      {
        reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
      },
    );
    return;
  }

  const lines = watchlist
    .map((w) => {
      const p = prices[w.coinId];
      if (!p) return `• ${w.ticker} — unavailable`;
      const arrow = p.change1hPercent >= 0 ? "▲" : "▼";
      return `• ${w.ticker} — $${formatUsd(p.priceUsd)} ${arrow} ${p.change1hPercent >= 0 ? "+" : ""}${p.change1hPercent.toFixed(1)}%`;
    })
    .join("\n");

  const tz = profile?.timezone ?? "UTC";
  const timeStr = now().toLocaleTimeString("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit" });

  await ctx.editMessageText(
    `📊 Prices (${timeStr} ${tz})\n\n${lines}`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("🔄 Refresh", "price:show")],
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    },
  );
});

// Handle /price TICKER from text
async function sendPriceReply(ctx: Ctx, ticker: string): Promise<void> {
  const coinId = tickerToCoinId(ticker);
  if (!coinId) {
    await ctx.reply(
      `Couldn't find "${ticker}". Try common tickers like BTC, ETH, SOL — or add it to your watchlist first.`,
      { reply_markup: inlineKeyboard([[inlineButton("➕ Add coin", "watchlist:add")]]) },
    );
    return;
  }

  const price = await fetchPrice(coinId);
  if (!price) {
    await ctx.reply("Couldn't fetch that price right now — try again in a moment.");
    return;
  }

  await ctx.reply(formatPrice(price), {
    reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
  });
}

export default composer;
