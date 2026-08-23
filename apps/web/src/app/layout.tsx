import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Metanoia — Self-Healing Web Scraper Platform",
  description: "Autonomous self-healing reliability and monitoring dashboard for web scrapers.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Barlow:wght@300;400;500;600&family=Instrument+Serif:ital@1&display=swap" rel="stylesheet" />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
