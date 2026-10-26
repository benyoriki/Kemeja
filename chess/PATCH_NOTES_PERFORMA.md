# Catatan Perbaikan Performa — Lokon Chess Arena

Perbaikan ini **tidak mengubah tampilan/fitur apa pun** — semua efek visual,
3D, animasi, dan alur main tetap sama persis. Yang diubah murni cara kerja
di balik layar supaya lebih ringan di HP maupun PC.

## 1. Dasbor tidak lagi ikut mengunduh engine 3D (perbaikan terbesar)

**Sebelum:** `script.js` meng-import `effects.js` (berisi seluruh Three.js +
post-processing, ±520KB) secara statis di baris paling atas. Akibatnya,
begitu halaman `chess/index.html` dibuka — **walau cuma untuk lihat dasbor
ranking**, belum tentu mau main — browser wajib mengunduh & mem-parsing
seluruh engine 3D itu dulu sebelum apa pun bisa tampil.

**Sesudah:** `effects.js` sekarang dimuat lewat `import()` dinamis, hanya
saat pemain benar-benar menekan "Main" (`setupBoardForNewGame`). Supaya
tombol Main tetap terasa instan, modul ini di-*prefetch* diam-diam saat
browser sedang idle setelah dasbor selesai tampil (`prefetchScene3D`,
lewat `requestIdleCallback`).

Dampak: payload wajib saat pertama buka dasbor turun dari **±668KB → ±148KB**
(~78% lebih ringan), tanpa kehilangan apa pun — begitu mulai main, papan 3D
tetap dimuat penuh seperti biasa.

`sw.js` juga disesuaikan: `effects.js` dikeluarkan dari daftar precache
wajib saat instalasi PWA (naik ke `lokon-arena-v7`), karena sekarang file
itu di-cache otomatis begitu benar-benar diminta (lewat fetch handler
network-first yang sudah ada).

## 2. Dasbor tidak lagi rebuild total tiap ada heartbeat pemain lain

**Sebelum:** `listenRanking()` mendengarkan satu snapshot Firestore untuk
semua pemain. Tiap pemain online mengirim heartbeat (`updateDoc lastActiveAt`)
tiap 20 detik — dan **setiap** heartbeat itu memicu `renderLists()` yang
membangun ulang total `innerHTML` daftar ranking (sampai 100 baris) + daftar
online, untuk semua orang yang sedang buka dasbor. Makin banyak yang online,
makin sering dasbor "dihancur-bangun ulang" — inilah sumber utama rasa
patah-patah di dasbor.

**Sesudah:** ditambah `scheduleRenderLists()` yang menggabungkan
(coalesce) semua pemicu yang berdekatan menjadi satu render saja, maksimal
1x tiap 1.2 detik. Data tetap terasa realtime (jeda 1.2 detik tidak
terasa untuk daftar ranking/online), tapi rebuild DOM tidak lagi terjadi
berkali-kali per detik.

## 3. Papan 3D dibatasi ~30fps di perangkat lemah (HP & PC low-end)

Engine 3D (`effects.js`) sudah punya deteksi mode "lite" untuk HP/PC lemah
(pointer coarse atau CPU ≤4 core) — mengecilkan resolusi bayangan, bloom,
dan jumlah partikel. Sekarang ditambah satu lapis lagi: di mode lite,
render loop dibatasi ke ±30fps alih-alih mengikuti refresh rate layar
penuh (bisa 60–120fps). Mata nyaris tak bisa membedakan bedanya di papan
catur yang sebagian besar statis, tapi bedanya besar untuk suhu, baterai,
dan kelancaran keseluruhan halaman di HP.

## File yang berubah
- `script.js` / `script.source.js` — lazy-load 3D, prefetch idle, throttle render dasbor
- `effects.js` / `effects.source.js` — FPS cap mode lite
- `sw.js` — precache list disesuaikan, versi cache naik ke v7

## Belum disentuh (opsional untuk iterasi berikutnya)
- Beberapa kartu dasbor masih pakai `backdrop-filter: blur()` yang agak
  berat untuk di-repaint berulang — sekarang dampaknya jauh berkurang
  karena render sudah di-throttle, tapi bisa dikurangi lagi kalau mau
  diperas lebih jauh.
- `renderRankingList`/`renderOnlineList` masih rebuild total tiap render
  (bukan diff per-baris). Dengan throttle di atas ini sudah cukup ringan,
  tapi kalau suatu saat pemain online bisa ratusan sekaligus, ini kandidat
  berikutnya untuk dioptimasi (render hanya baris yang berubah).

---
# Putaran 2 — Mode Ringan (HP, PC lama, Windows 7)

Terdeteksi otomatis (layar sentuh, CPU <=4 core, RAM <=4GB, Windows 7/XP, atau GPU software).

- **Papan 3D:** bidak digabung jadi 1 mesh per jenis + material dipakai bersama (draw call bidak turun ~4-6x, tidak ada alokasi baru saat papan di-reset).
- **Glow (bloom) mati di perangkat ringan** dan komposer baru dibuat saat dinyalakan di Pengaturan. Bayangan mati bila GPU software.
- **Render 2 tingkat:** saat ada gerakan 30fps; saat diam 10fps (ringan) / 30fps (PC kuat). Peta bayangan hanya digambar ulang saat ada gerakan.
- Resolusi: HP maks 1.25x, PC lama 1x. Partikel ambient dikurangi.
- **Komputer (Stockfish):** kedalaman dibatasi (maks 10) + batas waktu berpikir 1,2 dtk di perangkat ringan (3 dtk di PC kuat), Hash 16MB.
- **CSS:** kelas `perf-low` mematikan backdrop-filter, blur 70px pada orb latar, dan animasi dekoratif turnamen; daftar ranking dirender maks tiap 2,5 dtk.
- `effects.js` dibangun ulang dari `effects.source.js` (Three.js r160, esbuild, target Chrome 80).

---
# Putaran 3 — Tampilan Game 2026 (tetap ringan)
- Kamera otomatis pas di layar (portrait HP & PC), tombol "Kamera" untuk reset.
- Papan: kontras petak lebih jelas; bidak hitam violet vivid, putih ivory; kuda berbentuk kepala kuda; cincin dekoratif pada pion/gajah/benteng.
- "Glow palsu" murah (1 plane gradasi) pengganti bloom.
- HUD HP satu baris (avatar, nama, bidak tertangkap, jam), strip riwayat langkah, jam aktif berwarna.
- Dok: 5 tombol utama berlabel + menu "Lainnya"; kartu solid bergradasi (tanpa blur).
- Layar hasil dengan animasi ringan & warna menang/kalah.

---
# Putaran 4 — Papan 2D cadangan, koordinat, tema, petunjuk
- `effects2d.js`: papan 2D super ringan (tanpa WebGL). Otomatis dipakai bila WebGL tidak ada / GPU software, atau lewat Pengaturan "Mode Super Ringan".
- Koordinat a-h & 1-8 di bingkai papan 3D (2D juga). Tema papan: Neon, Kayu, Es, Zamrud.
- Putaran kamera dibatasi di sisi pemain; di HP 1 jari = pilih bidak, 2 jari = putar/zoom.
- Pita status (giliran, skak, komputer berpikir, selisih materi), pilihan promosi pion, tombol Petunjuk (3x), rokade & en passant kini tampil benar.
