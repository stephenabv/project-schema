// Renders the PNG and ICO app icons from src/app/icon.svg so every platform
// (Android install/splash, iOS home screen, legacy favicon) shows the same mark.
// Run after changing the mark: `node scripts/generate-icons.mjs`.
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const ROOT = new URL("../", import.meta.url);
const BRAND_GRADIENT = "linear-gradient(135deg, #10b981, #047857)";

const svg = await readFile(new URL("src/app/icon.svg", ROOT), "utf8");
// The glyph without its rounded tile, for full-bleed icons the OS masks itself.
const glyph = svg.replace(/<rect[^>]*\/>/, "");

const dataUri = (markup) => `data:image/svg+xml;base64,${Buffer.from(markup).toString("base64")}`;

/** `scale` is the share of the canvas the artwork covers; `fullBleed` paints the brand tile edge to edge. */
const ICONS = [
  { file: "public/icons/icon-192.png", size: 192, fullBleed: false, scale: 1 },
  { file: "public/icons/icon-512.png", size: 512, fullBleed: false, scale: 1 },
  // Maskable icons keep the artwork inside the 80% safe zone.
  { file: "public/icons/maskable-512.png", size: 512, fullBleed: true, scale: 0.72 },
  // iOS rounds the corners itself and shows transparency as black.
  { file: "src/app/apple-icon.png", size: 180, fullBleed: true, scale: 0.86 },
];
const FAVICON_SIZES = [16, 32, 48];

const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {},
);
try {
  const page = await browser.newPage();

  async function render(size, { fullBleed, scale }) {
    await page.setViewportSize({ width: size, height: size });
    const art = fullBleed ? glyph : svg;
    const inner = Math.round(size * scale);
    await page.setContent(
      `<html><body style="margin:0;width:${size}px;height:${size}px;display:grid;place-items:center;background:${
        fullBleed ? BRAND_GRADIENT : "transparent"
      }"><img src="${dataUri(art)}" width="${inner}" height="${inner}"></body></html>`,
    );
    await page.locator("img").evaluate((img) => img.decode());
    return page.screenshot({ omitBackground: !fullBleed, clip: { x: 0, y: 0, width: size, height: size } });
  }

  for (const icon of ICONS) {
    await writeFile(new URL(icon.file, ROOT), await render(icon.size, icon));
    console.log(`wrote ${icon.file}`);
  }

  // ICO files may embed PNG images directly (Windows Vista and later, every browser).
  const pngs = [];
  for (const size of FAVICON_SIZES) pngs.push({ size, data: await render(size, { fullBleed: false, scale: 1 }) });
  const header = Buffer.alloc(6 + 16 * pngs.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(({ size, data }, i) => {
    const entry = 6 + 16 * i;
    header.writeUInt8(size, entry);
    header.writeUInt8(size, entry + 1);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });
  await writeFile(new URL("src/app/favicon.ico", ROOT), Buffer.concat([header, ...pngs.map((p) => p.data)]));
  console.log("wrote src/app/favicon.ico");
} finally {
  await browser.close();
}
