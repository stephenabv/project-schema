import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Virtual Earn: a tap-to-earn simulator",
    template: "%s | Virtual Earn",
  },
  description:
    "A gamified earning simulator. All balances are virtual coins with no monetary value and cannot be redeemed.",
};

export const viewport: Viewport = {
  themeColor: "#059669",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
