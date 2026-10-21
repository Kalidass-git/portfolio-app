# Handover for a new Claude session

**Repo:** https://github.com/Kalidass-git/portfolio-app (public), branch `main`. Latest release 8.9.35 (cache `family-wealth-v61`). Clone with `git clone https://github.com/Kalidass-git/portfolio-app.git`, run `python3 -m http.server 8765` in the folder, open http://localhost:8765. No build step.

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

## Release process
Branch off `origin/main` (`release-X.Y.Z`), change files, bump `js/version.js` and the cache name in `sw.js`, add notes at the top of the release list in `docs/SETUP.md`, push, and open a PR to `main` with `gh api` (GraphQL is blocked). The owner merges it. Always base on `origin/main` so stacked PRs do not leave main behind.

## State after 8.9.35

- Bonds tab: Sort by (Rate, Next due, Paid so far, Invested, Holder, Via, Maturity) with Ascending/Descending, in `quickFilter` (`js/views/fixed.js`, `flt.bonds.sort/dir`).
- `monthCashflow`: Bonds received = credits matched to bonds due that month (`matchBondCredits`), not every "Income Bond" credit. Matching is closest-amount-first, and no credit can settle a bond before its due date minus 3 days. `bondDueAmount`: a monthly bond whose due date falls before its purchase date first pays the next month, with the stub days.
- `incomeWindow` (calc.js): a `manualMonthlyIncome` line is tied to the Money to receive loan with the same name and amount (else the only one with that amount, else lending by name, else any by name) for its start, end and received date. Several loans can share one name.
- Home "Money to receive this month" lists each pending bond as its own dated line.
- Ask the owner to check on real data: which bonds show as pending in October (the app should list only bonds due after today and any truly unpaid), and that no monthly lending line shows before its first month.

## Earlier: state after 8.9.34
- Bonds: per-bond optional `quarterMonth` (0, 1 or 2) sets the payout months of quarterly bonds; the payment covers the three months up to the payout month (`bondPaysIn`, `bondDueAmount`, `bondNextDue` in calc.js). Bank "Income Bond" credits are matched to bonds in `matchBondCredits` (exact amount, then name or issuer in the description, then due date, never before the due date). Manual monthly income such as private lending starts the month after its start date.
- Annual review: interest is read from "Income Bond" and "Income Lending" bank credits only (`isInterestCategory`). One-time category picker lists expense and investment categories only.
- Tax summary: closed bonds are flagged "Closed" (interest to the closing day); tap a bond for `holdingMonths`, a month-by-month check against the bank.
- Home "Investing this month" (`monthPlan` in `js/monthinvest.js`): investable income added, pending chit instalments from last month (optional `savings[].chitMonths`, gold chit `months` for duration), projected expenses for the rest of the month (rent and one-offs left out), current investable amount (bank minus wallets, optional `accounts[].wallet`) and its allocation by plan line weights.
- Tests that pass on synthetic data: allocgoal, watch, tax, monthinvest, bondmonth. projector, risk, safety, categories and features fail on synthetic data and did before.
- Verified with Playwright on synthetic data only, never on the real file. Ask the owner to check Annapurna, Navi, BelStar, Pandi and the new Home cards on his real data.

## Not testable by Claude
Live Apps Script sync, Yahoo and mfapi prices, a real Android device. Ask the owner to try those after a release.
