# Stage 2: penghapusan viewer paito

Baseline awal `d88aa78e03918190514dd81ba5a6bd7b587d7450` bersih pada main.
Saat pekerjaan dilanjutkan, perubahan lokal disimpan sementara, main di-fast-forward
ke `f74695daf5b757368eca7c1b31e4ee3a0d2cbda8`, lalu perubahan lokal diterapkan
kembali tanpa konflik. Pembaruan collector di antara kedua SHA hanya menyentuh
data/arsip/aset publik, terpisah dari implementasi ini. Tidak ada AGENTS.md.

## Penghapusan

- `src/components/VisualPaitoViewer.jsx`: grid, digit/pasangan, garis ilustrasi,
  jumlah draw, fullscreen, zoom/pan dan seluruh state viewer.
- `src/visualPaito.js`: derivasi data yang eksklusif untuk viewer.
- `src/visualViewport.js`: transformasi viewport yang hanya dipakai viewer/tes paito.
- `scripts/capture_paito_browser.mjs`: capture khusus viewer.
- `tests/test_visual_paito_grid.mjs`: delapan tes khusus grid paito.

PredictionHistoryPage tidak lagi mengimpor/memanggil PaitoPatterns atau menerima
marketRows. Tombol arsip sekarang bernama “Buka arsip dan Pola Visual”.
Histori Prediksi tetap membuka halaman arsip. Job paito-browser-viewport beserta
checkout baseline, environment PAITO_* dan upload artefaknya dihapus.

## Fitur dan data yang dipertahankan

Quick View, pemilihan arsip, model, konsensus, outcome audit, VisualPatterns dan
pemuatan SVG asli tetap tersedia. Seluruh file public, konfigurasi sumber,
prediction_engine.py, hk_canonical.py, predictionConsensus.js, datasetRevision.js,
dataClient.js dan PredictionOutcomeAudit.jsx identik dengan baseline integrasi.
Tidak ada regenerasi angka atau fingerprint prediksi. Rumus/bobot/ranking P1–P8,
generate_visual_patterns, visual_occurrences, model_visual_gate dan
visual_pattern_evaluation tidak diubah. Semua 360 SVG pada baseline implementasi dipertahankan. Setelah commit pertama,
collector menerbitkan `4c0f6d079d0fd0d81f9e8126f95ce125eeba9cb6`: hanya
13 file data/arsip/aset publik, termasuk enam SVG HK tambahan (total 366).
Pembaruan angka berasal dari collector, bukan penghapusan viewer.

## Validasi

- Python: 110 PASS, termasuk pengamanan signed release.
- JavaScript: 93 PASS. Sebelumnya 106; delapan tes grid dan enam kasus paito dalam
  suite campuran dihapus. Satu kasus baru memeriksa metadata, P5, outcome visual
  dan keberadaan SVG asli pada arsip HK/SDY/SGP. Tes arsip lama, validasi
  identitas/fingerprint, respons terlambat, pengaturan/notifikasi tetap ada.
- Build web: PASS (peringatan bundler Capacitor tentang import campuran tetap ada).
- Controlled foreground synchronization: PASS untuk cold start, polling saat
  tetap di Analisis, resume, reload, Data/LiveDraw, dan penolakan pasangan data
  serta prediksi yang tidak selaras. Fixture tanggal/nomor/periode kini diambil
  dari baseline dataset aktif, bukan angka HK tetap, agar pembaruan collector
  tidak menimbulkan kegagalan palsu. Perubahan hanya pada harness tes.
- Controlled HK diagnostic: PASS untuk download bookmarklet, nol di depan,
  sanitasi dan penolakan challenge/halaman salah/tabel kosong. Tidak mengakses
  sumber HK nyata dan bukan bukti finalitas.
- Browser histori/visual: PASS pada viewport Android 412×915 dengan touch.
  Dua arsip selesai per pasar HK/SDY/SGP memuat 36 SVG asli sesuai path dan
  fingerprint arsip terpilih. Quick View, P5, konsensus, outcome audit, arsip v1
  tanpa metadata visual, reload, kembali/pindah tab dan ketiadaan kontrol paito
  diperiksa tanpa page error. Script `check_history_visuals.mjs` berjalan di CI.

Workflow validasi tetap menjalankan suite Python penuh termasuk pengamanan
signed release. Playwright tetap diperlukan; deploy.yml tidak dikembalikan,
assembleDebug tidak tersedia dan tidak ada workflow APK Debug pengganti.
Workflow signed release tidak diubah atau dijalankan.

## Referensi paito yang sengaja tersisa

- `config/collector_sources.json` dan `scripts/historical_backfill.py`: nama,
  URL dan ID sumber histori hasil undian, bukan viewer.
- `public/data/{hk,sgp,live-draw,collector-status,historical-verification}.json`:
  provenance sumber/diagnostik; data dipertahankan tanpa perubahan task ini.
- Dokumen audit 2026-09-26, perbandingan paito, laporan Stage 1/1B dan checklist
  kandidat: catatan historis diberi penanda penghapusan. Instruksi histori aktif
  di checklist menggunakan Pola Visual; README menjelaskan kebijakan saat ini.
- Tes pengamanan workflow dan harness histori: assertion negatif untuk mencegah
  viewer/job paito kembali. Tidak ada referensi paito dalam source UI aktif.
- Laporan ini/README: penjelasan keputusan penghapusan dan batas sumber histori.

## Batas bukti

HK_SOURCE_ACCESS tetap BLOCKED oleh HTTP 403 dari tahap sebelumnya;
HK_CANONICAL_E2E tetap NOT_VERIFIED. Finality contract produksi masih kosong.
Tahap ini tidak mengulang investigasi HK atau mengubah validasi collector.
DEVICE_TEST_STATUS=NOT_TESTED: tidak ada pengujian Android fisik.
Migrasi Kotlin dan pembersihan branch berada di luar tahap ini.
