/**
 * Persistent storage for durable domain data (user profiles, watchlist items,
 * alert rules). In-memory for dev/test; swap to Redis for production.
 * NEVER use ephemeral session storage for this — durable data must survive restarts.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UserProfile {
  userId: number;
  displayName: string;
  timezone: string;
  quietHoursStart: number;
  quietHoursEnd: number;
  morningSummaryEnabled: boolean;
  morningSummaryTime: string;
  cooldownMinutes: number;
  onboarded: boolean;
}

export interface WatchlistItem {
  id: string;
  userId: number;
  ticker: string;
  coinId: string;
  label: string;
  enabled: boolean;
}

export interface AlertRule {
  id: string;
  userId: number;
  ticker: string;
  coinId: string;
  type: "threshold" | "percent";
  direction: "above" | "below" | "up" | "down";
  value: number;
  lastFiredAt: number;
  cooldownMinutes: number;
  enabled: boolean;
}

// ---------------------------------------------------------------------------
// In-memory backing store (dev / test)
// ---------------------------------------------------------------------------

const profiles = new Map<number, UserProfile>();
const watchlists = new Map<string, WatchlistItem>();
const alerts = new Map<string, AlertRule>();
const userWatchlistIndex = new Map<number, string[]>();
const userAlertIndex = new Map<number, string[]>();

let nextId = 1;
function genId(): string {
  return String(nextId++);
}

// ---------------------------------------------------------------------------
// User profile
// ---------------------------------------------------------------------------

export function getUserProfile(userId: number): UserProfile | undefined {
  return profiles.get(userId);
}

export function upsertUserProfile(profile: UserProfile): void {
  profiles.set(profile.userId, profile);
}

export function getAllUserIds(): number[] {
  return [...profiles.keys()];
}

// ---------------------------------------------------------------------------
// Watchlist
// ---------------------------------------------------------------------------

export function getWatchlist(userId: number): WatchlistItem[] {
  const ids = userWatchlistIndex.get(userId) ?? [];
  return ids.map((id) => watchlists.get(id)!).filter(Boolean);
}

export function getWatchlistItem(id: string): WatchlistItem | undefined {
  return watchlists.get(id);
}

export function addWatchlistItem(item: Omit<WatchlistItem, "id">): WatchlistItem {
  const id = genId();
  const full: WatchlistItem = { ...item, id };
  watchlists.set(id, full);
  const idx = userWatchlistIndex.get(item.userId) ?? [];
  idx.push(id);
  userWatchlistIndex.set(item.userId, idx);
  return full;
}

export function removeWatchlistItem(id: string): boolean {
  const item = watchlists.get(id);
  if (!item) return false;
  watchlists.delete(id);
  const idx = userWatchlistIndex.get(item.userId) ?? [];
  userWatchlistIndex.set(
    item.userId,
    idx.filter((i) => i !== id),
  );
  // Remove associated alerts
  const alertIds = userAlertIndex.get(item.userId) ?? [];
  for (const aid of alertIds) {
    const alert = alerts.get(aid);
    if (alert && alert.ticker === item.ticker) {
      alerts.delete(aid);
    }
  }
  return true;
}

export function findWatchlistItemByTicker(
  userId: number,
  ticker: string,
): WatchlistItem | undefined {
  const items = getWatchlist(userId);
  return items.find((i) => i.ticker.toUpperCase() === ticker.toUpperCase());
}

// ---------------------------------------------------------------------------
// Alert rules
// ---------------------------------------------------------------------------

export function getAlerts(userId: number): AlertRule[] {
  const ids = userAlertIndex.get(userId) ?? [];
  return ids.map((id) => alerts.get(id)!).filter(Boolean);
}

export function getAlert(id: string): AlertRule | undefined {
  return alerts.get(id);
}

export function addAlert(rule: Omit<AlertRule, "id">): AlertRule {
  const id = genId();
  const full: AlertRule = { ...rule, id };
  alerts.set(id, full);
  const idx = userAlertIndex.get(rule.userId) ?? [];
  idx.push(id);
  userAlertIndex.set(rule.userId, idx);
  return full;
}

export function updateAlert(id: string, patch: Partial<AlertRule>): boolean {
  const existing = alerts.get(id);
  if (!existing) return false;
  alerts.set(id, { ...existing, ...patch });
  return true;
}

export function removeAlert(id: string): boolean {
  const alert = alerts.get(id);
  if (!alert) return false;
  alerts.delete(id);
  const idx = userAlertIndex.get(alert.userId) ?? [];
  userAlertIndex.set(
    alert.userId,
    idx.filter((i) => i !== id),
  );
  return true;
}

// ---------------------------------------------------------------------------
// Index helpers
// ---------------------------------------------------------------------------

export function getUserAlertCount(): number {
  return alerts.size;
}

export function getUserCount(): number {
  return profiles.size;
}

export function getAllAlerts(): AlertRule[] {
  return [...alerts.values()];
}
