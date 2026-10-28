# News Command Center

A terminal-style board for credit and equity work. One screen for markets, credit spreads, and seven news wires; one page per company that pulls price, valuation, operating and credit metrics, street estimates, SEC filings, five years of audited fundamentals, and the latest headlines.

Everything comes from public sources with no API keys: Yahoo Finance (quotes, TTM financials, estimates), FRED (ICE BofA OAS spreads, Treasury curve, policy rates), SEC EDGAR (filings, XBRL company facts, and full-text search for rating statements), FINRA TRACE reference data (outstanding bonds with last price, yield, and bond-level Moody's and S&P grades), and 23 RSS and Google News wires (CNBC, WSJ, FT, MarketWatch, Federal Reserve, SEC, Politico, The Hill, TechCrunch, plus keyword wires for credit, distressed, ratings, macro, regulatory and AI).

## Run

```bash
npm install
npm run dev
```

Open http://localhost:3000. Press `/` to jump to the search bar, type a ticker or company name, Enter opens the company page.

Copy `.env.example` to `.env.local` and set `SEC_USER_AGENT` to your name and email. SEC asks for this on every request and throttles anonymous clients.

## Deploy

The site runs on Vercel at https://news-command-center-psi.vercel.app from the GitHub repo at https://github.com/pancibus1709/news-command-center. `npm run build` is a plain `next build`; the board is a client component that fetches the API routes at request time, so the static shell never goes stale. Set `SEC_USER_AGENT` in the Vercel project (Production and Preview) to your own name and email before deploying.

To push a new version from this folder, log in once with `npx vercel login`, then run `npx vercel deploy --prod`. Connecting the GitHub repo in the Vercel dashboard (Project, Settings, Git) makes every push to main deploy on its own. The TTL cache in `src/lib/cache.ts` is per serverless instance, so a cold start refetches everything and the first company page after a quiet spell takes a few seconds; Yahoo Finance may also rate-limit a shared Vercel egress IP more readily than a home connection.

## Layout

`src/lib/feeds.ts` is the wire registry. Add a feed by appending one line with a category and weight. `src/lib/news.ts` fetches all feeds in parallel, dedupes on headline, tags stories across categories, and drops anything older than three days. `src/lib/markets.ts` and `src/lib/credit.ts` build the quote board and the FRED credit monitor. `src/lib/sec.ts` resolves ticker to CIK, pulls recent material filings, and extracts annual XBRL facts with alias fallback for concept names that drift between filers. `src/lib/company.ts` assembles the company profile. All upstream calls go through the TTL cache in `src/lib/cache.ts` (news 3 min, quotes 1 min, FRED 1 hour, SEC 6 to 12 hours).

API routes under `src/app/api/` expose the same data as JSON: `/api/news`, `/api/markets`, `/api/credit`, `/api/company/[ticker]`, `/api/search?q=`.

## Known limits

Agency ratings are read from two public places and merged: FINRA's bond-level Moody's and S&P grades across recently traded senior issues, and the grade the issuer states in its own 10-K, 10-Q or 8-K text (which is also the only public source for Fitch and for outlooks). Investment-grade industrials rarely state a grade in filings, so Apple shows FINRA's bond-level grade with no outlook. When a later filing reports an upgrade or downgrade without the new grade, the row says so rather than letting a stale grade stand. The Moody's and S&P Global connectors would give issuer-level ratings directly but need OAuth authorization; the old FINRA Bond Center on finra-markets.morningstar.com is gone (it redirects to finra.org) and was dropped after a live probe on 2026-10-19.

Yahoo Finance is unofficial and can rate-limit. Google News wires are keyword searches, so they catch noise. XBRL facts cover US registrants only; foreign filers show filings but no annual table. Nothing here is investment advice.
