# Panduan Deployment & Rilis Pembaruan Aplikasi (Auto-Updater)

Dokumen ini menjelaskan langkah-langkah untuk menyiapkan kunci pengaman, mengompilasi program rilis (*production build*), menandatangani berkas biner secara digital, dan mengunggahnya ke server subdomain Anda.

---

## Langkah 1: Membuat Kunci Pengaman Rilis (Signing Keys)

Tauri auto-updater mewajibkan semua file instalasi pembaruan ditandatangani dengan kunci privat digital (Ed25519) sebelum program klien dapat menerimanya.

Jalankan perintah berikut di terminal proyek Anda untuk membuat kunci pengaman baru:

```bash
npx.cmd tauri signature generate
```

Perintah ini akan menghasilkan dua baris kunci penting:
1. **Public Key**: Kunci publik yang aman untuk dibagikan (dimasukkan ke file konfigurasi).
2. **Private Key**: Kunci privat rahasia untuk menandatangani file biner (TIDAK BOLEH disebarluaskan, simpan baik-baik).

---

## Langkah 2: Memasukkan Public Key ke Konfigurasi

Buka file konfigurasi proyek Anda di [tauri.conf.json](file:///d:/backup/DATA%20LABIB/project-envku/src-tauri/tauri.conf.json), temukan blok `"plugins": { "updater": { ... } }`, lalu ganti nilai `"pubkey"` dengan kunci publik yang baru saja Anda hasilkan:

```json
  "plugins": {
    "updater": {
      "active": true,
      "endpoints": [
        "https://envku.subly.my.id/update.json"
      ],
      "pubkey": "KUNCI_PUBLIK_HASIL_GENERASI_ANDA"
    }
  }
```

---

## Langkah 3: Mengatur Private Key di Environment Variable

Saat melakukan *build* aplikasi untuk rilis, Tauri memerlukan kunci privat Anda. Kunci ini harus dipasang sebagai variabel lingkungan (*environment variables*) di sistem operasi komputer build Anda.

### Pada Command Prompt (CMD) Windows:
```cmd
set TAURI_SIGNING_PRIVATE_KEY=isi_kunci_privat_anda_di_sini
```

### Pada PowerShell Windows:
```powershell
$env:TAURI_SIGNING_PRIVATE_KEY="isi_kunci_privat_anda_di_sini"
```
*(Catatan: Jika saat men-generate kunci Anda menggunakan password pelindung, setel juga variabel `$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD="password_anda"`)*

---

## Langkah 4: Melakukan Compile Rilis

Setelah variabel lingkungan kunci privat aktif, jalankan perintah kompilasi rilis Tauri:

```bash
npx.cmd tauri build
```

Kompilasi ini akan menghasilkan:
1. Berkas biner installer utama: `src-tauri/target/release/bundle/nsis/Envku_1.0.0_x64-setup.exe`.
2. Berkas tanda tangan digital: `src-tauri/target/release/bundle/nsis/Envku_1.0.0_x64-setup.exe.sig` (berisi teks tanda tangan digital dasar base64).

---

## Langkah 5: Memperbarui update.json & Deploy Subdomain

Untuk mendistribusikan pembaruan ke seluruh pengguna yang sudah menginstal aplikasi Anda:

1. Buka berkas signature `.exe.sig` menggunakan text editor, lalu salin seluruh isi teks tanda tangannya.
2. Buka berkas [update.json](file:///d:/backup/DATA%20LABIB/project-envku/website/update.json), lalu perbarui nomor `"version"`, `"notes"` (catatan perubahan), rilis biner `"url"`, dan `"signature"` dengan teks tanda tangan yang disalin:
   ```json
   {
     "version": "1.0.0",
     "notes": "Menambahkan fitur baru dan perbaikan stabilitas.",
     "pub_date": "2026-06-22T03:00:00+07:00",
     "platforms": {
       "windows-x86_64": {
         "signature": "ISI_TANDA_TANGAN_DARI_FILE_SIG",
         "url": "https://envku.subly.my.id/downloads/Envku_1.0.0_x64-setup.exe"
       }
     }
   }
   ```
3. Unggah seluruh struktur berkas di dalam folder `/website` ke server subdomain Anda (`envku.subly.my.id`):
   * `/index.html` (Landing page landing utama)
   * `/style.css` (Style Neo-Brutalist)
   * `/update.json` (Berkas metadata auto-updater)
   * `/downloads/Envku_1.0.0_x64-setup.exe` (File installer aplikasi Anda)

Begitu semua file terunggah, setiap kali pengguna membuka aplikasi desktop mereka, Tauri akan secara otomatis membandingkan versinya dengan `update.json` di subdomain Anda. Jika terdeteksi versi baru, aplikasi akan menampilkan popup dialog pembaruan otomatis untuk mengunduh rilis baru tersebut secara langsung.
