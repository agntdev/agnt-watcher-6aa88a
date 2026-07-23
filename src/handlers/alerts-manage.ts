import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem, inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { tickerToCoinId, fetchPrice } from "../coingecko.js";
import {
  getAlerts,
  getAlert,
  addAlert,
  updateAlert,
  removeAlert,
  getWatchlist,
  getUserProfile,
} from "../storage.js";

registerMainMenuItem({ label: "🔔 Alerts", data: "alerts:manage", order: 30 });

const composer = new Composer<Ctx>();

// Main alerts view
composer.callbackQuery("alerts:manage", async (ctx) => {
  await ctx.answerCallbackQuery();
  const userId = ctx.from?.id;
  if (!userId) return;

  const alerts = getAlerts(userId);
  const profile = getUserProfile(userId);

  if (alerts.length === 0) {
    await ctx.editMessageText(
      "No alerts set yet — create one to get notified when prices move.",
      {
        reply_markup: inlineKeyboard([
          [inlineButton("📈 Threshold alert", "alert:threshold:start")],
          [inlineButton("📊 Percent alert", "alert:percent:start")],
          [inlineButton("⬅️ Back to menu", "menu:main")],
        ]),
      },
    );
    return;
  }

  const lines = alerts.map((a) => {
    const icon = a.enabled ? "🟢" : "🔴";
    const typeStr = a.type === "threshold"
      ? `${a.direction} $${a.value}`
      : `${a.direction} ${a.value}%`;
    return `${icon} ${a.ticker} — ${typeStr}`;
  });

  const keyboard: ReturnType<typeof inlineButton>[][] = [];
  for (const a of alerts) {
    keyboard.push([
      inlineButton(`${a.enabled ? "🟢" : "🔴"} ${a.ticker} ${a.type === "threshold" ? a.direction + " $" + a.value : a.direction + " " + a.value + "%"}`, `alert:view:${a.id}`),
      inlineButton("✕", `alert:rm:${a.id}`),
    ]);
  }
  keyboard.push([]);
  keyboard.push([inlineButton("📈 Threshold alert", "alert:threshold:start")]);
  keyboard.push([inlineButton("📊 Percent alert", "alert:percent:start")]);
  keyboard.push([inlineButton("⬅️ Back to menu", "menu:main")]);

  const cooldownStr = profile?.cooldownMinutes ?? 240;
  await ctx.editMessageText(
    `Your alerts (${alerts.length}) — cooldown: ${cooldownStr}min between fires.\n\n${lines.join("\n")}`,
    { reply_markup: inlineKeyboard(keyboard) },
  );
});

// Start threshold alert creation
composer.callbackQuery("alert:threshold:start", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  await ctx.answerCallbackQuery();

  const watchlist = getWatchlist(userId);
  if (watchlist.length === 0) {
    ctx.session.step = undefined;
    await ctx.editMessageText(
      "Add coins to your watchlist first, then create alerts for them.",
      {
        reply_markup: inlineKeyboard([
          [inlineButton("➕ Add coin", "watchlist:add")],
          [inlineButton("⬅️ Back", "alerts:manage")],
        ]),
      },
    );
    return;
  }

  const keyboard = watchlist.map((w) => [
    inlineButton(w.ticker, `alert:threshold:pick:${w.ticker}:${w.coinId}`),
  ]);
  keyboard.push([inlineButton("⬅️ Back", "alerts:manage")]);

  ctx.session.alertType = "threshold";
  await ctx.editMessageText("Pick a coin for the threshold alert:", {
    reply_markup: inlineKeyboard(keyboard),
  });
});

// Pick coin for threshold alert
composer.callbackQuery(/^alert:threshold:pick:(.+):(.+)$/, async (ctx) => {
  const ticker = ctx.match![1];
  const coinId = ctx.match![2];
  const userId = ctx.from?.id;
  if (!userId) return;
  await ctx.answerCallbackQuery();

  ctx.session.alertTicker = ticker;
  ctx.session.alertCoinId = coinId;
  ctx.session.step = "alert_threshold_value";

  await ctx.reply(
    `Set the price threshold for ${ticker}. Reply with a USD value (e.g. 50000 for BTC above $50,000):`,
    {
      reply_markup: {
        force_reply: true,
        input_field_placeholder: "e.g. 50000",
      },
    },
  );
});

// Handle threshold value text input
composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "alert_threshold_value") return next();

  const text = ctx.message.text.trim();
  const value = parseFloat(text);
  if (isNaN(value) || value <= 0) {
    await ctx.reply("Enter a valid USD amount (e.g. 50000).");
    return;
  }

  const ticker = ctx.session.alertTicker;
  const coinId = ctx.session.alertCoinId;
  if (!ticker || !coinId) {
    ctx.session.step = undefined;
    await ctx.reply("Something went wrong — try creating the alert again.");
    return;
  }

  ctx.session.alertValue = value;
  ctx.session.step = undefined;

  const keyboard = inlineKeyboard([
    [inlineButton("Above $" + value, `alert:threshold:set:above`)],
    [inlineButton("Below $" + value, `alert:threshold:set:below`)],
    [inlineButton("Cancel", "alerts:manage")],
  ]);

  await ctx.reply(`When should ${ticker} fire?`, { reply_markup: keyboard });
});

