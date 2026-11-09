/**
 * sync-packages.cjs
 * ─────────────────────────────────────────────────────────────
 * Script untuk mendownload installer komponen pendukung ke folder
 * `website/packages/` agar dapat diunggah ke cPanel (envku.subly.my.id/packages/).
 * ─────────────────────────────────────────────────────────────
 */

const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");

const ROOT = __dirname;
const PACKAGES_DIR = path.join(ROOT, "website", "packages");

// Daftar berkas yang di-mirror dari penyedia resmi
const PACKAGES = [
  {
    name: "Apache 2.4 (Windows)",
    destDir: path.join(PACKAGES_DIR, "win"),
    fileName: "apache2.4.zip",
    url: "https://www.apachelounge.com/download/VS18/binaries/httpd-2.4.68-260617-Win64-VS18.zip"
  },
  {
    name: "PHP 8.2 (Windows)",
    destDir: path.join(PACKAGES_DIR, "win"),
    fileName: "php8.2.zip",
    phpVersionPrefix: "php-8.2"
  },
  {
    name: "PHP 8.3 (Windows)",
    destDir: path.join(PACKAGES_DIR, "win"),
    fileName: "php8.3.zip",
    phpVersionPrefix: "php-8.3"
  },
  {
    name: "PHP 8.4 (Windows)",
    destDir: path.join(PACKAGES_DIR, "win"),
    fileName: "php8.4.zip",
    phpVersionPrefix: "php-8.4"
  },
  {
    name: "PHP 8.5 (Windows)",
    destDir: path.join(PACKAGES_DIR, "win"),
    fileName: "php8.5.zip",
    phpVersionPrefix: "php-8.5"
  },
  {
    name: "MySQL 8.0 (Windows)",
    destDir: path.join(PACKAGES_DIR, "win"),
    fileName: "mysql8.0.zip",
    url: "https://cdn.mysql.com/archives/mysql-8.0/mysql-8.0.39-winx64.zip"
  },
  {
    name: "Redis Server (Windows)",
    destDir: path.join(PACKAGES_DIR, "win"),
    fileName: "redis.zip",
    url: "https://github.com/tporadowski/redis/releases/download/v5.0.14.1/Redis-x64-5.0.14.1.zip"
  },
  {
    name: "Mailpit Server (Windows)",
    destDir: path.join(PACKAGES_DIR, "win"),
    fileName: "mailpit.zip",
    url: "https://github.com/axllent/mailpit/releases/download/v1.21.8/mailpit-windows-amd64.zip"
  },
  {
    name: "Mailpit Server (Linux)",
    destDir: path.join(PACKAGES_DIR, "linux"),
    fileName: "mailpit.tar.gz",
    url: "https://github.com/axllent/mailpit/releases/download/v1.21.8/mailpit-linux-amd64.tar.gz"
  },
  {
    name: "phpMyAdmin (Common)",
    destDir: path.join(PACKAGES_DIR, "common"),
    fileName: "phpmyadmin.zip",
    url: "https://files.phpmyadmin.net/phpMyAdmin/5.2.2/phpMyAdmin-5.2.2-all-languages.zip"
  },
  {
    name: "PHP Composer (Common)",
    destDir: path.join(PACKAGES_DIR, "common"),
    fileName: "composer.phar",
    url: "https://getcomposer.org/download/latest-stable/composer.phar"
  }
];

/**
 * Mencari URL download file PHP x64 Thread-Safe terbaru dari indeks downloads.php.net
 */
function resolvePhpUrl(versionPrefix) {
  return new Promise((resolve, reject) => {
    const targetUrl = "https://downloads.php.net/~windows/releases/";
    
    https.get(targetUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) EnvkuPackageSync/1.0" }
    }, (res) => {
      let html = "";
      res.on("data", chunk => html += chunk);
      res.on("end", () => {
        // Match format misal: php-8.2.33-Win32-vs16-x64.zip (bukan NTS)
        const regex = new RegExp(`href="(${versionPrefix}\\.[0-9]+-(?!nts)Win32-[^"]+-x64\\.zip)"`, "gi");
        let match;
        const foundFiles = [];
        
        while ((match = regex.exec(html)) !== null) {
          foundFiles.push(match[1]);
        }

        if (foundFiles.length > 0) {
          // Ambil rilis paling baru
          foundFiles.sort();
          const latestFile = foundFiles[foundFiles.length - 1];
          resolve(`${targetUrl}${latestFile}`);
        } else {
          reject(new Error(`Tidak dapat menemukan file rilis untuk ${versionPrefix} di ${targetUrl}`));
        }
      });
    }).on("error", reject);
  });
}

