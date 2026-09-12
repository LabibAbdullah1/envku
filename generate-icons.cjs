/**
 * Script konversi SVG → semua format icon yang dibutuhkan Tauri
 * Menggunakan: sharp (PNG rendering) + png-to-ico (ICO generation)
 */

const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const SVG_PATH = path.join(__dirname, "src/assets/envku-logo.svg");
const ICONS_DIR = path.join(__dirname, "src-tauri/icons");
const PUBLIC_DIR = path.join(__dirname, "public");

const svgBuffer = fs.readFileSync(SVG_PATH);

// Fungsi render SVG ke PNG buffer dengan ukuran tertentu
async function renderIcon(size) {
  return sharp(svgBuffer)
    .resize(size, size)
    .png()
    .toBuffer();
}

async function main() {
  console.log("🎨 Mengkonversi SVG logo Envku ke semua format icon...\n");

  // Semua ukuran yang dibutuhkan Tauri
  const sizes = [
    { file: "32x32.png", size: 32 },
    { file: "64x64.png", size: 64 },
    { file: "128x128.png", size: 128 },
    { file: "128x128@2x.png", size: 256 },
    { file: "icon.png", size: 512 },
    { file: "Square30x30Logo.png", size: 30 },
    { file: "Square44x44Logo.png", size: 44 },
    { file: "Square71x71Logo.png", size: 71 },
    { file: "Square89x89Logo.png", size: 89 },
    { file: "Square107x107Logo.png", size: 107 },
    { file: "Square142x142Logo.png", size: 142 },
    { file: "Square150x150Logo.png", size: 150 },
    { file: "Square284x284Logo.png", size: 284 },
    { file: "Square310x310Logo.png", size: 310 },
    { file: "StoreLogo.png", size: 50 },
  ];

  // Generate semua PNG
  for (const { file, size } of sizes) {
    const buf = await renderIcon(size);
    const outPath = path.join(ICONS_DIR, file);
    fs.writeFileSync(outPath, buf);
    console.log(`  ✅ ${file} (${size}x${size})`);
  }

  // Juga generate favicon untuk public/ dan index.html
  const faviconBuf = await renderIcon(64);
  fs.writeFileSync(path.join(PUBLIC_DIR, "logo.png"), faviconBuf);
  console.log(`  ✅ public/logo.png (64x64 - untuk favicon HTML)`);

  // Generate ICO (multi-size) menggunakan png-to-ico
  try {
    const pngToIcoModule = require("png-to-ico");
    const pngToIco = typeof pngToIcoModule === "function" ? pngToIcoModule : (pngToIcoModule.default || pngToIcoModule);
    const ico16 = await renderIcon(16);
    const ico32 = await renderIcon(32);
    const ico48 = await renderIcon(48);
    const ico256 = await renderIcon(256);

    const icoBuffer = await pngToIco([ico16, ico32, ico48, ico256]);
    fs.writeFileSync(path.join(ICONS_DIR, "icon.ico"), icoBuffer);
    console.log(`  ✅ icon.ico (16, 32, 48, 256px multi-size)`);
  } catch (err) {
    console.warn(`  ⚠️  Melewati icon.ico (png-to-ico tidak tersedia): ${err.message}`);
  }

  console.log("\n🎉 Selesai! Semua icon berhasil digenerate dari SVG logo Envku Neo-Brutalism.");
}

main().catch(console.error);
