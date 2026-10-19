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
      </body>
    </html>
  );
}
