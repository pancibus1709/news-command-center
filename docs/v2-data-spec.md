# News Command Center v2: Data Layer Spec

Prepared 2026-10-31 from a live review of https://news-command-center-psi.vercel.app (Saturday, markets closed, showing the Friday Oct 30 close) and a read of the repo at `~/Documents/Claude/Projects/news-command-center` (HEAD `de1e821`).

## How to use this file in Claude Code

Read this whole file first, then work one phase at a time (Section 6). Each phase ends with acceptance checks; run them before moving on. Section 5 is the verified source catalog: use the exact endpoints and limits listed there, and if a provider's docs disagree with this file, the docs win and this file gets updated. Keep the repo's existing principles: every upstream call goes through `cached()` in `src/lib/cache.ts`, a dead source never takes the board down, and each panel says how fresh its data is.

## 0. Decision required before any build: private tool or public product

The board is on a public URL today, and two of its three data pipes are not licensed for that.

- **ICE BofA spreads (the five OAS rows in the Credit Monitor).** FRED's own series notes, confirmed 2026-10-31, say the data is "for your internal use only and you are not authorized or permitted to publish, distribute or otherwise furnish Top Level Data to any third-party without prior written approval of ICE Data." The series are tagged "Copyrighted: Pre-Approval Required." Since April 2026 FRED also keeps only 3 years of history (the live CSV now starts 2023-10-31).
- **Yahoo Finance (every quote on the board).** Yahoo's Terms prohibit automated collection, building a "data feed," redistribution, and commercial use. The free alternatives (Tiingo, Alpha Vantage) are also internal use only on their free tiers.
- **Kalshi (a FedWatch substitute).** Its Developer Agreement bars sharing the data with third parties without written authorization. It is excluded from this spec.

**Option A: private tool (recommended now).** Turn on Vercel Deployment Protection (password or Vercel auth) so only Thomas can open it. All current sources stay. Screen-sharing it in a meeting is a gray area; sending a client the link is not.

**Option B: public or client-facing product.** Rebuild on sources that allow display: Treasury par curve, NY Fed rates, FRED public-domain series, BLS, BEA, EIA, Treasury Fiscal Data and SEC EDGAR (Section 5 has the terms for each). The ICE spread rows come off unless ICE grants permission. Prices and index levels need a paid vendor license with redistribution rights.

Claude Code: ask Thomas which option before Phase 0. If he isn't available, build for Option A and keep each source behind its own module, so swapping to Option B is a change to the data layer, not a rewrite.

## Keys

The README promises "no API keys." Economic releases need free keys from FRED, BLS and BEA (EIA and Census now require keys too). Keep the board working with no keys (panels that need one show "add FRED_API_KEY" instead of breaking), and add the keys to `.env.example` and the Vercel project.

---

## 1. What works today (keep it)

- The board reads like a terminal and is dense without being cluttered. The `<GO>` search bar and company page are the strongest features.
- The Credit Monitor is the best panel: ICE BofA OAS by rating bucket, curve, breakevens, funding rates, with 1D/1W/1M deltas and sparklines, and spreads colored the way a credit desk reads them (wider is red).
- The source health chip ("22/22 live") and the per-row observation dates are the right instincts. Extend that honesty to every panel (see 2.4).

## 2. Issues found in review (fix in Phase 0)

### 2.1 The Wire is sorted by time only, so the noisiest feed wins
`getAllNews()` in `src/lib/news.ts` sorts purely by `publishedAt`; `weight` is only used to pick a winner inside dedupe. High-frequency feeds therefore crowd out high-signal ones. In the live payload of 200 stories:
- The Hill: 39 stories (about 20 percent of the board), including an Olivia Rodrigo concert item.
- Credit, Distressed and Ratings wires combined: 14 stories. Ratings wire: 0, though it fetched 100.
- Federal Reserve press: 0. SEC press: 1.

For a board whose tagline leads with credit, the credit lane is the thinnest.

**Fix:** rank by a score, not by time alone. Suggested: `score = feedWeight * tagBoost * exp(-ageHours / halfLife)` with a half-life around 6 hours, a `tagBoost` above 1 for credit and economy tags, and a per-source cap (no publisher above 10 percent of the "All" view). Show The Hill only under Politics, not in "All." Keep a "Latest" toggle for pure time order.

### 2.2 Tag inheritance mislabels stories
Tags are the union of the feed's category plus regex hits, and dedupe merges tags across copies of the same headline. So a general CNBC story that also appears in the CNBC Tech feed inherits `#ai`. Live example: "Binance says 90% of $6.3 billion hack losses are now covered" carries `#ai #world` with no AI content. Same for "Stocks started the week with promise but ended in despair."

**Fix:** for broad publisher feeds (CNBC, WSJ, FT, MarketWatch), do not add the feed category as a tag; tag from the headline and summary regex only. Keep feed-category tagging for the narrow keyword wires, where the query already defines the topic.

### 2.3 Low-frequency official sources fall off
The three-day cutoff drops Fed and SEC releases that matter most and post least. **Fix:** exempt feeds with weight 4 or above from the cutoff (keep 7 to 10 days), or pin the latest Fed statement and latest SEC release at the top of the Macro and Reg tabs.

### 2.4 Freshness labels are hardcoded
`Board.tsx` line 298 titles the panel "Treasuries (CBOE, live)" regardless of market state. On a Saturday the header clock reads 15:03 ET next to Friday's close. **Fix:** use `marketState` and `regularMarketTime` from the quote to label every Yahoo panel "live," "delayed," or "close Fri Oct 30."

### 2.5 Two different 10Y Treasury prints on one screen
The Treasuries panel shows 4.929 percent (CBOE `^TNX`, Friday close). The Credit Monitor shows 4.98 percent (FRED `DGS10`, Thursday Oct 29). Both are correct for their dates, but a reader sees two 10Y numbers. **Fix:** either label the source and date on both, or replace the CBOE block with the official Treasury par yield curve (Section 5, item 5a; its Oct 30 10Y was 4.94) and keep CBOE only as the intraday tick.

### 2.6 Credit ETF moves are price return
HYG, JNK, BKLN and EMB pay monthly. On ex-dividend days the board shows a "drop" that is just the distribution leaving the price. A 1D view can live with this; any interval view (Section 3) must use adjusted close or it understates credit returns by several points a year.

---

## 3. Interval returns (1W, 1M, 3M, YTD, 1Y, custom)

### 3.1 What the reader gets
Every quote row gains columns 1W, 1M, 3M, YTD, 1Y, and a header control "since [date]" with presets: last FOMC, last CPI, start of quarter, a typed date. Columns collapse on narrow screens; YTD stays.

### 3.2 Calculation rules (get these right; they are the whole feature)

| Instrument | Unit of change | Base | Notes |
|---|---|---|---|
| Equity indices | percent | prior close at or before the start date | Price return. Optional TR row using `^SP500TR`. |
| ETFs (credit, sectors, SPY) | percent, total return | adjusted close | Label "TR." Price-only understates credit. |
| Treasury yields, OAS, SOFR, breakevens | basis points | level at or before start | Never show a percent change of a yield. |
| FX, commodities, crypto, DXY | percent | prior close | Crypto trades weekends; use the Dec 31 UTC close. |
| VIX | points and percent | prior close | |

