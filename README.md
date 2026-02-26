# Zenith 365 Savings Tracker

Premium, glassmorphic savings tracker built with vanilla HTML, CSS, and JavaScript.

This app runs fully client-side and stores account + savings data in `localStorage` per browser.

## Overview

Zenith 365 supports:

- Local multi-user authentication (SHA-256 password hashing)
- Multiple savings plans per user
- Daily incremental plans (full, half, quarter), weekly plan, and simple fixed-daily plan
- Calendar-based completion tracking with top-up of past entries
- KPI cards, progress ring, and 5 analytics charts
- Premium PDF export report
- JSON import pipeline with schema migration support
- Offline app-shell caching via service worker

Currency is Ghanaian cedi (`GHS`).

## Current Plan Modes

All amounts are in `GHS`.

- `full`: 365 days, daily amount = `index * 1.0`
- `half`: 365 days, daily amount = `index * 0.5`
- `quarter`: 365 days, daily amount = `index * 0.25`
- `simple`: 365 days, fixed daily amount (user-provided)
- `weekly`: 52 weeks, weekly amount = `index * 1.0`

Target formulas:

- Arithmetic plans (`full`, `half`, `quarter`, `weekly`):  
  `target = sum(index * multiplier)` across plan length
- Simple plan:  
  `target = totalDays * fixedDailyAmount`

Reference totals:

- Full daily (365): `GHS 66,795.00`
- Half daily (365): `GHS 33,397.50`
- Quarter daily (365): `GHS 16,698.75`
- Weekly (52): `GHS 1,378.00`

## Tech Stack

- HTML5 + CSS3 + vanilla JS (no framework)
- Chart.js (CDN) for analytics
- jsPDF (CDN) for premium PDF export
- Service Worker + Cache API for offline shell caching

## Project Structure

```text
README.md
index.html
dashboard.html
sw.js
css/
  styles.css
js/
  animations.js
  app.js
  auth.js
  calendar.js
  charts.js
  storage.js
  sw-register.js
docs/
  screenshots/
    login.png
    dashboard-hero.png
    calendar-and-charts.png
    plan-modal.png
prd.md
```

## Quick Start

Run on a local web server (recommended for service worker behavior).

### Option 1: Python

```bash
python -m http.server 8080
```

Then open:

`http://localhost:8080/index.html`

### Option 2: Node serve

```bash
npx serve .
```

## Screenshot Gallery

Add screenshots to `docs/screenshots/` using the file names below so they render automatically.

### Login Page

![Zenith 365 Login](docs/screenshots/login.png)

### Dashboard Hero

![Zenith 365 Dashboard Hero](docs/screenshots/dashboard-hero.png)

### Calendar and Analytics

![Zenith 365 Calendar and Analytics](docs/screenshots/calendar-and-charts.png)

### Plan Creation Modal

![Zenith 365 Plan Creation Modal](docs/screenshots/plan-modal.png)

## Quick Demo Walkthrough

Use this flow to demo the full MVP in 3-5 minutes.

1. Open `index.html`, register a new account, and sign in.
2. Create a `full` or `half` plan with a past start date to verify backfill/top-up behavior.
3. Check that the dashboard hero shows:
   - current user badge
   - current savings
   - projected-by-now savings and variance
4. Click `Pay Today` once, then click a past calendar day to mark it complete.
5. Switch calendar filters (`All`, `Overdue`, `Upcoming`, `Done`) and navigate months.
6. Create a second plan (`quarter` or `simple`) and switch via the plan selector.
7. Confirm all 5 charts refresh after plan switch and payment actions.
8. Use `Export PDF` and verify the report includes summary + per-plan metrics.
9. (Optional) Generate JSON from console with:

```js
JSON.stringify(window.ZenithStorage.exportState(), null, 2)
```

10. Import the JSON back through `Import` and confirm data/session behavior.

## App Flow

### 1) Authentication (`index.html`)

- First run with no users defaults to registration
- Existing users can sign in
- Password is hashed with SHA-256 before storage
- Successful auth creates a 24-hour session token
- If session is valid, user is redirected to dashboard

### 2) Dashboard (`dashboard.html`)

- Loads current user, user-specific plans, and active plan
- Shows:
  - Current user badge + account menu
  - Active plan summary
  - Current savings
  - Projected by now savings (and ahead/behind variance)
  - Target and progress
  - KPIs (streak, completed, overdue, upcoming)
  - Calendar
  - 5 analytics charts

### 3) Plan Tracking

- `Pay Today` marks only the current due index (no auto-backfill)
- You can click past entries in the calendar to top up or unmark
- If plan started in the past, calendar opens on the plan start month
- Milestone confetti is triggered at 30, 60, 100, 200, and final completion

## Storage and Persistence

All persistence is `localStorage`-based and scoped per browser profile.

### Schema Version

- Current schema version: `2`
- Key: `zenith365_schema_version`

### Active Keys (v2)

- `zenith365_users_v2`
- `zenith365_session_v1`
- `zenith365_plans_by_user_v2`
- `zenith365_active_plan_by_user_v2`

### Legacy Keys (migrated)

- `zenith365_user_v1`
- `zenith365_plans_v1`
- `zenith365_active_plan_id_v1`

### Data Contracts

