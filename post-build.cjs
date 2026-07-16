/**
 * post-build.cjs
 * ─────────────────────────────────────────────────────────────
 * Jalankan script ini SETELAH `npx tauri build` selesai.
 *
 * Yang dilakukan:
 *   1. Baca versi dari tauri.conf.json
 *   2. Temukan file .exe dan .sig hasil build di release/bundle/nsis/
 *   3. Salin keduanya ke website/downloads/
 *   4. Baca isi .sig → tempel ke website/update.json
 *   5. Hitung SHA-256 dari .exe yang nyata
 *   6. Update website/index.html (versi, URL, ukuran, hash, tanggal)
 *   7. Tampilkan ringkasan upload cPanel
 *
 * Cara pakai:
 *   node post-build.cjs
 * ─────────────────────────────────────────────────────────────
 */

const fs     = require("fs");
const path   = require("path");
const crypto = require("crypto");

// ── Path konfigurasi ──────────────────────────────────────────
const ROOT        = __dirname;
const TAURI_CONF  = path.join(ROOT, "src-tauri", "tauri.conf.json");
const BUNDLE_DIR  = path.join(ROOT, "src-tauri", "target", "release", "bundle", "nsis");
const WEBSITE_DIR = path.join(ROOT, "website");
const DOWNLOADS   = path.join(WEBSITE_DIR, "downloads");
const UPDATE_JSON = path.join(WEBSITE_DIR, "update.json");
const INDEX_HTML  = path.join(WEBSITE_DIR, "index.html");

// ── Baca versi dari tauri.conf.json ───────────────────────────
const tauriConf = JSON.parse(fs.readFileSync(TAURI_CONF, "utf8"));
const VERSION   = tauriConf.version; // contoh: "1.1.0"

console.log("\n🚀 Envku Post-Build Script");
console.log("━".repeat(50));
console.log(`   Versi terdeteksi: v${VERSION}`);

// ── Nama file yang diharapkan ─────────────────────────────────
const EXE_NAME = `Envku_${VERSION}_x64-setup.exe`;
const SIG_NAME = `${EXE_NAME}.sig`;
const EXE_SRC  = path.join(BUNDLE_DIR, EXE_NAME);
const SIG_SRC  = path.join(BUNDLE_DIR, SIG_NAME);

// ── Validasi file hasil build ada ─────────────────────────────
if (!fs.existsSync(EXE_SRC)) {
  console.error(`\n❌ File installer tidak ditemukan:`);
  console.error(`   ${EXE_SRC}`);
  console.error(`\n   Pastikan Anda sudah menjalankan: npx tauri build`);
  process.exit(1);
}

let hasSig = true;
if (!fs.existsSync(SIG_SRC)) {
  console.warn(`\n⚠️  File signature (.sig) tidak ditemukan:`);
  console.warn(`   ${SIG_SRC}`);
  console.warn(`   Melanjutkan rilis tanpa file signature (auto-update tidak akan ditandatangani).`);
  hasSig = false;
}

// ── Buat folder downloads jika belum ada ─────────────────────
if (!fs.existsSync(DOWNLOADS)) {
  fs.mkdirSync(DOWNLOADS, { recursive: true });
  console.log(`\n   📁 Folder dibuat: website/downloads/`);
}

// ── Salin .exe ke website/downloads/ ─────────────────────────
const EXE_DEST = path.join(DOWNLOADS, EXE_NAME);
console.log(`\n📦 Menyalin installer...`);
fs.copyFileSync(EXE_SRC, EXE_DEST);
const exeSizeMB = (fs.statSync(EXE_DEST).size / 1024 / 1024).toFixed(1);
console.log(`   ✅ Berhasil! (${exeSizeMB} MB)`);

// ── Salin .sig ke website/downloads/ ─────────────────────────
const SIG_DEST = path.join(DOWNLOADS, SIG_NAME);
if (hasSig) {
  console.log(`\n🔏 Menyalin file signature...`);
  fs.copyFileSync(SIG_SRC, SIG_DEST);
  console.log(`   ✅ Berhasil!`);
} else {
  console.log(`\n🔏 Lewati menyalin file signature (tidak ditemukan).`);
}

// ── Hitung SHA-256 dari .exe ──────────────────────────────────
console.log(`\n🔢 Menghitung SHA-256 hash...`);
const exeBuffer  = fs.readFileSync(EXE_DEST);
const sha256Full = crypto.createHash("sha256").update(exeBuffer).digest("hex");
const sha256Show = sha256Full.substring(0, 24) + "...";
console.log(`   SHA-256: ${sha256Full}`);

