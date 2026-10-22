# Handover for a new Claude session

> **Starting a new session? Do this first.** 1) Read this file, then the top three entries of `docs/SETUP.md`. 2) Clone, branch `release-X.Y.Z` off `origin/main` (check which PRs the owner has merged: `git log origin/main`). 3) Say what you have read, list "Waiting for the owner" below, and ask what to build. 4) The owner works in short numbered requests; do them all in one release, test, bump, open one PR. He checks on his real data, which you never see: say how each rule works so he can check it.

**Repo:** https://github.com/Kalidass-git/portfolio-app (public), branch `main`. Latest release 8.9.39 (cache `family-wealth-v65`). Clone with `git clone https://github.com/Kalidass-git/portfolio-app.git`, run `python3 -m http.server 8765` in the folder, open http://localhost:8765. No build step.

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
`settings, accounts, ledger, categories, savings, bonds, fds, lending, receivables, stocks, mutualFunds, sipPlans, gold, liabilities, targets, proj, incomeSources, manualMonthlyIncome, reportNotes` plus optional `projector`, `risk`, `trades`, `fundTxns`, `corporateActions`, `history`. Arrays of objects carry an `id`. Optional extras so far: `savings[].organiser`, `fds[].issuer`, `lending[].borrower`, `settings.homeSpendExtra`, `settings.goldChitMonths`, `accounts[].wallet`, `receivables[].closedOn`.

## Tests
`node tests/<name>.test.mjs <path-to-data-json>` for calc, categories, archive, merge, safety, buys, projector, risk. `epf` takes no argument. They need a copy of the real data file (not in the zip). Browser checks used Playwright at 390px and 1360px width.

## Release process
Branch off `origin/main` (`release-X.Y.Z`), change files, bump `js/version.js` and the cache name in `sw.js`, add notes at the top of the release list in `docs/SETUP.md`, push, and open a PR to `main` with `gh api` (GraphQL is blocked). The owner merges it. Always base on `origin/main` so stacked PRs do not leave main behind.

## State after 8.9.39 (newest)

- **Phone rows**: `table(cols, rows, { mobile })` also renders `mobileRows` (ui.js), shown only at max-width 700px (the table is hidden there; from 701px the phone block is hidden, so desktop and tablet are byte-for-byte the same). Config: `{ key, head, midHead, first(r)->{title,sub,tag,extra}, mid(r), views:[{label,main,sub,total?}] }`. The heading pill cycles the views for all rows, choice kept in localStorage `pt.mv.<key>`; sorting is separate. Add it to a table by writing a config next to its `table()` call (see `holdMobile` in equity.js, bonds and `depMobile` in fixed.js, `loanMobile` in loans.js, accounts/transactions/savings in cash.js, running chits in gold.js).
- Not converted (still the earlier `.tbl.fit` cards): reports, plan, projector, insights, imports, dividends, watch, categories, gold instalments, small dialog tables.
- No sparklines: there is no stored price history per holding. If one is added later, return a `spark()` from `mid`.
- Checked with Playwright on synthetic data at 320, 375, 430 (no horizontal overflow) and desktop 1360 and 768 (pixel-identical to 8.9.38). Owner to check on real data on his phone.

## Earlier: state after 8.9.38


