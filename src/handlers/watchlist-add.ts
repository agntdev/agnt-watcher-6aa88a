import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem, inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { tickerToCoinId, searchCoins, fetchPrice } from "../coingecko.js";
import {
  getWatchlist,
  getWatchlistItem,
  addWatchlistItem,
  removeWatchlistItem,
  findWatchlistItemByTicker,
} from "../storage.js";

registerMainMenuItem({ label: "➕ Add Coin", data: "watchlist:add", order: 20 });

const composer = new Composer<Ctx>();

const COMMON_COINS = [
  { label: "BTC", data: "wl:add:bitcoin:BTC" },
  { label: "ETH", data: "wl:add:ethereum:ETH" },
  { label: "SOL", data: "wl:add:solana:SOL" },
  { label: "BNB", data: "wl:add:binancecoin:BNB" },
  { label: "XRP", data: "wl:add:ripple:XRP" },
  { label: "ADA", data: "wl:add:cardano:ADA" },
  { label: "DOGE", data: "wl:add:dogecoin:DOGE" },
  { label: "DOT", data: "wl:add:polkadot:DOT" },
];

// Main watchlist view — show current watchlist + add options
composer.callbackQuery("watchlist:add", async (ctx) => {
  await ctx.answerCallbackQuery();
  const userId = ctx.from?.id;
  if (!userId) return;

  const watchlist = getWatchlist(userId);
  const keyboard: ReturnType<typeof inlineButton>[][] = [];

  if (watchlist.length > 0) {
    // Show current watchlist with remove buttons
    keyboard.push([inlineButton("━━━ Your watchlist ━━━", "noop")]);
    for (const item of watchlist) {
      keyboard.push([
        inlineButton(`${item.enabled ? "🟢" : "🔴"} ${item.ticker} — ${item.label}`, `wl:view:${item.id}`),
        inlineButton("✕", `wl:rm:${item.id}`),
      ]);
    }
    keyboard.push([]);
  }

  // Add common coins
  keyboard.push([inlineButton("━━━ Quick add ━━━", "noop")]);
  const coinRows: ReturnType<typeof inlineButton>[][] = [];
  for (let i = 0; i < COMMON_COINS.length; i += 4) {
    coinRows.push(
      COMMON_COINS.slice(i, i + 4).map((c) => inlineButton(c.label, c.data)),
    );
  }
  keyboard.push(...coinRows);

  // Custom ticker input
  keyboard.push([inlineButton("🔍 Search by name", "wl:search")]);
  keyboard.push([inlineButton("⬅️ Back to menu", "menu:main")]);

  const text =
    watchlist.length === 0
      ? "Your watchlist is empty — pick a coin below or search by name."
      : `Your watchlist (${watchlist.length} coins) — tap a coin to see details, ✕ to remove.`;

  await ctx.editMessageText(text, { reply_markup: inlineKeyboard(keyboard) });
});

