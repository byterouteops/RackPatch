import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

const plexSans = IBM_Plex_Sans({
  variable: "--font-ibm-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
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
    <html lang="en">
      <body className={`${plexSans.variable} ${plexMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
