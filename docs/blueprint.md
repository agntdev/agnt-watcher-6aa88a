# CryptoWatch Bot — Bot specification

**Archetype:** custom

**Voice:** professional and concise — write every user-facing message, button label, error, and empty state in this voice.

A personal Telegram bot that lets users maintain a private crypto watchlist, set price-threshold and 1-hour percentage-move alerts, request on-demand prices, and receive an optional morning summary. Features include quiet hours, alert cooldowns, typo handling, and an owner dashboard for analytics.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- Individual crypto watchers
- Bot owner for analytics

## Success criteria

- Users can create and manage watchlists with alerts
- Users receive accurate price alerts and summaries
- Owner dashboard shows key analytics metrics

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Open the main menu and onboarding flow
- **/price** (command, actor: user, command: /price) — Request current price for a specific ticker or entire watchlist
- **Add Coin** (button, actor: user, callback: watchlist:add) — Open the watchlist management interface with add options
- **Manage Alerts** (button, actor: user, callback: alerts:manage) — View and modify active alert rules
- **Settings** (button, actor: user, callback: settings:main) — Configure quiet hours, cooldowns, and morning summary preferences

## Flows

### Onboarding
_Trigger:_ /start

1. Welcome message
2. Request timezone selection
3. Confirm quiet hours defaults
4. Show main menu

_Data touched:_ User profile

### Watchlist Management
_Trigger:_ watchlist:add

1. Show common coin buttons
2. Handle text entry for custom tickers
3. Confirm additions with price lookup
4. Add to watchlist

_Data touched:_ Watchlist item

### Threshold Alert Creation
_Trigger:_ alert:threshold

1. Parse command or show guided flow
2. Confirm ticker and threshold value
3. Set alert rule with cooldown
4. Confirm success

_Data touched:_ Alert rule

### Percent Alert Creation
_Trigger:_ alert:percent

1. Parse command or show guided flow
2. Confirm ticker and percent direction
3. Set 1-hour lookback alert
4. Confirm success

_Data touched:_ Alert rule

### Price Request
_Trigger:_ /price

1. Parse ticker parameter
2. Fetch current price
3. Compare with historical data
4. Display price info

_Data touched:_ Price sample

### Morning Summary
_Trigger:_ scheduled

1. Check user preferences
2. Gather watchlist prices
3. Highlight 1h changes
4. Send summary message

_Data touched:_ Price sample, User profile

### Owner Dashboard
_Trigger:_ owner:dashboard

1. Authenticate owner
2. Fetch analytics data
3. Display key metrics
4. Offer export options

_Data touched:_ User profile, Alert rule

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

- **User profile** _(retention: persistent)_ — User-specific settings and preferences
  - fields: Telegram ID, Display name, Timezone, Quiet hours window, Morning summary time, Cooldown settings
- **Watchlist item** _(retention: persistent)_ — Monitored cryptocurrency ticker
  - fields: Ticker symbol, User-assigned label, Enabled flags
- **Alert rule** _(retention: persistent)_ — Price alert configuration
  - fields: Type (threshold/percent), Parameters, Last-fired timestamp, Cooldown
- **Price sample** _(retention: session)_ — Timestamped price data for comparison
  - fields: Timestamp, Price value

## Integrations

- **Telegram** (required) — Bot API messaging
- **Market Price API** (required) — Fetch current and historical crypto prices
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- View total users and active users
- See top 10 alert rules by frequency
- Configure global defaults for new users
- Access error logs from price feed retries

## Notifications

- Price threshold alerts
- 1-hour percentage move alerts
- Morning summary notifications
- Owner analytics updates
- Error notifications for price feed failures

## Permissions & privacy

- All user data is private and isolated
- Owner has read-only access to aggregate analytics
- Price data is stored only for 1-hour lookbacks
- No payment information is collected or stored

## Edge cases

- Failed price feed retries
- User enters invalid ticker symbols
- Alerts during quiet hours
- Multiple alerts firing simultaneously
- User modifies watchlist during active alerts

## Required tests

- Verify alert suppression during quiet hours
- Test cooldown periods between alerts
- Validate price threshold parsing from text
- Confirm morning summary formatting and timing
- Test error handling for price feed failures

## Assumptions

- Percent lookback is fixed to 1 hour
- Cooldown default is 4 hours per alert
- Quiet hours default is 22:00-07:00
- Morning summary is optional and default off
