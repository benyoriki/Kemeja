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
  URL basis data : "https://lp-kemeja-default-rtdb.asia-southeast1.firebasedatabase.app" , 
  projectId : "lp-kemeja" , 
  storageBucket : "lp-kemeja.firebasestorage.app" , 
  messagingSenderId : "152507973931" , 
  ID aplikasi : "1:152507973931:web:fd9fd3fabfe862a9cf856e" 
};

/* Kata sandi panel admin (sisi klien saja — lihat catatan
   keamanan di PANDUAN-FIREBASE.md). Ganti dengan kata sandi
   Anda sendiri sebelum website dipakai secara nyata. */
export const ADMIN_USERNAME = "admin@gmail.com";
export const ADMIN_PASSCODE = "123admin";

/* Nama koleksi Firestore tempat data pendaftaran disimpan */
export const FIRESTORE_COLLECTION = "pendaftaran";

/* Nama koleksi Firestore tempat pesan chat grup peserta disimpan */
export const CHAT_COLLECTION = "chat_pesan";
