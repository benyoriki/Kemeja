/* =========================================================
   FIREBASE CONFIG — LOKON PRIMA
   -------------------------------------------------
   1. Buka https://console.firebase.google.com
   2. Buat project baru (gratis / Spark plan sudah cukup)
   3. Tambahkan "Web App" di project settings > lalu copy
      config yang diberikan Firebase ke object di bawah ini.
   4. Aktifkan "Firestore Database" (mode production) di menu
      Build > Firestore Database > Create database.
   5. Atur Firestore Rules (menu Firestore > Rules), contoh
      aturan dasar ada di file PANDUAN-FIREBASE.md.
========================================================= */

const firebaseConfig = { 
  apiKey : "AIzaSyBg7JYwpE6mUja1j7NBC8Rfq9Snx_HX77w" , 
  authDomain : "lp-kemeja.firebaseapp.com" , 
  databaseURL : "https://lp-kemeja-default-rtdb.asia-southeast1.firebasedatabase.app" , 
  projectId : "lp-kemeja" , 
  storageBucket : "lp-kemeja.firebasestorage.app" , 
  messagingSenderId : "152507973931" , 
  appId : "1:152507973931:web:fd9fd3fabfe862a9cf856e" 
};

/* CATATAN (PERBAIKAN): login admin TIDAK LAGI memakai username/kata
   sandi yang ditulis di kode seperti dulu. Sekarang memakai Firebase
   Authentication (Email/Password) yang sesungguhnya:
   1. Firebase Console > Authentication > Sign-in method > aktifkan
      "Email/Password".
   2. Firebase Console > Authentication > Users > "Add user" > isi
      email & kata sandi admin di sana (BUKAN di file ini).
   3. Login admin di website akan memvalidasi ke akun tsb secara real.
   Catatan: file ini (root) sebenarnya tidak lagi di-import langsung
   oleh index.html (config sudah inline di index.html, lihat komentar
   di sana) — file ini disimpan sebagai referensi/dokumentasi saja. */

/* Nama koleksi Firestore tempat data pendaftaran disimpan */
export const FIRESTORE_COLLECTION = "pendaftaran";

/* Nama koleksi Firestore tempat pesan chat grup peserta disimpan */
export const CHAT_COLLECTION = "chat_pesan";
