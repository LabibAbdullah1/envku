/**
 * post-build-linux.cjs
 * ─────────────────────────────────────────────────────────────
 * Jalankan script ini SETELAH `npx tauri build` selesai di runner Linux.
 * ─────────────────────────────────────────────────────────────
 */

const fs     = require("fs");
const path   = require("path");
const crypto = require("crypto");

// ── Path konfigurasi ──────────────────────────────────────────
const ROOT        = __dirname;
const TAURI_CONF  = path.join(ROOT, "src-tauri", "tauri.conf.json");
const BUNDLE_DIR  = path.join(ROOT, "src-tauri", "target", "release", "bundle", "appimage");
const DEB_BUNDLE_DIR = path.join(ROOT, "src-tauri", "target", "release", "bundle", "deb");
const WEBSITE_DIR = path.join(ROOT, "website");
const DOWNLOADS   = path.join(WEBSITE_DIR, "downloads");
const UPDATE_JSON = path.join(WEBSITE_DIR, "update.json");
const INDEX_HTML  = path.join(WEBSITE_DIR, "index.html");

// ── Baca versi dari tauri.conf.json ───────────────────────────
const tauriConf = JSON.parse(fs.readFileSync(TAURI_CONF, "utf8"));
const VERSION   = tauriConf.version; // contoh: "1.3.7"

console.log("\n🚀 Envku Linux Post-Build Script (AppImage)");
console.log("━".repeat(50));
console.log(`   Versi terdeteksi: v${VERSION}`);

// ── Temukan folder bundle AppImage ────────────────────────────
if (!fs.existsSync(BUNDLE_DIR)) {
  console.error(`\n❌ Folder bundle AppImage tidak ditemukan: ${BUNDLE_DIR}`);
  process.exit(1);
}

const files = fs.readdirSync(BUNDLE_DIR);

// Cari file .AppImage, .AppImage.tar.gz, dan .AppImage.tar.gz.sig
const appImageFile = files.find(f => f.toLowerCase().startsWith("envku_") && f.endsWith(".AppImage"));
const tarGzFile    = files.find(f => f.toLowerCase().startsWith("envku_") && f.endsWith(".AppImage.tar.gz"));
const sigFile      = files.find(f => f.toLowerCase().startsWith("envku_") && f.endsWith(".AppImage.tar.gz.sig"));

if (!appImageFile) {
  console.error(`\n❌ Berkas .AppImage tidak ditemukan di folder ${BUNDLE_DIR}`);
  process.exit(1);
}

console.log(`   File .AppImage terdeteksi: ${appImageFile}`);

// Cari file .deb jika folder deb bundle ada
let debFile = null;
let debSizeMB = "0";
if (fs.existsSync(DEB_BUNDLE_DIR)) {
  const debFiles = fs.readdirSync(DEB_BUNDLE_DIR);
  debFile = debFiles.find(f => f.toLowerCase().startsWith("envku_") && f.endsWith(".deb"));
  if (debFile) {
    console.log(`   File .deb terdeteksi: ${debFile}`);
  } else {
    console.warn(`⚠️  Berkas .deb tidak ditemukan di folder ${DEB_BUNDLE_DIR}`);
  }
} else {
  console.warn(`⚠️  Folder bundle deb tidak ditemukan: ${DEB_BUNDLE_DIR}`);
}

// ── Buat folder downloads jika belum ada ─────────────────────
if (!fs.existsSync(DOWNLOADS)) {
  fs.mkdirSync(DOWNLOADS, { recursive: true });
}

// ── Salin .AppImage ke website/downloads/ ─────────────────────
const APPIMAGE_SRC  = path.join(BUNDLE_DIR, appImageFile);
const APPIMAGE_DEST = path.join(DOWNLOADS, appImageFile);
console.log(`\n📦 Menyalin biner AppImage...`);
fs.copyFileSync(APPIMAGE_SRC, APPIMAGE_DEST);
const appImageSizeMB = (fs.statSync(APPIMAGE_DEST).size / 1024 / 1024).toFixed(1);
console.log(`   ✅ Berhasil! (${appImageSizeMB} MB)`);

// ── Salin file updater .tar.gz & .sig jika ada ───────────────
if (tarGzFile && sigFile) {
  console.log(`📦 Menyalin arsip updater (.tar.gz) dan signature (.sig)...`);
  fs.copyFileSync(path.join(BUNDLE_DIR, tarGzFile), path.join(DOWNLOADS, tarGzFile));
  fs.copyFileSync(path.join(BUNDLE_DIR, sigFile), path.join(DOWNLOADS, sigFile));
  console.log(`   ✅ Berhasil disalin.`);
} else {
  console.warn(`⚠️  Arsip updater atau file signature tidak ditemukan di folder bundle.`);
}