// Quick-add common coin
composer.callbackQuery(/^wl:add:(.+):(.+)$/, async (ctx) => {
  const coinId = ctx.match![1];
  const ticker = ctx.match![2];
  const userId = ctx.from?.id;
  if (!userId) return;
  await ctx.answerCallbackQuery();

  const existing = findWatchlistItemByTicker(userId, ticker);
  if (existing) {
    await ctx.answerCallbackQuery({ text: `${ticker} is already on your watchlist`, show_alert: true });
    return;
  }

  const price = await fetchPrice(coinId);
  const label = price?.ticker ?? ticker;

  addWatchlistItem({
    userId,
    ticker,
    coinId,
    label,
    enabled: true,
  });

  const priceStr = price ? ` — $${price.priceUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "";
  await ctx.answerCallbackQuery({ text: `${ticker} added${priceStr}`, show_alert: true });

  // Refresh watchlist view
  await refreshWatchlistView(ctx, userId);
});

// View coin details
composer.callbackQuery(/^wl:view:(.+)$/, async (ctx) => {
  const itemId = ctx.match![1];
  const userId = ctx.from?.id;
  if (!userId) return;
  await ctx.answerCallbackQuery();

  const item = getWatchlistItem(itemId);
  if (!item) return;

  const price = await fetchPrice(item.coinId);
  const priceStr = price
    ? `$${price.priceUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "unavailable";

  await ctx.editMessageText(
    `📊 ${item.ticker} — ${item.label}\nPrice: ${priceStr}`,
    {
      reply_markup: inlineKeyboard([
        [
          inlineButton(
            item.enabled ? "🔴 Disable alerts" : "🟢 Enable alerts",
            `wl:toggle:${item.id}`,
          ),
        ],
        [inlineButton("⬅️ Back to watchlist", "watchlist:add")],
      ]),
    },
  );
});

// Toggle coin enabled/disabled
composer.callbackQuery(/^wl:toggle:(.+)$/, async (ctx) => {
  const itemId = ctx.match![1];
  const userId = ctx.from?.id;
  if (!userId) return;
  await ctx.answerCallbackQuery();

  const item = getWatchlistItem(itemId);
  if (!item) return;

  // Remove and re-add with toggled state
  removeWatchlistItem(itemId);
  addWatchlistItem({
    userId: item.userId,
    ticker: item.ticker,
    coinId: item.coinId,
    label: item.label,
    enabled: !item.enabled,
  });

  await ctx.answerCallbackQuery({ text: item.enabled ? "Alerts disabled" : "Alerts enabled" });
  await refreshWatchlistView(ctx, userId);
});

// Remove coin from watchlist
composer.callbackQuery(/^wl:rm:(.+)$/, async (ctx) => {
  const itemId = ctx.match![1];
  const userId = ctx.from?.id;
  if (!userId) return;
  await ctx.answerCallbackQuery();

  removeWatchlistItem(itemId);
  await ctx.answerCallbackQuery({ text: "Removed" });
  await refreshWatchlistView(ctx, userId);
});

// Search by name
composer.callbackQuery("wl:search", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  await ctx.answerCallbackQuery();

  ctx.session.step = "watchlist_search";
  await ctx.reply(
    "Type a coin name (e.g. \"Polygon\" or \"Chainlink\") and I'll find it.",
    {
      reply_markup: {
        force_reply: true,
        input_field_placeholder: "Coin name…",
      },
    },
  );
});

// Handle text input for search
composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "watchlist_search") return next();

  const query = ctx.message.text.trim();
  const userId = ctx.from?.id;
  if (!userId || query.length < 2) {
    await ctx.reply("Type at least 2 characters to search.");
    return;
  }

  ctx.session.step = undefined;
  const results = await searchCoins(query);

  if (results.length === 0) {
    await ctx.reply(
      `No coins found for "${query}". Try a different name.`,
      {
        reply_markup: inlineKeyboard([
          [inlineButton("🔍 Search again", "wl:search")],
          [inlineButton("⬅️ Back to watchlist", "watchlist:add")],
        ]),
      },
    );
    return;
  }

  const keyboard = results.map((r) => [
    inlineButton(`${r.symbol} — ${r.name}`, `wl:add:${r.id}:${r.symbol}`),
  ]);
  keyboard.push([inlineButton("⬅️ Back to watchlist", "watchlist:add")]);

  await ctx.reply(`Found ${results.length} coins:`, {
    reply_markup: inlineKeyboard(keyboard),
  });
});

async function refreshWatchlistView(ctx: Ctx, userId: number): Promise<void> {
  const watchlist = getWatchlist(userId);
  const keyboard: ReturnType<typeof inlineButton>[][] = [];

  if (watchlist.length > 0) {
    keyboard.push([inlineButton("━━━ Your watchlist ━━━", "noop")]);
    for (const item of watchlist) {
      keyboard.push([
        inlineButton(`${item.enabled ? "🟢" : "🔴"} ${item.ticker} — ${item.label}`, `wl:view:${item.id}`),
        inlineButton("✕", `wl:rm:${item.id}`),
      ]);
    }
    keyboard.push([]);
  }

  keyboard.push([inlineButton("━━━ Quick add ━━━", "noop")]);
  const coinRows: ReturnType<typeof inlineButton>[][] = [];
  for (let i = 0; i < COMMON_COINS.length; i += 4) {
    coinRows.push(
      COMMON_COINS.slice(i, i + 4).map((c) => inlineButton(c.label, c.data)),
    );
  }
  keyboard.push(...coinRows);
  keyboard.push([inlineButton("🔍 Search by name", "wl:search")]);
  keyboard.push([inlineButton("⬅️ Back to menu", "menu:main")]);

  const text =
    watchlist.length === 0
      ? "Your watchlist is empty — pick a coin below or search by name."
      : `Your watchlist (${watchlist.length} coins) — tap a coin to see details, ✕ to remove.`;

  await ctx.editMessageText(text, { reply_markup: inlineKeyboard(keyboard) });
}

export default composer;
