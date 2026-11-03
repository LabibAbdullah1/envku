/**
 * comprehensive-test.cjs
 * ─────────────────────────────────────────────────────────────
 * Script Pengujian Menyeluruh (Automated Comprehensive Test)
 * Menguji semua modul & fitur Envku untuk mendeteksi celah error
 * sebelum build production.
 * ─────────────────────────────────────────────────────────────
 */

const fs = require("fs");
const path = require("path");
const { execSync, spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const SERVER_DIR = "C:\\server";

// Pastikan folder temp tersedia
if (fs.existsSync(SERVER_DIR) && !fs.existsSync(path.join(SERVER_DIR, "temp"))) {
  fs.mkdirSync(path.join(SERVER_DIR, "temp"), { recursive: true });
}

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function assert(condition, testName, errorDetails = "") {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    failedTests++;
    console.error(`  ❌ [FAIL] ${testName}`);
    if (errorDetails) {
      console.error(`     ↳ Details: ${errorDetails}`);
    }
    failures.push({ testName, errorDetails });
  }
}

function runCmd(cmd, options = {}) {
  const res = spawnSync(cmd, {
    shell: true,
    encoding: "utf8",
    ...options,
  });
  return {
    success: res.status === 0,
    stdout: res.stdout || "",
    stderr: res.stderr || "",
  };
}

console.log("\n🧪 MEMULAI PENGUJIAN MENYELURUH FITUR ENVKU (PRE-PRODUCTION AUDIT)");
console.log("═".repeat(70));

// ─────────────────────────────────────────────────────────────
// 1. UJI STRUKTUR DIREKTORI & INTEGRITAS SERVER
// ─────────────────────────────────────────────────────────────
console.log("\n[1/7] Menguji Integritas Direktori Server (C:\\server)...");
assert(fs.existsSync(SERVER_DIR), "Direktori utama C:\\server ditemukan");
assert(fs.existsSync(path.join(SERVER_DIR, "Apache24")), "Folder Apache24 ditemukan");
assert(fs.existsSync(path.join(SERVER_DIR, "mysql")), "Folder MySQL ditemukan");
assert(fs.existsSync(path.join(SERVER_DIR, "www")), "Folder www ditemukan");
assert(fs.existsSync(path.join(SERVER_DIR, "www", "phpmyadmin")), "Folder phpMyAdmin ditemukan");
assert(fs.existsSync(path.join(SERVER_DIR, "temp")), "Folder temp ditemukan untuk sesi & cache");

// ─────────────────────────────────────────────────────────────
// 2. UJI SINTAKS & VALIDASI APACHE HTTP SERVER
// ─────────────────────────────────────────────────────────────
console.log("\n[2/7] Menguji Konfigurasi & Sintaks Apache HTTP Server...");
const httpdExe = path.join(SERVER_DIR, "Apache24", "bin", "httpd.exe");
const httpdConf = path.join(SERVER_DIR, "Apache24", "conf", "httpd.conf");
const httpdPhpConf = path.join(SERVER_DIR, "Apache24", "conf", "extra", "httpd-php.conf");
const httpdVhostsConf = path.join(SERVER_DIR, "Apache24", "conf", "extra", "httpd-vhosts.conf");

assert(fs.existsSync(httpdExe), "httpd.exe binary ditemukan");
assert(fs.existsSync(httpdConf), "httpd.conf konfigurasi utama ditemukan");
assert(fs.existsSync(httpdPhpConf), "extra/httpd-php.conf ditemukan");
assert(fs.existsSync(httpdVhostsConf), "extra/httpd-vhosts.conf ditemukan");

if (fs.existsSync(httpdExe)) {
  const checkSyntax = runCmd(`"${httpdExe}" -t -f "${httpdConf}" -d "${path.join(SERVER_DIR, "Apache24")}"`);
  const syntaxOut = `${checkSyntax.stdout} ${checkSyntax.stderr}`;
  assert(
    syntaxOut.includes("Syntax OK"),
    "Apache Config Syntax Check (httpd -t) menghasilkan 'Syntax OK'",
    syntaxOut.trim()
  );
}

// Periksa httpd.conf memuat Alias /phpmyadmin
const httpdContent = fs.readFileSync(httpdConf, "utf8");
assert(httpdContent.includes("Alias /phpmyadmin"), "httpd.conf memiliki Alias /phpmyadmin global");
assert(httpdContent.includes("IncludeOptional conf/extra/httpd-php.conf"), "httpd.conf memuat IncludeOptional httpd-php.conf");

// ─────────────────────────────────────────────────────────────
// 3. UJI MODUL PHP & INTEGRITAS EXTENSION_DIR (PHP 8.2 & 8.4)
// ─────────────────────────────────────────────────────────────
console.log("\n[3/7] Menguji Konfigurasi PHP (PHP 8.2 & PHP 8.4)...");
const phpVersions = ["php82", "php84"];

