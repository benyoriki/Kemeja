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