function downloadFileSingle(url, destPath) {
  return new Promise((resolve, reject) => {
    const tmpPath = destPath + ".downloading";
    const protocol = url.startsWith("https") ? https : http;
    const request = protocol.get(url, {
      timeout: 30000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) EnvkuPackageSync/1.0"
      }
    }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        let redirectUrl = response.headers.location;
        if (!redirectUrl.startsWith("http")) {
          const parsed = new URL(url);
          redirectUrl = `${parsed.protocol}//${parsed.host}${redirectUrl}`;
        }
        return downloadFileSingle(redirectUrl, destPath).then(resolve).catch(reject);
      }

      if (response.statusCode !== 200) {
        return reject(new Error(`HTTP status code ${response.statusCode}`));
      }

      const fileStream = fs.createWriteStream(tmpPath);
      let downloadedBytes = 0;
      const totalBytes = parseInt(response.headers['content-length'] || "0", 10);

      response.on("data", (chunk) => {
        downloadedBytes += chunk.length;
        if (totalBytes > 0) {
          const percent = ((downloadedBytes / totalBytes) * 100).toFixed(1);
          process.stdout.write(`\r    ⏳ Mendownload... ${percent}% (${(downloadedBytes / 1024 / 1024).toFixed(1)} MB)`);
        }
      });

      response.pipe(fileStream);

      fileStream.on("finish", () => {
        fileStream.close(() => {
          try {
            if (fs.existsSync(destPath)) {
              fs.unlinkSync(destPath);
            }
            fs.renameSync(tmpPath, destPath);
            process.stdout.write("\n");
            resolve();
          } catch (e) {
            reject(e);
          }
        });
      });

      fileStream.on("error", (err) => {
        if (fs.existsSync(tmpPath)) fs.unlink(tmpPath, () => { });
        reject(err);
      });
    });

    request.on("timeout", () => {
      request.destroy();
      if (fs.existsSync(tmpPath)) fs.unlink(tmpPath, () => { });
      reject(new Error("Koneksi timeout"));
    });

    request.on("error", (err) => {
      if (fs.existsSync(tmpPath)) fs.unlink(tmpPath, () => { });
      reject(err);
    });
  });
}

async function downloadFile(url, destPath, retries = 3) {
  for (let i = 1; i <= retries; i++) {
    try {
      await downloadFileSingle(url, destPath);
      return;
    } catch (err) {
      if (i === retries) throw err;
      console.log(`\n    ⚠️ Percobaan ${i} gagal (${err.message}). Mencoba ulang dalam 2 detik...`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

async function main() {
  console.log("\n📦 Envku Support Package Mirror Synchronizer");
  console.log("━".repeat(60));
  console.log(` Target folder: website/packages/\n`);

  const force = process.argv.includes("--force");

  for (const pkg of PACKAGES) {
    if (!fs.existsSync(pkg.destDir)) {
      fs.mkdirSync(pkg.destDir, { recursive: true });
    }

    const filePath = path.join(pkg.destDir, pkg.fileName);
    console.log(`✦ ${pkg.name}`);
    console.log(`  File  : website/packages/${path.relative(PACKAGES_DIR, filePath)}`);

    if (fs.existsSync(filePath) && !force) {
      const stats = fs.statSync(filePath);
      const sizeMB = (stats.size / 1024 / 1024).toFixed(1);
      console.log(`  Status: ✅ Sudah ada di lokal (${sizeMB} MB). Lewati download (gunakan --force untuk memperbarui).\n`);
      continue;
    }

    let downloadUrl = pkg.url;

    // Jika paket adalah PHP, cari URL resminya secara dinamis
    if (pkg.phpVersionPrefix) {
      try {
        console.log(`  Mencari versi PHP terbaru di server...`);
        downloadUrl = await resolvePhpUrl(pkg.phpVersionPrefix);
      } catch (e) {
        console.error(`  Status: ❌ Gagal mencari link PHP: ${e.message}\n`);
        continue;
      }
    }

    console.log(`  Source: ${downloadUrl}`);
    try {
      await downloadFile(downloadUrl, filePath);
      const stats = fs.statSync(filePath);
      const sizeMB = (stats.size / 1024 / 1024).toFixed(1);
      console.log(`  Status: ✅ Berhasil diunduh (${sizeMB} MB)!\n`);
    } catch (err) {
      console.error(`  Status: ❌ Gagal mendownload: ${err.message}\n`);
    }
  }

  console.log("━".repeat(60));
  console.log("✅ Proses sinkronisasi paket selesai.");
  console.log("   Paket-paket ini akan otomatis terunggah ke cPanel saat FTP Deploy.\n");
}

main();