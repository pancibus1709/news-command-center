import type { Metadata } from "next";
import { PortfolioBoard } from "@/components/portfolio/PortfolioBoard";

export const metadata: Metadata = {
  title: "Portfolio",
};

export default function PortfolioPage() {
  return <PortfolioBoard />;
}
