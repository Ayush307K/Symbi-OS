import type { Metadata } from "next";
import { IBM_Plex_Sans, Manrope } from "next/font/google";
import Providers from "@/components/Providers";
import "./globals.css";

// Display face: headings and numerals that need presence.
const display = Manrope({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});

// UI face: body copy, labels, and dense table text. Plex ships true tabular
// figures, which is why the marketplace tables stay aligned.
const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Symbi-OS — Circular Supply Chain Intelligence",
  description:
    "AI-Powered Circular Economy Marketplace. Query complex supply chain pathways with natural language and visualize them in 3D.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body className="bg-surface-page font-sans text-ink-900 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
