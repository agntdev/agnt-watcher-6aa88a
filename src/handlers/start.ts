import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import {
  mainMenuKeyboard,
  inlineButton,
  inlineKeyboard,
} from "../toolkit/index.js";
import { getUserProfile, upsertUserProfile } from "../storage.js";

const composer = new Composer<Ctx>();

const WELCOME = "👋 Welcome to CryptoWatch!\n\nTrack prices, set alerts, and never miss a move.";

const TIMEZONE_OPTIONS = [
  { label: "UTC", data: "tz:UTC" },
  { label: "EST (UTC-5)", data: "tz:America/New_York" },
  { label: "CST (UTC-6)", data: "tz:America/Chicago" },
  { label: "MST (UTC-7)", data: "tz:America/Denver" },
  { label: "PST (UTC-8)", data: "tz:America/Los_Angeles" },
  { label: "GMT (UTC+0)", data: "tz:Europe/London" },
  { label: "CET (UTC+1)", data: "tz:Europe/Berlin" },
  { label: "IST (UTC+5:30)", data: "tz:Asia/Kolkata" },
  { label: "JST (UTC+9)", data: "tz:Asia/Tokyo" },
  { label: "AEST (UTC+10)", data: "tz:Australia/Sydney" },
];

composer.command("start", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  const profile = getUserProfile(userId);
  if (profile?.onboarded) {
    await ctx.reply(WELCOME, { reply_markup: mainMenuKeyboard() });
    return;
  }

  // Start onboarding
  ctx.session.step = "onboarding_tz";
  const tzRows = TIMEZONE_OPTIONS.map((tz) => [inlineButton(tz.label, tz.data)]);
  await ctx.reply(
    "👋 Welcome to CryptoWatch!\n\nFirst, pick your timezone so alerts fire at the right time:",
    { reply_markup: inlineKeyboard(tzRows) },
  );
});

// Timezone selection
composer.callbackQuery(/^tz:(.+)$/, async (ctx) => {
  const tz = ctx.match![1];
  const userId = ctx.from?.id;
  if (!userId) return;
  await ctx.answerCallbackQuery();

  ctx.session.timezone = tz;
  ctx.session.step = "onboarding_quiet";

  const quietStart = 22;
  const quietEnd = 7;
  upsertUserProfile({
    userId,
    displayName: ctx.from.first_name ?? "User",
    timezone: tz,
    quietHoursStart: quietStart,
    quietHoursEnd: quietEnd,
    morningSummaryEnabled: false,
    morningSummaryTime: "08:00",
    cooldownMinutes: 240,
    onboarded: true,
  });

  await ctx.editMessageText(
    `✅ Timezone set to ${tz}.\n\nDefault quiet hours: ${quietStart}:00–${quietEnd}:00 (no alerts during sleep). You can change this later in Settings.`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("Got it", "menu:main")],
      ]),
    },
  );
});

// Back to main menu (from onboarding or any sub-view)
composer.callbackQuery("menu:main", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = undefined;
  await ctx.editMessageText(WELCOME, { reply_markup: mainMenuKeyboard() });
});

export default composer;
