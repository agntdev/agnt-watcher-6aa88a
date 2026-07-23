import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem, inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { getUserProfile, upsertUserProfile } from "../storage.js";

registerMainMenuItem({ label: "⚙️ Settings", data: "settings:main", order: 40 });

const composer = new Composer<Ctx>();

const TIMEZONE_OPTIONS = [
  { label: "UTC", data: "stz:tz:UTC" },
  { label: "EST", data: "stz:tz:America/New_York" },
  { label: "CST", data: "stz:tz:America/Chicago" },
  { label: "MST", data: "stz:tz:America/Denver" },
  { label: "PST", data: "stz:tz:America/Los_Angeles" },
  { label: "GMT", data: "stz:tz:Europe/London" },
  { label: "CET", data: "stz:tz:Europe/Berlin" },
  { label: "IST", data: "stz:tz:Asia/Kolkata" },
  { label: "JST", data: "stz:tz:Asia/Tokyo" },
  { label: "AEST", data: "stz:tz:Australia/Sydney" },
];

const QUIET_HOUR_OPTIONS = [
  { label: "22:00–07:00", data: "stz:quiet:22:7" },
  { label: "23:00–07:00", data: "stz:quiet:23:7" },
  { label: "00:00–07:00", data: "stz:quiet:0:7" },
  { label: "22:00–08:00", data: "stz:quiet:22:8" },
  { label: "No quiet hours", data: "stz:quiet:0:0" },
];

const COOLDOWN_OPTIONS = [
  { label: "1 hour", data: "stz:cooldown:60" },
  { label: "2 hours", data: "stz:cooldown:120" },
  { label: "4 hours", data: "stz:cooldown:240" },
  { label: "6 hours", data: "stz:cooldown:360" },
  { label: "12 hours", data: "stz:cooldown:720" },
];

// Main settings view
composer.callbackQuery("settings:main", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  await ctx.answerCallbackQuery();

  const profile = getUserProfile(userId);
  if (!profile) {
    await ctx.editMessageText(
      "Run /start to set up your profile first.",
      { reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]) },
    );
    return;
  }

  const quietStr = profile.quietHoursStart === 0 && profile.quietHoursEnd === 0
    ? "Off"
    : `${profile.quietHoursStart}:00–${profile.quietHoursEnd}:00`;

  await ctx.editMessageText(
    `⚙️ Settings\n\n` +
    `🌍 Timezone: ${profile.timezone}\n` +
    `😴 Quiet hours: ${quietStr}\n` +
    `⏱ Cooldown: ${profile.cooldownMinutes}min\n` +
    `🌅 Morning summary: ${profile.morningSummaryEnabled ? "On (" + profile.morningSummaryTime + ")" : "Off"}`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("🌍 Timezone", "settings:timezone")],
        [inlineButton("😴 Quiet hours", "settings:quiet")],
        [inlineButton("⏱ Alert cooldown", "settings:cooldown")],
        [inlineButton("🌅 Morning summary", "settings:morning")],
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    },
  );
});

// Timezone submenu
composer.callbackQuery("settings:timezone", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  await ctx.answerCallbackQuery();

  const keyboard = TIMEZONE_OPTIONS.map((tz) => [inlineButton(tz.label, tz.data)]);
  keyboard.push([inlineButton("⬅️ Back", "settings:main")]);

  await ctx.editMessageText("Pick your timezone:", { reply_markup: inlineKeyboard(keyboard) });
});

// Set timezone
composer.callbackQuery(/^stz:tz:(.+)$/, async (ctx) => {
  const tz = ctx.match![1];
  const userId = ctx.from?.id;
  if (!userId) return;
  await ctx.answerCallbackQuery();

  const profile = getUserProfile(userId);
  if (!profile) return;

  upsertUserProfile({ ...profile, timezone: tz });
  await ctx.answerCallbackQuery({ text: `Timezone set to ${tz}` });
  await renderSettings(ctx, userId);
});

// Quiet hours submenu
composer.callbackQuery("settings:quiet", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  await ctx.answerCallbackQuery();

  const keyboard = QUIET_HOUR_OPTIONS.map((q) => [inlineButton(q.label, q.data)]);
  keyboard.push([inlineButton("⬅️ Back", "settings:main")]);

  await ctx.editMessageText("When should alerts be silenced?", {
    reply_markup: inlineKeyboard(keyboard),
  });
});

