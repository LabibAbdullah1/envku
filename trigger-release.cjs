/**
 * trigger-release.cjs
 * ─────────────────────────────────────────────────────────────
 * Script otomatisasi rilis GitHub Actions:
 *   1. Membaca versi terbaru dari package.json (misal: "1.4.0")
 *   2. Membuat git tag v1.4.0
 *   3. Melakukan git push origin v1.4.0 untuk memicu release.yml
 *
 * Cara pakai:
 *   node trigger-release.cjs
 *   atau: npm run tag-release
 * ─────────────────────────────────────────────────────────────
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = __dirname;
const PACKAGE_JSON_PATH = path.join(ROOT, "package.json");

console.log("\n🚀 Script Otomatisasi Git Tag Release");
console.log("━".repeat(50));

// 1. Baca versi dari package.json
if (!fs.existsSync(PACKAGE_JSON_PATH)) {
  console.error("❌ File package.json tidak ditemukan!");
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, "utf8"));
const version = pkg.version;

if (!version) {
  console.error("❌ Versi tidak ditemukan di package.json!");
  process.exit(1);
}

const tagName = `v${version}`;
console.log(`📌 Versi terdeteksi di package.json: ${version}`);
console.log(`🏷️  Git Tag sasaran                  : ${tagName}\n`);

try {
  // 2. Cek status git uncommitted changes
  const statusOutput = execSync("git status --porcelain", { cwd: ROOT, encoding: "utf8" });
  if (statusOutput.trim().length > 0) {
    console.log("⚠️  Ada perubahan berkas yang belum di-commit:");
    console.log(statusOutput);
    console.log("ℹ️  Melanjutkan pembuatan tag... (pastikan perubahan penting sudah di-commit jika ingin disertakan)");
  }

  // 3. Cek apakah tag sudah ada secara lokal
  let tagExists = false;
  try {
    const existingTags = execSync("git tag -l", { cwd: ROOT, encoding: "utf8" });
    if (existingTags.split(/\r?\n/).includes(tagName)) {
      tagExists = true;
    }
  } catch (e) {
    // abaikan jika git tag fail
  }

  if (tagExists) {
    console.log(`⚠️  Git tag '${tagName}' sudah ada secara lokal. Memperbarui tag...`);
    execSync(`git tag -d ${tagName}`, { cwd: ROOT, stdio: "inherit" });
  }

  // 4. Buat tag baru
  console.log(`📌 Membuat git tag '${tagName}'...`);
  execSync(`git tag -a ${tagName} -m "Release ${tagName}"`, { cwd: ROOT, stdio: "inherit" });
  console.log(`   ✅ Git tag '${tagName}' berhasil dibuat.`);

  // 5. Push tag ke GitHub
  console.log(`\n📤 Mendorong (push) tag '${tagName}' ke GitHub origin...`);
  execSync(`git push origin ${tagName} --force`, { cwd: ROOT, stdio: "inherit" });

  console.log("\n" + "━".repeat(50));
  console.log(`🎉 SUKSES! Tag '${tagName}' telah didorong ke GitHub.`);
  console.log(`⚡ Workflow GitHub Actions (release.yml) sedang berjalan secara otomatis.`);
  console.log(`🔗 Pantau progres build di: https://github.com/LabibAbdullah1/envku/actions`);
  console.log("━".repeat(50) + "\n");
} catch (error) {
  console.error("\n❌ Gagal membuat atau mendorong git tag!");
  console.error(error.message);
  process.exit(1);
}
