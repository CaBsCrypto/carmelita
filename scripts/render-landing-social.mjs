import { readFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import sharp from "sharp";

// Local, reproducible social preview. Uses the bundled Inter font and brand mark.
// Pango needs an uncompressed font; keep the derived TTF in the ignored work folder.
// Reproduction requires Python with fontTools and Brotli support.
await mkdir("work/landing-social", { recursive: true });
const fontfile = "work/landing-social/Inter.ttf";
execFileSync("python", ["-c", "from fontTools.ttLib import TTFont; f=TTFont('public/fonts/InterVariable.woff2'); f.flavor=None; f.save('work/landing-social/Inter.ttf')"]);
const layers = [];
async function text(value, left, top, size, color = "#153f32", weight = "normal") {
  const input = await sharp({ text: {
    text: `<span foreground="${color}" weight="${weight}">${value}</span>`,
    font: `Inter Variable ${size}`, fontfile, rgba: true,
  } }).png().toBuffer();
  layers.push({ input, left, top });
}

const background = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <rect width="1200" height="630" fill="#fcfdfb"/>
  <path d="M56 108H1144" stroke="#d9e2dc"/>
  <rect x="710" y="158" width="434" height="390" rx="18" fill="#153f32"/>
  <rect x="740" y="236" width="374" height="282" rx="12" fill="white"/>
  <rect x="56" y="409" width="400" height="64" rx="10" fill="#153f32"/>
  <path d="m59 515 6 6-6 6-6-6Z" fill="#ff5b3a"/>
</svg>`);
layers.push({ input: background, left: 0, top: 0 });
layers.push({ input: await sharp(await readFile("public/brand/carmelita-mark.svg")).resize(38, 38).png().toBuffer(), left: 56, top: 35 });
await text("Carmelita", 108, 40, 28, "#153f32", "bold");
await text("Your wallets,", 52, 176, 76, "#153f32", "semibold");
await text("in ChatGPT.", 52, 262, 76, "#153f32", "semibold");
await text("Connect Carmelita with ChatGPT", 80, 431, 22, "white", "semibold");
await text("Testnet and Devnet. Test funds.", 80, 510, 23, "#53665d");
await text("Illustrative example", 741, 189, 22, "#d1e5d8");
await text("Show me my wallets", 762, 257, 23, "#153f32", "semibold");
const networks = ["Avalanche Fuji", "Base Sepolia", "BNB Testnet", "Solana Devnet", "Stellar Testnet"];
for (let index = 0; index < networks.length; index++) {
  await text(networks[index], 762, 307 + index * 38, 21, "#20372e");
}
await text("carmelita.browns.studio", 56, 579, 20, "#53665d");
await sharp({ create: { width: 1200, height: 630, channels: 4, background: "#fcfdfb" } })
  .composite(layers).png().toFile("public/brand/carmelita-landing-social.png");
console.log("Wrote public/brand/carmelita-landing-social.png (1200×630)");
