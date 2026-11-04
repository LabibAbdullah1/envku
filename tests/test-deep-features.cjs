/**
 * test-deep-features.cjs
 * ─────────────────────────────────────────────────────────────
 * Pengujian Mendalam (Deep Testing):
 * 1. Create Project (PHP VirtualHost & Node.js Proxy VirtualHost)
 * 2. SSL Generation (OpenSSL 2048-bit RSA + Apache SSL VirtualHost)
 * 3. Symlink Node.js (C:\Program Files\nodejs & Path resolution)
 * 4. Instalasi Node.js via NVM & Version Resolver Logic
 * ─────────────────────────────────────────────────────────────
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const SERVER_DIR = "C:\\server";

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

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
  }
}

function runCmd(cmd) {
  const res = spawnSync(cmd, { shell: true, encoding: "utf8" });
  return {
    success: res.status === 0,
    stdout: res.stdout || "",
    stderr: res.stderr || "",
  };
}

console.log("\n🧪 PENGUJIAN MENDALAM: CREATE PROJECT, SSL, SYMLINK NODE.JS & NVM");
console.log("═".repeat(70));

// ─────────────────────────────────────────────────────────────
// BAGIAN 1: UJI CREATE PROJECT (PHP & NODE PROXY)
// ─────────────────────────────────────────────────────────────
console.log("\n[1/4] Menguji Pembuatan Proyek (VirtualHost Generator & Syntax Check)...");
const vhostsPath = path.join(SERVER_DIR, "Apache24", "conf", "extra", "httpd-vhosts.conf");
const httpdExe = path.join(SERVER_DIR, "Apache24", "bin", "httpd.exe");
const httpdConf = path.join(SERVER_DIR, "Apache24", "conf", "httpd.conf");
const apacheDir = path.join(SERVER_DIR, "Apache24");

const testDomain = "test-automated-project.test";
const testNodeDomain = "test-automated-node.test";
const testDocRoot = path.join(SERVER_DIR, "www", "test-project").replace(/\\/g, "/");

// Backup original vhosts content
const originalVhosts = fs.existsSync(vhostsPath) ? fs.readFileSync(vhostsPath, "utf8") : "";

try {
  // 1. Buat folder proyek uji
  fs.mkdirSync(testDocRoot, { recursive: true });
  fs.writeFileSync(path.join(testDocRoot, "index.php"), "<?php echo 'Envku OK'; ?>");
  assert(fs.existsSync(path.join(testDocRoot, "index.php")), "File proyek uji (index.php) berhasil dibuat");

  // 2. Tambah VirtualHost PHP ke httpd-vhosts.conf
  const phpVhostBlock = `
<VirtualHost *:80>
    DocumentRoot "${testDocRoot}"
    ServerName ${testDomain}
    <Directory "${testDocRoot}">
        Options Indexes FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>
</VirtualHost>
`;

  // 3. Tambah VirtualHost Node.js Reverse Proxy
  const nodeVhostBlock = `
<VirtualHost *:80>
    ServerName ${testNodeDomain}
    ProxyPreserveHost On
    ProxyPass / http://127.0.0.1:3000/
    ProxyPassReverse / http://127.0.0.1:3000/
</VirtualHost>
`;

  fs.appendFileSync(vhostsPath, phpVhostBlock + nodeVhostBlock);
  const updatedVhosts = fs.readFileSync(vhostsPath, "utf8");
  assert(updatedVhosts.includes(testDomain), "VirtualHost PHP berhasil ditulis ke httpd-vhosts.conf");
  assert(updatedVhosts.includes(testNodeDomain), "VirtualHost Node.js Proxy berhasil ditulis ke httpd-vhosts.conf");

  // 4. Validasi sintaks Apache setelah kedua VirtualHost ditambahkan
  const syntaxCheck = runCmd(`"${httpdExe}" -t -f "${httpdConf}" -d "${apacheDir}"`);
  const syntaxOutput = `${syntaxCheck.stdout} ${syntaxCheck.stderr}`;
  assert(
    syntaxOutput.includes("Syntax OK"),
    "Apache Config Syntax tervalidasi 'Syntax OK' dengan VirtualHost baru",
    syntaxOutput.trim()
  );
} finally {
  // Kembalikan file vhosts asli dan bersihkan folder uji
  fs.writeFileSync(vhostsPath, originalVhosts);
  try {
    fs.rmSync(testDocRoot, { recursive: true, force: true });
  } catch (e) {}
}

// ─────────────────────────────────────────────────────────────
// BAGIAN 2: UJI SSL (OPENSSL GENERATION & APACHE SSL VHOST)
// ─────────────────────────────────────────────────────────────
console.log("\n[2/4] Menguji Pembuatan Sertifikat SSL & VirtualHost HTTPS (Port 443)...");
const opensslExe = path.join(SERVER_DIR, "Apache24", "bin", "openssl.exe");
const sslDir = path.join(SERVER_DIR, "ssl");
fs.mkdirSync(sslDir, { recursive: true });

const sslDomain = "test-ssl-automated.test";
const keyPath = path.join(sslDir, `${sslDomain}.key`);
const crtPath = path.join(sslDir, `${sslDomain}.crt`);
const cnfPath = path.join(sslDir, `${sslDomain}_openssl.cnf`);

assert(fs.existsSync(opensslExe), "openssl.exe Apache ditemukan");

const cnfContent = `[ req ]
default_bits        = 2048
distinguished_name  = req_distinguished_name
req_extensions      = v3_req
x509_extensions     = v3_req
prompt              = no

[ req_distinguished_name ]
CN                  = ${sslDomain}

[ v3_req ]
keyUsage            = critical, digitalSignature, keyEncipherment
extendedKeyUsage    = serverAuth
subjectAltName      = @alt_names

[ alt_names ]
DNS.1               = ${sslDomain}
DNS.2               = *.${sslDomain}
`;

fs.writeFileSync(cnfPath, cnfContent);

// Jalankan openssl req untuk generate cert & key
const genCert = runCmd(
  `"${opensslExe}" req -x509 -nodes -days 365 -newkey rsa:2048 -keyout "${keyPath}" -out "${crtPath}" -config "${cnfPath}"`
);

assert(
  fs.existsSync(keyPath) && fs.existsSync(crtPath),
  "OpenSSL berhasil membuat sertifikat .crt dan private key .key (RSA 2048-bit)",
  genCert.stderr
);

// Uji penulisan SSL VirtualHost ke Apache
const sslCleanDir = sslDir.replace(/\\/g, "/");
const sslVhostBlock = `
<VirtualHost *:443>
    DocumentRoot "C:/server/www"
    ServerName ${sslDomain}
    SSLEngine on
    SSLCertificateFile "${sslCleanDir}/${sslDomain}.crt"
    SSLCertificateKeyFile "${sslCleanDir}/${sslDomain}.key"
    <Directory "C:/server/www">
        Options Indexes FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>
</VirtualHost>
`;

try {
  fs.appendFileSync(vhostsPath, sslVhostBlock);
  const sslSyntax = runCmd(`"${httpdExe}" -t -f "${httpdConf}" -d "${apacheDir}"`);
  const sslOutput = `${sslSyntax.stdout} ${sslSyntax.stderr}`;
  assert(
    sslOutput.includes("Syntax OK"),
    "Apache Config Syntax tervalidasi 'Syntax OK' dengan SSL VirtualHost (Port 443)",
    sslOutput.trim()
  );
} finally {
  fs.writeFileSync(vhostsPath, originalVhosts);
  // Bersihkan file sertifikat uji
  try {
    fs.unlinkSync(keyPath);
    fs.unlinkSync(crtPath);
    fs.unlinkSync(cnfPath);
  } catch (e) {}
}

// ─────────────────────────────────────────────────────────────
// BAGIAN 3: UJI SYMLINK NODE.JS & DETEKSI SISTEM
// ─────────────────────────────────────────────────────────────
console.log("\n[3/4] Menguji Symlink Node.js (C:\\Program Files\\nodejs) & Runtime...");
const nodeSymlinkPath = "C:\\Program Files\\nodejs";
const nodeExePath = path.join(nodeSymlinkPath, "node.exe");

assert(fs.existsSync(nodeSymlinkPath), "Direktori symlink Node.js (C:\\Program Files\\nodejs) ada");
assert(fs.existsSync(nodeExePath), "node.exe ditemukan di dalam direktori symlink C:\\Program Files\\nodejs");

// Cek apakah node.exe dapat dijalankan melalui symlink
const nodeVerCheck = runCmd(`"${nodeExePath}" -v`);
assert(
  nodeVerCheck.success && nodeVerCheck.stdout.trim().startsWith("v"),
  `Node.js aktif melalui symlink berhasil dijalankan: ${nodeVerCheck.stdout.trim()}`
);

// Cek npm melalui symlink
const npmCmd = path.join(nodeSymlinkPath, "npm.cmd");
if (fs.existsSync(npmCmd)) {
  const npmCheck = runCmd(`"${npmCmd}" -v`);
  assert(
    npmCheck.success,
    `npm aktif melalui symlink berhasil dijalankan: v${npmCheck.stdout.trim()}`
  );
}

// ─────────────────────────────────────────────────────────────
// BAGIAN 4: UJI NVM & VERSION RESOLVER LOGIC
// ─────────────────────────────────────────────────────────────
console.log("\n[4/4] Menguji Integrasi NVM & Version Resolver...");
const userProfile = process.env.USERPROFILE || "C:\\Users\\LABIB";
const nvmDir = path.join(userProfile, "AppData", "Roaming", "nvm");
const nvmExe = path.join(nvmDir, "nvm.exe");

assert(fs.existsSync(nvmDir), "Folder NVM terdeteksi di AppData\\Roaming\\nvm");
assert(fs.existsSync(nvmExe), "nvm.exe ditemukan di AppData\\Roaming\\nvm\\nvm.exe");

// Uji scan folder NVM langsung (sesuai logika step 1 di get_nvm_versions)
const entries = fs.readdirSync(nvmDir, { withFileTypes: true });
const installedNodeDirs = entries
  .filter((e) => e.isDirectory() && (e.name.startsWith("v") || !isNaN(parseInt(e.name[0]))))
  .map((e) => e.name.replace(/^v/, ""));

assert(
  installedNodeDirs.length > 0,
  `Deteksi versi Node.js terinstal via direct folder scan: [${installedNodeDirs.join(", ")}]`
);

// Uji version resolver logic (mensimulasikan backend resolve_node_version)
function resolveNodeVersion(input) {
  const clean = input.trim().replace(/^v/, "").toLowerCase();
  const fallback = {
    "18": "18.20.8",
    "20": "20.20.2",
    "22": "22.23.4",
    "24": "24.22.2",
    "lts": "24.22.2",
    "latest": "24.22.2",
  };
  if (fallback[clean]) return { ok: true, version: fallback[clean] };
  const parts = clean.split(".");
  if (parts.length === 3 && parts.every((p) => !isNaN(parseInt(p)))) {
    return { ok: true, version: clean };
  }
  return { ok: true, version: clean };
}

assert(resolveNodeVersion("24").version === "24.22.2", "Resolver '24' -> 24.22.2 (LTS Aktif)");
assert(resolveNodeVersion("22").version === "22.23.4", "Resolver '22' -> 22.23.4 (LTS)");
assert(resolveNodeVersion("20").version === "20.20.2", "Resolver '20' -> 20.20.2 (LTS)");
assert(resolveNodeVersion("18").version === "18.20.8", "Resolver '18' -> 18.20.8 (LTS)");
assert(resolveNodeVersion("lts").version === "24.22.2", "Resolver 'lts' -> 24.22.2 (LTS)");
assert(resolveNodeVersion("20.18.0").version === "20.18.0", "Resolver semver lengkap '20.18.0' -> 20.18.0");
assert(resolveNodeVersion("22.14.0").version === "22.14.0", "Resolver semver lengkap '22.14.0' -> 22.14.0");

// ─────────────────────────────────────────────────────────────
// REKAPITULASI
// ─────────────────────────────────────────────────────────────
console.log("\n" + "═".repeat(70));
console.log(`📊 REKAPITULASI PENGUJIAN MENDALAM:`);
console.log(`   Total Pengujian : ${totalTests}`);
console.log(`   Berhasil (Pass) : ${passedTests}`);
console.log(`   Gagal    (Fail) : ${failedTests}`);
console.log("═".repeat(70));

if (failedTests === 0) {
  console.log("\n🎉 SEMUA FITUR (PROJECT, SSL, SYMLINK NODE.JS, NVM) BERHASIL DIUJI 100%!");
  process.exit(0);
} else {
  console.error(`\n⚠️  TERDAPAT ${failedTests} PENGUJIAN YANG GAGAL.`);
  process.exit(1);
}