- **YTD base is the last close of the prior calendar year** (Dec 31, 2025, or the last trading day before it), not the Jan 2 open.
- "At or before" lookup: if the start date is a holiday or weekend, use the latest observation on or before it. `credit.ts` already does this in `at()`; extract that into `src/lib/returns.ts` and reuse it for Yahoo data.
- For spreads add one more column that is more useful than YTD: **1Y percentile** ("HY OAS 326, 86th pct of past year"). Tight vs wide versus history is the question a credit reader actually asks.

### 3.3 Implementation sketch
- New `src/lib/history.ts`: `getHistory(symbol)` using `yf.chart(symbol, { period1: <prior year-end minus 10 days, or 400 days back, whichever earlier>, interval: "1d" })`. Cache 1 hour; history does not change intraday. Combine with the 1-minute live quote for the last point.
- Concurrency: about 36 symbols. Run 6 at a time; Yahoo throttles shared Vercel egress IPs (the README already notes this). If a symbol's history fails, show "--" for its interval columns, keep the live quote.
- `src/lib/credit.ts`: widen the fetch window from 200 days to 400 so YTD and 1Y exist; keep `points.slice(-90)` for sparklines; add `changeYtd`, `change1y`, `pctile1y`. ICE BofA series on FRED now carry a rolling 3 years only (confirmed; data starts 2023-10-31). 1Y and 3Y percentiles work. Anything longer, such as "tightest since 2007," does not.
- New API field on `/api/markets` and `/api/credit`: `returns: { "1w", "1m", "3m", "ytd", "1y", "custom"? }` per row, plus `asOf` and `basis` ("price," "tr," "bp").
- `?since=YYYY-MM-DD` query param on both routes for the custom column.

### 3.4 Acceptance checks
- S&P 500 YTD on the board matches `(last / close of 2025-12-31) - 1` from the raw chart data to two decimals.
- HYG YTD TR exceeds HYG YTD price return by roughly the distributions paid year to date.
- 10Y YTD shows bp, and equals `DGS10 latest - DGS10 on 2025-12-31` times 100.
- On a weekend, every panel shows "close Fri" and no panel says "live."

---

## 4. Economic releases panel

### 4.1 First principle: a release number alone is not the signal
Markets move on the surprise, the gap between the print and what was expected. Street consensus (Bloomberg, Reuters polls) is licensed and not free. The free substitutes are the Fed nowcasts: Atlanta Fed GDPNow for GDP, Cleveland Fed Inflation Nowcasting for CPI and PCE, NY Fed Staff Nowcast for GDP. So the panel shows **Actual | Prior | Nowcast | Gap**, where Gap is actual minus nowcast. Where there is no nowcast, show Actual vs Prior and the 3-month average.

### 4.2 Panel layout
Two parts, one panel, between Risk & Macro and the Wire:
- **This week:** the next 7 days of scheduled releases with ET time and a countdown, highest-impact first (jobs, CPI, PCE, GDP, FOMC). Past releases this week flip to show their actual.
- **Latest prints:** one row per indicator with Actual, Prior, Nowcast or 3M avg, and a sparkline of the last 24 prints. Click a row to show first print vs revised (ALFRED vintages), because payrolls and GDP revisions are often the real story.

### 4.3 Indicator set and transforms (raw levels are meaningless; transform before display)

| Indicator | FRED series | Display as | Cadence |
|---|---|---|---|
| Nonfarm payrolls | PAYEMS | monthly change, thousands (diff of level) | monthly, first Fri 8:30 |
| Unemployment rate | UNRATE | level, percent | with payrolls |
| CPI headline / core | CPIAUCSL / CPILFESL | MoM percent and YoY percent | monthly 8:30 |
| PCE / core PCE (Fed target) | PCEPI / PCEPILFE | MoM and YoY | monthly 8:30 |
| PPI final demand | PPIFIS | MoM and YoY | monthly 8:30 |
| Real GDP | A191RL1Q225SBEA | SAAR percent, already a rate | quarterly 8:30 |
| Initial jobless claims | ICSA | level, thousands, plus 4-week avg | weekly Thu 8:30 |
| JOLTS openings | JTSJOL | level, millions | monthly 10:00 |
| Retail sales | RSAFS | MoM percent | monthly 8:30 |
| Housing starts | HOUST | level, thousands SAAR | monthly 8:30 |
| Financial conditions | NFCI | level; below 0 is looser than average | weekly Wed |
| Fed balance sheet | WALCL | weekly change, $bn | weekly Thu 16:30 |

Times are typical. Take values from FRED (one key, consistent API). Take dates and times from the BLS ICS feed and the BEA ICS/JSON calendar, because FRED's calendar gives dates with no times (Section 5, items 2 and 3). Go direct to BLS or BEA for values only if FRED lags a release by more than a few minutes in testing. Nowcasts: GDPNow is on FRED as `GDPNOW`; Cleveland Fed inflation comes from its chart JSON (undocumented, so guard against shape changes). Both carry use limits (see Section 5, item 7). Under Option B, check those limits before you display them.

### 4.4 Acceptance checks
- Payrolls row shows a change like "+142K," never a level like "159,xxx."
- CPI YoY on the board matches the BLS release headline for the same month.
- The "This week" list on a release morning flips the row from countdown to actual within one cache cycle after FRED publishes.
- With no `FRED_API_KEY`, the panel renders a one-line setup note and the rest of the board is unaffected.

---

## 5. Verified source catalog

A research agent verified these on 2026-10-31 against each provider's own docs and with live requests. The ICE licensing and 3-year history findings were then re-checked directly on FRED's series page. "Tested" means a live request returned real data that day. Also new: Census now requires a key on every request, and EIA rejects calls without a key (`DEMO_KEY` works for testing).

### Summary table

