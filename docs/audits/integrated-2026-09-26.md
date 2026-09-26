# Audit terpadu AdiPredictor — 26 September 2026

Dokumen ini merekam fakta yang bisa direproduksi pada checkout sebelum perubahan: `main` `69542242f6ccfa69f738d66c5ebd849d00cfffc3`, Draft PR #7 `600dc50b01ca693e8ffbbed3d9f7c96c4048b1cd`. SHA final perubahan, run CI, dan uji perangkat dilaporkan setelah CI. Jangan membaca isi ini sebagai persetujuan rilis.

## Bahan visual: tiap berkas dipisahkan

| Berkas | Fakta sel/tata letak yang terlihat | Penjelasan sumber yang terbukti | Interpretasi dan batas |
|---|---|---|---|
| 443585.jpg | Tangkapan app: SVG P5 SDY `SAME DIGIT TRAVELLING` dan `BOUNCE PANTULAN`, delapan baris terlihat, empat kolom AS/KOP/KEPALA/EKOR; garis dari angka 7 ke 7 dan 7 ke 7. | SVG arsip prediksi aplikasi di Pola Visual. | SVG kecil memerlukan pembesaran; lintasan metadata tanpa koordinat tersimpan tetap rekonstruksi ilustratif. |
| 443583.jpg | Bidang putih puluhan baris dan kelompok empat digit berulang; pasangan hijau `76`, `44`, oranye `42` dan `45`, ungu `01`, dengan pergantian warna sel; tidak terlihat garis penghubung. | Judul pasar dan definisi kolom tidak tampak pada potongan gambar. | Tata letak lebar serta blok warna menjadi acuan visual; digit/kolom bantu tidak bisa diasumsikan canonical. |
| 443581.jpg | Teks SGP; bidang banyak baris, pasangan berwarna seperti `33`, `37`, `16`, `61`, `20`, `31`, `40`; kotak hitam mengurung rentang kolom/baris; angka besar `31`, `2031`, `031`. | Gambar bertanda SGP, tetapi sumber tiap draw/periode tidak tampak. | Kotak warna dan anotasi adalah contoh interaksi, bukan bukti rumus `2031`. |
| 443579.jpg | Teks HK POOLS; bidang puluhan baris, kotak hitam pada kelompok sel, pasangan hijau `97`, merah `97`, biru `58`/`37`, angka besar `85`, `58`, `37`, `73`, `38`, `35`, teks `AS 6&9`, `COP 2307`. | Judul HK tampak; tautan, tanggal dan pembuktian hasil per baris tidak tampak. | Kolom bantu dan anotasi tidak dapat dihitung dari hasil 4D yang tersedia saja. |
| 443577.jpg | Teks CAMBODIA, tanggal 24 Sep 2026; bidang berulang, kotak hitam, pasangan berwarna dan angka besar `2960`, `2906`, `1990`, `1938`, `06`, `90`, `38`, `32`, `72`. | Pasar pada gambar berada di luar tiga pasar aplikasi. | Hanya referensi tata letak; hasil Cambodia tidak dimasukkan ke dataset HK/SDY/SGP. |
| 443575.jpg | Teks SIDNEY LOTTO, kotak hitam satu kelompok vertikal, `73` biru di atas, `63`/`36` merah di tengah, `37` biru di bawah; garis diagonal dari sel biru kiri atas ke sel biru kanan bawah; teks besar `37 * 73`. | Judul dan sel tampak; sumber serta urutan draw tidak terverifikasi dari gambar. | Lintasan dan kotak contoh, bukan aturan prediksi terbukti; iklan tidak disalin. |
| 443573.jpg | Teks SIDNIYE POOLS, grup empat digit berulang, pasangan biru `45`, merah `93`, hijau `16`, angka besar `2971`, `2966`, `4971`, `2936`, `4936`, `16`, `86`; kotak hitam pada bagian tengah. | Judul pasar terlihat, tetapi identitas draw/baris tidak bisa dicocokkan dengan canonical hanya dari foto. | Angka besar tidak memberikan langkah rumus. |
| 443571.jpg | Teks SINGAPORE; puluhan baris, angka 3 biru, 7 hijau dan 2 merah dilingkari; garis merah 3→3, biru 7→7, hitam 2→2; teks besar `02`, `12`, `42`, `92`. | Judul pasar tampak, belum membuktikan bahwa ini SGP composite atau Singapore Pools 4D resmi. | Tidak ada alasan menggabungkan TOTO atau menyalin iklan; lintasan terpilih diperlakukan ilustrasi. |

