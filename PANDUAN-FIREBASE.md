# Panduan Setup Firebase — Website LOKON PRIMA

Fitur "Peserta Terdaftar" (kartu peserta live, status DP/cicilan/lunas, dan
panel admin) membutuhkan **Firebase Firestore** agar data pendaftaran
tersimpan dan tampil real-time. Tanpa langkah di bawah, website tetap
berjalan normal (form, struk, WhatsApp) — hanya bagian "Peserta Terdaftar"
akan menampilkan pesan "Firebase belum dikonfigurasi".

## 1. Buat Project Firebase
1. Buka https://console.firebase.google.com → **Add project**.
2. Beri nama bebas, misalnya `lokon-prima-kemeja`. Google Analytics boleh dimatikan.
3. Setelah project jadi, klik ikon **Web (`</>`)** untuk mendaftarkan web app.
4. Beri nickname (misal `website-kemeja`), lalu **Register app**.
5. Firebase akan menampilkan objek `firebaseConfig` — salin semua isinya.

## 2. Isi `firebase-config.js`
Buka file `firebase-config.js` di folder website, ganti bagian
`firebaseConfig` dengan hasil salinan dari langkah di atas. Contoh:

```js
export const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "lokon-prima-kemeja.firebaseapp.com",
  projectId: "lokon-prima-kemeja",
  storageBucket: "lokon-prima-kemeja.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcabc"
};
```

Ganti juga `ADMIN_PASSCODE` dengan kata sandi admin pilihan Anda sendiri.

## 3. Aktifkan Firestore Database
1. Di sidebar kiri Firebase Console → **Build → Firestore Database**.
2. Klik **Create database** → pilih **Start in production mode** → pilih lokasi server (misalnya `asia-southeast2` / Jakarta) → **Enable**.

## 4. Atur Firestore Security Rules
Buka tab **Rules** di Firestore, ganti dengan aturan berikut, lalu **Publish**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /pendaftaran/{docId} {
      allow create: if true;   // siapa saja boleh mendaftar
      allow read: if true;     // siapa saja boleh melihat daftar peserta
      allow update, delete: if false; // sementara ditutup dari sisi klien
    }
  }
}
```

**Catatan penting soal keamanan:** Panel admin di website ini memakai kata
sandi yang dicek di sisi browser (client-side), bukan Firebase Authentication.
Ini cukup untuk penggunaan internal skala kecil, tapi bukan pengaman yang
kuat — seseorang yang cukup teknis bisa saja tetap mengubah data lewat
console browser. Aturan `allow update: if false` di atas justru akan
memblokir panel admin. Untuk keseimbangan praktis vs keamanan, ada dua opsi:

- **Opsi cepat (dipakai saat ini):** ganti `allow update, delete: if false`
  menjadi `allow update: if true;` — mudah dipakai, tapi siapa pun yang tahu
  cara memakai Firestore SDK bisa ikut mengubah data tanpa lewat panel admin.
- **Opsi aman (disarankan untuk jangka panjang):** tambahkan Firebase
  Authentication (Email/Password) khusus untuk admin, lalu ubah rule
  menjadi `allow update: if request.auth != null;`. Ini butuh sedikit
  tambahan kode login di panel admin — beri tahu developer jika ingin
  fitur ini ditambahkan.

## 5. Selesai
Setelah config terisi dan Firestore aktif, buka kembali website:
- Isi formulir pendaftaran → data otomatis tersimpan ke Firestore.
- Bagian "Peserta Terdaftar" akan menampilkan kartu peserta secara live.
- Klik ikon gembok di sebelah kolom pencarian peserta untuk membuka
  **Panel Admin**, masukkan kata sandi (`ADMIN_PASSCODE`), lalu kelola
  status DP / cicilan / lunas tiap peserta.

## Struktur Data (koleksi `pendaftaran`)
Setiap dokumen berisi data pendaftar plus objek `pembayaran`:

```
pembayaran: {
  metode: "tunai" | "cicilan",
  dpMinimal: number,
  dpDibayar: boolean,
  cicilan: [ { ke, nominal, dibayar, tanggalBayar }, ... ],
  totalDibayar: number,
  status: "belum_dp" | "dp" | "cicilan" | "lunas"
}
```

Status ini yang menentukan badge warna dan filter pada kartu peserta.