| Source | Use on board | Auth | Limits | Cadence | History | Redistribution OK for public site? |
|---|---|---|---|---|---|---|
| FRED API | YTD/interval returns for rates and spreads; economic calendar (releases/dates); first print vs revised (ALFRED) | Free key (fredaccount.stlouisfed.org/apikeys) | 120 req/min (429 above) | Per series; daily rates next business day | Full for most; ICE BAML* only 3 years | Public-domain series yes, with FRED notice + ToU link. ICE BAML*: NO without ICE approval. Other "Copyrighted" series need owner permission |
| BLS API v2 + ICS calendar | CPI, PPI, payrolls, unemployment, JOLTS, ECI actuals; release calendar with times | Free key for v2 (v1 keyless) | v2: 500 queries/day, 50 series/query, 20 years/query, 50 req/10s | Monthly/quarterly, mostly 8:30 or 10:00 ET | Back to series start, 20 yrs per call | Yes. Public domain, cite BLS |
| BEA API + ICS/JSON calendar | GDP, PCE price index, personal income; release calendar with times | Free 36-char UserID | 100 req/min, 100 MB/min, 30 errors/min; 429 + Retry-After | Monthly/quarterly, 8:30 ET | Year=ALL supported | Yes, display allowed; required notice "This product uses the BEA Data API but is not endorsed or certified by BEA" |
| Census EITS API | Retail sales, durable goods, housing starts, construction, trade | Key REQUIRED (new) | Not stated in fetched pages | Monthly, 8:30 or 10:00 ET | Various years to present | Yes with credit to Census + program. FRED is easier |
| Treasury par yield XML/CSV | Official daily curve 1M to 30Y, real curve, bill rates | None | Not stated | Daily (inputs at ~3:30 PM ET) | Par curve from 1990 | Not stated on Treasury pages (US Gov work; see uncertain list) |
| Treasury Fiscal Data API | TGA (DTS), debt to the penny, auction results | None | Not stated (429 exists) | Daily | DTS from 2005-10-03; debt from 1993-04-01; auctions from 1979 | Yes: "offered free, without restriction," commercial OK |
| TreasuryDirect TA_WS | Upcoming and recent auctions (bid-to-cover, high yield) | None | Not stated | Per auction | Not stated | Not stated; docs have moved to api-community.fiscal.treasury.gov |
| NY Fed Markets API | SOFR, EFFR, OBFR, TGCR, BGCR, SOFR averages/index, RRP ops, SOMA | None | Not stated | SOFR ~8:00 ET; EFFR ~9:00 ET; RRP results ~13:15 ET | Search by date range | Yes under NY Fed ToU license, with required notice/attribution |
| GDPNow / NY Fed Nowcast / Cleveland Nowcast | Free "consensus stand-in" for GDP and inflation | None | n/a | GDPNow 6-7x/month; NY Fed Fridays ~11:45 ET; Cleveland daily ~10:00 ET | GDPNow from 2011Q3; Cleveland from 2013 | GDPNow: "personal and educational use only." Others not stated |
| SEC EDGAR | Distress feed (8-K 1.03, 2.04, 3.01), filings, XBRL fundamentals | None; User-Agent with contact REQUIRED | 10 req/s total | Submissions <1s; XBRL <1 min | Full-text since 2001 | Not stated on fetched pages (US Gov records) |
| EIA API v2 | Weekly crude stocks (WCESTUS1), product stocks | Free key | Not numeric; throttled per second/hour; 5,000 rows JSON | Wed 10:30 ET (holiday shifts) | WCESTUS1 from 1982-08-20 | Yes. Public domain, cite "Source: U.S. EIA (date)" |
| CFTC COT (Socrata) | Positioning: TFF lev funds vs asset managers in ES, UST, CL | None; CFTC not issuing tokens | Unthrottled with token; shared IP pool without | Fri 3:30 PM ET, Tuesday data | Legacy 1986; TFF/Disagg 2006-06-13 | Not stated on fetched pages (US Gov work) |
| NFCI / STLFSI4 / SLOOS (via FRED) | Financial conditions and stress gauges, bank lending standards | FRED key | FRED limits | NFCI Wed 8:30 ET; STLFSI4 weekly (Wed update observed); SLOOS quarterly | NFCI 1971; STLFSI4 1993; DRTSCILM 1990 | NFCI and STLFSI4 "Copyrighted: Citation Required" (cite); DRTSCILM public domain |
| Yahoo chart (unofficial) | Current price + YTD/1W/1M/3M/1Y + adjclose | None (browser UA needed) | 429 without browser UA | Intraday | Up to `max` | NO. ToS prohibits automated collection, redistribution, commercial use |
| Tiingo / Alpha Vantage | Licensed replacement for Yahoo price history | Free key | Tiingo free 50/hr, 1,000/day, 500 symbols/mo; AV free 25/day | EOD (Tiingo ~5:30 PM ET) | Tiingo 30+ yrs | Free tiers: NO public display (Tiingo "internal use"). Need paid redistribution license |
| Kalshi | Fed decision probabilities (FedWatch substitute) | None for market data | Basic tier 200 read tokens/s (authenticated) | Live | Market life | NO without Kalshi written authorization (Developer Agreement 3.1) |

---

### 1. FRED API (St. Louis Fed)

**Use on board:** keep `/api/credit`, add `observation_start` for YTD and interval windows; build the economic calendar from release dates; show first print vs revised via ALFRED output types.

- **Base:** `https://api.stlouisfed.org/fred/`
- **Example (YTD observations, JSON):**
  `https://api.stlouisfed.org/fred/series/observations?series_id=DGS10&observation_start=2025-12-31&file_type=json&api_key={FRED_KEY}`
  (Use the last trading day of the prior year as the base for YTD change.)
- **Calendar, all releases (include future scheduled dates):**
  `https://api.stlouisfed.org/fred/releases/dates?realtime_start=2026-10-31&realtime_end=2026-12-31&include_release_dates_with_no_data=true&sort_order=asc&file_type=json&api_key={FRED_KEY}`
- **Calendar, one release (CPI = release_id 10):**
  `https://api.stlouisfed.org/fred/release/dates?release_id=10&realtime_start=2026-01-01&include_release_dates_with_no_data=true&file_type=json&api_key={FRED_KEY}`
- **First print only (ALFRED):** add `output_type=4` ("Observations, Initial Release Only") with `realtime_start=1776-07-04&realtime_end=9999-12-31`. Vintage list: `/fred/series/vintagedates?series_id=PAYEMS`.
- **Release IDs confirmed on FRED release pages:** 10 CPI, 46 PPI, 50 Employment Situation, 53 GDP, 54 Personal Income and Outlays, 9 Advance Retail Sales, 95 M3 (durable goods), 192 JOLTS, 27 New Residential Construction, 11 ECI, 180 Weekly Claims, 13 G.17 Industrial Production, 18 H.15.
- **Auth:** free key, 32 lowercase alphanumeric chars, from https://fredaccount.stlouisfed.org/apikeys. Tested: a bad key returns 400.
- **Rate limit:** "Up to 120 requests per minute are allowed before being served a 429 error code" (errors page). ToU lets the Fed adjust limits at any time.
- **Useful params (series/observations):** `units` = lin, chg, ch1, pch, pc1, pca, cch, cca, log (pc1 = YoY % change, handy for CPI); `frequency` + `aggregation_method` (avg, sum, eop); `limit` max 100000; `sort_order` asc/desc.
- **Cadence:** per series. releases/dates gives dates only, no times (YYYY-MM-DD); pair with BLS/BEA ICS for times.
- **History:** full for public-domain series. **ICE BofA (BAML*) limited to a rolling 3 years** (confirmed in series notes and in live CSV starting 2023-10-31). Other copyrighted examples: SP500 on FRED starts 2016-10-31 (10 years); VIXCLS is CBOE copyright.
- **ICE notice (verbatim, from BAMLH0A0HYM2 notes):** "Starting in April 2026, this series will only include 3 years of observations. For more data, go to the source." and "The end of day Index values, Index returns, and Index statistics ("Top Level Data") are being provided for your internal use only and you are not authorized or permitted to publish, distribute or otherwise furnish Top Level Data to any third-party without prior written approval of ICE Data." Also: "Copyright, 2023, ICE Data Indices. Reproduction of this data in any form is prohibited except with the prior written permission of ICE Data Indices." Tag: "Copyrighted: Pre-Approval Required." Applies to BAMLH0A0HYM2, BAMLC0A0CM, BAMLH0A3HYC, BAMLC0A4CBBB, BAMLEMCBPIOAS.
- **Licensing (FRED ToU):** apps used by others must link the ToU and show "This product uses the FRED® API but is not endorsed or certified by the Federal Reserve Bank of St. Louis." Third-party copyrighted series (notes contain "Copyright") require the data owner's permission for anything beyond personal use. Do not remove proprietary notices. Do not build an app that "replicates or attempts to replace the essential user experience" of FRED.
- **Gotchas:** releases/dates default excludes future dates, so `include_release_dates_with_no_data=true` is required for a forward calendar. Missing values come back as "." strings. ToU says each application should use its own key.
- **Docs:** https://fred.stlouisfed.org/docs/api/fred/series_observations.html, https://fred.stlouisfed.org/docs/api/fred/releases_dates.html, https://fred.stlouisfed.org/docs/api/fred/release_dates.html, https://fred.stlouisfed.org/docs/api/fred/series_vintagedates.html, https://fred.stlouisfed.org/docs/api/fred/errors.html, https://fred.stlouisfed.org/docs/api/terms_of_use.html, https://fred.stlouisfed.org/series/BAMLH0A0HYM2
- **Tested:** yes (key error response; fredgraph CSV for BAML, NFCI, STLFSI4, DRTSCILM, SP500, GDPNOW, ICSA).

