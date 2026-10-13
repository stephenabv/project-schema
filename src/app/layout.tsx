import type { Metadata, Viewport } from "next";
import { SplashScreen } from "@/components/layout/splash-screen";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Virtual Earn: a tap-to-earn simulator",
    template: "%s | Virtual Earn",
  },
  description:
    "A gamified earning simulator. All balances are virtual coins with no monetary value and cannot be redeemed.",
  applicationName: "Virtual Earn",
  appleWebApp: { capable: true, title: "Virtual Earn", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#059669",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The splash script sets data-splash on <html> before hydration.
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="flex min-h-full flex-col font-sans">
        <SplashScreen />
        {children}
      </body>
    </html>
  );
}
