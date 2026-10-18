# Handover for a new Claude session

Read this first, then `docs/SETUP.md` (release notes, newest first) and `README.md`.

## What this is
A no-build installable web app (PWA, vanilla ES modules) that mirrors the owner's Excel workbook `the owner's Excel workbook`. The owner (the owner) is the only editor. Family open it read-only. Data is one JSON document kept in his Google Drive through an Apps Script backend (`backend/`) with an owner key and a family key. The app is hosted by him on GitHub Pages and he pushes from VS Code.

## Rules he has set (do not break)
- **Never upload, commit or zip `portfolio-data.json`.**
- **Avoid database changes.** The app is live. No migrations, renames or removals of stored fields. Only add optional fields that old records work without.
- One green (primary) button per screen; the rest plain. No "All columns" button. Phone tables are cards.
- Risk limits are always measured against investments only (bank balances left out).
- Keep plain, short wording. Bump `js/version.js` and the cache name in `sw.js` on every release, add notes to `docs/SETUP.md`, and zip without the data file.

## Layout
- `index.html`, `css/app.css`, `sw.js` (offline cache; list every new file in its FILES list), `manifest.webmanifest`.
- `js/main.js`: routes and shell. `ROUTES` object (sidebar), `TABS` (phone bottom bar: Home, Assets, Expenses, Outlook, Report). Plan is desktop-only in the menu.
- `js/ui.js`: helpers (`h`, `table` which becomes cards on phones, `formDialog`, `dialog`, `section`, `stat`, `segTabs`/`subTab` for sub tabs at `#/{route}/{sub}`, `btn`).
- `js/store.js`: storage (localStorage `pt.data/cfg/quotes/meta/base`), `mutate(fn)`, restore points, 3-way merge. `js/remote.js`: Drive sync.
- `js/calc.js`: all calculations (`computeAll`, month ledger, cash flow, upcoming payments). `categories.js`: category kinds (expense, income, investment, transfer).
- Equity: `trades.js`, `buys.js`, `prices.js` (Yahoo and mfapi), `importers.js` (Groww files).
- `js/projector.js`, `risk.js`, `actuals.js`, `yearplan.js`, `epf.js`, `goldlive.js`, `archive.js`.

## Pages (route: file: what it does)
- `#/home` `views/home.js`: dashboard cards, net worth, allocation and risk strip, this month (budget, received, spent), money to receive, needs a look, coming up. Spent counts fixed groups; other payments are reviewed in a popup (`settings.homeSpendExtra`).
- `#/cash` `cash.js`: accounts, transactions (ledger), transfers.
- `#/fixed` `fixed.js`: tabs Bonds, FDs, Lendings (private lending and money to receive), Loans (`loans.js`, liabilities), Closed.
- `#/equity` `equity*.js`: today, shares and ETFs, funds, insights, sold, dividends, imports. Refresh prices sits on the right with "updated X ago".
- `#/savings` `savings.js` (code in `cash.js`): tabs Chits, Provident fund, Insurance, RDs, Closed.
- `#/gold` `gold.js`: gold rate, chits and schemes, purchases, jewellery, other holdings.
- `#/flow` `flow.js`: income and expenses report. `categories.js`: category and rule editing.
- `#/plan` `plan.js`, `plan-year.js`: the Excel plan and targets.
- `#/projector` `projector.js` with `proj-year`, `proj-ahead`, `proj-market`, `proj-actual`: yearly target, monthly check-ins, years ahead, market outlook.
- `#/risk` `risk.js` with `proj-risk` (limits per kind, rule and holding) and `proj-whatif` (try an investment against the limits).
- `#/report` `report.js`: Family report, printed to PDF. `#/networth` `networth.js`: net worth line from month-end snapshots plus a projection to December. `#/insights/{tax|calendar|review|anomalies|allocation}` `views/insights.js` + pure logic in `js/insights.js` (optional `data.allocGoal`). `#/incexp` `incexp.js`: Income vs expense report (category -> description drilldown, uses `calc.flowReport`).
- `#/settings` `settings.js`, `backups.js`, `storage.js`, `archive.js`.

## Data (top-level keys of the JSON)
`settings, accounts, ledger, categories, savings, bonds, fds, lending, receivables, stocks, mutualFunds, sipPlans, gold, liabilities, targets, proj, incomeSources, manualMonthlyIncome, reportNotes` plus optional `projector`, `risk`, `trades`, `fundTxns`, `corporateActions`, `history`. Arrays of objects carry an `id`. Optional extras so far: `savings[].organiser`, `fds[].issuer`, `lending[].borrower`, `settings.homeSpendExtra`.

## Tests
`node tests/<name>.test.mjs <path-to-data-json>` for calc, categories, archive, merge, safety, buys, projector, risk. `epf` takes no argument. They need a copy of the real data file (not in the zip). Browser checks used Playwright at 390px and 1360px width.

## Not testable by Claude
Live Apps Script sync, Yahoo and mfapi prices, a real Android device. Ask the owner to try those after a release.