### 2. BLS Public Data API v2 + release calendar

**Use on board:** actual and prior for CPI (CUUR0000SA0 / CUSR0000SA0 SA), core CPI (CUSR0000SA0L1E), PPI, payrolls (CES0000000001), unemployment rate (LNS14000000), JOLTS openings (JTS000000000000000JOL), ECI. Calendar with exact times from the ICS feed.

- **Base:** `https://api.bls.gov/publicAPI/v2/timeseries/data/`
- **Example (GET latest):** `https://api.bls.gov/publicAPI/v2/timeseries/data/CUSR0000SA0?latest=true&registrationkey={BLS_KEY}`
- **Example (POST multi-series with % changes):** POST JSON to the base with `{"seriesid":["CUSR0000SA0","CES0000000001","LNS14000000"],"startyear":"2025","endyear":"2026","calculations":true,"registrationkey":"{BLS_KEY}"}`
- **Auth:** v2 needs free registration at https://data.bls.gov/registrationEngine/ ; renew "at least once a year." v1 works keyless.
- **Limits (FAQ table):** v2: 500 daily queries, 50 series/query, 20 years/query, 50 requests per 10 seconds, net/percent changes yes. v1: 25 daily queries, 25 series, 10 years, no calculations.
- **Calendar (machine-readable, tested):** `https://www.bls.gov/schedule/news_release/bls.ics` returns text/calendar with exact ET times (e.g. JOLTS 2026-11-03 10:00, Employment Situation 2026-11-06 08:30, CPI 2026-11-10 08:30, PPI 2026-11-13 08:30). Covers 2025-01-03 through 2026-12-30.
- **History:** back to each series start, max 20 years per request.
- **Licensing:** "everything that we publish ... is in the public domain" (except previously copyrighted photos/illustrations); cite BLS as source; BLS emblem is trademarked.
- **Gotchas:** the 500/day cap is easy to hit if every page view calls BLS; cache server-side and refresh after release times. Values come back as strings, newest first. BLS returned 403 historically for generic clients on www.bls.gov; the ICS fetch succeeded with a browser-style User-Agent. Cleveland Fed notes BLS did not publish an October 2025 CPI, so expect a gap in that month.
- **Docs:** https://www.bls.gov/developers/home.htm, https://www.bls.gov/developers/api_faqs.htm, https://www.bls.gov/developers/api_signature_v2.htm, https://www.bls.gov/bls/linksite.htm
- **Tested:** yes (v2 keyless latest CPI returned Sept 2026 = 336.940; ICS downloaded, 313 events).

### 3. BEA API + release schedule

**Use on board:** GDP (T10101 percent change), PCE price index (T20804), personal income (T20600 monthly).

- **Base:** `https://apps.bea.gov/api/data` ("All API access is through this URI").
- **Example:** `https://apps.bea.gov/api/data/?UserID={BEA_KEY}&method=GetData&DataSetName=NIPA&TableName=T10101&Frequency=Q&Year=2025,2026&ResultFormat=JSON`
- **Auth:** free 36-character UserID; sign up at https://apps.bea.gov/API/signup/ (name, email, accept ToS).
- **Limits (User Guide, April 20, 2026):** 100 requests/min, 100 MB/min, 30 errors/min. Exceeding returns 429 with a RETRY-AFTER header; timeout "currently one minute."
- **Calendar:** ICS `https://www.bea.gov/news/schedule/ics/online-calendar-subscription.ics` (tested, times in UTC, e.g. GDP Advance Q3 2026 at 2026-10-29T12:30Z = 8:30 ET; covers 2025-07 to 2027-12). JSON `https://apps.bea.gov/API/signup/release_dates.json` (tested, keyed by release name, ISO UTC timestamps). Upcoming: Nov 25 2026 GDP second estimate Q3 + Personal Income Oct; Dec 23 2026 GDP third estimate + Personal Income Nov (8:30).
- **History:** `Year=ALL` supported.
- **Licensing (API ToS PDF):** you may build a service to "search, display, analyze, retrieve, view" BEA data; must show "This product uses the Bureau of Economic Analysis (BEA) Data API but is not endorsed or certified by BEA."; do not modify content and still attribute to BEA.
- **Gotchas:** `TableID` was discontinued in 2018; use `TableName`. Keep requests single-threaded to avoid throttling.
- **Docs:** https://apps.bea.gov/api/_pdf/bea_web_service_api_user_guide.pdf, https://apps.bea.gov/API/_pdf/bea_api_tos.pdf, https://www.bea.gov/news/schedule
- **Tested:** endpoint reachable (GETDATASETLIST with dummy key returned 200 error body); ICS and JSON calendars downloaded.

### 4. Census Economic Indicators (EITS)

**Use on board:** advance retail sales (`marts`), durable goods (`advm3`), housing starts (`resconst`), new home sales, construction spending, trade.

