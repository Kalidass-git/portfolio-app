# Handover for a new Claude session

> **Starting a new session? Do this first.** 1) Read this file, then the top three entries of `docs/SETUP.md`. 2) Clone, branch `release-X.Y.Z` off `origin/main` (check which PRs the owner has merged: `git log origin/main`). 3) Say what you have read, list "Waiting for the owner" below, and ask what to build. 4) The owner works in short numbered requests; do them all in one release, test, bump, open one PR. He checks on his real data, which you never see: say how each rule works so he can check it.

**Repo:** https://github.com/Kalidass-git/portfolio-app (public), branch `main`. Latest release 8.23.0 (cache `family-wealth-v90`). Clone with `git clone https://github.com/Kalidass-git/portfolio-app.git`, run `python3 -m http.server 8765` in the folder, open http://localhost:8765. No build step.

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
- `#/flow` `flow.js`: income and expenses report. `#/monthdetail` `views/monthdetail.js` (+ pure `js/monthdetail.js`): Month in detail, status per month against the expected interest income. `categories.js`: category and rule editing.
- `#/plan` `plan.js`, `plan-year.js`: the Excel plan and targets.
- `#/projector` `views/projector.js` with tabs Planner (`proj-plan.js`, logic in `js/planner.js`), This year (`proj-year`), Years ahead (`proj-ahead`), Market outlook (`proj-market`); `proj-shared`, `proj-actual`, `proj-flow` are shared. Plans are set only on Planner (draft, make live, revise; revisions kept). The other tabs read `livePlan()` and never write plan figures.
- `#/risk` `risk.js` with `proj-risk` (limits per kind, rule and holding) and `proj-whatif` (try an investment against the limits).
- `#/report` `report.js`: Family report, printed to PDF. `#/networth` `networth.js`: net worth line from month-end snapshots plus a projection to December. `#/insights/{tax|calendar|review|anomalies|allocation}` `views/insights.js` + pure logic in `js/insights.js` (optional `data.allocGoal`). `#/incexp` `incexp.js`: Income vs expense report (category -> description drilldown, uses `calc.flowReport`).
- `#/settings` `settings.js`, `backups.js`, `storage.js`, `archive.js`.

## Data (top-level keys of the JSON)
`settings, accounts, ledger, categories, savings, bonds, fds, lending, receivables, stocks, mutualFunds, sipPlans, gold, liabilities, targets, proj, incomeSources, manualMonthlyIncome, reportNotes` plus optional `projector`, `risk`, `trades`, `fundTxns`, `corporateActions`, `history`. Arrays of objects carry an `id`. Optional extras so far: `savings[].organiser`, `fds[].issuer`, `lending[].borrower`, `settings.homeSpendExtra`, `settings.goldChitMonths`, `accounts[].wallet`, `receivables[].closedOn`.

## Tests
`node tests/<name>.test.mjs <path-to-data-json>` for calc, categories, archive, merge, safety, buys, projector, risk. `epf` takes no argument. They need a copy of the real data file (not in the zip). Browser checks used Playwright at 390px and 1360px width.

## Release process
Branch off `origin/main` (`release-X.Y.Z`), change files, bump `js/version.js` and the cache name in `sw.js`, add notes at the top of the release list in `docs/SETUP.md`, push, and open a PR to `main` with `gh api` (GraphQL is blocked). The owner merges it. Always base on `origin/main` so stacked PRs do not leave main behind.

## State after 8.23.0 (newest): Android app