- **Lending income lines** (`monthCashflow` in calc.js): `incomeWindow` finds the Money to receive lines behind a `manualMonthlyIncome` line (same person by `looseName`, then exact amount, then the sum of that person's lines, then the only line with that amount; lending/FDs as a fallback). `dueInMonth(rec, month)` is the rule: paid in arrears, 0 in the start month and before, pro-rated by days in the next month, full after, 0 after closing or for Yearly lines. `receivableStatus` has `dueAmount` and treats a monthly line as not started until the month after its start month.
- **Tax interest**: bonds count whole months (`bondSpan`/`cutoff` in `taxSummary`, `holdingMonths`): to the end of last month, plus this month once `bondDueDate <= asOf`. FDs and lending in the tax view are still by day.
- **Chit cards** (`chitCards`, `chitOrganiser` in monthinvest.js; `chitDueCards` in cash.js): this month due/paid and next month projected (average of the last three payments), grouped by organiser.
- **Investable balance** (`monthPlan` in monthinvest.js): bank + cash in hand (`isWallet`: wallet flag or a name with wallet/cash) + interest still expected (`mc.totalExpected - totalReceived`) − pending chits − projected expenses. Tile on Home (`tiles`, `place2`, `investableBody`) and card in Investing this month.
- **Bank transactions**: module state `fCat, fAmtOp, fAmtVal, fSort, fDir` in cash.js. **Shares sort**: `sortKey`/`sortDir` in equity.js. **Closed tab**: `closedGroupDialog` and Delete on closed Money to receive in fixed.js.
- `h()` in ui.js now sets CSS custom properties (`--g`) through `setProperty`.
- **Assumptions to confirm with the owner**: (a) the arrears/pro-rata rule for lending above (his words: "started after the start date; fewer days than a month is pro-rated and shown as pending"); (b) cash in hand counts in the investable balance; (c) FDs in the tax view are not changed to whole months; (d) "Net monthly inflow" is gone from Home (the function `tiles` still builds it if the plan cannot be computed).

## Waiting for the owner (never testable by Claude)

Check on the real data after merging: October's pending bonds; that no lending line shows before its first month and the part month looks right (Pandi, Lathish); the chit popups and gold chits; a real split of a bank entry; the Investable balance figure against his own sum; the family report print; the Tax summary bank comparison. Live Apps Script sync, Yahoo and mfapi prices and the Android install are only for him to try.

## Ideas not built yet

Anything the owner raises next. Possible: tax view whole months for FDs; reminders for gold chit length; per-organiser chit limits already exist under Risk.

## Earlier: state after 8.9.37

- `chitPending` (monthinvest.js): every running chit, gold chit and active GRT scheme (`gold.schemes[].active`) is paid (anything paid this month) or pending (last month's amount, else `monthly`). Gold chits run `settings.goldChitMonths` (optional, default 11), set on the Gold chits tab; over when payments reach it or that many months have passed since the first payment. Home popup `mandatoryDialog` has Pending/Received tabs.
- `monthCashflow` bonds: received = the due date has come (`x.due <= all.asOf`), not the bank. The bank match (`matchBondCredits`) is kept as `credited` per bond for the tax check only. The income line is named "Income Bond".
- `splitForm` (cash.js): Edit transaction → Split closes the edit window and opens the split window; the original ledger entry is replaced in place by new entries (new ids).
- Tax: `holdingMonths` counts interest to today and a payment only once due; `taxProjection.recon` compares payments due so far (`dueTo`) with "Income Bond" credits. Card layout classes: `details.tax-sec` in app.css.
- Ask the owner to check on real data: which bonds show in the Income Bond Pending tab, that the chit popup lists gold chits and GRT, a real split, and the tax card on his phone.

## State after 8.9.35

- Bonds tab: Sort by (Rate, Next due, Paid so far, Invested, Holder, Via, Maturity) with Ascending/Descending, in `quickFilter` (`js/views/fixed.js`, `flt.bonds.sort/dir`).
- `monthCashflow`: Bonds received = credits matched to bonds due that month (`matchBondCredits`), not every "Income Bond" credit. Matching is closest-amount-first, and no credit can settle a bond before its due date minus 3 days. `bondDueAmount`: a monthly bond whose due date falls before its purchase date first pays the next month, with the stub days.
- `incomeWindow` (calc.js): a `manualMonthlyIncome` line is tied to the Money to receive loan with the same name and amount (else the only one with that amount, else lending by name, else any by name) for its start, end and received date. Several loans can share one name.
- Home "Money to receive this month" shows bonds as one combined line (tap for the per-bond list), as the owner asked in 8.9.36.
- Ask the owner to check on real data: which bonds show as pending in October (the app should list only bonds due after today and any truly unpaid), and that no monthly lending line shows before its first month.

## Earlier: state after 8.9.34
- Bonds: per-bond optional `quarterMonth` (0, 1 or 2) sets the payout months of quarterly bonds; the payment covers the three months up to the payout month (`bondPaysIn`, `bondDueAmount`, `bondNextDue` in calc.js). Bank "Income Bond" credits are matched to bonds in `matchBondCredits` (exact amount, then name or issuer in the description, then due date, never before the due date). Manual monthly income such as private lending starts the month after its start date.
- Annual review: interest is read from "Income Bond" and "Income Lending" bank credits only (`isInterestCategory`). One-time category picker lists expense and investment categories only.
- Tax summary: closed bonds are flagged "Closed" (interest to the closing day); tap a bond for `holdingMonths`, a month-by-month check against the bank.
- Home "Investing this month" (`monthPlan` in `js/monthinvest.js`): investable income added, pending chit instalments from last month (chit length from `tenure`, else start/end dates; old `savings[].chitMonths` and gold `months` are still read as a last resort but no longer asked for), projected expenses for the rest of the month (rent and one-offs left out), current investable amount (bank minus wallets, optional `accounts[].wallet`) and its allocation by plan line weights.
- Tests that pass on synthetic data: allocgoal, watch, tax, monthinvest, bondmonth. projector, risk, safety, categories and features fail on synthetic data and did before.
- Verified with Playwright on synthetic data only, never on the real file. Ask the owner to check Annapurna, Navi, BelStar, Pandi and the new Home cards on his real data.

## Not testable by Claude
Live Apps Script sync, Yahoo and mfapi prices, a real Android device. Ask the owner to try those after a release.
