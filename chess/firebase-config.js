/* =========================================================
   FIREBASE CONFIG — MODUL CATUR (chess/)
   -------------------------------------------------
   PENTING: project Firebase, login peserta, dan koleksi
   "pendaftaran" / "chat_pesan" TETAP SAMA PERSIS dengan
   website utama (Kemeja/index.html). Modul catur ini TIDAK
   membuat project atau sistem login baru — hanya menambah
   koleksi Firestore BARU khusus data catur di project yang
   sama, supaya profil, histori & statistik selalu terhubung
   dengan akun peserta yang sudah terdaftar di website utama.
========================================================= */

export const firebaseConfig = {
  apiKey: "AIzaSyBg7JYwpE6mUja1j7NBC8Rfq9Snx_HX77w",
  authDomain: "lp-kemeja.firebaseapp.com",
  databaseURL: "https://lp-kemeja-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "lp-kemeja",
  storageBucket: "lp-kemeja.firebasestorage.app",
  messagingSenderId: "152507973931",
  appId: "1:152507973931:web:fd9fd3fabfe862a9cf856e"
};

/* ---- Koleksi yang SUDAH ADA di website utama (jangan diubah) ---- */
export const FIRESTORE_COLLECTION = "pendaftaran";   // profil peserta (sumber kebenaran nama/kode unik)
export const CHAT_COLLECTION      = "chat_pesan";    // chat grup peserta

/* ---- Kunci localStorage sesi login peserta (dibuat oleh index.html,
        dibaca ulang di sini — SATU sesi, SATU login, dua halaman) ---- */
export const SESSION_KEY = "lokonMemberSession";

/* ---- Koleksi BARU khusus modul catur (aman ditambahkan, tidak
        menyentuh/menimpa data pendaftaran atau chat) ---- */
export const COL_CHESS_PLAYERS    = "chess_players";     // profil & statistik catur per peserta (docId = kodeUnik)
export const COL_CHESS_ROOMS      = "chess_rooms";       // ruang permainan aktif (live state + langkah)
export const COL_CHESS_MATCHES    = "chess_matches";     // arsip histori pertandingan selesai
export const COL_CHESS_CHALLENGES = "chess_challenges";  // notifikasi tantangan duel realtime

/* ---- Turnamen 17 Agustus 2026 (event spesial, terpisah dari
        ranking/main harian) ----
   - COL_TOURNEY_REG   : 1 dokumen per pendaftar, docId = kodeUnik
                         (mencegah dobel daftar), status diubah admin
                         lewat Dasbor Admin -> menu "Turnamen Catur".
   - COL_TOURNEY_CONFIG: 1 dokumen tunggal (docId TOURNEY_ID) berisi
                         tanggal/jam mulai & hadiah juara 1/2/3 —
                         SEMUA bisa diubah admin dari Dasbor Admin,
                         tanpa perlu edit kode. Nilai di bawah ini
                         cuma FALLBACK kalau dokumen config belum
                         pernah disimpan admin sama sekali. */
export const COL_TOURNEY_REG     = "chess_tournament_agustus17";
export const COL_TOURNEY_CONFIG  = "chess_tournament_config";
export const TOURNEY_ID          = "agustus17_2026";
export const TOURNEY_DEFAULTS = {
  title: "Turnamen Catur Kemerdekaan 17 Agustus 2026",
  startAtISO: "2026-08-17T09:00:00+07:00",
  prize1: "Rp 1.000.000 + Trofi + Sertifikat",
  prize2: "Rp 600.000 + Sertifikat",
  prize3: "Rp 300.000 + Sertifikat",
  active: true
};

/* ---- Parameter permainan (satu metode saja, sesuai permintaan) ---- */
export const GAME_TIME_MS   = 10 * 60 * 1000;  // 10 menit per pemain, tidak ada mode lain
export const ELO_K_FACTOR   = 32;
export const HEARTBEAT_MS   = 20 * 1000;       // interval "saya masih online"
export const ONLINE_TIMEOUT_MS = 60 * 1000;    // > ini dianggap idle
export const IDLE_TIMEOUT_MS   = 5 * 60 * 1000; // > ini dianggap offline