User:

```json
{
  "username": "string",
  "passwordHash": "sha256 hex",
  "createdAt": "ISO string"
}
```

Session:

```json
{
  "token": "string",
  "username": "string",
  "issuedAt": "ISO string",
  "expiresAt": "ISO string"
}
```

Plan:

```json
{
  "id": "string",
  "name": "string",
  "startDate": "YYYY-MM-DD",
  "mode": "full | half | quarter | simple | weekly",
  "totalDays": 365,
  "incrementMultiplier": 1,
  "fixedDailyAmount": null,
  "targetAmount": 66795,
  "completedDays": { "1": true, "2": true },
  "colorTheme": "#7c5cff",
  "milestonesHit": {},
  "createdAt": "ISO string"
}
```

`plans_by_user` shape:

```json
{
  "usernameA": [/* plans */],
  "usernameB": [/* plans */]
}
```

This ensures savings data persists across both plans and users.

## Analytics (5 Charts)

1. Cumulative Saved vs Target
2. Weekly Deposits (last 10 weeks)
3. Streak Timeline
4. Rolling 7-Day Completion %
5. Projection (actual vs ideal vs projected path)

Charts update on:

- Active plan switch
- `Pay Today`
- Calendar toggles
- Calendar filter/month updates that re-render dashboard state

## Calendar Behavior

- Daily plans render a month grid with Monday-first weekday headers
- Weekly mode renders week cards for the selected month
- Entry states:
  - done
  - today
  - overdue
  - upcoming
- Filters:
  - all
  - overdue
  - upcoming
  - done

## Export / Import

### Export (UI button)

- Exports a premium formatted PDF report per current signed-in user
- Includes summary totals + per-plan metrics
- File name pattern:
  - `zenith365-report-{username}-{yyyy-mm-dd}.pdf`

### Import (UI button)

- Accepts JSON only (`application/json`)
- Imports full app state and then clears current session (requires re-login)
- Supports:
  - v2 multi-user bundle shape
  - legacy single-user bundle shape

### JSON Export for Backup (Dev/Power User)

UI export is PDF. If you need a JSON backup compatible with import:

```js
JSON.stringify(window.ZenithStorage.exportState(), null, 2)
```

Run in browser console and save output to a `.json` file.

## Offline Support

`sw.js` caches:

- App shell pages/assets
- Chart.js CDN script
- jsPDF CDN script

Cache name:

- `zenith365-cache-v6`

Notes:

- First visit must be online for CDN assets to cache
- After cache warmup, app shell works offline
- Third-party cache writes are best-effort

## Accessibility and UX

- ARIA labels across auth/dashboard controls
- Keyboard support for auth flow, menu interactions, and calendar actions
- Focus-visible rings on interactive controls
- `prefers-reduced-motion` fallback to disable heavy motion
- Responsive layout:
  - desktop two-column dashboard
  - stacked mobile layout + floating `Pay Today` FAB

## Global Module APIs

`window.ZenithStorage`:

- `loadState(username?)`
- `savePlans(usernameOrPlans, maybePlans?)`
- `setActivePlan(usernameOrPlanId, maybePlanId?)`
- `migrateState()`
- `exportState()`
- `importState(bundle)`
- `setSession(session)`
- `clearSession()`
- `getUsers()`
- `getUser(username)`
- `upsertUser(user)`

`window.ZenithAuth`:

- `hashPassword(password)`
- `register(username, password)`
- `login(username, password)`
- `logout()`
- `getSession()`
- `requireSession()`

`window.ZenithApp`:

- `initDashboard()`
- `createPlan(payload)`
- `markTodayPaid()`
- `computePlanMetrics(plan)`

`window.ZenithCalendar`:

- `initCalendar(config)`
- `setPlan(plan)`
- `renderCalendar()`
- `setMonth(deltaOrDate)`
- `setFilter(filter)`

`window.ZenithCharts`:

- `initCharts()`
- `updateCharts(analytics)`
- `destroyCharts()`

`window.ZenithAnimations`:

- `showToast(message, tone, timeoutMs?)`
- `runConfetti(options?)`
- `animateCount(element, targetValue, options?)`
- `attachRipple(target)`
- `vibratePulse()`

## Browser Support

Targeted for modern Chromium/Safari-class browsers with:

- `localStorage`
- `crypto.subtle`
- `Service Worker`
- `Canvas`

## Known Limitations

- Data is local to one browser profile/device unless manually migrated via JSON import/export workflow.
- UI export is PDF only; JSON export requires console call.
- First-ever offline load cannot fetch CDN scripts.
- No backend sync, password recovery, or cross-device identity.

## Manual Smoke Test Checklist

1. Register a new user and confirm no plaintext password in `localStorage`.
2. Log out/in and verify session TTL behavior.
3. Create each plan mode and verify target previews.
4. Create a plan with a past start date and verify month opens at start date.
5. Mark today via `Pay Today`, then toggle a past day in calendar.
6. Confirm projected-by-now and variance update.
7. Switch plans and confirm charts/KPIs refresh.
8. Create second user and confirm isolation of plans/data.
9. Export PDF and verify formatting/content.
10. Import a valid JSON bundle and verify re-login + restored state.

## License

No license file is currently included in this repository.
