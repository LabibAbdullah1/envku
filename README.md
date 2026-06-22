# 🚀 Envku Orchestrator

[![Website](https://img.shields.io/badge/website-envku.subly.my.id-blue.svg)](https://envku.subly.my.id)
[![Platform](https://img.shields.io/badge/platform-Windows-lightgrey.svg)](#)
[![Tauri](https://img.shields.io/badge/built%20with-Tauri%20v2-orange.svg)](https://tauri.app)
[![React](https://img.shields.io/badge/frontend-React%2019-blue.svg)](https://react.dev)

**Envku Orchestrator** adalah aplikasi manajemen lingkungan pengembangan lokal (*local development environment*) portabel khusus untuk sistem operasi Windows. Mirip dengan Laragon atau XAMPP, namun dibangun dengan teknologi modern **Tauri (Rust)** untuk backend sistem dan **React + TypeScript + Tailwind CSS** untuk antarmuka pengguna yang sangat ringan, cepat, dan modern.

Dengan Envku, Anda dapat mengunduh, memasang, mengonfigurasi, dan menjalankan komponen web server (Apache, MySQL, PHP, phpMyAdmin, Node.js) secara otomatis hanya dengan sekali klik tanpa memerlukan instalasi manual yang rumit.

Unduh installer terbaru dan lihat dokumentasi lengkap di: **[https://envku.subly.my.id](https://envku.subly.my.id)**

---

## 🌟 Fitur Utama

- **Pemeriksaan Direktori Otomatis**: Memantau integritas folder server (`C:\server`) dan komponen-komponennya secara real-time.
- **Katalog Komponen & Downloader Portabel**: Mengunduh dan mengekstrak komponen Apache, MySQL, PHP 8.2, PHP 8.3, dan phpMyAdmin secara portabel langsung ke direktori tujuan.
- **Service Control Panel**: Mengontrol (Start/Stop) dan mendaftarkan Apache dan MySQL sebagai Windows Services secara aman dengan hak akses Administrator.
- **Project Wizard (Virtual Hosts)**: Membuat Virtual Host (domain lokal) dengan mudah untuk proyek PHP/HTML, serta mendukung *reverse proxy* otomatis ke port Node.js untuk proyek Node.js/Next.js/Vite.
- **PHP Version Switcher**: Berpindah versi PHP yang aktif secara instan pada Apache Web Server (misal dari PHP 8.2 ke PHP 8.3) tanpa mengganggu konfigurasi utama.
- **Integrasi Node.js & NVM**: Mendeteksi dan mengelola versi Node.js secara otomatis menggunakan integrasi NVM (Node Version Manager) bawaan.
- **Auto-Updater Terintegrasi**: Memeriksa pembaruan rilis aplikasi secara berkala dari subdomain distribusi Anda dan memperbaruinya secara otomatis demi keamanan dan stabilitas.

---

## 🛠️ Arsitektur & Teknologi

Envku memisahkan logika performa sistem yang sensitif dengan UI melalui arsitektur Tauri:

1. **Backend (Rust - `src-tauri`)**:
   - Berinteraksi langsung dengan API Windows untuk mendaftarkan dan menjalankan *Windows Services*.
   - Melakukan pengunduhan berkas ZIP komponen secara efisien dan mengekstraknya menggunakan library asli Rust.
   - Mengubah file konfigurasi Apache `httpd.conf`, `httpd-vhosts.conf`, dan file `hosts` Windows secara aman.
2. **Frontend (React - `src`)**:
   - Antarmuka berbasis komponen menggunakan **React 19** dan **TypeScript**.
   - Gaya visual responsif menggunakan **Tailwind CSS v4** dengan paket ikon dari **Lucide React**.
   - Manajemen *global state* aplikasi yang efisien menggunakan **Zustand**.

---

## 💻 Panduan Pengembangan (Local Setup)

Jika Anda ingin menjalankan atau mengembangkan Envku di komputer lokal Anda, ikuti langkah-langkah di bawah ini.

### Prasyarat Sistem
- **Windows OS** (Wajib, karena fitur berinteraksi dengan Windows Services dan registry).
- **Node.js** (Versi LTS direkomendasikan).
- **Rust Toolchain** (Instal via [rustup](https://rustup.rs/)).
- **C++ Build Tools** (Disertakan dalam instalasi Visual Studio Build Tools dengan beban kerja *Desktop development with C++*).

### Langkah Instalasi
1. **Clone repositori ini**:
   ```bash
   git clone https://github.com/username/project-envku.git
   cd project-envku
   ```

2. **Instal dependensi Node.js**:
   ```bash
   npm install
   ```

3. **Jalankan aplikasi dalam mode pengembangan**:
   ```bash
   npm run tauri dev
   ```
   *Perintah ini akan membuka jendela aplikasi Envku dengan fitur hot-reload pada frontend.*

### Menyiapkan Kunci Pengaman Rilis (Opsional untuk Build Rilis)
Aplikasi ini mewajibkan tanda tangan digital untuk pembaruan otomatis (*auto-updater*).
1. Buat kunci baru:
   ```bash
   npm run tauri signer generate
   ```
2. Salin file `.env.example` menjadi `.env.local`:
   ```bash
   copy .env.example .env.local
   ```
3. Buka file `.env.local` dan masukkan kunci privat (*private key*) hasil *generate* ke variabel `TAURI_SIGNING_PRIVATE_KEY`.
4. Jalankan script pembantu untuk memasukkan kunci publik ke berkas konfigurasi:
   ```bash
   node save-keys.cjs "KUNCI_PRIVAT_RAHASIA" "KUNCI_PUBLIK_ANDA"
   ```
5. Kompilasi aplikasi untuk rilis:
   ```bash
   npm run release
   ```

---

## 🤝 Panduan Berkontribusi (Contribution Guide)

Kami sangat senang menerima kontribusi dari komunitas! Baik berupa perbaikan bug, penambahan fitur baru, perbaikan dokumentasi, atau sekadar memberikan masukan dan saran.

### 📋 Syarat Berkontribusi

Untuk menjaga kualitas kode tetap konsisten, berikut syarat kontribusi yang perlu diikuti:
1. **Teknologi Utama**:
   - Kode frontend wajib menggunakan **React 19**, **TypeScript** (ketat tanpa tipe `any`), dan **Tailwind CSS**.
   - Kode backend sistem wajib menggunakan **Rust** dengan penanganan *error* yang aman (`Result`, `Option`) tanpa menggunakan `unwrap()` sembarangan yang berisiko merusak (crash) sistem pengguna.
2. **Keamanan**: Karena aplikasi beroperasi dengan hak administrator (`requireAdministrator` di manifest Windows) dan mengubah file sistem (seperti berkas `hosts` dan pendaftaran Windows Services), pastikan tidak ada kode yang berpotensi membahayakan keamanan sistem operasi pengguna.
3. **Standar Kode**: Ikuti standar penulisan kode TypeScript dan format Rust bawaan (`cargo fmt`).

### 📝 Tatacara Berkontribusi (Workflow)

Jika Anda ingin mulai mengirimkan perubahan ke proyek ini, silakan ikuti alur kerja berikut:

1. **Fork Repositori**:
   Lakukan *fork* terhadap repositori utama ini ke akun GitHub Anda.
   
2. **Buat Branch Baru**:
   Buat branch baru dari branch `main` pada repositori hasil fork Anda dengan nama yang deskriptif:
   ```bash
   git checkout -b feature/nama-fitur-baru
   # ATAU
   git checkout -b bugfix/nama-perbaikan-bug
   ```

3. **Lakukan Perubahan & Uji Coba**:
   - Kerjakan perubahan kode Anda.
   - Pastikan aplikasi berjalan lancar dengan menjalankan `npm run tauri dev`.
   - Pastikan proses build tidak error dengan menjalankan `npm run build`.

4. **Commit Perubahan**:
   Lakukan commit dengan pesan yang jelas dan deskriptif. Kami menyarankan menggunakan format *Conventional Commits*:
   ```bash
   git commit -m "feat: menambahkan tab konfigurasi Apache kustom"
   git commit -m "fix: memperbaiki bug pendeteksian port MySQL"
   ```

5. **Push ke GitHub**:
   Kirimkan branch baru tersebut ke repositori hasil fork Anda:
   ```bash
   git push origin feature/nama-fitur-baru
   ```

6. **Buat Pull Request (PR)**:
   - Buka repositori utama di GitHub, lalu klik tombol **New Pull Request**.
   - Pilih branch dari repositori fork Anda untuk dibandingkan dengan branch `main` repositori utama.
   - Tulis deskripsi PR secara detail yang menjelaskan:
     - Apa saja perubahan yang Anda lakukan?
     - Masalah apa yang diselesaikan?
     - Bagaimana cara menguji perubahan tersebut?
   - Tunggu proses peninjauan kode (*code review*) dari kami. Kami mungkin memberikan beberapa umpan balik sebelum menggabungkan (*merge*) kode Anda.

---

## 📄 Lisensi

Proyek ini dilisensikan di bawah **[MIT License](LICENSE)**. Anda bebas menggunakan, memodifikasi, dan mendistribusikan kode ini untuk keperluan pribadi maupun komersial dengan tetap mencantumkan hak cipta asli.

---

## 🌐 Tautan Penting & Kontak

- **Situs Resmi & Download**: [https://envku.subly.my.id](https://envku.subly.my.id)
- **Dokumentasi Deployment**: Lihat panduan lengkap di [website/deploy-guide.md](file:///d:/backup/DATA%20LABIB/project-envku/website/deploy-guide.md).
- **Subdomain Pembaruan (JSON)**: [https://envku.subly.my.id/update.json](https://envku.subly.my.id/update.json)

---
*Dibuat dengan ❤️ untuk memudahkan alur kerja pengembangan web lokal Anda.*
