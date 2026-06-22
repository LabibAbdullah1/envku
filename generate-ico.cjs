/**
 * Script khusus generate icon.ico dari PNG yang sudah ada
 */
const fs = require("fs");
const path = require("path");

const ICONS_DIR = path.join(__dirname, "src-tauri/icons");

async function generateIco() {
  const { default: pngToIco } = await import("png-to-ico");

  const sizes = [16, 32, 48, 64, 256];
  const sharp = require("sharp");
  const svgBuffer = fs.readFileSync(path.join(__dirname, "src/assets/envku-logo.svg"));

  const pngBuffers = await Promise.all(sizes.map(async (size) => {
    const svgWithBg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
        <defs>
          <linearGradient id="bg" x1="0" y1="0" x2="${size}" y2="${size}" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#4f46e5"/>
            <stop offset="100%" stop-color="#7c3aed"/>
          </linearGradient>
        </defs>
        <rect width="${size}" height="${size}" rx="${Math.round(size * 0.22)}" fill="url(#bg)"/>
        <image href="data:image/svg+xml;base64,${svgBuffer.toString("base64")}" 
               x="0" y="0" width="${size}" height="${size}"/>
      </svg>
    `;
    return sharp(Buffer.from(svgWithBg)).png().toBuffer();
  }));

  const icoBuffer = await pngToIco(pngBuffers);
  fs.writeFileSync(path.join(ICONS_DIR, "icon.ico"), icoBuffer);
  console.log("✅ icon.ico berhasil digenerate!");
}

generateIco().catch(console.error);
