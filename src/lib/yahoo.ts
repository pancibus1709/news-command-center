import YahooFinance from "yahoo-finance2";

// One shared client. The constructor handles Yahoo's crumb/cookie dance.
export const yf = new YahooFinance({
  suppressNotices: ["yahooSurvey", "ripHistorical"],
});
