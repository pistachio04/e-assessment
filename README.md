# E-Assessment — Web App Google Apps Script

Aplikasi ujian pilihan ganda untuk siswa dengan dashboard analisis untuk guru. Data disimpan di Google Sheets (tanpa server tambahan).

## Fitur

**Siswa**
- Login (username + password), tidak perlu akun Google
- Mengerjakan soal pilihan ganda (A–E), navigasi soal, tanda ragu-ragu, timer, autosave tiap jawaban
- Lanjutkan ujian jika browser tertutup / koneksi putus; auto-submit saat waktu habis
- Nilai langsung + pembahasan per soal (opsional per ujian), riwayat nilai, ganti password

**Guru**
- **Dashboard analitik**: soal paling banyak salah (+ pengecoh terpopuler), penguasaan per topik, distribusi nilai, ringkasan per ujian, siswa yang perlu perhatian, tren 14 hari, rekomendasi otomatis; filter ujian/kelas
- **Analisis butir soal**: tingkat kesukaran, daya beda, sebaran jawaban per opsi, peringatan kunci jawaban mencurigakan
- **Daftar remedial**: klik soal → siswa yang salah, unduh CSV
- **Bank soal**: CRUD, topik, pembahasan, impor CSV/tempel dari Excel
- **Paket ujian**: pilih soal, durasi, KKM, batas percobaan, acak soal, khusus kelas, aktif/nonaktif
- **Siswa**: CRUD, impor CSV (password acak otomatis), reset password, detail progres per siswa
- Hasil ujian + ekspor CSV

**Keamanan**: kunci jawaban tidak pernah dikirim ke browser siswa sebelum submit; penilaian & batas waktu dicek di server; password di-hash (SHA-256 + salt); sesi token 6 jam; pembatasan percobaan login (5× gagal → kunci 5 menit).

## Instalasi

1. Buat Google Spreadsheet baru → **Extensions → Apps Script**.
2. Salin semua file di folder ini ke project (nama file sama):
   `*.gs` → file Script, `*.html` → file HTML, dan `appsscript.json` (aktifkan *Show "appsscript.json" manifest file* di Project Settings).
   Atau gunakan [clasp](https://github.com/google/clasp): `clasp create --type sheets` lalu `clasp push`.
3. Jalankan fungsi `setup()` sekali (beri izin akses). Sheet database dibuat otomatis.
4. *(Opsional)* Jalankan `seedDemo()` untuk data contoh (8 soal, 1 ujian, 4 siswa).
5. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone** (siswa tidak perlu login Google; autentikasi memakai akun aplikasi)
6. Bagikan URL web app ke siswa.

**Login awal guru:** `guru` / `guru123` — **segera ganti** lewat tombol "Ganti Password".
Demo siswa: `siswa01`…`siswa04` / `siswa123`.

> Setiap kali kode diubah, buat **New version** pada deployment agar perubahan aktif.

## Struktur

| File | Isi |
|---|---|
| `Code.gs` | `doGet`, router `api()` + pengecekan role |
| `Database.gs` | Skema sheet & helper CRUD |
| `Auth.gs` | Login, sesi, hash password |
| `Student.gs` | Mulai/lanjut ujian, autosave, penilaian |
| `Teacher.gs` | Bank soal, paket ujian, siswa |
| `Analytics.gs` | Dashboard, hasil, analisis butir soal |
| `Seed.gs` | Data demo |
| `Index.html`, `Styles.html`, `Js*.html` | Antarmuka (SPA tanpa dependensi eksternal) |

## Sheet database

`Users`, `Questions`, `Exams`, `Attempts`, `Answers` (satu baris per soal per percobaan, dasar analisis). Jangan ubah nama sheet/header; data boleh dilihat/diekspor langsung dari Spreadsheet.

## Format CSV impor

- Soal: `topik, soal, a, b, c, d, e, kunci, pembahasan`
- Siswa: `username, nama, kelas, password` (password boleh kosong)

## Batasan

Cocok untuk satu kelas hingga beberapa ratus siswa. Untuk ujian serentak sangat besar, kuota Apps Script (eksekusi bersamaan & waktu) menjadi pembatas — jadwalkan per kelas bila perlu.