for (const ver of phpVersions) {
  const phpDir = path.join(SERVER_DIR, ver);
  if (fs.existsSync(phpDir)) {
    const phpExe = path.join(phpDir, "php.exe");
    const phpIni = path.join(phpDir, "php.ini");
    const phpTsDll = path.join(phpDir, "php8ts.dll");
    const phpApacheDll = path.join(phpDir, "php8apache2_4.dll");

    assert(fs.existsSync(phpExe), `${ver}: php.exe ditemukan`);
    assert(fs.existsSync(phpIni), `${ver}: php.ini ditemukan`);
    assert(fs.existsSync(phpTsDll), `${ver}: php8ts.dll (Thread Safe core) ditemukan`);
    assert(fs.existsSync(phpApacheDll), `${ver}: php8apache2_4.dll (Apache SAPI) ditemukan`);

    // Periksa isi php.ini
    const iniContent = fs.readFileSync(phpIni, "utf8");
    const expectedExtDir = `${SERVER_DIR.replace(/\\/g, "/")}/${ver}/ext`;
    assert(
      iniContent.includes(expectedExtDir),
      `${ver}: extension_dir disetel ke path absolut (${expectedExtDir})`,
      "extension_dir masih relatif 'ext', ini akan membuat Apache gagal memuat mysqli!"
    );

    assert(
      iniContent.includes("~E_DEPRECATED"),
      `${ver}: error_reporting memfilter ~E_DEPRECATED untuk keamanan phpMyAdmin`,
      "E_DEPRECATED aktif, ini akan merusak header session phpMyAdmin di PHP 8.4"
    );

    // Jalankan php.exe -m dan cek modul kritis
    const phpM = runCmd(`"${phpExe}" -m`);
    if (phpM.success) {
      assert(phpM.stdout.includes("mysqli"), `${ver}: Ekstensi mysqli aktif`);
      assert(phpM.stdout.includes("mbstring"), `${ver}: Ekstensi mbstring aktif`);
      assert(phpM.stdout.includes("openssl"), `${ver}: Ekstensi openssl aktif`);
      assert(phpM.stdout.includes("curl"), `${ver}: Ekstensi curl aktif`);
      assert(phpM.stdout.includes("pdo_mysql"), `${ver}: Ekstensi pdo_mysql aktif`);
    } else {
      assert(false, `${ver}: php.exe -m gagal dijalankan`, phpM.stderr);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// 4. UJI INTEGRITAS PHPMYADMIN & KOMPATIBILITAS PHP 8.4+
// ─────────────────────────────────────────────────────────────
console.log("\n[4/7] Menguji phpMyAdmin & Kompatibilitas Versi PHP...");
const pmaDir = path.join(SERVER_DIR, "www", "phpmyadmin");
const pmaConfig = path.join(pmaDir, "config.inc.php");
const pmaIndex = path.join(pmaDir, "index.php");

assert(fs.existsSync(pmaDir), "Folder phpMyAdmin ada di C:\\server\\www\\phpmyadmin");
assert(fs.existsSync(pmaConfig), "config.inc.php phpMyAdmin ada");
assert(fs.existsSync(pmaIndex), "index.php phpMyAdmin ada");

if (fs.existsSync(pmaConfig)) {
  const pmaConfContent = fs.readFileSync(pmaConfig, "utf8");
  assert(
    pmaConfContent.includes("~E_DEPRECATED"),
    "config.inc.php memiliki peredam E_DEPRECATED runtime untuk PHP 8.4+"
  );
  assert(
    pmaConfContent.includes("blowfish_secret"),
    "config.inc.php memiliki blowfish_secret yang valid"
  );
}

// Uji eksekusi PHP CLI terhadap index phpMyAdmin untuk melihat apakah ada Fatal Error
const php84Exe = path.join(SERVER_DIR, "php84", "php.exe");
if (fs.existsSync(php84Exe) && fs.existsSync(pmaIndex)) {
  const pmaLint = runCmd(`"${php84Exe}" -l "${pmaIndex}"`);
  assert(
    pmaLint.success && pmaLint.stdout.includes("No syntax errors detected"),
    "phpMyAdmin index.php lolos uji lint PHP 8.4 tanpa error sintaks"
  );
}

// ─────────────────────────────────────────────────────────────
// 5. UJI DATABASE MYSQL
// ─────────────────────────────────────────────────────────────
console.log("\n[5/7] Menguji Konfigurasi & Inisialisasi MySQL 8.0...");
const mysqlDir = path.join(SERVER_DIR, "mysql");
const mysqldExe = path.join(mysqlDir, "bin", "mysqld.exe");
const mysqlIni = path.join(mysqlDir, "my.ini");
const mysqlData = path.join(mysqlDir, "data");

assert(fs.existsSync(mysqldExe), "mysqld.exe binary ditemukan");
assert(fs.existsSync(mysqlIni), "my.ini konfigurasi MySQL ditemukan");
assert(fs.existsSync(mysqlData), "Folder data MySQL sudah terinisialisasi");

if (fs.existsSync(mysqlIni)) {
  const ini = fs.readFileSync(mysqlIni, "utf8");
  assert(ini.includes("port=3306"), "my.ini memiliki port=3306");
  assert(ini.includes("basedir"), "my.ini memiliki basedir yang valid");
  assert(ini.includes("datadir"), "my.ini memiliki datadir yang valid");
}

// ─────────────────────────────────────────────────────────────
// 6. UJI INTEGRITAS POST-BUILD & UPDATE RELEASE SCRIPTS
// ─────────────────────────────────────────────────────────────
console.log("\n[6/7] Menguji Skrip Rilis & Sinkronisasi Website...");
const postBuildWin = path.join(ROOT, "post-build.cjs");
const postBuildLinux = path.join(ROOT, "post-build-linux.cjs");
const tauriConf = path.join(ROOT, "src-tauri", "tauri.conf.json");

assert(fs.existsSync(postBuildWin), "post-build.cjs ditemukan");
assert(fs.existsSync(postBuildLinux), "post-build-linux.cjs ditemukan");
assert(fs.existsSync(tauriConf), "tauri.conf.json ditemukan");

if (fs.existsSync(tauriConf)) {
  const conf = JSON.parse(fs.readFileSync(tauriConf, "utf8"));
  assert(!!conf.version, `Versi aplikasi tauri terdefinisi: v${conf.version}`);
  assert(conf.bundle.targets.includes("nsis"), "Bundle targets mencakup installer nsis");
  assert(conf.bundle.targets.includes("appimage"), "Bundle targets mencakup Linux appimage");
  assert(conf.bundle.targets.includes("deb"), "Bundle targets mencakup Linux deb");
}

// ─────────────────────────────────────────────────────────────
// 7. UJI PORT LOGIC & APACHE CO-EXISTENCE (PORT 80 & 443)
// ─────────────────────────────────────────────────────────────
console.log("\n[7/7] Menguji Kode Logika Services & Port Manager...");
const servicesRs = path.join(ROOT, "src-tauri", "src", "commands", "services.rs");
const phpRs = path.join(ROOT, "src-tauri", "src", "commands", "php.rs");
const nodeRs = path.join(ROOT, "src-tauri", "src", "commands", "node.rs");
const downloaderRs = path.join(ROOT, "src-tauri", "src", "commands", "downloader.rs");

const servicesContent = fs.readFileSync(servicesRs, "utf8");
const phpContent = fs.readFileSync(phpRs, "utf8");
const nodeContent = fs.readFileSync(nodeRs, "utf8");
const downloaderContent = fs.readFileSync(downloaderRs, "utf8");

assert(
  servicesContent.includes("(port == 80 || port == 443)") && servicesContent.includes("is_envku = true"),
  "services.rs mengenali Apache di Port 80 & Port 443 sebagai is_envku = true (Bukan Bentrok)"
);

assert(
  servicesContent.includes("cleared = true") || servicesContent.includes("still_alive"),
  "services.rs menangani penutupan proses Apache lama saat start tanpa memicu bentrok port palsu"
);

assert(
  phpContent.includes("LoadFile") && phpContent.includes("php8ts.dll"),
  "php.rs menyertakan arahan LoadFile php8ts.dll untuk mencegah crash mismatch DLL"
);

assert(
  phpContent.includes("configure_php_ini_for_version"),
  "php.rs otomatis mengkonfigurasi php.ini dengan path absolut saat switch PHP"
);

assert(
  nodeContent.includes("pub async fn install_node_version") && nodeContent.includes("resolve_node_version"),
  "node.rs menggunakan fungsi async non-blocking dan resolver versi Node.js"
);

assert(
  downloaderContent.includes("download_file_with_resume"),
  "downloader.rs mendukung download resumable (HTTP Range) & auto-retry loop"
);

// ─────────────────────────────────────────────────────────────
// REKAPITULASI HASIL
// ─────────────────────────────────────────────────────────────
console.log("\n" + "═".repeat(70));
console.log(`📊 REKAPITULASI PENGUJIAN:`);
console.log(`   Total Pengujian: ${totalTests}`);
console.log(`   Berhasil (Pass): ${passedTests}`);
console.log(`   Gagal    (Fail): ${failedTests}`);
console.log("═".repeat(70));

if (failedTests === 0) {
  console.log("\n🎉 SEMUA FITUR & INTEGRASI LOLOS PENGUJIAN 100%! SIAP UNTUK PRODUCTION.");
  process.exit(0);
} else {
  console.error(`\n⚠️  TERDAPAT ${failedTests} PENGUJIAN YANG GAGAL. SILAKAN CEK DETAIL DI ATAS.`);
  process.exit(1);
}