// Set quiet hours
composer.callbackQuery(/^stz:quiet:(\d+):(\d+)$/, async (ctx) => {
  const start = parseInt(ctx.match![1]);
  const end = parseInt(ctx.match![2]);
  const userId = ctx.from?.id;
  if (!userId) return;
  await ctx.answerCallbackQuery();

  const profile = getUserProfile(userId);
  if (!profile) return;

  upsertUserProfile({ ...profile, quietHoursStart: start, quietHoursEnd: end });
  const label = start === 0 && end === 0 ? "Off" : `${start}:00–${end}:00`;
  await ctx.answerCallbackQuery({ text: `Quiet hours: ${label}` });
  await renderSettings(ctx, userId);
});

// Cooldown submenu
composer.callbackQuery("settings:cooldown", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  await ctx.answerCallbackQuery();

  const keyboard = COOLDOWN_OPTIONS.map((c) => [inlineButton(c.label, c.data)]);
  keyboard.push([inlineButton("⬅️ Back", "settings:main")]);

  await ctx.editMessageText("Minimum time between repeated alerts for the same coin:", {
    reply_markup: inlineKeyboard(keyboard),
  });
});

// Set cooldown
composer.callbackQuery(/^stz:cooldown:(\d+)$/, async (ctx) => {
  const minutes = parseInt(ctx.match![1]);
  const userId = ctx.from?.id;
  if (!userId) return;
  await ctx.answerCallbackQuery();

  const profile = getUserProfile(userId);
  if (!profile) return;

  upsertUserProfile({ ...profile, cooldownMinutes: minutes });
  await ctx.answerCallbackQuery({ text: `Cooldown: ${minutes}min` });
  await renderSettings(ctx, userId);
});

// Morning summary submenu
composer.callbackQuery("settings:morning", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  await ctx.answerCallbackQuery();

  const profile = getUserProfile(userId);
  if (!profile) {
    await ctx.editMessageText(
      "Run /start to set up your profile first.",
      { reply_markup: inlineKeyboard([[inlineButton("⬅️ Back", "settings:main")]]) },
    );
    return;
  }

  const keyboard = inlineKeyboard([
    [inlineButton(
      profile.morningSummaryEnabled ? "🌅 Currently: ON" : "🌅 Currently: OFF",
      `stz:morning:toggle`,
    )],
    [inlineButton("⬅️ Back", "settings:main")],
  ]);

  const timeStr = profile.morningSummaryTime ?? "08:00";
  await ctx.editMessageText(
    `Morning summary sends a daily overview of your watchlist.\n\nStatus: ${profile.morningSummaryEnabled ? "Enabled" : "Disabled"}\nTime: ${timeStr} (${profile.timezone})`,
    { reply_markup: keyboard },
  );
});

// Toggle morning summary
composer.callbackQuery("stz:morning:toggle", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  await ctx.answerCallbackQuery();

  const profile = getUserProfile(userId);
  if (!profile) return;

  upsertUserProfile({ ...profile, morningSummaryEnabled: !profile.morningSummaryEnabled });
  await ctx.answerCallbackQuery({ text: profile.morningSummaryEnabled ? "Morning summary disabled" : "Morning summary enabled" });
  await renderSettings(ctx, userId);
});

async function renderSettings(ctx: Ctx, userId: number): Promise<void> {
  const profile = getUserProfile(userId);
  if (!profile) return;

  const quietStr = profile.quietHoursStart === 0 && profile.quietHoursEnd === 0
    ? "Off"
    : `${profile.quietHoursStart}:00–${profile.quietHoursEnd}:00`;

  await ctx.editMessageText(
    `⚙️ Settings\n\n` +
    `🌍 Timezone: ${profile.timezone}\n` +
    `😴 Quiet hours: ${quietStr}\n` +
    `⏱ Cooldown: ${profile.cooldownMinutes}min\n` +
    `🌅 Morning summary: ${profile.morningSummaryEnabled ? "On (" + profile.morningSummaryTime + ")" : "Off"}`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("🌍 Timezone", "settings:timezone")],
        [inlineButton("😴 Quiet hours", "settings:quiet")],
        [inlineButton("⏱ Alert cooldown", "settings:cooldown")],
        [inlineButton("🌅 Morning summary", "settings:morning")],
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    },
  );
}

export default composer;