- **Base:** `https://api.census.gov/data/timeseries/eits/{dataset}`
- **Example (from Census docs pattern):** `https://api.census.gov/data/timeseries/eits/resconst?get=cell_value,data_type_code,time_slot_id,error_data,category_code,seasonally_adj&time=from+2025&key={CENSUS_KEY}`
- **Auth:** **key required**. Census page: "All data queries to the Census Data API now require an API key." Tested: unkeyed query 302-redirects to `missing_key.html` ("A valid key must be included with each data API request"). Request at https://www.census.gov/data/developers/api-key.html.
- **Limits:** not stated in pages fetched.
- **Calendar:** no ICS found; 2026 list view (8:30 AM): retail sales Nov 17 and Dec 16; housing starts Nov 18 and Dec 17; durable goods Nov 25 and Dec 23. https://www.census.gov/economic-indicators/calendar-listview-2026.html
- **History:** "various years - present."
- **Licensing:** products must credit the U.S. Census Bureau and name the originating program; do not alter precision.
- **Is FRED easier?** Yes for a dashboard: FRED carries RSAFS (retail sales), DGORDER (durables), HOUST (starts) with one consistent API and release IDs (9, 95, 27). Census's coded `category_code`/`data_type_code` scheme is harder to map. Use Census only if you need the advance-release cell detail the same minute.
- **Docs:** https://www.census.gov/data/developers/data-sets/economic-indicators.html
- **Tested:** dataset listing yes; data query blocked without key.

### 5. U.S. Treasury

#### 5a. Daily par yield curve (home.treasury.gov)

- **XML:** `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value_month=202610` (tested; 10/30/2026 row present: 2Y 4.56, 10Y 4.94, 30Y 5.31).
- **CSV (tested, slow, needed >20 s):** `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/2026/all?type=daily_treasury_yield_curve&field_tdr_date_value=2026&page&_format=csv`
- **Other `data=` values:** daily_treasury_real_yield_curve, daily_treasury_bill_rates, daily_treasury_long_term_rate, daily_treasury_real_long_term. `data` must be the first parameter. `field_tdr_date_value=all&page=N` is zero-based pagination, 300 rows per page.
- **Auth/limits:** none stated.
- **Cadence:** par yields "are derived from input market prices, which are indicative quotations obtained by the Federal Reserve Bank of New York at approximately 3:30 PM each business day." Publication time not stated (feed `updated` stamp observed 2026-10-31T02:04Z).
- **History:** par curve from 1990; real curve 2003; bill rates 2002.
- **Gotchas:** Treasury posts a "Developer Notice on changes to the XML data feeds"; OData XML with `d:BC_10YEAR` style fields. CSV host is slow; set generous timeouts and cache.
- **Docs:** https://home.treasury.gov/treasury-daily-interest-rate-xml-feed, https://home.treasury.gov/policy-issues/financing-the-government/interest-rate-statistics

#### 5b. Fiscal Data API (DTS / TGA, debt to the penny, auctions)

- **Base:** `https://api.fiscaldata.treasury.gov/services/api/fiscal_service/`
- **TGA example (tested):** `https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/dts/operating_cash_balance?sort=-record_date&page[size]=10&fields=record_date,account_type,open_today_bal,close_today_bal`
- **Debt example (tested):** `.../v2/accounting/od/debt_to_penny?sort=-record_date&page[size]=1` (2026-10-29 total $40.59T).
- **Auctions:** `.../v1/accounting/od/auctions_query` (from 1979-11-15) and `.../v1/accounting/od/upcoming_auctions` (sort by `-record_date`).
- **Auth:** "Our API is open, meaning that it does not require a user account or registration for a token."
- **Limits:** none stated; 429 is listed as a rate-limit response. Default page size 100.
- **History (tested):** DTS operating cash from 2005-10-03; debt to the penny from 1993-04-01.
- **Licensing:** "The data is offered free, without restriction," usable for commercial or non-commercial purposes.
- **Gotchas:** `page[size]` brackets need `curl -g` or URL-encoding. DTS amounts are in $ millions; the TGA closing balance is reported in the `open_today_bal` field of the row with account_type "Treasury General Account (TGA) Closing Balance", while `close_today_bal` is "null" (tested: 2026-10-29 closing TGA = 1,040,236 i.e. about $1.04T). DTS publication time not stated on fetched pages.
- **Docs:** https://fiscaldata.treasury.gov/api-documentation/

#### 5c. TreasuryDirect auctions (TA_WS)

