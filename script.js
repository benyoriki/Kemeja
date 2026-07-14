/* =========================================================
   LOKON PRIMA — script.js
   Catatan: browser tidak dapat mengirim WhatsApp/menyimpan file
   secara sepenuhnya otomatis tanpa aksi apapun dari pengguna
   karena batasan keamanan browser. Skrip ini memicu unduhan
   struk JPG lalu membuka WhatsApp dengan pesan yang sudah terisi,
   sehingga pengguna tinggal menekan tombol kirim di WhatsApp.

   CATATAN MODULARISASI: efek visual murni (partikel hero,
   confetti, cursor glow, tombol magnetik, ripple, glow kartu)
   sudah dipindahkan ke file particles.js supaya terpisah dari
   fungsi inti sistem di file ini (form, Firebase, admin, chat).
   File ini TETAP BISA JALAN SENDIRI tanpa particles.js — hanya
   confetti saat pendaftaran berhasil yang tidak akan muncul.
========================================================= */

/* =========================================================
   KONFIGURASI PROGRAM IURAN — ubah angka di bawah ini sesuai
   kesepakatan tim. TARGET_PESERTA = jumlah minimal pendaftar
   yang dibutuhkan sebelum produksi massal dijalankan. Angka ini
   dipakai untuk menghitung persen progress bar & status timeline
   di section "Progress Iuran Bersama".
========================================================= */
const TARGET_PESERTA = 30;

/* CURRENT_STAGE menentukan tahap mana yang aktif di timeline:
   1 = Pendaftaran berjalan (default)
   2 = Target peserta & DP sudah terkumpul, menunggu produksi
   3 = Produksi massal sedang berjalan
   4 = Selesai — kemeja sudah didistribusikan
   Ubah manual angka ini saat progres program berpindah tahap. */
const CURRENT_STAGE = 1;

