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

// 2. Ukuran file nyata (Linux)
html = html.replace(
  /(<li id="file-size-linux"><strong>Ukuran:<\/strong> ?)~?[\d.]+ MB(<\/li>)/,
  `$1~${appImageSizeMB} MB$2`
);

// 3. Tanggal rilis (Linux)
html = html.replace(
  /(<li id="file-release-linux"><strong>Rilis:<\/strong> ?).*?(<\/li>)/,
  `$1${tglRilis}$2`
);

// 4. SHA-256 hash (Linux)
html = html.replace(
  /(<span class="hash-text" id="hash-linux">).*?(<\/span>)/,
  `$1${sha256Show}$2`
);

fs.writeFileSync(INDEX_HTML, html, "utf8");

console.log(`   ✅ URL download Linux: downloads/${appImageFile}`);
console.log(`   ✅ Ukuran file Linux : ~${appImageSizeMB} MB`);
console.log(`   ✅ Tanggal rilis Linux: ${tglRilis}`);
console.log(`   ✅ SHA-256 Linux     : ${sha256Show}`);
console.log(`\n✅ Post-build Linux selesai!`);
