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

### Troubleshooting: "my changes aren't saved"

The app checks whether `localStorage` actually works the moment it loads. If
it doesn't, a red banner appears at the top of the screen and every save
attempt shows a "Not saved" warning toast instead of a success message — the
app stays fully usable in that state, it just won't remember anything after
you reload. This happens when the page is opened somewhere that blocks
per-site storage rather than because of a bug in the app itself. The usual
causes, roughly in order of likelihood:

- **An embedded/sandboxed preview** — some editors' built-in "preview" panes
  (VS Code's Simple Browser or Live Preview extension, some IDE webviews) run
  pages in a restricted context that blocks `localStorage`. Open the file in
  a real browser tab instead (Chrome, Edge, Firefox) and it will work.
- **Private/incognito browsing** — storage still works inside the session but
  is wiped the moment you close the private window, which looks identical to
  "nothing saved" the next time you open it.
- **A different origin each time** — if you serve the app with a local
  server, `localStorage` is tied to that exact `origin:port`. Restarting a
  server that picks a random port each run (some "Live Server" style tools
  do this) means every launch is a fresh, empty origin. Pick one fixed port
  (e.g. always `python3 -m http.server 8080`) or just open `index.html`
  directly instead.
- **Browser setting to clear site data on close** — Chrome's "Clear cookies
  and other site data when you close all windows" (or the equivalent in your
  browser) wipes it every time you fully quit the browser, by design.

If the red banner never appears and you're still not seeing data persist,
that's worth reporting as an actual bug rather than an environment quirk.

### Fixed in this update

A full test pass (Playwright, automated) found and fixed several real bugs,
the most serious of which meant **you could never actually pick anything
other than the first option** in a few chip lists:

- **Category, "Paid by", and category-icon chips didn't respond to clicks.**
  Those three chip rows were wrapped in a `<label>` element, which makes the
  browser automatically re-click the *first* button inside the label every
  time you click any other button in it — so choosing "Rent" instead of
  "Groceries" (or any payer other than the first, or any icon other than the
  first) silently snapped back to the default the instant you clicked it.
  Expenses always saved under the first category/payer no matter what you
  picked. Fixed by using a plain `<div>` for those rows instead (the single
  Amount/Note/Name/Budget fields correctly keep `<label>`, since those only
  wrap one control).
- **Monthly/quarterly recurring expenses drifted off their date.** A bill
  started on the 29th/30th/31st (e.g. rent on Jan 31) would land on the 3rd
  of the following months instead, because adding "1 month" to Jan 31 rolls
  over into March in JavaScript. Recurring dates are now anchored to the
  original start date and clamped to the last real day of a short month
  (Jan 31 → Feb 28 → Mar 31, not Jan 31 → Mar 3 → Apr 3).
- **Settle screen went blank with zero household members** instead of
  showing "All settled up".
- **Closing the Household editor without hitting "Save household"** used to
  keep any member you'd added or removed anyway (it just hadn't reached
  storage yet) — Cancel/Close now genuinely discards unsaved member changes.
- **Deleting a category left its recurring rule running**, so it kept
  generating new "Uncategorized" expenses forever; deleting a category now
  stops any recurring rule tied to it too.
- **CSV export could shift columns** if a category or member name contained
  a comma (only the Note column was escaped before). All columns are now
  properly CSV-quoted.
- A cosmetic fix: a corrupted (not blocked) save file no longer trips the
  "storage is blocked" banner — that message is now reserved for storage
  that's actually unavailable.

### Troubleshooting: whole screens look empty or nothing responds

This almost always means `index.html`, `css/styles.css`, `js/data.js`, and
`js/app.js` have gotten out of sync — for example only some of the four files
got copied/overwritten during an update, so the HTML is one version and the
JavaScript is another. The app is written to degrade gracefully if that
happens (a missing element is checked for before use, and startup is wrapped
so one error can't quietly blank the whole page), but the safest fix is
still to replace all four files together as a matched set rather than one at
a time, then do a hard refresh (Ctrl/Cmd+Shift+R) so the browser isn't
serving a cached copy of just one of them.

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
