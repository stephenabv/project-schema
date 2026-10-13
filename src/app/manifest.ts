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
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
