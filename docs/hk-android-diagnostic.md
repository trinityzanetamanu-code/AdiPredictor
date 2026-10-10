# Diagnostic HK dari HP Android — Tahap 1B

Tujuan: mengambil **DOM HTML tabel yang benar-benar terbuka di browser HP**,
bukan screenshot dan bukan sekadar output curl. Kit tidak memasang APK,
tidak mengakses cookie/token/header/profil browser, dan tidak mengubah data aplikasi.
Capture diberi label observasi; label `completed` **bukan** bukti finalitas.

## 1. Unduh dan ekstrak

Unduh `AdiPredictor_HK_DiagnosticKit.zip` dari tautan laporan ke **Download**
memori internal. Buka Termux, salin perintah ini:

```bash
termux-setup-storage
pkg install python unzip -y
mkdir -p "$HOME/hk-evidence-kit"
unzip -o "$HOME/storage/downloads/AdiPredictor_HK_DiagnosticKit.zip" -d "$HOME/hk-evidence-kit"
cd "$HOME/hk-evidence-kit/AdiPredictor_HK_DiagnosticKit"
cat bookmarklet.txt
```

Izinkan akses penyimpanan saat Android meminta. Jika nama unduhan mendapat
akhiran `(1)`, ubah namanya melalui aplikasi Files menjadi persis
`AdiPredictor_HK_DiagnosticKit.zip`, lalu jalankan ulang perintah unzip.
`unzip -o` hanya memperbarui file kit dalam folder khusus tersebut.

## 2. Pasang bookmark capture di Chrome Android

Output `cat bookmarklet.txt` adalah **satu baris panjang** yang dimulai
`javascript:`. Di Termux, tekan lama, pilih seluruh baris kode itu, lalu **Salin**.
Jangan ikut menyalin prompt Termux/perintah `cat`.

1. Buka Chrome Android dan buka `https://www.hongkongpools.com/live.html`.
2. Dari menu titik tiga, simpan halaman sebagai bookmark (ikon bintang).
3. Buka menu **Bookmark**, cari bookmark tersebut, lalu pilih **Edit**.
4. Ubah nama menjadi **HK Capture DOM**. Ganti kolom **URL** dengan baris kode
   yang disalin dari Termux. Pastikan awalnya tetap **`javascript:`**, kemudian simpan.
   Jika Chrome membuang awalan itu saat paste, ketik ulang `javascript:` di depan kode.

Kode berjalan hanya pada halaman HK `/live.html` atau `/live` yang sedang
terbuka, membaca struktur display, membuang script/form/atribut rahasia,
dan meminta download JSON lokal. Tidak ada pengiriman ke server lain.

## 3. Ambil capture halaman yang berhasil terbuka

1. Kembali ke tab HK asli dan tunggu sampai tanggal undian dan tabel hadiah tampil.
   Jika ada pemeriksaan keamanan, selesaikan secara normal oleh Anda sendiri.
   **Jangan menjalankan bookmark pada halaman challenge.**
2. Di tab HK yang sama, tekan kolom alamat, ketik **HK Capture DOM** lalu tekan
   hasil saran bookmark tersebut. Jangan membuka kode dengan pencarian Google.
   Alternatif: pilih bookmark tersebut dari menu Bookmark saat tab HK aktif.
3. Isi label: `partial` jika undian masih berjalan, `completed` jika menurut
   tampilan hasil sudah selesai, atau `unknown` bila tidak yakin.
4. Isi tanggal **yang tertulis pada halaman sumber** dengan format `YYYY-MM-DD`,
   misalnya `2026-10-10`; jangan mengambil tanggal dari jam HP. Kosongkan bila
   tanggal sumber belum terlihat.
5. Izinkan download file jika Chrome meminta. Pesan
   **`DOM_CAPTURED_REVIEW_REQUIRED`** hanya berarti download diminta.
   Buka aplikasi Files > Download dan pastikan ada **`HK_CAPTURE_...json`**.

Untuk pemeriksaan finalitas, idealnya ambil satu capture `partial` saat berjalan,
lalu `completed` setelah selesai **pada tanggal undian yang sama**. Bila hasil
selesai masih terlihat beberapa saat kemudian, ambil `completed` lagi agar perubahan
DOM/timestamp dapat dibandingkan. Tidak perlu menunggu undian berikutnya hanya
untuk mengirim capture selesai pertama. Semua label owner tetap belum terverifikasi.

