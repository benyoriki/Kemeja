# Setup Login Admin (Firebase Authentication) — LOKON PRIMA

Login admin sekarang memakai **Firebase Authentication** (Email/Password) yang
sesungguhnya — bukan lagi username/kata sandi yang ditulis di kode. Lakukan
langkah berikut di project Firebase (`lp-kemeja`) SEBELUM upload file baru ini:

## 1. Aktifkan Email/Password Sign-in
1. Buka https://console.firebase.google.com → project **lp-kemeja**.
2. Menu **Build > Authentication** → tab **Sign-in method**.
3. Klik provider **Email/Password** → toggle **Enable** → **Save**.

## 2. Buat akun admin
1. Masih di **Authentication**, buka tab **Users** → tombol **Add user**.
2. Isi **Email** (mis. `admin@lokonprima.com`) dan **Password** admin.
3. Klik **Add user**. Ulangi untuk setiap admin yang butuh akses dasbor
   (misalnya 1 akun untuk M Daud, 1 akun untuk Kamil).
4. Kata sandi lama di `firebase-config.js` (`admin@gmail.com` / `123admin`)
   **sudah tidak dipakai lagi** — silakan diabaikan/dihapus dari catatan lama.

## 3. Perbarui Firestore Rules (opsional tapi disarankan)
Sekarang admin benar-benar bisa dibedakan dari pengunjung biasa lewat
`request.auth`. Supaya perlindungan datanya nyata (bukan cuma di tampilan),
ubah rules aksi-aksi SENSITIF (ubah status bayar, hapus peserta, reset chat)
supaya hanya bisa dilakukan saat sudah login:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    match /pendaftaran/{docId} {
      allow read: if true;
      allow create: if true;                 // siapa saja boleh daftar
      allow update, delete: if request.auth != null;  // HANYA admin login
    }

    match /chat_pesan/{docId} {
      allow read: if true;
      allow create: if true;                 // peserta terverifikasi kirim pesan (dicek di UI)
      allow update: if true;                 // (jarang dipakai)
      allow delete: if request.auth != null; // HANYA admin login yang boleh reset chat
    }

    // koleksi chess_* biarkan seperti semula kalau memang publik
  }
}
```

> Catatan: rules di atas tetap tidak memverifikasi "siapa yang boleh
> DAFTAR/isi form" (itu memang publik by design). Yang berubah: hanya
> **tindakan admin** (ubah status bayar, hapus data, reset chat) yang
> sekarang benar-benar dikunci ke akun yang sudah login via Firebase Auth
> — bukan lagi mengandalkan "kata sandi di JavaScript" yang bisa dibaca
> siapa saja lewat View Source.

## 4. Uji coba
1. Upload ulang `index.html` dan `script.js` yang sudah diperbarui.
2. Buka website → ketuk logo "LOKON PRIMA" 5x → isi **email & kata sandi**
   admin yang baru dibuat di langkah 2 → Login.
3. Kalau berhasil, dasbor admin terbuka. Coba refresh halaman — dasbor akan
   otomatis terbuka lagi tanpa login ulang (sesi tersimpan aman oleh Firebase).
4. Tombol **Keluar** di dasbor akan benar-benar logout dari Firebase Auth.

## Yang berubah di kode
- `index.html`: field "Username" diganti jadi "Email Admin"; SDK
  `firebase-auth.js` dimuat berdampingan dengan Firestore.
- `script.js`: tombol Login sekarang memanggil
  `signInWithEmailAndPassword()`, ada pemantauan sesi otomatis
  (`onAuthStateChanged`), dan tombol Keluar memanggil `signOut()`.
- `firebase-config.js` (root, referensi saja): konstanta
  `ADMIN_USERNAME`/`ADMIN_PASSCODE` dihapus.
