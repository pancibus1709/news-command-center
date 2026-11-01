import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";
import { CommandBar } from "@/components/CommandBar";

const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "News Command Center",
  description: "Credit, equities, macro, politics and AI news on one terminal board.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${mono.variable} h-full`}>
      <body className="h-full flex flex-col overflow-hidden">
        <CommandBar />
        <div className="flex-1 min-h-0 overflow-auto">{children}</div>
        <footer className="shrink-0 border-t border-line bg-raised px-3 py-1 text-[10px] text-mute leading-snug">
          Private tool, internal use. Quotes: Yahoo Finance, delayed where marked. Spreads: ICE BofA indices via FRED, internal use only, no redistribution. Rates and macro series: FRED. This product uses the FRED® API but is not endorsed or certified by the Federal Reserve Bank of St. Louis (
          <a href="https://fred.stlouisfed.org/docs/api/terms_of_use.html" target="_blank" rel="noreferrer" className="text-dim hover:text-amber">terms</a>
          ). Filings and fundamentals: SEC EDGAR. Bonds and bond-level grades: FINRA TRACE. Headlines link to their publishers. Not investment advice.
        </footer>
      </body>
    </html>
  );
}
