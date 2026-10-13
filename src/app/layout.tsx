import type { Metadata, Viewport } from "next";
import { SplashScreen } from "@/components/layout/splash-screen";
import { THEME_SCRIPT } from "@/lib/theme/theme";
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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#059669" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1120" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The theme and splash scripts set data-theme / data-splash on <html> before hydration.
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col font-sans">
        <SplashScreen />
        {children}
      </body>
    </html>
  );
}
