# ♞ Lokon Chess Arena — Modul Catur 3D untuk Website Kemeja

Modul ini menambahkan game catur 3D real-time ke website **LOKON PRIMA**
tanpa membuat website, project Firebase, atau sistem login baru.
Semua berjalan di project Firebase yang sama, memakai sesi login
peserta yang sama, hanya menambah 4 koleksi Firestore baru khusus
data catur.

```
Kemeja/
├── index.html         (sudah ada — ditambah 1 tombol mengambang)
├── style.css          (sudah ada — ditambah CSS tombol catur)
├── ...
└── chess/
    ├── index.html
    ├── style.css
    ├── script.js          ← orkestrator (Firebase, matchmaking, game loop)
    ├── chess-engine.js     ← aturan main (chess.js) + AI (Stockfish)
    ├── effects.js          ← papan & bidak 3D + partikel (Three.js)
    ├── ui.js               ← render HUD/modal/dashboard
    ├── sound.js            ← semua efek suara (disintesis, tanpa file audio)
    ├── firebase-config.js  ← config sama + nama koleksi & parameter game
    ├── manifest.webmanifest
    └── sw.js               ← service worker (PWA, cache file statis saja)
```

## Kenapa tidak ada folder `assets/` dan `lib/`?

Struktur folder yang diminta menyertakan `assets/board.glb`,
`assets/pieces.glb`, `assets/audio/*`, dan `lib/stockfish.wasm`. File-file
biner ini **tidak bisa dibuat lewat kode teks** — menaruh file `.glb`
atau `.wasm` kosong di repo hanya akan membuat game gagal total saat
dimuat. Karena itu modul ini didesain ulang secara sengaja:

- **Papan & bidak** dibangun *prosedural* langsung dari kode Three.js
  (silinder, bola, kerucut, torus digabung jadi bentuk pion/benteng/
  kuda/dst). Hasilnya tetap 3D sungguhan, ada bayangan, reflection
  ringan, bloom/glow — bukan gambar 2D.
- **Suara** dibuat lewat Web Audio API (oscillator + noise), bukan
  file mp3. Semua bunyi (langkah, tangkap, skak, menang, dst) betulan
  berbunyi tanpa perlu hosting file audio apa pun.
- **Stockfish & chess.js** dimuat dari CDN (bukan file lokal di `lib/`)
  supaya selalu dapat versi yang valid & ter-update, dengan fallback
  otomatis (lihat bagian AI di bawah).

Ingin pakai model 3D atau file audio buatan sendiri nanti? Tinggal taruh
filenya di `chess/assets/` lalu ganti fungsi `createPiece()` di
`effects.js` (pakai `GLTFLoader`) atau isi fungsi di `sound.js` dengan
`new Audio(...)`. Arsitekturnya sudah disiapkan supaya penggantian itu
gampang — komentar di kedua file menjelaskan persis di mana.

## Yang benar-benar berjalan sekarang

- Papan 3D HD dengan pencahayaan, bayangan, bloom/glow, partikel debu
  ambient, efek tangkap bidak, efek promosi, confetti kemenangan.
- Aturan catur lengkap & valid (chess.js): skak, skakmat, promosi,
  castling, en passant, remis (stalemate/repetisi/50 langkah).
- Mode **Lawan Komputer** (Stockfish via CDN, level 1–20, ada AI
  cadangan otomatis bila CDN gagal dimuat) — **tidak** menyentuh rating
  atau statistik, murni latihan, sesuai permintaan.
- Mode **Lawan Player** real-time lewat Firestore: matchmaking via
  tantangan, timer 10 menit/pemain (satu-satunya mode waktu, sesuai
  permintaan), sinkronisasi langkah, resign, tawaran remis, deteksi
  waktu habis, rating ELO (K=32) yang benar-benar dihitung & disimpan.
- Klik avatar di ranking/daftar online → popup profil premium (foto
  inisial berwarna, status online/idle/offline real-time, total main,
  W/L/D, kabur, win rate, tanggal gabung, jam main, badge achievement,
  badge Fair Play) + tombol Tantang Duel.
- Dashboard ranking Top 100 & daftar pemain online, keduanya realtime
  (`onSnapshot`), dengan pencarian nama.
- Tamu (belum login) hanya bisa melihat dashboard; tombol main
  menampilkan modal ajakan daftar, tidak bisa mengirim tantangan.
- Tombol catur mengambang di website utama, sejajar di atas tombol
  chat, dengan animasi pulse neon.
- PWA dasar: bisa "Tambahkan ke Layar Utama", app shell ter-cache.
- **Turnamen Catur Kemerdekaan 17 Agustus 2026** (fitur baru): banner
  meriah bertema merah-putih di dasbor, popup info lengkap (countdown
  hari/jam/menit/detik, hadiah juara 1–3, daftar peserta yang sudah
  diterima admin). Hanya peserta login yang bisa mendaftar (tamu
  diarahkan ke modal ajakan daftar yang sama seperti mode lain);
  pendaftaran wajib mengisi nomor WhatsApp aktif, tersimpan sebagai
  status "menunggu" sampai diterima/ditolak admin lewat menu baru
  **Turnamen Catur** di Dasbor Admin (yang juga mengatur tanggal/jam
  & hadiah — semuanya real-time, tanpa perlu edit kode). Semua animasi
  bertema (kembang api, kelap-kelip) murni CSS (opacity/transform),
  bukan canvas/particle-system JS, supaya tetap ringan di HP & PC.

