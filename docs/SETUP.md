# Family Wealth app: setup guide

A web app that also installs on Android as a phone app (PWA). It shows everything in your `the owner's Excel workbook`: Home, Cash, Fixed income, Equity, Gold, Spending, Plan and the family Report.
Your data lives in **one JSON file in your own Google Drive**. Only you (owner key) can edit. Family (family key) can only view.

## The one thing to know about "no hosting"

- **Your data is never hosted anywhere except your Google Drive.**
- The app's *code* (HTML/JS files, no data in them) must be opened from a web address for a phone to install it. Android only allows "Install app" from an https page. Pick one:
  1. **Free static host (recommended).** Upload the app folder to GitHub Pages, Netlify or Cloudflare Pages. It holds code only. Open the link on each phone, then Chrome menu > *Install app*.
  2. **Desktop only, fully local.** In the app folder run `python3 -m http.server 8765` and open http://localhost:8765. Phones cannot install from this.
  3. **APK later.** A Capacitor wrapper can package the same files into an APK so no host is needed. It was not built here (no Android SDK in the build environment).

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
