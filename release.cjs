/**
 * release.cjs
 * ─────────────────────────────────────────────────────────────
 * Script rilis lengkap satu perintah:
 *   1. Baca private key dari .env.local
 *   2. Set sebagai environment variable
 *   3. Jalankan npx tauri build
 *   4. Jalankan post-build.cjs (salin .exe + .sig, update update.json)
 *
 * Cara pakai:
 *   node release.cjs
 *   atau: npm run release
 * ─────────────────────────────────────────────────────────────
 */

const fs    = require("fs");
const path  = require("path");
const { execSync } = require("child_process");

const ROOT      = __dirname;
const ENV_FILE  = path.join(ROOT, ".env.local");

// ── Validasi .env.local ada ───────────────────────────────────
if (!fs.existsSync(ENV_FILE)) {
  console.error("\n❌ File .env.local tidak ditemukan!");
  console.error("   Buat file .env.local di folder proyek, lalu isi:");
  console.error("   TAURI_SIGNING_PRIVATE_KEY=isi_private_key_anda\n");
  process.exit(1);
}

// ── Baca dan parse .env.local ─────────────────────────────────
const envVars = {};
const envContent = fs.readFileSync(ENV_FILE, "utf8");
const envLines = envContent.split(/\r?\n/);
let currentKey = null;
let currentValue = [];
let inQuotes = false;
let quoteChar = null;

for (const line of envLines) {
  const trimmed = line.trim();

  if (currentKey === null) {
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;

    const key = line.substring(0, eqIdx).trim();
    let val = line.substring(eqIdx + 1).trim();

    // Deteksi jika string diapit kutip tapi belum ditutup (multiline)
    if ((val.startsWith('"') && !val.endsWith('"')) || (val.startsWith("'") && !val.endsWith("'"))) {
      inQuotes = true;
      quoteChar = val[0];
      currentKey = key;
      currentValue.push(val.substring(1));
    } else if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      // String satu baris yang diapit kutip
      envVars[key] = val.substring(1, val.length - 1);
    } else {
      // Nilai biasa, hilangkan komentar inline jika ada
      const hashIdx = val.indexOf(" #");
      if (hashIdx !== -1) {
        val = val.substring(0, hashIdx).trim();
      } else if (val.includes("#") && !val.includes("dW50cnVzdGVk")) {
        const idx = val.indexOf("#");
        val = val.substring(0, idx).trim();
      }
      envVars[key] = val;
    }
  } else {
    // Di dalam multiline string
    if (line.endsWith(quoteChar)) {
      currentValue.push(line.substring(0, line.length - 1));
      envVars[currentKey] = currentValue.join("\n");
      currentKey = null;
      currentValue = [];
      inQuotes = false;
    } else {
      currentValue.push(line);
    }
  }
}

// ── Validasi private key ada di file ─────────────────────────
if (!envVars["TAURI_SIGNING_PRIVATE_KEY"] || 
    envVars["TAURI_SIGNING_PRIVATE_KEY"] === "TEMPEL_PRIVATE_KEY_ANDA_DI_SINI") {
  console.error("\n❌ TAURI_SIGNING_PRIVATE_KEY belum diisi di .env.local!");
  console.error("   Buka file .env.local dan tempel private key Anda.\n");
  process.exit(1);
}

console.log("\n🔐 Private key ditemukan di .env.local ✅");
if (envVars["TAURI_SIGNING_PRIVATE_KEY_PASSWORD"]) {
  console.log("🔑 Password kunci privat ditemukan di .env.local ✅");
}
console.log("━".repeat(50));

// ── Set environment variables ─────────────────────────────────
const buildEnv = {
  ...process.env,
  ...envVars,
};

const privateKeyRaw = envVars["TAURI_SIGNING_PRIVATE_KEY"];

if (privateKeyRaw) {
  // Cek apakah privateKeyRaw adalah path file yang ada
  const resolvedPath = path.resolve(ROOT, privateKeyRaw);
  if (fs.existsSync(resolvedPath)) {
    console.log(`   Menggunakan private key dari file path: ${resolvedPath} ✅`);
    buildEnv["TAURI_SIGNING_PRIVATE_KEY"] = resolvedPath;
  } else {
    // Jika bukan file path, gunakan raw string (Base64 atau plaintext) langsung
    console.log("   Menggunakan private key langsung dari string .env.local ✅");
    buildEnv["TAURI_SIGNING_PRIVATE_KEY"] = privateKeyRaw;
  }
}

// Fungsi pembersih (no-op karena tidak menggunakan file kunci sementara)
function cleanupTempKey() {}

// ── Jalankan tauri build ──────────────────────────────────────
console.log("\n⚙️  Memulai Tauri Build...");
console.log("   (Proses ini memakan waktu 5-15 menit)\n");

// Dapatkan argumen tambahan jika ada
const args = process.argv.slice(2);
const buildArgs = args.length > 0 ? " " + args.join(" ") : "";
const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";

try {
  execSync(`${npxCmd} tauri build${buildArgs}`, {
    cwd: ROOT,
    env: buildEnv,
    stdio: "inherit", // tampilkan output langsung ke terminal
  });
} catch (err) {
  console.error("\n❌ Tauri build gagal! Lihat error di atas.");
  cleanupTempKey();
  process.exit(1);
}

cleanupTempKey();

// ── Jalankan post-build ───────────────────────────────────────
console.log("\n📦 Menjalankan post-build (salin file & update update.json)...");

try {
  execSync("node post-build.cjs", {
    cwd: ROOT,
    stdio: "inherit",
  });
} catch (err) {
  console.error("\n❌ Post-build gagal!");
  process.exit(1);
}
