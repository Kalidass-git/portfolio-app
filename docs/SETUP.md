# Family Wealth app: setup guide

A web app that also installs on Android as a phone app (PWA). It shows everything in your `the owner's Excel workbook`: Home, Cash, Fixed income, Equity, Gold, Spending, Plan and the family Report.
Your data lives in **one JSON file in your own Google Drive**. Only you (owner key) can edit. Family (family key) can only view.

## The one thing to know about "no hosting"

- **Your data is never hosted anywhere except your Google Drive.**
- The app's *code* (HTML/JS files, no data in them) must be opened from a web address for a phone to install it. Android only allows "Install app" from an https page. Pick one:
  1. **Free static host (recommended).** Upload the app folder to GitHub Pages, Netlify or Cloudflare Pages. It holds code only. Open the link on each phone, then Chrome menu > *Install app*.
  2. **Desktop only, fully local.** In the app folder run `python3 -m http.server 8765` and open http://localhost:8765. Phones cannot install from this.
  3. **Android app (APK).** A Capacitor wrapper packs the same files into an APK, with payment reminders on the phone. See `docs/ANDROID.md`.

## Step 1. Put the app online (code only)

Upload everything in this folder **except** `tools/`, `tests/` and any `portfolio-data.json`. Never upload your data file.

## Step 2. Create the Drive backend (5 minutes, once)

1. Go to https://script.google.com and create a **New project**.
2. Delete the sample code and paste all of `backend/Code.gs`. Save.
3. Choose the function `setup` and press **Run**. Approve the permissions (it needs Drive and external requests for prices).
4. Open **Execution log**. Copy the two keys: `OWNER_KEY` (private) and `FAMILY_KEY` (to share). You can see them again by running `showKeys`.
5. **Deploy > New deployment > Web app.** Execute as: **Me**. Who has access: **Anyone**. Deploy and copy the URL ending in `/exec`.
   "Anyone" only lets people reach the door. Nothing is returned without a valid key.
6. A folder **Family Wealth Data** with `portfolio-data.json` now exists in your Drive, with daily backups kept for 30 days.

## Step 3. Connect your phone or browser as owner

1. Open the app. Choose **Connect to Google Drive**. Paste the `/exec` URL and the **owner** key.
2. Because Drive is empty, the app asks for your data file. Pick `portfolio-data.json` (made from your workbook, supplied separately). It uploads to Drive.
3. From then on every edit saves on the device and syncs to Drive within about 2 seconds. The top chip shows the sync state.

## Step 4. Share with family (view only)

- In the app go to **Settings > Share with family**, paste the `FAMILY_KEY`, and press **Copy link**. Send that link on WhatsApp. When they open it the app connects as view only, and they install it from Chrome's menu.
- Treat the link like a password. If it leaks, run `setKeys('newOwner','newFamily')` in Apps Script and share the new link.

## What is new in the sixth release

- **Shares & ETFs together.** One tab with a Both / Shares only / ETFs only switch. A search box at the top of every Shares & funds page finds any share, ETF, fund or sold share by name or symbol.
- **Easier tables.** Each row has two-line cells: name with quantity and average price, price with today's change, value with invested amount, gain with return % and XIRR. Green and red follow profit and loss. No sideways scrolling on a phone. XIRR shows for holdings with dated buys over a month old.
- **Sold shares.** Tap a sale to correct the symbol it is priced with, or stop fetching its price (and optionally enter a price yourself). Delisted symbols no longer cause errors on refresh.
- **Investment Planner.** "Done this month" is read from your buy history (use "Find its buys by" on a line to match names), with a **Refresh from history** button and a manual option per line.
- **Gold chits.** Monthly gold savings such as GRT Savings Account - 5 now show under Gold chits with their instalments; earlier GRT accounts show as closed.
- **Chits with the same name** are kept as separate items everywhere, including the family report, which now merges same-named lines into one with a count.
- **Home.** Budget card for the month (expected interest income, received, spent, left), Money to receive this month, Spent this month tile, and the empty-card "null" fixed.
- **Family report.** Page 1 shows contact notes next to each holder (for example the relationship manager for Groww), kept compact; always exactly two pages.
- **Data safety.** A daily automatic restore point (last 20 kept), a restore point before combining with another device or loading a much smaller Drive copy, a check that stops damaged data from being saved or uploaded, a warning before a big deletion is uploaded (with a choice to go back), a warning when this device cannot save, and a prompt before closing the app with changes not yet uploaded. The Drive backend already keeps a dated backup copy and rejects out-of-date uploads.

- **Storage** (Settings): shows how much room the app uses on this device (data, synced copy, restore points, biggest parts of your data, browser allowance) with a button to delete automatic restore points.

No backend change is needed. Replace the hosted app files and reload once.

## What is new in the fifth release

- **Two devices, no overwriting.** If you edit on the desktop and the phone, the app now combines both sets of changes by itself when it syncs (new entries from each are kept, edits to different items are merged). Only if the same item was edited in both places does it keep this device's version and tell you. If it cannot combine, the "Fix sync" button explains the choice, and a restore point is saved before anything is replaced. Still best: let "Saved to Drive" show before you switch devices.
- **Home simplified.** Gold rate and "bank cash lasts" tiles are gone. New: Needs a look (overdue money, old prices, loan interest higher than earnings), Today (shares, ETFs, funds and gold change, with the total), Shares, ETFs & funds: how each did (with a Total row), Earning every day (per instrument, loan interest in red, total after loans), and Kept this month.
- **Live gold.** Pressing Refresh prices also reads the world gold price and USD/INR (through your existing backend, no update needed) and moves your gold rate with it. It keeps your own rate's basis: when you type a rate yourself, the app learns the gap between world price and your jeweller/market rate. Gold's change today shows on Home. Turn this off on Gold & more → Gold if you prefer typing the rate.

No backend change is needed. Replace the hosted app files and reload once.

## What is new in the fourth release

- **Investment Planner** (Shares & funds, renamed from Monthly). Pick any month to see how much went into shares, ETFs and funds, compared with your monthly plan, with a chart of the last 3, 6, 12 or 24 months and the purchases listed. Purchases come from imported or added trades and fund buys; holdings entered by hand without dates are not counted.
- **Archive old expenses** (Expenses → Archive). Choose a date; older bank entries leave Expenses and reports, and each account keeps its exact balance through one "opening balance" entry. Monthly totals stay visible, entries can be downloaded as CSV, brought back, or deleted. A restore point is saved automatically first.
- **Restore points** (Settings). Create named copies of all your data, restore any of them (your current data is saved first), download them, or delete unused ones. They are stored on the device you made them on, so also download a copy for Drive.
- **Loans** (Fixed income → Loans I owe). Add loans with outstanding amount, rate, EMI and what they are used for. Interest each month is shown in red, apart from interest you earn. Home has a new **Net monthly inflow** tile (interest earned minus loan interest) and a card showing both sides, so loans taken to lend out are netted off.

No backend change is needed. Replace the hosted app files and reload once.

## What is new in the third release

- **Privacy and reading.** Figures are hidden when the app opens; tap the eye to show them. **Aa** cycles the text size (also in Settings). Negative numbers are red. Home is view-only; add income and expenses from the Expenses tab.
- **Shares & funds** now have separate sub-tabs: Today, Shares, ETFs, Funds, Insights, Sold, Monthly, Import. Gainers and falls can be viewed for shares, ETFs or funds separately.
- **Groww import (Import tab).** Choose *Replace everything* for a full history (a warning and preview show the changes, and you can undo) or *Add to existing* for a partial file (duplicates are skipped and listed; upload twice and choose Override if you really want to replace them). XIRR is computed from the real buy and sell dates. Splits, bonus, mergers and dividends can be added by hand or accepted from the suggestions.
- **Holdings and sales.** Tap a holding for lots, trades and XIRR; Sell records the sale (and can credit a bank account). Sold shows what was sold and what it would be worth if kept. Insights shows biggest and smallest exposure and sector and large/mid/small-cap charts (sectors are best guesses; edit any).
- **Closing things.** Chits, bonds, FDs and private lending can be closed (cash goes to a bank account you pick, amount editable) and reopened or deleted from the Closed view. Gold chits close into a gold purchase. Chits show their actual XIRR. Money to receive highlights pending payments.
- **Expenses.** Pick a period (this year, last month, past year), filter by category, and open a category to see entries or totals by description. Transfers and investments are not counted as expenses. Salary and other credits in income categories are income.
- **Plan → Year plan.** Set salary, other income, expenses, one-offs, EMI and tax for each month (or fill many months at once). The app shows a cautious projection, where you stand each month, and a year-end review with notes for what went wrong, why the estimate was off, and what to do better; then start next year's plan. Net worth and Long-term views are kept.
- **Family report.** Print or save as PDF gives two A4 pages: summary and contacts, then charts. Use **Edit family note** to add the message and key contacts (relationship manager etc.). Figures are shown while printing even if hidden on screen.

No backend change is needed. Replace the hosted app files and reload once.

## What the screens do (second release)

- **Home** is a dashboard of cards: net worth with its trend, quick actions, four headline tiles (monthly interest, shares and funds today, gold rate, how long bank cash lasts), this month, coming up (maturities and money due), where the money is (with a risk mix), interest by source, investment returns and net worth over time. Detail tables are on each asset screen.
- **Two kinds of tabs.** The tabs under the header (Cash, Fixed income, Shares & funds, Gold & more) switch asset type. The grey segmented control inside a page switches the view of that page. The back button remembers the view.
- **Spending → Categories & budgets.** Add, rename, merge or delete categories, choose what each one counts as (spending, income, investment, not counted), set a monthly budget and fix wrong auto-fill rules. Names the Home summary depends on (Rent, Food, Salary and similar) show a lock and keep their name. While adding a transaction choose **+ New category…**.
- **Shares & funds → Today.** Day change for each holding, biggest gains and falls. It needs one **Refresh prices**. Share day change comes from yesterday's close in the Yahoo response, so it works with the backend you already deployed. Fund day change uses the last two NAVs from mfapi.in.
- **Gold & more → Gold.** Type today's price per gram and press **Update rate**. Home shows the rate and warns when it is older than a week. Past rates are kept.
- **Net worth history.** The owner's device saves one reading a day when the app opens. Earlier months come from your Plan sheet.
- **Monthly plan.** The "done this month" amounts reset by themselves at the start of a month, and **Mark done** fills a plan in one tap.

No backend change is needed for this release. Replace the hosted app files and reload the app once (close and reopen the installed app on phones).

## Live prices

- **Stocks:** *Equity > Refresh prices* asks the backend for NSE prices, falling back to BSE. Only the owner refresh is saved into shared data, so family sees the same prices.
- **Mutual funds:** open a fund and use **Link to live NAV**. It searches api.mfapi.in and stores the scheme code. Funds not linked keep your typed NAV.
- If an API is down, the last saved price is used. These two price sources could not be tested from the build environment, so try Refresh once after setup.

## Updating from Excel again

`pip install openpyxl`, open and save the workbook in Excel (so values are cached), then:
`python3 tools/import_xlsx.py the owner's Excel workbook portfolio-data.json`
In Settings use **Upload this device’s data** to replace the Drive copy. The app is now the place to edit, so only re-import if you go back to Excel.

## Backup and restore

Settings has **Download backup** and **Restore from file**. Drive also keeps 30 daily copies in the same folder.

## Security notes

- Keys are the only protection. Use the generated random ones. Do not post links publicly.
- The Report notes field is for contact names and where money sits. Do not store passwords or PINs there.
- Data on a phone is cached in that browser's local storage. Use a screen lock.
- Family members do not need Google accounts.

## Known differences from the workbook

- The sheet's `AllTransactions` snapshot is stale for October (26,774 lower than the app's ledger). The app ledger is the full one.
- Jewellery listed on the Gold sheet is not counted in net worth, matching the workbook.
- The workbook had no XIRR formula, so XIRR is computed from dated cash flows (about 85% of assets are covered). Stocks and mutual funds show return % only until buy dates are added.


## What is new in release 7

- **Home:** Coming up now sits beside Money to receive. The budget is part of "This month in detail". On a computer, Earning every day, Markets today and Spent this month open as drop-downs from their tiles (the separate Today and Earning cards show only on a phone, where the earning sources are folded away). Net worth shows your overall XIRR.
- **Tables on a phone:** the main figure stays in its column and the minor ones sit as a small line under the name. Tap "All columns" above a table to see everything (it scrolls sideways).
- **New entries:** every form with a required date now starts on today's date.


## What is new in release 8 (version 8.0)

- **Version number** in the side menu (computer) and under Settings → About.
- **Shares & funds:** sort by XIRR, exposure (share of all assets), gain and more; the find box sits above the table, right of the sort. Buttons such as Add and Refresh show only an icon on a phone.
- **Dividends tab** (Shares & funds): add each dividend as it arrives; see this year and all time, top payers for both as charts, and a yearly bar chart.
- **Savings & chits** is now its own page under Assets (EPF, PPF, LIC, RD, chits, plus the Closed list).
- **Gold:** the GRT monthly-savings table is removed from the Gold tab; it lives under Gold chits.
- **Income & expenses:** the left-over card is gone. Income is green, expenses red, investments blue. "Where the money went" and "Income by source" switch between Category and Description, and "Show all" opens every entry.
- **Family report:** every holding is listed under its kind, in smaller type, with its own contact note. Tap a heading to fold it on screen; print always shows everything (2 pages).
- Month lists follow the current year, with the late months of the year before, then older ones.


## What is new in release 8.1 (version 8.1)

- **Restore points:** going back to a restore point (or a backup file) now replaces the copy in Google Drive straight away, and tells you whether it was saved or is waiting to upload. Before, the restored data stayed marked "not uploaded" and never left the device. A safety copy of what you had is made first.
- **Overall XIRR** now also counts investments you have closed, and Home shows a second figure without EPF and PPF, since those long, steady savings pull the overall figure down.
- **Gold page:** a "Gold today" tile with the rupee and percentage change and the change per gram.
- **Today's change** shows the percentage everywhere (Home tile and drop-down, Gold).

## Release 8.92.0 – Cash & banks takes less room on a phone

Presentation only. No calculations, data or stored fields changed.

- Slimmer tabs, a one-row total on Accounts, and shorter account cards.
- Transactions: the view switch, filter-categories button and sort/filter bar are tighter.
- The five summary tiles are one card: Received, Paid out and Net on top, "Entries" and "Balance" on a line below. The account name after Balance shows on wide screens only.
- Desktop layout is unchanged.

## Release 8.91.0 – Order history as a timeline

Shares & funds → Holdings → *Order history* now opens on a **Timeline** (the *Table* and *By holding* views stay). A line runs down the page grouped by month (each month header shows what was bought and sold), with a dot and a card per order: blue for a buy (money out), green for a sell (money back). Tap a card to open that holding. On phones the orders are cards; on a wide screen each is one aligned row (date, holding, what was done, amount). Presentation only; nothing stored changes.

## Release 8.90.0 – Cash transactions: balance and more options; account-wide Order history

- **Cash & banks → Transactions**: a *Balance* tile sits in the summary row next to *Paid out* (the balance of the account picked in the filter, else all cash). New options taken from Income & expenses: a view switch (*Entries / By category / By description*; the grouped views follow every filter, tap a category or description to open its entries), a *Filter categories* button (show only the categories you tick, or everything except them), more periods (last 3, 6, 12 months), and *Net* and *Average entry* tiles.
- **Shares & funds → Holdings**: an *Order history* button opens one page for the whole account (`#/equity/orders`, new file `js/views/equity-orders.js`): every buy and sell of shares, ETFs and funds for All time or any period (this / last month, last 3 / 6 / 12 months, this or last year, financial years, a single month), with filters for buys / sells and shares / ETFs / funds, a find box, totals (orders, bought, sold, net invested) and three views: a **Timeline** (the default: a line down the page grouped by month, a dot and card per order, blue for a buy, green for a sell), the *Table*, and *By holding*. Tap an order to open that holding. Presentation only; nothing stored changes.

## Release 8.89.0 – Home: no duplicate "Due to you" list

Home → This month in detail → Income no longer repeats the *Due to you, not received yet* list (the income lines above it already show what is due or overdue). The bond-interest bank check stays. Presentation only; nothing stored or calculated changes.

## Release 8.88.0 – Passive income: fuller Overview, unused allocation shown separately