// Set direction and create threshold alert
composer.callbackQuery(/^alert:threshold:set:(above|below)$/, async (ctx) => {
  const direction = ctx.match![1] as "above" | "below";
  const userId = ctx.from?.id;
  if (!userId) return;
  await ctx.answerCallbackQuery();

  const ticker = ctx.session.alertTicker;
  const coinId = ctx.session.alertCoinId;
  const value = ctx.session.alertValue;
  if (!ticker || !coinId || value === undefined) {
    await ctx.answerCallbackQuery({ text: "Something went wrong", show_alert: true });
    return;
  }

  const profile = getUserProfile(userId);
  const cooldown = profile?.cooldownMinutes ?? 240;

  addAlert({
    userId,
    ticker,
    coinId,
    type: "threshold",
    direction,
    value,
    lastFiredAt: 0,
    cooldownMinutes: cooldown,
    enabled: true,
  });

  ctx.session.alertTicker = undefined;
  ctx.session.alertCoinId = undefined;
  ctx.session.alertValue = undefined;

  await ctx.answerCallbackQuery({ text: "Alert created" });
  await ctx.editMessageText(
    `✅ Threshold alert set: ${ticker} ${direction} $${value.toLocaleString("en-US")}\nCooldown: ${cooldown}min between fires.`,
    {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to alerts", "alerts:manage")]]),
    },
  );
});

// Start percent alert creation
composer.callbackQuery("alert:percent:start", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  await ctx.answerCallbackQuery();

  const watchlist = getWatchlist(userId);
  if (watchlist.length === 0) {
    ctx.session.step = undefined;
    await ctx.editMessageText(
      "Add coins to your watchlist first, then create alerts for them.",
      {
        reply_markup: inlineKeyboard([
          [inlineButton("➕ Add coin", "watchlist:add")],
          [inlineButton("⬅️ Back", "alerts:manage")],
        ]),
      },
    );
    return;
  }

  const keyboard = watchlist.map((w) => [
    inlineButton(w.ticker, `alert:percent:pick:${w.ticker}:${w.coinId}`),
  ]);
  keyboard.push([inlineButton("⬅️ Back", "alerts:manage")]);

  ctx.session.alertType = "percent";
  await ctx.editMessageText("Pick a coin for the 1-hour percent alert:", {
    reply_markup: inlineKeyboard(keyboard),
  });
});

// Pick coin for percent alert
composer.callbackQuery(/^alert:percent:pick:(.+):(.+)$/, async (ctx) => {
  const ticker = ctx.match![1];
  const coinId = ctx.match![2];
  const userId = ctx.from?.id;
  if (!userId) return;
  await ctx.answerCallbackQuery();

  ctx.session.alertTicker = ticker;
  ctx.session.alertCoinId = coinId;
  ctx.session.step = "alert_percent_value";

  await ctx.reply(
    `Set the percentage threshold for ${ticker} (1-hour move). Reply with a number (e.g. 5 for 5%):`,
    {
      reply_markup: {
        force_reply: true,
        input_field_placeholder: "e.g. 5",
      },
    },
  );
});

// Handle percent value text input
composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "alert_percent_value") return next();

  const text = ctx.message.text.trim();
  const value = parseFloat(text);
  if (isNaN(value) || value <= 0 || value > 100) {
    await ctx.reply("Enter a valid percentage (1–100).");
    return;
  }

  const ticker = ctx.session.alertTicker;
  const coinId = ctx.session.alertCoinId;
  if (!ticker || !coinId) {
    ctx.session.step = undefined;
    await ctx.reply("Something went wrong — try creating the alert again.");
    return;
  }

  ctx.session.alertValue = value;
  ctx.session.step = undefined;

  const keyboard = inlineKeyboard([
    [inlineButton(`Up ${value}%`, `alert:percent:set:up`)],
    [inlineButton(`Down ${value}%`, `alert:percent:set:down`)],
    [inlineButton("Cancel", "alerts:manage")],
  ]);

  await ctx.reply(`When should ${ticker} fire?`, { reply_markup: keyboard });
});

