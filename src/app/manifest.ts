import type { MetadataRoute } from "next";

/** Web app manifest so players can install Virtual Earn to their home screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Virtual Earn",
    short_name: "Virtual Earn",
    description: "A tap-to-earn simulator. Coins are virtual, have no monetary value and cannot be redeemed.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#059669",
    categories: ["games", "entertainment"],
    // PNGs are required for Android's install prompt and launch splash; regenerate
    // them with scripts/generate-icons.mjs whenever src/app/icon.svg changes.
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