- **Overview** (plan only) is fuller again: a card per income listing the expenses planned on it in payment order with amounts (and any quarterly/yearly payment included), what is allocated and still free; an *Expenses* table (budget a month, from passive income, gap, total); *Kept aside every month* for quarterly/yearly payments; the coverage goal.
- **Unused allocation is no longer carried.** What an expense did not use is never added to the next month's allowance, so a month's over / pocket figures depend only on that month. Progress shows two separate indicators: *Unused this month / in the period* and *Unused from earlier months* (the sum of earlier months' unused plan, from the start of the plan), and per expense a note with the unused part. The carry-forward switch is removed; the stored `carry` field is left alone and ignored. Salary protection no longer counts a carried reserve either.
- Works on past records: everything is worked out from the bank entries already stored and the allocations as they are now (allocations are not versioned, so a past month is judged against today's plan, from the plan's *from* month). Nothing stored changes.

## Release 8.87.0 – Passive income: one Progress tab

Actual vs plan and Progress are now one **Progress** tab, the only place that shows actuals. Overview and Allocations are plan only (no trend, no attention list, no averages of past months; an expense with no budget just says so).
- **Period**: This month, Last month, 3 / 6 months (finished months), Year to date, 12 months.
- **KPIs**: passive income (this month includes the projected income that is still due), spent, from your pocket, and the more income a month that would have covered the pocket spend.
- **One card per income**, listing the expenses planned on it: planned, spent, *Over by* when it went above, *Income fell short* when the income paid less than planned, and what was left over (with carry-forward on it moves to the next month; money left from earlier months is shown too). Spend of an expense is taken by its incomes in their order; anything above everything planned lands on the last one. Spend with nothing planned is listed as paid from the pocket.
- Several months add up (planned, spent, over); left over is what stood at the end. A month-by-month table, *Set aside for later payments* and Salary protection follow.
- Old links to the Actual vs plan tab open Overview. Presentation and read-only calculations; nothing stored changes.

## Release 8.86.0 – Passive income: simpler Actual vs plan

Actual vs plan now answers two questions per expense: how much went over the plan, and how much came out of your pocket because passive income was not enough. The "This month's income, used in order" and "Expenses this month / On plan" sections are gone. Top figures: passive income credited, spent, paid by passive income, from your pocket. *By expense* lists each expense with what it cost, what passive income paid (the credited income used in each income's order, plus carried-over balance), the rest from the pocket, and the reason (over the plan / income short / no income set aside). *Set aside*, income expected vs credited and salary protection stay. Presentation only; nothing stored changes.

## Release 8.85.0 – Passive income: simpler Overview

The Overview tab no longer draws the allocation picture. *Where the income goes* is a short read-only list: each income, how much of it is allocated, and which expenses it pays. Everything is changed on the Allocations tab (*Open allocations*). Presentation only; nothing stored changes.

## Release 8.84.0 – Passive income: budgets drive the plan, top-down overview, clearer actual vs plan

- **Overview**: the allocation picture now runs top-down. Incomes across the top, the expenses stacked below; each income drops a coloured line down the left side to the expenses it pays, and chips on an expense show who pays it, in what order and how much.
- **Allocations**: *Needs income* is now a list card above the incomes (drag from it into an income as before). The column filter is multi-select: everything is shown, switch a chip off to focus on the rest (*All* brings everything back). All bond interest is one income, **Bond interest** (no monthly/quarterly split; older plans using the two groups or single bonds are read as this one income, nothing is rewritten until the plan is next saved).
- **Planning comes from the category budgets** (Income & expenses → Categories): an expense costs its monthly budget plus a twelfth of its yearly budget. A category with no budget keeps using the older fixed amount if one was set, else the average of recent months, and a note says so with a link to set the budget. The *Plan the expenses* dialog is gone; *Expense budgets* opens the Categories page.
- **Payments made every few months** (maintenance at quarter end): the budget already holds them. Tap an expense card and open *Part of it is paid every few months* to say how much and how often (optional `lump` on `settings.passivePlan.expense`, with an optional `at` month for yearly ones). In an ordinary month only the regular part is allowed, the whole payment in the month it falls due, so the false "short by 4,500" is gone.
- **Actual vs plan**: *Expenses this month* is one line per expense (spent against allowed, what is left), grouped into *Needs a look* and *On plan*. New **Set aside for later payments** card: the accumulated share of each quarterly/yearly payment and when it falls due, including yearly budgets such as education.

## Release 8.83.0 – Passive income: kanban board

The Allocations tab is now a kanban board. One column per income (Monthly bonds, Quarterly bonds, each interest line, other income) plus a first column, **Needs income**, holding every expense that is not fully paid.
- **Drag a card** from Needs income into an income's column to pay it from there (an amount sheet opens, limited to what that income has left). Drag it between incomes to move it (if the other income has less left, only that much moves and a message says so). Drag it back to Needs income to take it off. Every change has an Undo in the message that appears.
- **Order is per income**: the card's number is the order that income pays in (1 first). Drag a card up or down inside its column to change it; the other cards renumber. Stored as the optional `settings.passivePlan.sorder` (an income without one follows the order of the expenses). Actual vs plan uses each income's own order.
- **Tap a card** to split an expense across incomes in one sheet, as before.
- **On a phone** use the column chips (All / Needs income / each income) to show one column at a time when there is no room across; with All, the columns scroll sideways and dragging a card near the screen edge scrolls them. Phones drag by the handle on the left of a card so normal scrolling still works.
- Column headers show each income's monthly figure, what is allocated and what is left. The four summary cards stay at the top.

## Release 8.82.0 – Passive income: new Allocations layout, rent with a lump payment

- **Allocations tab redesigned.** The drag-the-dot board is replaced by a pinned strip of the income sources (each with what is left of it, always visible while you scroll) above a list of expense cards. Tap an expense and one sheet lists every income with an amount box for each (no income can be asked for more than it has left; "Fill" tops up what the expense needs). Filter the list All / Needs income / Funded. The flow picture with connecting lines stays on the Overview tab, now with the order number on each line (for example "1 · 3k").
- **Order is part of the expense card.** The separate Payment order section is gone. Each card shows its number (1, 2, 3...), and each income chip on it shows the order that income pays it in (#1, #2...). Drag the handle on a card to move it (touch and mouse; the page scrolls near the screen edge), or focus the handle and press Up or Down. Every chip renumbers itself.
- **Rent with a quarterly lump.** In Plan the expenses, a fixed expense can have "an extra payment every N months" (every 2, 3, 4, 6 or 12 months; every 3 = quarter end, March, June, September, December). Rent 25,000 monthly plus 13,500 every 3 months plans as 29,500 a month. In Actual vs plan, between payments the share kept for the lump (4,500 a month) is shown as "kept for the 3-monthly payment, not free to spend", and "Free to spend" excludes it; it turns amber if what is left is short of what should be kept.
- The "Part of another expense" choice is gone from the sheet (data saved by 8.81.0 is still honoured).
- Optional new saved field: `lump` inside an entry of `settings.passivePlan.expense`. Nothing existing changed.

## Release 8.81.0 – Passive income: fixed expenses and parts of an expense

The "Expenses in the plan" button is now **Plan the expenses**. For every expense you choose how it is planned:
- **Average of past months** (the default, good for food and groceries), or **Fixed amount** (rent). A fixed amount can be paid monthly, quarterly, half-yearly or yearly and is divided to a monthly figure, so a quarterly 13,500 plans as 4,500 a month.
- **Part of another expense**: Maintenance can count as part of Rent. They are planned as one expense (25,000 + 4,500 = 29,500 a month, shown as "Fixed ₹29,500"), allocations made to the part move to the main expense, and spending on the part counts as spending on the main expense in Actual vs plan. Because the maintenance is paid in one lump, switch on "Carry unused allocation" so the months in between build up what the payment month needs.
- Untick an expense to leave it out of the plan.
Saved as the optional `settings.passivePlan.expense` and `.merge`; nothing existing changed. Tests in `tests/passive.test.mjs`.

## Release 8.80.0 – Passive income: grouped bonds, payment order, allocation cards

- **Bonds are grouped** by how they pay: one "Monthly bonds" source and one "Quarterly bonds" source (tap Income settings to see the bonds inside). Allocations saved earlier against a single bond move into its group automatically when read; the saved file is not rewritten until you next change the plan.
- **Payment order**: each expense has a priority (shown as 1, 2, 3 on the board and in a new Payment order list with up and down buttons; saved as the optional `settings.passivePlan.order`). An allocation is now a plan, not a promise. Each month the income that really arrives is used from the top of the order: with 10,000 of interest and rent first at 10,000, rent is paid and the rest is left short; with 40,000 everything is paid and the rest is left over.
- **Actual vs plan** has a new section, "This month's income, used in order", showing what each expense gets and what is left short (income due for the current month, credited for finished months). A red item appears under Needs attention when a month's income will not cover every allocation. Nothing is paid out or raised automatically.
- **Allocations tab** shows Passive income, Allocated, Unallocated and Unmapped expenses as cards.
- Dragging an income dot near the top or bottom of the screen scrolls the page, so an expense off screen can be reached.
- Tests added to `tests/passive.test.mjs`.

## Release 8.79.0 – Passive income planner

A new page, **Spend & plan → Passive income** (`#/passive`), to fund the household's expenses from passive income and keep the salary invested. It reads data the app already has and saves only the owner's plan in one optional field, `settings.passivePlan` (older files work without it; nothing was renamed or removed).

- **Overview**: passive income, monthly expenses, coverage ring (green at 100%, amber from 50%, red below), unmapped expenses; a read-only picture of the allocations; income vs expenses trend; a "needs attention" list; the goal and the extra income still needed; salary protection.
- **Allocations**: income sources on the left (each bond, each interest income line, and any other income you add), expense categories on the right, a curved connection with its amount between them. Drag an income dot onto an expense, or tap an income and then an expense (works the same on a phone). An amount sheet opens; one income can pay several expenses and several incomes can pay one expense. The amount cannot go above what the income has left (Save is blocked with a message). Tap a connection's amount to change or remove it. Unmapped expenses are red, part-funded amber, funded green. A Connections list repeats every link with an Edit button.
- **Income frequency**: bonds follow their own payout; an interest income line can be set to monthly, quarterly, half-yearly or yearly and is divided to a monthly planning figure; extra income can be added with an optional bank-description match so its credits are counted as actually received.
- **Actual vs plan**: per month and category, what was set aside, spent, left, over and the percent used; expenses with no income set aside can be assigned in one tap; income expected vs credited, with late interest marked; unused allocation can carry to the next month (a switch, on by default).
- **Progress**: coverage by month against the 100% target, the extra income needed, and a month by month table including salary used.
- Salary is never part of the funding pool. It shows salary, invested, and how much of the month's spending had to be paid from salary because passive income (plus any carried reserve) did not cover it.
- Nothing raises a budget by itself; allocations change only when the owner changes them.
- Tests: `tests/passive.test.mjs`.

## Release 8.78.0 – Chart: crosshair cursor, drag any line, keyboard controls

- The chart cursor is a crosshair (plus) everywhere over the plot, so prices are easy to read; it turns into the grabbing hand only while you drag.
- With a mouse you can now press a line and drag it straight away; it no longer has to be selected first (before, dragging an unselected line only moved the chart, which looked like the line "moving back"). Phones still select with a tap first, so scrolling is not disturbed.
- Keyboard (click the chart or Tab to it): with a trendline selected, arrows nudge it (Left/Right = one bar, Up/Down = price; Shift = 5x), Delete or Backspace removes it, Ctrl+C / Ctrl+V copy and paste it, Ctrl+Z (or Ctrl+U) undoes line moves, deletes, pastes and new lines, Esc deselects. With no line selected the arrows move the chart, Shift moves it further, + and - zoom, 0 or Home resets.
- The keyboard stays on the chart after each save. No stored fields changed.

## Release 8.77.0 – Secured/unsecured bonds, full view fix, fund buys on the chart, Home and certificate changes

- **Bonds:** each bond can be marked Secured or Unsecured (optional new field `security`; bonds without it show as "Not set"). It shows under the bond's name, and the second bond chart has a "By company / Secured vs unsecured" switch.
- **Full view (desktop):** the browser's full screen is now taken by the whole page, not the chart card, so dropping or moving a trendline (which rebuilds the page) no longer ends it. It stays until you close it.
- **Mutual fund chart:** your buys, SIPs and sells are marked on the NAV chart (▲ buy, ▼ sell).
- **Home, This month in detail:** opens on Expenses. On wide screens Income and Expenses show together (income under the summary, expenses beside it) so there is no empty space; phones keep the two tabs.
- **Interest certificate:** new "Next month" period. A period wholly in the future switches projections on by itself. EPF and PPF now project forward month by month from today's balance and the declared rate (EPF: the latest declared rate and the usual monthly contribution; PPF: no new deposits assumed). Tests: `tests/certproject.test.mjs`.
- **Month in detail, "year, month by month":** the small bar with the limit line is gone; each box keeps its colour and percentage.
- **Hide figures:** off by default. The Net worth card on Home has its own eye next to its title and starts hidden (amounts only; percentages stay visible). Changing the header eye sets the card to match.
- Presentation, charts and projections only. No stored data is changed; `security` is an optional field.

## Release 8.76.2 – Home net-worth chart: asset lines no longer show 0 on days with a saved reading

- The daily readings saved by the app already hold the four lines (shares & funds, debt & fixed income, gold, others & cash). The chart ran them through the class grouping a second time, which sent shares and debt into "Others & cash": those two showed 0 on days with a saved reading and Others & cash showed their sum, while Gold (the only name that matched) looked right. Today's point was built differently, so it looked correct, hence the jumps.
- Fixed when reading the readings; stored readings are not changed, so past days correct themselves. Test: `tests/classpoints.test.mjs`.

## Release 8.76.1 – Cash tab on phones: one-tap button, search inside Filter

- Phones only (desktop unchanged): the floating button is now one tap with no menu. On Accounts it shows the transfer icon and opens Transfer; on Transactions it opens the Add form directly (red on Expenses, blue on Investments, green on Income and All).
- The Transactions search box moved into the Filter sheet (Search field, with a chip showing the active search). Links from other screens that open the list with a search still work.
- Presentation only; no stored data changed.

## Release 8.76.0 – Cash tab on phones: floating add button

- Phones only (desktop is unchanged): a floating round button at the bottom right of Cash → Accounts and Transactions. It is red on Expenses, blue on Investments, green on Income and All, and opens the matching Add form (Add expense, Add investment, Add income, Add transaction). Tapping it also offers Transfer and Import bank file, all the same size. The old top Transfer / Add transaction buttons are hidden on phones.
- The "Transactions" and "Bank accounts & cash" card titles are hidden on phones (the tabs say where you are); the white card stays. "Add account" is a dashed tile under the account list.
- Savings summary cards: "Worth today" and "Expected at the end" removed (provident funds keep "Interest in a year").
- Presentation only; no stored data changed.

## Release 8.75.3 – Gold XIRR uses the real payment dates of closed chits

- Gold from a closed chit or scheme is stored as one purchase dated the day it closed, so the gold return treated all that money as paid in on that one day. That made the money look held for a short time and the annual return very high. The return now uses the chit's own monthly payment dates (and any extra paid at closing). Stored data is not changed.
- Test: `tests/goldchitxirr.test.mjs <data.json>`.

## Release 8.75.2 – Gold XIRR no longer inflated by running gold chits

- The gold value counts money paid into running gold chits at cost, but the gold return's cash flows left those payments out, so that money looked like free value and pushed Gold's XIRR (and the overall XIRR) up. The chit payments are now included as money paid in on their own dates.
- Calculation fix only; no stored data changed. Test: `tests/goldchitxirr.test.mjs <data.json>`.
- Checked and unchanged: bond and private-lending monthly interest is counted as money received each month; the overall figure is one money-weighted XIRR over all dated flows (so long-held EPF weighs more than its share of today's value).

## Release 8.75.1 – Easier to change a trendline's angle

- The round end handles of a selected trendline are bigger on a touch screen (with a soft ring showing the grab area), and the area that grabs an end is wider, so a finger can drag one end to change the angle instead of moving the whole line.
- Desktop is unchanged apart from slightly larger handles. Presentation and touch handling only; no stored data changed.

## Release 8.75.0 – Usual-spending marks on Income & expenses and Month in detail

- Income & expenses, "Where the money went" (category view, spans of a month or less): each bar has a tick at your usual amount for the same span (median of earlier months) and is green, amber or red against it.
- Month in detail, "Where it went" (single month): same ticks and colours, compared with usual by the same day for the current month.
- Presentation only. No stored data or calculations changed. Multi-month spans get no marks.

## Release 8.74.0 – Home expense bars show your usual spending

On Home, under This month in detail, the Expenses bars now carry a tick at what that line usually is and are coloured by how the month compares. Nothing stored changes and no figure is changed.

- **The tick** is the usual amount for the line: the middle value of your last 6 months measured to the same day (this month) or the whole month (a finished month), from the same history as the pace chip (`usualPace` in `js/spendpace.js`).
- **Colour** (`lineTone`): under 85% of the usual = green, 85–115% (close, or just over) = amber, above 115% = red. A line you spend on that is not usual in most months (travel, medical) is red and has no tick. With fewer than two earlier months of bank entries the bars stay as they were. A small ▼ ≈ ▲ after the amount says the same for anyone who cannot tell the colours apart, and tapping or hovering a row gives the usual amount.
- A one-line key sits under the bars. `hbars` in `js/charts.js` takes optional `mark`, `tone` and `note` per row; other charts are unchanged.

## Release 8.73.0 – Home: "This month in detail" card redesigned (same content, less text)

Presentation only: every figure, tap and dialog works as before; nothing stored changes.

- **Summary on top:** "Left to spend" (or "Over budget by") as the big number, one bar for spent against the budget with a tick where you usually are by this day, then Received, To receive and Month end in one row. The old long pace paragraph is now a single chip ("₹X ahead of usual pace" or "On your usual pace") with **By line ›**; the full sentence moved into that dialog.
- **Income and Expenses as two tabs** under the summary (on a phone one list at a time; on a wide screen the summary sits beside the lists). Income keeps the per-source rows (tap for each bond, payment or to mark received), the due-to-you list and the "not in the bank yet" rows. Expenses keeps the category bars (tap to see what a category is made of) and **See where it went**.
- **Other payments** is one line ("₹X other payments not counted · Review ›"). The month picker is unchanged. The tab you pick is kept while you stay on the app.
- Built on 8.72.0 (heat map); cache v165.

## Release 8.72.0 – Month in detail: monthly spending heat map redesigned

Only how the months look changed. The limit, the spending that counts, the status levels and pills, every table and chart and all stored data are exactly as before.

- **Six colour bands** by the share of the limit used: under 60% green, 60–80% light green, 80–100% amber, 100–120% light orange, 120–160% red, above 160% deep red. A month exactly on a boundary takes the lower band. Colours are in `css/app.css` (`.hz-g … .hz-d`), separately for light and dark; `tests/monthdetail.test.mjs` checks the text on each colour against 4.5:1 contrast.
- **Month tiles:** month, share used, and a thin meter (full width = 160%, with a tick at the 100% limit). The current month has a ring and a "now" tag; the selected month is scaled up with a heavy outline; months with no bank entries are dashed and greyed. Tiles have a full spoken label for screen readers.
- **Colour key:** one six-part bar with the thresholds under it and a name for each band.
- **Monthly insight:** one short line that changes with the month in focus (the chosen month, or the latest month when looking at a whole period), e.g. "Nov: 53% of the limit used so far, lower than your usual 160%. ₹X still within the limit." The current month says "so far"; "usual" is the average of the earlier months of the year that have a limit. When a whole period is shown, tap the line to open that month (`monthInsight` and `bandOf` in `js/monthdetail.js`, no stored data).

## Release 8.71.3 – Android app: find the app's plugins when the page has no registerPlugin

- The landscape button said "no registerPlugin": in the installed app the page has `Capacitor.isNativePlatform()` but no `Capacitor.registerPlugin` (the page has no bundler, so Capacitor's own script is not loaded). The native side still lists every plugin, with its methods, on `Capacitor.Plugins`.
- The lookup in `js/native.js` now uses `registerPlugin` when it exists (as before) and otherwise `Capacitor.Plugins.<name>`. This is what the landscape button needed; it also means the other native features (status bar colour, reminders, back button, PDF share) find their plugins in such a build. Listener calls are guarded in case a plugin object has no `addListener`.
- Landscape still needs an APK that includes the 8.67.0+ `NativeToolsPlugin.java` (fixed landscape); if the APK is older the button says so.

## Release 8.71.2 – Landscape button: say exactly what the app build is missing

- The landscape button reported "works only in the Android app" in an app that is the Android app. The lookup of the app's own plugin (`NativeTools`) came back empty and the page could not say why.
- The lookup now also accepts a plugin Capacitor already registered, and when it still fails the message carries the reason in brackets (no Capacitor in the page, Capacitor's platform name, or the registerPlugin error), so the build can be fixed without guessing.

## Release 8.71.1 – Landscape button: the real reason it fails on an older APK, said plainly

- The message "This is not the Android app" was wrong. An APK built before 8.67.0 does have the app's own plugin, but not the screen-turn method, so Capacitor gives the page no such function and the old check mistook that for "not Android".
- Now the button says that the installed app was built before the screen-turn feature and needs a new APK (build from the latest code, Android Studio: Build > Build APK, or the usual build steps in this guide). It also tries the browser's own screen lock first, in case that works in the build.
- The screen turn itself (fixed landscape) needs the APK to include `NativeToolsPlugin.java` from 8.67.0 or newer; nothing in the web app can replace that.

## Release 8.71.0 – Line options back as a corner popup; chart stays put on refresh; Home usual spending pace

- **Line options are a small popup in the top-left corner of the chart:** drawing or tapping a line only selects it. The popup (colour, alert, lock, delete) opens when you press the new **Line options** button next to Trendline, or right-click (long-press on a phone) a line. It overlays the chart, so opening it never pushes the chart down; ✕ closes it and keeps the line selected.
- **Chart no longer shifts on a refresh:** the page scroll position is held while a rebuilt page fills in (it used to jump back up), and a price range you dragged on the price axis is remembered with the zoom.
- **Home, This month in detail: a usual pace instead of a flat one** (`js/spendpace.js`, test `tests/spendpace.test.mjs`). The old note compared spending with budget × day ÷ days in the month, which ignores that rent and bills come early. Now each spending line is compared with what you usually had paid by the same day in your last 6 months (the middle value): rent shows as an early bill, groceries and food as steady, and a line seen in fewer than half of the months (medical, travel) as a one-off that is not expected. The note says how far ahead of the usual pace you are, names the lines that explain it, and gives a month-end estimate (spent so far plus what a line usually still adds); **See by line** lists each line. With fewer than two earlier months of bank entries it falls back to the old even pace. Reads the bank entries only; nothing is stored.

## Release 8.70.0 – Chart: trendline tool and full view survive background refreshes; line options on demand; lines can be locked, and moves undone

- **Why full view and drawing were cancelled:** every sync (a save finishing, a refresh) rebuilds the whole page, which forgot the Trendline tool and the first point of a half-drawn line. The tool and the first point are now kept per chart (`mm.tool`, `mm.pend`) and handed to the rebuilt chart, and full view stays open (8.69.0 handoff).
- **Phone full view uses the blank space:** the chart height is worked out from what the card really needs (controls folded or open), so it fills the screen instead of leaving about 190 px empty.
- **No accidental moves:** only the selected line can be dragged, so pressing an unselected line just pans the chart and a tap selects it. Dragging needs a bigger movement first (10 px touch / 6 px mouse for the line, 6 / 4 for its ends). **🔒 Lock** in the box locks one line (optional `locked` field on the line, nothing else changes); **Lock lines** in the toolbar locks all lines on this device. A locked line shows a small lock.
- **Undo:** after moving a line, "Line moved" and after saving a new one, "Trendline saved", the message has an **Undo** button for six seconds.
- **Landscape button (Android app):** the app now forces fixed landscape (not the sensor-dependent kind), tries the browser's own screen lock when the native call is missing, and tells you plainly if the screen did not turn (an APK built before 8.67.0 has no native part: rebuild and install it; the Java file changed again in this release).
- No stored data changes: `locked` is an optional field that older lines work without.

## Release 8.69.0 – Chart: time-axis zoom around the pointer; full view and landscape survive a page rebuild

- **Dragging the time axis** (the dates under the chart) now zooms around the point you pressed on, like dragging the price axis zooms the price: the bars under the pointer stay where they are and the rest stretches around them. Before, it always zoomed toward the newest bar, so older parts could not be studied that way. Double-click the axis to undo.
- **Full view stays open when the page is rebuilt** (every save, refresh or price update rebuilds the page, which used to close the full view, and in the Android app turned the screen back to portrait a moment after the landscape button). The new card of the same chart takes the full view and the landscape turn over; leaving the page gives the screen back to the phone.
- **Landscape button, Android app**: if the installed app is older than 8.67.0 (no native `setOrientation`), the button now says so ("Build and install the latest APK") instead of doing nothing.
- No stored-data changes.

## Release 8.68.0 – Home and Net worth charts: y axis that fits the lines

- The ₹ amount charts on **Home** (Net worth over time, all asset lines) and on **Net worth over time** started at an odd value and ran up to the next power of ten (a week of gold moving from 54.7 to 57 lakh was drawn along the bottom of a 54.7L to 1Cr axis). New `js/axis.js` picks round tick values with equal gaps (1, 2, 2.5 or 5 times a power of ten, 4 to 6 gaps) that hug the data with a little room, never below zero for data above zero. The same gold week now reads 54L, 55L, 56L, 57L, 58L. `lineChart` takes a `ticks` option for this. The Growth % view is unchanged. Test: `tests/axis.test.mjs`.
- No stored-data changes.

## Release 8.67.0 – Volume tag, and landscape chart in the Android app

- **Volume tag**: touching or hovering shows the volume as a tag above its bar, inside the volume panel, like the P/E tag. It is no longer in the line of figures below the chart.
- **Landscape in the Android app**: in the chart's full view there is a new screen-turn button next to the close button (Android app only). It turns the screen to landscape even when the phone's auto-rotate is off, and back to the phone's normal behaviour when you press it again or close the full view. In landscape the panels are lower and the title strip is one thin line, so the whole chart fits without scrolling. **This needs the new APK** (a small native addition, `setOrientation` in `NativeToolsPlugin.java`); the web version is unchanged. In the Android app the full view no longer asks the browser for its own fullscreen (it would end when the screen turns).
- Chart controls fold on a phone held either way (the test is the shorter side of the screen).
- No stored-data changes.

## Release 8.66.0 – Chart: movable trendline toolbar, up-and-down drag, P/E tag, folded controls on phones

- **Trendline toolbar** (colours, alert, delete) has a "⠿ Move" grip: drag it anywhere over the chart. The place is remembered for the next line you select.
- **Dragging the chart** now also moves it up and down (the price range follows the pointer, limited to one data-height beyond the data). A sideways-only drag keeps the price scale fitting itself. Reset, or double-clicking the price axis, brings it back. On a phone the chart must be zoomed (+ or pinch) first, so that swiping an un-zoomed chart still scrolls the page.
- **P/E tag**: touching or hovering shows the P/E as a tag right on the P/E line, inside the P/E panel; it is no longer in the line of figures below the chart (open, high, low, close, volume and the averages stay there).
- **Phones**: the chart controls start folded into one "Chart controls · 1Y · Line" button (also in full view); tap it to open them. The choice is remembered on the phone. Desktop is unchanged.
- App only; no stored-data changes.

## Release 8.65.0 – Index P/E: Android app only, nothing on the Google backend

- Reading the index P/E through the Google backend never worked (NSE does not answer Google's servers), so **all of it is removed from `backend/Code.gs`** (`indexpe`, `indexpeyear`, `indexpedates`). Nothing runs there for this any more.
- **Browser / web app**: no P/E line for indexes (the toggle is hidden). Share P/E is unchanged.
- **Android app**: the phone reads NSE's daily "all indices" closing file itself (Capacitor's native HTTP, so no browser restrictions and no Google servers): the last trading day of each month for 10 years plus every Friday of the last four months, holidays retried on the day before. The readings are kept on the phone (`localStorage` key `pt.ipe`, not in your data file), so after the first load only new days are fetched. If NSE refuses, the message names the answers received. Not testable from the build machine: check one index in the Android app. The browser version can get an index P/E later by another route.
- No stored-data changes.

## Release 8.64.0 – Index P/E from NSE's daily closing file

- **Why the index P/E never loaded**: it came from niftyindices.com, which NSE protects with a browser check that Apps Script (Google's servers) cannot pass, so the calls just hung. That code (`indexpe`, `indexpeyear`) is removed.
- **New source**: NSE's daily "all indices" closing file (`nsearchives.nseindia.com/content/indices/ind_close_all_DDMMYYYY.csv`), which lists P/E, P/B and dividend yield for every index. The backend action `indexpedates` reads the file for up to 40 days per call and returns that index's P/E; the app asks for the last trading day of each month for 10 years plus every Friday of the last four months (about 134 days, three calls at a time), retries holidays on the day before, and joins the readings into the line. The reply includes the HTTP status counts, so a block shows as a message such as "the archive answered: 403 ×134".
- **Redeploy `Code.gs`** (new version). Not testable from the build machine (NSE is blocked there), so check one index after deploying. No stored-data changes.

## Release 8.63.0 – Index P/E asked year by year, with a reason when NSE does not answer

- The one big "indexpe" call (ten years in one Apps Script run) was being cancelled at the app's wait limit with no reason shown. The backend has a new **`indexpeyear`** action: one calendar year per call, cookie kept for 15 minutes, each year kept 6 hours (this year 1 hour), and every reply carries how long NSE took and at which step it failed.
- The app asks this year first, alone (gives up after 40 s and shows the reason), then the other years three at a time. A year that fails is skipped; a partial chart is shown but not kept, so the next load asks again for the missing years. Still one call per index at a time (8.62.0).
- **Redeploy `Code.gs`** (new version) — the app needs the new action. The old `indexpe` action stays for older apps. No stored-data changes.
- If it still fails, the message under the chart now names the step and status (for example "NSE index site answered 403"), which tells whether NSE is blocking Google's servers.

## Release 8.62.0 – One index P/E call at a time

- **Duplicate index P/E calls**: every chart on the page, the full view, each redraw and each Reload/Try again started its own backend call, and each runs a full Apps Script run against NSE's slow site. `stockIndexPe` now keeps one call per index in flight (everything else joins it), remembers a failure until you press Try again or Reload chart, and keeps a finished result until you reload.
- The failure message now says NSE's site did not answer in 2 minutes. No stored-data changes; the app only.

## Release 8.61.0 – Index P/E loads faster

- **Why index P/E failed while stock P/E worked**: the index P/E comes from NSE's index site (niftyindices.com), asked one year at a time for 10 years, one after another. That site is slow, so the total went past the app's 45-second wait ("took too long"). A stock's P/E is a single small request.
- `backend/Code.gs` `indexPe_` now sends all years at once and keeps the result for 6 hours (the readings change once a day), so repeat loads are instant. The app waits up to 120 seconds for this one call and words a timeout as an NSE-site slowness message. **Redeploy `Code.gs`** (new version) for the speed-up. No stored-data changes.

## Release 8.60.0 – Sold-price status and ratio fallback

- **Sold shares**: each row shows the day its price was fetched, or why none was found ("no price: …"); the note and button wording now match "Refresh sold prices".
- **"Not found" next to a price that updated** (e.g. Lalithaa): the P/E and 52-week feed does not know every share although the price feed does. `backend/Code.gs` `fundamentals_` now falls back to the price feed (price, 52-week range), and the app words the leftover case as "price updated, but P/E and other ratios are not available". **Redeploy `Code.gs`** (new version) for the fallback.
- Removed a duplicated "needs the backend" message in the holdings refresh. No stored-data changes.

## Release 8.59.0 – Asset performance on Home, sold-price refresh, savings summaries

- **Home › Net worth over time** now compares net worth with four asset lines: Shares & funds, Debt & fixed income, Gold, Others & cash. Filter chips show each alone (with highest, lowest and share of assets); "Moved the most" names the biggest mover. Growth % (default) indexes every line to 0% at the start of the period; Amount ₹ shows real values.
- Recording: each daily reading now also saves an optional `cls` (the four values). Older months fill from month-end check-ins that saved classes; lines build up from today. New money counts in the lines (contributions are not stripped out). Old records work unchanged.
- **Shares & funds › History › Sold shares**: separate "Refresh sold prices" button (owner, needs the backend). The holdings refresh no longer fetches sold symbols.
- **Savings**: Chits, PF and RDs tabs show a summary card of interest earned so far on open holdings (estimate at the assumed rate; for PF, credited interest plus accrual since the last credit). Closed tab shows actual results, with an "Actual results by kind" table.
- New files `js/classes.js`, `js/savingsummary.js` (in `sw.js` FILES); test `tests/savingsummary.test.mjs`.

## Release 8.58.0 – White full-view charts

- Chart full view now has a **white background** (dark surface in dark mode) instead of grey, and the toolbar sits flat on it with a thin line underneath. No other changes; no data changes.

## Release 8.57.0 – Manage tab order

- Shares & funds › Manage now reads **Insights** (opens first), **Alerts**, **Investment planner**, **Import**. Family members who only view see Insights and Alerts. No data changes.

## Release 8.56.0 – Pan past the ends of the chart

- You can now drag (or scroll sideways) past either end of a chart into **empty space**, up to half a screen, so the **last or first candle can sit in the middle** while you analyse it. The grid, month labels and the last-price line carry on into the empty part, and trendlines can be drawn there too.
- **Reset** brings the chart back to the full range. Nothing else changes; no data changes.

## Release 8.55.0 – Terminal-style charts, text-only buttons

- **Charts** look like a trading terminal: light grid lines on round prices (every second line bold) and vertical lines at years, quarters and months (Mondays on short ranges); the **price axis is on the right**; a filled **last-price tag** with a dotted line across; **High** and **Low** tags for what is on screen; hovering or touching shows an outlined **price tag** on the axis and a dark **date tag** on the time axis. Candles and volume use teal and red. Dark theme gets its own grid and tag colours. Zoom, pan, axis drag, trendlines and full view work as before (the price-axis drag zone moved to the right).
- **Buttons are words only** across the app (no icons beside Buy, Sell, Refresh, Add, Edit and so on). Pure icon controls such as full view stay.
- **Watchlist rows** keep only **Edit** (Buy removed; trade from the share's page or Holdings).
- **Index P/E**: the backend now opens NSE's page first to get its session cookie (the data call needs it), tries both site addresses and reports what the site answered when there is nothing. Redeploy `backend/Code.gs`. If the chart still shows a message, a **Try again** button sits beside it. Indexes you add by name now get a P/E toggle too.
- No data changes.

## Release 8.54.0 – Chart colours

- New **Colours** button in the chart toolbar (share, index and fund charts, also in full view). It opens a panel with a swatch row and a colour picker for each line: 50-day, 200-day, P/E (or the fund's rolling return), **Median P/E** (now its own colour instead of sharing the P/E colour), and your average cost. **Reset to default** puts them all back.
- Cleaner defaults: blue 50d, orange 200d, purple P/E, pink median, dark-gold average cost. Choices are kept on this device only (`fw.chartcolors`), not in your data.
- Trendline colours are unchanged: the six-colour palette stays, choose per line when you draw it or tap it.
- New file `js/chartcolors.js`.

## Release 8.53.0 – Watchlists tab, tidier Manage, full-view charts

- **Shares & funds tabs** are now Overview, Holdings, **Watchlists**, Manage, History. Watchlists moved out of Manage to sit next to Holdings. The separate **Watch** tab is gone.
- **Manage** now holds **Alerts** and **Insights** (moved from Watch) next to the Investment planner and Import. Family members who only view see Manage with Alerts and Insights; the planner and Import show for the owner only. Old links (`#/equity/watch…`, `manage?v=watchlists`) redirect to the new places.
- **Full view** for charts: an expand icon at the top right of a share or index chart and of the fund NAV chart. It fills the screen, puts all the chart controls (range, line/%/candles, bars, lines, zoom, trendline, colours, fund rolling window) in a toolbar along the top and sizes the chart to the screen, on phone and desktop. Esc or the close icon returns. Trendlines, zoom and alerts all work inside it.
- No data changes. One new file, `js/fullview.js`.

## Release 8.52.0 – Trendline alerts

- **Tap a trendline** on a share's chart: a small toolbar opens beside it with six colours, **Set alert** and **Delete**. The line can still be dragged to move or reshape.
- **Alert on a line**: tell me when a **day, week or month candle closes above or below** the line. The line carries on past its end points. A candle counts once it is finished (a day after the market closes at 3:30 pm, a week after Friday, a month after its last day) and the alert fires when a candle closes on the far side having been on the near side the candle before, within the last three candles (and after the alert was set), so an alert on a price that is already above the line does not fire at once.
- Trendline alerts sit with the other **price alerts**: Shares & funds › Manage › Alerts, the share's own page, the Overview, and the Home **Action centre** ("Trendline alert: name"). They are checked when you press Refresh, when Home or the Watch pages open (at most every 20 minutes), and right after you set one. This needs the backend's price history (candles).
- Deleting a line removes its alerts. Alerts are stored in the existing alert list with optional fields (`lineId`, `dir`, `tf`, `created`); no migration. Lines exist on shares and indexes only; funds have no trendlines yet.

## Release 8.51.0 – Bonds summary, chart upgrades, watchlist table, rolling returns

- **Bonds**: the month cards are merged into one short card (**Due in <month>**: received and still to come in its line) and a new **Earning a month** card shows the average monthly interest after TDS, with quarterly and yearly bonds spread evenly over the months. "Receivable today" is removed.
- **P/E chart**: a dashed **median P/E** line for the range shown. **Nifty 50** and the other NSE indexes now have an **Index P/E** line (needs the new backend `indexpe` action, which reads NSE's index site).
- **Zoom with the axes**: drag the month labels sideways to stretch time, drag the price labels up or down to stretch the price scale; double-click an axis to undo. Wheel, pinch and the buttons still work, and Reset zoom restores both.
- **Desktop controls** use both sides: ranges and chart type on the left, line toggles and zoom/trendline tools on the right.
- **Trendline colours**: six colours; pick one before drawing, or select a line and tap a colour to change it. Stored as an optional `color` on each line.
- **Watchlists** are now a table: share, price and day change, day range, 52-week bar with distance from the high, P/E and market cap, target price and distance, note, Edit and Buy. Phones show cards. Edit sets an optional target and note on the item. Search stays on top.
- **Mutual funds**: the NAV chart now has **rolling returns** (1, 3 or 5 years, yearly rate) in a panel under it with the median line, plus median, average, best, worst and share of positive periods.
- **Redeploy `backend/Code.gs`** (index P/E, day range). The NSE index endpoint and the Yahoo day range could not be tested from here.

## Release 8.50.0 – Tidier chart controls

- The controls above the share chart are regrouped: time range strip (scrolls sideways on phones), then Line / % / Candles with the bar size (Auto, Day, Week, Month), then the 50d, 200d and P/E toggles, then zoom and trendline tools. Same functions, no data changes.

## Release 8.49.0 – Adjustable trendlines

- Tap a trendline to select it (round handles appear at both ends). Drag the line to move it, or drag a handle to change that end. The change is saved when you let go. Candle charts snap an end to a nearby high, low, open or close. Delete line still removes the selected one.
- While a line is selected the chart does not scroll the page on touch screens; tap empty chart to deselect. No stored fields changed.

## Release 8.48.0 – Watch from the share page, search before you add

- **☆ Watch / ★ Watching** button on every share and index page (next to Reload chart). With one watchlist a tap adds or removes; with several (or none yet) a small sheet lets you tick the lists or name a new one.
- **Search first**: Manage › Watchlists has a search box (your holdings, listed shares, indexes, or any NSE symbol). It opens the share's page so you can look at the chart and figures before deciding to watch it.
- Adding straight from a list (Add a share, Add an index) still works. No stored fields changed.

## Release 8.47.0 – Chart tools: zoom, trendlines, candle size; watchlist details

- **Shares & funds overview**: the Shares, ETFs and Funds tiles under Today now open that group in Holdings. The Shares / ETFs / Funds switch below them still only changes the gainers and fallers list.
- **Candle size**: Auto / Day / Week / Month under the ranges; one bar (candle or line point) is then one day, week or month. The 50 and 200-day averages and P/E follow the bars.
- **Zoom and move**: mouse wheel or pinch zooms, drag moves, − / + / Reset zoom buttons. The price scale follows what is on screen.
- **Trendlines**: owner taps Trendline, then two points (candles snap to a nearby high, low, open or close). Lines are saved per share in the data file as an optional `trendlines` field (older files simply have none), shown to family viewers too, tap a line to select and Delete. Hidden in % change view.
- **Colours**: 50d blue, 200d orange, P/E purple, your average cost grey dashed, trendlines cyan.
- **Watchlist rows** now also show P/E, market cap, dividend yield, above/below 200-day average, and the 52-week range with where the price sits and the distance from the high (after Refresh prices).

## Release 8.46.0 – Bond interest this month: due, received, pending

- Bonds page now shows **Interest due in <month>** (after TDS; quarterly bonds count in the months they pay), split into **Received so far** (due day has come) and **Still to come**, plus **Receivable today**: interest earned since each bond's last payment day that has not been paid yet.
- Received means the due day has passed, by each bond's due-date rule; it does not read the bank ledger. No stored fields changed.

## Release 8.45.0 – Stock terminal, historical P/E, indexes

- **Terminal-style share page** (held shares and watchlist shares): price chart with ranges 1M–5Y and "Since my first buy", Line / % change / Candles, volume, buy/sell markers and your dashed gold average-cost line, performance chips (1W–3Y), a much bigger Key figures grid (day and 52-week range, volume, market cap, P/E, forward P/E, P/B, EPS, dividend yield, margins, growth, debt, revenue, free cash flow, analyst target) and a business description.
- **50-day, 200-day and historical P/E** lines, each with an on/off chip (remembered). P/E is drawn in its own panel under the price from trailing-twelve-month EPS, using each result only after it was reported.
- **Indexes on watchlists**: Manage › Watchlists › Add an index (Nifty 50, Sensex, Bank, Next 50, 500, Midcap, Smallcap 100/250, sector indexes, India VIX) or type any Yahoo symbol. Index pages show the chart and price figures only.
- **Redeploy `backend/Code.gs`** (new `eps` action and richer `details`). Until you do, the chart shows closing prices only and says so. No stored fields changed; indexes just carry an optional `index` flag.
- Yahoo's free EPS history may cover only a few years, and some index symbols may need correcting. A wrong symbol shows "no price" on refresh.

## Release 8.44.0 – Transfer fix, desktop pop-ups, bulk entry, search

- **Fixed:** the Amount box was missing from Cash & banks › Transfer (it was dropped by mistake in 8.41.0). It is back, next to Date.
- **Pop-ups on desktop** now fit the window: one scroll area only (inside the form), no sideways scroll, a little wider, and the buttons never wrap their words. Delete and the extra actions (Payout schedule, Part-close, Close it, Split) sit on the left; Cancel and Save on the right.
- **Side bar** is wider and grows with the text size, so there is no sideways scroll even at the largest text size. "Family Wealth" stays on one line and the logo grows with the text.
- **Gold chits › Take it by gold saved** now shows the average gold price you paid per gram. "Profit over what you paid" is unchanged.
- **Description type-ahead** in Add income / Add expense: start typing, Tab fills the first match (arrows and Enter also pick) and the category fills in by itself.
- **Income & expenses › Add many:** add several income and expense lines in one go. Each line has type, date, account, description (with Tab to fill), category and amount. A new line starts with the previous line's type, date and account and the cursor goes straight to the description; if the category is known the cursor goes to the amount, if not the category list opens. Enter after the amount starts the next line. Works on phones too (each line becomes a card).
- **Fixed income › Bonds, FDs and Lending:** a Find box (right of the filters on desktop, inside Filter on phones) searches every word written on a record: name, company, holder, platform, account and more.

## Release 8.43.0 – Overview cards and lists open the right page

- **Shares & funds › Overview:** the "What you hold" cards open Holdings with that filter already set (Shares, ETFs or Mutual funds). The "All together" card under Today opens all holdings.
- **Biggest gains and falls:** tap a row to open that share, ETF or fund page.
- **Where to look** lists (near highs, lows, cheap and so on) already opened holdings; shares that are only on a watchlist now open their chart page too.
- The Shares / ETFs / Funds cards in the Today strip still switch the lists below them; they do not leave the page.
- No data changes.

## Release 8.42.0 – Cleaner Transactions grid (Cash & banks)

- Removed the alternate-row green shading and the coloured left border on every transaction row (table and phone cards), and the coloured border and tint on the summary tiles above the list.
- The icon, category and amount of each entry now follow one rule: **expense red, income green, investment blue**; transfers between your own accounts stay grey. An entry with no category is red when money goes out and green when it comes in.
- Nothing else changed; no data is touched.

## Release 8.41.0 – Quicker data entry

- **Expense / Income** switch (with down and up arrow icons) replaces "Paid out / Received", and it is the first thing on the transaction screen.
- **Amount and Date sit on one row**, so the screen is shorter. Every other entry screen now also puts short fields side by side automatically (amount with rate, date with date, short lists and short text) — long fields, notes and anything with a long hint keep a full row.
- **The cursor moves on by itself when you add something new.** Type an amount and pause for a second: the calendar opens. Pick the date: the cursor goes to the next field. Choosing from a list also moves on. Editing an existing entry never jumps, so you can fix a digit safely.
- Nothing changes in what is saved.

## Release 8.40.0 – Modern data-entry screens

- Every add / edit screen (transactions, transfers, bonds, FDs and lending, chits, savings, EPF, insurance, shares and funds, gold and jewellery, loans, plan and what-if items, alerts and the rest) shares one new look. This is a visual change only; fields, rules and saving are the same.
- A coloured header with an icon: **red for money going out, green for money coming in, blue for investments**, the app green for everything else. On the transaction screen the colour follows the Paid out / Received switch.
- Two or three short choices (for example Paid out / Received) are now tap buttons instead of a dropdown. Longer lists stay as dropdowns.
- Bigger, rounder fields with icons (account, date, rupee, rate) and a large amount box. The Paid out / Received switch is now the first field of the transaction screen.
- The main button is one wide, coloured button; Cancel is quiet and Delete sits on the left in red. On phones the screen is a bottom sheet with a grab handle.
- Works in light and dark mode. No data or stored fields changed.

## Release 8.39.0 – Alerts on share and fund pages; Watchlists

- **Alerts on the share and fund pages.** Every share and fund you hold now has an Alerts card with Add, Change and Remove. It is the same list as Shares & funds › Watch › Alerts & watchlist, so an alert set in either place shows in both.
- **Manage › Watchlists.** Make your own lists of shares (by NSE symbol), rename or delete them, and add or remove shares. Tap a share to open its page with a **candlestick chart** (1M to Max, with volume), key figures, its alerts, and which lists it is on. You can set alerts on a listed share too.
- **Refresh prices** on the Watchlists page fetches prices for the listed shares only. The main Refresh no longer includes shares that are only on these lists.
- **Update `backend/Code.gs`.** Candles need the newer script: paste it into Apps Script and deploy a new version of the same web app. Until then the chart falls back to closing prices with a note.
- Data: adds an optional `watchlists` field. Old files work unchanged. Prices for the lists are kept on each device, not in the data file.

## Release 8.38.1 – Cash calendar: two-digit years, switch to hide empty months

- The year under each month on the Money maturing chart is always two digits ('26, '27), on every range.
- New switch **Show only months with maturities** above the chart: months where nothing matures (after the kind filter) are left out, so the bars are wider and easy to read. Tapping a bar still lists that month. It works together with the period and kind filters; when nothing matures at all the chart says so.
- No stored data changed.

## Release 8.38.0 – Closing with interest makes two bank entries; Cash calendar filters, colours and years

- **Closing a bond, fixed deposit, private lending line or a chit / RD / other saving** that comes back with more than was paid in now makes **two entries** in the bank you pick: the principal as a **transfer** (Investment redemption) and the extra as **interest income** under the holding's own category: your existing "Income FD", "Income Lending", "Income Chit", "Income Bond" (any income category whose name matches), or a new "Income <type>" if you have none. The close form says so. If less than or exactly the amount paid in comes back, there is one transfer entry as before. **Reopen removes both entries.** The second entry's id is stored in a new optional field `closed.interestLedgerId`; closed records from before work as they did. Gold chits (which become a gold purchase) are unchanged.
- **Cash calendar → Money maturing:**
  - Periods now go up to **36 months (3 years) and 60 months (5 years)**.
  - New **kind filter** chips: All, Bonds, Fixed deposits, Private lending, Chits, Recurring deposits, Insurance & other savings. Pick one or several; the chart, total and the month's list follow.
  - **Each kind has its own colour** in the bars, with a key under the chart and a colour dot beside each item in a month's list. (RD maturities are now their own kind instead of "Savings maturity".)
  - The month axis now shows the **year** under each month (2026; "'26" on long ranges, where labels are also thinned so they never overlap).
- Tests: `tests/closesplit.test.mjs`. No other stored data changed.

## Release 8.37.0 – Spending insights: week by week

- **Insights → Spending insights → Week by week** for the chosen month: stacked bars of each week's spending by category, and a table with each week's spend, the usual for that week (the same week averaged over the earlier months), the difference and what it was mostly on.
- A note at the top names the week that ran furthest above usual, what it was mostly spent on and its biggest single payment. Weeks are days 1–7, 8–14, 15–21, 22–28 and the rest. The week under way is not judged until it ends, and weeks to come are shown faded. Loan EMIs and tax are left out. Nothing is stored. Tests added to `tests/spendinsights.test.mjs`.

## Release 8.36.0 – Family report holdings in foldable groups; Spending anomalies becomes Spending insights

- **Family report → All holdings and contact notes:** one foldable group per kind of holding (Bonds, Fixed deposits, Private lending, …) with its count, total and monthly income on the bar. On a phone the groups start closed except the first, and the holdings inside are the same two-line rows as Shares & funds (name and holder on the left, value on the right; tap the right side for monthly income; the contact note sits under the name). Tapping a holding still adds or changes its note. Desktop shows every group open. The printed report is unchanged.
- **Insights → Spending insights** (was Spending anomalies; same address). The old lists stay (higher than usual, new this month, large single payments, usual spending that did not happen) and these are added:
  - **This month so far:** spent so far against what the earlier months had spent by the same day, the likely month total, days left and a daily allowance, with a bar. Only for the month under way.
  - **Regular payments:** descriptions that came back in at least three of the last six months (rent, subscriptions, fees). Shows the usual monthly amount, this month, a status (as usual, price up or down, so far, due around day N, not paid yet) and the yearly cost, with the monthly total at the bottom.
  - **Possible double payments:** the same description and amount twice or more within three days.
- Nothing is stored; all of it is worked out from your transactions. Tests: `tests/spendinsights.test.mjs`.

## Release 8.35.0 – Action centre Alerts: risk limits and price alerts, each opening its screen

- **Risk:** every holding, risk group or kind of holding that is over a limit you set now has its own row in Alerts ("Over risk limit: Navi · single holding at 36%, over by ₹1,50,000"). Tapping it opens **Risk limits**.
- **Price alerts:** each triggered share or fund alert is its own row ("Price alert: AAA Ltd · Price ₹90 is at or below ₹95"), instead of one combined row. Tapping it opens **Shares & funds → Watch → Alerts** (before, it opened the overview).
- They count towards the red bell and "N need attention" on Home, can be hidden until tomorrow with the close icon (Undo works), and clear when the holding is back within its limit or the alert stops being true. No stored data changed.

## Release 8.34.0 – Action centre: matured holdings stay as overdue

- A bond, fixed deposit, private lending line, chit or other saving whose maturity date has passed is **no longer cleared from Action centre**. It moves to **Overdue** ("matured (overdue)", "N days late") and stays there until you **close** the holding or **move its maturity date** (extend). Then it goes by itself.
- Because Overdue now counts these, the bell on Home turns red until you deal with them, or dismiss one with the close icon (Undo still works).
- Wording before the date is unchanged ("matures", "due back"). Phone reminders are unchanged. No stored data changed; closing and extending work as before.
- Test: `tests/overduematurity.test.mjs`.

## Release 8.33.1 – Interest certificate: tidy header, explanations behind (i) buttons

- The long paragraph under the filter chips is gone. In its place is one period card: the period name and its dates, with an (i) button. Tap (i) for **How this is worked out**, now a short list (each holding's own settings, and when money is counted).
- **Due later this month, not counted yet** is now a small amber chip, "N due later this month". Tap it for the list of those payments with dates and amounts, and the total. It only shows when there are some.
- Nothing is calculated differently. No stored data changed.

## Release 8.33.0 – Android app: Family report Share or save PDF

- **Family report in the Android app** now has a **Share or save PDF** button. It builds the A4 report as a PDF in the background and opens Android's share sheet: save it to Drive or Files, send it on WhatsApp or email, or print it from there. It no longer depends on the phone's print screen, which was not working. A separate **Print** button keeps the old route.
- In a browser or the installed web app nothing changes: the button is still "Print or save as PDF".
- Needs a new APK (a new native method `exportPdf` and a small helper class in `android/app/src/main/java/android/print/`). Claude cannot compile or run the Android app, so this has not been tried on a phone. If it fails, the toast shows the reason; send that text.
- No stored data changed.

## Release 8.32.0 – Home: Action centre folds away and shows what needs attention

- **Collapsed by default.** Home opens with a one-line Action centre: the bell, a count and a short summary. Tap it to open the full list (tiles, tabs, dates); tap again to fold it.
- **Attention marker.** Overdue items and alerts (EMI due within 3 days, price alerts, old prices, loan interest higher than interest earned) turn the bell red, add a red count badge and a red "N need attention · overdue · alerts" line. Dismiss them (the close icon, Undo still works) and the red goes; the line then reads "Nothing urgent · N due this week" or "All clear".
- Nothing else about Action centre changed. No stored data changed.

## Release 8.31.1 – Net worth: tap a colour in "What you own, month by month"

- **Fixed:** tapping (or clicking) a coloured band in the month-by-month chart now opens that group, the same as tapping its name underneath. Hovering the chart also shows the figures for the month again. The chart's touch layer was never put on the chart, so nothing reacted.
- No stored data changed.

## Release 8.31.0 – Cash & banks → Accounts as cards; investments in blue on Transactions

- **Accounts is no longer a table.** A green total card (Total cash, with In banks and Cash in hand when you have a wallet), then one card per account: bank or wallet icon, name and holder, balance, its share of your cash as a bar, last entry with how long ago, and this month's money in and out. Tap a card for its transactions; the pencil edits the account; negative balances show red. Phones get one card per row. Add account is unchanged.
- **Transactions: investments are blue** (the app's investment blue) on the summary tile, badge, category pill and row edge, matching the rest of the app. Expenses (red) and income (green) are unchanged.
- No data or calculation changes.

## Release 8.30.0 – Action centre: close icon, Undo, slimmer rows; Investable interest fixed; Net worth mix chart; Cash transactions restyled

- **Action centre rows:** the Dismiss button is now a small × (Restore is a ↺ in the Dismissed view). Dismissing shows a toast with **Undo** (`toast(msg, kind, { label, onClick })` in `ui.js`). Rows are slimmer: about 52px on a phone (was about 82px), the kind icon is hidden on phones, titles drop the repeated words ("Alagu Pandi", "Home loan"; the second line says Lending, EMI or Bond).
- **Monthly items only in Next 7 days:** monthly lending and monthly or quarterly bond interest are no longer listed under Later or in the 60-day total (`upcoming()` flags them `recurring`). Yearly lending and maturities are as before. Phone reminders are unchanged.
- **Investable balance → Interest income still expected** now follows This month in detail: income not received yet (bonds not due, lending not marked received), plus Money to receive entries no income line covers, plus Income Bond not in the bank yet (the ₹300-or-more gap). Before, a lending payment was counted twice (its income line and its own Money to receive entry). `pendingToReceive` returns `rows` (Home's "Due to you" list), `extra`, `lines`, `notInBank` and `total`.
- **Net worth → What you own, month by month** now draws with one saved month before this month plus today. It needed two saved months before this one, so October and November saved on 1 Nov counted as one.
- **Cash & banks → Transactions:** Filter and Sort are labelled groups with icons (Account, Period, Category, Amount, Search; Sort by, Order with wording that fits the field). Summary tiles (Entries, Received, Paid out / Spent / Invested). Header band, zebra rows, a coloured edge (green in, red out, blue investment), a round ↓ / ↑ badge and a category pill on each row. On phones: icon Sort and Filter buttons, a search box with an icon, summary tiles, and each transaction as a bordered card. No behaviour changed.
- New test: `tests/investinterest.test.mjs`. `tests/actionlending.test.mjs` also checks the `recurring` flag.

## Release 8.29.0 – Action centre: dates ahead of time and Dismiss; lending income follows Money to receive marks

- **Loan EMIs and lending payments show ahead of their day.** Once this month's EMI or lending payment was in, next month's was not listed until the 1st, so anything due on the 1st–5th only appeared on the day. Both now show at next month's date (`C.upcoming`; the loan EMI date uses that month's length). Each lending payment is its own row in Next 7 days.
- **An EMI due within 3 days is also an alert** (Alerts tab, amber); before that it is in Next 7 days. On All it shows once, under Alerts. Phone reminders (`notify.js`) pick up the next month's EMI too; their one-day-ahead timing is unchanged.
- **Dismiss on every dated row, and a Dismissed chip.** Dismissed items stay hidden until they are gone, on this device only (`localStorage` `fw.dismissed.items`, keyed by a stable `ref`: kind, record, due date). The chip lists them with Restore and Restore all. The old "Hide until tomorrow" on notices is unchanged.
- **Home → This month in detail → lending lines (this month):** tap a line to see each payment behind it and mark it received or not received. They are the very marks on Money to receive, so a change shows on both, and Money to receive now also has **Mark not received**. This month, received for these lines counts only those marks: the old whole-amount "Received this month" mark and bank credits are ignored for them. Earlier months are unchanged. Investable balance (`pendingToReceive`) follows the same figures.
- **Data:** no migration. Marking received keeps the earlier date in an optional `receivables[].prevReceived`, which "not received" puts back (without it, last month's due date is used). `manualMonthlyIncome[].paidMonths` is still read for earlier months and for lines not in Money to receive, which now have a "Not received" button too.
- New test: `tests/actionlending.test.mjs` (synthetic data, no argument).

## Release 8.28.0 – Shares & funds: phone lists use the compact rows everywhere

- **Phone only; computer tables unchanged.** Every remaining Shares & funds table that showed as cards now uses the same compact rows as Holdings: a fixed first column, and a last column that switches figures when you tap its heading or the last column of any row. Tapping anywhere else in a row opens it as before.
- **History → Sold shares:** share with sold date and quantity; views Profit / loss · Sold for, Bought for · Value today if kept, and Kept vs sold. Phone Sort added (sold on, profit, sold for, share).
- **History → Dividends:** company with date; amount. Phone Sort added. The "Dividends found" preview shows Amount · Shares and Per share.
- **Manage → Investment planner:** "Invested in the month" (Amount · Times, Last on) and "Plan for the month" (Left · Done, Each month · Each year; the Mark done button stays under the name).
- **Manage → Import:** holdings that will change, splits/bonus/dividends, and stock trades (Value · Type, Price · Qty).
- Also: Today's biggest gains and falls, a share's purchase lots, trades and corporate actions, a fund's buy history, and Watch (alerts and watchlist).
- `mobileFrom` accepts `extra: 'Column label'` to show a column (such as a button) under the first line.

## Release 8.27.0 – Monthly budget setting, Holdings chips and Gain · XIRR, tap the last column

- **Monthly budget (Expenses → Categories & budgets):** a new read-only "Monthly budget" card shows this month and the next two. "Change budget" opens a sheet (a bottom sheet on phones). Interest income expected stays the default. You can fix an amount for the whole year (from this month to December), and set this month and the next two to the same-as-year, interest income or their own amount. Months before this one always use the interest income. Stored as an optional `settings.budgetPlan`; old files work without it.
- **Where the budget is used:** Month in detail (limit, status, heat map, charts, and a Budget column when you fixed an amount) and Home's This month in detail and Spent this month tile (Budget, spent of budget, left to spend, pace warning). Expected, received and spent are unchanged. Home's "Spent this month" tile (and its drop-down) uses the same budget.
- **Shares & funds → Holdings:** on phones "Gain · Return" no longer shows XIRR; the new "Gain · XIRR" view shows gain with XIRR. The Show filter is now chips (Shares, ETFs, Mutual funds), several can be on, all are on by default, one always stays on. The chips are in the phone filter sheet and also on the computer. Old links (`?f=shares`, `?f=etfs`, `?v=funds`) still work.
- **Phone lists:** tap the last column of any row to switch the figures (same as tapping the heading). Tapping anywhere else in the row still opens it. This applies to every list built on the shared phone rows (Holdings, bank transactions, bonds, savings, chits, fixed income, Wealth outlook and the rest).
- **Home → Markets today:** Shares, ETFs and Mutual funds open Holdings with that filter on; Gold opens the Gold page. Works in the computer popover and the phone sheet.
- New test: `node tests/budget.test.mjs`.

## Release 8.26.3 – Action centre: bond interest due on one date is one row

- When two or more bonds pay interest on the same date, the Action centre shows one row ("Bond interest due", "4 bonds", the total) instead of one per bond. Tap it to see each bond and its amount (a bottom sheet on phones, a dialog on the browser) with a link to Bonds.
- A single bond, bond maturities and every other kind of item stay as they were. The group counts and totals are unchanged.

## Release 8.26.2 – Fund NAVs: no more CORS errors, NAV date shown, AMFI cross-check

- When a backend is connected, fund prices are read through it first, so the browser no longer makes the request that CORS blocks (the red console lines for 152156, 120847, 122639 and the history/metrics calls are gone). The browser is only a back-up.
- Each fund now shows the date of its NAV (for example "438.8371 · 27 Oct" in the holdings table on wide screens, and "avg 120.5 · NAV of 27 Oct" in the NAV view on phones), so a stale price is easy to spot.
- backend/Code.gs: when mfapi.in is a day behind for some funds (it copies AMFI's daily file a little later), the backend reads AMFI's own NAV file and uses its NAV if it is newer. **Paste backend/Code.gs into Apps Script and deploy a new version for this to work.**

## Release 8.26.1 – Fund prices: fewer misses, quieter console

- Refreshing prices now asks the backend for all fund NAVs in one call (new `mfnav` action in backend/Code.gs). Any fund that is missing is then fetched on its own, and any that still fail get one more pass after a short pause. Before, a single slow answer from mfapi.in left that fund without a new price.
- The browser is only asked directly when no backend is connected. After the first CORS failure it is skipped, so the red CORS lines in the console appear once at most (they were two per fund).
- backend/Code.gs also retries mfapi.in up to 3 times. **To get the one-call version, paste backend/Code.gs into your Apps Script project and deploy a new version.** Without that, the app still works: it falls back to one backend call per fund, now with retries.

## Release 8.26.0 – Home polish, folded details on phones, gold rate setting

- Settings > Gold rate (owner only): shows the live world price per gram, the current adjustment (the local difference: duty, GST, margin, carat) and the rate in use. You can type the adjustment as a percent of the world price, or type a market rate you trust (for example the 22K rate on Goodreturns) and the app works the adjustment out from the live price and applies it straight away.
- Action centre now has the same background and border as the other Home cards. The filter pills wrap onto two lines instead of scrolling sideways, and the tab "This week" is now "Next 7 days". It opens on the most urgent tab: Alerts if there are any, otherwise Overdue, otherwise Next 7 days (otherwise All). A tab you pick stays picked.
- Android app: the green gradient behind the Net worth card is gone, so it matches the phone web app.
- Phones (web app and Android app): Assets, Loans, Overall XIRR and Without EPF/PPF start folded away behind one row, "Assets, loans & XIRR" with a chevron; tap it to open them and tap "Hide details" to close. The browser version always shows them.

## Release 8.25.0 – Action centre redesign (phone and browser)

- The Action centre is its own panel (tinted background, rounded border, white inner cards) so it no longer looks like the other Home cards. Same data, same sorting, same tap targets.
- Header with a bell tile, "Action centre" and "What needs attention now". Three equal summary tiles: Overdue (red accent), Next 7 days (green), Next 60 days (neutral).
- Filter pills (All, Overdue, This week, Later, Alerts) with count badges; the selected one is brand green. The row scrolls sideways on narrow screens and the pills never shrink.
- Groups (Overdue, Today, Next 7 days, Later) have a compact header with icon, count and total. Under it a thin timeline: a small date badge (day over month, shown once per date), a node with an arrow (green down = money in, up = money out, amber/red for today/overdue), and an event card with a kind icon (bond, fixed deposit, chit, lending, EMI), title, kind with "in N days" or "N days late", and the amount on the right. Long titles wrap; amounts never overlap.
- The totals now add up the whole rupees shown on the rows. Each row is shown rounded to the rupee, but the totals used to add the exact paise first and round once, which could differ by ₹1 from the visible rows (for example ₹1,569 + ₹1,569 + ₹1,391 + ₹9,70,000 showed ₹9,74,528 instead of ₹9,74,529). The stored amounts are not changed.
- Phones 360px wide and narrower hide the small kind icon to give titles room.

## Release 8.24.13 – Bottom tabs: border across the bar, no gold marker

- Phone: the thin border across the top of the whole bottom tab bar is back, so the tabs no longer blend into the page.
- The gold marker above the selected tab is removed. The selected tab is still shown by its gold icon and label.

## Release 8.24.12 – Net worth card: date stays beside the amount when there is room

- Phone: the short date ("29 Oct") now sits on the same line as the exact amount whenever the row has room, and only drops below it when the screen is too narrow. (Before, it was always forced below.)

## Release 8.24.11 – Net worth card: gold bar under the number only, change on one line

- The gold bar sits under the number only ("1.54"), not under "Cr" / "L".
- Phone: the change since 30 Sep is a single pill on one line ("▲ ₹3,72,630 since 30 Sep"), placed under the chart on the right. The amount and short date are stacked on the left of that row. Phones narrower than 340px put the amount and date on one line and the change on its own row below.

## Release 8.24.10 – Net worth card: full-width gold bar, one compact row

- The gold bar under the figure now runs the full width of the amount (all of "1.54 Cr"), on phone and browser.
- Phone: the exact amount and short date ("₹1,54,34,908 · 29 Oct", no year) share one row with the change since 30 Sep, which is a green pill with "since 30 Sep" under it. Only very small phones (320px and under) put the change on its own line.
- Browser: short date too; layout unchanged.

## Release 8.24.9 – Net worth card: calmer spacing under the gold bar

- Phone: the exact amount and date read as one line ("₹1,54,34,908 · As of 28 Oct 2026") with more space above; the change since the month end is a green pill ("▲ ₹16,34,908") followed by "since 30 Sep"; more room before the divider and rows. Small phones (320px) wrap the date to its own line and the chart and figure shrink so nothing overlaps.
- Browser: same layout; the amount and date now have a "·" between them.

## Release 8.24.8 – Plain phone Net worth card, no nav border, Action centre timeline

- Phone: the Net worth card matches the reference exactly: plain background, no gradient, no watermark, no ruled lines. A thin divider sits above the four rows and between each of them, as in the reference. The "since 30 Sep" line stays.
- Phone: the bottom tab bar no longer has a top border (the gold marker on the active tab stays).
- Action centre (all screens): the dated list is now a timeline. Date on the left (shown once per day), a rail with one node per item (green down arrow = money in, up arrow = money out, red = overdue, amber = today), and a card with the title, kind, days and amount.

## Release 8.24.7 – Net worth card: icons, and a new phone layout

- Phone: the Net worth card is a stack. Header with the wallet icon, "Net worth" and a green pill with Overall XIRR; the big figure beside a small trend chart; a calendar line with the exact amount and date; the "since 30 Sep" change line (kept); then Assets, Loans, Overall XIRR and Without EPF/PPF as rows with coloured round icons.
- Browser: same layout as before; only the icons are added (Net worth label and the four rows).

## Release 8.24.6 – Phone: watermark stays behind the Net worth card

- 8.24.5 hid the faint logo watermark on phones whenever the small trend chart showed. It now stays on phones (lighter than before); only the browser has no watermark.
- No stored data changed. Android: rebuild the APK.

## Release 8.24.5 – Net worth card: browser right side as before; phone chart and lighter watermark

- Browser (screens wider than 700px): no green wash on the card, no divider, no logo watermark; the ruled lines stop behind the Assets / Loans / XIRR block and the little trend chart, exactly as in earlier versions. The green edge and gold bar stay.
- Phone: the faint logo mark behind the card is lighter so the figures on the right read clearly.
- Phone: a small trend chart (the last 14 readings, same as on wide screens) sits above Assets, (the logo watermark behind the card is covered in 8.24.6).
- No stored data changed. Android: rebuild the APK.

## Release 8.24.4 – Phone: active tab marked at the top; no sync message in the top bar

- Bottom bar: the gold bar that marks the active tab now sits on the top edge of the bar (was the bottom).
- Top bar: the message that replaced the icons for a few seconds is gone. The sync dot beside the icons is the only status on a phone (tap it for the words). Desktop still shows the status pill.
- No stored data changed. Android: rebuild the APK.

## Release 8.24.3 – Phone top bar a little bigger; active tab bold

- Title is now 18px and the logo 32px (fixed sizes; a very long title is cut with an ellipsis only if it truly has no room). In the bottom bar the active tab is bold (label and icon) and the others are light, so it stands out.
- No stored data changed. Android: rebuild the APK.

## Release 8.24.2 – Phone top bar: sync status as a dot, message only briefly

- The "Saved to Drive" / "This device only" pill no longer sits in the phone top bar all the time (it overlapped the title). The refresh-from-Drive icon is gone on phones (the Android app still has pull down to refresh).
- A small dot beside the icons shows the state all the time: green saved, amber pulsing while syncing or saving, red problem or offline, grey this device only. Tap it for the message, or to open the fix when something is wrong.
- Whenever the state changes (and when the app opens) the message replaces the icons for about 3 seconds, then the icons return.
- Desktop is unchanged. No stored data changed. Android: rebuild the APK.

## Release 8.24.1 – Smaller title and bottom tabs; chart and ruled lines kept

- Phone top bar: title 16px, logo 28px, chip 11px (still fixed sizes). Bottom tabs: icons 22px, labels 10px, slimmer bar; the active tab is shown by a short gold bar (the logo's gold) along the bottom edge (no box), with a gold icon and label.
- Net worth card: the ruled lines behind it are back (not on the Android app, where they cut through the number). The little trend chart stays on desktop and wide screens; the faint logo mark behind the card now shows only where that chart is hidden (phones).
- No stored data changed. Android: rebuild the APK.

## Release 8.24.0 – Brand look: logo, top bar, Net worth card, bottom tabs

- Logo: the old rupee tile is gone from the side menu and the welcome screen; the new bars-and-arrow logo is used there and in the phone top bar. The browser tab icon now points at versioned files (`?v=8.24`) with PNG fallbacks, so browsers drop the old cached icon.
- Top bar (phone): logo tile, page title and the "This device only" chip with a lock. The title and logo are fixed size (px), they do not follow the text-size setting; the chip shrinks first when space is short. Settings uses a sliders icon.
- Net worth card: green edge, soft green wash, short gold bar under the number (replaces the double rule), faint logo mark behind, divider before the figures.
- Bottom tabs (phone): icons 28px, small bold 11.5px labels, active tab has a green highlight with a green border; the bar has a green top line. Page bottom space was raised so nothing hides behind it.
- Summary cards are unchanged. New files: `icons/mark.svg`, `icons/favicon-32.png`, `icons/apple-touch-180.png` (made by `tools/make-icons.py`).
- Android: rebuild the APK to get it. No stored data changed.

## Release 8.23.3 – Android: status bar readable in dark mode

- Problem: in dark mode the clock, battery and signal icons on the phone's top bar could be hard to read.
- Cause: the icon colour was set through a plugin call, and it ran before the page had switched theme when Light / Dark was changed in Settings. The strip behind the bar also followed the phone's night setting, not the app's own Light / Dark choice, so the two could disagree.
- Fix: `NativeTools.setBars` (new, in `NativeToolsPlugin.java`) sets the icon colour directly on the window and paints the page's real background colour behind the bars. `js/native.js` now also watches the page for theme changes.
- **Rebuild the APK** to get this (it changes Android code). The web app is unchanged.
- No stored data changed.

## Release 8.23.2 – New app icon

- The rupee is gone. The icon is now rising gold bars with a growth arrow over them, on the same green.
- Replaced: web favicon (`icons/icon.svg`), PWA icons (192, 512, maskable), Android launcher icons (square, round, adaptive foreground), the notification icon and the splash screens.
- `tools/make-icons.py` draws everything from one place. Run `python3 tools/make-icons.py` from the repo root (needs Pillow) to change the design.
- Android: rebuild the APK to see the new launcher icon and splash. After installing, the old icon can stay on the home screen until the app is removed and installed again.
- Phones using the web app may need one reload, or a remove and re-add of the home screen shortcut, to pick up the new icon.
- No stored data changed.

## Release 8.23.1 – Fix: fund prices blocked by CORS

- mfapi.in sometimes answers without the CORS header, so the browser blocked NAV and history calls (some funds updated, others did not).
- New `js/mfapi.js`: tries the browser, retries once, then asks the backend to read mfapi.in on the server. After one block it uses the backend first for the rest of the session.
- Backend: new optional `mf` action in `backend/Code.gs` (read-only, path is checked). **Paste the new Code.gs into Apps Script and deploy a new version.** Until then the app behaves as before.
- No stored data changed.

## Release 8.9.28 – Fix

- Insights and Tax summary failed to load with "Cannot access 'folds' before initialization" when more than one person is on record. Fixed.

## Release 8.22.0 – Home: the Action centre card

- "Needs a look and coming up" is replaced by one properly designed card, **Action centre**: "What needs you now, and what is coming".
- **One list from one source**: everything dated comes from the same place as before (`upcoming()`: maturities, bond interest, money to receive, loan EMIs, other dues; bond interest due today is added), and each item appears once, grouped Overdue, Today, Next 7 days and Later (to 60 days). The old "N payments overdue / N falling due" summary rows are gone, since the items themselves are listed.
- **Totals strip** at the top: overdue amount, next 7 days, next 60 days. **Tabs** with counts: All, Overdue, This week, Later, Alerts. Rows show the date, what it is, the type and how late or how soon, and the amount (+ for money coming in, − for EMIs); tapping a row opens the page for it. Long groups show the first few with "Show all".
- **Alerts** (price alerts, old share prices, loan interest higher than interest earned) keep their logic and the "Dismiss until tomorrow" button, in a section of their own.

## Release 8.21.0 – Home: fewer cards; certificate shows what is due later this month

- **Home: "Money to receive this month" is gone.** Its two unique parts now sit under Income in **This month in detail** (current month only): the money due to you that has not arrived (overdue and due today, with the total waiting), and the bank check on bond interest ("Income Bond · not in the bank yet", or the quiet "Bank check" line). Tapping a pending income line still opens the bond list or lets you mark it received.
- **Home: "Needs a look" and "Coming up" are one card**, "Needs a look and coming up": the alerts first (each can still be dismissed until tomorrow), then what falls due in the next 60 days.
- **Interest certificate, "This month"**: with projections off, a payment dated later this month (for example a lending payout on the 30th when today is the 27th) is not counted yet, so it looked missing. It is now listed above the table as "Due later this month, not counted yet" with its date and amount; switch projections on to count it.

## Release 8.20.0 – Interest certificate: projections switch

- A switch **"Include projections and future payments"** (off by default) on the Interest certificate.
- **Off**: money is counted when it is paid or credited, and only once that date has come. A compounding deposit's interest falls in the month it matures or is closed (the amount you entered when closing, if any); a chit's gain in the month it completes (the amount received once closed; an open chit that has reached its end date is still shown as an estimate); bonds and payout deposits on each payment date (every quarter for a quarterly bond, once a year for a yearly payout); EPF and PPF in the March they are credited.
- **On**: interest is spread the way it is earned (deposits, chits and EPF/PPF month by month) and payments still to come are included. Anything not yet paid or closed is shown in italics (with a Projection tag) and added up in the Projected card; EPF and PPF are not projected into future months.

## Release 8.19.0 – Interest certificate: EPF, PPF, chits and multi-select types

- **Types are now chips you can combine** (All, Bonds, Fixed deposits, Private lending, EPF, PPF, Chits). With one type selected every holding is shown open; with several, tap a type to open it.
- **EPF and PPF**: interest earned each completed month on the balance at the declared yearly rate (`monthlyInterest()` in `js/epf.js`, same model as the balance estimate). The passbook credits it in March, but it is earned monthly.
- **Chits**: the gain is what the chit pays at the end less the instalments paid in, spread over its life in proportion to the money held each month. A closed chit uses the amount you entered when you closed it (marked Closed). A chit still running is a **projection** (italics, a Projection tag and a Projected card) from its expected payout or yearly rate and the instalments still to come; it counts as "still to come" until its end date. A chit with no expected payout or rate shows nothing.
- Closed holdings of every type carry a Closed tag; CSV has a Status column (Projected, Closed).
- Not included: recurring deposits, insurance and other small savings.

## Release 8.18.0 – Interest certificate report

- **Insights > Interest certificate** (new tab; logic in `js/interestcert.js`, view `certView()` in `js/views/insights.js`): the interest every fixed-income holding pays or adds in a period.
- **Period**: this month, last month, year to date (from 1 Jan), this year, last year, next year, financial year to date, this / last / next financial year. Future periods show expected payments.
- **Type**: All, Bonds, Fixed deposits, Private lending. Each uses its own settings: bonds by their payment periods and the TDS rate in Settings (or the amount entered as "what reaches me"); payout deposits and loans by the amount received each payout (else the rate), from the start date every month, quarter or year; compounding ones by the interest added to the balance each month. No TDS is cut on deposits and loans here, as in the Tax summary.
- **Summary cards**: interest earned, TDS, net to you, received so far, still to come.
- **Table**: with All, grouped by type (tap a type to open its holdings); with one type, every holding is shown open. Download CSV has a column per month.
- **Monthly chart** at the bottom: stacked by type, months still to come paler, with a table of the same figures.
- `stackedBars` takes an optional `partColors` (colour by part name).

## Release 8.17.0 – Bond payout schedule, part-close, holder credits by account

- **Navi mismatch fixed**: the Bonds page "Net per month" used the calendar month's days (31) while Home used the payment period (29 Sep to 28 Oct = 30 days): 1,758 against 1,701. `calcBond` now takes this month's payment by the period rule for monthly bonds (quarterly bonds show the monthly average), so both pages agree.
- **Payout schedule**: a Schedule button on every bond (Bonds table, and in the bond's edit form) opens every payment from the day bought to maturity: due date, period and days, interest, TDS, what you receive, principal back; paid ones in green, upcoming in grey (`bondSchedule()` in `calc.js`).
- **Part-close**: in the bond's edit form, "Part-close" takes the date and principal returned (and the bank account to credit). The bond keeps the remaining amount; a new closed entry "Name (part n)" holds the returned amount from the day bought to the day returned, with `partOf` (the bond's id) and a unique `partKey` (`b1-P1`); the bond also keeps a `partials` list. Do it as many times as you like. Interest on the amount held at each time stays right, and the schedule adds the parts together. Reopening a part entry from the Closed list puts the amount back into the bond.
- **Holder pie credited**: bank entries are no longer matched to bonds. "Credited" is the total of Income Bond credits in the holder's own accounts in the period, set against the total due; the bank entries are listed under the bonds, and a bond's schedule is one tap away.

## Release 8.16.0 – Bond interest by payment period, interest by holder

- **One rule for bond interest** (`bondPeriod()` in `js/calc.js`): a payment covers the days from the day after the previous payment day up to and including the due day. Due 13 Oct: 14 Sep to 13 Oct = 30 days; due 13 Nov: 14 Oct to 13 Nov = 31 days; due the 31st: previous payment day 30 Sep, so October is 1 to 31 = 31 days; February and leap years follow the real previous payment day. Quarterly bonds work the same from their previous payout day (about 91 to 92 days). The first period starts the day the bond was bought; the last one ends the day before it matures or is closed.
- Used everywhere interest or a due amount is worked out: `bondDaysIn`, `bondGrossIn`, `bondNetIn`, `bondDueAmount` (so Home's money to receive and bank check, Wealth outlook month cash flow, upcoming interest), the Tax summary (bond interest now counts in the year of each payment's due date, once that date has come) and its month-by-month bond dialog, the bank-vs-holdings check, and the Bonds page "Paid so far" (`bondPaidSoFar()`).
- **Bonds page, bottom: "Interest credited by holder"** pie with This month / Last month / Year to date (financial year from 1 April). Tap a holder (slice or legend) for its bonds with due, credited by the bank and the difference. Credited = Income Bond bank entries matched to each bond (same matching as Home); with no matches the pie shows what is due.

## Release 8.15.2 – Income Bond bank check by monthly total

- **Home → Money to receive: the Income Bond bank check now compares totals only.** Nothing is matched to a bond by amount, date or description. It takes all bond interest whose due date has passed this month and all the bank credited under "Income Bond" this month. If the bank shows ₹300 or more less, the line "Income Bond · not in the bank yet" shows the difference. Tap it to see the two totals, the bonds due so far and the month's Income Bond bank entries. When the totals agree, a quiet line "Bank check: ₹X due so far, ₹Y credited" shows instead, so you can always see the numbers. Current month only. Not added to Waiting for or the Investable balance.
- This replaces the bond-by-bond check of 8.15.1 (the Markets today refresh of 8.15.1 is unchanged).

## Release 8.15.1 – Markets today refresh, bond bank check judged bond by bond

- **Home → Markets today (drop-down and phone sheet):** shows when prices were last fetched ("Prices updated 5 min ago", amber with a warning when older than a day or never fetched) and a **Refresh** button. It is the same refresh as Shares & funds: shares, ETFs, funds and gold, plus P/E and 52-week data.
- **Home → Money to receive: "Income Bond · not in the bank yet" now works bond by bond.** 8.15.0 compared the month's total of bank credits with the total due, so a credit larger than expected for one bond (or any extra credit) could hide another bond whose interest had not arrived. Now each bond whose due date has passed is set against the bank's "Income Bond" credits (same amount, or its name in the description, never before its due date). A bond short by ₹300 or more is listed, and the line shows the sum of those shortfalls. Tap it for each bond, its due date and what is missing.

## Release 8.15.0 – Bond bank check, orderable New money highlight, Allocation goal plan, spending popup

- **Home → Money to receive this month: bank cross-check (current month only).** Bond interest still counts as received once its due date passes. A second check compares the bond interest due so far with the bank's "Income Bond" credits this month. If the bank shows at least ₹300 less, a separate line "Income Bond · not in the bank yet" appears with the amount. Tap it for the bonds with no matching credit. It means either the money has not arrived or the bank entry is missing. A gap under ₹300 shows nothing. It is not added to the totals, Waiting for, or the Investable balance.
- **Wealth outlook → New money:** a row you move glows green and the rows it pushed are shaded amber, then it fades after about four seconds. The add and edit form is two columns, so it fits without scrolling on a computer.
- **Month in detail → What counts as spending:** one clean row per line, name on the left and amount on the right, so long names no longer overlap.
- **Insights → Allocation goal:** pick the Wealth outlook plan (and version) at the top, and see that plan's settings read only, folded, as on the Wealth outlook pages. The goal itself is unchanged.

## Release 8.14.1 – Orderable New money, slimmer Home cards, chit projection for gold schemes

- **Wealth outlook → New money: order is the priority.** The table is shown in priority order. Move a line with its ▲ ▼ buttons (phones and computers) or drag a row (computers). Every move renumbers all lines 1, 2, 3 ... so the new order is the new priority. The Add and Edit form still lets you type a priority.
- **Home cards.** Removed "Tap to view details" from Investable balance (the card is still tappable). Cards are back to a smaller type size, all four have the same height, and the Spent this month note is one line ("96% of ₹67,839 budget · ₹51,219 not counted").
- **Gold chits: projection also for monthly gold savings schemes** (such as GRT Savings Account), which use the usual gold chit length. When every instalment of a chit is already paid, the card now says so instead of staying hidden.

## Release 8.14.0 – Month heat map, gold chit projection, priority and fixed-amount allocation, redesigned Home cards

- **Month in detail: heat map.** Each month tile is now coloured by how much of its limit was used. Under the limit, the less spent the deeper the green, fading to a pale colour at 100%. Over the limit it grows from that pale colour into deep red by 160% of the limit. Both sides meet at the same pale colour, so the change at the limit is smooth. Text switches between dark and white so it stays readable. The legend is now one gradient bar (0%, 75%, 100%, 120%, 160%+) with the limit marked. The month you are looking at is lifted, ringed and larger, so it stands out. Status pills and everything else are unchanged.
- **Gold chits: projection card.** Inside each chit's "Best option" card, a quiet italic card shows the gold you would end up with if the instalments still to pay are paid at today's gold rate (or the rate typed in "Try a gold rate"). It counts the chit's length (11 months unless set) less the months already paid, at the last instalment paid (else the chit's monthly amount). Not shown for monthly gold savings schemes, which have no fixed length.
- **Wealth outlook → New money: priority and fixed amount.** Each line now has **How much goes in** (share of the month's money, the default, or a fixed amount) and a **Priority** (1 is filled first; empty comes after the numbered ones, in the order listed). Lines are filled in priority order, a short month fills the first priorities and leaves later ones empty, and money left after every line goes to the last one. A share line takes its calculated percentage (its amount over the total of the share lines) of the month's money. Plans that set neither work exactly as before. New file `js/allocation.js` holds the rule; `tests/allocation.test.mjs` checks it.
  - Used by: This year and Years ahead (`js/projector.js`), Home → Investable balance card and "Where the current investable amount can go", Home → Investing this month and its "Invested this month" tab (`js/monthinvest.js`, `js/views/home.js`), the New money table and Plan settings summary (`js/views/proj-plan.js`, `js/views/proj-shared.js`), and the plan change list (`js/planner.js`).
  - Stored: lines get two optional fields, `mode` ('pct' or 'amt') and `priority`. Old lines work without them. No stored field was changed or removed.
- **Home: four redesigned cards.** Investable balance (pale blue, blue left edge, blue amount, still italic as it is projected), Earning every day (green amount), Markets today (red or green by the day's result) and Spent this month (progress bar from amber to red with the percentage). Same figures, pop-ups and taps as before. The small trend lines show direction only; they are not drawn from data.

## Release 8.13.1 – Home: Net worth over time moved to the bottom

- The Net worth over time chart is now the last card on Home.

## Release 8.13.0 – Investable cards with working, Net worth over time, Month in detail page, Work-optional exclusions

- **Investable balance (both cards on Home).** The blue tile and the card in "Investing this month" now show how much is invested so far this month and open the same popup with two tabs: **How it is calculated** (opens first) and **Invested this month**, which lists each plan line by asset class with what went in, what the plan needs and what is still to go (anything in a class the plan has no line for is shown as "not in your plan"). The remaining amount is in italics because it includes projected expenses.
- **Net worth over time** (new card under the Net worth card on Home). Choose 1 week, 1 month, 3 months, 6 months or 1 year; the chart shows net worth and total assets for every day, and hovering gives the figure for that day. It is drawn from the readings the app saves (one per day you open it on the owner's device: net worth, assets and loans), the month-end figures from the Plan sheet and check-ins, and today. Days without a reading are joined by a straight line and say "between readings". The small line in the Net worth card is the last 14 of the same readings.
- **Month in detail** (Spend & plan, under Income & expenses; also a tab on phone Expenses). Pick This month, Previous month, This year, Previous year, or any single month. A month map colours each month: green well within (under 75% of the limit), amber marginal (75 to 100%), red over (up to 20% above), deep red well beyond. The limit is the interest income expected that month, the same budget as Home. Charts: interest income vs spending by month, where it went, share of spending, and a month table. **What counts as spending** lets you leave out one-time payments (rent, EMI, tax, other); by default it matches Home's Spent. The choice is kept on the device only.
- **Work-optional number** (Wealth outlook, Years ahead): "Leave out spending you will not have after work". Tick everyday categories (each takes its share of the plan's monthly expenses, from the last 12 months of bank entries) and one-time items of the plan (for example Tax). The corpus is worked out again without them and the card says how much was left out. Saved in `projector.ahead.woSkip` (optional field).
- No stored field was changed or removed. New file: `js/monthdetail.js`, `js/views/monthdetail.js`, tests in `tests/monthdetail.test.mjs`.

## Release 8.12.0 – Wealth outlook: plans start from a month-end net worth, simpler numbers

- **A plan starts from a month end you give it, and nothing before it is used.** Made in October, it starts from the net worth at the end of September and projects October, November and December. A plan for the next year starts from December (suggested from the earlier plan's end, or your December snapshot). Creating a plan now asks for the month end and its net worth. Stored as the optional `initial.asOfMonth`; older plans without it keep starting from the December before (`PL.defaultAnchor`, `anchorOptions`, `suggestStart`, `startAt`).
- **Actual means a saved snapshot, projected means the plan.** Today's holdings are no longer mixed into This year, Month-end check-in or Saved snapshots. A month with a snapshot inside the plan is real; every other month is projected from the latest real figure (last snapshot, else the starting net worth). Snapshots from before the plan's start are kept but not used. Years ahead also starts from that position, not from today.
- **Simplified:** FDs are FDs only (the old "FDs & compounding loans" class is now "FDs"; money lent at compounding interest sits under Others with no growth assumed). Loans are out of the projection: "Loan paid down" and "Loan paid" are gone (the EMI is still counted as spending). "Other changes" is renamed "Not explained (difference)" and a first month with no known split by asset class shows growth as one figure.
- **Interest income:** the plan works it out from bonds and lending alone by default. The old "adj" line only existed when you typed an expected figure on the Planner; it is now called "Adjustment to your expected figure" and says what it is made of. Leave the Planner field empty to have none. Popups list interest by bank category for real months, and by bonds and lending for projected months.
- **Breakups:** Other income and Invested open a popup on the month table, the month detail and the check-in table; hovering the interest, other income, one-time and invested bars on the income chart shows the same split. Invested shows which investment the money went to (from your records for real months, from the plan's lines for projected ones).
- **Fix:** the month detail (for example "2027, month by month" on Years ahead) showed empty amounts because each cell was one element drawn in both the table and the phone card. Cells are now built on every draw. The projection also no longer fails when a snapshot holds no value for some asset class.
- **Saved snapshots** is folded by default.
- Tests: `tests/anchor.test.mjs` (new); `tests/planner.test.mjs` updated for the start month.

## Release 8.11.0 – Wealth outlook: snapshot month, real growth by class, notes, three cases, suggested fix, work-optional number

- **Snapshots ask for the month.** "Save snapshot" always asks which month end you are saving (October's can be saved in the first week of November). It saves today's holdings as that month end, with an optional note, and replaces a snapshot already saved for that month. Every saved snapshot is listed under the check-in table: tap one to see what was saved, edit it or delete it (any month, not only the latest). The note shows under the month in the table.
- **Growth of real months is explained by rules, not by what is left over** (`js/growth.js`). Net worth change − saved − EPF put in = growth, then: market assets (shares, ETFs, funds, gold) = closing value − opening value − bought + sold; EPF/PPF = interest credited in that month's passbook entries (a memo shows interest still building up, not counted until credited); FDs, chits, RDs and others = opening × rate ÷ 12; cash only when no bank interest is in your entries; bonds and lending give no growth because the interest received is income. Dividends are income (taken from your trade records when no bank entry shows them). Whatever the rules do not explain is shown as "Other changes", so the total always adds up and nothing is counted twice.
- **Recorded, not recalculated.** The growth is worked out when the snapshot is saved, from the previous snapshot, and kept in it (`snapshot.growth`). A month whose snapshot has no such record shows a ⚠ beside its growth: it was worked out now. Saving the snapshot again records it. A month with no earlier snapshot to start from uses the outlook rate for market assets until real values exist. After a gap of months, the growth covers all the months since the last snapshot.
- **Workings are grouped** (Income in green, Expenses in red, EPF and investments in blue, Growth); tap a heading to fold it.
- **Three cases** on the This year chart and on Years ahead: expected (the plan's outlook), worse (market returns 2 points a year lower) and better (2 points higher), carried on from the last real position.
- **Suggested fix** under "Where it went right or wrong": how much more to save each month, a coming one-time item that could move, and the market return that would close the gap.
- **Work-optional number** on Years ahead: a year of living costs (without EMI) ÷ a safe withdrawal rate (3%, 3.5% or 4%, kept as a view setting), what you have as a share of it, and the year the plan reaches it. Shown as a dashed line on the Years ahead chart.

## Release 8.10.2 – Wealth outlook: deletions, workings in sheets, plan vs actual by item, Plan sheet removed

- **Delete a plan** (Planner, red button): allowed until a month-end snapshot has been saved for that plan's year, so a 2027 plan can go until the January 2027 snapshot. Deleting a plan never touches snapshots.
- **Delete the latest revision** (Revision history): the plan goes back to the revision before it (its settings become live and the working copy again). Deleting the first revision, also in the current year, turns the plan back into a draft that keeps its settings. Changes made since are discarded.
- **Workings open in a bottom sheet on the phone and a popup on desktop** (no small popovers): tap Plan: net worth, Actual: net worth, the Growth column, Spending, Interest, Salary + EPF. Net worth shows start of month + saved + EPF + growth (+ loan paid) = end, with growth class by class: EPF/PPF, deposits and market assets at opening × rate ÷ 12 for projected months.
- **Real months now show their growth working too**: each class's growth is what it gained beyond the money put into it (opening + put in + growth = closing), from the month-end snapshots. Loan paid down is the fall in loans.
- **Income, spending and investing**: tap a month to see Plan, Actual (or Projected) and Difference for every item: salary, interest, expenses, EMI, each one-time item, saved, investments, EPF, growth and net worth.
- **Plan sheet removed**: no menu entry, no link, and nothing reads it any more (the "month-end from your Plan sheet" notice is gone). Your data in it is not deleted.
- **Net worth over time** now takes its plan line and the projection only from the Wealth outlook plan of each year (live revision, else draft), and its actuals only from month-end snapshots and today.

## Release 8.10.1 – Wealth outlook: draft plans on every tab, plan targets by year end

- **Draft plans work everywhere.** This year, Years ahead and Market outlook no longer wait for "Make this plan live". The **Version** dropdown lists "Draft (not committed)" (or "Draft (changes not live yet)" while revising) and every committed revision; a banner says when you are not looking at the live one. Home's "Investing this month" still uses only the live plan.
- **Planner.** "Available to invest" no longer subtracts the one-twelfth of yearly bills (it is a note under the card; the bills come out in their own month). "Saved each month" and "Invested each month" open the steps: salary + EPF + interest + other − EMI − expenses − one-time, and then less EPF and the cash kept back. EPF is added automatically from "Expected EPF"; the default investment line from your Plan sheet is now called "RDs and FDs" (not "EPF, RD and FDs"), and a note says not to add EPF as a line.
- **This year.** Fixed: "Where it went right or wrong" (with the "compare up to" dropdown) was missing because of a bug. The month table under "Income, spending and investing" now opens with the current month already selected. Saving a snapshot stays manual (button at the bottom of the check-in).
- **Years ahead.** The single "target reached" card is gone. Each year end now has a **plan target** (the plan's own path carried on with its own settings) and an ahead/short figure, in the table and as a dashed line on the chart.

## Release 8.10.0 – Wealth outlook: new Planner tab, plans you commit and revise

- **Planner tab (first tab).** All planning now happens here, for this year and next. Cards: **Income** (Salary: expected salary, EPF, hike %, hike month; Other income: expected interest income, any other income; the net worth the year starts from), **Expenses** (expected expenses, yearly rise, loan EMI, and one-time items, each with its own yearly rise %), **Market outlook for this plan**, **New money going in each month**, and **Revision history**. Tap any card to change it in a bottom sheet (a dialog on desktop).
- **Defaults.** Salary and EPF: the last full month with a salary in your bank. Interest income: this month's expected figure from Home. Expenses: your average so far this year (without EMI, tax and one-time bills). Starting net worth: today's, or December's snapshot (buttons in its sheet). The projection treats it as January and adds the year on top.
- **Make live / revise.** A new plan is a draft: everything is open. "Make this plan live" locks it and only then do This year, Years ahead and Market outlook use it (they show "not committed" otherwise). "Revise plan" opens it; "Commit changes" makes the revision live again; "Discard changes" goes back. Each commit writes a revision: when, your note, what changed (old to new) and the key figures. Revisions cannot be edited.
- **Salary figures and hikes.** The salary, EPF and other income you enter are for the month shown ("figures are for"). A hike already behind that month is not applied twice; earlier months are scaled down, later ones step up in the hike month.
- **Interest income.** The figure you enter replaces the level worked out from your holdings. New money put into bonds and lending adds to it from the next month.
- **One-time items** keep their yearly rise: each repeating item can rise at its own % (empty = the expense rise); used for the years after the plan year.
- **This year.** Plan dropdown; Plan settings (read only, folded); target as per plan (December, from the plan's own projection), projected year end from actuals, short/ahead by, extra to save a month. Market outlook is now a what-if only (not saved). Month-end check-in: plan net worth (recalculated from the plan), actual net worth (from the snapshot, or today for this month), short/ahead, planned and actual invested (tap for salary + EPF + interest − EMI − spending − one-time), status. Every month from January: past months are real, the rest are projected in italics. Tap a past month with no snapshot to enter it (it starts from the projected position). "Month by month" and "Income, spending and investing" cover the whole year, with projected months in italics or paler bars. "Where it went right or wrong" has a "compare up to" dropdown (today, or any earlier month). The Year-end review card is gone.
- **Years ahead** has no settings of its own any more: it shows the plan's settings read only and projects the live plan, with the same outlook what-if. **Market outlook** is unchanged apart from reading the live plan's target and the what-if.
- **Old plans.** Plans made with the earlier Wealth outlook (and the old Years ahead figures) are not used. The Planner shows "Delete old plans and settings"; creating a new plan for a year also starts from that year's old one-time items, investment lines and rates. Month-end snapshots are never deleted.
- Data: new optional fields only (plans have `v: 2`, `live`, `revisions`; one-time items an optional `rise`). Nothing existing is renamed or removed unless you press the delete button above.
- Code: `js/planner.js` (pure logic), `js/views/proj-plan.js`, rewritten `proj-year.js`, `proj-ahead.js`, `proj-shared.js`; test `tests/planner.test.mjs`.

## Release 8.9.44 – Wealth outlook, This year: fewer, better ordered cards
- **What the plan assumes + Interest income expected** are now one card, "What the plan assumes, and interest expected": the four plan figures, then the four interest figures, the low-cash warning, and the two explanations folded under "How to read this". Edit target and assumptions stays on the card.
- **Month by month, rest of the year + Interest: what changes it** are now one card. Open a year to see its months, and under them "Why the interest changes, month by month" with the same table as before (interest a month, change, why). January still looks back at December.
- **Month-end check-in + Month by month (net worth)** are now one card: today against plan, then every month end of the year underneath, with the Save snapshot button on the card. This also removes two cards both called "Month by month".
- **New order** (top to bottom): headline, market outlook, net worth chart, month-end check-in, the plan's inputs (assumptions and interest, new money, one-time items), the forecast (months, then the chart), planned and actual new money, year-end review, where it went. Long explanations sit under "How to read this" folds; the market outlook text sits in its existing fold.
- Nothing is calculated differently. All figures, tables, popups, sorting and phone rows are the same as before; only their place changed. Years ahead is not changed. No stored data changed.

## Release 8.9.43 – Gold rate always comes from the live price
- **No more typing the gold rate.** The Gold rate section (the box, Update rate button and the automatic rate on/off switch) is removed. The rate is always the live world gold price in rupees per gram, adjusted by the local difference learned earlier (settings.goldPremium, unchanged), and it is read every time you refresh prices.
- **Gold rate card** replaces "Invested in gold chits" on the Gold page. It shows the rate, the change since the last reading and how old it is. The refresh icon reads the live price straight away (gold only). Tap the card for a bottom sheet (popup on a computer) with the latest reading, a Refresh now button and the rate history.
- Only the owner can refresh the rate, because it is saved for everyone. Family see the owner's latest rate.
- The rate is dated with your local date (it was the UTC date, so it could read "yesterday" just after midnight).
- No stored fields removed. `goldAuto` is no longer used.

## Release 8.9.42 – One Holdings list with a type filter, History tab
- **Shares & funds, Holdings.** The Shares & ETFs / Funds / History row and the Both / Shares / ETFs switch are gone. There is one list and a type filter on the left of the sort row: All types, Shares, ETFs, Shares & ETFs, Mutual funds. On a phone it is the Filter button (to the left of Sort); on a computer it is a Show box next to Sort. The summary cards follow the chosen type. The mixed list shows funds with a "Fund" tag. The XIRR in the summary is left out for All types (pick one type to see it).
- **History** is now a tab of its own, next to Manage (Sold shares and Dividends inside it). The five tabs fit on a phone.
- Old links still work: `?v=funds`, `?v=stocks&f=etfs`, `?f=shares` pick the type; old Sold and Dividends links open History.
- No stored data changed.

## Release 8.9.41 – Projected amounts, Holdings cards, gold grams, expense drill-down
- **Home, projected amounts.** Projected expenses are shown in italics and in red wherever they appear: the Expenses still to come card, its working popup, and the expenses part of the Investable balance line (the Investable balance breakdown already did this).
- **Shares & funds cards.** The first card now leads with the current value as the big figure, with Invested under it, then the holdings count and XIRR. Gain / loss follows (overall and today on a phone; desktop keeps three cards: value, gain, today).
- **Gold value card.** Shows the grams and sovereigns (8 g) behind the value.
- **Income & expenses, Month by month.** Tapping a category of an earlier month now opens that month, not the current one. If your category filter would hide the category, the filter is cleared for that view.
- **Home, This month in detail.** Each expense line (name and amount) can be tapped. It opens a popup on a computer and a bottom sheet on a phone with that month's entries added up by description, and a link to the full list for the same month. Lines that stand for several categories (such as the clothes, entertainment, vacation and gifts line) add them together.
- No stored data changed.

## Release 8.9.40 – Budget total, sort sheet radios, Holdings page and Home sheets
- **This month in detail.** Budget (expected) can no longer be lower than what came in. A part-month or estimated line (such as a lending line that started this month) could show less expected than was received, so the total read lower than the received figure beside it. Each line now expects at least what was received, so the total adds up from its lines.
- **Sort and filter sheet.** The radio buttons are true circles again (the general input size rules were stretching them into ovals).
- **Shares & funds, Holdings (phone).** Two summary cards: Invested first (with value now, holdings and XIRR), then Gain / loss with Overall and Today, each with its percentage. All figures use one size. Desktop keeps three cards. The Both / Shares / ETFs switch now sits right under the Shares & ETFs tab, above the cards. The Find box and the Record a buy / Add button are hidden on phones.
- **Share detail.** Sell is red.
- **Refresh and last refreshed (phone).** Shown on Overview only, not on Holdings, Watch or Manage.
- **Home (phone).** Tapping Markets today or Earning every day opens its card as a bottom sheet instead of going to another page. The two cards that sat lower on the page are removed. Desktop is unchanged.
- No stored data changed.

## Release 8.9.39 – New phone rows and sort/filter sheets for the main lists
- **One phone layout for lists.** On a phone (700 px and narrower) the main lists are now compact rows: a fixed first column (name on top, one useful line under it), an optional middle column, and a last column that **changes when you tap its heading** (the pill with the ⇄ sign). All rows change together, the order and sorting do not move, and the view you chose is remembered on that device. After the last view it goes back to the first. Tapping a row still opens it; tapping the heading never does.
- **Shares, ETFs and funds.** First column: name and shares or units. Middle: today's move (only when a day price exists). Views: Value · Invested, Gain · Return (with XIRR), Price (or NAV) · Average, Share of group · XIRR. Funds that are not linked still show "Link live NAV".
- **Bonds.** Name, holder · via. Views: Invested · Net per month, Rate · Next due, Received · Maturity. Totals follow the view.
- **FDs and Private lending.** Name, holder. Middle: bank or borrower. Views: Amount · Rate, Interest so far · Per day, Matures.
- **Money to receive.** Name, how often. Middle: this month's status. Views: Expected · With them, Received so far · Last. "Mark received" is kept.
- **Loans.** Name, type. Middle: used for. Views: Outstanding · Rate, Interest per month · EMI, Next EMI due.
- **Cash.** Accounts: name, holder, last entry, balance (pencil to edit). Transactions: description with date and category, views Amount · Balance and Amount · Account.
- **Savings and gold chits.** Savings lists: Invested · Rate, XIRR · Per day, with matures in the middle. Running gold chits: Paid · Gold, Payments · Ends. Closed lists (bonds, FDs, lending, chits and savings): Invested · Came back, XIRR · Started.
- **Controls.** Filter dropdowns sit two to a row, the shares sort selects stay inside the screen.
- **Sort and Filter sheets (phone only).** Above the shares, funds, bonds, FDs, lending and transactions lists there is now a **Sort** button (shows the field and direction) and, where the list has filters, a **Filter** button (shows how many are on). Each opens a bottom sheet: a radio per field, direction buttons named for the data (High to low, A to Z, Newest first, Earliest first), and a green **Apply**. Nothing changes until you press Apply; ✕, the backdrop, Escape or a swipe down closes without changing anything. The Filter sheet has **Reset** (back to the default: this month on transactions) and Apply; active filters show as chips you can remove one by one. Sorting and filters never clear each other, and switching the figures column changes neither. Shares and funds also sort by invested amount and by shares/units held on the phone. The old dropdowns are hidden on phones and unchanged on desktop and tablet. Same state as before (no second copy): `sortKey/sortDir` in equity.js, `flt` in fixed.js, `fSort/fDir/fAcct/fMonth/fCat/fAmt*` in cash.js. Lists with no sorting today (loans, accounts, savings, chits, closed) have no buttons.
- No trend lines are drawn because the app keeps no price history per holding; nothing is made up. Desktop and tablet (701 px and wider) are unchanged: the old table is still there and the phone rows are hidden. Other tables (reports, plan, imports, small drill-downs) keep the earlier phone cards.
- **More tables on phone rows (same release).** Gold: scheme instalments, closed chits, purchases, jewellery, others (running chits got a sort). Income & expenses: yearly budget, budget, descriptions, entries (category and account filters). Categories & budgets lists and rules. Net worth. Wealth outlook (year by year, months, ahead, actual, market) and Risk & what-if (risk groups, rules, named limits, closest to limit, what-if entries, after, time, mix). Insights: tax summary, annual review, spending anomalies. The year-by-year grid scrolls sideways inside its box on small phones.
- **Sort and filter for these tables.** Tables with no screen-level sort keep their own state on the phone (`mobileRows` in ui.js): a Sort / Filter bar appears when the table has options, nulls sort last, totals follow the filtered rows.
- **Home – Investable balance fix.** "Interest income expected" now equals what Money to receive shows as pending this month (unreceived, started, active items due before month end, plus income lines still short of expected). One shared rule, `pendingToReceive` in monthinvest.js, used by the card and the balance. Test: `tests/pendingreceive.test.mjs`.
- No stored data changed. New code: `mobileRows` in `js/ui.js`, option `mobile` on `table()`.

## Release 8.9.38 – Lending by start date, delete in Closed, sorting and filters, chit cards, Investable balance
- **Lending in "This month in detail" and "Money to receive".** Interest is paid in arrears: money lent in a month pays nothing that month and first pays the next month, only for the days it was out (lent on the 7th of December: 25/31 of the amount, in January; every later month in full). That first part month is shown as the expected amount and stays pending until it comes. Nothing shows before a loan's start date or after it was closed. A line named differently from the Money to receive entry ("Lending Pandi" and "Alagu Pandi") is now found by the shared name, and one line for a person with several loans adds each loan from its own start date. The Money to receive card and Coming up use the part-month amount too.
- **Closed tab.** Every closed record can be deleted: bonds, deposits, lending and closed Money to receive (Delete beside Reopen), and each row of "What came back, by type" opens the records behind it with a Delete for each. Only the closed record goes; bank entries stay.
- **Shares sort.** An Ascending / Descending choice beside Sort by.
- **Tax summary, interest.** For bonds, "Earned so far" is no longer pro-rated by day: whole months up to last month, plus this month only once its payment is due. Nothing is added for a month whose payment is not due yet. The bank check and the month-by-month view follow the same rule.
- **Bank transactions.** Sort by Date, Amount, Category or Description (ascending or descending), a Category filter, and an Amount filter (greater than / less than a figure). A Clear button resets them.
- **Savings → Chits.** Two cards: **Chits due this month** (what is still to pay, with what is paid under it) and **Chits due next month \*** (projected from the average of each chit's last three payments, shown in italics with a star). Tap either for the total per Organiser / company (this month has Still to pay and Paid tabs).
- **Family report print.** Parent rows (Bonds, Chits, Gold…) keep their own colour in a deeper tint with a solid edge, so the print looks like the page.
- **Home, Investable balance.** "Net monthly inflow" is replaced by a blue **Investable balance** tile, the same figure as the card under Investing this month. Its breakdown: Bank balance, Cash in hand (wallet or cash accounts), Interest income still expected (green), Pending mandatory investments, Expenses still to come (red, italic, projected). Cash in hand now counts in the balance (wallets used to be left out).
- Small fix: colours set through CSS variables on rows (family report kinds, allocation groups) now apply.
- No stored data changed. Tests: bondmonth, monthinvest, taxbonds extended.

## Release 8.9.37 – Chit payments incl. gold, bonds by due date, split transactions, tax summary
- **Home, Pending mandatory investments.** Gold chits are counted, including the running GRT Savings Account scheme. Tap the card for a popup with **Pending** (the default) and **Received**. A chit counts as paid once anything is paid into it this month, whatever the amount; pending shows what it took last month (or its monthly instalment). Gold chits run **11 months** by default: change it on Gold & others → Gold chits ("Gold chit length"). After that many months from the first payment a gold chit is no longer pending.
- **Bonds by due date.** On Home, "Money to receive this month" and "This month in detail" no longer look at the bank for bonds. The line is now called **Income Bond**. A bond is received once its due date has come (the due day itself counts) and pending until then. Tap the line: Pending shows the bonds still due, Received the bonds whose due date has passed. Bank credits are only used for the tax check below.
- **Split a bank entry.** Cash & banks → Transactions → open an entry → **Split**. The edit window closes and a split window opens: date and account stay fixed, each row has a description, category and amount. Add or remove rows. The rows must add up to the original amount; leave one amount empty to give it what is left. Split replaces the original entry with the new ones.
- **Tax summary.** Bond holdings show interest up to today only (a month still running is counted to today), and "Should reach the bank" counts a payment only once its due date has passed, so each bond can be set against the bank. "Bank against holdings" compares the payments that have come due with the bank credits. The Expected tax card is tidied: shorter card titles that line up, the bank note in normal type with a bold heading, section headings with a rule above them, assumption fields in an even grid, and the holdings list with holder and type under the name.
- No stored data changed. New optional setting: `settings.goldChitMonths`. New tests: `tests/taxbonds.test.mjs`, more in `bondmonth` and `monthinvest`.

## Release 8.9.36 – Bonds as one line, tenure instead of chit duration
- **Home, Money to receive this month.** Bonds are one combined line again (amount still to come, expected and received). Tap it to see which bonds are pending and which are received. The bond fixes of 8.9.35 stay.
- **Chit duration removed.** The "Chit duration (months)" box is gone from the chit edit form (Cash → Chits & savings) and from gold chits. A chit's length now comes from its **Tenure** (months, years or days), else from its start and end dates; gold chits use their dates. Home stops counting a chit as pending when its payments reach that length or its end date passes. A duration saved earlier is still read when no tenure or dates are set, and nothing stored was changed.

## Release 8.9.35 – Bond sorting, Money to receive and month figures
- **Bonds page.** New "Sort" and "Ascending / Descending" choices above the list: Rate, Next due, Paid so far, Invested, Holder, Via and Maturity. Bonds with nothing to sort on (no next due date) stay at the bottom either way. Works on phone and desktop.
- **Money to receive this month.** Each bond whose interest has not come yet is now its own line with its day (overdue in red, due today in amber), mixed in date order with the other dues. Before, bonds were one combined line that disappeared when the month's bank credits looked big enough.
- **Bond received figure fixed.** Received for Bonds now counts only the bank credits that settle a bond due that month. Other "Income Bond" credits (a quarterly bond paid early, late interest of last month) no longer hide bonds still to come; they are shown as "other credits" and not counted. A credit can never settle a bond before its due date (3 days early is allowed), whichever matching rule finds it.
- **Better matching of credits to bonds.** Equal or nearly equal interest amounts are now paired closest amount first, then closest to the due date, so the pending list names the right bond.
- **First payment of a new bond.** A payment cannot fall due before the money went in. A bond bought on the 12th that pays on the 9th shows nothing in the purchase month and pays the next month, with the days since it was bought.
- **Monthly lending lines (This month in detail).** When several loans share one name (for example four loans to one person) each income line now follows the loan with the same amount: its own start month and its own received date. A loan started in September first appears in October, not in September. Each line shows "lent <date>", and the Bonds line can be tapped to see each bond.
- No stored data changed. New tests in `tests/bondmonth.test.mjs`.

## Release 8.9.34 – Bond due dates, review income, Home investing
- **Bond due logic.** Quarterly bonds get a "Quarterly interest is paid in" setting (Jan·Apr·Jul·Oct, Feb·May·Aug·Nov or Mar·Jun·Sep·Dec). A payment covers the three months up to the payout month; the last month of a bond pays what is left. Bank "Income Bond" credits are matched to bonds by exact amount, then by name or issuer in the description, then by due date, and a credit never pays a bond that was not yet due. Lending that started last month first counts from this month.
- **Annual review.** Interest income is read from "Income Bond" and "Income Lending" bank credits only. Income and transfer categories are no longer offered as one-time categories.
- **Bonds page.** Net per month with "received" under it, holder and platform under the name, next due date in colour, and a short collapsed Bond settings card.
- **Tax summary.** Closed bonds carry a Closed tag (interest to the day they closed). Tap a bond for a month-by-month check against the bank.
- **Home, Investing this month.** Investable income added (tap for working), pending chit instalments (new chit duration setting on chits and gold chits), expenses still to come, and the current investable amount (bank without wallets, less chits and expenses) with its allocation. An account can be marked as a wallet.

## Release 8.9.33 – Popovers, merged bond settings, review table

- Wealth outlook: the breakdowns behind Salary + EPF, Interest, Spending and Growth open as a larger popover on click (close by clicking elsewhere or pressing Escape), with one short line per item.
- Bonds: tax setting and Home reminders are one "Bond settings" card.
- Home: the bond interest popup has Pending and Received tabs (Pending first). "Investing this month" sits below "This month in detail".
- Annual review: chart and table compare monthly interest income with monthly regular expense; the table shows one-time expense and "Short by" (income − regular expense).

## Release 8.9.32 – Home investing card, bond interest by real days, snapshots, review

- **Home: Investing this month.** What can still be invested (the higher of actual and planned money in and out, left over), what is already in, what is still to invest per plan line, and how much the bank can pay now after the spending still expected before month end.
- **Bank entries:** any entry can be changed to the Transfer category; the date filter has This year, Last year, This financial year and Last financial year.
- **Bonds:** interest uses the real days of the month (28, 30 or 31, fewer in the month a bond is bought or closed). Calculation settings moved here from Settings (tax on bond interest); the fixed days-in-month setting is gone. Received interest is green. Home: Money to receive shows which bonds are still pending (tap or hover); Coming up uses the same amounts. A past month only expects bonds and lending you held then.
- **Tax summary:** the bank check compares with holdings up to today; small gaps show as a note, not an alert.
- **Annual review:** the one-time picker lists every category; interest is compared with regular spending only (no EMI, no one-time); a card shows how much more to invest at 10%, 12% and 15% to cover the gap.
- **Wealth outlook:** the EMI stays flat; Salary + EPF, Spending and Growth columns with hover breakdowns; a new card explains each month's interest change; snapshots keep the plan for the month, the assumptions and the actuals ("See what was saved"); "Where it went right or wrong" is last.

## Release 8.9.31 – This year and Years ahead now agree

- Both tabs project from today's position with the same assumptions (salary, EMI, EPF, raise and its month, expense rise, outlook, yearly and dated one-time bills, investment lines), so December of this year shows the same net worth on both. The This year plan used to start from the position saved when the plan was made and ignore the Years ahead settings.
- Editing salary and the other everyday figures in the plan form, or the outlook on This year or Market outlook, now updates the same settings Years ahead uses.

## Release 8.9.30 – Collapsible assumptions, EPF follows the raise

- Years ahead: "What the projection grows by" is collapsed by default; the Markets group is tidied.
- EPF now rises with the salary raise, in the same month and by the same %.

## Release 8.9.29 – Easier tapping

- Stacked charts: each column's whole slot is tappable, not just the thin bar, so month columns are easy to hit on a phone.

## Release 8.9.27 – Wealth outlook: new money from what is left, hike month, one assumptions card

- **New money is what is left.** Each month the projection invests whatever remains after spending, EMI and one-time bills, split by the shares of your plan lines. Tax or fee months invest little or nothing. After a dip, cash is topped up to today's level before investing again. The planned monthly amounts are now only a guide to the split. EPF is added every month as before.
- **One assumptions card** on Years ahead: salary, other income, expenses, EMI, EPF, raise %, expense rise %, one-time bill rise %, the month the raise lands (salary and EMI step up together), target and market outlook.
- **Yearly one-time bills** sit in a drop-down under a summary line.
- **Totals add up.** Month tables show salary, interest, expenses, EMI, one-time, invested, EPF, growth and net worth, with a line that adds them up.
- **Year chart opens a month chart.** Income green, spending red, investing blue.

## Release 8.9.26 – Bond charts and reminders, clearer Wealth outlook, annual review

- **Bonds**: pie of who owns what, bar of money per company, and one setting for Home reminders of bond interest (on or off, how many days before). It applies to all bonds.
- **Wealth outlook, This year**: "How this is worked out" shows every step behind "Available to invest each month" and checks it against what your bank history shows you actually kept. Yearly one-time bills (tax, school fees, trips) are set aside one twelfth a month.
- **Wealth outlook, Years ahead**: salary raise, expense rise and growth of new investments are set on the page itself. Yearly bills (add by hand or find them in bank entries) repeat each year and grow with expenses. Income, spending and investing are shown as stacked bars, monthly for the first year and yearly after that. Open a year to see its months. A year-by-year table sits below the net worth graph.
- **Cash calendar**: only the maturity chart remains. Tap a bar to see what matures.
- **Annual review**: pick this or last year. New chart of bond and lending interest against spending without EMI. Tap a month for its category summary. A table shows interest, regular spending, one-time spending and the deviation. Choose which categories count as one-time.

## Release 8.9.25 – Simpler tax page, refund and bank check, bonds, shares tabs, month-by-month chart

- Tax summary → Expected tax: TDS counts as tax already paid, projected to March. What is left is shown as "Still to pay" or "Refund expected" (all TDS comes back when income is inside the tax-free zone). There is also a check of the interest the bank received against what the bond holdings say, with a mismatch warning. The page is simpler: one card with the answer, then collapsible sections for how the income adds up, tax and TDS, assumptions, each holding's interest, and the older detail (by person, owners, bank income, interest, dividends, capital gains). Nothing was removed.
- Bonds: maturity date sits at the right of the bond name in a lighter colour, the last column is now interest received so far (after TDS), and the total row also shows on phones.
- Shares & funds → Where to look: All, Shares, ETFs and Funds sub tabs.
- Income & expenses → Month by month: columns are stacked by category, with a range filter (this month, 2, 3, 6, 9 or 12 months). Tap a column to see what is inside it, for example one month of income.

## Release 8.2 – EPF / PPF return

The EPF & PPF return now uses the interest rate EPFO declared each year (8.25% for 2023-25, and so on), applied to the deposits in your entries, instead of only the interest rows you typed in. For years after the built-in table, and for PPF, the account's own rate is used. The row note also shows what your recorded interest works out to. Edit the table in `js/epf.js` if a rate is wrong. No backend change.

## Release 8.3

- **Backend update needed for “Fetch dividends” only.** Open your Apps Script project, replace the code with the new `backend/Code.gs`, then *Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy*. The URL and keys stay the same. Everything else works without this.
- Cash & banks: add and edit accounts; Transactions can be filtered to expenses, investments or income, with description and category in one column.
- Shares & funds: exposure is now the share within its own group (shares among shares, ETFs among ETFs, funds among funds); XIRR on the invested cards; each fund has a page with its buy history, “Record a buy”, “Sell” and “Edit fund”; Investment Planner order is plan, bought table, chart.
- Dividends tab: “Fetch dividends” finds dividends from your buy history and shows them for approval before adding.
- Savings & chits: “Chits & savings” now appears under “How your investments did” (≈ = estimate from the expected payout or assumed rate; kept out of the overall XIRR). Closing a chit asks for the date and the amount actually received.
- Menu can be collapsed to icons (desktop). Wider layout on large screens. Action buttons keep their words on phones. Delete confirmations list what is being deleted.

## Release 8.3.1

Cash → Transactions: on a laptop, Amount and Balance are separate columns; the phone layout is unchanged.

## Release 8.4 – Wealth projector

A new page, **Wealth projector** (side menu, and a link on the Plan page). The Plan page built from your Excel is unchanged. No backend change and no redeploy of Apps Script is needed.

- **This year**: set the year-end target, salary, everyday spending, loan EMI, new money going into each investment (with its own return or outlook) and one-time items (tax, school fees, a trip). Interest from bonds and lending is added automatically from your holdings. The page shows the month-by-month plan, a chart of target / plan / actual, and how far you are from the target.
- **Month-end check-in**: on the last day of the month refresh prices and press *Save snapshot*. Snapshots feed the "actual" line, the ahead/behind column and the "where it went right or wrong" breakdown by asset class. The forecast line restarts from today's real position.
- **Year-end review**: two notes (what went well, what to do better), saved with the plan.
- **Years ahead**: projects 5–25 years using the plan's returns, with its own salary raise, spending growth and new-money growth. "Compare all outlooks" shows every outlook at once.
- **Market outlook**: shares, ETFs, funds and gold cannot be predicted, so they follow an outlook you pick with one tap: Loss (−10%), Flat (0%), Low (5%), Steady (9%), Good (13%), Strong (18%). Names and rates are editable (*Edit outlook scale*). The tab shows what each outlook means for the year end, the return markets must give to reach your target, and your own XIRR as a reality check.
- If planned investments are more than you save, cash goes negative in the table. That means the plan asks for more than is earned.
- Plans start from today's numbers. Creating next year's plan in December gives a clean January start. Everything is stored in `data.projector` and syncs like the rest of your data.

## Release 8.4.1 – Family report print
Larger, easier-to-read type on both printed pages, a smaller banner and cards, and the Total row removed from page 1. The holdings list still fits on one A4 page; the charts and contacts are page 2.

## Release 8.5 – Planned vs actual, Risk limits, What-if
No backend change. The Wealth projector now has five tabs: This year, Years ahead, Market outlook, **Risk limits**, **What-if**.

- **Extra to save** replaces "Extra to invest". The old figure asked how much more to put into a fixed deposit, which only earns the small interest difference and gave absurd amounts. The new one is how much more to set aside each month (earn more or spend less) to reach the target.
- **Years ahead** shows every asset today, at the end of this year and at the end of the horizon, with shares, using the plan's new-money lines.
- **Planned and actual new money** (This year tab, Monthly and Yearly views). Actual comes from share and ETF trades, fund purchases, the start date of each bond, deposit and loan, gold purchases and chit entries. Bank entries fill any month with no such record. EPF and PPF are left out (they come out of salary).
- **Risk limits** (settings saved in `data.risk`): five risk groups with optional caps, a risk group and cap for each kind of holding, a cap for any one share, ETF, fund, bond issuer or person lent to (as a share of its group or of everything, and/or in rupees), and caps for named holdings. Starting values: private lending 15%, any one share 12% of the shares, Navi bonds ₹10,00,000. Change them to yours. Funds and ETFs start with no cap.
- **Home → Where your money is** now uses these risk groups and shows what is over a limit.
- **What-if** is a scratch pad (nothing is saved to your records). Add an investment, a sale or a spend, and see the mix after, what goes over a limit, the most you could put in, and how net worth and the mix change over 1 to 20 years under a chosen market outlook.

## Release 8.5.1 – What-if for shares, ETFs and funds; choose what limits are measured against
- **What-if** takes a share, ETF or fund by name or symbol with **quantity × price** (the price fills in from your holding's last price) or a plain amount. New names not in your holdings work too. Each row shows the exposure of that holding before and after, against its limit. A purchase with no name counts toward its group but is not checked as one holding.
- **Measured against** is now a setting. On the Risk limits tab, switch risk-group and kind limits between **Everything I own** and **Investments only** (bank balances left out). Each kind, each single-holding rule and each named holding can also choose **Market-linked only** (shares, ETFs, funds) or **Its own group**.
- Name suggestions in the Risk and What-if forms now show up as you type.

## Release 8.9.24 – Savings interest in the tax estimate

- Tax summary → Expected tax: interest credited to your savings accounts now counts as income, projected to March at the pace so far. Bond interest credited to the bank is not counted twice.

## Release 8.9.22 – Tax estimate, bond due dates, fixes

- Insights → Tax summary: new "Expected tax" card for the chosen financial year under the new regime. Salary is projected to March, bond and FD interest is worked out from the holdings (gross, so TDS does not matter), and you can type other income. It shows total income, expected tax, TDS so far and by March, how much room is left before tax starts, and how much more could go into bonds at a rate you choose and still pay no tax. Expand "Where the interest comes from" to see each holding. Private lending and chits are left out.
- Bonds: optional interest due date (first day, last day or a fixed day of the month). On that day the bond shows under "Needs a look" on Home. Bonds with no date behave as before.
- Gold chits: the "Try a gold rate" box no longer types backwards.
- Net worth over time: the "What you own" chart shows a short message until two month-end check-ins with their asset mix are saved.

## Release 8.9.21 – Fix a stuck "pending" income line

- Home → Money to receive this month: tap a pending income line to mark it received for the month, or remove it for good.

## Release 8.9.20 – Received per person, closed summary, gold what-if, allocation outlook

- Home "Money to receive this month" no longer shows a payment as pending once you mark the matching due as received.
- Lendings → Money to receive: "Received so far, by person" drop-down (a card at the bottom on phones).
- Closed tab: new card at the top, by type. Bonds and deposits by item, private lending added up per person (put in, interest, principal back, total), including people whose dues were closed.
- Gold chits: "Try a gold rate" box on the Best option card. Blank or cleared uses the live rate.
- Income & expenses: budget alert has a Dismiss link, hidden for 5 days (until the alert changes).
- Allocation: removed "If you put in more" and "Year by year". New "How the mix changes if you invest this way": today next to this year end / next year end / 2 to 5 years, tap a slice to see inside, with a grouped table.
- Net worth over time: new area chart of debts, gold, equity and others by month; tap a colour to see inside.

## Release 8.9.19 – Tidier top bar and combined Shares & ETFs

- The "Prices updated … ago" note and the Refresh button now sit on the right of the tabs (below them on a phone), smaller and on one line. The extra "P/E, 52-week range and alerts updated" line is gone; hover the note to see when each was last fetched.
- Holdings: Shares and ETFs are one view with a Both / Shares / ETFs switch; the second row is now Shares & ETFs, Funds, History.

## Release 8.9.18 – Simpler Shares & funds menu

- Nine tabs became four: **Overview** (today, alerts, where to look), **Holdings** (Shares, ETFs, Funds, and History with Sold and Dividends), **Watch** (Alerts & watchlist, Insights) and **Manage** (Investment planner, Import; the owner only, hidden on view-only devices).
- One **Refresh** button fetches prices, NAVs and the P/E, 52-week and alert numbers together.
- Old links and bookmarks (#/equity/today, /funds, /sold, /sip, /import and so on) still work and move to the new place.

## Release 8.9.17 – Alerts, watchlist, fundamentals and "where to look"

- Shares & funds → **Alerts & watchlist**: set alerts for any share or fund, held or not. Rules: price or NAV below/above, P/E below/above, price-to-book, dividend yield, near the 52-week high or low, down X% from the high, below/above the 200-day average, big one-day move, fund 1-year return. Shares and funds you do not own go on the watchlist.
- **Today** shows triggered alerts at the top (also on Home under "Needs a look") and a "Where to look" section: near 52-week high and low, lowest and highest P/E, fallen most from the high, below the 200-day average, biggest winners and positions you hold, highest dividend yield, strongest and weakest funds. Switch between your holdings and holdings plus watchlist.
- Each share and fund page has a Fundamentals card: P/E, price to book, dividend yield, 52-week range bar, 50 and 200-day averages; business quality (ROE, debt, margins, growth) on demand; for funds 1m to 5y returns, ups and downs and how far below the all-time high.
- **Backend update needed for shares:** `backend/Code.gs` has two new actions, `fundamentals` and `details`. Paste it into Apps Script and deploy a new version (Deploy, Manage deployments, pencil, New version). Funds work without it. Indicators are kept on each device; alerts are checked when you open the page or press Refresh indicators (there are no push notifications).

## Release 8.9.16 – Allocation goal by group, price history, tidier Home

- Insights → Allocation goal: type targets at group level (Debts & fixed income, Gold, Equity, Others). Blank groups keep their current share and split what is left. Inside Debts & fixed income you can set a row (for example Bonds 25% of the group) and the other rows follow. Totals above 100% are refused. "Goal against today", "Where new money should go" and "Year by year" are grouped; tap a group to see its rows (shown as a share of the group). New: monthly amount needed to reach the goal in 3, 5 or 10 years, and how much would have to move today.
- Gold chits: the best-option card now shows the profit in rupees of each option, and the recommendation says how much more it is worth.
- Home: removed "Shares, ETFs & funds: how each did" and "Monthly inflow after loan interest". Loan interest is shown in red inside the summary tiles. A group or row whose XIRR points the opposite way to its plain gain is no longer shown (the imported trades do not add up); a group XIRR far outside its rows falls back to their value-weighted average (marked ≈).
- Shares & funds: price history chart on each fund (NAV from mfapi.in) and each share, with 1M to Max, "since my first buy", Price / Change % and your average cost line. Shares need the updated backend/Code.gs (new "history" action): paste it into your Apps Script project and deploy a new version.

## Release 8.9.14 – Gold chit closing, alerts you can hide, payout interest, owners

- Home: "Needs a look" rows can be hidden for the day (comes back tomorrow; card disappears when all hidden). Chit alerts show the entered maturity amount. "How your investments did" group XIRR now uses a multiple-root-safe calculation.
- Gold: closing a chit compares "by value" with "by gold saved" at today's rate (give the gold rate on payments to enable it), takes grams bought plus any extra amount paid, and adds the purchase. Gold value, gain and XIRR are one card; a new card shows total gold including jewellery in grams and sovereigns.
- Fixed income: private lending can record the payout amount (monthly/yearly); interest received follows it.
- What-if: "Where you stand today" uses the same risk/type chart as Home. Wealth projector is now Wealth outlook; Years ahead adds 1 year.
- Tax summary: owners of FDs and lending now come from the holder or the account owner.

## Release 8.9.13 – Risk colours, years-ahead options and category projection

- **Home → How your investments did:** the group line showed the plain gain on money put in ("44%") next to the XIRR, which read like one number. They are now labelled "Return" and "XIRR". The group XIRR is calculated from the combined dated cash flows of its rows (checked: two sets of flows at 12% and 8% combine to about 10%, never higher than both), so it always lands between its rows' XIRRs. If it ever looks off, send me the group's rows.
- **Risk colours:** safe is dark green, low risk light green, medium amber, high red, very high deep red. Used on Home → Allocation & risk (By risk), Risk limits and What-if. Custom risk groups are spread along the same green-to-red ramp in order.
- **Years ahead:** look-ahead choices are now 2, 3, 4, 5, 7, 10, 15, 20 and 25 years.
- **Years ahead → Net worth over the years:** new "By category" view with a stacked area chart filled in each category's colour (Debts, Gold, Equity, Others), chips to view one category alone, and a table of today, end value, change, times and yearly growth, with the fastest marked. Growth includes new money added to each category.

## Release 8.9.12 – Allocation list under the chart

Home → Allocation & risk: the list now sits below the chart at full width instead of beside it.

## Release 8.9.11 – Phone Report tabs, one allocation list, chit XIRR, tax by person

- **Phone navigation:** the Report tab opened only the Family report because that page had no tab strip. All Report pages (Family report, Net worth, Income vs expense, Insights) now show the strip on a phone. It is still hidden on a computer (the sidebar has them) and in print.
- **Home → Allocation & risk:** the separate legend is gone. The chart sits beside the list, which is always visible, with coloured keys, a share bar and the share of everything and of its group. Tap a slice to zoom in; that group opens in the list with colours matching the zoomed chart.
- **Chits and RDs:** the XIRR with an expected payout now counts every instalment still to be paid, one a month from the last payment to the end date (before, it needed a tenure and otherwise counted none). New optional field "Monthly payment for the remaining months"; empty means the average paid so far. The projected payout uses the same instalments. Clearing "Expected payout" (or the monthly payment) now works; before, the old value stayed.
- **Tax summary by person:** pick All people or one person at the top. A "By person" table shows each person's interest, salary, dividends and gains. "Who owns which account" sets the owner of the stocks account, the fund account and each bank account (type a new name to add someone, e.g. a a joint family account). Bonds, FDs, lending and savings use the holder already on each. The CSV carries the selection. Saved in the data file as `taxOwners`.

## Release 8.9.10 – Chit payout projection, grouped Home cards

- **Chit expected payout:** the alert and the Cash calendar now show the expected payout you entered on the chit (or RD). If you left it empty, the amount is projected: payments so far plus the remaining instalments (at the average paid so far) grown at the chit's assumed yearly rate to its end date; it is marked "≈ projected". If there is no rate either, it shows what has been paid in. "Close it" suggests the same figure. If a chit has a tenure but no maturity date, the end date is worked out from the first payment and the tenure.
- **XIRR with an expected payout** was checked against the dated cash flows (the payments, the remaining instalments and the payout net to zero at the reported rate). Fixed: an expected payout was ignored when the maturity date was blank; remaining instalments are no longer dated after the end date.
- **Home → Allocation & risk:** switch between "By investment type" (Debts, Gold, Equity, Others) and "By risk" (your risk groups). Tap a group in the chart or list to see a chart of what is inside it, with each kind's share of the group and of everything. The table below has expandable parents with the same figures and limits.
- **Home → How your investments did:** grouped into Debts, Gold, Equity and Others. The group row shows invested, value, gain and an XIRR worked out from its rows' dated cash flows together (* = some rows left out because they have no dates or are only estimates). Tap a group to see its rows.

## Release 8.9.9 – Four groups, tax and calendar tweaks

- **Four high-level groups** (Debts & fixed income, Gold, Equity/ETFs/mutual funds, Others) with expandable parent rows, on: Wealth projector → Years ahead "Where it sits", Risk limits "By kind of holding", What-if "Your mix, today and after", and Insights → Allocation goal "Goal against today". The parent shows the group total and share; tap it to see the kinds inside (tap a kind on Risk limits to edit it). Print shows everything open.
- **Tax summary:** "Other income credited to the bank" is now at the top.
- **Cash calendar:** a red/amber alert at the top for anything maturing within a month, or already past its date (bonds, FDs, lending, chits, savings).

## Release 8.9.8 – Insights menu

One new menu, **Insights** (left navigation, under Report), with five sub tabs:
- **Tax summary**: pick a financial year (April to March). Interest on bonds, FDs and private lending by days held in the year, bond TDS estimate, salary and other income credited, dividends, and short/long-term capital gains on shares and mutual funds (oldest units first). Download as CSV. A guide for filing, not tax advice.
- **Cash calendar**: next 3/6/12/24 months of maturities (bonds, FDs, lending, chits, savings), monthly interest, money to receive and loan EMIs, with a maturity ladder chart and running cash.
- **Annual review**: income, spending, invested, left over, net worth change, best and toughest month, top spending and a month table with plan comparison. Print friendly.
- **Spending anomalies**: categories well above their 6-month average, new categories, large single payments, and regular spending that did not happen.
- **Allocation goal**: set a target mix for Bonds, Private lending, EPF/PPF/FDs/RDs/insurance, Stocks/ETFs/funds, Gold, Chits and Others. It shows the gap, how long it takes to reach the goal by adding new money (nothing is sold), where the new money should go, what happens if you add more, and a year-by-year path. Three starter presets (not advice). Saved in the data file as `allocGoal`. Linked from the Wealth projector.

No change to existing data. Service worker cache v34.

## Release 8.9.7 – Net worth report: period filter and planned line

- Period picker: past 3, 6, 12 months, this year, last year, past 2 years, everything.
- A dotted **Planned at the start** line: the Plan sheet's own path (start position plus the planned saving each month, not re-based on actuals), then any Wealth projector year plan for months the sheet does not cover. The table gets Planned and Against plan columns, and a stat shows how far ahead or behind the plan you are.
- `charts.js` line series accept a `dash` pattern.

## Release 8.9.6 – Darker parent row shade in print

The parent row highlight in the printed family report is a little darker. Only `css/app.css` changed.

## Release 8.9.5 – Lighter lines in the printed family report

Parent and child row lines, the header line of the holdings table and the parent row shade are lighter in print. Only `css/app.css` changed.

## Release 8.9.4 – Net worth report, safer bank import, calmer family report

- **Net worth over time** (Report menu): month-end snapshots as a solid line, today, then a differently coloured dashed line projected to December. Months that exist only in the Plan sheet are included. Table underneath.
- **Home:** the Net worth over time card is gone. A new **Risk alerts** card sits in its place (over-limit and close-to-limit holdings). The old card is now **Allocation & risk**.
- **Wealth projector → Month by month** now lists every month of the year. Months before the plan started show their snapshot. A **Bring them in** button copies month-ends typed into Plan → Month by month into snapshots (only months with no snapshot; nothing is overwritten; no data migration runs by itself). The current month row is highlighted.
- **Bank import:** rows missing an account, date, description, amount or category are highlighted and block the import (or use “Leave out these rows”). A row whose account, date and description already exist, but with a new amount or category, now **replaces** that entry (it shows “was ₹x”) instead of adding a second one. Identical rows are skipped.
- **Family report:** printed version is greyscale with hairline borders (parent rows a little stronger than child rows), header has a bottom line only, “As on” in grey, Total Assets and Loans in Crores/Lakhs, Net worth and Monthly interest income bold, item-by-item heading removed. The tab strip no longer shows on this page (links to the other reports are at the bottom) or in print.
- **Settings:** the Loans list is removed (it lives in Fixed income → Loans).
- New `js/views/networth.js`; `projector.planSheetSnapshots`; `bankimport.matchExisting`.

## Release 8.9.3 – Income vs expense report, bolder gain card

- New **Report** menu group with **Family report** and **Income vs expense** (also a tab strip on phones).
- Income vs expense: pick a month, this year, past 12 months or all time. Shows income, expenses, invested and left over, a bar of where the income went, then three lists (Income, Expenses, Investments). Each category opens to its descriptions with amounts and share. Investments show the allocation (share of everything invested) and how each category was split inside. Loan EMI and tax are in expenses; transfers are left out.
- Shares & funds: the Invested card now leads with gain/loss and XIRR; the invested amount is the small line.
- New `js/views/incexp.js`, `calc.flowReport`; added to `sw.js`. Settings moved to a "Manage" group.

## Release 8.9.2 – Print-friendly family report

When printed or saved as PDF, the Family report now uses pure black text on white, an outlined header and outlined KPI tiles (coloured edge only), and plain boxes. It uses far less ink and stays readable on a black-and-white printer. The on-screen look is unchanged. Only `css/app.css` changed.

## Release 8.9.1 – Paste into bank import

No change to your stored data. No backend change.

- **Import bank transactions** now opens with a text box. Paste rows straight from Excel, Google Sheets or CSV text (first line = column names: account, date, description, credit, debit) and press **Preview pasted rows**. Choosing a CSV file still works. The same preview, category suggestions, new-category option and duplicate check apply.

## Release 8.9.0 – Budgets, bank import, EMI dates, menu groups

No change to your existing stored data and no backend change. New optional fields only: `categoryList[].yearlyBudget`, `liabilities[].emiDay` and `liabilities[].emiPaidOn`. Old files work as before.

- **Budgets:** a category can have a monthly budget, a yearly budget, or both (Expenses → Categories & budgets). Expenses shows an alert when a budget is 80% used (this month against monthly budgets, this year against yearly ones), in red when over. A **Yearly budget** table shows spending from 1 January against each yearly budget.
- **Import bank transactions (computer only):** Cash & banks → **Import**. Choose a CSV with the columns account, date, description, credit, debit. The preview lists only what is new (entries already in the app are left out), with a suggested category for each from your auto-fill rules. Change any category, or choose **+ New category…** to create one and pick its type (expense, income, investment or not counted). Accounts in the file that do not match yours can be mapped. A restore point is saved first. The button is hidden on phones.
- **Risk & what-if:** anything over a limit now shows with a red OVER LIMIT tag, a thick red border and a tinted background. Amber ones stay lighter.
- **Wealth projector:** This year has a new **Interest income expected** section. Years ahead has **Interest income: how it grows** (paid out each month, credit a day, interest added inside deposits, EPF and chits, and debt investments at each year end).
- **Cash → Transactions** opens on the current month.
- **Menu (computer):** Home, then Assets, **Spend & plan** (Income & expenses, Plan, Wealth projector, Risk & what-if) and **Share & manage** (Family report, Settings).
- **Fixed income:** Money to receive has a green **Total received** column and a green Received so far card. Interest cards (Interest to receive, Interest so far) are green. Interest so far counts interest only, never the amount lent or deposited; for payout items it is the interest paid out so far at the stated rate.
- **Loans:** an optional **EMI due on day**. The table shows the next EMI date. Home → Needs a look warns when an EMI is due within a week, due today (amber) or overdue (red), and Coming up lists it. An EMI counts as paid when a bank entry in the Loan category is within 5% of the EMI this month, or when you press **EMI paid this month** in the loan.
- Dialogs without buttons no longer show a stray "null".

## Release 8.8.5 – Salary with EPF

No change to your stored data. No backend change. The projection itself is unchanged.

- **What the plan assumes:** the first tile is now **Salary with EPF** (bank salary plus the EPF added each month), with the split shown under it. The EMI tile is now just **Loan EMI**.
- **Available to invest** explains that EPF is saved before salary reaches the bank, so it is not counted in the available amount.

## Release 8.8.4 – Available to invest

No change to your stored data. No backend change.

- **Wealth projector → This year → New money going in each month** now starts with **Available to invest**: salary, other income and interest from bonds and lending (after TDS), minus the everyday expenses and EMI set in the plan. Beside it, **Still to plan** shows what is left after the investments already listed, or **Planned over** in red when they add up to more than is available.
- A note shows the average one-time items (tax, fees) over the rest of the year and what is left to invest after them.
- The table has a new **Of available** column: each investment as a share of the available money.

## Release 8.8.3 – Bond TDS on the top card, tidier holdings cards

No change to your stored data. No backend change.

- **Bonds:** the TDS line is removed from each card. The top card now reads "Interest to receive" (monthly, after TDS) with "after ₹x TDS" just below it. Each bond card still shows its net amount per month.
- **Shares & funds on a phone:** the symbol is gone from the card. Exposure shows as the bar and percent beside the quantity and average price. Value and invested sit on the left, gain with return % and XIRR on the right, and price with today's change runs along the bottom.

## Release 8.8.2 – Fixed income cards, compact holdings, due today

No change to your stored data. No backend change.

- **Fixed income on a phone:** the Total card is gone from Bonds, FDs, Lendings, Loans and Closed (the top cards already show it). Rate and interest figures are highlighted. Bonds: the "Paid" line is joined to the rate, for example "10.75% (monthly)" with only the rate highlighted, and the net amount per month shows with the TDS paid just below it.
- **Shares & funds on a phone:** cards are about half the height. The name uses the full width. Value sits beside the price, with gain or loss, return % and XIRR directly under the value. Exposure is under the price.
- **Cash on a phone:** a pencil icon beside the account name replaces the Edit button.
- **Risk & what-if:** the rule windows for each FD bank, chit organiser and insurance / RD no longer say "all your undefined".
- **Due today:** money due today shows as "Due today" in amber, not overdue in red, in Money to receive, Home and Coming up. It turns overdue the next day.

## Release 8.8.1 – Handover notes

- Added `docs/HANDOVER.md`: what each page does, where the code is, the data keys and the rules to keep. No app changes.

## Release 8.8 – Tabs for lending and savings, real cards on phones, investments-only risk

- **Fixed income** now has tabs: Bonds, FDs, Lendings (private lending plus Money to receive), Loans (the loans you owe) and Closed. Money to receive shows what came in this month and the total received so far.
- **Savings** has tabs: Chits, Provident fund, Insurance, RDs (and Other when you have any), Closed.
- **Risk limits** are always measured against investments only (bank balances left out). The Everything / Investments switch is gone. Old settings keep working: a stored "everything" choice is read as "investments".
- **Needs a look** names what is falling due and when ("a lender: due tomorrow", with dates when there are several).
- **Home:** the "not counted in Spent" list is a Review link that opens a popup, so the page stays short.
- **Phone cards:** each row is a bordered card with spacing. Overdue cards are tinted red with a red edge, waiting ones amber, and a tapped card highlights green.

## Release 8.7.2 – Phone tables as cards

- The "All columns" button is gone everywhere. On a phone every table row is now a small card: the name on top, then every column with its label underneath, so nothing is cut off or hidden. Totals show as a card at the bottom.

## Release 8.7.1 – Phone navigation and add-transaction focus

- The Plan tab is gone from the phone's bottom bar (still in the desktop menu, and reachable from the Wealth projector's "Plan page" link). The bar has five tabs.
- Add transaction opens with the cursor in Amount.

## Release 8.7 – Outlook tab, price age, calmer buttons, Home spending

- **Risk & what-if is its own page** (sidebar: "Risk & what-if"). Wealth projector keeps This year, Years ahead and Market outlook.
- **Phone: one "Outlook" bottom tab** covers both pages. A switch at the top moves between Wealth projector and Risk & what-if. Old links to `#/projector/risk` still work.
- **Shares & funds:** "Prices updated 5 min ago" on the left (amber with a warning mark when older than a day), Refresh prices with text on the right.
- **Buttons:** one main (green) button per screen. Add account, Add FD, Add rule and similar are now plain buttons like Transfer.
- **Home "Spent"** only counts groceries, outside food, medical, travel, rent, utilities and the lifestyle line. Anything else paid out (loan EMI, tax, others, custom categories) is now listed under "Not counted in Spent" in This month in detail, with a tick box to count each one. The tile also shows how much is not counted. The choice is saved as an optional `settings.homeSpendExtra` list; files without it work as before. Investments, transfers and income are never counted as spending.
- No data changes needed.

## Release 8.6 – Risk rules for every kind of holding, amber warnings, what-if with rates
No change to your stored data. Nothing is migrated, renamed or removed. The new entry fields below are optional: records without them work exactly as before, and a blank field is not saved.

- **One-holding rules now cover** shares, ETFs, funds, bond issuers, people lent to, FD banks, chit organisers and insurance / RD. Each rule has a percentage, a rupee amount, or both (the stricter applies), measured against its own group, market-linked money, investments only, or everything.
- **Kinds and risk groups can have a rupee cap** as well as a percentage.
- **Optional fields on the entry screens** let you say who a holding is with, so the limits group things correctly. If left empty the app guesses from the name, as before:
  - Savings (chits, insurance, RD and your own types): **Organiser / company**
  - Fixed deposits: **Bank / issuer** (bonds already have Issuer)
  - Private lending: **Lent to**
- **Home → Where your money is** shows what is over a limit in red and what is close in amber, with how much is left. Settings → Risk limits has "Show amber when a limit is 80 / 90 / 95% used".
- **What-if** takes a bond purchase or a new loan with its own **interest rate** (it earns that rate in the projection and pays out monthly interest, as the real one would), and a trade by quantity × price. The mix after is shown in rupees and percent, with over (red) and close (amber) marked.

## Release 8.23.0 – Android app (Capacitor), phone payment reminders

- **New `android/` folder** with a ready Android Studio / Gradle project, plus `capacitor.config.json`, `package.json` and `scripts/`. Build steps are in `docs/ANDROID.md`. The web app is unchanged and still has no build step; `npm run android:sync` copies it into the app.
- **Payment reminders on the phone** (Android app only). The same dates Home's "Needs a look" uses become notifications: loan EMI the day before, on the day and for three mornings if late; bond interest as many days ahead as set on Fixed income, and on the day; money due to you; bonds, deposits, chits and lending maturing. Time of day, each kind and "show amounts" are set in Settings → Payment reminders (this phone). Stored on the phone only, never in the data file. The plan is rebuilt on every open and data change (`js/notify.js`, test `tests/notify.test.mjs`).
- **Reminders use the same dates as Home's Action centre** (`C.upcoming`), so what the phone reminds you about matches what Home shows. Home itself is unchanged by this release.
- **Native feel:** Android back button (closes a popup, then goes back, then exits), pull down to refresh (latest Drive data, then share, fund and gold prices), a light tap on buttons and tabs, full-screen layout under the status bar, green splash with the app mark, launcher and notification icons from the existing icon. The service worker is not registered inside the app (files are bundled).
- **Family report → Print** opens Android's print dialog (Save as PDF), and downloads (backups, CSV) open the share sheet so they can be saved to Drive or sent on WhatsApp. This is a small native plugin in `android/app/src/main/java/com/familywealth/app/`.
- **Phone screen fixes:** a green Android title bar above the header is gone (the window was being built before the app theme was applied), and the window behind the page has a plain colour; the app ignores Android's system font size (text size is set with Aa or Settings); two smaller text sizes (80% and 90%) were added, and the app starts at 90% once on first run; no ruled lines behind the Net worth card in the app.
- **Phone top bar:** clock and battery are now dark on the light page (and light on the dark page), so they can be read. Settings → Phone status bar can hide the top bar completely.
- **Build uses Java 21 to 24:** `scripts/gradle.mjs` switches to Android Studio's Java when the Java on the PATH is newer (25 fails with "Unsupported class file major version 69") or missing.
- **Not changed:** stored data, Drive sync, prices, any figure. In a browser or installed web app nothing above appears.