// ── Salin file .deb jika ada ─────────────────────────────────
let debSha256Show = "Belum dihitung";
if (debFile) {
  console.log(`📦 Menyalin biner .deb...`);
  const DEB_SRC = path.join(DEB_BUNDLE_DIR, debFile);
  const DEB_DEST = path.join(DOWNLOADS, debFile);
  fs.copyFileSync(DEB_SRC, DEB_DEST);
  debSizeMB = (fs.statSync(DEB_DEST).size / 1024 / 1024).toFixed(1);
  console.log(`   ✅ Berhasil! (${debSizeMB} MB)`);
  
  // Hitung SHA-256 untuk DEB
  const bufferDeb = fs.readFileSync(DEB_DEST);
  const debSha256Full = crypto.createHash("sha256").update(bufferDeb).digest("hex");
  debSha256Show = debSha256Full.substring(0, 24) + "...";
}

// ── Hitung SHA-256 dari .AppImage ─────────────────────────────
console.log(`\n🔢 Menghitung SHA-256 hash untuk AppImage...`);
const bufferAppImage = fs.readFileSync(APPIMAGE_DEST);
const sha256Full     = crypto.createHash("sha256").update(bufferAppImage).digest("hex");
const sha256Show     = sha256Full.substring(0, 24) + "...";
console.log(`   SHA-256: ${sha256Full}`);

// ── Update update.json untuk platform linux-x86_64 ────────────
if (tarGzFile && sigFile && fs.existsSync(UPDATE_JSON)) {
  console.log(`\n📝 Memperbarui update.json untuk auto-updater Linux...`);
  const sigContent = fs.readFileSync(path.join(DOWNLOADS, sigFile), "utf8").trim();
  
  const updateJson = JSON.parse(fs.readFileSync(UPDATE_JSON, "utf8"));
  if (!updateJson.platforms) {
    updateJson.platforms = {};
  }
  updateJson.platforms["linux-x86_64"] = {
    signature: sigContent,
    url: `https://envku.subly.my.id/downloads/${tarGzFile}`
  };
  
  fs.writeFileSync(UPDATE_JSON, JSON.stringify(updateJson, null, 2), "utf8");
  console.log(`   ✅ update.json berhasil diperbarui untuk linux-x86_64.`);
}

// ── Update index.html ─────────────────────────────────────────
console.log(`\n🌐 Memperbarui website/index.html untuk Linux...`);

const BULAN_ID = [
  "Januari","Februari","Maret","April","Mei","Juni",
  "Juli","Agustus","September","Oktober","November","Desember"
];
const now      = new Date();
const tglRilis = `${now.getDate()} ${BULAN_ID[now.getMonth()]} ${now.getFullYear()}`;

let html = fs.readFileSync(INDEX_HTML, "utf8");

// 1. URL tombol download Linux (.AppImage)
html = html.replace(
  /href="downloads\/[eE]nvku_[\d.]+_amd64\.AppImage"/g,
  `href="downloads/${appImageFile}"`
);

// 1b. URL tombol download Linux (.deb)
if (debFile) {
  html = html.replace(
    /href="downloads\/[eE]nvku_[\d.]+_amd64\.deb"/g,
    `href="downloads/${debFile}"`
  );
}

// 2. Ukuran file nyata (Linux AppImage)
html = html.replace(
  /(<li id="file-size-appimage"><strong>Ukuran:<\/strong> ?).*?(<\/li>)/,
  `$1~${appImageSizeMB} MB$2`
);

// 2b. Ukuran file nyata (Linux DEB)
if (debFile) {
  html = html.replace(
    /(<li id="file-size-deb"><strong>Ukuran:<\/strong> ?).*?(<\/li>)/,
    `$1~${debSizeMB} MB$2`
  );
}

// 3. Tanggal rilis (Linux AppImage)
html = html.replace(
  /(<li id="file-release-appimage"><strong>Rilis:<\/strong> ?).*?(<\/li>)/,
  `$1${tglRilis}$2`
);

// 3b. Tanggal rilis (Linux DEB)
if (debFile) {
  html = html.replace(
    /(<li id="file-release-deb"><strong>Rilis:<\/strong> ?).*?(<\/li>)/,
    `$1${tglRilis}$2`
  );
}

// 4. SHA-256 hash (Linux AppImage)
html = html.replace(
  /(<span class="hash-text" id="hash-appimage">).*?(<\/span>)/,
  `$1${sha256Show}$2`
);

// 4b. SHA-256 hash (Linux DEB)
if (debFile) {
  html = html.replace(
    /(<span class="hash-text" id="hash-deb">).*?(<\/span>)/,
    `$1${debSha256Show}$2`
  );
}

fs.writeFileSync(INDEX_HTML, html, "utf8");

console.log(`   ✅ URL download Linux: downloads/${appImageFile}`);
console.log(`   ✅ Ukuran AppImage   : ~${appImageSizeMB} MB`);
console.log(`   ✅ Ukuran DEB        : ~${debSizeMB} MB`);
console.log(`   ✅ Tanggal rilis Linux: ${tglRilis}`);
console.log(`   ✅ SHA-256 AppImage  : ${sha256Show}`);
console.log(`   ✅ SHA-256 DEB       : ${debSha256Show}`);
console.log(`\n✅ Post-build Linux selesai!`);