- **Upcoming (tested):** `https://www.treasurydirect.gov/TA_WS/securities/upcoming?format=json`
- **Recent results (tested):** `https://www.treasurydirect.gov/TA_WS/securities/auctioned?format=json&type=Note&days=30` (returns highYield, bidToCoverRatio, offeringAmount, etc.).
- **Auth:** none. **Limits/terms:** not verified.
- **Gotcha:** the old docs URL now says "This information has moved to a new location" pointing to the Fiscal Service API community (https://api-community.fiscal.treasury.gov/...). WebFetch is blocked by robots.txt on treasurydirect.gov. Prefer Fiscal Data `auctions_query` for durability; some indirect/direct bidder fields came back null in the test.

### 6. NY Fed Markets Data API

**Use on board:** replace FRED SOFR/DFF with the source (same-morning), add percentiles and volumes, RRP usage.

- **Base:** `https://markets.newyorkfed.org/api/`
- **Examples (all tested):**
  - All latest reference rates: `https://markets.newyorkfed.org/api/rates/all/latest.json`
  - SOFR history: `https://markets.newyorkfed.org/api/rates/secured/sofr/search.json?startDate=2025-12-31&endDate=2026-10-31`
  - EFFR: `https://markets.newyorkfed.org/api/rates/unsecured/effr/last/30.json`
  - Reverse repo: `https://markets.newyorkfed.org/api/rp/reverserepo/all/results/last/1.json`
- **Rate types:** secured = all, tgcr, bgcr, sofr, sofrai; unsecured includes effr, obfr. Formats json, xml, csv, xlsx.
- **Auth:** none. **Limits:** not stated in the OpenAPI spec.
- **Cadence:** SOFR "at approximately 8:00 a.m. ET"; EFFR "approximately 9:00 a.m." for the prior business day. RRP results in test showed close 13:15 and lastUpdated 13:15:35.
- **Licensing:** use and distribution allowed under the NY Fed ToU license; presentations must carry a notice that the data "is subject to the Terms of Use posted at newyorkfed.org" and that NY Fed "is not responsible for publication of the [DATA NAME] by [NAME OF PUBLISHER]." SOFR/BGCR use DTCC-licensed inputs (disclaimer).
- **Gotchas:** `/beta/` paths exist and are for testing only. EFFR response includes target range (targetRateFrom/To), useful for a policy-rate tile.
- **Docs:** https://markets.newyorkfed.org/static/docs/markets-api.html (spec at https://markets.newyorkfed.org/static/docs/markets-api.yml), https://www.newyorkfed.org/markets/reference-rates/sofr, https://www.newyorkfed.org/privacy/termsofuse

### 7. Nowcasts (free consensus stand-in)

#### Atlanta Fed GDPNow
- **Data:** Excel `https://www.atlantafed.org/-/media/Project/Atlanta/FRBA/Documents/research-and-data/data/gdpnow/GDPTrackingModelDataAndForecasts.xlsx` (tested: 200, about 11 MB, sheets include TrackingHistory, TrackRecord, ContribHistory). Release dates `.../GDPNowcastDataReleaseDates.xlsx`. RSS `https://www.atlantafed.org/rss/GDPNow`. No API.
- **Easier route:** FRED series `GDPNOW` (tested, quarterly, 2011-07-01 to 2026-10-01, "Copyrighted: Citation Required").
- **Cadence:** "six or seven times a month" on weekdays after major releases. Latest at check: 2026:Q4 3.2% (Oct 29); next update Nov 2, 2026.
- **Licensing:** page says "Permission is granted to reproduce for personal and educational use only." Not clearly OK for a commercial/client site without asking.
- **Docs:** https://www.atlantafed.org/research-and-data/data/gdpnow

#### NY Fed Staff Nowcast
- **Cadence:** "Every Friday at around 11:45 a.m. ET" (2023 relaunch press release).
- **Data:** page is a JS app with `data-api-base-url="/medialibrary/Research/Interactives/Data/NowCast/data"`; no documented file names or API. Not verified.
- **Docs:** https://www.newyorkfed.org/research/policy/nowcast, https://www.newyorkfed.org/newsevents/news/research/2023/20230908

#### Cleveland Fed Inflation Nowcasting
- **What:** CPI, core CPI, PCE, core PCE; month-over-month, quarterly SAAR, and year-over-year.
- **Cadence:** each business day "around 10:00 a.m. Eastern time."
- **Data:** no documented API, but the page loads JSON (tested): `https://www.clevelandfed.org/-/media/files/webcharts/inflationnowcasting/nowcast_month.json`, `nowcast_quarter.json`, `nowcast_year.json` (chart-library JSON, `_comment` = "2026-10-30 00:00").
- **Licensing:** terms not stated on page; suggested citation with DOI 10.26509/frbc-inflationnowcast.
- **Gotcha:** undocumented chart JSON can change shape without notice.
- **Docs:** https://www.clevelandfed.org/indicators-and-data/inflation-nowcasting

### 8. SEC EDGAR

**Use on board:** distress feed from 8-K items 1.03 (bankruptcy/receivership), 2.04 (triggering events that accelerate obligations), 3.01 (delisting notice); filings per watchlist CIK; XBRL fundamentals (debt, interest expense).

- **Submissions (tested):** `https://data.sec.gov/submissions/CIK0000320193.json`. `filings.recent` includes an `items` field per filing (e.g. "2.02,9.01"), so you can filter 8-Ks by item for known CIKs.
- **XBRL:** companyfacts `https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json` (tested); frames `https://data.sec.gov/api/xbrl/frames/us-gaap/LongTermDebt/USD/CY2025Q4I.json` (tested); companyconcept also available.
- **Full-text search backend (tested, undocumented as an API):** `https://efts.sec.gov/LATEST/search-index?q=%22Item%201.03%22&forms=8-K&dateRange=custom&startdt=2026-10-01&enddt=2026-10-31` returned 16 hits for Oct 2026, and each hit's `_source.items` lists item codes (e.g. ['1.01','1.03','2.03','3.01','9.01']). Phrase search for "Item 2.04" over Sep-Oct 2026 returned 29 hits. An `items=` query parameter is not documented and appeared to be ignored in testing. **Approach:** phrase-search per item, then confirm by the `items` array to drop false positives (exhibit text mentioning the item).
- **Auth:** "These APIs do not require any authentication or API keys."
- **User-Agent (required):** declare e.g. `User-Agent: Sample Company Name AdminContact@<sample company domain>.com` and `Accept-Encoding: gzip, deflate`. Tested: blank UA returns 403.
- **Rate limit:** "Current max request rate: 10 requests/second" per user across all machines; SEC may block IPs.
- **Latency:** submissions "typical processing delay of less than a second"; XBRL "under a minute." Bulk `submissions.zip` / `companyfacts.zip` rebuilt nightly ~3:00 a.m. ET. Daily index files update nightly from ~10:00 p.m. ET and do not carry item codes.
- **History:** full-text search covers filings "since 2001."
- **Licensing:** not stated on pages fetched (see uncertain list).
- **Gotchas:** no CORS on data.sec.gov (server-side only, fine on Vercel). CIK must be zero-padded to 10 digits. Shared Vercel egress IPs count against the same 10 req/s; cache.
- **Docs:** https://www.sec.gov/search-filings/edgar-application-programming-interfaces, https://www.sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data, https://www.sec.gov/about/developer-resources, https://www.sec.gov/edgar/search/efts-faq.html

### 9. EIA API v2 (Weekly Petroleum Status Report)

- **Base:** `https://api.eia.gov/v2/`
- **Example (tested with DEMO_KEY):** `https://api.eia.gov/v2/petroleum/stoc/wstk/data/?api_key={EIA_KEY}&frequency=weekly&data[0]=value&facets[series][]=WCESTUS1&sort[0][column]=period&sort[0][direction]=desc&length=10` (latest week 2026-10-23: 410,625 thousand bbl ex-SPR).
- **Auth:** key required (unkeyed returns API_KEY_MISSING); register at https://www.eia.gov/opendata/register.php. Key must be in the URL, not headers.
- **Limits:** no numbers published; throttled per second and per hour with temporary key suspension. Max 5,000 rows JSON (300 XML); use offset/length.
- **Cadence:** Wednesdays 10:30 a.m. ET; holiday shift: data week ending Nov 6 releases Thu Nov 12, 12:00 p.m.
- **History:** WCESTUS1 from 1982-08-20.
- **Licensing:** public domain; acknowledge "Source: U.S. Energy Information Administration (date)."
- **Gotchas:** week-over-week change must be computed yourself. Brackets in params need encoding.
- **Docs:** https://www.eia.gov/opendata/documentation.php, https://www.eia.gov/petroleum/supply/weekly/schedule.php, https://www.eia.gov/about/copyrights_reuse.php

### 10. CFTC Commitments of Traders (Public Reporting Environment, Socrata)

- **Base:** `https://publicreporting.cftc.gov/resource/{dataset_id}.json`
- **Dataset IDs (verified via /api/views metadata):** Legacy Futures Only 6dca-aqww; Legacy Combined jun7-fc8e; Disaggregated Futures Only 72hh-3qpy; Disaggregated Combined kh3c-gbw2; TFF Futures Only gpe5-46if; TFF Combined yw9f-hn96; Supplemental CIT 4zgm-a668.
- **Example (tested):** `https://publicreporting.cftc.gov/resource/gpe5-46if.json?$where=market_and_exchange_names like '%S&P 500%'&$order=report_date_as_yyyy_mm_dd DESC&$limit=1` (URL-encode). Returned 2026-10-27 S&P 500 Consolidated lev money and asset manager positions.
- **Auth:** none. CFTC: "not currently issuing API tokens. Light use generally works without one, but heavy use may not." Socrata: unauthenticated requests "come from a shared pool via IP address" and can get 429.
- **Cadence:** Fridays 3:30 p.m. ET, Tuesday as-of data; holiday schedule at https://www.cftc.gov/MarketReports/CommitmentsofTraders/ReleaseSchedule/index.htm
- **History:** Legacy from 1986-01-15; TFF and Disaggregated from 2006-06-13 (min date confirmed by query).
- **Licensing:** not verified (cftc.gov policy page fetch failed).
- **Gotchas:** on Vercel the shared-IP pool is shared with other tenants; fetch once after Friday 3:30 PM and cache for the week. Market names change over time; filter by `cftc_contract_market_code` once identified.
- **Docs:** https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm, https://publicreporting.cftc.gov/stories/s/r4w3-av2u, https://dev.socrata.com/docs/app-tokens.html

### 11. Financial conditions and stress

- **Chicago Fed NFCI:** FRED `NFCI` (1971-01-08 to 2026-10-23) and `ANFCI`. "Updated on a weekly basis at 8:30 a.m. ET on Wednesday, and cover the time period through the previous Friday" (Chicago Fed current-data page). FRED tag: "Copyrighted: Citation Required." Subindexes from 1973.
- **St. Louis Fed Financial Stress Index:** FRED `STLFSI4` (1993-12-31 to 2026-10-23), weekly ending Friday; last updated Wed Oct 28 2026, next Nov 4. Version 4 uses 90-day forward-looking SOFR. "Copyrighted: Citation Required."
- **Fed SLOOS:** FRED `DRTSCILM` (net % banks tightening C&I standards, large/middle firms; 1990 to 2026-07-01; "Public Domain: Citation Requested"). Survey is quarterly, timed for Jan/Feb, Apr/May, Aug, Oct/Nov FOMC meetings; release time not stated. **Gotcha:** the Fed's Data Download Program "Build Your Package" is being removed the week of November 9 ahead of DDP retirement; use FRED.
- **Example:** `https://api.stlouisfed.org/fred/series/observations?series_id=NFCI&observation_start=2025-01-01&file_type=json&api_key={FRED_KEY}`
- **Docs:** https://www.chicagofed.org/research/data/nfci/current-data, https://fred.stlouisfed.org/series/STLFSI4, https://www.federalreserve.gov/data/sloos.htm

### 12. Yahoo Finance chart endpoint and alternatives

#### Yahoo (unofficial, undocumented)
- **Example (tested):** `https://query1.finance.yahoo.com/v8/finance/chart/HYG?range=ytd&interval=1d`
- **Supports:** `meta.validRanges` = 1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, 10y, ytd, max. `range=ytd` returned 209 daily points; `range=1y` 251. `indicators.adjclose` present (split and dividend adjusted, usable for total-return approximations on ETFs like HYG). `events=div` adds dividend events.
- **Gotchas:** returns 429 with no UA or curl's default UA; works with a browser UA. No SLA, can break or block Vercel IPs.
- **Terms (Yahoo Terms of Service, legal.yahoo.com):** prohibits "access or collect data ... from our Services using any automated means ... without our express, prior permission"; prohibits using it "to create any database, archive, mobile application, data feed, widget or any other aggregated data source"; "Unless you have explicit written permission, you must not reproduce, modify ... distribute, transmit, broadcast, publicly perform"; and "you may not access or reuse the Services, or any portion thereof, for any commercial purpose." **Conclusion: not acceptable for a public or client-facing site.**
- **Docs:** https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html

#### Alternative 1: Tiingo
- **Example:** `https://api.tiingo.com/tiingo/daily/hyg/prices?startDate=2025-12-31&token={TIINGO_KEY}` (tested: bad token returns "Invalid token.").
- **Fields:** adjClose, divCash, splitFactor. EOD ~5:30 PM EST, corrections until 8 PM.
- **Free tier:** 50 req/hour, 1,000/day, 500 unique symbols/month, 30+ years price history.
- **Paid:** Power $30/mo individual; $50/mo internal commercial.
- **Redistribution:** "Internal use means you may only use the data for your own personal use and you may not display or share the data with another person or organization." Public display needs a redistribution package via Tiingo Sales.
- **Docs:** https://www.tiingo.com/about/pricing, https://www.tiingo.com/documentation/end-of-day

#### Alternative 2: Alpha Vantage
- **Example:** `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=HYG&apikey={AV_KEY}`
- **Free tier:** 25 requests/day. `outputsize=full` is premium; `TIME_SERIES_DAILY_ADJUSTED` "is a premium API function."
- **Redistribution:** not stated on support page; governed by ToS (not reviewed).
- **Verdict:** free tier too small for a board with 15+ symbols; Tiingo is the better low-cost fit.
- **Docs:** https://www.alphavantage.co/support/, https://www.alphavantage.co/documentation/

#### Note on indices
Index levels (^GSPC etc.) are licensed by the index owner regardless of vendor. FRED `SP500` exists but carries S&P copyright and only 10 years. For a public site, ETF proxies (SPY, HYG, LQD, XLE) from a vendor with a display license are the cleaner route.

### 13. Kalshi (Fed decision probabilities)

- **Base (current docs):** `https://external-api.kalshi.com/trade-api/v2` (tested 200). The older `https://api.elections.kalshi.com/trade-api/v2` also works and serves all markets, not only elections.
- **Example (tested):** `https://external-api.kalshi.com/trade-api/v2/markets?event_ticker=KXFEDDECISION-26DEC` returned five outcomes (Hike >25, Hike 25, Hold, Cut 25, Cut >25) for the Dec 9, 2026 meeting with `last_price_dollars` and volume. Series `KXFEDDECISION` lists meetings out to Jan 2028; series `KXFED` (rate level) also exists.
- **Auth:** market data endpoints: "No authentication headers are required."
- **Limits:** Basic tier 200 read tokens/s for authenticated requests; unauthenticated metering not stated.
- **Licensing:** Kalshi Developer Agreement v1.1: "Accessing or using Kalshi's API shall be considered a binding acceptance of this Agreement." Section 3: "Use of Kalshi APIs is expressly limited to facilitating a members own trading on the Exchange; all other usages are disallowed." 3.1 prohibits "Collecting, caching, aggregating, or storing data ... except for purposes of facilitating your own trading" and "You may not share such data or content with third parties in any manner without prior written authorization from Kalshi." **Not OK for a public board without written permission.**
- **Gotchas:** prices are now in `*_dollars` string fields (legacy integer cent fields return null). Thin outcomes can have stale last prices; use mid of bid/ask.
- **Docs:** https://docs.kalshi.com/getting_started/quick_start_market_data, https://docs.kalshi.com/getting_started/rate_limits, https://kalshi-public-docs.s3.amazonaws.com/Kalshi-Developer-Agreement.pdf

---

### Not verified / uncertain

- **FRED releases/dates with `include_release_dates_with_no_data=true`** returning future dates: docs say the default "excludes future release dates," implying true includes them, but not tested (no key in sandbox). BLS and BEA ICS feeds are a verified fallback with times.
- **FRED ICE truncation start:** notes say "Starting in April 2026"; no separate FRED announcement page was found. Whether ICE would grant display permission, and at what cost, is unknown.
- **Census API query limits** with a key: not stated on pages fetched (user guide PDF not read).
- **Treasury par yield publication time** and reuse terms: not stated on fetched pages. Fiscal Data's "free, without restriction" statement covers Fiscal Data only.
- **TreasuryDirect TA_WS limits, history, terms, and future of the endpoint:** docs have moved to the Fiscal Service API community and could not be fetched (robots.txt). Endpoints still work as of 2026-10-31.
- **DTS publication time of day:** not stated on fetched pages.
- **NY Fed Markets API rate limits:** none stated in the OpenAPI spec.
- **NY Fed Staff Nowcast data download / API:** not found; the update schedule comes from a 2023 press release and may have changed.
- **Cleveland Fed nowcast JSON:** undocumented endpoints; terms of use not stated.
- **GDPNow use on a commercial/client site:** page says "personal and educational use only"; Atlanta Fed full Terms of Use not read.
- **SEC EDGAR and CFTC reuse terms:** no explicit public-domain statement found on fetched pages (cftc.gov policy page failed to load). Both are federal records and widely treated as public, but this was not confirmed from their own pages.
- **EFTS `items=` filter:** not documented; appeared ignored in testing. Full-text search API itself is the backend of the EDGAR UI and is not a documented public API.
- **BLS API data timing vs 8:30 release:** not stated in FAQ.
- **SLOOS release time and next date (Oct/Nov 2026):** Fed page listed nothing after July 2026.
- **Stooq:** first request returned 200, later requests got connection resets; WebFetch blocked by robots.txt. Terms not reviewed. Not recommended.
- **Alpha Vantage redistribution terms:** ToS not reviewed.
- **Kalshi:** whether Kalshi grants display permission to non-trading media/data uses on request; unauthenticated rate limits.
- **Yahoo `adjclose` methodology** (exact dividend adjustment) is undocumented.

---

## 6. Build phases

Work top to bottom. Each phase ships on its own. Each one ends with `npm run build` passing and a screenshot of the board checked against that phase's acceptance list. Commit per phase with a conventional message (`feat(returns): ...`).

### Phase 0: trust fixes and the licensing decision (half a day)
1. Get Thomas's answer to Section 0 (private or public). For Option A, turn on Vercel Deployment Protection.
2. Wire ranking, per-source cap, The Hill limited to the Politics tab (2.1).
3. Tag only from content on broad feeds (2.2).
4. Exempt Fed and SEC from the 3-day cutoff (2.3).
5. Freshness labels from `marketState` and `regularMarketTime`; remove the hardcoded "live" (2.4).
6. Label source and date on both 10Y prints (2.5).
7. Add `FRED_API_KEY`, `BLS_API_KEY`, `BEA_API_KEY`, `EIA_API_KEY` to `.env.example`. Every panel that needs a key shows a setup note when the key is missing.
8. Add an attribution footer with the required notices: the FRED API notice and Terms link, the BEA notice, the NY Fed Terms notice, and source credits for BLS, EIA and Census. The exact wording is in Section 5.

**Done when:** in "All," no publisher exceeds 10 percent; the credit tags carry at least 15 percent of items on a normal weekday; the Binance-style mis-tags are gone; and no panel says "live" on a weekend.

### Phase 1: interval returns (one to two days)
Section 3 in full. New `src/lib/returns.ts` and `src/lib/history.ts`; FRED window widened to 400 days; 1Y percentile on spreads; `?since=` param.

**Done when:** the four checks in 3.4 pass.

### Phase 2: economic releases panel (two days)
Section 4 in full. New `src/lib/econ.ts`, route `/api/econ`, and a panel in `Board.tsx`.
- Calendar: parse `https://www.bls.gov/schedule/news_release/bls.ics` (send a browser-style User-Agent) and BEA's `release_dates.json`. Cache for 24 hours.
- Values: FRED `series/observations` with `units=pc1` for YoY and `units=pch` for MoM where useful. Cache for 1 hour, and refetch on the minute after each scheduled release time.
- First print vs revised: FRED `output_type=4` (ALFRED).
- Nowcasts: FRED `GDPNOW`; Cleveland Fed `nowcast_month.json` and `nowcast_year.json`, behind a try/catch that hides the column if the shape changes.

**Done when:** the four checks in 4.4 pass, and the calendar shows Employment Situation on Fri Nov 6 at 8:30 and CPI on Tue Nov 10 at 8:30 (both from the BLS ICS as of 2026-10-31).

### Phase 3: official rates and liquidity (one day)
- Treasury par yield curve (XML feed, current month) as the end-of-day curve: 1M, 3M, 2Y, 5Y, 10Y, 30Y, plus the real 10Y. Keep CBOE `^TNX` etc. only as the intraday tick, and label them so.
- NY Fed Markets API: SOFR (around 8:00 ET), EFFR with target range (around 9:00 ET), and overnight reverse repo usage. These replace the FRED `SOFR` and `DFF` rows, since they post the same morning.
- Treasury Fiscal Data: Treasury General Account balance and its weekly change. Note the gotcha: the closing balance sits in `open_today_bal` on the "TGA Closing Balance" row.
- Auctions: the next three coupon auctions, and the last result's high yield and bid-to-cover (Fiscal Data `upcoming_auctions` and `auctions_query`).

**Done when:** SOFR on the board matches newyorkfed.org for today, and the TGA matches the latest Daily Treasury Statement.

### Phase 4: credit-specific signal (one to two days)
- **EDGAR distress feed.** It replaces or supplements the Google News "Distressed wire." Phrase-search EDGAR full-text for 8-Ks containing Item 1.03 (bankruptcy), 2.04 (acceleration of debt) and 3.01 (delisting), over the last 7 days. Keep only hits whose `items` array actually contains the code. Show issuer, item, date and filing link. Use the existing `SEC_USER_AGENT`, stay under 10 requests per second, and cache for 15 minutes. This is primary-source distress data with no publisher noise.
- **Stress tile.** NFCI (Wednesdays at 8:30 ET), STLFSI4 (weekly), and SLOOS C&I tightening `DRTSCILM` (quarterly), all from FRED with a citation.
- **Wednesday oil tile.** EIA crude inventories `WCESTUS1`, with the week-over-week change calculated by the app. The board already shows WTI, so this explains the move. Note the holiday shift: the week ending Nov 6 publishes Thu Nov 12 at noon.
- **Positioning (optional).** CFTC Traders in Financial Futures. Show leveraged funds vs asset managers for S&P 500 futures and the 10Y note. Fetch once after Friday 3:30 PM ET and cache for the week.

**Done when:** the distress feed for October 2026 lists the Item 1.03 8-Ks that EDGAR full-text search returns for the same window, with no false positives from exhibits.

### Explicitly out of scope
- Kalshi Fed odds (license).
- Census direct (FRED carries the same series more simply).
- NY Fed Staff Nowcast (no documented data file).
- Stooq (unreliable, terms unreviewed).

---

## 7. Open questions for Thomas
1. Private tool or public product (Section 0)? This decides Phases 3 and 4 sourcing and whether the ICE rows stay.
2. If public: is it worth asking ICE for display permission on HY and IG OAS? Credit spreads are the board's identity, and nothing free replaces them.
3. Which release set matters most for your work: the twelve in 4.3, or a shorter list built around credit (claims, payrolls, CPI, SLOOS, NFCI)?
