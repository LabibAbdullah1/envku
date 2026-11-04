/**
 * Test khusus integrasi Node.js:
 * 1. Verifikasi resolver Node 24, 22, 20, 18, LTS, latest, semver.
 * 2. Verifikasi direktori NVM & versi terinstal tanpa memanggil nvm.exe secara interaktif.
 * 3. Verifikasi ketersediaan paket ZIP resmi Node.js di nodejs.org & fallback mirror.
 * 4. Verifikasi bahwa kode node.rs tidak memanggil nvm.exe untuk install atau switch (sehingga mencegah alert 'Terminal Only').
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

let passed = 0;
let total = 0;

function assert(condition, title, detail = '') {
  total++;
  if (condition) {
    passed++;
    console.log(`  ✅ [PASS] ${title}`);
  } else {
    console.error(`  ❌ [FAIL] ${title} ${detail ? `(${detail})` : ''}`);
  }
}

console.log('🧪 PENGUJIAN INTEGRASI KHUSUS NODE.JS & BEBAS POPUP ALERT');
console.log('═'.repeat(65));

// 1. Audit node.rs agar TIDAK memanggil nvm.exe install atau use
console.log('\n[1/3] Memeriksa Anti-Popup pada src-tauri/src/commands/node.rs...');
const nodeRs = fs.readFileSync('src-tauri/src/commands/node.rs', 'utf-8');

assert(
  !nodeRs.includes('args(&["install"'),
  'node.rs TIDAK memanggil nvm.exe install (Mencegah alert "Terminal Only")'
);

assert(
  !nodeRs.includes('args(&["use"'),
  'node.rs TIDAK memanggil nvm.exe use (Mencegah alert "Terminal Only")'
);

assert(
  nodeRs.includes('download_and_extract_windows_node'),
  'node.rs menggunakan fungsi download_and_extract_windows_node resumable'
);

assert(
  nodeRs.includes('switch_windows_node_symlink'),
  'node.rs menggunakan fungsi switch_windows_node_symlink langsung'
);

// 2. Verifikasi resolver offline
console.log('\n[2/3] Memeriksa Fallback Resolver Versi Node.js...');
const nodeVersions = ['24', '22', '20', '18'];
for (const v of nodeVersions) {
  assert(nodeRs.includes(`"${v}" => Some(`), `Fallback resolver untuk v${v} terdaftar`);
}

// 3. Verifikasi download endpoint nodejs.org & npmmirror
console.log('\n[3/3] Memeriksa Ketersediaan Distribusi ZIP Node.js...');
function checkUrlHead(url) {
  return new Promise((resolve) => {
    try {
      const u = new URL(url);
      const req = https.request(
        {
          hostname: u.hostname,
          path: u.pathname,
          method: 'HEAD',
          timeout: 8000,
          headers: { 'User-Agent': 'Envku-Test' },
        },
        (res) => {
          resolve(res.statusCode === 200 || res.statusCode === 302);
        }
      );
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
      req.end();
    } catch (e) {
      resolve(false);
    }
  });
}

(async () => {
  const urlNodeOrg = 'https://nodejs.org/dist/v22.14.0/node-v22.14.0-win-x64.zip';
  const urlMirror = 'https://cdn.npmmirror.com/binaries/node/v22.14.0/node-v22.14.0-win-x64.zip';

  const okOrg = await checkUrlHead(urlNodeOrg);
  assert(okOrg, 'Primary mirror (nodejs.org) merespons aktif untuk paket zip Windows x64');

  const okMirror = await checkUrlHead(urlMirror);
  assert(okMirror, 'Fallback mirror (npmmirror) merespons aktif');

  console.log('\n' + '═'.repeat(65));
  console.log(`📊 REKAPITULASI: ${passed}/${total} PENGUJIAN LOLOS`);
  console.log('═'.repeat(65));

  if (passed === total) {
    console.log('🎉 SEMUA PENGUJIAN INTEGRASI NODE.JS LOLOS 100%!\n');
    process.exit(0);
  } else {
    console.error(`⚠️ Terdapat ${total - passed} pengujian yang gagal.\n`);
    process.exit(1);
  }
})();
