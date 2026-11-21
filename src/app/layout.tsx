import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

/** Poppins and JetBrains Mono, SIL Open Font License 1.1 (see src/fonts/*-OFL.txt), latin subset, self-hosted. */
const poppins = localFont({
  variable: "--font-poppins",
  display: "swap",
  fallback: ["Segoe UI", "system-ui", "sans-serif"],
  src: [
    { path: "../fonts/poppins-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../fonts/poppins-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../fonts/poppins-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../fonts/poppins-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
});

const jetbrains = localFont({
  variable: "--font-jetbrains",
  display: "swap",
  fallback: ["ui-monospace", "Consolas", "monospace"],
  src: [
    { path: "../fonts/jetbrains-mono-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../fonts/jetbrains-mono-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../fonts/jetbrains-mono-latin-600-normal.woff2", weight: "600", style: "normal" },
  ],
});

const headline = "Know which cables are right before you hand over the rack.";

export const metadata: Metadata = {
  title: "RackPatch",
  description: headline,
  icons: {
    icon: [{ url: "/rackpatch-mark.svg", type: "image/svg+xml" }],
    apple: [{ url: "/rackpatch-logo.jpg" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${poppins.variable} ${jetbrains.variable}`}
    >
      <body className={`${poppins.className} antialiased`}>{children}</body>
    </html>
  );
}
