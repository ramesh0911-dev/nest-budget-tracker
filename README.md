# Nest — Household Budget Tracker

A mobile-first, offline-first household budget tracker, built to implement the
**"Nest Dashboard"** design (Claude Design project *"Nest household budget dashboard"*).
Pure HTML/CSS/JavaScript — no build step, no framework, no backend required.

## What it does

- **Home** — total spent this month, remaining budget, and a "Where it went"
  breakdown per category with progress bars that turn amber near the limit and
  red when a category goes over budget.
- **Activity** — every expense, grouped by day, newest first. Tap any row to edit
  or delete it.
- **Budgets** — set a monthly ₹ limit per category, add new categories, or delete
  ones you no longer use.
- **Settle** — splits the month's spending evenly across household members and
  shows the minimum number of transfers needed to settle up (à la Splitwise).
  "Mark settled" records the transfer so balances update immediately.
- **More** — edit the household name & members, manage recurring expenses,
  export all expenses to CSV, replay the welcome tour, or reset to sample data.
- **Add expense** — amount, category, note, who paid, date (with a formatted
  caption under the native date picker), and a "Repeating" option
  (Never / Daily / Weekly / Monthly / Quarterly). Recurring expenses
  automatically generate their next occurrence every time the app is opened,
  up to and including today.
- **Onboarding** — a short, skippable 3-step welcome flow for first-time setup
  (name your household, add members). Available again any time from
  More → "Replay welcome tour".

## Running it

No install, no build. Any static file server works:

```bash
cd Budget_Tracker_App
python3 -m http.server 8080
# then open http://localhost:8080
```

Or just double-click `index.html` to open it directly in a browser (all
features work from the local filesystem too).

## Data & persistence

All data lives in the browser's `localStorage` under the key `nest.budget.v1`
— nothing leaves the device, no account or network connection required. First
launch seeds the app with sample numbers matching the reference design
(household "The Sharma-Patel home", August 2026, 7 categories with the same
names, icons, and per-category spent/budget figures shown in the design's
"Where it went" list — ₹79,800 spent against a combined ₹90,000 budget) so
the UI is fully populated on first open. The design's own total tile showed
₹90,000 spent, which implies at least one more category below the fold that
wasn't visible in the captured screenshot (see "Design source" below) — add
it yourself from Budgets → "Add category" if you know what it should be. Use
**More → Reset all data** to wipe everything and start over from that same
sample state.

**Known limitation:** the bill-photo attachment is previewed in the Add
Expense sheet for the current editing session only; to keep `localStorage`
small and reliable it is not persisted between page loads. Swap in a real
backend (or IndexedDB) if you need durable photo storage.

## Project structure

```
Budget_Tracker_App/
├── index.html        All views/screens + the Add Expense, Category, Household,
│                      Recurring and Onboarding sheets (markup only)
├── css/
│   └── styles.css     All styling — colors, layout, sheets, nav
├── js/
│   ├── data.js         State model, localStorage persistence, seed data,
│   │                    formatting helpers (money, dates, ids)
│   └── app.js           Rendering, navigation, recurring-expense engine,
│                          settle-up math, all event wiring
└── README.md
```

## Design source

Implemented from the Claude Design project *"Nest household budget
dashboard"* (`Nest Dashboard.dc.html`, importing `support.js`). The design
tool's automated import (`claude_design` MCP) requires an interactive
`/design-login` that isn't available in this environment, so the UI was
reconstructed from the live rendered canvas (colors, copy, numbers, layout)
plus the project's visible edit history, which describes the Add Expense
date field and recurring-expense logic in detail. Percentage-based progress
bar coloring (green / amber ≥70% / red ≥100%) is this implementation's own
design decision, applied consistently across categories.