## Yang disederhanakan dari spesifikasi awal (jujur, biar tidak ada kejutan)

| Diminta | Yang dibuat |
|---|---|
| Koleksi terpisah `rankings`, `onlinePlayers`, `gameMoves`, `notifications` | Digabung ke `chess_players` (status online dihitung dari `lastActiveAt`, bukan disimpan statis) dan `chess_rooms` (langkah disimpan sebagai array di dalam room, bukan koleksi terpisah). Ini pola yang lebih tahan-race-condition untuk app tanpa backend server. |
| Achievement sebagai koleksi/ledger terpisah | Dihitung langsung dari statistik pemain (jumlah main, win streak, rating) — hasilnya sama, datanya lebih sederhana. |
| Replay langkah-demi-langkah | Riwayat lengkap (PGN) tersimpan di `chess_matches`, tinggal ditambah UI player nanti — belum ada tombol "Replay" di v1 ini. |
| Report Player | Belum ada; gampang ditambahkan (koleksi `chess_reports` + tombol di profil). |
| Deteksi "kabur" otomatis saat internet terputus tiba-tiba | Kabur **sengaja keluar** (tombol Keluar saat game berjalan) sudah tercatat sebagai kabur. Deteksi disconnect murni (tutup tab/mati internet) butuh Cloud Functions/server, yang di luar cakupan hosting statis GitHub Pages — didokumentasikan sebagai keterbatasan, bukan disembunyikan. |
| File model `.glb` & audio premium | Lihat penjelasan di atas — prosedural & sintesis, bisa diganti nanti. |

## WAJIB: Tambahkan Firestore Rules

Koleksi baru (`chess_players`, `chess_rooms`, `chess_matches`,
`chess_challenges`) belum punya rules — secara default Firestore akan
**menolak semua akses**. Buka
[Firestore Rules](https://console.firebase.google.com/u/0/project/lp-kemeja/firestore/databases/-default-/security/rules)
lalu tambahkan blok berikut di dalam `service cloud.firestore { match /databases/{database}/documents { ... } }`
(sejajar dengan rules `pendaftaran`/`chat_pesan` yang sudah ada — jangan hapus yang lama):

```
match /chess_players/{kodeUnik} {
  allow read: if true;
  allow write: if true;
  // Catatan: karena website ini tidak memakai Firebase Authentication
  // (login hanya berbasis kode unik di sisi klien, sama seperti
  // pendaftaran & chat yang sudah ada), rules tidak bisa memverifikasi
  // "siapa yang benar-benar login" secara kriptografis. Ini konsisten
  // dengan model keamanan situs yang sudah berjalan sekarang.
}
match /chess_rooms/{roomId} {
  allow read: if true;
  allow write: if true;
}
match /chess_matches/{matchId} {
  allow read: if true;
  allow create: if true;
  allow update, delete: if false; // histori pertandingan tidak boleh diubah/dihapus
}
match /chess_challenges/{challengeId} {
  allow read: if true;
  allow create: if true;
  allow update: if request.resource.data.diff(resource.data).affectedKeys().hasOnly(['status','roomId']);
  allow delete: if false;
}

// --- Turnamen Catur 17 Agustus 2026 (fitur baru) ---
match /chess_tournament_config/{configId} {
  allow read: if true;   // dibaca semua orang (banner + modal turnamen di dasbor catur)
  allow write: if true;  // ditulis dari Dasbor Admin (menu "Turnamen Catur 17 Agustus")
}
match /chess_tournament_agustus17/{kodeUnik} {
  allow read: if true;   // daftar peserta "approved" tampil publik di modal turnamen
  allow write: if true;  // peserta menulis pendaftarannya sendiri; admin mengubah status
                          // (approve/reject) dari Dasbor Admin. Sama seperti koleksi lain
                          // di atas, rules ini tidak memverifikasi identitas kriptografis
                          // karena situs tidak memakai Firebase Authentication.
}
```

## Cara pakai / testing

1. Upload folder `chess/` ke repo GitHub Pages (`benyoriki.github.io/Kemeja/chess/`).
2. Tambahkan rules di atas ke Firestore (wajib, tanpa ini semuanya gagal).
3. Buka website utama → login sebagai peserta (pakai kode unik seperti
   biasa) → klik tombol bulat ikon kuda catur (di atas tombol chat).
4. Coba "Lawan Komputer" dulu untuk memastikan papan 3D & AI jalan.
5. Buka di 2 browser/perangkat berbeda dengan 2 akun peserta berbeda
   untuk menguji tantangan duel & sinkronisasi realtime.

## Known limitations / lanjutan yang disarankan

- Ikon PWA memakai `favicon.png` yang sama dengan situs utama — untuk
  hasil install-icon terbaik, siapkan ikon 192×192 & 512×512 khusus.
- Anti-cheat waktu bergantung pada `serverTimestamp()` Firestore
  (cukup untuk skala peserta internal, tapi bukan tingkat kompetitif
  turnamen resmi).
- Disconnect/reconnect otomatis saat koneksi putus mendadak belum ada
  (lihat tabel di atas) — kemungkinan besar butuh Cloud Functions
  berbayar (di luar Firebase Spark plan gratis) untuk deteksi server-side
  yang andal.
- Replay & Report Player belum ada UI-nya, tapi data pendukungnya
  (`pgn` di `chess_matches`) sudah tersimpan lengkap sehingga tinggal
  dibuatkan tampilannya kapan saja.
