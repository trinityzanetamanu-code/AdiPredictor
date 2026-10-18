# Uji AdiPredictor native RC di HP Android

Kandidat ini untuk uji owner, belum menjadi distribusi stable. Android minimum **8.0 (API 26)** untuk native. Perangkat Android 5.1–7.1 yang didukung aplikasi Capacitor lama tidak dapat memasang native ini. ApplicationId tetap `com.adipredictor.app`; nama tetap AdiPredictor.

## Urutan instalasi dan penyimpanan data

1. Di aplikasi yang terpasang, catat versi dari Info aplikasi/Pengaturan Android. Jika Pengaturan aplikasi sudah menyediakan **Simpan JSON ke file**, gunakan dahulu. Pilih folder Download melalui pemilih file Android dan tunggu pesan **File JSON tersimpan**. Ekspor penuh saat ini dapat mencapai lebih dari 2 MB; gunakan file, karena clipboard tidak cocok untuk cadangan besar.
2. Stable `2.0.0+build.100010` dan build lama `100141` belum mempunyai exporter ini. Jika tombol tidak ada, unduh ZIP artefak **legacy-export-release-candidate** dari run yang diberikan. Ekstrak dan pasang **APK yang namanya mengandung `legacy-export`** sebagai pembaruan. Ini masih aplikasi Capacitor dengan penyimpanan lama. Buka Pengaturan → **Simpan JSON ke file** → pilih Download → Simpan. Tunggu pesan **File JSON tersimpan**, lalu periksa file `adipredictor-legacy.json` ada dan berukuran lebih dari 0 byte. Batalkan dan ulangi bila proses terputus; jangan melanjutkan sebelum file tersimpan. Tombol Tampilkan ekspor data lama hanya untuk memeriksa teks atau ekspor kecil.
3. Unduh ZIP artefak **native-release-candidate** dari run yang sama. Ekstrak dan pasang **APK yang namanya mengandung `native-release-candidate`**. Kode versi native lebih tinggi daripada APK perantara. Izinkan pemasangan dari sumber browser/file manager bila Android memintanya. **Jangan uninstall atau hapus data.**
4. Jika Android menolak salah satu pembaruan karena paket, versi atau sertifikat, **berhenti**. Simpan tangkapan layar/pesan pemasangan dan versi yang terpasang, lalu laporkan. Build debug lama atau APK sebelum kunci stable sekarang dapat berbeda signer. Tidak ada klaim bahwa semuanya dapat diperbarui. Jangan menghapus aplikasi untuk mengatasi penolakan.
5. Di native → Pengaturan → Impor preferensi/cache lama, pilih file JSON; Clipboard tersedia untuk JSON kecil; gunakan pemilih file untuk ekspor penuh. Periksa laporan impor. Impor ulang aman terhadap cache native yang lebih baru. Penyimpanan Chromium lama tidak otomatis terbaca oleh native. Sediakan ulang izin notifikasi Android bila diminta; izin OS tidak ikut dalam ekspor JSON.

## Uji setelah pemasangan

6. Tutup lalu buka aplikasi. Uji HK, SDY dan SGP. Bandingkan hasil terakhir di Analisis, Data dan LiveDraw; lihat tanggal, asal sumber, fingerprint/revision dan status cache. Refresh sambil tetap di Analisis. Coba koneksi terputus lalu pulih. HK 403 adalah masalah akses sumber; jangan menganggap angka runtime sebagai canonical terverifikasi.
7. Buka Histori, pilih dua arsip berbeda, periksa Quick View, model/konsensus, outcome audit dan Pola Visual/SVG. Coba pencarian Data/Tafsir, statistik serta ukuran font Android besar. Gunakan tombol Kembali lalu buka lagi halaman untuk memeriksa pemulihan state.
8. Aktifkan izin dan preferensi notifikasi. Uji tekan notifikasi/deep link, background → resume, tutup/buka aplikasi dan restart HP. Periksa preferensi tetap tersimpan dan event yang sama tidak terkirim ulang. LiveDraw membuka browser/YouTube eksternal melalui tombol yang tersedia; player tidak didesain ulang dalam kandidat ini.
9. Laporkan versi **terpasang** dari Pengaturan native: versionName, versionCode, channel dan source SHA. Sertakan pasar, waktu, langkah, hasil yang diharapkan/terjadi dan screenshot. Bagian “Metadata stable dari server” adalah informasi rilis stable, berbeda dari identitas kandidat terpasang.

Unit test dan UI terkontrol sudah menjadi syarat CI, tetapi upgrade HP dan perangkat fisik tetap `NOT_TESTED` sampai owner menguji. Hentikan setelah uji dan kirim hasil; kandidat ini tidak mengaktifkan distribusi native stable.