document.addEventListener('DOMContentLoaded', () => {

  /* =========================================================
     0. PERBAIKAN BUG UTAMA: RACE CONDITION FIREBASE
     Sebelumnya, kode di bawah ini (listener peserta live & fungsi
     simpan pendaftaran) membaca window.__lokonFirebase HANYA SEKALI,
     tepat saat 'DOMContentLoaded' terjadi. Padahal SDK Firebase
     dimuat secara asinkron dari CDN (index.html) dan baru selesai
     BEBERAPA SAAT setelah DOMContentLoaded — apalagi di koneksi
     lambat. Akibatnya window.__lokonFirebase HAMPIR SELALU masih
     null saat dibaca, sehingga pendaftaran tidak pernah tersimpan
     dan daftar peserta live tidak pernah muncul, meskipun Firebase
     sebenarnya berhasil tersambung beberapa detik kemudian.

     waitForFirebase() memperbaiki ini dengan MENUNGGU event
     'lokon-firebase-ready' (dikirim dari index.html setelah SDK
     selesai dimuat) sebelum menyerah — dengan batas waktu, supaya
     tetap ada di koneksi yang benar-benar mati.
  ========================================================= */
  function waitForFirebase(timeoutMs = 20000){
    if (window.__lokonFirebase) return Promise.resolve(window.__lokonFirebase);
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        window.removeEventListener('lokon-firebase-ready', onReady);
        clearTimeout(timer);
        resolve(window.__lokonFirebase); // masih bisa null kalau memang gagal total
      };
      const onReady = () => finish();
      window.addEventListener('lokon-firebase-ready', onReady);
      const timer = setTimeout(finish, timeoutMs);
    });
  }

  /* ============ 1. LOADING SCREEN ============ */
  const loadingScreen = document.getElementById('loading-screen');
  // PERBAIKAN BUG: sebelumnya nilai ini 15000 (15 detik!) dan dipaksa
  // tampil penuh pada SETIAP kunjungan, apa pun kecepatan koneksi
  // pengguna. Ini membuat seluruh situs (termasuk tombol "Daftar")
  // terlihat macet/tidak responsif selama 15 detik setiap kali halaman
  // dibuka. Diturunkan ke durasi wajar untuk animasi splash singkat.
  const MIN_LOADING_MS = 7000;
  const loadingStartedAt = Date.now();
  function hideLoadingScreen(){
    const elapsed = Date.now() - loadingStartedAt;
    const remaining = Math.max(0, MIN_LOADING_MS - elapsed);
    setTimeout(() => loadingScreen && loadingScreen.classList.add('hide'), remaining);
  }
  window.addEventListener('load', hideLoadingScreen);
  // Fallback in case 'load' already fired before listener was attached
  setTimeout(hideLoadingScreen, 100);

  /* ============ 2. SCROLL PROGRESS + STICKY NAVBAR ============ */
  const progressBar = document.getElementById('scroll-progress');
  const navbar = document.getElementById('navbar');
  const parallaxBg = document.getElementById('parallaxBg');
  const backToTop = document.getElementById('backToTop');

  function onScroll(){
    const scrollTop = window.scrollY;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
    progressBar.style.width = progress + '%';

    navbar.classList.toggle('scrolled', scrollTop > 40);
    backToTop.classList.toggle('show', scrollTop > 400);

    // Parallax hero background
    if (parallaxBg) {
      parallaxBg.style.transform = `translateY(${scrollTop * 0.25}px)`;
    }
  }
  window.addEventListener('scroll', onScroll, { passive:true });
  onScroll();

  /* ============ 3. HAMBURGER MENU ============ */
  const hamburger = document.getElementById('hamburger');
  const navLinks = document.getElementById('navLinks');
  const navOverlay = document.getElementById('navOverlay');
  const navCloseBtn = document.getElementById('navCloseBtn');

  function openNavMenu(){
    navLinks.classList.add('open');
    hamburger.classList.add('active');
    navOverlay.classList.add('active');
    document.body.classList.add('nav-open-lock');
  }
  function closeNavMenu(){
    navLinks.classList.remove('open');
    hamburger.classList.remove('active');
    navOverlay.classList.remove('active');
    document.body.classList.remove('nav-open-lock');
  }
  hamburger.addEventListener('click', () => {
    navLinks.classList.contains('open') ? closeNavMenu() : openNavMenu();
  });
  navCloseBtn?.addEventListener('click', closeNavMenu);
  navOverlay?.addEventListener('click', closeNavMenu);
  navLinks.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', closeNavMenu);
  });

  /* ============ 4. DARK MODE TOGGLE (session only) ============ */
  const darkModeToggle = document.getElementById('darkModeToggle');
  darkModeToggle.addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark');
    darkModeToggle.innerHTML = isDark
      ? '<i class="fa-solid fa-moon"></i>'
      : '<i class="fa-solid fa-sun"></i>';
  });

  /* ============ 5. FADE-UP ON SCROLL (staggered) ============ */
  const fadeGroups = {};
  document.querySelectorAll('.fade-up').forEach(el => {
    const parent = el.parentElement;
    if (!fadeGroups[parent] ) fadeGroups[parent] = [];
  });
  // stagger delay per sibling group
  const groupCounters = new WeakMap();
  document.querySelectorAll('.fade-up').forEach(el => {
    const parent = el.parentElement;
    const count = groupCounters.get(parent) || 0;
    el.style.transitionDelay = Math.min(count * 70, 280) + 'ms';
    groupCounters.set(parent, count + 1);
  });

  const fadeEls = document.querySelectorAll('.fade-up');
  const fadeObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting){
        entry.target.classList.add('show');
        fadeObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });
  fadeEls.forEach(el => fadeObserver.observe(el));

  /* ============ 6. COUNTER ANIMATION ============ */
  const counters = document.querySelectorAll('.counter');
  const counterObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting){
        animateCounter(entry.target);
        counterObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });
  counters.forEach(c => counterObserver.observe(c));

  function animateCounter(el){
    const target = parseInt(el.dataset.target, 10);
    const duration = 1400;
    const start = performance.now();
    function step(now){
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.floor(eased * target);
      if (progress < 1) requestAnimationFrame(step);
      else el.textContent = target;
    }
    requestAnimationFrame(step);
  }


  /* ============ 8. GALLERY LIGHTBOX ============ */
  // Tombol tab "Model Pria / Model Wanita" & "Pola Pria / Pola Wanita" —
  // satu handler generik dipakai untuk kedua grup tab di halaman ini.
  document.querySelectorAll('.galeri-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      tab.parentElement.querySelectorAll('.galeri-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const targetEl = document.getElementById(tab.dataset.target);
      if (!targetEl) return;
      const panelClass = targetEl.classList.contains('pola-set') ? '.pola-set' : '.gallery-grid-set';
      document.querySelectorAll(panelClass).forEach(p => p.classList.remove('active'));
      targetEl.classList.add('active');
    });
  });

  const galleryItems = document.querySelectorAll('.gallery-item');
  const lightbox = document.getElementById('lightbox');
  const lightboxImg = document.getElementById('lightboxImg');
  const lightboxCaption = document.getElementById('lightboxCaption');
  const lightboxClose = document.getElementById('lightboxClose');
  const isFinePointer = window.matchMedia('(hover:hover) and (pointer:fine)').matches;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  galleryItems.forEach(item => {
    const img = item.querySelector('img');
    if (img) {
      let retried = false;
      const markLoaded = () => {
        item.classList.remove('img-loading');
        item.classList.remove('img-error');
        img.classList.add('img-loaded');
      };
      const markError = () => {
        // PERBAIKAN: sebelumnya begitu 1x gagal (mis. koneksi HP sempat
        // putus sebentar) langsung dianggap error permanen & kartu
        // "Segera Hadir" muncul, padahal gambarnya sendiri ada di repo.
        // Sekarang dicoba ulang otomatis 1x (dengan cache-buster baru)
        // sebelum benar-benar ditandai gagal.
        if (!retried){
          retried = true;
          setTimeout(() => {
            const bust = (img.src.includes('?') ? '&' : '?') + 'retry=' + Date.now();
            img.src = img.getAttribute('src').split('?')[0] + bust;
          }, 900);
          return;
        }
        item.classList.remove('img-loading');
        item.classList.add('img-error');
      };
      if (img.complete && img.naturalWidth > 0) {
        markLoaded();
      } else {
        img.addEventListener('load', markLoaded);
        img.addEventListener('error', markError);
      }
    }

    // Tilt 3D lembut saat hover (desktop only, dimatikan jika reduced-motion)
    if (isFinePointer && !prefersReducedMotion) {
      item.addEventListener('mousemove', (e) => {
        const rect = item.getBoundingClientRect();
        const px = (e.clientX - rect.left) / rect.width - 0.5;
        const py = (e.clientY - rect.top) / rect.height - 0.5;
        item.style.transform = `perspective(700px) rotateX(${(-py * 6).toFixed(2)}deg) rotateY(${(px * 6).toFixed(2)}deg) scale(1.015)`;
      });
      item.addEventListener('mouseleave', () => {
        item.style.transform = '';
      });
    }

    item.addEventListener('click', () => {
      if (item.classList.contains('img-error')) return; // jangan buka lightbox jika gambar gagal
      const imgEl = item.querySelector('img');
      lightboxImg.src = imgEl.src;
      lightboxImg.alt = imgEl.alt;
      lightboxCaption.textContent = item.dataset.caption || '';
      lightbox.classList.add('active');
    });
  });
  lightboxClose.addEventListener('click', () => lightbox.classList.remove('active'));
  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) lightbox.classList.remove('active');
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') lightbox.classList.remove('active');
  });

  // Foto Penanggung Jawab — klik untuk lihat versi penuh di lightbox yang sama
  document.querySelectorAll('.pic-avatar').forEach(av => {
    av.addEventListener('click', () => {
      const imgEl = av.querySelector('img');
      if (!imgEl) return;
      lightboxImg.src = imgEl.src;
      lightboxImg.alt = imgEl.alt;
      lightboxCaption.textContent = imgEl.alt.replace(/^Foto\s+/i, '');
      lightbox.classList.add('active');
    });
  });



  /* ============ 11. BACK TO TOP ============ */
  backToTop.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  /* ============ 12. TOAST NOTIFICATION ============ */
  function showToast(message, type = 'success'){
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-check';
    toast.innerHTML = `<i class="fa-solid ${icon}"></i><span>${message}</span>`;
    document.getElementById('toastContainer').appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  /* =========================================================
     13. FORMULIR PENDAFTARAN — VALIDASI & HARGA OTOMATIS
  ========================================================= */
  const form = document.getElementById('regForm');
  const submitBtn = document.getElementById('submitBtn');
  const jumlahInput = document.getElementById('jumlah');
  const totalHargaEl = document.getElementById('totalHarga');
  const totalFeeNoteEl = document.getElementById('totalFeeNote');
  const jenisKemejaRadios = document.querySelectorAll('input[name="jenisKemeja"]');

  const requiredFields = form.querySelectorAll('[required]');

  // Biaya admin khusus untuk metode "Bayar 2x (Cicilan)". Metode
  // "Tunai/Lunas Langsung" TIDAK dikenakan biaya tambahan apapun.
  // Diletakkan sebagai satu konstanta supaya perhitungan total harga,
  // struk JPG, pesan WhatsApp, dan data yang tersimpan ke Firestore
  // selalu konsisten memakai angka yang sama.
  const ADMIN_FEE_CICILAN = 5000;

  function formatRupiah(angka){
    return 'Rp' + angka.toLocaleString('id-ID');
  }

  function getHargaSatuan(){
    const checked = form.querySelector('input[name="jenisKemeja"]:checked');
    return checked ? parseInt(checked.dataset.harga, 10) : 0;
  }

  function getMetodeBayar(){
    return form.querySelector('input[name="metodeBayar"]:checked')?.value || 'tunai';
  }

  function hitungTotal(){
    const harga = getHargaSatuan();
    const jumlah = parseInt(jumlahInput.value, 10) || 0;
    const subtotal = harga * jumlah;
    const isCicilan = getMetodeBayar() === 'cicilan';
    const biayaAdmin = isCicilan ? ADMIN_FEE_CICILAN : 0;
    const total = subtotal + biayaAdmin;

    totalHargaEl.textContent = formatRupiah(total);
    if (totalFeeNoteEl){
      totalFeeNoteEl.innerHTML = isCicilan
        ? `Termasuk Subtotal Kemeja ${formatRupiah(subtotal)} + Biaya Admin Cicilan <b>${formatRupiah(biayaAdmin)}</b>`
        : `Subtotal Kemeja ${formatRupiah(subtotal)} — <b>Tanpa Biaya Admin</b> (Tunai/Lunas)`;
    }
    return { harga, jumlah, subtotal, biayaAdmin, total };
  }

  jenisKemejaRadios.forEach(r => r.addEventListener('change', hitungTotal));
  jumlahInput.addEventListener('input', hitungTotal);
  hitungTotal();

  /* ---- Toggle opsi jumlah cicilan sesuai metode pembayaran ---- */
  const metodeBayarRadios = document.querySelectorAll('input[name="metodeBayar"]');
  const cicilanOptionWrap = document.getElementById('cicilanOptionWrap');
  metodeBayarRadios.forEach(r => {
    r.addEventListener('change', () => {
      const isCicilan = getMetodeBayar() === 'cicilan';
      cicilanOptionWrap.style.display = isCicilan ? 'block' : 'none';
      hitungTotal();
    });
  });

  function showFieldError(field, message){
    field.classList.add('invalid');
    const errorEl = field.closest('.form-group')?.querySelector('.error-msg');
    if (errorEl){
      errorEl.textContent = message;
      errorEl.classList.add('show');
    }
  }

  function clearFieldError(field){
    field.classList.remove('invalid');
    const errorEl = field.closest('.form-group')?.querySelector('.error-msg');
    if (errorEl){
      errorEl.textContent = '';
      errorEl.classList.remove('show');
    }
  }

  function validateField(field){
    if (field.type === 'radio') return true; // ditangani terpisah
    if (field.type === 'checkbox'){
      if (!field.checked){
        const errorEl = document.getElementById('konfirmasiError');
        errorEl.textContent = 'Anda harus menyetujui pernyataan ini.';
        errorEl.classList.add('show');
        return false;
      }
      document.getElementById('konfirmasiError').classList.remove('show');
      return true;
    }

    const value = field.value.trim();

    if (value === ''){
      showFieldError(field, 'Kolom ini wajib diisi.');
      return false;
    }
    if (field.id === 'nama' || field.id === 'namaBordir'){
      if (value.length < 3){
        showFieldError(field, 'Nama minimal 3 karakter.');
        return false;
      }
    }
    if (field.id === 'jumlah'){
      if (parseInt(value, 10) < 1){
        showFieldError(field, 'Jumlah minimal 1.');
        return false;
      }
    }
    clearFieldError(field);
    return true;
  }

  /* Normalisasi nomor WhatsApp: hanya angka, ubah awalan 0 -> 62 */
  function normalizeWhatsapp(raw){
    let d = String(raw || '').replace(/[^0-9]/g, '');
    if (d.startsWith('0')) d = '62' + d.slice(1);
    if (!d.startsWith('62') && d.length > 0) d = '62' + d;
    return d;
  }

  function validateJenisKemeja(){
    const checked = form.querySelector('input[name="jenisKemeja"]:checked');
    const errorEl = document.getElementById('jenisKemejaError');
    if (!checked){
      errorEl.textContent = 'Pilih salah satu jenis kemeja.';
      errorEl.classList.add('show');
      return false;
    }
    errorEl.classList.remove('show');
    return true;
  }

  function validateAll(){
    let valid = true;
    requiredFields.forEach(field => {
      if (field.type === 'radio') return;
      if (!validateField(field)) valid = false;
    });
    if (!validateJenisKemeja()) valid = false;
    return valid;
  }

  function checkFormCompletion(){
    // Tombol kirim aktif hanya jika seluruh kolom terisi & valid
    let complete = true;
    requiredFields.forEach(field => {
      if (field.type === 'radio') return;
      if (field.type === 'checkbox'){
        if (!field.checked) complete = false;
        return;
      }
      if (field.value.trim() === '') complete = false;
    });
    if (!form.querySelector('input[name="jenisKemeja"]:checked')) complete = false;
    submitBtn.disabled = !complete;
  }

  form.querySelectorAll('input, select, textarea').forEach(field => {
    field.addEventListener('input', () => { validateField(field); checkFormCompletion(); });
    field.addEventListener('change', () => { validateField(field); checkFormCompletion(); });
    field.addEventListener('blur', () => validateField(field));
  });
  checkFormCompletion();

  /* =========================================================
     13d. TAMPILKAN KARTU TRANSFER BANK HANYA SETELAH CHECKBOX
     "Saya menyatakan data yang saya isi sudah benar" DICENTANG.
     Kartu ditempatkan di HTML di bawah tombol "Kirim Pendaftaran"
     (lihat index.html), dan disembunyikan secara default —
     baru muncul begitu checkbox konfirmasi dicentang, dan
     tersembunyi lagi kalau centangnya dilepas.
  ========================================================= */
  const konfirmasiCheckbox = document.getElementById('konfirmasi');
  const bankTransferWrap = document.getElementById('bankTransferWrap');
  function toggleBankTransferCard(){
    if (!konfirmasiCheckbox || !bankTransferWrap) return;
    bankTransferWrap.style.display = konfirmasiCheckbox.checked ? '' : 'none';
  }
  konfirmasiCheckbox?.addEventListener('change', toggleBankTransferCard);
  toggleBankTransferCard();

  /* =========================================================
     14. SUBMIT FORM: STRUK JPG (UNDUH OTOMATIS) -> WHATSAPP -> POPUP
     (Perbaikan bug: sebelumnya kode mencoba membaca field
     'nik', 'departemen', 'jabatan', 'noHp', 'alamat' yang
     kolom HTML-nya belum tersedia, menyebabkan proses macet
     selamanya di layar "Memproses pendaftaran...". Sekarang
     seluruh kolom formulir tersedia dan sinkron dengan skrip.

     PENTING soal unduhan otomatis: agar browser TIDAK menampilkan
     dialog konfirmasi/izin apa pun, unduhan struk JPG dan pembukaan
     WhatsApp harus dipicu SECARA LANGSUNG (synchronous) di dalam
     event klik pengguna — bukan di dalam setTimeout/Promise. Itu
     sebabnya kedua aksi ini dijalankan lebih dulu, sebelum animasi
     "memproses..." yang sifatnya hanya tampilan/kosmetik. Jika
     browser pengguna diatur untuk selalu bertanya lokasi simpan file
     ("Ask where to save each file"), itu adalah preferensi bawaan
     browser yang tidak bisa dinonaktifkan oleh website manapun.)
  ========================================================= */
  const submitLoading = document.getElementById('submitLoading');
  const successModal = document.getElementById('successModal');
  const closeModal = document.getElementById('closeModal');

  closeModal.addEventListener('click', () => successModal.classList.remove('active'));
  successModal.addEventListener('click', (e) => {
    if (e.target === successModal) successModal.classList.remove('active');
  });

  form.addEventListener('submit', async function(e){
    e.preventDefault();

    if (!validateAll()){
      showToast('Mohon lengkapi data dengan benar.', 'error');
      const firstInvalid = form.querySelector('.invalid');
      if (firstInvalid) firstInvalid.scrollIntoView({ behavior:'smooth', block:'center' });
      return;
    }

    let data;
    try {
      data = collectFormData();
    } catch (err){
      showToast('Terjadi kesalahan, silakan coba lagi.', 'error');
      console.error('collectFormData error:', err);
      return;
    }

    submitBtn.disabled = true;
    submitLoading.classList.add('active');

    /* =====================================================
       PERBAIKAN BUG UTAMA (RACE CONDITION MOBILE):
       Sebelumnya WhatsApp dibuka (openWhatsApp) SEBELUM data
       sempat disimpan ke Firestore. Di HP, membuka wa.me
       membuat Android langsung berpindah ke aplikasi WhatsApp
       (app switch) — tab browser jadi background/dibekukan oleh
       sistem HANYA BEBERAPA MILIDETIK setelah tombol ditekan,
       sebelum permintaan simpan ke Firestore (butuh koneksi
       jaringan, makan waktu) sempat selesai. Akibatnya struk
       tetap berhasil diunduh & WhatsApp tetap terbuka, tapi
       datanya TIDAK PERNAH benar-benar tersimpan ke database.

       Sekarang urutannya dibalik: SIMPAN KE FIRESTORE DULU
       (selagi tab masih aktif & fokus), baru setelah itu unduh
       struk & buka WhatsApp. Ini menambah jeda singkat sebelum
       WhatsApp terbuka, tapi memastikan data benar-benar masuk
       database dulu.
    ===================================================== */
    const saveResult = await simpanPendaftaranPublik(data);
    if (saveResult.ok){
      loginAsMember({ nama: data.nama, kodeUnik: data.receiptNo, docId: saveResult.id });
    }

    let downloadOk = true;
    try {
      await generateStrukJPG(data);
    } catch (err){
      downloadOk = false;
      console.error('generateStrukJPG error:', err);
    }

    let waResult = { win: null, url: '' };
    try {
      waResult = openWhatsApp(data);
    } catch (err){
      console.error('openWhatsApp error:', err);
    }

    submitLoading.classList.remove('active');
    successModal.classList.add('active');
    submitBtn.disabled = false;
    if (window.lokonFireConfetti) window.lokonFireConfetti(); // efek meriah 2026 (particles.js), aman kalau file itu gagal dimuat

    const successModalText = document.getElementById('successModalText');
    const waFallbackLink = document.getElementById('waFallbackLink');
    // Kalau window.open gagal (mis. diblokir browser), tampilkan tombol
    // manual supaya pengguna tetap bisa membuka WhatsApp sendiri.
    if (waResult.url && (!waResult.win || waResult.win.closed)){
      waFallbackLink.href = waResult.url;
      waFallbackLink.style.display = 'inline-flex';
    } else {
      waFallbackLink.style.display = 'none';
    }

    if (saveResult.ok){
      successModalText.textContent = 'Data Anda sudah tersimpan otomatis di sistem. Struk sudah diunduh & pesan WhatsApp ke admin sudah disiapkan.';
      showToast('Pendaftaran tersimpan otomatis ke sistem!', 'success');
    } else {
      successModalText.textContent = 'Struk sudah diunduh & pesan WhatsApp ke admin sudah disiapkan, namun sinkronisasi otomatis ke database gagal — admin akan menginput manual dari pesan WhatsApp Anda.';
      showToast('Sinkronisasi otomatis ke database gagal. Struk & WhatsApp tetap terkirim ke admin sebagai cadangan.', 'error');
    }
    if (!downloadOk){
      showToast('Struk gagal diunduh, namun data pendaftaran sudah diproses.', 'error');
    }
  });

  function collectFormData(){
    const jenisChecked = form.querySelector('input[name="jenisKemeja"]:checked');
    const jenisLabel = jenisChecked.value === 'pendek' ? 'Lengan Pendek' : 'Lengan Panjang';
    const harga = parseInt(jenisChecked.dataset.harga, 10);
    const jumlah = parseInt(jumlahInput.value, 10);
    const subtotal = harga * jumlah;
    const metodeBayar = getMetodeBayar();
    const biayaAdmin = metodeBayar === 'cicilan' ? ADMIN_FEE_CICILAN : 0;
    const total = subtotal + biayaAdmin;

    const now = new Date();
    const tanggal = now.toLocaleDateString('id-ID', { day:'2-digit', month:'long', year:'numeric' });
    const jam = now.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' });

    const departemenSelect = document.getElementById('departemen');
    const departemenLabel = departemenSelect && departemenSelect.value
      ? (departemenSelect.options[departemenSelect.selectedIndex]?.text || departemenSelect.value)
      : '-';

    return {
      nama: document.getElementById('nama').value.trim(),
      namaBordir: document.getElementById('namaBordir').value.trim(),
      departemen: departemenLabel,
      gender: document.getElementById('gender').value,
      ukuranKemeja: document.getElementById('ukuranKemeja').value,
      jenis: jenisLabel,
      jumlah: jumlah,
      harga: harga,
      subtotal: subtotal,
      biayaAdmin: biayaAdmin,
      total: total,
      catatan: (document.getElementById('catatan')?.value || '').trim(),
      tanggal, jam,
      metodeBayar,
      // PERBAIKAN LOGIKA BARU: kode unik dibuat SEKALI di sini supaya
      // sama persis antara struk JPG, pesan WhatsApp ke admin, dan yang
      // nanti diketik ulang oleh admin saat menambahkan peserta ke
      // dasbor — tidak lagi memakai nomor WhatsApp peserta sama sekali.
      receiptNo: generateReceiptNo()
    };
  }

  /* =========================================================
     13b. SIMPAN OTOMATIS PENDAFTARAN PUBLIK KE FIRESTORE
     PERBAIKAN BUG UTAMA (root cause "belum bisa daftar"):
     Firestore Rules (lihat PANDUAN-FIREBASE.md / Firebase Console)
     SUDAH didesain sejak awal supaya pengunjung publik boleh
     "create" dokumen baru di koleksi "pendaftaran" — persis untuk
     menyimpan pendaftaran langsung dari formulir. Namun kode
     sebelumnya justru MENONAKTIFKAN penulisan ini sepenuhnya dan
     mengandalkan admin mengetik ULANG setiap pendaftaran secara
     manual dari pesan WhatsApp. Akibatnya peserta yang mengisi
     formulir TIDAK PERNAH benar-benar "terdaftar" di sistem sampai
     admin sempat menyalin datanya satu per satu — dan sebelum itu
     terjadi, peserta juga tidak bisa login pakai Kode Unik atau ikut
     chat grup, walau formulir sudah "berhasil" dikirim.

     Sekarang formulir menyimpan LANGSUNG ke Firestore begitu
     disubmit (selain tetap mengunduh struk & membuka WhatsApp
     sebagai notifikasi ke admin). Jika koneksi pengunjung
     bermasalah, penyimpanan otomatis ini boleh gagal dengan aman —
     data tetap sudah terkirim ke admin lewat WhatsApp + struk.
     (Fungsi simpanPesertaAdmin di bawah masih ada di kode untuk
     jaga-jaga, tapi tombol "Tambah Peserta" manual di Dasbor untuk
     sementara dilepas — Dasbor sekarang hanya menyediakan Edit &
     Hapus, karena jalur utama pendaftaran sudah otomatis.)
  ========================================================= */
  // PERBAIKAN LOGIKA DANA TERKUMPUL: sebelumnya, saat admin menandai
  // "DP Terbayar", jumlah yang dicatat sebagai totalDibayar mengambil
  // begitu saja nilai pembayaran.dpMinimal yang tersimpan di data peserta.
  // Kalau data peserta itu tersimpan dari versi form yang lebih lama
  // (atau field dpMinimal-nya sempat salah/ tidak lengkap), angka yang
  // sudah telanjur salah itu ikut terbawa terus dan Dana Terkumpul di
  // dasbor jadi lebih kecil dari yang seharusnya — misalnya kemeja
  // Lengan Pendek Rp155.000 dengan cicilan seharusnya DP = 50% x
  // Rp155.000 + Rp5.000 admin = Rp82.500, tapi yang tercatat cuma
  // Rp77.500 (biaya admin Rp5.000-nya hilang/tidak ikut terhitung).
  // Fungsi ini SELALU menghitung ulang DP yang seharusnya langsung dari
  // harga kemeja peserta saat itu juga, jadi hasilnya konsisten dan
  // benar walau data lama peserta belum tentu akurat.
  function hitungDPSeharusnya(p){
    const subtotal = (typeof p.subtotal === 'number' && !isNaN(p.subtotal))
      ? p.subtotal
      : (p.harga || 0) * (p.jumlah || 1);
    const isCicilan = p.pembayaran?.metode === 'cicilan';
    const fee = isCicilan ? (p.pembayaran?.biayaAdmin || ADMIN_FEE_CICILAN) : 0;
    const dpProduk = isCicilan ? Math.round(subtotal * 0.5) : subtotal;
    return dpProduk + fee;
  }

  function buildPembayaranAwal(subtotal, metodeBayar, biayaAdmin){
    const isCicilan = metodeBayar === 'cicilan';
    const fee = isCicilan ? (biayaAdmin || 0) : 0;
    // DP minimal dihitung dari harga kemeja (subtotal) saja, lalu biaya
    // admin cicilan ditambahkan ke pembayaran pertama (dibayar di muka
    // sekali, tidak diulang di cicilan ke-2).
    const dpProduk = isCicilan ? Math.round(subtotal * 0.5) : subtotal;
    const dpMinimal = dpProduk + fee;
    const rencanaCicilan = [];
    if (isCicilan){
      const sisaSetelahDp = subtotal - dpProduk;
      rencanaCicilan.push({ ke: 1, nominal: sisaSetelahDp, dibayar: false, tanggalBayar: null });
    }
    return {
      metode: metodeBayar,
      biayaAdmin: fee,
      dpMinimal,
      dpDibayar: false,
      cicilan: rencanaCicilan,
      totalDibayar: 0,
      status: 'belum_dp' // belum_dp | dp | cicilan | lunas
    };
  }

  function withTimeout(promise, ms, timeoutValue){
    return Promise.race([
      promise,
      new Promise(resolve => setTimeout(() => resolve(timeoutValue), ms))
    ]);
  }

  async function simpanPendaftaranPublik(data){
    const fb = await waitForFirebase(6000);
    if (!fb){
      console.warn('Auto-simpan pendaftaran gagal: Firebase belum siap/tersambung.');
      return { ok:false, reason:'offline' };
    }
    const payload = {
      kodeUnik: (data.receiptNo || '').toUpperCase(),
      nama: data.nama,
      namaBordir: data.namaBordir || data.nama,
      whatsapp: '',
      departemen: data.departemen,
      gender: data.gender,
      ukuranKemeja: data.ukuranKemeja,
      jenis: data.jenis,
      jumlah: data.jumlah,
      subtotal: data.subtotal,
      total: data.total,
      catatan: data.catatan || '-',
      createdAtLabel: new Date().toLocaleDateString('id-ID', { day:'2-digit', month:'long', year:'numeric' }),
      timestamp: fb.serverTimestamp(),
      pembayaran: buildPembayaranAwal(data.subtotal, data.metodeBayar, data.biayaAdmin)
    };
    try {
      // Batas waktu 7 detik supaya kalau koneksi macet total, pengguna
      // tidak terjebak menunggu selamanya sebelum bisa lanjut ke
      // unduhan struk & WhatsApp.
      const result = await withTimeout(
        fb.addDoc(fb.collection(fb.db, fb.FIRESTORE_COLLECTION), payload).then(docRef => ({ ok:true, id: docRef.id })),
        7000,
        { ok:false, reason:'timeout' }
      );
      if (!result.ok) console.warn('Auto-simpan pendaftaran timeout (>7s).');
      return result;
    } catch (err){
      console.warn('Auto-simpan pendaftaran gagal:', err.code, err.message);
      return { ok:false, reason: err.code || 'error', err };
    }
  }

  /* ============ 15. GENERATE STRUK JPG (CANVAS) ============ */
  /* ---------- Pastikan font kanvas benar-benar termuat ----------
     PERBAIKAN BUG TERSEMBUNYI: sebelumnya struk langsung digambar
     tanpa menunggu font Outfit/Inter/JetBrains Mono selesai dimuat
     browser. Kalau struknya dibuat sebelum font siap (mis. koneksi
     lambat), canvas diam-diam jatuh ke font default sistem (Arial/
     Times) tanpa ada tanda error apa pun — hasil unduhan jadi terlihat
     "murahan" walau kodenya sudah benar. Sekarang digambar HANYA
     setelah font dipastikan siap. */
  async function ensureStrukFontsLoaded(){
    const specs = [
      '700 16px Outfit', '800 16px Outfit',
      '400 16px Inter', '500 16px Inter', '700 16px Inter',
      '400 16px "JetBrains Mono"', '500 16px "JetBrains Mono"',
      '600 16px "JetBrains Mono"', '700 16px "JetBrains Mono"', '800 16px "JetBrains Mono"'
    ];
    try {
      await Promise.all(specs.map(f => document.fonts.load(f)));
      await document.fonts.ready;
    } catch (err){
      console.warn('Pemuatan font struk gagal, memakai font fallback:', err);
    }
  }

  async function generateStrukJPG(data){
    await ensureStrukFontsLoaded();
    const canvasEl = document.getElementById('strukCanvas');
    const isCicilan = data.metodeBayar === 'cicilan';
    const subtotalProduk = (data.subtotal !== undefined && data.subtotal !== null) ? data.subtotal : data.harga * data.jumlah;
    const biayaAdminStruk = isCicilan ? (data.biayaAdmin || 5000) : 0;

    // Data dikelompokkan jadi 2 bagian supaya lebih mudah dipindai mata,
    // bukan satu daftar panjang tak berujung seperti sebelumnya.
    const pesananRows = [
      ['Jenis Kemeja', data.jenis],
      ['Jumlah', String(data.jumlah)],
      ['Harga Satuan', formatRupiah(data.harga)],
      ['Metode Bayar', isCicilan ? '2x Cicilan' : 'Tunai / Lunas'],
    ];
    if (isCicilan){
      pesananRows.push(['Subtotal Kemeja', formatRupiah(subtotalProduk)]);
      pesananRows.push(['Biaya Admin Cicilan', '+ ' + formatRupiah(biayaAdminStruk)]);
    }
    const sections = [
      { title: 'DATA PESERTA', rows: [
        ['Nama', data.nama],
        ['Nama Bordir', data.namaBordir],
        ['Departemen', data.departemen],
        ['Jenis Kelamin', data.gender],
        ['Ukuran', data.ukuranKemeja],
      ]},
      { title: 'RINCIAN PESANAN', rows: pesananRows }
    ];
    const totalRowCount = sections.reduce((n, s) => n + s.rows.length, 0);
    const SECTION_HEAD_H = 28;

    // Down payment (dibayar sekarang) vs sisa pelunasan — hanya relevan
    // untuk metode cicilan. Dihitung ulang di sini pakai rumus yang sama
    // persis dengan buildPembayaranAwal() supaya angkanya konsisten.
    const dpProduk = isCicilan ? Math.round(subtotalProduk * 0.5) : subtotalProduk;
    const dpSekarang = dpProduk + biayaAdminStruk;
    const sisaPelunasan = subtotalProduk - dpProduk;

    // Dynamic canvas height based on content
    const HEADER_H = 210;
    const baseHeight = 800 + 126 + (isCicilan ? 110 : 0);
    const extraPerRow = 34;
    const catatanLines = Math.ceil((data.catatan || '-').length / 50) || 1;
    const neededHeight = baseHeight + totalRowCount * extraPerRow + sections.length * SECTION_HEAD_H + catatanLines * 18;
    const W = 700;
    const H = Math.max(1020, neededHeight);
    canvasEl.width = W;
    canvasEl.height = H;

    const ctx = canvasEl.getContext('2d');
    const PAD = 46;

    /* ---------- Palette ---------- */
    const C = {
      navyDeep:'#071022', navy:'#0B2545', aqua:'#12A9E0', aquaDeep:'#0A84C4',
      teal:'#0FD8B8', tealDeep:'#0BB89C', foam:'#F2FAFC', ink:'#0A1826',
      inkSoft:'#5A7186', line:'#E6F1F6', white:'#FFFFFF'
    };
    const receiptNo = data.receiptNo || generateReceiptNo();

    /* ---------- Base background + subtle dot texture ---------- */
    ctx.fillStyle = C.white;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(11,37,69,0.035)';
    for (let gy = HEADER_H + 60; gy < H - 40; gy += 22){
      for (let gx = 30; gx < W - 30; gx += 22){
        ctx.beginPath();
        ctx.arc(gx, gy, 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    /* ---------- Header (gradient + wave) ---------- */
    const headerGrad = ctx.createLinearGradient(0, 0, W, HEADER_H);
    headerGrad.addColorStop(0, C.navyDeep);
    headerGrad.addColorStop(0.55, C.aquaDeep);
    headerGrad.addColorStop(1, C.teal);
    ctx.fillStyle = headerGrad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(W, 0);
    ctx.lineTo(W, HEADER_H - 26);
    ctx.quadraticCurveTo(W * 0.75, HEADER_H + 18, W * 0.5, HEADER_H - 10);
    ctx.quadraticCurveTo(W * 0.25, HEADER_H - 38, 0, HEADER_H - 8);
    ctx.closePath();
    ctx.fill();

    // Droplet logo mark
    drawDroplet(ctx, W/2, 50, 15, 'rgba(255,255,255,0.95)');

    ctx.textAlign = 'center';
    ctx.fillStyle = C.white;
    ctx.font = '700 26px Outfit, Poppins, sans-serif';
    ctx.fillText('PT. LOKON PRIMA', W/2, 96);
    ctx.font = '400 13.5px Inter, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.fillText('Distributor Air Kemasan AQUA', W/2, 118);

    // Eyebrow pill badge
    const badgeText = 'STRUK PENDAFTARAN KEMEJA KERJA';
    ctx.font = '600 11.5px "JetBrains Mono", monospace';
    const badgeW = ctx.measureText(badgeText).width + 34;
    const badgeX = W/2 - badgeW/2, badgeY = 136, badgeH = 28;
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    roundRect(ctx, badgeX, badgeY, badgeW, badgeH, badgeH/2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    roundRect(ctx, badgeX, badgeY, badgeW, badgeH, badgeH/2);
    ctx.stroke();
    ctx.fillStyle = C.white;
    ctx.fillText(badgeText, W/2, badgeY + 18.5);

    /* ---------- Floating meta card (overlaps wave) ---------- */
    let y = HEADER_H + 26;
    const cardX = PAD, cardW = W - PAD * 2;
    ctx.save();
    ctx.shadowColor = 'rgba(11,37,69,0.16)';
    ctx.shadowBlur = 26;
    ctx.shadowOffsetY = 10;
    ctx.fillStyle = C.white;
    roundRect(ctx, cardX, y, cardW, 92, 18);
    ctx.fill();
    ctx.restore();

    // No. Struk (left) + status pill (right)
    ctx.textAlign = 'left';
    ctx.font = '500 11px "JetBrains Mono", monospace';
    ctx.fillStyle = C.inkSoft;
    ctx.fillText('NO. STRUK', cardX + 26, y + 30);
    ctx.font = '700 16px "JetBrains Mono", monospace';
    ctx.fillStyle = C.ink;
    ctx.fillText(receiptNo, cardX + 26, y + 52);

    const pillText = 'BERHASIL';
    ctx.font = '700 11.5px Inter, sans-serif';
    const pillW = ctx.measureText(pillText).width + 38;
    const pillX = cardX + cardW - 26 - pillW, pillY = y + 20;
    const pillGrad = ctx.createLinearGradient(pillX, 0, pillX + pillW, 0);
    pillGrad.addColorStop(0, C.teal); pillGrad.addColorStop(1, C.tealDeep);
    ctx.fillStyle = pillGrad;
    roundRect(ctx, pillX, pillY, pillW, 26, 13);
    ctx.fill();
    ctx.fillStyle = '#04241D';
    ctx.textAlign = 'center';
    ctx.font = '700 11px Inter, sans-serif';
    ctx.fillText('✔ ' + pillText, pillX + pillW/2, pillY + 17);

    // divider inside card
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(cardX + 24, y + 66); ctx.lineTo(cardX + cardW - 24, y + 66); ctx.stroke();

    ctx.textAlign = 'left';
    ctx.font = '500 12.5px Inter, sans-serif';
    ctx.fillStyle = C.inkSoft;
    ctx.fillText(`${data.tanggal}  •  ${data.jam} WIB`, cardX + 26, y + 84);

    y += 92 + 40;

    /* ---------- Detail Pendaftaran (dikelompokkan 2 bagian) ---------- */
    const rowH = extraPerRow;
    const detailTop = y;
    const cardInnerH = totalRowCount * rowH + sections.length * SECTION_HEAD_H + 16;
    ctx.save();
    ctx.shadowColor = 'rgba(11,37,69,0.08)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = C.foam;
    roundRect(ctx, cardX, detailTop, cardW, cardInnerH, 16);
    ctx.fill();
    ctx.restore();

    y += 8;
    sections.forEach((section) => {
      ctx.font = '700 11px "JetBrains Mono", monospace';
      ctx.fillStyle = C.aquaDeep;
      ctx.textAlign = 'left';
      ctx.fillText(section.title, cardX + 22, y + 14);
      y += SECTION_HEAD_H;

      section.rows.forEach(([label, value], i) => {
        const rowY = y + rowH/2 + 2;
        if (i % 2 === 1){
          ctx.fillStyle = 'rgba(11,37,69,0.025)';
          ctx.fillRect(cardX + 6, y, cardW - 12, rowH);
        }
        ctx.font = '500 13.5px Inter, sans-serif';
        ctx.fillStyle = C.inkSoft;
        ctx.textAlign = 'left';
        ctx.fillText(label, cardX + 26, rowY);
        ctx.font = '700 13.5px Inter, sans-serif';
        ctx.fillStyle = C.ink;
        ctx.textAlign = 'right';
        ctx.fillText(value || '-', cardX + cardW - 26, rowY);
        y += rowH;
      });
    });
    ctx.textAlign = 'left';
    y = detailTop + cardInnerH + 36;

    /* ---------- Total pembayaran ---------- */
    const totalH = 78;
    const totalGrad = ctx.createLinearGradient(cardX, 0, cardX + cardW, 0);
    totalGrad.addColorStop(0, C.aqua);
    totalGrad.addColorStop(1, C.teal);
    ctx.save();
    ctx.shadowColor = 'rgba(18,169,224,0.3)';
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 8;
    ctx.fillStyle = totalGrad;
    roundRect(ctx, cardX, y, cardW, totalH, 18);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = '#04213A';
    ctx.font = '600 12.5px "JetBrains Mono", monospace';
    ctx.fillText('TOTAL PEMBAYARAN', cardX + 26, y + 30);
    ctx.font = '400 12px Inter, sans-serif';
    ctx.fillStyle = 'rgba(4,33,58,0.72)';
    const totalSubLabel = isCicilan
      ? `${data.jumlah} pcs × ${formatRupiah(data.harga)}  +  Admin ${formatRupiah(biayaAdminStruk)}`
      : `${data.jumlah} pcs  ×  ${formatRupiah(data.harga)}`;
    ctx.fillText(totalSubLabel, cardX + 26, y + 52);
    ctx.textAlign = 'right';
    ctx.font = '800 26px Outfit, sans-serif';
    ctx.fillStyle = '#04213A';
    ctx.fillText(formatRupiah(data.total), cardX + cardW - 26, y + 48);
    ctx.textAlign = 'left';
    y += totalH + (isCicilan ? 20 : 38);

    /* ---------- Bayar Sekarang vs Sisa Pelunasan (khusus cicilan) ----------
       Sebelumnya struk cicilan hanya menampilkan TOTAL gabungan, padahal
       yang sebenarnya perlu dibayar SAAT INI cuma sebagian (DP + admin).
       Kotak ini membuat itu eksplisit supaya peserta tidak bingung /
       tidak membayar penuh di awal secara keliru. */
    if (isCicilan){
      const dpBoxH = 84;
      ctx.save();
      ctx.shadowColor = 'rgba(11,37,69,0.1)';
      ctx.shadowBlur = 18;
      ctx.shadowOffsetY = 6;
      ctx.fillStyle = C.navy;
      roundRect(ctx, cardX, y, cardW, dpBoxH, 16);
      ctx.fill();
      ctx.restore();

      const halfW = cardW / 2;
      // Garis pemisah vertikal
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cardX + halfW, y + 14); ctx.lineTo(cardX + halfW, y + dpBoxH - 14); ctx.stroke();

      ctx.textAlign = 'center';
      ctx.font = '700 10.5px "JetBrains Mono", monospace';
      ctx.fillStyle = C.teal;
      ctx.fillText('BAYAR SEKARANG', cardX + halfW/2, y + 24);
      ctx.font = '800 21px Outfit, sans-serif';
      ctx.fillStyle = C.white;
      ctx.fillText(formatRupiah(dpSekarang), cardX + halfW/2, y + 50);
      ctx.font = '400 10.5px Inter, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillText('DP 50% + Admin', cardX + halfW/2, y + 68);

      ctx.font = '700 10.5px "JetBrains Mono", monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText('SISA PELUNASAN', cardX + halfW + halfW/2, y + 24);
      ctx.font = '800 21px Outfit, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText(formatRupiah(sisaPelunasan), cardX + halfW + halfW/2, y + 50);
      ctx.font = '400 10.5px Inter, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillText('Saat kemeja diambil', cardX + halfW + halfW/2, y + 68);

      ctx.textAlign = 'left';
      y += dpBoxH + 30;
    }

    /* ---------- Transfer Bank (rekening resmi panitia) ----------
       Ditambahkan supaya peserta langsung tahu ke mana harus transfer
       tanpa perlu bertanya ke panitia — konsisten dengan kartu di
       formulir pendaftaran & modal "Bayar Sekarang" di website. */
    const bankBoxH = 96;
    ctx.save();
    ctx.shadowColor = 'rgba(11,37,69,0.1)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
    const bankGrad = ctx.createLinearGradient(cardX, 0, cardX + cardW, 0);
    bankGrad.addColorStop(0, C.navyDeep);
    bankGrad.addColorStop(1, C.navy);
    ctx.fillStyle = bankGrad;
    roundRect(ctx, cardX, y, cardW, bankBoxH, 16);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = C.teal;
    roundRect(ctx, cardX, y, 5, bankBoxH, 3);
    ctx.fill();

    ctx.textAlign = 'left';
    ctx.font = '700 11px "JetBrains Mono", monospace';
    ctx.fillStyle = C.teal;
    ctx.fillText('TRANSFER PEMBAYARAN KE REKENING', cardX + 26, y + 24);
    ctx.font = '800 20px Outfit, sans-serif';
    ctx.fillStyle = C.white;
    ctx.fillText('BCA  0830142452', cardX + 26, y + 52);
    ctx.font = '500 12.5px Inter, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText('a.n. KAMIL MUHAMAD NUR', cardX + 26, y + 74);
    ctx.textAlign = 'right';
    ctx.font = '400 11px Inter, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    wrapText(ctx, 'Kirim bukti transfer ke WhatsApp panitia', cardX + cardW - 26, y + 40, 150, 15);
    ctx.textAlign = 'left';
    y += bankBoxH + 30;

    /* ---------- Catatan ---------- */
    ctx.font = '700 12px "JetBrains Mono", monospace';
    ctx.fillStyle = C.aquaDeep;
    ctx.fillText('CATATAN', cardX + 4, y);
    y += 20;

    ctx.font = '400 13px Inter, sans-serif';
    ctx.fillStyle = C.ink;
    const catatanEndY = wrapText(ctx, data.catatan || '-', cardX + 20, y + 16, cardW - 40, 19);
    const catatanBoxH = (catatanEndY - y) + 34;
    ctx.save();
    ctx.fillStyle = C.foam;
    roundRect(ctx, cardX, y - 4, cardW, catatanBoxH, 14);
    ctx.fill();
    ctx.fillStyle = C.teal;
    ctx.fillRect(cardX, y - 4, 5, catatanBoxH);
    ctx.restore();
    ctx.font = '400 13px Inter, sans-serif';
    ctx.fillStyle = C.ink;
    wrapText(ctx, data.catatan || '-', cardX + 22, y + 16, cardW - 44, 19);
    y += catatanBoxH + 30;

    /* ---------- Ticket perforation divider ---------- */
    drawPerforation(ctx, cardX, y, cardW);
    y += 40;

    /* ---------- KODE UNIK — kotak sorotan (menggantikan placeholder QR
       yang sebelumnya tidak fungsional). Kode ini sekarang punya fungsi
       nyata: dipakai peserta untuk cek status pendaftaran di website
       setelah admin memverifikasi & menginput datanya ke dasbor. ---------- */
    const codeBoxH = 108;
    ctx.save();
    ctx.shadowColor = 'rgba(18,169,224,0.28)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 8;
    const codeGrad = ctx.createLinearGradient(cardX, 0, cardX + cardW, 0);
    codeGrad.addColorStop(0, C.navy);
    codeGrad.addColorStop(1, '#0F3A63');
    ctx.fillStyle = codeGrad;
    roundRect(ctx, cardX, y, cardW, codeBoxH, 18);
    ctx.fill();
    ctx.restore();
    // aksen garis gradasi brand di tepi atas kotak
    ctx.fillStyle = C.teal;
    roundRect(ctx, cardX, y, cardW, 5, 3);
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.font = '700 11px "JetBrains Mono", monospace';
    ctx.fillText('KODE UNIK ANDA — SIMPAN BAIK-BAIK', W/2, y + 28);
    ctx.fillStyle = C.white;
    ctx.font = '800 27px "JetBrains Mono", monospace';
    ctx.fillText(receiptNo, W/2, y + 62);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '400 11px Inter, sans-serif';
    ctx.fillText('Dipakai untuk cek status pembayaran lewat menu profil di website', W/2, y + 86);
    y += codeBoxH + 34;

    /* ---------- Status + contact ---------- */
    ctx.fillStyle = C.tealDeep;
    ctx.font = '700 15px Inter, sans-serif';
    ctx.fillText('✔ PENDAFTARAN BERHASIL DIPROSES', W/2, y);
    y += 24;
    ctx.fillStyle = C.inkSoft;
    ctx.font = '400 12px Inter, sans-serif';
    ctx.fillText('WhatsApp Perusahaan: +62 856-9732-1423', W/2, y);
    y += 30;

    /* ---------- Developer credit line ---------- */
    ctx.fillStyle = 'rgba(10,24,38,0.38)';
    ctx.font = '500 10.5px "JetBrains Mono", monospace';
    ctx.fillText('Website ini dibuat dan dikembangkan oleh benyoriki.com', W/2, y);
    y += 26;

    /* ---------- Bottom brand strip ---------- */
    const stripGrad = ctx.createLinearGradient(0, 0, W, 0);
    stripGrad.addColorStop(0, C.navy);
    stripGrad.addColorStop(0.5, C.aquaDeep);
    stripGrad.addColorStop(1, C.teal);
    ctx.fillStyle = stripGrad;
    ctx.fillRect(0, H - 10, W, 10);

    ctx.textAlign = 'left';

    // Trigger download — anchor dipasang ke DOM dulu agar unduhan
    // berjalan konsisten di semua browser (termasuk beberapa browser
    // Android) tanpa memunculkan dialog konfirmasi apa pun.
    const link = document.createElement('a');
    link.download = `STRUK_${receiptNo}.jpg`;
    link.href = canvasEl.toDataURL('image/jpeg', 0.95);
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function generateReceiptNo(){
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const datePart = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}`;
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `LP-${datePart}-${rand}`;
  }

  function drawDroplet(ctx, cx, cy, size, color){
    ctx.save();
    ctx.translate(cx, cy);
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.bezierCurveTo(size * 0.95, -size * 0.05, size * 0.75, size * 0.95, 0, size);
    ctx.bezierCurveTo(-size * 0.75, size * 0.95, -size * 0.95, -size * 0.05, 0, -size);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }

  function drawScanCorners(ctx, x, y, size, cornerLen, color){
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    const corners = [
      [[x, y + cornerLen], [x, y], [x + cornerLen, y]],
      [[x + size - cornerLen, y], [x + size, y], [x + size, y + cornerLen]],
      [[x, y + size - cornerLen], [x, y + size], [x + cornerLen, y + size]],
      [[x + size - cornerLen, y + size], [x + size, y + size], [x + size, y + size - cornerLen]]
    ];
    corners.forEach(pts => {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      ctx.lineTo(pts[1][0], pts[1][1]);
      ctx.lineTo(pts[2][0], pts[2][1]);
      ctx.stroke();
    });
    ctx.restore();
  }

  function drawPerforation(ctx, x, y, w){
    ctx.save();
    // Tear notches at both ends
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + w, y, 9, 0, Math.PI * 2); ctx.fill();
    // Dashed line
    ctx.strokeStyle = '#CFE6EF';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([6, 7]);
    ctx.beginPath();
    ctx.moveTo(x + 14, y);
    ctx.lineTo(x + w - 14, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function wrapText(ctx, text, x, y, maxWidth, lineHeight){
    const words = String(text).split(' ');
    let line = '';
    let currentY = y;
    for (let n = 0; n < words.length; n++){
      const testLine = line + words[n] + ' ';
      if (ctx.measureText(testLine).width > maxWidth && n > 0){
        ctx.fillText(line, x, currentY);
        line = words[n] + ' ';
        currentY += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, x, currentY);
    return currentY;
  }

  function roundRect(ctx, x, y, w, h, r){
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* ============ 16. BUKA WHATSAPP DENGAN PESAN OTOMATIS ============ */
  function openWhatsApp(data){
    const isCicilan = data.metodeBayar === 'cicilan';
    const subtotalProduk = (data.subtotal !== undefined && data.subtotal !== null) ? data.subtotal : data.harga * data.jumlah;
    const biayaAdminWa = isCicilan ? (data.biayaAdmin || 5000) : 0;
    const rincianBiaya = isCicilan
      ? `Subtotal Kemeja : ${formatRupiah(subtotalProduk)}\nBiaya Admin Cicilan : ${formatRupiah(biayaAdminWa)}\n`
      : '';
    const pesan =
`================================
PENDAFTARAN KEMEJA KERJA
PT. LOKON PRIMA
================================
Kode Unik : ${data.receiptNo}
Nama : ${data.nama}
Nama Bordir : ${data.namaBordir}
Departemen : ${data.departemen}
Ukuran : ${data.ukuranKemeja}
Jenis : ${data.jenis}
Jumlah : ${data.jumlah}
Harga : ${formatRupiah(data.harga)}
${rincianBiaya}Total : ${formatRupiah(data.total)}
Metode Bayar : ${isCicilan ? '2x Cicilan (DP 50% Kemeja + Rp5.000 Admin, lalu Pelunasan 50%)' : 'Tunai / Lunas Langsung (Tanpa Biaya Admin)'}
Catatan : ${data.catatan}
--------------------------------
Transfer ke : BCA 0830142452 a.n. KAMIL MUHAMAD NUR
================================
Mohon konfirmasi & input ke Dasbor Admin ya. Bukti transfer menyusul di chat ini. Terima kasih.`;

    const nomorTujuan = '6285697321423';
    const url = `https://wa.me/${nomorTujuan}?text=${encodeURIComponent(pesan)}`;
    const win = window.open(url, '_blank');
    return { win, url };
  }

  /* ============ 17. FOOTER YEAR ============ */
  document.getElementById('year').textContent = new Date().getFullYear();

  /* =========================================================
     18. PESERTA TERDAFTAR — LIVE FEED (FIRESTORE onSnapshot)
  ========================================================= */
  const pesertaGrid = document.getElementById('pesertaGrid');
  const pesertaEmpty = document.getElementById('pesertaEmpty');
  const pesertaOffline = document.getElementById('pesertaOffline');
  const pesertaScrollHint = document.getElementById('pesertaScrollHint');
  const pesertaSearch = document.getElementById('pesertaSearch');
  const pesertaFilters = document.getElementById('pesertaFilters');
  const lunasShowcase = document.getElementById('lunasShowcase');
  const lunasShowcaseTrack = document.getElementById('lunasShowcaseTrack');
  const lunasShowcaseHint = document.getElementById('lunasShowcaseHint');
  const lunasMarqueeWrap = document.getElementById('lunasMarqueeWrap');
  const lunasMarqueeTrack = document.getElementById('lunasMarqueeTrack');
  const statTotal = document.getElementById('statTotal');
  const statMenunggu = document.getElementById('statMenunggu');
  const statCicilan = document.getElementById('statCicilan');
  const statLunas = document.getElementById('statLunas');

  let pesertaData = [];      // seluruh dokumen dari Firestore
  let currentFilter = 'semua';
  let currentSearch = '';
  let statsAnimated = false;

  const STATUS_LABEL = {
    belum_dp: { label:'Menunggu DP', cls:'badge-warn', icon:'fa-hourglass-half' },
    dp:       { label:'DP Terbayar', cls:'badge-info', icon:'fa-hand-holding-dollar' },
    cicilan:  { label:'Cicilan 2x Berjalan', cls:'badge-info', icon:'fa-coins' },
    lunas:    { label:'Lunas', cls:'badge-success', icon:'fa-crown' }
  };

  function initialsOf(nama){
    return String(nama || '?').trim().split(/\s+/).slice(0,2).map(w => w[0]?.toUpperCase() || '').join('');
  }

  function animateStatNumber(el, target){
    const duration = 900;
    const start = performance.now();
    const from = parseInt(el.textContent, 10) || 0;
    function step(now){
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(from + (target - from) * eased);
      if (progress < 1) requestAnimationFrame(step);
      else el.textContent = target;
    }
    requestAnimationFrame(step);
  }

  function renderPeserta(){
    let list = pesertaData.slice();

    if (currentFilter !== 'semua'){
      list = list.filter(p => (p.pembayaran?.status || 'belum_dp') === currentFilter);
    }
    if (currentSearch.trim() !== ''){
      const q = currentSearch.trim().toLowerCase();
      list = list.filter(p => (p.nama || '').toLowerCase().includes(q) || (p.departemen || '').toLowerCase().includes(q));
    }

    // Statistik dihitung dari SELURUH data (bukan hasil filter)
    const total = pesertaData.length;
    const menunggu = pesertaData.filter(p => (p.pembayaran?.status || 'belum_dp') === 'belum_dp').length;
    const cicilanJalan = pesertaData.filter(p => ['dp','cicilan'].includes(p.pembayaran?.status)).length;
    const lunas = pesertaData.filter(p => p.pembayaran?.status === 'lunas').length;
    animateStatNumber(statTotal, total);
    animateStatNumber(statMenunggu, menunggu);
    animateStatNumber(statCicilan, cicilanJalan);
    animateStatNumber(statLunas, lunas);

    // PISAHKAN peserta "Sudah Lunas" ke showcase khususnya sendiri (kotak
    // terpisah total, scroll horizontal sendiri — lihat renderLunasShowcase).
    // Dulu keduanya berbagi SATU kotak scroll vertikal yang sama, jadi kalau
    // peserta Lunas sedang banyak, "Peserta Lainnya" jadi harus digeser jauh
    // ke bawah dulu untuk kelihatan — sekarang dua-duanya selalu langsung
    // terlihat, tidak saling menutupi berapa pun jumlah masing-masing.
    const lunasList = list.filter(p => p.pembayaran?.status === 'lunas');
    // Kalau tab yang aktif memang "Lunas", semuanya sudah tampil di showcase,
    // jadi kotak daftar biasa di bawah tidak perlu menduplikasi menampilkannya.
    const othersList = currentFilter === 'lunas' ? [] : list.filter(p => p.pembayaran?.status !== 'lunas');

    renderLunasShowcase(lunasList);
    renderLunasMarquee(lunasList);

    pesertaGrid.innerHTML = '';
    if (othersList.length === 0){
      if (currentFilter === 'lunas'){
        pesertaEmpty.innerHTML = lunasList.length > 0
          ? '<i class="fa-solid fa-trophy"></i> Semua peserta Lunas tampil di showcase spesial di atas ⬆️'
          : '<i class="fa-solid fa-inbox"></i> Belum ada peserta pada kategori ini.';
      } else if (currentFilter === 'semua' && lunasList.length > 0){
        pesertaEmpty.innerHTML = '<i class="fa-solid fa-trophy"></i> Semua peserta yang terdaftar sudah Lunas! Lihat showcase di atas 🎉';
      } else {
        pesertaEmpty.innerHTML = '<i class="fa-solid fa-inbox"></i> Belum ada peserta pada kategori ini.';
      }
      pesertaEmpty.style.display = 'block';
    } else {
      pesertaEmpty.style.display = 'none';
    }
    if (pesertaScrollHint) pesertaScrollHint.style.display = othersList.length > 8 ? 'flex' : 'none';

    // PERBAIKAN TAMPILAN: dulu tiap peserta jadi kartu besar penuh detail —
    // begitu peserta banyak, halaman jadi panjang & berantakan. Sekarang
    // tiap peserta cuma satu baris ringkas (avatar + nama + status), detail
    // lengkapnya baru muncul di modal saat baris itu diklik/diketuk. List
    // dibatasi tinggi (lihat .peserta-list-wrap di CSS, ~8 baris terlihat)
    // dan digeser (scroll) di dalam kotaknya sendiri, supaya halaman tidak
    // ikut memanjang ke bawah walau peserta yang mendaftar makin banyak.
    const rows = [];
    othersList.forEach((p, i) => {
      const status = p.pembayaran?.status || 'belum_dp';
      const info = STATUS_LABEL[status] || STATUS_LABEL.belum_dp;
      const isBaru = p._ms && (Date.now() - p._ms) < (1000 * 60 * 60 * 24); // < 24 jam sejak daftar
      // "Diperbarui Admin": muncul 24 jam sejak TERAKHIR admin ubah data
      // peserta ini (edit/ubah status), lalu otomatis hilang sendiri.
      // Tidak ditampilkan bareng label "Baru" supaya tidak dobel/berisik.
      const isEdited = !isBaru && p._editedMs && (Date.now() - p._editedMs) < (1000 * 60 * 60 * 24);

      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'peserta-row peserta-row-enter';
      row.style.transitionDelay = Math.min(i * 35, 300) + 'ms';

      row.innerHTML = `
        <span class="peserta-row-avatar-wrap">
          <span class="peserta-row-avatar">${initialsOf(p.nama)}</span>
        </span>
        <span class="peserta-row-info">
          <span class="peserta-row-name">${escapeHtml(p.nama || '-')}${isBaru ? '<span class="peserta-row-new">Baru</span>' : ''}${isEdited ? '<span class="peserta-row-edited"><i class="fa-solid fa-pen"></i> Diperbarui</span>' : ''}</span>
          <span class="peserta-row-dept">${escapeHtml(p.departemen || '-')}</span>
        </span>
        <span class="peserta-row-badge ${info.cls}"><i class="fa-solid ${info.icon}"></i> <b>${info.label}</b></span>
        <i class="fa-solid fa-chevron-right peserta-row-chevron"></i>
      `;
      row.addEventListener('click', () => openPesertaDetail(p));
      pesertaGrid.appendChild(row);
      rows.push(row);
    });

    // Entrance animation dipicu 1 frame SETELAH elemen tertempel ke DOM,
    // supaya transisi CSS-nya benar-benar berjalan (bukan langsung "jump")
    // di semua browser — bukan cuma andalan waktu penempelan yang kadang
    // tidak konsisten.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        rows.forEach(r => r.classList.add('show'));
      });
    });
  }

  /* =========================================================
     18b. SHOWCASE KHUSUS "SUDAH LUNAS" — kartu premium, scroll
     horizontal sendiri, tampilan berbeda & lebih mewah dibanding
     baris peserta biasa. Sepenuhnya terpisah dari .peserta-grid,
     jadi jumlah peserta Lunas tidak pernah "menutupi" atau mendesak
     daftar peserta lain keluar dari pandangan.
  ========================================================= */
  function renderLunasShowcase(lunasList){
    if (!lunasShowcase || !lunasShowcaseTrack) return;
    if (!lunasList || lunasList.length === 0){
      lunasShowcase.style.display = 'none';
      lunasShowcaseTrack.innerHTML = '';
      return;
    }
    lunasShowcase.style.display = 'block';
    lunasShowcaseTrack.innerHTML = '';

    const cards = [];
    lunasList.forEach((p, i) => {
      const isBaru = p._ms && (Date.now() - p._ms) < (1000 * 60 * 60 * 24);
      const isEdited = !isBaru && p._editedMs && (Date.now() - p._editedMs) < (1000 * 60 * 60 * 24);

      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'lunas-card lunas-card-enter';
      card.style.transitionDelay = Math.min(i * 70, 420) + 'ms';
      card.innerHTML = `
        <span class="lunas-card-shine" aria-hidden="true"></span>
        <span class="lunas-card-sparkle lcs1" aria-hidden="true"><i class="fa-solid fa-star"></i></span>
        <span class="lunas-card-sparkle lcs2" aria-hidden="true"><i class="fa-solid fa-star"></i></span>
        <span class="lunas-card-sparkle lcs3" aria-hidden="true"><i class="fa-solid fa-star"></i></span>
        ${isBaru ? '<span class="lunas-card-flag lunas-card-flag-new">Baru</span>' : (isEdited ? '<span class="lunas-card-flag lunas-card-flag-edit"><i class="fa-solid fa-pen"></i></span>' : '')}
        <span class="lunas-card-avatar-wrap">
          <span class="lunas-card-avatar">${initialsOf(p.nama)}</span>
          <span class="lunas-card-crown"><i class="fa-solid fa-crown"></i></span>
        </span>
        <span class="lunas-card-name">${escapeHtml(p.nama || '-')}</span>
        <span class="lunas-card-dept">${escapeHtml(p.departemen || '-')}</span>
        <span class="lunas-card-tag"><i class="fa-solid fa-circle-check"></i> Lunas</span>
      `;
      card.addEventListener('click', () => openPesertaDetail(p));
      lunasShowcaseTrack.appendChild(card);
      cards.push(card);
    });

    if (lunasShowcaseHint) lunasShowcaseHint.style.display = lunasList.length > 2 ? 'flex' : 'none';

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        cards.forEach(c => c.classList.add('show'));
      });
    });
  }

  /* =========================================================
     18b-2. RUNNING TEXT "SUDAH LUNAS" (marquee)
     Teks berjalan ringan berisi nama peserta Lunas, ditempatkan di
     bawah progress bar (lihat index.html, section #progress) supaya
     jadi bukti sosial yang memotivasi peserta yang belum bayar.

     Catatan performa: listener Firestore bisa memicu render ulang
     cukup sering. Supaya animasi marquee tidak "loncat"/reset tiap
     kali data disegarkan padahal daftar Lunas-nya sama saja, DOM
     track HANYA dibangun ulang kalau kombinasi id peserta Lunas
     benar-benar berubah (dicek lewat signature sederhana).
  ========================================================= */
  let lunasMarqueeSignature = '';
  function renderLunasMarquee(lunasList){
    if (!lunasMarqueeWrap || !lunasMarqueeTrack) return;

    if (!lunasList || lunasList.length === 0){
      lunasMarqueeWrap.style.display = 'none';
      lunasMarqueeTrack.innerHTML = '';
      lunasMarqueeSignature = '';
      return;
    }

    const signature = lunasList.map(p => p.id).join(',');
    lunasMarqueeWrap.style.display = 'flex';
    if (signature === lunasMarqueeSignature) return; // datanya sama, tidak perlu render ulang
    lunasMarqueeSignature = signature;

    const buatChip = (p) => `
      <span class="lunas-marquee-item">
        <span class="lmi-avatar">${initialsOf(p.nama)}</span>
        <i class="fa-solid fa-circle-check"></i>
        <span>${escapeHtml(p.nama || '-')}</span>
        <span class="lmi-dept">${escapeHtml(p.departemen || '-')}</span>
      </span>
      <span class="lunas-marquee-dot" aria-hidden="true"></span>
    `;

    // Konten digandakan 2x berturut-turut supaya animasi translateX(-50%)
    // terlihat menyambung mulus tanpa jeda/patah saat mengulang dari awal.
    const chipsHtml = lunasList.map(buatChip).join('');
    lunasMarqueeTrack.innerHTML = chipsHtml + chipsHtml;

    // Kecepatan disesuaikan dengan jumlah peserta supaya jarak antar nama
    // terasa konsisten (kira-kira ~3.4 detik per peserta), dibatasi supaya
    // tidak terlalu cepat (peserta sedikit) atau terlalu lambat (banyak).
    const durasi = Math.min(48, Math.max(10, lunasList.length * 3.4));
    lunasMarqueeTrack.style.setProperty('--lunas-marquee-duration', durasi + 's');
  }

  /* =========================================================
     18a. MODAL DETAIL PESERTA — dipanggil saat baris list diklik
  ========================================================= */
  const pesertaModalOverlay = document.getElementById('pesertaModalOverlay');
  const pesertaModalClose = document.getElementById('pesertaModalClose');

  function openPesertaDetail(p){
    const status = p.pembayaran?.status || 'belum_dp';
    const info = STATUS_LABEL[status] || STATUS_LABEL.belum_dp;

    document.getElementById('pmAvatar').textContent = initialsOf(p.nama);
    document.getElementById('pmName').textContent = p.nama || '-';
    document.getElementById('pmDept').textContent = p.departemen || '-';
    document.getElementById('pmJenis').textContent = `${p.jenis || '-'} • ${p.ukuranKemeja || '-'}`;
    document.getElementById('pmJumlah').textContent = `${p.jumlah || 1} pcs`;
    document.getElementById('pmTotal').textContent = formatRupiah(p.total || 0);

    const badgeEl = document.getElementById('pmBadge');
    badgeEl.className = `peserta-badge ${info.cls}`;
    badgeEl.innerHTML = `<i class="fa-solid ${info.icon}"></i> ${info.label}`;

    const progressWrap = document.getElementById('pmProgressWrap');
    if (p.pembayaran?.metode === 'cicilan'){
      progressWrap.style.display = 'block';
      document.getElementById('pmProgressFill').style.width = (status === 'lunas' ? 100 : status === 'belum_dp' ? 0 : 50) + '%';
      document.getElementById('pmProgressText').textContent = status === 'lunas'
        ? 'Lunas (2/2 pembayaran)'
        : status === 'belum_dp'
          ? 'Belum ada pembayaran masuk'
          : 'Pembayaran ke-1 (DP) selesai, menunggu pelunasan ke-2';
    } else {
      progressWrap.style.display = 'none';
    }

    pesertaModalOverlay?.classList.add('active');
    document.body.classList.add('peserta-modal-lock');
  }

  function closePesertaDetail(){
    pesertaModalOverlay?.classList.remove('active');
    document.body.classList.remove('peserta-modal-lock');
  }

  pesertaModalClose?.addEventListener('click', closePesertaDetail);
  pesertaModalOverlay?.addEventListener('click', (e) => {
    if (e.target === pesertaModalOverlay) closePesertaDetail();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePesertaDetail();
  });

  function escapeHtml(str){
    return String(str).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  /* =========================================================
     18b. PROGRESS BATCH & TIMELINE — Program Iuran Bersama
     Dipanggil setiap kali pesertaData berubah (live), dan sekali
     saat halaman pertama kali dimuat memakai CURRENT_STAGE manual.
  ========================================================= */
  const heroPesertaCount = document.getElementById('heroPesertaCount');
  const progressPesertaCount = document.getElementById('progressPesertaCount');
  const progressDanaCount = document.getElementById('progressDanaCount');
  const progressTargetCount = document.getElementById('progressTargetCount');
  const progressBarFill = document.getElementById('progressBarFill');
  const progressBarLabel = document.getElementById('progressBarLabel');

  if (progressTargetCount) progressTargetCount.textContent = TARGET_PESERTA;

  function updateProgressBatch(){
    const totalPeserta = pesertaData.length;
    const totalDana = pesertaData.reduce((sum, p) => sum + (p.pembayaran?.totalDibayar || 0), 0);
    const persen = TARGET_PESERTA > 0 ? Math.min(100, Math.round((totalPeserta / TARGET_PESERTA) * 100)) : 0;

    if (heroPesertaCount) animateStatNumber(heroPesertaCount, totalPeserta);
    if (progressPesertaCount) animateStatNumber(progressPesertaCount, totalPeserta);
    if (progressDanaCount) progressDanaCount.textContent = formatRupiah(totalDana);
    if (progressBarFill) progressBarFill.style.width = persen + '%';
    if (progressBarLabel){
      progressBarLabel.textContent = totalPeserta >= TARGET_PESERTA
        ? `Target tercapai! (${totalPeserta}/${TARGET_PESERTA} peserta) — menunggu jadwal produksi`
        : `${persen}% menuju target produksi • ${totalPeserta}/${TARGET_PESERTA} peserta`;
    }
  }

  function updateTimeline(){
    const steps = document.querySelectorAll('#timelineWrap .timeline-step');
    steps.forEach(step => {
      const n = parseInt(step.dataset.step, 10);
      step.classList.remove('is-done', 'is-active');
      if (n < CURRENT_STAGE) step.classList.add('is-done');
      else if (n === CURRENT_STAGE) step.classList.add('is-active');
    });
  }
  updateTimeline();

  /* =========================================================
     18c. FAQ ACCORDION
  ========================================================= */
  document.querySelectorAll('.faq-item').forEach(item => {
    const btn = item.querySelector('.faq-question');
    btn?.addEventListener('click', () => {
      const isOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item.open').forEach(other => {
        if (other !== item) other.classList.remove('open');
      });
      item.classList.toggle('open', !isOpen);
    });
  });

  pesertaFilters?.querySelectorAll('.pfilter').forEach(btn => {
    btn.addEventListener('click', () => {
      pesertaFilters.querySelectorAll('.pfilter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderPeserta();
    });
  });
  pesertaSearch?.addEventListener('input', () => {
    currentSearch = pesertaSearch.value;
    renderPeserta();
  });

  function showPesertaOffline(reason){
    if (pesertaOffline){
      pesertaOffline.style.display = 'block';
      const msgEl = pesertaOffline.querySelector('.peserta-offline-msg') || pesertaOffline;
      if (msgEl) msgEl.innerHTML = reason || 'Firebase belum dikonfigurasi. Lengkapi <code>firebase-config.js</code> agar daftar peserta live tampil di sini.';
    }
    pesertaGrid.innerHTML = '';
    if (lunasShowcase) lunasShowcase.style.display = 'none';
    if (progressBarLabel) progressBarLabel.textContent = 'Data belum bisa dimuat — cek koneksi internet.';
  }

  // Tombol "Coba Sambungkan Ulang" — memicu window.__lokonRetryFirebase()
  // (didefinisikan di index.html) untuk mencoba memuat SDK Firebase lagi
  // tanpa perlu memuat ulang seluruh halaman. Berguna di koneksi seluler
  // yang lambat/tidak stabil.
  const pesertaRetryBtn = document.getElementById('pesertaRetryBtn');
  pesertaRetryBtn?.addEventListener('click', async () => {
    pesertaRetryBtn.disabled = true;
    pesertaRetryBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Menyambungkan...';
    if (typeof window.__lokonRetryFirebase === 'function'){
      await window.__lokonRetryFirebase();
    }
    if (window.__lokonFirebase){
      showToast('Berhasil tersambung ke database!', 'success');
      startPesertaListener();
    } else {
      showToast('Masih gagal tersambung. Cek koneksi internet Anda.', 'error');
    }
    pesertaRetryBtn.disabled = false;
    pesertaRetryBtn.innerHTML = '<i class="fa-solid fa-rotate"></i> Coba Sambungkan Ulang';
  });

  let pesertaListenerStarted = false;
  function startPesertaListener(){
    if (pesertaListenerStarted) return;
    const fb = window.__lokonFirebase;
    if (!fb){
      // window.__lokonFirebase hanya null jika initializeApp()/getFirestore()
      // di index.html gagal — cek console browser (F12) untuk pesan aslinya.
      showPesertaOffline('<i class="fa-solid fa-triangle-exclamation"></i> Firebase belum dikonfigurasi. Lengkapi <code>firebase-config.js</code> agar daftar peserta live tampil di sini.');
      return;
    }
    pesertaListenerStarted = true;
    try {
      const q = fb.query(fb.collection(fb.db, fb.FIRESTORE_COLLECTION), fb.orderBy('timestamp', 'desc'));
      fb.onSnapshot(q, (snap) => {
        pesertaData = snap.docs.map(d => {
          const docData = d.data();
          const ms = docData.timestamp?.toMillis ? docData.timestamp.toMillis() : null;
          const editedMs = docData.adminEditedAt?.toMillis ? docData.adminEditedAt.toMillis() : null;
          return { id: d.id, ...docData, _ms: ms, _editedMs: editedMs };
        });
        renderPeserta();
        renderProfileWidget();
        updateChatMemberCount();
        updateProgressBatch();
      }, (err) => {
        console.warn('Firestore listener error:', err.code, err.message);
        // Bedakan pesan berdasarkan kode error asli Firestore, supaya
        // tidak selalu terlihat seperti "config salah" padahal penyebabnya lain.
        let reason;
        if (err.code === 'permission-denied'){
          reason = '<i class="fa-solid fa-lock"></i> Akses Firestore ditolak. Cek Firestore Rules di Firebase Console — pastikan sudah di-<b>Publish</b> dan mengizinkan <code>allow read: if true</code> pada koleksi pendaftaran.';
        } else if (err.code === 'unavailable'){
          reason = '<i class="fa-solid fa-wifi"></i> Tidak bisa terhubung ke Firestore (jaringan bermasalah atau diblokir). Coba muat ulang halaman.';
        } else if (err.code === 'not-found' || err.code === 'failed-precondition'){
          reason = '<i class="fa-solid fa-database"></i> Database Firestore belum dibuat. Buka Firebase Console → Build → Firestore Database → Create database.';
        } else {
          reason = `<i class="fa-solid fa-triangle-exclamation"></i> Gagal memuat data peserta (${err.code || 'error'}). Cek console browser untuk detail.`;
        }
        showPesertaOffline(reason);
      });
    } catch (err){
      console.warn('Gagal memulai listener peserta:', err);
      showPesertaOffline();
    }
  }
  // PERBAIKAN: tunggu Firebase siap dulu (bisa beberapa detik di koneksi
  // lambat) sebelum memutuskan untuk menampilkan status "offline".
  // Sebelumnya dipanggil langsung tanpa menunggu, sehingga HAMPIR SELALU
  // gagal walau Firebase sebenarnya tersambung normal beberapa saat kemudian.
  (async () => {
    await waitForFirebase();
    startPesertaListener();
  })();

  /* =========================================================
     18b. AKUN PESERTA (SESI LOGIN) — pojok kanan navbar
     Karena situs ini murni statis (tanpa server backend), "akun"
     peserta diverifikasi dengan mencocokkan Kode Unik (No. Struk)
     yang dimasukkan terhadap data pendaftaran (koleksi Firestore
     "pendaftaran"), lalu sesi disimpan di localStorage perangkat
     tersebut. Setelah submit formulir pendaftaran, sesi otomatis
     dibuat (auto-login) sehingga peserta langsung bisa memakai
     chat grup tanpa langkah tambahan.
  ========================================================= */
  const SESSION_KEY = 'lokonMemberSession';

  const profileWidget = document.getElementById('profileWidget');
  const profileBtn = document.getElementById('profileBtn');
  const profileAvatar = document.getElementById('profileAvatar');
  const profileName = document.getElementById('profileName');
  const profileSub = document.getElementById('profileSub');
  const profileGuestView = document.getElementById('profileGuestView');
  const profileMemberView = document.getElementById('profileMemberView');
  const openLoginBtn = document.getElementById('openLoginBtn');
  const profileLoginForm = document.getElementById('profileLoginForm');
  const loginKodeUnik = document.getElementById('loginKodeUnik');
  const loginSubmitBtn = document.getElementById('loginSubmitBtn');
  const loginError = document.getElementById('loginError');
  const memberAvatarInitial = document.getElementById('memberAvatarInitial');
  const memberNameFull = document.getElementById('memberNameFull');
  const memberPhoneFull = document.getElementById('memberPhoneFull');
  const logoutBtn = document.getElementById('logoutBtn');
  const openPayModalBtn = document.getElementById('openPayModalBtn');

  function getSession(){
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
    catch { return null; }
  }
  function saveSession(session){
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    renderProfileWidget();
    renderChatPermission();
    renderChatMessages();
  }
  function clearSession(){
    localStorage.removeItem(SESSION_KEY);
    renderProfileWidget();
    renderChatPermission();
    renderChatMessages();
  }
  // PERUBAHAN LOGIKA: login peserta sekarang pakai KODE UNIK (dari
  // struk pendaftaran), bukan nomor WhatsApp. docId hanya tersedia
  // setelah admin menginput data peserta ke Firestore lewat dasbor.
  function loginAsMember({ nama, kodeUnik, docId }){
    saveSession({ nama, kodeUnik, docId, loginAt: Date.now() });
    showToast(`Selamat datang, ${nama}! Akun peserta Anda aktif.`, 'success');
  }

  const profileStatusLine = document.getElementById('profileStatusLine');

  function renderProfileWidget(){
    const session = getSession();
    const initial = (session?.nama || '').trim().charAt(0).toUpperCase() || 'P';
    if (session){
      profileName.textContent = session.nama.split(' ')[0];
      profileSub.textContent = 'Peserta Terdaftar';
      profileAvatar.innerHTML = initial;
      profileGuestView.style.display = 'none';
      profileMemberView.style.display = 'block';
      memberAvatarInitial.textContent = initial;
      memberNameFull.textContent = session.nama;
      memberPhoneFull.innerHTML = `<i class="fa-solid fa-key"></i> ${escapeHtml(session.kodeUnik || '-')}`;

      // Status pembayaran live, diambil dari data yang sama dipakai
      // dasbor admin — otomatis ikut update saat admin mengubah status.
      const record = pesertaData.find(p => p.id === session.docId) ||
                     pesertaData.find(p => (p.kodeUnik || '').toUpperCase() === (session.kodeUnik || '').toUpperCase());
      if (profileStatusLine){
        if (record){
          const info = STATUS_LABEL[record.pembayaran?.status || 'belum_dp'] || STATUS_LABEL.belum_dp;
          const tagihan = hitungTagihanSekarang(record);
          const sisaInfo = tagihan.nominal > 0
            ? ` • ${escapeHtml(tagihan.label)}: <b>${formatRupiah(tagihan.nominal)}</b>`
            : '';
          profileStatusLine.innerHTML = `<i class="fa-solid ${info.icon}"></i> Status: <b>${info.label}</b> • Terbayar ${formatRupiah(record.pembayaran?.totalDibayar || 0)} / ${formatRupiah(record.total || 0)}${sisaInfo}`;
        } else {
          profileStatusLine.innerHTML = `<i class="fa-solid fa-hourglass-half"></i> Menunggu admin memverifikasi pendaftaran Anda.`;
        }
      }

      // Tombol "Bayar Sekarang" hanya tampil kalau peserta terverifikasi
      // di dasbor DAN belum lunas — supaya tidak membingungkan peserta
      // yang statusnya sudah selesai.
      if (openPayModalBtn){
        const status = record?.pembayaran?.status || 'belum_dp';
        if (record && status !== 'lunas'){
          openPayModalBtn.style.display = 'flex';
        } else {
          openPayModalBtn.style.display = 'none';
        }
      }
    } else {
      profileName.textContent = 'Tamu';
      profileSub.textContent = 'Pengunjung';
      profileAvatar.innerHTML = '<i class="fa-solid fa-user"></i>';
      profileGuestView.style.display = 'block';
      profileMemberView.style.display = 'none';
      if (openPayModalBtn) openPayModalBtn.style.display = 'none';
    }
  }
  renderProfileWidget();

  profileBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    profileWidget.classList.toggle('open');
  });
  document.addEventListener('click', (e) => {
    if (profileWidget && !profileWidget.contains(e.target)) profileWidget.classList.remove('open');
  });

  openLoginBtn?.addEventListener('click', () => {
    const showing = profileLoginForm.style.display !== 'none' && profileLoginForm.style.display !== '';
    profileLoginForm.style.display = showing ? 'none' : 'flex';
    loginError.textContent = '';
  });

  loginSubmitBtn?.addEventListener('click', () => {
    const raw = (loginKodeUnik.value || '').trim().toUpperCase();
    loginError.textContent = '';
    loginError.classList.remove('show');
    if (!raw){
      loginError.textContent = 'Masukkan kode unik dari struk pendaftaran Anda.';
      loginError.classList.add('show');
      return;
    }
    const match = pesertaData.find(p => (p.kodeUnik || '').toUpperCase() === raw);
    if (match){
      loginAsMember({ nama: match.nama, kodeUnik: match.kodeUnik, docId: match.id });
      profileWidget.classList.remove('open');
      loginKodeUnik.value = '';
      profileLoginForm.style.display = 'none';
    } else {
      loginError.textContent = 'Kode tidak ditemukan. Mungkin admin belum memverifikasi pendaftaran Anda — coba beberapa saat lagi.';
      loginError.classList.add('show');
    }
  });

  logoutBtn?.addEventListener('click', () => {
    clearSession();
    showToast('Anda telah keluar dari akun peserta.', 'success');
  });

  /* =========================================================
     18b. MODAL "BAYAR SEKARANG" — transfer bank + kirim bukti
     Rekening panitia dipakai di 3 tempat sekaligus supaya selalu
     konsisten: kartu formulir pendaftaran, modal ini, dan struk JPG.
  ========================================================= */
  const BANK_INFO = { bank: 'BCA', nomor: '0830142452', atasNama: 'KAMIL MUHAMAD NUR' };
  const ADMIN_WA_NOMOR = '6285697321423';

  async function copyToClipboard(text, btnEl){
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch (err) {
      // Fallback untuk browser lama / konteks tanpa izin Clipboard API
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus(); ta.select();
        ok = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch (err2) {
        ok = false;
      }
    }
    if (ok){
      showToast('Nomor rekening berhasil disalin!', 'success');
      if (window.lokonFireConfetti) window.lokonFireConfetti();
      if (btnEl){
        const original = btnEl.innerHTML;
        btnEl.classList.add('copied');
        btnEl.innerHTML = '<i class="fa-solid fa-check"></i> <span>Tersalin!</span>';
        setTimeout(() => {
          btnEl.classList.remove('copied');
          btnEl.innerHTML = original;
        }, 2000);
      }
    } else {
      showToast('Gagal menyalin otomatis. Silakan salin nomor rekening secara manual.', 'error');
    }
  }

  document.querySelectorAll('.btc-copy-btn[data-copy-value]').forEach(btn => {
    btn.addEventListener('click', () => copyToClipboard(btn.dataset.copyValue, btn));
  });

  const payModalOverlay = document.getElementById('payModalOverlay');
  const payModalClose = document.getElementById('payModalClose');
  const pmAmountDue = document.getElementById('pmAmountDue');
  const pmAmountLabel = document.getElementById('pmAmountLabel');
  const pmAmountNote = document.getElementById('pmAmountNote');
  const pmProofFile = document.getElementById('pmProofFile');
  const pmAttachBtn = document.getElementById('pmAttachBtn');
  const pmProofFileName = document.getElementById('pmProofFileName');
  const pmSendProofBtn = document.getElementById('pmSendProofBtn');

  let pmCurrentRecord = null;
  let pmSelectedFileName = '';

  /* ---------- Hitung tagihan yang HARUS dibayar SEKARANG ----------
     PERBAIKAN BUG: sebelumnya modal ini selalu menampilkan SISA dari
     TOTAL (total - totalDibayar), padahal untuk peserta cicilan yang
     belum bayar sama sekali (status belum_dp), yang harus dibayar
     SEKARANG cuma DP (50% harga kemeja + Rp5.000 admin) — BUKAN total
     penuh. Fungsi ini dipakai bersama oleh modal & pesan WhatsApp bukti
     transfer supaya angkanya selalu konsisten dengan struk JPG &
     kartu transfer bank di formulir. */
  function hitungTagihanSekarang(record){
    const total = record?.total || 0;
    const metode = record?.pembayaran?.metode === 'cicilan' ? 'cicilan' : 'tunai';
    const status = record?.pembayaran?.status || 'belum_dp';
    const dpMinimal = record?.pembayaran?.dpMinimal || total;
    const totalDibayar = record?.pembayaran?.totalDibayar || 0;

    if (status === 'lunas'){
      return { nominal: 0, label: 'Pesanan Sudah Lunas', note: 'Tidak ada tagihan lagi untuk pesanan ini. Terima kasih!' };
    }
    if (metode === 'cicilan'){
      if (status === 'belum_dp'){
        const sisaPelunasan = Math.max(total - dpMinimal, 0);
        return {
          nominal: dpMinimal,
          label: 'Pembayaran Awal (DP) — Tahap 1/2',
          note: `DP 50% harga kemeja + Rp5.000 biaya admin, dari total pesanan ${formatRupiah(total)}. Sisa pelunasan ${formatRupiah(sisaPelunasan)} dibayar belakangan saat kemeja siap diambil.`
        };
      }
      // status === 'dp' -> tinggal pelunasan tahap ke-2
      const sisa = Math.max(total - totalDibayar, 0);
      return {
        nominal: sisa,
        label: 'Pelunasan — Tahap 2/2',
        note: `DP Anda sebesar ${formatRupiah(totalDibayar)} sudah kami terima. Ini adalah sisa pelunasan dari total pesanan ${formatRupiah(total)}.`
      };
    }
    // Tunai / Lunas langsung — hanya satu kali bayar penuh
    const sisaTunai = Math.max(total - totalDibayar, 0);
    return {
      nominal: sisaTunai || total,
      label: 'Pembayaran Lunas (Tunai)',
      note: `Bayar sekaligus sesuai total pesanan ${formatRupiah(total)}, tanpa biaya tambahan apapun.`
    };
  }

  function openPayModal(){
    const session = getSession();
    const record = pesertaData.find(p => p.id === session?.docId) ||
                   pesertaData.find(p => (p.kodeUnik || '').toUpperCase() === (session?.kodeUnik || '').toUpperCase());
    pmCurrentRecord = record || null;

    const tagihan = hitungTagihanSekarang(record);
    if (pmAmountLabel) pmAmountLabel.textContent = tagihan.label;
    if (pmAmountDue) pmAmountDue.textContent = formatRupiah(tagihan.nominal);
    if (pmAmountNote) pmAmountNote.textContent = tagihan.note;

    pmSelectedFileName = '';
    if (pmProofFile) pmProofFile.value = '';
    if (pmProofFileName){
      pmProofFileName.innerHTML = '<i class="fa-solid fa-circle-info"></i> Anda bisa memilih foto bukti transfer terlebih dahulu (opsional) agar tinggal dilampirkan di WhatsApp yang terbuka.';
    }

    payModalOverlay?.classList.add('active');
    document.body.classList.add('pay-modal-lock');
  }

  function closePayModal(){
    payModalOverlay?.classList.remove('active');
    document.body.classList.remove('pay-modal-lock');
  }

  openPayModalBtn?.addEventListener('click', () => {
    profileWidget?.classList.remove('open');
    openPayModal();
  });
  payModalClose?.addEventListener('click', closePayModal);
  payModalOverlay?.addEventListener('click', (e) => {
    if (e.target === payModalOverlay) closePayModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePayModal();
  });

  pmAttachBtn?.addEventListener('click', () => pmProofFile?.click());
  pmProofFile?.addEventListener('change', () => {
    const file = pmProofFile.files?.[0];
    pmSelectedFileName = file ? file.name : '';
    if (pmProofFileName){
      pmProofFileName.innerHTML = file
        ? `<i class="fa-solid fa-circle-check" style="color:var(--teal-deep);"></i> Foto dipilih: <b>${escapeHtml(file.name)}</b> — lampirkan file ini secara manual di WhatsApp yang akan terbuka.`
        : '<i class="fa-solid fa-circle-info"></i> Anda bisa memilih foto bukti transfer terlebih dahulu (opsional) agar tinggal dilampirkan di WhatsApp yang terbuka.';
    }
  });

  pmSendProofBtn?.addEventListener('click', () => {
    const session = getSession();
    const record = pmCurrentRecord;
    const tagihan = hitungTagihanSekarang(record);

    const pesan =
`================================
KONFIRMASI BUKTI TRANSFER
PENDAFTARAN KEMEJA KERJA
================================
Kode Unik : ${session?.kodeUnik || '-'}
Nama : ${session?.nama || '-'}
Tahap Pembayaran : ${tagihan.label}
Nominal Ditransfer : ${formatRupiah(tagihan.nominal)}
Rekening Tujuan : ${BANK_INFO.bank} ${BANK_INFO.nomor} a.n. ${BANK_INFO.atasNama}
================================
Mohon konfirmasi ya, bukti transfer terlampir di chat ini. Terima kasih.`;

    const url = `https://wa.me/${ADMIN_WA_NOMOR}?text=${encodeURIComponent(pesan)}`;
    window.open(url, '_blank');
    showToast(pmSelectedFileName
      ? `Jangan lupa lampirkan foto "${pmSelectedFileName}" di chat WhatsApp yang baru terbuka.`
      : 'WhatsApp terbuka — lampirkan foto bukti transfer Anda di chat tersebut.', 'success');
  });

  /* =========================================================
     18c. LIVE CHAT GRUP PESERTA (mirip WhatsApp, real-time)
     - Semua orang (Tamu & Peserta) bisa MELIHAT isi chat.
     - Hanya Peserta yang sudah terverifikasi (login lewat sesi
       di atas) yang bisa MENGIRIM pesan.
     - Disimpan real-time di koleksi Firestore "chat_pesan".
  ========================================================= */
  const chatFab = document.getElementById('chatFab');
  const chatFabBadge = document.getElementById('chatFabBadge');
  const chatOverlay = document.getElementById('chatOverlay');
  const chatPanel = document.getElementById('chatPanel');
  const chatClose = document.getElementById('chatClose');
  const chatBody = document.getElementById('chatBody');
  const chatEmpty = document.getElementById('chatEmpty');
  const chatOffline = document.getElementById('chatOffline');
  const chatForm = document.getElementById('chatForm');
  const chatInput = document.getElementById('chatInput');
  const chatLocked = document.getElementById('chatLocked');
  const chatMemberCount = document.getElementById('chatMemberCount');
  const chatSoundToggle = document.getElementById('chatSoundToggle');

  let chatMessages = [];
  let unreadCount = 0;
  let chatIsOpen = false;
  let chatListenerStarted = false;

  // PERBAIKAN PERFORMA: dulu setiap ada 1 pesan baru masuk, SEMUA pesan
  // (bisa sampai 200) dihapus & dibuat ulang dari nol — termasuk animasi
  // "masuk"-nya ikut terulang untuk pesan yang sudah lama ada. Ini yang
  // bikin chat makin berat/patah-patah seiring chat makin ramai.
  // Sekarang dipakai pendekatan incremental: hanya pesan yang benar-benar
  // baru/berubah/dihapus yang disentuh di DOM.
  const chatMsgElements = new Map(); // id pesan -> elemen DOM
  let chatFirstLoad = true;
  let lastChatSentAt = 0;
  const CHAT_COOLDOWN_MS = 2500; // jeda minimal antar kirim pesan, cegah spam

  // Warna label nama dibuat konsisten per orang (dihitung dari nama),
  // bukan gambar avatar — supaya tetap ringan tapi tiap orang gampang
  // dibedakan warnanya di dalam grup.
  const CHAT_NAME_PALETTE = ['#FF6B6B','#F0913C','#F0B429','#3CCB7F','#12A9E0','#6C8CFF','#B06CFF','#FF6CAE'];
  function chatNameColor(nama){
    const str = nama || 'Peserta';
    let hash = 0;
    for (let i = 0; i < str.length; i++){ hash = str.charCodeAt(i) + ((hash << 5) - hash); }
    return CHAT_NAME_PALETTE[Math.abs(hash) % CHAT_NAME_PALETTE.length];
  }

  /* ---------------------------------------------------------
     18c-i. SUARA & NOTIFIKASI PESAN BARU
     - Suara dibuat langsung lewat Web Audio API (bunyi "ding"
       2 nada pendek) — tidak butuh file audio tambahan, jadi
       tidak akan gagal dimuat karena masalah path/hosting.
     - Notifikasi browser (Notification API) opsional, dipakai
       kalau user sudah kasih izin & tab sedang tidak aktif
       dilihat (background/minimized) atau panel chat tertutup.
     - Preferensi ON/OFF disimpan di localStorage supaya tidak
       perlu diaktifkan ulang tiap buka website.
  --------------------------------------------------------- */
  const CHAT_SOUND_KEY = 'lokon_chat_sound_on';
  let chatSoundOn = localStorage.getItem(CHAT_SOUND_KEY) !== 'off'; // default: ON
  let audioCtx = null;

  function playChatSound(){
    if (!chatSoundOn) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const now = audioCtx.currentTime;
      // Dua nada pendek (mirip notifikasi WhatsApp/Messenger), dibuat
      // dari oscillator + fade out cepat supaya tidak berdengung.
      [ [880, now, 0.09], [1180, now + 0.09, 0.12] ].forEach(([freq, start, dur]) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.22, start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(start);
        osc.stop(start + dur + 0.02);
      });
    } catch (err){
      console.warn('Tidak bisa memutar suara notifikasi chat:', err);
    }
  }

  function updateChatSoundIcon(){
    if (!chatSoundToggle) return;
    chatSoundToggle.classList.toggle('muted', !chatSoundOn);
    chatSoundToggle.innerHTML = chatSoundOn
      ? '<i class="fa-solid fa-bell"></i>'
      : '<i class="fa-solid fa-bell-slash"></i>';
  }
  updateChatSoundIcon();

  chatSoundToggle?.addEventListener('click', async () => {
    chatSoundOn = !chatSoundOn;
    localStorage.setItem(CHAT_SOUND_KEY, chatSoundOn ? 'on' : 'off');
    updateChatSoundIcon();
    if (chatSoundOn){
      // Minta izin notifikasi browser saat user MENGAKTIFKAN suara —
      // ini tetap dipicu dari klik (user gesture), jadi browser tidak
      // akan memblokir prompt izinnya.
      if ('Notification' in window && Notification.permission === 'default'){
        try { await Notification.requestPermission(); } catch (err) { /* diabaikan */ }
      }
      playChatSound(); // beri contoh bunyi supaya user tahu sudah aktif
      showToast('Suara & notifikasi chat diaktifkan.', 'success');
    } else {
      showToast('Suara & notifikasi chat dimatikan.', 'success');
    }
  });

  function notifyNewChatMessage(msg){
    if (!chatSoundOn) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    // Hanya tampilkan notifikasi desktop kalau chat sedang TIDAK dilihat
    // langsung (tab di-minimize/pindah tab, atau panel chat tertutup) —
    // supaya tidak mengganggu saat user memang sedang aktif chatting.
    if (chatIsOpen && !document.hidden) return;
    try {
      const n = new Notification(`💬 ${msg.nama || 'Peserta'} (Grup LOKON PRIMA)`, {
        body: (msg.pesan || '').slice(0, 120),
        icon: 'https://benyoriki.github.io/Kemeja/favicon.ico',
        tag: 'lokon-chat' // gantikan notifikasi lama, tidak menumpuk
      });
      n.onclick = () => { window.focus(); openChatPanel(); n.close(); };
    } catch (err){
      console.warn('Gagal menampilkan notifikasi chat:', err);
    }
  }

  function openChatPanel(){
    chatIsOpen = true;
    chatOverlay.classList.add('active');
    chatPanel.classList.add('active');
    chatFab.classList.add('hide');
    document.body.classList.add('chat-open-lock');
    unreadCount = 0;
    updateChatBadge();
    startChatListener();
    setTimeout(() => { chatBody.scrollTop = chatBody.scrollHeight; }, 80);
  }
  function closeChatPanel(){
    chatIsOpen = false;
    chatOverlay.classList.remove('active');
    chatPanel.classList.remove('active');
    chatFab.classList.remove('hide');
    document.body.classList.remove('chat-open-lock');
  }
  chatFab?.addEventListener('click', openChatPanel);
  chatClose?.addEventListener('click', closeChatPanel);
  chatOverlay?.addEventListener('click', closeChatPanel);

  function updateChatBadge(){
    if (unreadCount > 0){
      chatFabBadge.style.display = 'flex';
      chatFabBadge.textContent = unreadCount > 9 ? '9+' : String(unreadCount);
    } else {
      chatFabBadge.style.display = 'none';
    }
  }

  function renderChatPermission(){
    const session = getSession();
    if (session){
      chatForm.style.display = 'flex';
      chatLocked.style.display = 'none';
    } else {
      chatForm.style.display = 'none';
      chatLocked.style.display = 'flex';
    }
  }
  renderChatPermission();

  // PERBAIKAN: sebelumnya listener chat baru mulai jalan SAAT panel chat
  // dibuka pertama kali (lihat startChatListener() di dalam openChatPanel()).
  // Akibatnya, badge notifikasi "pesan belum dibaca" di ikon chat TIDAK
  // PERNAH muncul untuk pengunjung yang belum pernah membuka panel chat-nya
  // sama sekali — padahal justru merekalah yang paling butuh diberitahu ada
  // pesan baru. Sekarang listener langsung dimulai begitu halaman dimuat
  // (fungsinya sendiri sudah aman dipanggil lebih awal — ia menunggu
  // Firebase siap dulu lewat waitForFirebase()), supaya badge unread &
  // suara notifikasi langsung aktif sejak awal, bukan cuma setelah dibuka.
  startChatListener();

  // Membuat 1 elemen bubble pesan. animate=false dipakai saat rebuild
  // penuh (login/logout/reset) supaya tidak semua bubble ikut memutar
  // ulang animasi "masuk" sekaligus — cukup berat kalau pesannya banyak.
  function buildChatMsgEl(msg, mine, animate){
    const el = document.createElement('div');
    el.className = 'chat-msg ' + (mine ? 'mine' : 'other');
    el.dataset.id = msg.id;
    if (!animate) el.style.animation = 'none';
    const time = msg._ms ? new Date(msg._ms).toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' }) : '';
    const senderName = (msg.nama || 'Peserta').split(' ')[0];
    el.innerHTML = `
      ${mine ? '' : `<span class="chat-msg-name" style="color:${chatNameColor(msg.nama)}">${escapeHtml(senderName)}</span>`}
      <span class="chat-msg-text">${escapeHtml(msg.pesan || '')}</span>
      <span class="chat-msg-time">${time}</span>
      ${mine ? `<button type="button" class="chat-msg-del" aria-label="Hapus pesan ini" title="Hapus pesan ini"><i class="fa-solid fa-trash-can"></i></button>` : ''}
    `;
    if (mine){
      el.querySelector('.chat-msg-del')?.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteOwnChatMessage(msg.id);
      });
    }
    return el;
  }

  async function deleteOwnChatMessage(id){
    if (!confirm('Hapus pesan ini untuk semua orang di grup?')) return;
    const fb = await waitForFirebase(6000);
    if (!fb){ showToast('Tidak bisa menghapus, koneksi bermasalah. Coba lagi.', 'error'); return; }
    try {
      await fb.deleteDoc(fb.doc(fb.db, fb.CHAT_COLLECTION, id));
    } catch (err){
      console.warn('Gagal menghapus pesan:', err);
      showToast('Gagal menghapus pesan, coba lagi.', 'error');
    }
  }

  // Rebuild PENUH — dipakai untuk kasus yang jarang terjadi saja
  // (login/logout, atau setelah admin reset seluruh chat), karena hanya
  // saat itu sisi bubble (kiri/kanan) semua pesan perlu dihitung ulang.
  function renderChatMessages(){
    const session = getSession();
    chatBody.querySelectorAll('.chat-msg').forEach(el => el.remove());
    chatMsgElements.clear();
    chatEmpty.style.display = chatMessages.length === 0 ? 'block' : 'none';
    chatMessages.forEach(msg => {
      const mine = !!(session && msg.kodeUnik && session.kodeUnik && msg.kodeUnik === session.kodeUnik);
      const el = buildChatMsgEl(msg, mine, false);
      chatBody.appendChild(el);
      chatMsgElements.set(msg.id, el);
    });
    chatBody.scrollTop = chatBody.scrollHeight;
  }

  // Patch INKREMENTAL — jalur utama yang dipakai tiap kali listener
  // Firestore melaporkan perubahan (pesan baru masuk/dihapus). Jauh lebih
  // ringan karena cuma menyentuh DOM untuk pesan yang benar-benar berubah.
  function applyChatChanges(changes, session){
    let addedWhileClosed = 0;
    let hasChange = false;

    changes.forEach(change => {
      const docData = change.doc.data();
      const ms = docData.timestamp?.toMillis ? docData.timestamp.toMillis() : Date.now();
      const msg = { id: change.doc.id, ...docData, _ms: ms };

      if (change.type === 'removed'){
        chatMsgElements.get(msg.id)?.remove();
        chatMsgElements.delete(msg.id);
        chatMessages = chatMessages.filter(m => m.id !== msg.id);
        hasChange = true;
        return;
      }

      const mine = !!(session && msg.kodeUnik && session.kodeUnik && msg.kodeUnik === session.kodeUnik);

      if (change.type === 'modified'){
        const old = chatMsgElements.get(msg.id);
        const fresh = buildChatMsgEl(msg, mine, false);
        if (old) old.replaceWith(fresh); else chatBody.appendChild(fresh);
        chatMsgElements.set(msg.id, fresh);
        chatMessages = chatMessages.map(m => m.id === msg.id ? msg : m);
        hasChange = true;
        return;
      }

      // 'added' — hanya proses kalau memang belum ada di DOM
      if (!chatMsgElements.has(msg.id)){
        const el = buildChatMsgEl(msg, mine, !chatFirstLoad);
        chatBody.appendChild(el);
        chatMsgElements.set(msg.id, el);
        chatMessages.push(msg);
        hasChange = true;
        if (!chatFirstLoad && !chatIsOpen) addedWhileClosed++;

        // Bunyi + notifikasi HANYA untuk pesan baru beneran (bukan saat
        // memuat riwayat pertama kali) dan bukan pesan dari diri sendiri.
        if (!chatFirstLoad && !mine){
          playChatSound();
          notifyNewChatMessage(msg);
          // Getaran singkat di HP kalau tab sedang tidak aktif dilihat —
          // pelengkap ringan untuk notifikasi suara, tidak dipanggil
          // sama sekali kalau device tidak mendukung getaran (aman di semua browser).
          if (chatSoundOn && document.hidden && navigator.vibrate){
            try { navigator.vibrate([70, 40, 70]); } catch (err) { /* diabaikan */ }
          }
        }
      }
    });

    if (!hasChange) return;
    chatEmpty.style.display = chatMessages.length === 0 ? 'block' : 'none';
    if (addedWhileClosed > 0){
      unreadCount += addedWhileClosed;
      updateChatBadge();
    }
    if (chatIsOpen){
      const nearBottom = (chatBody.scrollHeight - chatBody.scrollTop - chatBody.clientHeight) < 160;
      if (nearBottom) requestAnimationFrame(() => { chatBody.scrollTop = chatBody.scrollHeight; });
    }
  }

  chatForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const session = getSession();
    if (!session) return;
    const text = chatInput.value.trim();
    if (!text) return;

    // Anti-spam ringan sisi klien: cegah kirim beruntun terlalu cepat.
    const now = Date.now();
    if (now - lastChatSentAt < CHAT_COOLDOWN_MS){
      showToast('Tunggu sebentar sebelum mengirim pesan lagi.', 'error');
      return;
    }

    const fb = await waitForFirebase(8000);
    if (!fb){ showToast('Chat live tidak tersedia (Firebase gagal tersambung). Coba lagi sesaat.', 'error'); return; }
    lastChatSentAt = now;
    chatInput.value = '';
    try {
      await fb.addDoc(fb.collection(fb.db, fb.CHAT_COLLECTION), {
        nama: session.nama,
        kodeUnik: session.kodeUnik,
        pesan: text.slice(0, 500),
        timestamp: fb.serverTimestamp()
      });
    } catch (err){
      console.warn('Gagal mengirim pesan:', err);
      showToast('Gagal mengirim pesan, coba lagi.', 'error');
    }
  });

  function showChatOffline(reason){
    if (!chatOffline) return;
    chatOffline.style.display = 'block';
    chatOffline.innerHTML = reason || '<i class="fa-solid fa-triangle-exclamation"></i> Firebase belum dikonfigurasi, chat live tidak tersedia.';
  }

  async function startChatListener(){
    if (chatListenerStarted) return;
    // PERBAIKAN: tunggu Firebase siap dulu (chat sering dibuka lebih awal
    // dari waktu SDK selesai dimuat). Sebelumnya flag "chatListenerStarted"
    // langsung dikunci ke true walau gagal, sehingga chat tidak akan
    // pernah dicoba lagi meskipun Firebase belakangan berhasil tersambung.
    const fb = await waitForFirebase();
    if (!fb){
      showChatOffline();
      return; // flag TIDAK dikunci — openChatPanel() boleh coba lagi nanti
    }
    chatListenerStarted = true;
    try {
      const q = fb.query(fb.collection(fb.db, fb.CHAT_COLLECTION), fb.orderBy('timestamp', 'asc'), fb.limit(200));
      fb.onSnapshot(q, (snap) => {
        applyChatChanges(snap.docChanges(), getSession());
        chatFirstLoad = false;
      }, (err) => {
        console.warn('Chat listener error:', err.code, err.message);
        let reason;
        if (err.code === 'permission-denied'){
          reason = '<i class="fa-solid fa-lock"></i> Akses chat ditolak. Cek Firestore Rules — pastikan koleksi <code>chat_pesan</code> mengizinkan <code>allow read: if true</code> dan sudah di-<b>Publish</b>.';
        } else if (err.code === 'not-found' || err.code === 'failed-precondition'){
          reason = '<i class="fa-solid fa-database"></i> Database Firestore belum dibuat. Buka Firebase Console → Build → Firestore Database → Create database.';
        } else if (err.code === 'unavailable'){
          reason = '<i class="fa-solid fa-wifi"></i> Tidak bisa terhubung ke server chat (jaringan bermasalah). Coba muat ulang halaman.';
        } else {
          reason = `<i class="fa-solid fa-triangle-exclamation"></i> Chat live tidak tersedia (${err.code || 'error'}).`;
        }
        showChatOffline(reason);
      });
    } catch (err){
      console.warn('Gagal memulai listener chat:', err);
      showChatOffline();
    }
  }

  function updateChatMemberCount(){
    if (!chatMemberCount) return;
    const total = pesertaData.length;
    chatMemberCount.innerHTML = `<i class="fa-solid fa-user-group"></i> ${total} peserta terdaftar`;
  }

  /* =========================================================
     AKSES DASBOR ADMIN — ketuk logo "LOKON PRIMA" 5x dalam 1.6
     detik untuk membuka halaman login admin di TAB BARU.
     Dasbor admin sekarang halaman terpisah (admin/index.html,
     dengan admin-script.js sendiri) — jadi di sini HANYA trigger
     ringan (hitung ketukan + buka tab), tanpa ikut memuat/menyeret
     logika login, CRUD, atau riwayat aktivitas admin ke situs publik.
  ========================================================= */
  const brandLogo = document.getElementById('brandLogo');
  let logoTapCount = 0;
  let logoTapTimer = null;
  brandLogo?.addEventListener('click', (e) => {
    logoTapCount++;
    clearTimeout(logoTapTimer);
    logoTapTimer = setTimeout(() => { logoTapCount = 0; }, 1600);
    if (logoTapCount >= 5){
      e.preventDefault();
      logoTapCount = 0;
      window.open('admin/index.html', '_blank', 'noopener');
    }
  });

});