// Set direction and create percent alert
composer.callbackQuery(/^alert:percent:set:(up|down)$/, async (ctx) => {
  const direction = ctx.match![1] as "up" | "down";
  const userId = ctx.from?.id;
  if (!userId) return;
  await ctx.answerCallbackQuery();

  const ticker = ctx.session.alertTicker;
  const coinId = ctx.session.alertCoinId;
  const value = ctx.session.alertValue;
  if (!ticker || !coinId || value === undefined) {
    await ctx.answerCallbackQuery({ text: "Something went wrong", show_alert: true });
    return;
  }

  const profile = getUserProfile(userId);
  const cooldown = profile?.cooldownMinutes ?? 240;

  addAlert({
    userId,
    ticker,
    coinId,
    type: "percent",
    direction,
    value,
    lastFiredAt: 0,
    cooldownMinutes: cooldown,
    enabled: true,
  });

  ctx.session.alertTicker = undefined;
  ctx.session.alertCoinId = undefined;
  ctx.session.alertValue = undefined;

  await ctx.answerCallbackQuery({ text: "Alert created" });
  await ctx.editMessageText(
    `✅ Percent alert set: ${ticker} ${direction} ${value}% in 1 hour\nCooldown: ${cooldown}min between fires.`,
    {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to alerts", "alerts:manage")]]),
    },
  );
});

// View alert details
composer.callbackQuery(/^alert:view:(.+)$/, async (ctx) => {
  const alertId = ctx.match![1];
  const userId = ctx.from?.id;
  if (!userId) return;
  await ctx.answerCallbackQuery();

  const alert = getAlert(alertId);
  if (!alert) return;

  const typeStr = alert.type === "threshold"
    ? `${alert.direction} $${alert.value.toLocaleString("en-US")}`
    : `${alert.direction} ${alert.value}% in 1 hour`;

  await ctx.editMessageText(
    `🔔 ${alert.ticker} alert\nType: ${typeStr}\nCooldown: ${alert.cooldownMinutes}min\nStatus: ${alert.enabled ? "Active" : "Paused"}`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton(alert.enabled ? "🔴 Pause" : "🟢 Resume", `alert:toggle:${alert.id}`)],
        [inlineButton("⬅️ Back to alerts", "alerts:manage")],
      ]),
    },
  );
});

// Toggle alert enabled/disabled
composer.callbackQuery(/^alert:toggle:(.+)$/, async (ctx) => {
  const alertId = ctx.match![1];
  const userId = ctx.from?.id;
  if (!userId) return;
  await ctx.answerCallbackQuery();

  const alert = getAlert(alertId);
  if (!alert) return;

  updateAlert(alertId, { enabled: !alert.enabled });
  await ctx.answerCallbackQuery({ text: alert.enabled ? "Paused" : "Resumed" });

  // Go back to alerts list
  await renderAlertsList(ctx, userId);
});

// Remove alert
composer.callbackQuery(/^alert:rm:(.+)$/, async (ctx) => {
  const alertId = ctx.match![1];
  const userId = ctx.from?.id;
  if (!userId) return;
  await ctx.answerCallbackQuery();

  removeAlert(alertId);
  await ctx.answerCallbackQuery({ text: "Alert removed" });
  await renderAlertsList(ctx, userId);
});

async function renderAlertsList(ctx: Ctx, userId: number): Promise<void> {
  const alerts = getAlerts(userId);
  const profile = getUserProfile(userId);

  if (alerts.length === 0) {
    await ctx.editMessageText(
      "No alerts set yet — create one to get notified when prices move.",
      {
        reply_markup: inlineKeyboard([
          [inlineButton("📈 Threshold alert", "alert:threshold:start")],
          [inlineButton("📊 Percent alert", "alert:percent:start")],
          [inlineButton("⬅️ Back to menu", "menu:main")],
        ]),
      },
    );
    return;
  }

  const lines = alerts.map((a) => {
    const icon = a.enabled ? "🟢" : "🔴";
    const typeStr = a.type === "threshold"
      ? `${a.direction} $${a.value}`
      : `${a.direction} ${a.value}%`;
    return `${icon} ${a.ticker} — ${typeStr}`;
  });

  const keyboard: ReturnType<typeof inlineButton>[][] = [];
  for (const a of alerts) {
    keyboard.push([
      inlineButton(`${a.enabled ? "🟢" : "🔴"} ${a.ticker} ${a.type === "threshold" ? a.direction + " $" + a.value : a.direction + " " + a.value + "%"}`, `alert:view:${a.id}`),
      inlineButton("✕", `alert:rm:${a.id}`),
    ]);
  }
  keyboard.push([]);
  keyboard.push([inlineButton("📈 Threshold alert", "alert:threshold:start")]);
  keyboard.push([inlineButton("📊 Percent alert", "alert:percent:start")]);
  keyboard.push([inlineButton("⬅️ Back to menu", "menu:main")]);

  const cooldownStr = profile?.cooldownMinutes ?? 240;
  await ctx.editMessageText(
    `Your alerts (${alerts.length}) — cooldown: ${cooldownStr}min between fires.\n\n${lines.join("\n")}`,
    { reply_markup: inlineKeyboard(keyboard) },
  );
}

export default composer;
