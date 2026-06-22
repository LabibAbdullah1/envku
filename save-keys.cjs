/**
 * save-keys.cjs
 * Jalankan SETELAH `npm run tauri signer generate` selesai.
 * Tempel output dari terminal ke dalam script ini untuk diekstrak dan disimpan.
 *
 * ATAU: Jalankan `node save-keys.cjs "ISI_PRIVATE_KEY" "ISI_PUBLIC_KEY"`
 */

const fs   = require("fs");
const path = require("path");

const ROOT       = __dirname;
const ENV_FILE   = path.join(ROOT, ".env.local");
const TAURI_CONF = path.join(ROOT, "src-tauri", "tauri.conf.json");

const privateKey = process.argv[2];
const publicKey  = process.argv[3];

if (!privateKey || !publicKey) {
  console.log(`
📋 CARA PAKAI:
   node save-keys.cjs "<PRIVATE_KEY>" "<PUBLIC_KEY>"

   Private key dan public key bisa dilihat dari output perintah:
   npm run tauri -- signer generate

   Contoh:
   node save-keys.cjs "dW50cnVzdGVk..." "dW50cnVzdGVk..."
`);
  process.exit(0);
}

// ── Simpan private key ke .env.local ─────────────────────────
let envContent = "";
if (fs.existsSync(ENV_FILE)) {
  envContent = fs.readFileSync(ENV_FILE, "utf8");
  // Ganti baris TAURI_SIGNING_PRIVATE_KEY yang lama
  envContent = envContent.replace(
    /^TAURI_SIGNING_PRIVATE_KEY=.*$/m,
    `TAURI_SIGNING_PRIVATE_KEY=${privateKey}`
  );
  if (!envContent.includes("TAURI_SIGNING_PRIVATE_KEY=")) {
    envContent += `\nTAURI_SIGNING_PRIVATE_KEY=${privateKey}\n`;
  }
} else {
  envContent = `TAURI_SIGNING_PRIVATE_KEY=${privateKey}\n`;
}
fs.writeFileSync(ENV_FILE, envContent, "utf8");
console.log("✅ Private key disimpan ke .env.local");

// ── Update public key di tauri.conf.json ──────────────────────
const tauriConf = JSON.parse(fs.readFileSync(TAURI_CONF, "utf8"));
tauriConf.plugins.updater.pubkey = publicKey;
fs.writeFileSync(TAURI_CONF, JSON.stringify(tauriConf, null, 2), "utf8");
console.log("✅ Public key diperbarui di tauri.conf.json");

console.log("\n🎉 Kunci berhasil disimpan! Sekarang jalankan: npm run release\n");