// ── Baca isi .sig untuk dimasukkan ke update.json ─────────────
const sigContent = hasSig ? fs.readFileSync(SIG_SRC, "utf8").trim() : "";

// ── Update update.json secara otomatis ───────────────────────
const updateJson = JSON.parse(fs.readFileSync(UPDATE_JSON, "utf8"));
const oldVersion = updateJson.version;
updateJson.version   = VERSION;
updateJson.pub_date  = new Date().toISOString();
updateJson.platforms["windows-x86_64"].url       = `https://envku.subly.my.id/downloads/${EXE_NAME}`;
updateJson.platforms["windows-x86_64"].signature = sigContent;
fs.writeFileSync(UPDATE_JSON, JSON.stringify(updateJson, null, 2), "utf8");

console.log(`\n📝 update.json diperbarui:`);
console.log(`   Versi    : ${oldVersion} → ${VERSION}`);
console.log(`   URL      : https://envku.subly.my.id/downloads/${EXE_NAME}`);
if (hasSig) {
  console.log(`   Signature: ✅ Diisi otomatis dari file .sig`);
} else {
  console.log(`   Signature: ⚠️ Dikosongkan (kunci privat tanda tangan tidak tersedia)`);
}

// ── Update index.html ─────────────────────────────────────────
console.log(`\n🌐 Memperbarui website/index.html...`);

const BULAN_ID = [
  "Januari","Februari","Maret","April","Mei","Juni",
  "Juli","Agustus","September","Oktober","November","Desember"
];
const now      = new Date();
const tglRilis = `${now.getDate()} ${BULAN_ID[now.getMonth()]} ${now.getFullYear()}`;

let html = fs.readFileSync(INDEX_HTML, "utf8");

// 1. Badge versi di Hero (misal: V1.0.0 STABLE)
html = html.replace(
  /V[\d]+\.[\d]+\.[\d]+\s*STABLE/g,
  `V${VERSION} STABLE`
);

// 2. Version-tag di download card (misal: V1.0.0 (STABLE))
html = html.replace(
  /V[\d]+\.[\d]+\.[\d]+\s*\(STABLE\)/g,
  `V${VERSION} (STABLE)`
);

// 3. URL tombol download
html = html.replace(
  /href="downloads\/Envku_[\d.]+_x64-setup\.exe"/g,
  `href="downloads/${EXE_NAME}"`
);

// 4. Nama file di panduan install step 1
html = html.replace(
  /`Envku_[\d.]+_x64-setup\.exe`/g,
  `\`${EXE_NAME}\``
);

// 5. Ukuran file nyata (Windows)
html = html.replace(
  /(<li id="file-size-win"><strong>Ukuran:<\/strong> ?)~?[\d.]+ MB(<\/li>)/,
  `$1~${exeSizeMB} MB$2`
);

// 6. Tanggal rilis (Windows)
html = html.replace(
  /(<li id="file-release-win"><strong>Rilis:<\/strong> ?).*?(<\/li>)/,
  `$1${tglRilis}$2`
);

// 7. SHA-256 hash (Windows)
html = html.replace(
  /(<span class="hash-text" id="hash-win">).*?(<\/span>)/,
  `$1${sha256Show}$2`
);

fs.writeFileSync(INDEX_HTML, html, "utf8");

console.log(`   ✅ Versi badge    : V${VERSION} STABLE`);
console.log(`   ✅ URL download   : downloads/${EXE_NAME}`);
console.log(`   ✅ Ukuran file    : ~${exeSizeMB} MB`);
console.log(`   ✅ Tanggal rilis  : ${tglRilis}`);
console.log(`   ✅ SHA-256        : ${sha256Show}`);

// ── Ringkasan file yang perlu diupload ke cPanel ──────────────
console.log(`\n${"━".repeat(50)}`);
console.log(`🌐 File yang perlu diupload ke cPanel (envku.subly.my.id):`);
console.log(`\n   📂 Root subdomain:`);
console.log(`      ✦ website/index.html            ← BARU`);
console.log(`      ✦ website/update.json`);
console.log(`\n   📂 Folder /downloads/:`);
console.log(`      ✦ website/downloads/${EXE_NAME}`);
console.log(`${"━".repeat(50)}`);
console.log(`\n✅ Post-build selesai! Aplikasi siap didistribusikan.\n`);