Jangan mengubah JSON/HTML atau mengisi angka yang belum muncul. Jika tanggal
belum bisa diekstrak otomatis, metadata menyimpan kandidat teks dan tanggal yang
Anda baca secara terpisah; keduanya perlu dianalisis sebelum dipakai adapter.

## 4. Buat satu ZIP bukti di Download

Setelah capture diunduh, kembali ke Termux:

```bash
cd "$HOME/hk-evidence-kit/AdiPredictor_HK_DiagnosticKit"
python hk_diagnostic.py pack
```

Packer bekerja **offline**, hanya membaca `HK_CAPTURE_*.json` di Download.
Ia tidak membaca file lain, tidak mencoba curl, dan tidak membaca browser.
Capture valid dimasukkan sebagai `result-dom.html` dan metadata: URL, waktu UTC,
label tahap, tanggal observasi, tabel/baris/gambar digit, kandidat tanggal/6D,
petunjuk refresh dan SHA256 DOM yang disanitasi. Script halaman tidak diekspor;
inline refresh logic dan DOM iframe tidak termasuk.

Indikator:

- **`DIAGNOSTIC_STATUS=CAPTURE_SUCCESS_REVIEW_REQUIRED`** dan
  **`VALID_DOM_CAPTURES=1`** atau lebih: capture diterima untuk dianalisis.
- **`CAPTURE_PARTIAL_REVIEW_REQUIRED`**: ada capture valid dan ada file ditolak.
  Periksa file capture yang diunduh; jangan mengedit untuk memaksa penerimaan.
- **`CAPTURE_FAILED_NO_VALID_DOM`**: tidak ada DOM valid; ini belum bukti hasil.
  ZIP tetap dibuat dengan SUMMARY kegagalan dan proses exit 1.

File akhirnya bernama **`AdiPredictor_HK_Evidence_<waktu>.zip`** di Download.
**Kirim hanya ZIP bukti terbaru itu ke chat ini**, bukan ZIP kit, screenshot,
cookie, token atau seluruh profil browser. Setiap pemanggilan pack menghasilkan
satu ZIP; file capture asli dipertahankan.

## Jika gagal

- `CAPTURE_BLOCKED`: masih challenge. Hentikan pengulangan pada jalur sama;
  beri tahu bahwa Chrome HP juga terblokir. Kit tidak melakukan bypass.
- `CAPTURE_FAILED_NO_TABLE` / `NO_PRIZE_LABEL`: tabel belum tampil atau hasil
  berada di dokumen/iframe lain. Jangan menyatakan berhasil. Kirim teks indikator
  dan URL **tanpa query/token**, agar jalur capture dapat disesuaikan berdasarkan bukti.
- Jika bookmark tidak menjalankan dialog: cek kolom URL bookmark benar-benar
  diawali `javascript:` dan dijalankan pada tab HK, bukan tab baru/Search.
- Jika download JSON tidak ada: capture belum berhasil. Cek izin download
  Chrome dan folder Download. Jangan menjalankan pack sambil mengira file sudah ada.
- Tidak memakai WebView dalam APK karena task ini tidak membangun APK. Kit belum
  diuji pada HP fisik owner. Jalur bookmarklet dan pack diuji dengan DOM terkontrol;
  hasil sumber nyata baru terbukti setelah Anda mengambil dan mengirim capture.

Capture owner tidak membuktikan collector cloud dapat mengakses HK. Jika nanti
terbukti dibutuhkan relay/infrastruktur tambahan, kebutuhannya akan dilaporkan
untuk persetujuan owner; kit ini tidak membuat atau menerbitkan relay.

## Pengembang

Kit dapat dibuat ulang tanpa jaringan/APK:

```bash
python scripts/hk_diagnostic/build_kit.py /tmp/AdiPredictor_HK_DiagnosticKit.zip
```

Kontrak finalitas produksi tetap kosong sampai respons/DOM sumber nyata,
tanggal, digit, tabel hadiah dan semantik finalitas telah diperiksa. DOM hasil
render berbeda dari respons HTTP asli; jika HTML awal hanya shell JavaScript,
cloud memerlukan adapter dan jalur akses yang terbukti. Tabel lengkap atau
dua capture yang tidak berubah tidak otomatis membuktikan hasil final.
