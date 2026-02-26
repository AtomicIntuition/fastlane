import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "@/styles/globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "FastLane - Intermittent Fasting",
    template: "%s | FastLane",
  },
  description:
    "FastLane helps you build consistent fasting habits with clear timers, check-ins, and premium protocol support.",
  keywords: [
    "fasting",
    "intermittent fasting",
    "health",
    "wellness",
    "habit tracking",
    "FastLane",
  ],
  authors: [{ name: "FastLane" }],
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "FastLane",
    title: "FastLane - Intermittent Fasting",
    description:
      "Build a sustainable intermittent fasting routine with FastLane.",
  },
  twitter: {
    card: "summary_large_image",
    title: "FastLane",
    description: "Intermittent fasting, simplified.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: "#10151f",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased bg-midnight text-text-primary min-h-dvh`}
      >
        {children}
      </body>
    </html>
  );
}