Pada audit awal, kelompok grid aplikasi didefinisikan **D−4 hingga D−0 × AS/KOP/KEPALA/EKOR** dari hasil canonical tervalidasi. Sesudah perbandingan visual lanjutan, bidang akhir diperlebar menjadi **D−7 hingga D−0** dan pasangan KEPALA+EKOR berulang dalam jendela delapan draw diberi warna. Rincian tiap gambar dan bukti screenshot ada di [paito-reference-comparison.md](paito-reference-comparison.md). Foto tidak mendefinisikan kolom redup/kolom bantu; aplikasi tidak mengisinya. Tidak ditemukan langkah rumus primer, definisi variabel, atau hitung tangan sebelum target pada berkas yang tersedia.

## Video dan linimasa yang dapat dibuktikan

- `448140.mp4` (217,54 s) dan `448141.mp4` (103,18 s): UI menampilkan HK 25 September 2771, SDY 25 September 1559, SGP 24 September 2958, bertanda REMOTE; layar SGP Android bertanda `PLAYER_UNAVAILABLE` dan `ANDROID_EMBED_CONTAINED`, tanpa peristiwa PLAYING/logcat. Indikator collector “6 jam” bukan waktu pemeriksaan backend terakhir pada run `no_change`.
- `443568.mp4` (292,52 s, tersedia pada lampiran sesi terdahulu): sekitar 19.13–19.14 WIB 24 September papan live SDY `304152` (4 digit terakhir `4152`), sementara Analisis/Data menunjukkan `0217` tanggal 23 September. Ini observasi sumber, belum keputusan canonical pada layar video.
- Run Actions [35992541150](https://github.com/trinityzanetamanu-code/AdiPredictor/actions/runs/35992541150): log pada 24 September 11:22:02 UTC mencatat SDY 6D `304152`→4D `4152`, lalu tiga sumber sepakat; commit `1a2e38e2501d3bf58063110ae1437616bd873e09` terbit 11:24:15 UTC (18:24:15 WIB). Waktu pertama sumber menampilkan hasil dan respons ponsel tidak tercatat dalam run. Fakta commit lebih awal daripada rekaman 19:13 menyingkirkan hipotesis bahwa collector/engine belum menerbitkan hasil saat itu.
- SDY 25 September commit `1ae9ed853eb84b0676cb6f7eab47c240c6722ef2` 10:32:09 UTC; HK 25 September commit `d84580c0671bcad5c01e0bf926953219056e1651` 19:29:21 UTC. Jam mula sumber/pembanding awal tidak dapat dibuktikan dari artefak saat ini.
- Sinkronisasi Android PR menggunakan URL raw GitHub `main/public`, fallback APK lokal dan pengenal asal/umur; run `no_change` tidak mem-push collector-status.json. Tidak ada capture HTTP atau logcat perangkat dari video, sehingga titik pertama keterlambatan pada ponsel lama belum bisa dipastikan.

## Respons endpoint pada pemeriksaan terpisah

| Berkas | HTTP | Identik byte dengan main | SHA-256 awal |
|---|---:|---|---|
| `data/hk.json` | 200 | Ya | `a9556b1275daecad` |
| `data/sdy.json` | 200 | Ya | `ca2f534554a2468a` |
| `data/sgp.json` | 200 | Ya | `e343f66a7dc3ecfd` |
| `predictions/hk/latest.json` | 200 | Ya | `b0fa4e2baac97303` |
| `predictions/sdy/latest.json` | 200 | Ya | `a8fb4800a982491f` |
| `predictions/sgp/latest.json` | 200 | Ya | `c14e8905f9637a1f` |
| `predictions/hk/history.json` | 200 | Ya | `bb3b55b7c5eaa371` |
| `predictions/sdy/history.json` | 200 | Ya | `801f1655bb03c062` |
| `predictions/sgp/history.json` | 200 | Ya | `a66bb2e188960009` |
| `data/collector-status.json` | 200 | Ya | `00f4525d2c8a7352` |
| `data/live-draw.json` | 200 | Ya | `6a5d953219e13dfd` |

Catatan: URL, waktu mulai/selesai, ETag, dan cache-control lengkap untuk sebelas permintaan tersimpan sementara dalam `/tmp/adi-endpoint-audit.json`; dari ponsel perlu capture baru. Raw GitHub mengembalikan `cache-control: max-age=300` pada pemeriksaan, sehingga `cache: no-store` di kode bukan bukti respons ponsel selalu terbaru.

## 0094 — replay identik historis tanpa data masa depan

Fixture `public/data/hk.json` SHA-256 `a9556b1275daecad9fe7fe06b76560fc2ffcdb443ec9403997f816667db9db6d`; source `scripts/prediction_engine.py` SHA-256 `c16b0c9851d36148320a7186205095b223553cc300579d4de4ec4da777f22678`. Publisher memakai setup-python 3.11 di kedua workflow. Replay lokal Python 3.11.16 dan 3.12.14 menggunakan kode dan fixture sama, pustaka standar pada perhitungan engine. Setiap target memakai baris **sebelum** tanggal target; hasil aktual baru dipakai untuk statistik periode berikutnya.

| Target | Basis / fingerprint awal | Hasil aktual | Main & skor | Skor 0094 / 9094 | Top-3 P1–P7 |
|---|---|---|---|---|---|
| 2026-09-22 | 2026-09-21 / `1145be36d437` | 4659 | 0094 1.704199 (P1/P4) | 1.704199 / 1.704199 | P1: 9094, 9064, 0094; P2: 0040, 0060, 0045; P3: 5064, 0064, 5069; P4: 9094, 0094, 9004; P5: 0093, 0097, 0993; P6: 0863, 0861, 4863; P7: 0040, 0340, 9040 |
| 2026-09-23 | 2026-09-22 / `8ded4a9726d5` | 9540 | 0094 1.704213 (P1/P4) | 1.704213 / 1.704213 | P1: 9094, 9064, 0094; P2: 0059, 0069, 0055; P3: 0971, 0871, 0071; P4: 9094, 0094, 9004; P5: 0093, 0097, 0993; P6: 0863, 0861, 4863; P7: 9098, 9898, 9048 |
| 2026-09-24 | 2026-09-23 / `8248f8f865a0` | 0823 | 0094 1.704201 (P1/P4) | 1.704201 / 1.704201 | P1: 9094, 9064, 0094; P2: 0040, 0050, 0049; P3: 4094, 4494, 4194; P4: 9094, 0094, 9004; P5: 0093, 0097, 0993; P6: 0863, 0861, 4863; P7: 0036, 9036, 0038 |
| 2026-09-25 | 2026-09-24 / `b30878a63e3d` | 2771 | 9064 1.854571 (P1/P3) | 1.706274 / 1.706274 | P1: 9094, 9064, 0094; P2: 0040, 0049, 0060; P3: 6064, 9064, 7064; P4: 9094, 0094, 9004; P5: 0993, 0093, 0997; P6: 0863, 0861, 0663; P7: 0402, 0702, 0492 |
| 2026-09-26 | 2026-09-25 / `e82d1ff1133e` | pending | 0094 1.706275 (P1/P4) | 1.706275 / 1.706275 | P1: 9094, 9064, 0094; P2: 0040, 0050, 9040; P3: 9600, 9200, 9300; P4: 9094, 0094, 9894; P5: 0993, 0093, 0997; P6: 0863, 0861, 0663; P7: 0060, 0960, 0063 |

Bobot walk-forward dan kontribusi dari setiap kandidat pada lima target di atas (bobot hanya dihitung dari target sebelumnya):

| Target | Bobot P1–P7 | Dukungan dan kontribusi 0094 / 9094 |
|---|---|---|
| 2026-09-22 | P1=0.854568; P2=0.596914; P3=1.000000; P4=0.849631; P5=0.721182; P6=0.943523; P7=0.589484 | 0094: P1=0.854568, P4=0.849631; 9094: P1=0.854568, P4=0.849631 |
| 2026-09-23 | P1=0.854575; P2=0.600584; P3=1.000000; P4=0.849638; P5=0.721189; P6=0.945463; P7=0.589490 | 0094: P1=0.854575, P4=0.849638; 9094: P1=0.854575, P4=0.849638 |
| 2026-09-24 | P1=0.854569; P2=0.604244; P3=1.000000; P4=0.849632; P5=0.721181; P6=0.945459; P7=0.591240 | 0094: P1=0.854569, P4=0.849632; 9094: P1=0.854569, P4=0.849632 |
| 2026-09-25 | P1=0.854571; P2=0.604246; P3=1.000000; P4=0.851703; P5=0.721184; P6=0.947394; P7=0.591243 | 0094: P1=0.854571, P4=0.851703; 9094: P1=0.854571, P4=0.851703 |
| 2026-09-26 | P1=0.854572; P2=0.604247; P3=1.000000; P4=0.851703; P5=0.721186; P6=0.947396; P7=0.591244 | 0094: P1=0.854572, P4=0.851703; 9094: P1=0.854572, P4=0.851703 |

### Hipotesis seri, 56 target 1 Agustus–25 September 2026

| Aturan bila skor dan dukungan seri | Perubahan dari aturan terbit | Main berulang | 0094 Main | 4D tepat | 3D depan/belakang | 2D depan/tengah/belakang |
|---|---:|---:|---:|---:|---|---|
| published_ascending | 0 | 33/55 | 17 | 0 | 0/0 | 1/1/0 |
| descending | 19 | 34/55 | 1 | 0 | 0/0 | 1/1/0 |
| rank_sensitive | 18 | 32/55 | 2 | 0 | 0/0 | 1/1/0 |
| avoid_previous_on_tie | 13 | 31/55 | 4 | 0 | 0/0 | 1/1/0 |

19/56 target mempunyai seri teratas; Main sama pada 33/55 transisi dan 0094 menjadi Main 17/56 dengan rangkaian terpanjang 11 target (14–24 September). 25 September **9064** unggul karena dukungan P1/P3 bernilai 1.854571. Semua aturan seri menghasilkan 0 tepat 4D, 0 tepat 3D, dan subkategori 2D sama; tak ada bukti untuk mengubah bobot atau memblokir 0094. Perbandingan 3.11/3.12 menghasilkan pilihan Main dan metrik tabel sama pada jendela ini, tetapi skor tidak identik per bit. Replay artefak target 26 September cocok pada 3.11 (`0094` 1.706275) dan berbeda pada 3.12 (1.707209); fingerprint dataset identik. Titik selisih paling awal yang diukur untuk P1 BBFS adalah 9 Januari 2024: matriks 4×10 sama persis per bit, `aggregate(matrix)` untuk digit 8 adalah `0x1.9e707f982258ep-2` pada 3.11 vs `0x1.9e707f982258dp-2` pada 3.12; urutan BBFS5 berubah. Artefak lama tidak menyimpan source hash dan jejak semua float; asal perubahan di level fungsi `sum` merupakan inferensi dari matriks yang identik, agregat berbeda satu bit, dan publisher 3.11.

## Gerbang penerimaan

- Perubahan pada PR tetap Draft; metode konsensus dan arsip hasil tidak diubah. Dataset SGP composite tetap terpisah dari Singapore Pools 4D resmi dan Singapore TOTO.
- UI paito dari hasil canonical adalah ilustrasi, tidak menambah suara P5/P1–P8; SVG arsip dan metadata tetap tersedia.
- Tanpa perangkat fisik/logcat, screenshot akhir Android, event PLAYING, cold start/resume jaringan, dan upgrade dari stable `versionCode=100010` belum dapat dibuktikan. Signed candidate memerlukan keystore lingkungan `android-release` terlindungi, dan workflow saat ini sekaligus memublikasikan stable dari main; tidak dipicu pada Draft. Status gerbang: **BELUM SIAP RILIS**.