- **Capacitor shell in `android/`** (package `com.familywealth.app`, Capacitor 8). The web app stays no-build; `scripts/sync-web.mjs` copies `index.html`, `css`, `js`, `icons`, `manifest` into `www/` (git-ignored) and `cap sync` puts it in the app. Owner builds the APK himself from `docs/ANDROID.md`. **The environment Claude works in cannot reach npm, Maven or the Android SDK, so the Android project has never been compiled by Claude.** If a build fails, ask for the error text first.
- **No bundler, so plugins are registered by name**: `js/native.js` uses `Capacitor.registerPlugin('App' | 'LocalNotifications' | 'SplashScreen' | 'NativeTools')`. Never `import '@capacitor/...'` in `js/`. In a browser `isNative()` is false and every native function does nothing.
- **Reminders**: `js/notify.js` (`buildReminders`, pure, built from the same `C.upcoming` dates as Home's Action centre, tested by `tests/notify.test.mjs`). `native.js` replaces all pending notifications on open and on every data change. Settings live in `S.cfg.reminders` (phone only, not in the data file). Android has no server push here, so reminders only exist for the 45 days after the app was last opened.
- **Own native plugin** `NativeToolsPlugin.java`: `print()` (WebView ignores `window.print`) and `shareFile()` (WebView ignores `<a download>`; `native.js` patches `HTMLAnchorElement.click` for blob downloads).
- **Title bar bug (fixed in 8.23.0 follow-up)**: a green native bar titled "Family Wealth" showed above the page because `EdgeToEdge.enable(this)` ran before `super.onCreate`; that builds the window with the launch theme before Capacitor switches to `AppTheme.NoActionBar`. Keep it after `super.onCreate`, and keep `windowNoTitle`/`windowActionBar=false` on the launch theme. This diagnosis comes from a screenshot only, not a debugger.
- **Phone window**: `MainActivity` sets a plain window colour (`@color/window_bg`, day/night) because the launch splash bitmap otherwise stays as the window background and shows through; it also fixes WebView text zoom at 100 so only the in-app size (`FS` in `main.js`, 80% to 150%; the app starts at 90% once, flag `pt.fs.native`) applies. Pull down in `native.js` = Drive pull then `prices.refreshAll`.
- **Not testable by Claude**: the APK build, notifications on a real phone (exact time, lock screen, reboot), print to PDF, share sheet, back button, status bar spacing. Ask the owner to try these first.

## State after 8.22.0

- Home `actionCentre()` (in `views/home.js`) replaces `watchCard/attention/comingUp`: `agenda()` = `C.upcoming(60)` + bond interest due today; `notices()` = the undated alerts (price alerts, stale prices, loan interest > income) with dismiss-until-tomorrow (`fw.dismissed` in localStorage); CSS `.ac-*` at the end of `app.css`; tab and expanded state in `acState`.

## State after 8.21.0

- Home layout: hero, tiles, `actionCentre`, `thisMonth` (holds `toReceiveExtras()`: due-to-you rows and the bond bank check for the current month), invest card, allocation/risk, returns, net worth. `toReceiveCard` no longer exists.
- Interest certificate returns `later[]` (payments after today but this month, switch off) and the view lists them.

## State after 8.20.0

- Interest certificate `certificate(data, all, period, kinds, { projections })`: off (default) = cash basis, only dates <= asOf (FD/lending compound at maturity/closing, chit gain in completion month, EPF/PPF in March, bonds/payouts per payment); on = accrual spread plus future payments. Each month entry has `{gross, tds, net, due, proj}`; rows get `projNet` and `projected`.

## State after 8.19.0

- Interest certificate takes a LIST of types (`cert.kinds`, empty = all) and covers EPF, PPF (`epf.monthlyInterest`) and chits (`chitMonths` in `interestcert.js`: gain spread by instalment-days; closed chit uses `closed.amount`, open chit = projection, `r.projected`, italic `.proj`). RD, insurance and other savings are not included yet.

## State after 8.18.0

- **Interest certificate** (Insights tab): `certificate(data, all, period, kind)` and `periods(asOf)` in `js/interestcert.js`; test `tests/interestcert.test.mjs`. Bonds use `bondGrossIn/bondNetIn` by due month; payout deposits use `payoutStep`/`payoutAmount`; compounding ones the month-on-month change of `calcDeposit().accrued`.

## State after 8.17.0

- **Part-closed bonds** (`partCloseForm` in `views/fixed.js`): remaining bond keeps its id with reduced `principal` (and scaled `payoutAmount`); each returned part is a separate bond with `closed`, `partOf`, `partKey` (`<id>-P<n>`), named `Name (part n)`. Never match them by name alone. `bondSchedule(bonds, b, asOf, tds)` adds the family together. Test `tests/bondpart.test.mjs`.
- **Holder pie** credits = Income Bond ledger credits by account owner (`I.acctOwner`), not matched per bond.
- `calcBond().monthNet` is this month's payment (period rule) for monthly bonds.

## State after 8.16.0

- **Bond interest rule** `bondPeriod(b, month)` in `calc.js` is the single source: days from the day after the previous payment day through the due day (quarterly: from the previous payout day; first period from the purchase day, last to the day before maturity/closing). `bondDaysIn`, `bondGrossIn`, `bondNetIn`, `bondDueAmount`, `bondPaidSoFar`, `monthCashflow`, tax summary (`taxSummary`, `holdingMonths`, bank recon in `insights.js`) all use it; never count calendar-month days for bonds again. `calcBond().monthNet` is only the nominal per-month estimate. Tests: `tests/bondmonth.test.mjs`, `taxbonds.test.mjs`.
- **Interest by holder pie** (`holderPie()` in `views/fixed.js`, bottom of the Bonds tab); state in module `pieSel`.

Releases 8.14.0 to 8.15.2 (read their notes at the top of `docs/SETUP.md`):

- **Allocation rule** `js/allocation.js`: each Wealth outlook "New money" line (`plan.a.invest[]`) has optional `mode` ('pct' default, 'amt' fixed) and `priority` (1 first). `allocate(amount, lines)` fills lines in priority order, each capped at what is left; the last line takes any excess. Used by `projector.simulate` (This year, Years ahead), `monthinvest.splitMonth` and `monthPlan` (Home Investable balance and Investing this month; when any line has a priority or fixed mode, `monthPlan.rules` is true and gold and chits follow the rule instead of last month's gold buying), and shown in `proj-plan.js` and `proj-shared.js`. No mode or priority anywhere = the old plain shares. Test: `tests/allocation.test.mjs` (no data file).
- **New money table** (`newMoneyCard` in `proj-plan.js`): shown in priority order; up/down buttons and drag-and-drop (`dragRows`, desktop) call `move()`, which renumbers every line 1..n and flashes the moved rows (`.moved` classes). The add/edit form is two columns.
- **Home cards** (`dress()` in `home.js`, `.kt-*` CSS at the end of `app.css`): icon, amount, one quiet line; Investable balance is pale blue and italic; trend lines are decorative. Cards share one height; the Spent note is one line.
- **Home bank check** `bondBankGap()` in `calc.js` (test: `tests/bankgap.test.mjs`): current month only, by TOTAL (the owner does not want credits matched to bonds, their amounts, dates and descriptions vary): bond interest whose due date has passed against all bank 'Income Bond' credits of the month (`income[0].bankCredit`, `bankRows`); `short` when the bank is `BANK_TOLERANCE` (300) or more lower. When not short a quiet 'Bank check' line still shows the two totals. Display only, in `toReceiveCard` and `bankGapDialog`.
- **Markets today** popup (`refreshBar()` in `home.js`): last-refreshed stamp and a Refresh button that calls `refresh()` from `equity.js` (shares, ETFs, funds, gold, P/E).
- **Month in detail**: heat map (`heat()`, `heatGradient()` in `js/monthdetail.js`), selected month raised and ringed, gradient legend; the "What counts as spending" popup uses `.count-list` rows.
- **Gold chits**: `chitProjection()` in `monthinvest.js`, italic card from `projectionCard()` in `gold.js`, for chits and monthly gold schemes; says so when all instalments are paid.
- **Allocation goal** (`allocation()` in `insights.js`): plan picker plus read-only `planSettingsCard`.
- Tests that pass on synthetic data: allocation, bankgap, allocgoal, watch, tax, taxbonds, monthinvest, bondmonth, monthdetail, pendingreceive, expensedrill. `anchor`, `planner`, `projector`, `risk`, `safety`, `categories`, `features` need the owner's real data file.
- Browser checks used Playwright with a synthetic data set put in localStorage (`pt.data`, `pt.cfg` with `asOf`); the gold rate lives in `settings.goldRate`, and `settings.goldLive` has `usdOz, prevUsdOz, inr, prevInr`.

## State after 8.13.0

- **Investable cards** (`home.js`): `showInvestable(m)` is the one popup for the blue tile and the Investing-this-month stat (tabs `calc` and `done`; `investedBody` uses `m.rows`, `m.unplanned`, `m.done` from `splitMonth`). The remaining amount is italic.
- **Net worth over time** (`netWorthHistory` in `home.js`, `netWorthPoints` in `calc.js`): daily readings (`data.history`: net, assets, liab) + month-end figures + today, straight lines between readings; `lineChart` takes `tipLabels` for the hover title.
- **Month in detail**: `statusOf` levels (under 75% well, to 100% marginal, to 120% over, then beyond), `monthRow` = Home's Spent against `totalExpected`. What counts is a local override in localStorage `pt.md.count` (name -> true/false), nothing in the data file.
- **Work-optional**: `workOptional(rows, net, rate, { frac, items })`, `regularShares(data, all)` splits the plan's monthly expenses by 12 months of bank categories. Saved at `projector.ahead.woSkip { cats[], items[] }`.
- Ask the owner to check on real data: that Home's invested-so-far matches his bank/asset entries; the net worth chart after a few days of daily readings (before that it is month-end only); Month in detail colours against the months he remembers; that ticking Rent and Tax moves the Work-optional corpus the way he expects.

## State after 8.12.0

- **Plan start**: `plan.initial.asOfMonth` is the month end the plan starts from (absent = December before). `effective()` sets `start.month` from it; `planPath` simulates `monthsTo(start.month, year)` months, so a plan made in October has three rows. `yearTrack` returns `rows` only for months after the start, `from` (last real position: latest in-plan snapshot, else the starting figure), `anchor`. Snapshots at or before the start are ignored by `yearTrack`, `prevPosition` and `canDeletePlan`. There is no "now" month any more: a month is `actual` (snapshot) or `projected`.
- **Rules for next sessions**: never mix today's holdings into the plan views; the projection has no loan paydown (`loanPaid` is gone from rows); FDs class = FDs only; interest comes from bonds and lending, `a.interestMonthly` null by default (typed figure gives the `adj` line, labelled "Adjustment to your expected figure").
- **Popups** (`proj-flow.js`): `interestTip`, `otherTip`, `investedTip` return `{ rows, parts }`; chart bars carry `detail` from `parts` (`charts.js` hover). Cells given to `table()` must be built per render, never one shared element (a table draws desktop and phone views).
- Test data: there is no real data in the repo. `tests/anchor.test.mjs <data.json>` works on any file with bonds, lending, FDs and a ledger. `planner.test.mjs` still needs the owner's file for "old plans are listed as legacy".
- Ask the owner to check on real data: the September start figure for 2026 and the October snapshot he saves; that interest income (bonds and lending only) now looks right against his bank; the Not explained difference of his first snapshot month; creating plan 2027 in December.

## State after 8.10.0

- **Plan model** (`planner.js`): `projector.years['2026'] = { v:2, year, a, initial, live, revisions[] }`. `a` is the working copy, `live` a frozen copy `{rev, at, a, initial}` that every other tab and `monthinvest.js` use (`livePlan`, `effective(plan,'live')`). `commit` writes a revision with `diffPlans`. Old plans (no `v`) are ignored; `clearLegacy` deletes them and the old `projector.ahead` planning keys (only on the owner's button).
- **Simulation changes** (`projector.js`): `a.salaryMonth` anchors salary/EPF/other income (a hike already behind it is not applied twice), `a.interestMonthly` replaces the holdings-based interest level (difference carried as `interestBy.adj`), per-item `rise` on one-time items. The year starts from `initial` as December of the year before.
- **This year** uses `yearTrack`: snapshot months and the current month are real, the rest projected from the last real position (rows carry `src` 'actual' | 'now' | 'projected'; italic via `proj-row`). The market outlook is a what-if kept in memory (`proj-shared.js` `outlookNow`), never saved.
- Ask the owner to check on real data: that "Delete old plans and settings" and a first plan for 2026 start from his old one-time items and rates; the interest income and expense defaults; the invested popups on This year against his bank; the first "Make this plan live" and a revision.

## State after 8.9.39

- **Phone rows**: `table(cols, rows, { mobile })` also renders `mobileRows` (ui.js), shown only at max-width 700px (the table is hidden there; from 701px the phone block is hidden, so desktop and tablet are byte-for-byte the same). Config: `{ key, head, midHead, first(r)->{title,sub,tag,extra}, mid(r), views:[{label,main,sub,total?}] }`. The heading pill cycles the views for all rows, choice kept in localStorage `pt.mv.<key>`; sorting is separate. Add it to a table by writing a config next to its `table()` call (see `holdMobile` in equity.js, bonds and `depMobile` in fixed.js, `loanMobile` in loans.js, accounts/transactions/savings in cash.js, running chits in gold.js).
- **Sort/filter sheets**: `js/mobilebar.js` (`sortFilterBar`, `openSort`, `openFilter`). A screen passes `{ sort: { options:[{value,label,kind}], value, dir, apply }, filters: { fields:[{key,label,type,options,default,showIf,chip,count}], values, apply }, search }`; `apply` changes the screen's own existing state and re-renders. `kind` (num, text, date, due, none) picks the direction labels. Desktop controls get class `desk-ctl` (hidden at max-width 700px). Used in equity.js (`mobileSort`), fixed.js (`quickFilter`) and cash.js (ledger). To add to another list, give it the same config.
- **Shortcut**: `table(cols, rows, { m: { key, head, title?, sub?, mid?, midHead?, views:[[A,B]], sort, sortDefault, filters } })` builds the config from the table's own column labels with `mobileFrom` (throws if a label is missing). `mobileRows` keeps local sort/filter state in `viewState` (by key) and draws a `sortFilterBar` when options exist.
- Converted in the third round: gold (instalments, closed, purchases, jewellery, others), flow, categories, networth, proj-* (risk, whatif, market, ahead, actual, year, flow), insights (tax, review, anomalies). Home's interest pending = `pendingToReceive` (monthinvest.js), shared with the Money to receive card.
- Not converted (earlier `.tbl.fit` cards): reports, imports, dividends, watch, `groupedTable` 'kind of holding', closest-to-limit group table, small dialog tables.
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

Check on the real data after merging: the new allocation rules (set a priority and a fixed amount on a few lines and compare This year, Years ahead and the Home cards with your own sums); the Income Bond 'not in the bank yet' line against your bank entries; the gold chit projection on your real chits and GRT scheme; October's pending bonds; that no lending line shows before its first month and the part month looks right (Pandi, Lathish); the chit popups and gold chits; a real split of a bank entry; the Investable balance figure against his own sum; the family report print; the Tax summary bank comparison. Live Apps Script sync, Yahoo and mfapi prices and the Android install are only for him to try.

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

## Added in 8.14.0

- `js/allocation.js` is the one rule for sharing a month's money among Wealth outlook "New money" lines: optional `mode` ('pct' default, or 'amt' fixed) and `priority` (1 first) on each line; filled in priority order, each line capped at what is left, the last line takes any excess. Used by `projector.simulate`, `monthinvest.splitMonth` and `monthPlan` (Home cards), and shown in `proj-plan.js` and `proj-shared.js`. With no mode or priority anywhere it behaves exactly as the old plain shares. `tests/allocation.test.mjs` needs no data file.
- Month in detail heat map: `heat()` and `heatGradient()` in `js/monthdetail.js`, tiles and legend in `js/views/monthdetail.js`.
- Gold chit projection: `chitProjection()` in `js/monthinvest.js`, card drawn in `js/views/gold.js`.
- Home summary cards: `dress()` in `js/views/home.js` and the `.kt-*` rules at the end of `css/app.css`. The trend lines are decorative, not data.

## Not testable by Claude
Live Apps Script sync, Yahoo and mfapi prices, a real Android device. Ask the owner to try those after a release.
