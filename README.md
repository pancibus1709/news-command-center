# News Command Center

A terminal-style board for credit and equity work. One screen for markets, credit spreads, and seven news wires; one page per company that pulls price, valuation, operating and credit metrics, street estimates, SEC filings, five years of audited fundamentals, and the latest headlines.

Everything comes from public sources with no API keys: Yahoo Finance (quotes, TTM financials, estimates), FRED (ICE BofA OAS spreads, Treasury curve, policy rates), SEC EDGAR (filings and XBRL company facts), and 23 RSS and Google News wires (CNBC, WSJ, FT, MarketWatch, Federal Reserve, SEC, Politico, The Hill, TechCrunch, plus keyword wires for credit, distressed, ratings, macro, regulatory and AI).

## Run

```bash
npm install
npm run dev
```

Open http://localhost:3000. Press `/` to jump to the search bar, type a ticker or company name, Enter opens the company page.

Copy `.env.example` to `.env.local` and set `SEC_USER_AGENT` to your name and email. SEC asks for this on every request and throttles anonymous clients.

## Layout

`src/lib/feeds.ts` is the wire registry. Add a feed by appending one line with a category and weight. `src/lib/news.ts` fetches all feeds in parallel, dedupes on headline, tags stories across categories, and drops anything older than three days. `src/lib/markets.ts` and `src/lib/credit.ts` build the quote board and the FRED credit monitor. `src/lib/sec.ts` resolves ticker to CIK, pulls recent material filings, and extracts annual XBRL facts with alias fallback for concept names that drift between filers. `src/lib/company.ts` assembles the company profile. All upstream calls go through the TTL cache in `src/lib/cache.ts` (news 3 min, quotes 1 min, FRED 1 hour, SEC 6 to 12 hours).

API routes under `src/app/api/` expose the same data as JSON: `/api/news`, `/api/markets`, `/api/credit`, `/api/company/[ticker]`, `/api/search?q=`.

## Known limits

Yahoo Finance is unofficial and can rate-limit. Google News wires are keyword searches, so they catch noise. XBRL facts cover US registrants only; foreign filers show filings but no annual table. Nothing here is investment advice.
