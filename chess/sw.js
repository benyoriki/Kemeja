/* =========================================================
   SW.JS — Service worker minimal untuk Lokon Chess Arena
   -------------------------------------------------
   Tujuan: PWA bisa di-install (ikon di layar utama HP) dan
   file inti (HTML/CSS/JS lokal) tetap ter-cache supaya modul
   tetap terbuka walau koneksi sedang lemah. Data Firestore
   (ranking, room, dsb) TETAP butuh internet — service worker
   ini tidak menyimpan/mengubah data apa pun, murni cache file.
========================================================= */

// v7: effects.js (engine 3D, ~520KB) sengaja TIDAK dipaksa precache lagi
// di sini — sekarang dimuat lazy (dynamic import) oleh script.js hanya
// saat pemain benar-benar mulai main, supaya install PWA & buka pertama
// kali jauh lebih ringan/cepat. File tetap otomatis ter-cache lewat
// fetch handler network-first di bawah begitu benar-benar diminta.
const CACHE_NAME = 'lokon-arena-v7';
const APP_SHELL = [
  './index.html',
  './style.css',
  './script.js',
  './chess-engine.js',
  './ui.js',
  './sound.js',
  './firebase-config.js',
  './manifest.webmanifest'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Hanya cache file same-origin milik modul catur sendiri.
  // Semua request ke CDN (three.js, chess.js, stockfish, firebase,
  // font) & ke Firestore dibiarkan lewat jaringan langsung — supaya
  // selalu memakai versi terbaru & data realtime yang benar.
  if (url.origin !== location.origin){
    return;
  }

  // Network-first: selalu coba ambil versi terbaru dari server dulu.
  // Kalau berhasil, update cache & pakai itu. Kalau offline/gagal,
  // baru fallback ke versi cache supaya modul tetap bisa dibuka.
  // Ini mencegah pengguna lama "terjebak" di versi lama setelah
  // file di-update di GitHub.
  event.respondWith(
    fetch(event.request).then((res) => {
      if (res && res.ok){
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
      }
      return res;
    }).catch(() => caches.match(event.request))
  );
});
