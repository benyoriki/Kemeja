/* =========================================================
   LOKON PRIMA — admin-script.js
   Dasbor Admin, HALAMAN TERPISAH dari situs publik (index.html).
   Terhubung ke Firestore & Firebase Auth yang SAMA PERSIS dengan
   situs publik — jadi datanya real-time sinkron, hanya "pintu
   masuknya" saja yang beda (tidak perlu buka index.html dulu).

   File ini diturunkan dari script.js versi situs publik, bagian
   "PANEL ADMIN" (khusus fungsi admin, tanpa kode hero/galeri/
   formulir publik yang tidak dipakai di halaman ini).
========================================================= */

document.addEventListener('DOMContentLoaded', () => {

  /* ============ FIREBASE READY HELPER ============ */
  function waitForFirebase(timeoutMs = 20000){
    if (window.__lokonFirebase) return Promise.resolve(window.__lokonFirebase);
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        window.removeEventListener('lokon-firebase-ready', onReady);
        clearTimeout(timer);
        resolve(window.__lokonFirebase);
      };
      const onReady = () => finish();
      window.addEventListener('lokon-firebase-ready', onReady);
      const timer = setTimeout(finish, timeoutMs);
    });
  }

  /* ============ TOAST NOTIFICATION ============ */
  function showToast(message, type = 'success'){
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-check';
    toast.innerHTML = `<i class="fa-solid ${icon}"></i><span>${message}</span>`;
    document.getElementById('toastContainer').appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  /* ============ RIPPLE BUTTON EFFECT (disalin dari particles.js,
     supaya halaman admin tidak perlu memuat seluruh file animasi
     hero/confetti yang tidak dipakai di sini) ============ */
  document.querySelectorAll('.ripple').forEach(btn => {
    btn.addEventListener('click', function(e){
      const circle = document.createElement('span');
      const diameter = Math.max(this.clientWidth, this.clientHeight);
      const radius = diameter / 2;
      circle.style.width = circle.style.height = `${diameter}px`;
      circle.style.left = `${e.clientX - this.getBoundingClientRect().left - radius}px`;
      circle.style.top = `${e.clientY - this.getBoundingClientRect().top - radius}px`;
      circle.classList.add('ripple-circle');
      const oldRipple = this.querySelector('.ripple-circle');
      if (oldRipple) oldRipple.remove();
      this.appendChild(circle);
      setTimeout(() => circle.remove(), 650);
    });
  });

  /* ============ HELPER UMUM (sama seperti situs publik) ============ */
  const ADMIN_FEE_CICILAN = 5000;

  function formatRupiah(angka){
    return 'Rp' + angka.toLocaleString('id-ID');
  }

  function normalizeWhatsapp(raw){
    let d = String(raw || '').replace(/[^0-9]/g, '');
    if (d.startsWith('0')) d = '62' + d.slice(1);
    if (!d.startsWith('62') && d.length > 0) d = '62' + d;
    return d;
  }

  function escapeHtml(str){
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

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

  const STATUS_LABEL = {
    belum_dp: { label:'Menunggu DP', cls:'badge-warn', icon:'fa-hourglass-half' },
    dp:       { label:'DP Terbayar', cls:'badge-info', icon:'fa-hand-holding-dollar' },
    cicilan:  { label:'Cicilan 2x Berjalan', cls:'badge-info', icon:'fa-coins' },
    lunas:    { label:'Lunas', cls:'badge-success', icon:'fa-crown' }
  };

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
      status: 'belum_dp'
    };
  }

  /* =========================================================
     LISTENER REAL-TIME DATA PESERTA (Firestore) — versi dasbor
     admin: hanya perlu mengisi pesertaData & memanggil ulang
     renderAdminList(), tidak perlu render kartu publik/progress
     bar/dsb seperti di situs utama.
  ========================================================= */
  let pesertaData = [];
  let pesertaListenerStarted = false;
  const adminOfflineNotice = document.getElementById('adminEmpty');

  function showAdminOffline(reason){
    const list = document.getElementById('adminList');
    if (list) list.innerHTML = `<p class="adash-empty" style="grid-column:1/-1;"><i class="fa-solid fa-triangle-exclamation"></i> ${reason || 'Gagal memuat data.'}</p>`;
  }

  function startPesertaListener(){
    if (pesertaListenerStarted) return;
    const fb = window.__lokonFirebase;
    if (!fb){
      showAdminOffline('Firebase belum tersambung. Cek koneksi internet lalu tekan tombol refresh di pojok kanan atas.');
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
        renderAdminList();
      }, (err) => {
        console.warn('Firestore listener error:', err.code, err.message);
        let reason;
        if (err.code === 'permission-denied'){
          reason = '<i class="fa-solid fa-lock"></i> Akses Firestore ditolak. Cek Firestore Rules di Firebase Console.';
        } else if (err.code === 'unavailable'){
          reason = '<i class="fa-solid fa-wifi"></i> Tidak bisa terhubung ke Firestore (jaringan bermasalah).';
        } else {
          reason = `<i class="fa-solid fa-triangle-exclamation"></i> Gagal memuat data peserta (${err.code || 'error'}).`;
        }
        showAdminOffline(reason);
      });
    } catch (err){
      console.warn('Gagal memulai listener peserta:', err);
      showAdminOffline();
    }
  }

  /* =========================================================
     19. PANEL ADMIN — UBAH STATUS PEMBAYARAN
     Akses panel admin TERSEMBUNYI: ketuk logo "LOKON PRIMA" di
     navbar sebanyak 5x dalam waktu singkat untuk membukanya.
     Login memakai username + kata sandi + captcha sederhana
     (soal penjumlahan acak) sebagai pengaman tambahan dari bot.

     Catatan keamanan: validasi ini hanya diperiksa di sisi
     browser (client-side), sehingga bukan pengaman yang kuat.
     Untuk keamanan penuh di produksi nyata, gunakan Firebase
     Authentication + Firestore Security Rules agar hanya admin
     yang benar-benar bisa menulis perubahan data pembayaran.
  ========================================================= */
  const adminOverlay = document.getElementById('adminOverlay');
  const adminLogin = document.getElementById('adminLogin');
  const adminPanel = document.getElementById('adminPanel');
  const adminUsername = document.getElementById('adminUsername');
  const adminPasscode = document.getElementById('adminPasscode');
  const adminPassToggle = document.getElementById('adminPassToggle');
  const adminLoginBtn = document.getElementById('adminLoginBtn');
  const adminCancelBtn = document.getElementById('adminCancelBtn');
  const adminLoginError = document.getElementById('adminLoginError');
  const adminList = document.getElementById('adminList');
  const adminEmpty = document.getElementById('adminEmpty');
  const adminCaptchaQuestion = document.getElementById('adminCaptchaQuestion');
  const adminCaptchaInput = document.getElementById('adminCaptchaInput');
  const adminCaptchaRefresh = document.getElementById('adminCaptchaRefresh');
  const adminLogoutBtn = document.getElementById('adminLogoutBtn');
  const adminRefreshBtn = document.getElementById('adminRefreshBtn');
  const adminExportBtn = document.getElementById('adminExportBtn');
  const adminExportPdfBtn = document.getElementById('adminExportPdfBtn');
  const adminSearchInput = document.getElementById('adminSearch');
  const adminFiltersWrap = document.getElementById('adminFilters');
  const adashClock = document.getElementById('adashClock');
  const adashTotal = document.getElementById('adashTotal');
  const adashPendapatan = document.getElementById('adashPendapatan');
  const adashPendapatanFill = document.getElementById('adashPendapatanFill');
  const adashPendapatanPct = document.getElementById('adashPendapatanPct');
  const adashMenunggu = document.getElementById('adashMenunggu');
  const adashCicilan = document.getElementById('adashCicilan');
  const adashLunas = document.getElementById('adashLunas');
  const chipCountSemua = document.getElementById('chipCountSemua');
  const chipCountBelumDp = document.getElementById('chipCountBelumDp');
  const chipCountDp = document.getElementById('chipCountDp');
  const chipCountCicilan = document.getElementById('chipCountCicilan');
  const chipCountLunas = document.getElementById('chipCountLunas');

  // ---- Riwayat Aktivitas Admin ----
  const adminHistoryBtn = document.getElementById('adminHistoryBtn');
  const adminHistoryOverlay = document.getElementById('adminHistoryOverlay');
  const adminHistoryClose = document.getElementById('adminHistoryClose');
  const adminHistoryList = document.getElementById('adminHistoryList');
  const adminHistoryEmpty = document.getElementById('adminHistoryEmpty');
  const adminHistorySearch = document.getElementById('adminHistorySearch');

  // ---- Modal Konfirmasi Generik ----
  const agcOverlay = document.getElementById('adminGenericConfirmOverlay');
  const agcTitle = document.getElementById('agcTitle');
  const agcMessage = document.getElementById('agcMessage');
  const agcError = document.getElementById('agcError');
  const agcCancelBtn = document.getElementById('agcCancelBtn');
  const agcConfirmBtn = document.getElementById('agcConfirmBtn');
  const agcConfirmLabel = document.getElementById('agcConfirmLabel');

  let adminUnlocked = false;
  let captchaAnswer = null;
  let adminFilter = 'semua';
  let adminSearch = '';
  let adminClockTimer = null;

  /* =========================================================
     PERBAIKAN: MODAL KONFIRMASI GENERIK + RIWAYAT AKTIVITAS ADMIN
     - showAdminConfirm(): dipakai SEBELUM setiap perubahan data di
       dasbor (ubah status bayar, edit peserta, hapus peserta, reset
       chat) supaya admin selalu ditanya ulang "yakin?" dengan
       keterangan jelas apa yang akan berubah, sebelum benar-benar
       disimpan ke Firestore.
     - logAdminAction(): setiap kali perubahan BENAR-BENAR disimpan,
       dicatat ke koleksi Firestore "admin_log" (siapa/admin yang
       login, jam & tanggal, jenis aksi, dan detail perubahannya)
       supaya bisa ditelusuri lewat tombol "Riwayat Aktivitas Admin".
  ========================================================= */
  let agcResolver = null;

  function showAdminConfirm({ title, messageHtml, confirmLabel = 'Ya, Simpan', danger = false }){
    return new Promise((resolve) => {
      if (!agcOverlay){ resolve(true); return; }
      agcResolver = resolve;
      agcTitle.textContent = title || 'Konfirmasi Perubahan';
      agcMessage.innerHTML = messageHtml || 'Apakah Anda yakin ingin menyimpan perubahan ini?';
      agcConfirmLabel.textContent = confirmLabel;
      agcConfirmBtn.className = danger ? 'btn btn-danger ripple' : 'btn btn-primary ripple';
      if (agcError) agcError.textContent = '';
      agcOverlay.classList.add('active');
    });
  }
  function closeAdminConfirm(result){
    if (agcOverlay) agcOverlay.classList.remove('active');
    if (typeof agcResolver === 'function'){
      const r = agcResolver;
      agcResolver = null;
      r(result);
    }
  }
  agcCancelBtn?.addEventListener('click', () => closeAdminConfirm(false));
  agcConfirmBtn?.addEventListener('click', () => closeAdminConfirm(true));
  agcOverlay?.addEventListener('click', (e) => { if (e.target === agcOverlay) closeAdminConfirm(false); });

  function getAdminEmail(){
    return window.__lokonFirebase?.auth?.currentUser?.email || 'Admin (tidak diketahui)';
  }

  // Nama tampilan yang lebih ramah di dasbor, diturunkan dari email admin
  // yang sedang login (contoh: "kamil@lokon.com" -> "Kamil").
  const adashAdminNameEl = document.getElementById('adashAdminName');
  function getAdminDisplayName(){
    const email = getAdminEmail();
    const local = String(email).split('@')[0] || email;
    const pretty = local.replace(/[._-]+/g, ' ').trim();
    return pretty ? pretty.replace(/\b\w/g, c => c.toUpperCase()) : email;
  }
  function updateAdminNameDisplay(){
    if (!adashAdminNameEl) return;
    const email = getAdminEmail();
    adashAdminNameEl.innerHTML = `<i class="fa-solid fa-circle-user"></i> <span>${escapeHtml(getAdminDisplayName())} &middot; ${escapeHtml(email)}</span>`;
  }

  const ADMIN_LOG_COLLECTION = 'admin_log';

  async function logAdminAction(aksi, detail, targetLabel){
    try {
      const fb = window.__lokonFirebase;
      if (!fb) return;
      const now = new Date();
      await fb.addDoc(fb.collection(fb.db, ADMIN_LOG_COLLECTION), {
        admin: getAdminEmail(),
        aksi,
        target: targetLabel || '-',
        detail: detail || '-',
        waktu: now.toISOString(),
        waktuTampil: now.toLocaleDateString('id-ID', { weekday:'long', day:'2-digit', month:'long', year:'numeric' }) +
          ' • ' + now.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit', second:'2-digit' }),
        serverWaktu: fb.serverTimestamp ? fb.serverTimestamp() : null
      });
    } catch (err){
      // Gagal mencatat riwayat TIDAK BOLEH membatalkan aksi utama yang
      // sudah berhasil disimpan — cukup dicatat di console sebagai warning.
      console.warn('Gagal mencatat riwayat admin (diabaikan, tidak fatal):', err.code, err.message);
    }
  }

  const AKSI_ICON = {
    hapus: { cls:'aksi-hapus', icon:'fa-trash' },
    edit: { cls:'aksi-edit', icon:'fa-pen' },
    status: { cls:'aksi-status', icon:'fa-coins' },
    chat: { cls:'aksi-chat', icon:'fa-comment-slash' },
    login: { cls:'aksi-status', icon:'fa-right-to-bracket' }
  };

  let adminHistoryCache = [];
  let adminHistoryLoaded = false;

  async function loadAdminHistory(){
    const fb = await waitForFirebase(8000);
    if (!fb){
      showToast('Tidak bisa memuat riwayat: Firebase belum tersambung.', 'error');
      return;
    }
    try {
      let snap;
      if (typeof fb.getDocs === 'function' && typeof fb.query === 'function'){
        const q = fb.query(fb.collection(fb.db, ADMIN_LOG_COLLECTION), fb.orderBy('waktu', 'desc'), fb.limit(300));
        snap = await fb.getDocs(q);
      } else {
        snap = await fb.getDocs(fb.collection(fb.db, ADMIN_LOG_COLLECTION));
      }
      adminHistoryCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      adminHistoryLoaded = true;
      renderAdminHistory();
    } catch (err){
      console.warn('Gagal memuat riwayat admin:', err.code, err.message);
      showToast('Gagal memuat riwayat aktivitas. Cek Firestore Rules koleksi "admin_log".', 'error');
    }
  }

  function renderAdminHistory(){
    if (!adminHistoryList) return;
    const q = (adminHistorySearch?.value || '').trim().toLowerCase();
    let list = adminHistoryCache.slice();
    if (q){
      list = list.filter(h =>
        (h.admin || '').toLowerCase().includes(q) ||
        (h.aksi || '').toLowerCase().includes(q) ||
        (h.target || '').toLowerCase().includes(q) ||
        (h.detail || '').toLowerCase().includes(q)
      );
    }
    adminHistoryList.innerHTML = '';
    if (adminHistoryEmpty) adminHistoryEmpty.style.display = list.length === 0 ? 'block' : 'none';
    list.forEach(h => {
      const aksiKey = h.aksi === 'hapus' ? 'hapus' : h.aksi === 'edit' ? 'edit' : h.aksi === 'chat' ? 'chat' : 'status';
      const meta = AKSI_ICON[aksiKey] || AKSI_ICON.status;
      const item = document.createElement('div');
      item.className = 'admin-history-item';
      item.innerHTML = `
        <div class="admin-history-top">
          <span class="admin-history-admin"><i class="fa-solid fa-user-shield"></i> ${escapeHtml(h.admin || '-')}</span>
          <span class="admin-history-time">${escapeHtml(h.waktuTampil || '-')}</span>
        </div>
        <span class="admin-history-aksi ${meta.cls}"><i class="fa-solid ${meta.icon}"></i> ${escapeHtml(h.aksi || '-')}</span>
        <div class="admin-history-detail"><b>${escapeHtml(h.target || '-')}</b> — ${escapeHtml(h.detail || '-')}</div>
      `;
      adminHistoryList.appendChild(item);
    });
  }

  adminHistoryBtn?.addEventListener('click', () => {
    adminHistoryOverlay?.classList.add('active');
    loadAdminHistory();
  });
  adminHistoryClose?.addEventListener('click', () => adminHistoryOverlay?.classList.remove('active'));
  adminHistoryOverlay?.addEventListener('click', (e) => { if (e.target === adminHistoryOverlay) adminHistoryOverlay.classList.remove('active'); });
  adminHistorySearch?.addEventListener('input', renderAdminHistory);

  function newCaptcha(){
    const a = Math.floor(Math.random() * 8) + 1;
    const b = Math.floor(Math.random() * 8) + 1;
    captchaAnswer = a + b;
    if (adminCaptchaQuestion) adminCaptchaQuestion.textContent = `${a} + ${b}`;
    if (adminCaptchaInput) adminCaptchaInput.value = '';
  }
  adminCaptchaRefresh?.addEventListener('click', newCaptcha);

  // Tombol mata untuk lihat/sembunyikan kata sandi admin saat mengetik.
  adminPassToggle?.addEventListener('click', () => {
    const showing = adminPasscode.type === 'text';
    adminPasscode.type = showing ? 'password' : 'text';
    adminPassToggle.innerHTML = showing ? '<i class="fa-solid fa-eye"></i>' : '<i class="fa-solid fa-eye-slash"></i>';
  });

  function resetAdminLoginForm(){
    if (adminUsername) adminUsername.value = '';
    if (adminPasscode) { adminPasscode.value = ''; adminPasscode.type = 'password'; }
    if (adminPassToggle) adminPassToggle.innerHTML = '<i class="fa-solid fa-eye"></i>';
    if (adminLoginError) adminLoginError.textContent = '';
    newCaptcha();
  }

  function startAdminClock(){
    if (!adashClock) return;
    const update = () => {
      const now = new Date();
      adashClock.textContent = now.toLocaleDateString('id-ID', { weekday:'long', day:'2-digit', month:'long', year:'numeric' }) +
        ' • ' + now.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
    };
    update();
    clearInterval(adminClockTimer);
    adminClockTimer = setInterval(update, 1000);
  }
  function stopAdminClock(){ clearInterval(adminClockTimer); }

  /* =========================================================
     AUTO-LOGOUT KARENA TIDAK ADA AKTIVITAS
     - Jika tidak ada gerakan mouse/klik/ketikan/sentuhan/scroll di
       dasbor selama IDLE_LIMIT_SECONDS (1 menit), admin otomatis
       logout (keluar dari Firebase Auth) demi keamanan.
     - Widget hitung mundur (adashIdleBanner) HANYA muncul saat
       admin sudah diam selama IDLE_WARN_SECONDS terakhir sebelum
       batas waktu tercapai. Begitu ada aktivitas apa pun, widget
       langsung disembunyikan lagi dan hitungan direset ke awal.
  ========================================================= */
  const IDLE_LIMIT_SECONDS = 60;   // total waktu diam sebelum auto-logout
  const IDLE_WARN_SECONDS = 15;    // sisa waktu saat hitung mundur mulai tampil
  const adashIdleBanner = document.getElementById('adashIdleBanner');
  const adashIdleTime = document.getElementById('adashIdleTime');
  const adashIdleRing = document.getElementById('adashIdleRing');
  const adashIdleStay = document.getElementById('adashIdleStay');
  const IDLE_ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'wheel', 'scroll', 'touchstart', 'click'];

  let idleLastActivityAt = Date.now();
  let idleTickTimer = null;

  function markAdminActivity(){
    idleLastActivityAt = Date.now();
    if (adashIdleBanner) adashIdleBanner.classList.remove('show');
  }

  function tickIdleWatcher(){
    if (!adminUnlocked) return;
    const idleSeconds = Math.floor((Date.now() - idleLastActivityAt) / 1000);
    const remaining = IDLE_LIMIT_SECONDS - idleSeconds;

    if (remaining <= 0){
      stopIdleWatcher();
      showToast('Sesi berakhir otomatis karena 1 menit tidak ada aktivitas.', 'error');
      logoutAdmin();
      return;
    }

    if (remaining <= IDLE_WARN_SECONDS){
      if (adashIdleBanner) adashIdleBanner.classList.add('show');
      const mm = Math.floor(remaining / 60);
      const ss = remaining % 60;
      if (adashIdleTime) adashIdleTime.textContent = `${mm}:${String(ss).padStart(2, '0')}`;
      if (adashIdleRing) adashIdleRing.style.setProperty('--p', String(Math.round((remaining / IDLE_WARN_SECONDS) * 100)));
    } else if (adashIdleBanner) {
      adashIdleBanner.classList.remove('show');
    }
  }

  function startIdleWatcher(){
    idleLastActivityAt = Date.now();
    if (adashIdleBanner) adashIdleBanner.classList.remove('show');
    clearInterval(idleTickTimer);
    idleTickTimer = setInterval(tickIdleWatcher, 1000);
    IDLE_ACTIVITY_EVENTS.forEach(evt => window.addEventListener(evt, markAdminActivity, { passive: true }));
  }

  function stopIdleWatcher(){
    clearInterval(idleTickTimer);
    idleTickTimer = null;
    if (adashIdleBanner) adashIdleBanner.classList.remove('show');
    IDLE_ACTIVITY_EVENTS.forEach(evt => window.removeEventListener(evt, markAdminActivity));
  }

  // Tombol "Saya masih di sini" di dalam widget hitung mundur — menghitung
  // sebagai aktivitas juga (klik tombol otomatis kena listener 'click',
  // tapi dipanggil eksplisit di sini supaya widget langsung tertutup
  // tanpa menunggu tick berikutnya).
  adashIdleStay?.addEventListener('click', markAdminActivity);

  // Halaman ini SELALU tampil penuh (bukan modal yang bisa ditutup) —
  // begitu dibuka, langsung tampilkan layar login (kecuali sesi Firebase
  // Auth sebelumnya masih aktif, ditangani watchAdminAuthState di bawah).
  resetAdminLoginForm();

  async function logoutAdmin(){
    adminUnlocked = false;
    adminOverlay.classList.remove('admin-dash-mode');
    stopAdminClock();
    stopIdleWatcher();
    const fb = window.__lokonFirebase;
    if (fb?.auth){
      try { await fb.signOut(fb.auth); } catch (err){ console.warn('Gagal logout dari Firebase Auth:', err); }
    }
    adminLogin.style.display = 'block';
    adminPanel.style.display = 'none';
    resetAdminLoginForm();
    showToast('Berhasil keluar dari dasbor admin.', 'success');
  }

  // PERBAIKAN: pantau status login Firebase Authentication secara real-time.
  // - Kalau admin sudah pernah login sebelumnya (sesi Firebase Auth masih
  //   tersimpan di browser), dasbor otomatis kebuka lagi tanpa perlu
  //   login ulang tiap buka halaman — ini yang membuat "buka sekali,
  //   langsung dasbor" terasa seperti aplikasi tersendiri.
  // - Kalau sesi berakhir/di-logout dari perangkat lain, otomatis
  //   kembali ke layar login di sini juga.
  function watchAdminAuthState(fb){
    fb.onAuthStateChanged(fb.auth, (user) => {
      if (user && !adminUnlocked){
        adminUnlocked = true;
        adminLogin.style.display = 'none';
        adminPanel.style.display = 'block';
        adminOverlay.classList.add('admin-dash-mode');
        updateAdminNameDisplay();
        startAdminClock();
        startIdleWatcher();
        startPesertaListener();
        renderAdminList();
      } else if (!user && adminUnlocked){
        adminUnlocked = false;
        adminOverlay.classList.remove('admin-dash-mode');
        adminLogin.style.display = 'block';
        adminPanel.style.display = 'none';
        stopAdminClock();
        stopIdleWatcher();
      }
    });
  }

  adminLogoutBtn?.addEventListener('click', logoutAdmin);

  adminLoginBtn?.addEventListener('click', async () => {
    const email = adminUsername.value.trim();
    const pass = adminPasscode.value;

    if (parseInt(adminCaptchaInput.value, 10) !== captchaAnswer){
      adminLoginError.textContent = 'Jawaban verifikasi salah, coba lagi.';
      newCaptcha();
      return;
    }
    if (!email || !pass){
      adminLoginError.textContent = 'Email dan kata sandi wajib diisi.';
      return;
    }

    adminLoginBtn.disabled = true;
    adminLoginError.textContent = '';
    const fb = await waitForFirebase(8000);
    if (!fb || !fb.auth){
      adminLoginError.textContent = 'Tidak bisa terhubung ke server login. Cek koneksi internet lalu coba lagi.';
      adminLoginBtn.disabled = false;
      return;
    }

    try {
      // Login SUNGGUHAN lewat Firebase Authentication — bukan lagi
      // dicocokkan manual di JavaScript. Akun admin dibuat lewat
      // Firebase Console > Authentication > Users.
      await fb.signInWithEmailAndPassword(fb.auth, email, pass);
      adminUnlocked = true;
      adminLogin.style.display = 'none';
      adminPanel.style.display = 'block';
      adminOverlay.classList.add('admin-dash-mode');
      updateAdminNameDisplay();
      startAdminClock();
      startIdleWatcher();
      startPesertaListener();
      renderAdminList();
      logAdminAction('login', 'Admin berhasil masuk ke dasbor.', email);
    } catch (err){
      console.warn('Login admin gagal:', err.code, err.message);
      const map = {
        'auth/invalid-email': 'Format email tidak valid.',
        'auth/user-not-found': 'Email admin tidak ditemukan.',
        'auth/wrong-password': 'Kata sandi salah.',
        'auth/invalid-credential': 'Email atau kata sandi salah.',
        'auth/too-many-requests': 'Terlalu banyak percobaan gagal. Coba lagi beberapa menit lagi.',
        'auth/network-request-failed': 'Koneksi bermasalah, coba lagi.'
      };
      adminLoginError.textContent = map[err.code] || 'Login gagal. Periksa kembali email & kata sandi.';
      newCaptcha();
    } finally {
      adminLoginBtn.disabled = false;
    }
  });

  // Aktifkan pemantauan sesi login begitu Firebase siap.
  (async () => {
    const fb = await waitForFirebase();
    if (fb?.auth) watchAdminAuthState(fb);
  })();

  adminRefreshBtn?.addEventListener('click', async () => {
    if (!window.__lokonFirebase && typeof window.__lokonRetryFirebase === 'function'){
      adminRefreshBtn.disabled = true;
      await window.__lokonRetryFirebase();
      adminRefreshBtn.disabled = false;
      if (window.__lokonFirebase) startPesertaListener();
    }
    renderAdminList();
    showToast(window.__lokonFirebase ? 'Data dasbor disegarkan.' : 'Masih belum tersambung ke database.', window.__lokonFirebase ? 'success' : 'error');
  });

  adminSearchInput?.addEventListener('input', (e) => {
    adminSearch = e.target.value;
    renderAdminList();
  });

  adminFiltersWrap?.addEventListener('click', (e) => {
    const btn = e.target.closest('.adash-chip');
    if (!btn) return;
    adminFiltersWrap.querySelectorAll('.adash-chip').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    adminFilter = btn.dataset.filter;
    renderAdminList();
  });

  /* ---- Export data peserta ke file CSV (dibuka di Excel/Sheets) ---- */
  adminExportBtn?.addEventListener('click', () => {
    if (!pesertaData.length){
      showToast('Belum ada data untuk diexport.', 'error');
      return;
    }
    const header = ['Kode Unik','Nama','Nama Bordir','WhatsApp','Departemen','Jenis Kelamin','Ukuran','Jenis Kemeja','Jumlah','Total','Metode Bayar','Status','Total Dibayar'];
    const rows = pesertaData.map(p => [
      p.kodeUnik || '', p.nama || '', p.namaBordir || '', p.whatsapp || '', p.departemen || '', p.gender || '',
      p.ukuranKemeja || '', p.jenis || '', p.jumlah || 0, p.total || 0,
      p.pembayaran?.metode === 'cicilan' ? '2x Cicilan' : 'Tunai',
      STATUS_LABEL[p.pembayaran?.status || 'belum_dp']?.label || '-',
      p.pembayaran?.totalDibayar || 0
    ]);
    const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type:'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `peserta-kemeja-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Data berhasil diexport ke CSV.', 'success');
  });

  /* =========================================================
     18b. EXPORT DAFTAR PESERTA SEBAGAI FILE PDF
     Diganti dari versi gambar (.jpg) ke dokumen PDF asli: teks di
     tabelnya digambar sebagai VEKTOR (bukan piksel), jadi tetap
     tajam & enak dibaca walau daftar pesertanya sangat panjang —
     beda dengan JPG lama yang gampang buram kalau datanya makin
     banyak. Dibuat pakai jsPDF + AutoTable, dengan tata letak
     kartu, badge status berwarna, kartu info rekening, ringkasan,
     dan penomoran halaman — supaya nuansa modern & premiumnya
     tetap sama (bahkan lebih rapi & lebih profesional untuk
     dibagikan atau dicetak) dibanding versi gambar sebelumnya.
  ========================================================= */
  function formatTanggalJamIndo(date){
    const HARI = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
    const BULAN = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
    const jam = String(date.getHours()).padStart(2,'0');
    const menit = String(date.getMinutes()).padStart(2,'0');
    return {
      hariTanggal: `${HARI[date.getDay()]}, ${date.getDate()} ${BULAN[date.getMonth()]} ${date.getFullYear()}`,
      jam: `${jam}.${menit} WIB`
    };
  }

  function hexToRgbArr(hex){
    const h = hex.replace('#','');
    return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
  }

  function pdfLerpColor(c1, c2, t){
    return [
      Math.round(c1[0] + (c2[0]-c1[0])*t),
      Math.round(c1[1] + (c2[1]-c1[1])*t),
      Math.round(c1[2] + (c2[2]-c1[2])*t)
    ];
  }

  // jsPDF tidak punya gradient asli untuk fill sederhana, jadi
  // disimulasikan dengan banyak potongan tipis vertikal — cukup
  // untuk garis aksen brand tipis di bawah header.
  function pdfGradientRect(doc, x, y, w, h, hexFrom, hexTo, steps = 48){
    const c1 = hexToRgbArr(hexFrom), c2 = hexToRgbArr(hexTo);
    const stepW = w / steps;
    for (let i = 0; i < steps; i++){
      const [r,g,b] = pdfLerpColor(c1, c2, i/(steps-1));
      doc.setFillColor(r,g,b);
      doc.rect(x + i*stepW, y, stepW + 0.6, h, 'F');
    }
  }

  // Lencana centang kecil khusus status LUNAS di dalam badge PDF.
  function pdfCheckMark(doc, cx, cy, r, colorHex){
    const [rr,gg,bb] = hexToRgbArr(colorHex);
    doc.setDrawColor(rr,gg,bb);
    doc.setLineWidth(1.2);
    doc.line(cx - r*0.5, cy, cx - r*0.05, cy + r*0.45);
    doc.line(cx - r*0.05, cy + r*0.45, cx + r*0.55, cy - r*0.45);
  }

  async function exportPesertaAsPdf(){
    if (!pesertaData.length){
      showToast('Belum ada data peserta untuk diunduh.', 'error');
      return;
    }
    if (!window.jspdf || !window.jspdf.jsPDF){
      showToast('Modul PDF belum siap dimuat — cek koneksi internet lalu coba lagi.', 'error');
      return;
    }
    const iconEl = adminExportPdfBtn.querySelector('i');
    adminExportPdfBtn.disabled = true;
    iconEl?.classList.replace('fa-file-pdf', 'fa-circle-notch');
    iconEl?.classList.add('fa-spin');
    try {
      const { jsPDF } = window.jspdf;
      const rows = [...pesertaData].sort((a, b) => (a._ms || 0) - (b._ms || 0));
      const lunasCount = rows.filter(p => p.pembayaran?.status === 'lunas').length;
      const dpCount = rows.filter(p => p.pembayaran?.status !== 'lunas' && (p.pembayaran?.totalDibayar || 0) > 0).length;
      const totalTerkumpul = rows.reduce((sum, p) => sum + (p.pembayaran?.totalDibayar || 0), 0);

      const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
      const PAGE_W = doc.internal.pageSize.getWidth();
      const PAGE_H = doc.internal.pageSize.getHeight();
      const MARGIN = 40;
      const CONTENT_W = PAGE_W - MARGIN * 2;

      const NAVY = '#0B2545', TEAL = '#0D9488', BLUE = '#12A9E0', TEAL2 = '#0FD8B8';
      const SLATE = '#475569', SLATE_L = '#64748B', SLATE_XL = '#94A3B8';
      const [navyR,navyG,navyB] = hexToRgbArr(NAVY);
      const [tealR,tealG,tealB] = hexToRgbArr(TEAL);
      const [slateR,slateG,slateB] = hexToRgbArr(SLATE);
      const [slateLR,slateLG,slateLB] = hexToRgbArr(SLATE_L);

      const REKENING = { bank: 'Bank BCA', nomor: '0830142452', atasNama: 'KAMIL MUHAMMAD NUR' };
      const { hariTanggal, jam } = formatTanggalJamIndo(new Date());

      /* ===== HEADER (halaman pertama) ===== */
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(slateR, slateG, slateB);
      doc.text('PT. LOKON PRIMA — DISTRIBUTOR AIR MINUM', MARGIN, 42);

      doc.setFillColor(204, 251, 241);
      doc.roundedRect(MARGIN, 52, 172, 22, 11, 11, 'F');
      doc.setFillColor(tealR, tealG, tealB);
      doc.circle(MARGIN + 14, 63, 3, 'F');
      doc.setFont('courier', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(tealR, tealG, tealB);
      doc.text('DAFTAR PESERTA RESMI', MARGIN + 24, 66);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(26);
      doc.setTextColor(navyR, navyG, navyB);
      doc.text('Kemeja Kerja 2026', MARGIN, 108);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11.5);
      doc.setTextColor(navyR, navyG, navyB);
      doc.text(`${hariTanggal}  •  Diperbarui pukul ${jam}`, MARGIN, 126);

      /* ===== KARTU RINGKAS REKENING + WEBSITE (kanan atas header) —
         mengisi ruang kosong di sebelah judul, supaya info transfer
         langsung terlihat begitu PDF dibuka, tanpa perlu ke halaman
         terakhir. Kartu lengkap (dengan ringkasan & logo BCA) tetap
         dipertahankan di bawah tabel sebagai rujukan detail. ===== */
      const miniCardW = 205, miniCardH = 100, miniCardX = MARGIN + CONTENT_W - miniCardW, miniCardY = 36;
      doc.setFillColor(239, 252, 249);
      doc.roundedRect(miniCardX, miniCardY, miniCardW, miniCardH, 10, 10, 'F');
      doc.setDrawColor(18, 169, 224);
      doc.setLineWidth(0.7);
      doc.roundedRect(miniCardX, miniCardY, miniCardW, miniCardH, 10, 10, 'S');

      const miniPadX = 14;
      doc.setFont('courier', 'bold');
      doc.setFontSize(7.3);
      doc.setTextColor(tealR, tealG, tealB);
      doc.text('TRANSFER PEMBAYARAN KE', miniCardX + miniPadX, miniCardY + 15);

      doc.setFont('courier', 'bold');
      doc.setFontSize(15.5);
      doc.setTextColor(navyR, navyG, navyB);
      doc.text(REKENING.nomor, miniCardX + miniPadX, miniCardY + 34);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.3);
      doc.setTextColor(slateR, slateG, slateB);
      doc.text(`${REKENING.bank}  •  a.n. ${REKENING.atasNama}`, miniCardX + miniPadX, miniCardY + 48);

      // Garis pemisah tipis sebelum link website
      doc.setDrawColor(204, 251, 241);
      doc.setLineWidth(0.6);
      doc.line(miniCardX + miniPadX, miniCardY + 57, miniCardX + miniCardW - miniPadX, miniCardY + 57);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.6);
      doc.setTextColor(tealR, tealG, tealB);
      doc.text('WEBSITE PENDAFTARAN RESMI', miniCardX + miniPadX, miniCardY + 70);

      doc.setFillColor(tealR, tealG, tealB);
      doc.circle(miniCardX + miniPadX + 3, miniCardY + 87, 3, 'F');
      doc.setFont('courier', 'bold');
      doc.setFontSize(10.8);
      doc.setTextColor(navyR, navyG, navyB);
      doc.text('benyoriki.github.io/Kemeja', miniCardX + miniPadX + 12, miniCardY + 90);

      pdfGradientRect(doc, MARGIN, 138, CONTENT_W, 2.4, BLUE, TEAL2);

      /* ===== BANNER "TOTAL UANG TERKUMPUL" (full-width, di bawah header) —
         info paling dicari duluan: berapa dana yang sudah masuk sejauh ini.
         Latar navy solid + garis emas tipis kasih kesan premium/mewah. ===== */
      const bannerY = 158, bannerH = 66;
      doc.setFillColor(navyR, navyG, navyB);
      doc.roundedRect(MARGIN, bannerY, CONTENT_W, bannerH, 12, 12, 'F');
      pdfGradientRect(doc, MARGIN + 12, bannerY + bannerH - 3, CONTENT_W - 24, 1.6, TEAL2, BLUE);

      // Ikon koin (dua lingkaran bertumpuk) dalam kotak teal.
      const bIconSize = 40, bIconX = MARGIN + 16, bIconY = bannerY + (bannerH - bIconSize) / 2;
      doc.setFillColor(tealR, tealG, tealB);
      doc.roundedRect(bIconX, bIconY, bIconSize, bIconSize, 9, 9, 'F');
      doc.setFillColor(255, 255, 255);
      doc.circle(bIconX + bIconSize/2 - 5, bIconY + bIconSize/2 + 3, 8, 'F');
      doc.setFillColor(tealR, tealG, tealB);
      doc.circle(bIconX + bIconSize/2 - 5, bIconY + bIconSize/2 + 3, 8, 'S');
      doc.setFillColor(255, 255, 255);
      doc.circle(bIconX + bIconSize/2 + 6, bIconY + bIconSize/2 - 5, 8, 'F');
      doc.setDrawColor(tealR, tealG, tealB);
      doc.setLineWidth(1);
      doc.circle(bIconX + bIconSize/2 + 6, bIconY + bIconSize/2 - 5, 8, 'S');

      const bTextX = bIconX + bIconSize + 16;
      doc.setFont('courier', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(204, 251, 241);
      doc.text('TOTAL UANG TERKUMPUL', bTextX, bannerY + 24);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(21);
      doc.setTextColor(255, 255, 255);
      doc.text(formatRupiah(totalTerkumpul), bTextX, bannerY + 49);

      // Garis pemisah vertikal + ringkasan cepat total peserta/lunas/DP di sisi kanan banner.
      const divX = MARGIN + CONTENT_W - 280;
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(0.6);
      doc.line(divX, bannerY + 14, divX, bannerY + bannerH - 14);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(19);
      doc.setTextColor(255, 255, 255);
      doc.text(String(rows.length), divX + 16, bannerY + 28);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(255, 255, 255);
      doc.text('TOTAL PESERTA', divX + 16, bannerY + 40);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(19);
      doc.setTextColor(255, 255, 255);
      doc.text(String(lunasCount), divX + 108, bannerY + 28);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(255, 255, 255);
      doc.text('LUNAS', divX + 108, bannerY + 40);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(19);
      doc.setTextColor(255, 255, 255);
      doc.text(String(dpCount), divX + 200, bannerY + 28);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(255, 255, 255);
      doc.text('DP BERJALAN', divX + 200, bannerY + 40);

      const HEADER_BOTTOM = bannerY + bannerH + 26;

      /* ===== TABEL PESERTA ===== */
      const STATUS_COLORS = {
        lunas:    { bg: [220,252,231], fg: [21,128,61] },
        dp:       { bg: [254,243,199], fg: [180,83,9]  },
        belum_dp: { bg: [252,234,234], fg: [192,57,43] }
      };

      const tableRows = rows.map((p, i) => {
        const status = p.pembayaran?.status || 'belum_dp';
        const dibayar = p.pembayaran?.totalDibayar || 0;
        const isLunas = status === 'lunas';
        const isDp = !isLunas && dibayar > 0;
        const statusKey = isLunas ? 'lunas' : (isDp ? 'dp' : 'belum_dp');
        const statusText = isLunas ? 'LUNAS' : (isDp ? `DP ${formatRupiah(dibayar)}` : 'Belum DP');
        return {
          cells: [String(i + 1), p.nama || '-', p.namaBordir || '-', p.ukuranKemeja || '-',
                  p.jenis === 'Lengan Panjang' ? 'Panjang' : 'Pendek', statusText],
          statusKey, statusText
        };
      });

      doc.autoTable({
        startY: HEADER_BOTTOM,
        margin: { left: MARGIN, right: MARGIN, top: 54, bottom: 70 },
        head: [['NO', 'NAMA PESERTA', 'NAMA BORDIR', 'UKURAN', 'LENGAN', 'STATUS PEMBAYARAN']],
        body: tableRows.map(r => r.cells),
        theme: 'plain',
        styles: {
          font: 'helvetica', fontSize: 9.5,
          cellPadding: { top: 8, bottom: 8, left: 10, right: 6 },
          textColor: [71, 85, 105], lineColor: [226, 232, 240], lineWidth: { bottom: 0.6 },
          valign: 'middle'
        },
        headStyles: {
          fillColor: [11, 37, 69], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.6,
          cellPadding: { top: 10, bottom: 10, left: 10, right: 6 }, lineWidth: 0
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { cellWidth: 32, halign: 'center', textColor: [148, 163, 184], fontStyle: 'bold', cellPadding: { top: 8, bottom: 8, left: 4, right: 4 } },
          1: { cellWidth: 138, fontStyle: 'bold', textColor: [15, 23, 42], fontSize: 10 },
          2: { cellWidth: 92 },
          3: { cellWidth: 55, halign: 'center', font: 'courier', fontStyle: 'bold', textColor: [3, 105, 161] },
          4: { cellWidth: 58, halign: 'center', textColor: [100, 116, 139], cellPadding: { top: 8, bottom: 8, left: 3, right: 3 } },
          5: { cellWidth: 140, halign: 'left' }
        },
        didParseCell: (data) => {
          // Sembunyikan teks asli kolom status — akan digambar ulang
          // sebagai badge berwarna lewat didDrawCell di bawah, supaya
          // tampil sebagai "pill" bukan teks polos.
          if (data.section === 'body' && data.column.index === 5){
            data.cell.text = [];
          }
        },
        didDrawCell: (data) => {
          if (data.section !== 'body') return;
          const info = tableRows[data.row.index];
          if (!info) return;

          // Garis aksen tipis di kiri tiap baris sesuai status pembayaran —
          // bantu mata memindai daftar panjang tanpa perlu baca satu-satu.
          if (data.column.index === 0){
            const accent = info.statusKey === 'lunas' ? [22,163,74]
              : info.statusKey === 'dp' ? [217,119,6] : [224,82,79];
            doc.setFillColor(...accent);
            doc.rect(MARGIN, data.cell.y, 2.6, data.cell.height, 'F');
          }

          // Badge status berwarna, dengan lencana centang khusus untuk LUNAS.
          if (data.column.index === 5){
            const conf = STATUS_COLORS[info.statusKey];
            const isLunas = info.statusKey === 'lunas';
            doc.setFont('courier', 'bold');
            doc.setFontSize(8.6);
            const textW = doc.getTextWidth(info.statusText);
            const badgeExtra = isLunas ? 15 : 0;
            const badgeW = Math.min(textW + 20 + badgeExtra, data.cell.width - 8);
            const badgeH = 16;
            const badgeX = data.cell.x + 4;
            const badgeY = data.cell.y + (data.cell.height - badgeH) / 2;
            doc.setFillColor(...conf.bg);
            doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 8, 8, 'F');
            doc.setTextColor(...conf.fg);
            if (isLunas){
              doc.setDrawColor(21,128,61);
              doc.setLineWidth(0.6);
              doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 8, 8, 'S');
              pdfCheckMark(doc, badgeX + 13, badgeY + badgeH/2, 5, '#16A34A');
              doc.text(info.statusText, badgeX + 22, badgeY + badgeH/2 + 3);
            } else {
              doc.text(info.statusText, badgeX + 10, badgeY + badgeH/2 + 3);
            }
          }
        },
        didDrawPage: (data) => {
          // Strip merek tipis di bagian atas tiap halaman ke-2 dst, supaya
          // tabel yang panjang tetap kelihatan identitasnya di setiap halaman.
          if (data.pageNumber > 1){
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.setTextColor(slateR, slateG, slateB);
            doc.text('PT. LOKON PRIMA — Daftar Peserta Kemeja Kerja 2026', MARGIN, 28);
            pdfGradientRect(doc, MARGIN, 36, CONTENT_W, 1.6, BLUE, TEAL2);
          }
        }
      });

      /* =========================================================
         KARTU "TOTAL UANG TERKUMPUL" (penutup) — menggantikan kartu
         rekening yang dulu ada di sini (sudah dipindah & cukup
         ditampilkan sekali di banner atas, jadi tidak perlu diulang).
         Latar gradasi navy → teal untuk kesan premium di akhir dokumen.
      ========================================================= */
      const CARD_H = 78, CARD_GAP = 26, SUMMARY_BLOCK_H = 155;
      let finalY = doc.lastAutoTable.finalY + CARD_GAP;
      if (finalY + CARD_H + SUMMARY_BLOCK_H > PAGE_H - 40){
        doc.addPage();
        finalY = 56;
      }

      doc.setFillColor(navyR, navyG, navyB);
      doc.roundedRect(MARGIN, finalY, CONTENT_W, CARD_H, 12, 12, 'F');
      pdfGradientRect(doc, MARGIN + 12, finalY + 5, CONTENT_W - 24, 2, TEAL2, BLUE);
      doc.setDrawColor(navyR, navyG, navyB);
      doc.setLineWidth(0.8);
      doc.roundedRect(MARGIN, finalY, CONTENT_W, CARD_H, 12, 12, 'S');

      const iconSize = 42, iconX = MARGIN + 18, iconY = finalY + (CARD_H - iconSize) / 2;
      doc.setFillColor(255, 255, 255);
      doc.circle(iconX + iconSize/2 - 6, iconY + iconSize/2 + 4, 9, 'F');
      doc.circle(iconX + iconSize/2 + 7, iconY + iconSize/2 - 6, 9, 'F');

      const textX = iconX + iconSize + 20;
      doc.setFont('courier', 'bold');
      doc.setFontSize(8.8);
      doc.setTextColor(224, 253, 246);
      doc.text('TOTAL UANG TERKUMPUL', textX, finalY + 26);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(23);
      doc.setTextColor(255, 255, 255);
      doc.text(formatRupiah(totalTerkumpul), textX, finalY + 55);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(224, 253, 246);
      doc.text(`per ${hariTanggal}, ${jam}`, MARGIN + CONTENT_W - 16, finalY + CARD_H - 14, { align: 'right' });

      const sumY = finalY + CARD_H + 34;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12.5);
      doc.setTextColor(navyR, navyG, navyB);
      const totalLabel = `Total ${rows.length} Peserta`;
      doc.text(totalLabel, MARGIN, sumY);
      const totalLabelW = doc.getTextWidth(totalLabel);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10.5);
      doc.setTextColor(slateLR, slateLG, slateLB);
      doc.text(`•  ${lunasCount} Lunas   •  ${dpCount} DP Terbayar`, MARGIN + totalLabelW + 14, sumY);

      const capY = sumY + 28;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(tealR, tealG, tealB);
      doc.text('WEBSITE DAFTAR BAJU LOKON PRIMA', MARGIN, capY);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(...hexToRgbArr('#DC2626'));
      doc.text('Cek berkala status produksi kemejamu di link website ini', MARGIN, capY + 15);

      const linkText = 'benyoriki.github.io/Kemeja';
      doc.setFont('courier', 'bold');
      doc.setFontSize(14);
      const linkTextW = doc.getTextWidth(linkText);
      const iconD = 26, linkPadL = 12, linkPadR = 18, gapIconText = 12;
      const linkW = linkPadL + iconD + gapIconText + linkTextW + linkPadR;
      const linkH = 36, linkY = capY + 24;

      doc.setFillColor(230, 247, 244);
      doc.roundedRect(MARGIN, linkY, linkW, linkH, 18, 18, 'F');
      doc.setDrawColor(13, 148, 136);
      doc.setLineWidth(0.9);
      doc.roundedRect(MARGIN, linkY, linkW, linkH, 18, 18, 'S');

      // Ikon globe sederhana: lingkaran teal + garis lintang/bujur putih.
      const gCx = MARGIN + linkPadL + iconD / 2, gCy = linkY + linkH / 2;
      doc.setFillColor(tealR, tealG, tealB);
      doc.circle(gCx, gCy, iconD / 2, 'F');
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(0.9);
      doc.line(gCx - iconD / 2 + 2.5, gCy, gCx + iconD / 2 - 2.5, gCy);
      doc.ellipse(gCx, gCy, iconD / 2 - 6.5, iconD / 2, 'S');

      doc.setFont('courier', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(navyR, navyG, navyB);
      doc.text(linkText, MARGIN + linkPadL + iconD + gapIconText, gCy + 4.5);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(slateR, slateG, slateB);
      doc.text('Otomatis Sistem Apache Spark, DBMS di kembangan oleh @benyoriki website Developer', MARGIN, linkY + linkH + 22);

      /* ===== NOMOR HALAMAN — dipasang terakhir, karena total halaman
         baru pasti diketahui setelah semua konten selesai digambar ===== */
      const totalPages = doc.internal.getNumberOfPages();
      for (let p = 1; p <= totalPages; p++){
        doc.setPage(p);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(...hexToRgbArr(SLATE_XL));
        doc.text(`Halaman ${p} dari ${totalPages}`, PAGE_W - MARGIN, PAGE_H - 24, { align: 'right' });
      }

      doc.save(`daftar-peserta-kemeja-${new Date().toISOString().slice(0,10)}.pdf`);
      showToast('Dokumen PDF daftar peserta berhasil diunduh — rapi, tajam & siap dibagikan.', 'success');
    } catch (err){
      console.error('Gagal membuat PDF daftar peserta:', err);
      showToast('Terjadi kesalahan saat membuat PDF.', 'error');
    } finally {
      adminExportPdfBtn.disabled = false;
      iconEl?.classList.remove('fa-spin');
      iconEl?.classList.replace('fa-circle-notch', 'fa-file-pdf');
    }
  }

  adminExportPdfBtn?.addEventListener('click', exportPesertaAsPdf);

  /* =========================================================
     19b. ADMIN — HAPUS / RESET CHAT GRUP PESERTA
     Menghapus SELURUH pesan di koleksi "chat_pesan" (Firestore),
     jadi bersih untuk semua orang yang membuka grup chat. Dipakai
     kalau chat sudah terlalu penuh, banyak spam, atau admin ingin
     memulai grup baru. Ada konfirmasi 2 langkah supaya tidak
     terhapus tidak sengaja, karena tindakan ini PERMANEN.
  ========================================================= */
  const adminResetChatBtn = document.getElementById('adminResetChatBtn');
  const resetChatOverlay = document.getElementById('resetChatOverlay');
  const resetChatCancelBtn = document.getElementById('resetChatCancelBtn');
  const resetChatConfirmBtn = document.getElementById('resetChatConfirmBtn');

  function openResetChatConfirm(){
    if (!resetChatOverlay) return;
    resetChatOverlay.classList.add('active');
  }
  function closeResetChatConfirm(){
    if (!resetChatOverlay) return;
    resetChatOverlay.classList.remove('active');
  }

  adminResetChatBtn?.addEventListener('click', openResetChatConfirm);
  resetChatCancelBtn?.addEventListener('click', closeResetChatConfirm);
  resetChatOverlay?.addEventListener('click', (e) => { if (e.target === resetChatOverlay) closeResetChatConfirm(); });

  resetChatConfirmBtn?.addEventListener('click', async () => {
    const fb = window.__lokonFirebase;
    if (!fb){
      showToast('Tidak bisa menghapus chat: Firebase belum tersambung.', 'error');
      return;
    }
    resetChatConfirmBtn.disabled = true;
    const originalHtml = resetChatConfirmBtn.innerHTML;
    resetChatConfirmBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Menghapus...';
    try {
      // Ambil SEMUA dokumen chat langsung dari Firestore, supaya benar-benar bersih.
      const snap = await fb.getDocs(fb.collection(fb.db, fb.CHAT_COLLECTION));
      const docs = snap.docs;

      if (!docs.length){
        showToast('Grup chat memang sudah kosong.', 'success');
        closeResetChatConfirm();
        return;
      }

      // Hapus per-batch (writeBatch) kalau tersedia — jauh lebih cepat &
      // hemat kuota dibanding menghapus satu-per-satu. Kalau tidak
      // tersedia (SDK lama), jatuh ke penghapusan satu-per-satu.
      if (typeof fb.writeBatch === 'function'){
        const chunkSize = 400; // batas aman writeBatch Firestore adalah 500 operasi
        for (let i = 0; i < docs.length; i += chunkSize){
          const batch = fb.writeBatch(fb.db);
          docs.slice(i, i + chunkSize).forEach(d => {
            const ref = d.ref || fb.doc(fb.db, fb.CHAT_COLLECTION, d.id);
            batch.delete(ref);
          });
          await batch.commit();
        }
      } else {
        for (const d of docs){
          const ref = d.ref || fb.doc(fb.db, fb.CHAT_COLLECTION, d.id);
          await fb.deleteDoc(ref);
        }
      }

      showToast(`Berhasil menghapus ${docs.length} pesan. Grup chat sudah bersih.`, 'success');
      await logAdminAction('chat', `Menghapus seluruh ${docs.length} pesan di grup chat peserta (reset total).`, 'Grup Chat Peserta');
      closeResetChatConfirm();
    } catch (err){
      console.warn('Gagal menghapus chat grup:', err);
      showToast('Gagal menghapus chat grup. Cek koneksi & Firestore Rules (allow delete: if true).', 'error');
    } finally {
      resetChatConfirmBtn.disabled = false;
      resetChatConfirmBtn.innerHTML = originalHtml;
    }
  });

  function renderAdminList(){
    if (!adminUnlocked || !adminList) return;

    // ---- Statistik dasbor (dihitung dari SELURUH data) ----
    const total = pesertaData.length;
    const menunggu = pesertaData.filter(p => (p.pembayaran?.status || 'belum_dp') === 'belum_dp').length;
    const dpTerbayar = pesertaData.filter(p => p.pembayaran?.status === 'dp').length;
    const cicilanJalan = pesertaData.filter(p => ['dp','cicilan'].includes(p.pembayaran?.status)).length;
    const cicilanStatusOnly = pesertaData.filter(p => p.pembayaran?.status === 'cicilan').length;
    const lunas = pesertaData.filter(p => p.pembayaran?.status === 'lunas').length;
    const pendapatan = pesertaData.reduce((sum, p) => sum + (p.pembayaran?.totalDibayar || 0), 0);
    const totalPesananSeluruh = pesertaData.reduce((sum, p) => sum + (p.total || 0), 0);
    if (adashTotal) animateStatNumber(adashTotal, total);
    if (adashMenunggu) animateStatNumber(adashMenunggu, menunggu);
    if (adashCicilan) animateStatNumber(adashCicilan, cicilanJalan);
    if (adashLunas) animateStatNumber(adashLunas, lunas);
    if (adashPendapatan) adashPendapatan.textContent = formatRupiah(pendapatan);

    // Progress bar "Dana Terkumpul": persentase dana yang sudah masuk
    // dibanding TOTAL NILAI seluruh pesanan (bukan target sembarangan),
    // supaya bendahara langsung tahu seberapa dekat pengumpulan dana
    // sudah selesai tanpa perlu menghitung manual.
    if (adashPendapatanFill && adashPendapatanPct){
      const pct = totalPesananSeluruh > 0 ? Math.min(100, Math.round((pendapatan / totalPesananSeluruh) * 100)) : 0;
      adashPendapatanFill.style.width = `${pct}%`;
      adashPendapatanPct.textContent = totalPesananSeluruh > 0
        ? `${pct}% dari total ${formatRupiah(totalPesananSeluruh)} pesanan`
        : 'Belum ada pesanan tercatat';
    }

    // Badge angka kecil di tiap chip filter — supaya admin langsung
    // tahu isi tiap kategori tanpa perlu tap satu-satu untuk mengecek.
    if (chipCountSemua) chipCountSemua.textContent = total;
    if (chipCountBelumDp) chipCountBelumDp.textContent = menunggu;
    if (chipCountDp) chipCountDp.textContent = dpTerbayar;
    if (chipCountCicilan) chipCountCicilan.textContent = cicilanStatusOnly;
    if (chipCountLunas) chipCountLunas.textContent = lunas;

    // ---- Filter + pencarian ----
    let list = pesertaData.slice();
    if (adminFilter !== 'semua'){
      list = list.filter(p => (p.pembayaran?.status || 'belum_dp') === adminFilter);
    }
    if (adminSearch.trim() !== ''){
      const q = adminSearch.trim().toLowerCase();
      list = list.filter(p =>
        (p.nama || '').toLowerCase().includes(q) ||
        (p.whatsapp || '').toLowerCase().includes(q) ||
        (p.kodeUnik || '').toLowerCase().includes(q) ||
        (p.departemen || '').toLowerCase().includes(q)
      );
    }

    adminList.innerHTML = '';
    if (adminEmpty) adminEmpty.style.display = list.length === 0 ? 'block' : 'none';

    list.forEach(p => {
      const status = p.pembayaran?.status || 'belum_dp';
      const info = STATUS_LABEL[status] || STATUS_LABEL.belum_dp;
      const cicilanArr = p.pembayaran?.cicilan || [];
      const cicilanTerbayar = cicilanArr.filter(c => c.dibayar).length;
      const isCicilan = p.pembayaran?.metode === 'cicilan';
      // Sisa pembayaran ke-2 (pelunasan) yang masih perlu ditagih ke peserta.
      // Diambil dari rencana cicilan tersimpan (paling akurat — ini juga yang
      // dipakai tombol "Tandai Pelunasan"); kalau entah kenapa tidak ada,
      // fallback dihitung dari Total Pesanan − yang sudah terbayar.
      const cicilanBelumLunas = cicilanArr.find(c => !c.dibayar);
      const sisaCicilan = status === 'dp'
        ? (cicilanBelumLunas ? (cicilanBelumLunas.nominal || 0) : Math.max((p.total || 0) - (p.pembayaran?.totalDibayar || 0), 0))
        : 0;

      const row = document.createElement('div');
      row.className = 'admin-row';
      row.innerHTML = `
        <div class="admin-row-top">
          <div class="admin-row-id">
            <div class="admin-row-avatar">${initialsOf(p.nama)}</div>
            <div class="admin-row-head">
              <strong>${escapeHtml(p.nama || '-')}</strong>
              <span>${escapeHtml(p.departemen || '-')}</span>
            </div>
          </div>
          <span class="admin-row-badge ${info.cls}"><i class="fa-solid ${info.icon}"></i> ${info.label}</span>
        </div>
        <div class="admin-row-meta">
          <div class="admin-row-meta-group">
            <span class="admin-code-chip"><i class="fa-solid fa-hashtag"></i>${escapeHtml(p.kodeUnik || '-')}</span>
            <span><i class="fa-solid fa-shirt"></i> ${escapeHtml(p.jenis || '-')} • ${escapeHtml(p.ukuranKemeja || '-')}</span>
          </div>
          <div class="admin-row-meta-group">
            <span><i class="fa-solid fa-cubes"></i> ${p.jumlah || 1} pcs</span>
            <span><i class="fa-solid fa-wallet"></i> ${isCicilan ? '2x Cicilan' : 'Tunai'}</span>
            <span class="admin-row-total"><i class="fa-solid fa-tag"></i> ${formatRupiah(p.total || 0)}</span>
          </div>
        </div>
        ${isCicilan ? `
          <div class="admin-row-progress">
            <div class="admin-row-progress-bar"><div class="admin-row-progress-fill" style="width:${status==='lunas' ? 100 : status==='belum_dp' ? 0 : 50}%"></div></div>
            <span>${status==='belum_dp' ? 'Belum bayar sama sekali' : status==='lunas' ? 'Lunas — 2/2 pembayaran selesai' : 'Pembayaran ke-1 (DP) selesai, menunggu ke-2'} • Terkumpul ${formatRupiah(p.pembayaran?.totalDibayar || 0)}</span>
            ${status === 'dp' ? `<span class="admin-row-sisa"><i class="fa-solid fa-circle-exclamation"></i> Sisa pembayaran ke-2 yang perlu ditagih: <b>${formatRupiah(sisaCicilan)}</b></span>` : ''}
          </div>` : ''}
        <div class="admin-row-actions">
          <div class="admin-row-actions-primary">
            ${status === 'belum_dp' ? (isCicilan
              ? `<button class="admin-action-btn" data-action="inputdp" data-id="${p.id}"><i class="fa-solid fa-hand-holding-dollar"></i> Input Nominal DP (1/2)</button>`
              : `<button class="admin-action-btn" data-action="dp" data-id="${p.id}"><i class="fa-solid fa-hand-holding-dollar"></i> Tandai Lunas Terbayar</button>`
            ) : ''}
            ${isCicilan && cicilanArr.some(c => !c.dibayar) && status !== 'belum_dp' ?
              `<button class="admin-action-btn" data-action="cicilan" data-id="${p.id}"><i class="fa-solid fa-coins"></i> Tandai Pelunasan (2/2) — ${formatRupiah(sisaCicilan)}</button>` : ''}
            ${status !== 'lunas' ? `<button class="admin-action-btn admin-action-lunas" data-action="lunas" data-id="${p.id}"><i class="fa-solid fa-circle-check"></i> Tandai Lunas</button>` : ''}
            <button class="admin-action-btn admin-action-ubahstatus" data-action="ubahstatus" data-id="${p.id}" title="Perbaiki status kalau salah pencet — status bisa diubah lagi kapan saja"><i class="fa-solid fa-rotate-left"></i> Ubah Status</button>
          </div>
          <div class="admin-row-actions-icons">
            ${p.whatsapp ? `<a class="admin-icon-action wa" title="Chat WhatsApp" href="https://wa.me/${encodeURIComponent(normalizeWhatsapp(p.whatsapp))}?text=${encodeURIComponent('Halo ' + p.nama + ', kode unik pendaftaran kemeja Anda: ' + p.kodeUnik)}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i></a>` : ''}
            <button class="admin-icon-action edit" title="Edit data peserta" data-action="edit" data-id="${p.id}"><i class="fa-solid fa-pen"></i></button>
            <button class="admin-icon-action hapus" title="Hapus peserta" data-action="hapus" data-id="${p.id}"><i class="fa-solid fa-trash"></i></button>
          </div>
        </div>
      `;
      adminList.appendChild(row);
    });

    adminList.querySelectorAll('[data-action]').forEach(btn => {
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      if (action === 'edit'){
        btn.addEventListener('click', () => openEditPesertaModal(id));
      } else if (action === 'hapus'){
        const p = pesertaData.find(x => x.id === id);
        btn.addEventListener('click', () => hapusPesertaAdmin(id, p?.nama || 'peserta ini', p?.kodeUnik));
      } else if (action === 'ubahstatus'){
        btn.addEventListener('click', () => openUbahStatusConfirm(id));
      } else if (action === 'inputdp'){
        btn.addEventListener('click', () => openInputDPModal(id));
      } else {
        btn.addEventListener('click', () => handleAdminAction(id, action));
      }
    });
  }

  /* =========================================================
     FITUR BARU: INPUT NOMINAL DP PERTAMA SECARA MANUAL
     Sebelumnya DP pertama SELALU dipaksa memakai rumus baku
     (50% harga kemeja + Rp5.000 admin). Di dunia nyata, peserta
     kadang transfer lebih besar/kecil dari saran itu. Fitur ini
     membiarkan admin mengetik sendiri nominal DP yang BENAR-BENAR
     diterima, lalu sistem OTOMATIS menghitung sisa pelunasan
     (cicilan ke-2) = Total Pesanan − Nominal DP tsb. Sisa ini
     langsung dipakai juga oleh tombol "Tandai Pelunasan (2/2)"
     yang sudah ada, jadi tidak perlu ubah logika lain.
  ========================================================= */
  async function openInputDPModal(id){
    const p = pesertaData.find(x => x.id === id);
    if (!p) return;
    const total = p.total || 0;
    const saran = hitungDPSeharusnya(p);

    // showAdminConfirm() memasang HTML ke dalam modal SECARA SINKRON
    // sebelum mengembalikan Promise-nya, jadi input di bawah ini sudah
    // ada di DOM begitu baris berikutnya dijalankan.
    const confirmPromise = showAdminConfirm({
      title: 'Input Nominal DP Pertama',
      messageHtml: `
        <div class="agc-diff-row"><span class="agc-diff-label">Peserta</span><span>${escapeHtml(p.nama || '-')} (${escapeHtml(p.kodeUnik || '-')})</span></div>
        <div class="agc-diff-row"><span class="agc-diff-label">Total Pesanan</span><span>${formatRupiah(total)}</span></div>
        <div class="agc-diff-row"><span class="agc-diff-label">Saran DP (50% + admin)</span><span>${formatRupiah(saran)}</span></div>
        <div class="agc-dp-input-wrap">
          <label for="agcDpNominalInput">Nominal DP yang benar-benar dibayar peserta</label>
          <input type="number" id="agcDpNominalInput" class="agc-dp-input" inputmode="numeric" min="1" max="${total}" step="1000" value="${saran}">
          <small class="agc-dp-hint" id="agcDpNominalHint"></small>
        </div>
      `,
      confirmLabel: 'Simpan Nominal DP'
    });

    const nominalInput = document.getElementById('agcDpNominalInput');
    const hintEl = document.getElementById('agcDpNominalHint');
    const updateHint = () => {
      let v = parseInt(nominalInput?.value, 10);
      if (isNaN(v) || v < 0) v = 0;
      const sisa = Math.max(total - v, 0);
      if (hintEl){
        hintEl.innerHTML = v >= total
          ? 'Nominal ini menutup seluruh total pesanan — status langsung menjadi <b>Lunas</b>, tanpa sisa cicilan ke-2.'
          : `Sisa pelunasan (cicilan ke-2) otomatis: <b>${formatRupiah(sisa)}</b>`;
      }
    };
    nominalInput?.addEventListener('input', updateHint);
    updateHint();
    nominalInput?.focus();
    nominalInput?.select();

    const confirmed = await confirmPromise;
    if (!confirmed) return;

    let dpNominal = parseInt(nominalInput?.value, 10);
    if (isNaN(dpNominal) || dpNominal <= 0){
      showToast('Nominal DP tidak valid, perubahan dibatalkan.', 'error');
      return;
    }
    if (dpNominal > total) dpNominal = total; // tidak mungkin DP melebihi total pesanan

    const statusLama = STATUS_LABEL[p.pembayaran?.status || 'belum_dp']?.label || '-';
    const pembayaran = JSON.parse(JSON.stringify(p.pembayaran || {}));
    const sisa = Math.max(total - dpNominal, 0);
    pembayaran.dpDibayar = true;
    pembayaran.dpMinimal = dpNominal;
    pembayaran.totalDibayar = dpNominal;
    if (sisa > 0){
      // Sisa pelunasan (cicilan ke-2) dihitung ulang dari nominal DP manual
      // ini, menggantikan rencana cicilan lama — inilah "hitung otomatis"
      // yang diminta: Total Pesanan − DP yang diinput admin.
      pembayaran.cicilan = [{ ke: 1, nominal: sisa, dibayar: false, tanggalBayar: null }];
      pembayaran.status = 'dp';
    } else {
      const tgl = new Date().toLocaleDateString('id-ID', { day:'2-digit', month:'long', year:'numeric' });
      pembayaran.cicilan = (pembayaran.cicilan || []).map(c => ({ ...c, dibayar: true, tanggalBayar: c.tanggalBayar || tgl }));
      pembayaran.status = 'lunas';
      pembayaran.totalDibayar = total;
    }
    const statusBaru = STATUS_LABEL[pembayaran.status]?.label || '-';

    const fb = await waitForFirebase(8000);
    if (!fb){
      showToast('Firebase tidak aktif, tidak bisa memperbarui status.', 'error');
      return;
    }
    try {
      await fb.updateDoc(fb.doc(fb.db, fb.FIRESTORE_COLLECTION, id), { pembayaran, adminEditedAt: fb.serverTimestamp ? fb.serverTimestamp() : new Date() });
      showToast(`DP tersimpan: ${formatRupiah(dpNominal)}${sisa > 0 ? `, sisa pelunasan ${formatRupiah(sisa)}` : ' (langsung Lunas)'}.`, 'success');
      await logAdminAction('status', `DP diinput manual sebesar ${formatRupiah(dpNominal)} dari total ${formatRupiah(total)} (status "${statusLama}" → "${statusBaru}", sisa pelunasan ${formatRupiah(sisa)}).`, `${p.nama || '-'} (${p.kodeUnik || '-'})`);
    } catch (err){
      console.warn('Gagal menyimpan nominal DP manual:', err.code, err.message);
      showToast(`Gagal menyimpan nominal DP (${err.code || 'error'}). Coba lagi.`, 'error');
    }
  }

  async function handleAdminAction(id, action){
    const p = pesertaData.find(x => x.id === id);
    if (!p) return;
    const pembayaran = JSON.parse(JSON.stringify(p.pembayaran || {}));
    const statusLama = STATUS_LABEL[pembayaran.status || 'belum_dp']?.label || '-';

    if (action === 'dp'){
      pembayaran.dpDibayar = true;
      // Hitung ulang DP yang seharusnya (bukan sekadar memakai
      // pembayaran.dpMinimal yang mungkin sudah usang) supaya Dana
      // Terkumpul selalu akurat: 50% harga kemeja + Rp5.000 admin
      // untuk cicilan, atau harga penuh untuk tunai/lunas.
      const dpBenar = hitungDPSeharusnya(p);
      pembayaran.dpMinimal = dpBenar;
      pembayaran.totalDibayar = dpBenar;
      pembayaran.status = pembayaran.metode === 'cicilan' ? 'dp' : 'lunas';
      if (pembayaran.status === 'lunas') pembayaran.totalDibayar = p.total;
    } else if (action === 'cicilan'){
      const next = (pembayaran.cicilan || []).find(c => !c.dibayar);
      if (next){
        next.dibayar = true;
        next.tanggalBayar = new Date().toLocaleDateString('id-ID', { day:'2-digit', month:'long', year:'numeric' });
        pembayaran.totalDibayar = (pembayaran.totalDibayar || 0) + (next.nominal || 0);
      }
      const semuaLunas = (pembayaran.cicilan || []).every(c => c.dibayar);
      pembayaran.status = semuaLunas ? 'lunas' : 'cicilan';
      if (semuaLunas) pembayaran.totalDibayar = p.total;
    } else if (action === 'lunas'){
      pembayaran.status = 'lunas';
      pembayaran.totalDibayar = p.total;
      (pembayaran.cicilan || []).forEach(c => { c.dibayar = true; });
    }

    const statusBaru = STATUS_LABEL[pembayaran.status || 'belum_dp']?.label || '-';
    const confirmed = await showAdminConfirm({
      title: 'Ubah Status Pembayaran?',
      messageHtml: `
        <div class="agc-diff-row"><span class="agc-diff-label">Peserta</span><span>${escapeHtml(p.nama || '-')} (${escapeHtml(p.kodeUnik || '-')})</span></div>
        <div class="agc-diff-row"><span class="agc-diff-label">Status</span><span>${escapeHtml(statusLama)} <span class="agc-arrow">→</span> ${escapeHtml(statusBaru)}</span></div>
        <div class="agc-diff-row"><span class="agc-diff-label">Total Dibayar</span><span>${formatRupiah(pembayaran.totalDibayar || 0)}</span></div>
        <p style="margin-top:12px;">Pastikan sudah benar sebelum disimpan. Status ini masih bisa diubah lagi nanti lewat tombol "Ubah Status" kalau ternyata salah pencet.</p>
      `,
      confirmLabel: 'Ya, Simpan Perubahan'
    });
    if (!confirmed) return;

    const fb = await waitForFirebase(8000);
    if (!fb){
      showToast('Firebase tidak aktif, tidak bisa memperbarui status.', 'error');
      return;
    }
    try {
      await fb.updateDoc(fb.doc(fb.db, fb.FIRESTORE_COLLECTION, id), { pembayaran, adminEditedAt: fb.serverTimestamp ? fb.serverTimestamp() : new Date() });
      showToast('Status pembayaran berhasil diperbarui.', 'success');
      await logAdminAction('status', `Status diubah dari "${statusLama}" menjadi "${statusBaru}". Total dibayar: ${formatRupiah(pembayaran.totalDibayar || 0)}.`, `${p.nama || '-'} (${p.kodeUnik || '-'})`);
    } catch (err){
      console.warn('Gagal memperbarui status pembayaran:', err.code, err.message);
      showToast(`Gagal memperbarui status (${err.code || 'error'}). Coba lagi.`, 'error');
    }
  }

  /* =========================================================
     PERBAIKAN: UBAH STATUS SECARA MANUAL (bisa dikembalikan lagi)
     Sebelumnya begitu status jadi "Lunas", tidak ada cara mengubahnya
     kembali kalau admin salah pencet (mis. seharusnya baru DP/Cicilan
     ke-1, tapi tombol "Lunas" ke-pencet). Fitur ini membiarkan admin
     memilih status pembayaran SECARA BEBAS (Belum Bayar / DP / Lunas)
     kapan saja, lewat tombol "Ubah Status" yang selalu tersedia.
  ========================================================= */
  function openUbahStatusConfirm(id){
    const p = pesertaData.find(x => x.id === id);
    if (!p) return;
    const isCicilan = p.pembayaran?.metode === 'cicilan';
    const statusSekarang = p.pembayaran?.status || 'belum_dp';
    const opsi = isCicilan
      ? [ ['belum_dp','Belum Bayar Sama Sekali'], ['dp','DP Terbayar (1/2)'], ['lunas','Lunas (2/2)'] ]
      : [ ['belum_dp','Belum Bayar'], ['lunas','Lunas'] ];

    showAdminConfirm({
      title: 'Ubah Status Pembayaran Secara Manual',
      messageHtml: `
        <div class="agc-diff-row"><span class="agc-diff-label">Peserta</span><span>${escapeHtml(p.nama || '-')} (${escapeHtml(p.kodeUnik || '-')})</span></div>
        <div class="agc-diff-row"><span class="agc-diff-label">Status saat ini</span><span>${escapeHtml(STATUS_LABEL[statusSekarang]?.label || '-')}</span></div>
        <p style="margin:10px 0 4px;">Pilih status pembayaran yang benar. Gunakan ini untuk memperbaiki kalau sebelumnya salah pencet tombol status (mis. tidak sengaja ke "Lunas").</p>
        <select class="agc-status-select" id="agcStatusSelect">
          ${opsi.map(([val, label]) => `<option value="${val}" ${val === statusSekarang ? 'selected' : ''}>${label}</option>`).join('')}
        </select>
      `,
      confirmLabel: 'Ya, Terapkan Status Ini'
    }).then((confirmed) => {
      if (!confirmed) return;
      const select = document.getElementById('agcStatusSelect');
      const targetStatus = select ? select.value : statusSekarang;
      terapkanStatusManual(id, targetStatus);
    });
  }

  async function terapkanStatusManual(id, targetStatus){
    const p = pesertaData.find(x => x.id === id);
    if (!p) return;
    const statusLama = STATUS_LABEL[p.pembayaran?.status || 'belum_dp']?.label || '-';
    const pembayaran = JSON.parse(JSON.stringify(p.pembayaran || {}));
    const cicilanArr = pembayaran.cicilan || [];

    if (targetStatus === 'belum_dp'){
      pembayaran.status = 'belum_dp';
      pembayaran.dpDibayar = false;
      pembayaran.totalDibayar = 0;
      cicilanArr.forEach(c => { c.dibayar = false; delete c.tanggalBayar; });
    } else if (targetStatus === 'dp'){
      pembayaran.status = 'dp';
      pembayaran.dpDibayar = true;
      // PERBAIKAN BUG: sebelumnya baris ini keliru memakai nominal
      // cicilan ke-2 (sisa pelunasan, TANPA biaya admin) sebagai jumlah
      // yang sudah terbayar untuk status DP — sehingga "Dana Terkumpul"
      // di website tampil LEBIH KECIL dari yang sebenarnya sudah
      // ditransfer peserta (mis. peserta transfer Rp82.500 tapi situs
      // hanya mencatat Rp77.500). Yang benar: jumlah terbayar untuk
      // status DP = pembayaran.dpMinimal (DP 50% harga kemeja + biaya
      // admin cicilan, PERSIS sama dengan angka "BAYAR SEKARANG" di
      // struk & kartu transfer bank).
      // Cicilan ke-2 (pelunasan) juga TIDAK ditandai lunas di sini —
      // sebelumnya ikut tertandai "dibayar" walau baru DP yang masuk,
      // sehingga tombol "Tandai Pelunasan (2/2)" jadi ikut hilang.
      cicilanArr.forEach(c => { c.dibayar = false; delete c.tanggalBayar; });
      // Hitung ulang DP yang seharusnya (50% harga kemeja + Rp5.000
      // admin untuk cicilan) alih-alih memakai pembayaran.dpMinimal
      // yang tersimpan, supaya data peserta lama yang nilainya
      // sempat salah/kurang tetap tercatat benar begitu status
      // diubah ulang lewat "Ubah Status".
      const dpBenar = hitungDPSeharusnya(p);
      pembayaran.dpMinimal = dpBenar;
      pembayaran.totalDibayar = dpBenar;
    } else if (targetStatus === 'lunas'){
      pembayaran.status = 'lunas';
      pembayaran.dpDibayar = true;
      cicilanArr.forEach(c => {
        c.dibayar = true;
        if (!c.tanggalBayar) c.tanggalBayar = new Date().toLocaleDateString('id-ID', { day:'2-digit', month:'long', year:'numeric' });
      });
      pembayaran.totalDibayar = p.total;
    }
    pembayaran.cicilan = cicilanArr;

    const fb = await waitForFirebase(8000);
    if (!fb){
      showToast('Firebase tidak aktif, tidak bisa memperbarui status.', 'error');
      return;
    }
    try {
      await fb.updateDoc(fb.doc(fb.db, fb.FIRESTORE_COLLECTION, id), { pembayaran, adminEditedAt: fb.serverTimestamp ? fb.serverTimestamp() : new Date() });
      showToast('Status pembayaran berhasil diubah.', 'success');
      await logAdminAction('status', `Status diubah manual dari "${statusLama}" menjadi "${STATUS_LABEL[targetStatus]?.label}". Total dibayar: ${formatRupiah(pembayaran.totalDibayar || 0)}.`, `${p.nama || '-'} (${p.kodeUnik || '-'})`);
    } catch (err){
      console.warn('Gagal mengubah status manual:', err.code, err.message);
      showToast(`Gagal mengubah status (${err.code || 'error'}). Coba lagi.`, 'error');
    }
  }

  /* =========================================================
     DASBOR ADMIN: EDIT & HAPUS PESERTA
     PERUBAHAN: untuk sementara, Dasbor Admin HANYA bisa mengedit
     data peserta yang sudah ada dan menghapusnya — tombol "Tambah
     Peserta" manual dihapus karena pendaftaran publik sekarang
     SUDAH otomatis tersimpan ke Firestore begitu pengunjung submit
     formulir (lihat simpanPendaftaranPublik di atas), jadi input
     manual dobel tidak lagi diperlukan sebagai jalur utama.
  ========================================================= */
  const addPesertaOverlay = document.getElementById('addPesertaOverlay');
  const addPesertaClose = document.getElementById('addPesertaClose');
  const addPesertaCancelBtn = document.getElementById('addPesertaCancelBtn');
  const addPesertaForm = document.getElementById('addPesertaForm');
  const addPesertaError = document.getElementById('addPesertaError');
  const addPesertaSubmitBtn = document.getElementById('addPesertaSubmitBtn');
  const apJumlahInput = document.getElementById('apJumlah');
  const apJenisRadios = document.querySelectorAll('input[name="apJenis"]');
  const apTotalHargaEl = document.getElementById('apTotalHarga');

  let editingPesertaId = null;

  const apMetodeRadios = document.querySelectorAll('input[name="apMetode"]');
  const apMetodeNoteEl = document.getElementById('apMetodeNote');

  function getMetodeBayarAdmin(){
    return document.querySelector('input[name="apMetode"]:checked')?.value || 'tunai';
  }

  // PERBAIKAN: sebelumnya fungsi ini tidak pernah membaca pilihan Metode
  // Pembayaran (apMetode) sama sekali, jadi Total Harga di modal Edit
  // selalu hanya harga x jumlah — biaya admin cicilan tidak pernah ikut
  // dihitung ulang di sini walau radio-nya kelihatan bisa dipilih.
  // Sekarang subtotal, biaya admin, dan total dihitung persis sama
  // seperti di formulir pendaftaran publik (lihat hitungTotal()), supaya
  // kalau admin memperbaiki metode bayar yang salah dipilih peserta,
  // angkanya konsisten dari sini sampai ke Firestore.
  function hitungTotalAdmin(){
    const checked = document.querySelector('input[name="apJenis"]:checked');
    const harga = checked ? parseInt(checked.dataset.harga, 10) : 0;
    const jumlah = parseInt(apJumlahInput?.value, 10) || 0;
    const subtotal = harga * jumlah;
    const metode = getMetodeBayarAdmin();
    const isCicilan = metode === 'cicilan';
    const biayaAdmin = isCicilan ? ADMIN_FEE_CICILAN : 0;
    const total = subtotal + biayaAdmin;

    if (apTotalHargaEl) apTotalHargaEl.textContent = formatRupiah(total);
    if (apMetodeNoteEl){
      apMetodeNoteEl.innerHTML = isCicilan
        ? `Termasuk Subtotal Kemeja ${formatRupiah(subtotal)} + Biaya Admin Cicilan <b>${formatRupiah(biayaAdmin)}</b>`
        : `Subtotal Kemeja ${formatRupiah(subtotal)} — <b>Tanpa Biaya Admin</b> (Tunai/Lunas)`;
    }
    return { harga, jumlah, subtotal, metode, biayaAdmin, total };
  }
  apJenisRadios.forEach(r => r.addEventListener('change', hitungTotalAdmin));
  apJumlahInput?.addEventListener('input', hitungTotalAdmin);
  apMetodeRadios.forEach(r => r.addEventListener('change', hitungTotalAdmin));

  function openEditPesertaModal(id){
    const p = pesertaData.find(x => x.id === id);
    if (!p){
      showToast('Data peserta tidak ditemukan (mungkin baru saja dihapus/berubah).', 'error');
      return;
    }
    editingPesertaId = id;
    addPesertaForm.reset();
    addPesertaError.textContent = '';

    document.getElementById('apKodeUnik').value = p.kodeUnik || '';
    document.getElementById('apNama').value = p.nama || '';
    document.getElementById('apNamaBordir').value = p.namaBordir || '';
    document.getElementById('apWhatsapp').value = p.whatsapp || '';
    if (p.departemen) document.getElementById('apDepartemen').value = p.departemen;
    if (p.gender) document.getElementById('apGender').value = p.gender;
    document.getElementById('apUkuran').value = p.ukuranKemeja || '';
    apJumlahInput.value = p.jumlah || 1;
    document.getElementById('apCatatan').value = (p.catatan && p.catatan !== '-') ? p.catatan : '';

    const jenisVal = p.jenis === 'Lengan Panjang' ? 'panjang' : 'pendek';
    const jenisRadio = document.querySelector(`input[name="apJenis"][value="${jenisVal}"]`);
    if (jenisRadio) jenisRadio.checked = true;

    const metodeVal = p.pembayaran?.metode === 'cicilan' ? 'cicilan' : 'tunai';
    const metodeRadio = document.querySelector(`input[name="apMetode"][value="${metodeVal}"]`);
    if (metodeRadio) metodeRadio.checked = true;

    hitungTotalAdmin();
    addPesertaOverlay.classList.add('active');
  }
  function closeAddPesertaModal(){
    addPesertaOverlay.classList.remove('active');
    editingPesertaId = null;
  }
  addPesertaClose?.addEventListener('click', closeAddPesertaModal);
  addPesertaCancelBtn?.addEventListener('click', closeAddPesertaModal);
  addPesertaOverlay?.addEventListener('click', (e) => { if (e.target === addPesertaOverlay) closeAddPesertaModal(); });

  /* ============ SIMPAN PERUBAHAN (UPDATE) KE FIRESTORE ============
     Catatan: status pembayaran (pembayaran.status, dpDibayar, dsb)
     TIDAK disentuh di sini KECUALI admin memang sengaja mengubah
     Metode Pembayaran (mis. peserta salah pilih "Tunai/Lunas Langsung"
     padahal maksudnya "2x Cicilan"). Kalau metode-nya tidak diubah,
     mengedit data biodata/ukuran tetap tidak akan pernah tidak sengaja
     mereset status DP/Lunas yang sudah tercatat — persis seperti
     sebelumnya. Ubah status pembayaran (tanpa ganti metode) tetap lewat
     tombol "Tandai DP/Lunas" / "Ubah Status" di kartu peserta seperti
     biasa. */
  async function updatePesertaAdmin(id, data){
    const fb = await waitForFirebase(10000);
    if (!fb){
      showToast('Gagal simpan: Firebase belum tersambung. Coba tombol refresh di dasbor dulu.', 'error');
      return { ok:false };
    }
    const patch = {
      nama: data.nama,
      namaBordir: data.namaBordir || data.nama,
      whatsapp: data.whatsapp || '',
      departemen: data.departemen,
      gender: data.gender,
      ukuranKemeja: data.ukuranKemeja,
      jenis: data.jenis,
      jumlah: data.jumlah,
      harga: data.harga,
      subtotal: data.subtotal,
      biayaAdmin: data.biayaAdmin,
      total: data.total,
      catatan: data.catatan || '-',
      adminEditedAt: fb.serverTimestamp ? fb.serverTimestamp() : new Date()
    };
    // Hanya disertakan kalau metode pembayaran benar-benar diubah admin
    // (lihat pembangunan `dataBaru.pembayaranBaru` di submit handler).
    if (data.pembayaranBaru){
      patch.pembayaran = data.pembayaranBaru;
    }
    try {
      await fb.updateDoc(fb.doc(fb.db, fb.FIRESTORE_COLLECTION, id), patch);
      showToast(`Data "${data.nama}" berhasil diperbarui.`, 'success');
      return { ok:true };
    } catch (err){
      console.warn('Gagal memperbarui peserta:', err.code, err.message);
      let pesan;
      if (err.code === 'permission-denied'){
        pesan = 'Gagal simpan: akses Firestore ditolak. Cek Firestore Rules di Firebase Console.';
      } else {
        pesan = `Gagal simpan (${err.code || 'error tidak diketahui'}).`;
      }
      showToast(pesan, 'error');
      return { ok:false };
    }
  }

  /* ============ HAPUS PESERTA DARI FIRESTORE ============ */
  // PERBAIKAN BUG: sebelumnya menghapus peserta di sini TIDAK ikut menghapus
  // profil catur-nya (koleksi "chess_players", dibuat oleh modul chess/).
  // Karena kode unik selalu dibuat baru setiap kali daftar ulang, peserta yang
  // sudah dihapus lalu daftar lagi akan tampak "dobel" di ranking/dasbor catur
  // (profil lama jadi data hantu yang tidak pernah terhapus). Sekarang saat
  // peserta dihapus di sini, profil catur terkait (jika ada) ikut dihapus.
  async function hapusPesertaAdmin(id, nama, kodeUnik){
    const yakin = await showAdminConfirm({
      title: 'Hapus Data Peserta Ini?',
      messageHtml: `<p>Anda akan <b>menghapus permanen</b> pendaftaran atas nama <b>${escapeHtml(nama)}</b> (${escapeHtml(kodeUnik || '-')}). Seluruh data pembayaran &amp; profil catur terkait ikut terhapus. Tindakan ini <b>tidak bisa dibatalkan</b>.</p>`,
      confirmLabel: 'Ya, Hapus Permanen',
      danger: true
    });
    if (!yakin) return;
    const fb = await waitForFirebase(10000);
    if (!fb){
      showToast('Gagal hapus: Firebase belum tersambung. Coba tombol refresh di dasbor dulu.', 'error');
      return;
    }
    try {
      await fb.deleteDoc(fb.doc(fb.db, fb.FIRESTORE_COLLECTION, id));

      // Best-effort: hapus juga profil catur terkait (kalau pernah main).
      // Dibungkus try-catch terpisah supaya kalau ini gagal (mis. rules
      // belum diupdate, atau peserta memang belum pernah buka menu catur
      // sehingga dokumennya tidak ada), penghapusan peserta di atas TETAP
      // dianggap berhasil.
      if (kodeUnik){
        try {
          await fb.deleteDoc(fb.doc(fb.db, 'chess_players', String(kodeUnik).toUpperCase()));
        } catch (chessErr){
          console.warn('Gagal menghapus profil catur terkait (diabaikan, tidak fatal):', chessErr.code, chessErr.message);
        }
      }

      showToast(`Peserta "${nama}" berhasil dihapus.`, 'success');
      await logAdminAction('hapus', `Data peserta dihapus permanen dari dasbor.`, `${nama} (${kodeUnik || '-'})`);
    } catch (err){
      console.warn('Gagal menghapus peserta:', err.code, err.message);
      let pesan;
      if (err.code === 'permission-denied'){
        pesan = 'Gagal hapus: akses Firestore ditolak. Pastikan Firestore Rules mengizinkan "allow delete: if true" pada koleksi pendaftaran, lalu Publish.';
      } else {
        pesan = `Gagal hapus (${err.code || 'error tidak diketahui'}).`;
      }
      showToast(pesan, 'error');
    }
  }

  addPesertaForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    addPesertaError.textContent = '';

    if (!editingPesertaId){
      addPesertaError.textContent = 'Tidak ada peserta yang sedang diedit. Tutup dan coba lagi dari tombol Edit.';
      return;
    }

    const nama = document.getElementById('apNama').value.trim();
    const namaBordir = document.getElementById('apNamaBordir').value.trim();
    const whatsappRaw = document.getElementById('apWhatsapp').value.trim();
    const departemen = document.getElementById('apDepartemen').value;
    const gender = document.getElementById('apGender').value;
    const ukuranKemeja = document.getElementById('apUkuran').value;
    const jumlah = parseInt(apJumlahInput.value, 10) || 1;
    const jenisChecked = document.querySelector('input[name="apJenis"]:checked');
    const jenis = jenisChecked?.value === 'panjang' ? 'Lengan Panjang' : 'Lengan Pendek';
    const catatan = document.getElementById('apCatatan').value.trim();
    const { harga, subtotal, metode, biayaAdmin, total } = hitungTotalAdmin();

    if (!nama || !ukuranKemeja){
      addPesertaError.textContent = 'Nama dan Ukuran wajib diisi.';
      return;
    }

    const pLama = pesertaData.find(x => x.id === editingPesertaId) || {};
    const metodeLama = pLama.pembayaran?.metode === 'cicilan' ? 'cicilan' : 'tunai';
    const metodeBerubah = metodeLama !== metode;
    const labelMetode = m => m === 'cicilan' ? '2x Cicilan' : 'Tunai / Lunas';

    // ---- FITUR BARU: perbaikan Metode Pembayaran yang salah dipilih peserta ----
    // Kalau admin mengubah Metode Pembayaran lewat modal Edit ini (mis. peserta
    // tadinya salah pilih "Tunai/Lunas Langsung" padahal maksudnya "2x Cicilan"),
    // status pembayaran & biaya admin ikut dihitung ulang dari awal untuk metode
    // yang baru — memakai fungsi buildPembayaranAwal yang sama persis dipakai
    // saat peserta pertama kali mendaftar, supaya konsisten dengan sisa kode
    // (label status, Dana Terkumpul, struk, dsb).
    let pembayaranBaru = null;
    if (metodeBerubah){
      pembayaranBaru = buildPembayaranAwal(subtotal, metode, biayaAdmin);
    }

    const dataBaru = {
      nama, namaBordir,
      whatsapp: whatsappRaw ? normalizeWhatsapp(whatsappRaw) : '',
      departemen, gender, ukuranKemeja, jenis, jumlah, harga, subtotal, biayaAdmin, total, catatan,
      pembayaranBaru
    };

    // ---- Bangun daftar perubahan (diff) untuk ditampilkan di popup konfirmasi ----
    const bandingan = [
      ['Nama', pLama.nama || '-', dataBaru.nama || '-'],
      ['Nama Bordir', pLama.namaBordir || '-', dataBaru.namaBordir || '-'],
      ['WhatsApp', pLama.whatsapp || '-', dataBaru.whatsapp || '-'],
      ['Departemen', pLama.departemen || '-', dataBaru.departemen || '-'],
      ['Ukuran', pLama.ukuranKemeja || '-', dataBaru.ukuranKemeja || '-'],
      ['Jenis Kemeja', pLama.jenis || '-', dataBaru.jenis || '-'],
      ['Jumlah', String(pLama.jumlah || 0), String(dataBaru.jumlah || 0)],
      ['Metode Bayar', labelMetode(metodeLama), labelMetode(metode)],
      ['Biaya Admin', formatRupiah(pLama.biayaAdmin || pLama.pembayaran?.biayaAdmin || 0), formatRupiah(dataBaru.biayaAdmin || 0)],
      ['Total', formatRupiah(pLama.total || 0), formatRupiah(dataBaru.total || 0)],
      ['Catatan', pLama.catatan || '-', dataBaru.catatan || '-']
    ].filter(([, lama, baru]) => String(lama) !== String(baru));

    if (bandingan.length === 0){
      addPesertaError.textContent = 'Tidak ada perubahan yang perlu disimpan.';
      return;
    }

    const diffHtml = bandingan.map(([label, lama, baru]) =>
      `<div class="agc-diff-row"><span class="agc-diff-label">${escapeHtml(label)}</span><span>${escapeHtml(lama)} <span class="agc-arrow">→</span> ${escapeHtml(baru)}</span></div>`
    ).join('');

    // Kalau metode berubah DAN peserta ini sebelumnya sudah punya progres
    // pembayaran (bukan 'belum_dp'), beri peringatan tegas — status & jumlah
    // yang sudah tercatat akan direset ke "Menunggu DP" mengikuti metode baru,
    // supaya admin tidak kaget dan bisa cek ulang manual ke peserta dulu kalau perlu.
    let peringatanMetodeHtml = '';
    if (metodeBerubah){
      const statusLamaLabel = STATUS_LABEL[pLama.pembayaran?.status || 'belum_dp']?.label || 'Menunggu DP';
      const sudahAdaProgres = (pLama.pembayaran?.status || 'belum_dp') !== 'belum_dp';
      peringatanMetodeHtml = sudahAdaProgres
        ? `<p style="margin-top:12px;color:#b45309;"><i class="fa-solid fa-triangle-exclamation"></i> Peserta ini sebelumnya berstatus <b>"${escapeHtml(statusLamaLabel)}"</b> dengan total terbayar <b>${formatRupiah(pLama.pembayaran?.totalDibayar || 0)}</b>. Mengubah Metode Pembayaran akan <b>mereset status ke "Menunggu DP"</b> mengikuti metode baru (${escapeHtml(labelMetode(metode))}). Pastikan sudah dicek ulang ke peserta sebelum disimpan.</p>`
        : `<p style="margin-top:12px;">Metode Pembayaran akan disesuaikan menjadi <b>${escapeHtml(labelMetode(metode))}</b>, dan status pembayaran akan diatur ke "Menunggu DP" sesuai metode baru.</p>`;
    }

    const confirmed = await showAdminConfirm({
      title: 'Simpan Perubahan Data Peserta?',
      messageHtml: `<p style="margin-bottom:10px;">Data <b>${escapeHtml(pLama.nama || nama)}</b> (${escapeHtml(pLama.kodeUnik || '-')}) akan diubah sebagai berikut:</p>${diffHtml}${peringatanMetodeHtml}`,
      confirmLabel: 'Ya, Simpan Perubahan',
      danger: metodeBerubah && (pLama.pembayaran?.status || 'belum_dp') !== 'belum_dp'
    });
    if (!confirmed) return;

    addPesertaSubmitBtn.disabled = true;
    addPesertaSubmitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan...';

    const result = await updatePesertaAdmin(editingPesertaId, dataBaru);

    addPesertaSubmitBtn.disabled = false;
    addPesertaSubmitBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Simpan Perubahan';

    if (result.ok){
      const ringkasan = bandingan.map(([label, lama, baru]) => `${label}: "${lama}" → "${baru}"`).join('; ');
      await logAdminAction('edit', ringkasan, `${pLama.nama || nama} (${pLama.kodeUnik || '-'})`);
      closeAddPesertaModal();
    } else {
      addPesertaError.textContent = 'Gagal menyimpan — lihat notifikasi di atas untuk detail.';
    }
  });

  /* =========================================================
     20. ADMIN — ESTIMASI & PROGRES TAHAPAN PROSES
     -------------------------------------------------
     Mengelola dokumen Firestore "program_status/estimasi":
       { currentStage: 1-4,
         stage1: { estimasiISO, keterangan, selesaiPadaISO },
         stage2: {...}, stage3: {...}, stage4: {...} }
     - currentStage dipakai situs publik untuk menandai tahap mana
       yang aktif di timeline ("Pendaftaran" → ... → "Distribusi").
     - Tiap stageN punya estimasi tanggal/jam selesai (bisa kosong),
       keterangan bebas (tampil ke pengunjung), dan selesaiPadaISO
       (dicatat otomatis begitu tahap itu ditinggalkan/dilewati,
       supaya badge "Selesai" di situs publik bisa menampilkan
       tanggal riil selesainya, bukan cuma tanggal estimasi).
     Semua field disimpan lewat setDoc(..., {merge:true}) supaya
     dokumen otomatis dibuat kalau belum pernah ada.
  ========================================================= */
  const STAGE_LABELS = {
    1: 'Pendaftaran',
    2: 'Target Terkumpul',
    3: 'Produksi Massal',
    4: 'Distribusi'
  };
  const PROGRAM_STATUS_COLLECTION = 'program_status';
  const PROGRAM_STATUS_DOC_ID = 'estimasi';

  const estimasiBtn = document.getElementById('estimasiBtn');
  const estimasiOverlay = document.getElementById('estimasiOverlay');
  const estimasiClose = document.getElementById('estimasiClose');
  const estimasiStageList = document.getElementById('estimasiStageList');
  const estCurrentStage = document.getElementById('estCurrentStage');
  const estCurrentStageSave = document.getElementById('estCurrentStageSave');
  const estimasiError = document.getElementById('estimasiError');

  let estimasiDataCache = null;
  let estimasiUnsub = null;

  function programStatusRef(fb){
    return fb.doc(fb.db, PROGRAM_STATUS_COLLECTION, PROGRAM_STATUS_DOC_ID);
  }

  // Format Date -> string yang dimengerti <input type="datetime-local">
  // (butuh "YYYY-MM-DDTHH:mm", tanpa detik/zona, mengikuti waktu lokal browser).
  function isoToDatetimeLocalValue(iso){
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  // Kebalikannya: value <input datetime-local> -> ISO string (tersimpan di Firestore).
  function datetimeLocalValueToIso(val){
    if (!val) return null;
    const d = new Date(val);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  }

  function renderEstimasiForm(){
    if (!estimasiStageList) return;
    const data = estimasiDataCache || {};
    const currentStage = Math.min(4, Math.max(1, parseInt(data.currentStage, 10) || 1));
    if (estCurrentStage) estCurrentStage.value = String(currentStage);

    estimasiStageList.innerHTML = '';
    [1,2,3,4].forEach(n => {
      const stage = data[`stage${n}`] || {};
      const card = document.createElement('div');
      card.className = 'estimasi-stage-card' + (n === currentStage ? ' is-current-stage' : '');
      card.innerHTML = `
        <div class="estimasi-stage-card-head">
          <h4><span class="estimasi-stage-num">${n}</span> ${escapeHtml(STAGE_LABELS[n])}</h4>
          <span class="estimasi-stage-tag">${n === currentStage ? 'Tahap Aktif' : (n < currentStage ? 'Sudah Selesai' : 'Belum Dimulai')}</span>
        </div>
        <div class="estimasi-stage-grid">
          <div class="form-group">
            <label for="estDate${n}">Estimasi Tanggal &amp; Jam Selesai</label>
            <input type="datetime-local" id="estDate${n}" value="${isoToDatetimeLocalValue(stage.estimasiISO)}">
          </div>
          <div class="form-group">
            <label for="estNote${n}">Keterangan untuk Peserta</label>
            <textarea id="estNote${n}" rows="2" placeholder="Contoh: Menunggu 10 peserta lagi sebelum produksi dimulai.">${escapeHtml(stage.keterangan || '')}</textarea>
          </div>
        </div>
        <div class="estimasi-stage-actions">
          <button class="btn btn-primary ripple" type="button" data-save-stage="${n}"><i class="fa-solid fa-floppy-disk"></i> Simpan Tahap ${n}</button>
        </div>
      `;
      estimasiStageList.appendChild(card);
    });
  }

  async function loadEstimasiRealtime(){
    const fb = await waitForFirebase(8000);
    if (!fb){
      if (estimasiError) estimasiError.textContent = 'Tidak bisa memuat data: Firebase belum tersambung.';
      return;
    }
    if (estimasiUnsub) return; // listener sudah aktif, tidak perlu pasang ulang
    try {
      estimasiUnsub = fb.onSnapshot(programStatusRef(fb), (snap) => {
        estimasiDataCache = snap.exists() ? snap.data() : null;
        renderEstimasiForm();
      }, (err) => {
        console.warn('Gagal memantau program_status/estimasi:', err.code, err.message);
        if (estimasiError) estimasiError.textContent = 'Gagal memuat data — cek Firestore Rules koleksi "program_status".';
      });
    } catch (err){
      console.warn('Gagal memasang listener program_status/estimasi:', err);
    }
  }

  estimasiBtn?.addEventListener('click', () => {
    estimasiOverlay?.classList.add('active');
    if (estimasiError) estimasiError.textContent = '';
    loadEstimasiRealtime();
  });
  estimasiClose?.addEventListener('click', () => estimasiOverlay?.classList.remove('active'));
  estimasiOverlay?.addEventListener('click', (e) => { if (e.target === estimasiOverlay) estimasiOverlay.classList.remove('active'); });

  // Simpan 1 kartu tahap (estimasi tanggal/jam + keterangan) — event delegation
  // supaya tetap berfungsi walau kartu di-render ulang oleh listener realtime.
  estimasiStageList?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-save-stage]');
    if (!btn) return;
    const n = parseInt(btn.dataset.saveStage, 10);
    const dateInput = document.getElementById(`estDate${n}`);
    const noteInput = document.getElementById(`estNote${n}`);
    const estimasiISO = datetimeLocalValueToIso(dateInput?.value || '');
    const keterangan = (noteInput?.value || '').trim();

    const confirmed = await showAdminConfirm({
      title: `Simpan Estimasi Tahap ${n} — ${STAGE_LABELS[n]}?`,
      messageHtml: `<p>Estimasi tanggal/jam &amp; keterangan untuk tahap <b>${escapeHtml(STAGE_LABELS[n])}</b> akan diperbarui dan langsung tampil ke semua pengunjung situs. Pastikan tanggalnya sudah benar.</p>`,
      confirmLabel: 'Ya, Simpan'
    });
    if (!confirmed) return;

    const fb = window.__lokonFirebase;
    if (!fb || !fb.setDoc){
      showToast('Gagal menyimpan: Firebase belum tersambung.', 'error');
      return;
    }
    btn.disabled = true;
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan...';
    try {
      await fb.setDoc(programStatusRef(fb), {
        [`stage${n}`]: { estimasiISO, keterangan },
        updatedAt: fb.serverTimestamp ? fb.serverTimestamp() : new Date().toISOString()
      }, { merge: true });
      await logAdminAction('edit', `Estimasi: ${estimasiISO ? new Date(estimasiISO).toLocaleString('id-ID') : 'kosong'} • Keterangan: ${keterangan || '-'}`, `Tahap ${n} — ${STAGE_LABELS[n]}`);
      showToast(`Estimasi tahap "${STAGE_LABELS[n]}" berhasil disimpan.`, 'success');
    } catch (err){
      console.warn('Gagal menyimpan estimasi tahap:', err.code, err.message);
      showToast('Gagal menyimpan — cek Firestore Rules koleksi "program_status".', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  });

  // Ubah tahap aktif program (dipakai di bagian "Progress Iuran Bersama" situs publik).
  // Tahap-tahap yang dilewati (dari tahap lama sampai sebelum tahap baru) otomatis
  // ditandai selesai dengan timestamp saat ini, supaya riwayatnya tercatat rapi.
  estCurrentStageSave?.addEventListener('click', async () => {
    const target = parseInt(estCurrentStage?.value, 10) || 1;
    const current = Math.min(4, Math.max(1, parseInt(estimasiDataCache?.currentStage, 10) || 1));
    if (target === current){
      showToast('Tahap aktif tidak berubah.', 'error');
      return;
    }
    const confirmed = await showAdminConfirm({
      title: 'Update Tahap Aktif Program?',
      messageHtml: `<p>Tahap aktif akan diubah dari <b>"${escapeHtml(STAGE_LABELS[current])}"</b> menjadi <b>"${escapeHtml(STAGE_LABELS[target])}"</b>. Semua pengunjung situs akan langsung melihat perubahan ini di bagian "Progress Iuran Bersama".</p>`,
      confirmLabel: 'Ya, Update Tahap',
      danger: target < current
    });
    if (!confirmed) return;

    const fb = window.__lokonFirebase;
    if (!fb || !fb.setDoc){
      showToast('Gagal menyimpan: Firebase belum tersambung.', 'error');
      return;
    }
    estCurrentStageSave.disabled = true;
    const originalHtml = estCurrentStageSave.innerHTML;
    estCurrentStageSave.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan...';
    try {
      const patch = {
        currentStage: target,
        updatedAt: fb.serverTimestamp ? fb.serverTimestamp() : new Date().toISOString()
      };
      // Maju melewati beberapa tahap sekaligus? Tandai semua tahap yang
      // dilewati sebagai selesai pada waktu yang sama (saat ini).
      if (target > current){
        const now = new Date().toISOString();
        for (let n = current; n < target; n++){
          const prevStage = estimasiDataCache?.[`stage${n}`] || {};
          patch[`stage${n}`] = { ...prevStage, selesaiPadaISO: now };
        }
      }
      await fb.setDoc(programStatusRef(fb), patch, { merge: true });
      await logAdminAction('edit', `Tahap aktif: "${STAGE_LABELS[current]}" → "${STAGE_LABELS[target]}"`, 'Progres Program');
      showToast('Tahap aktif berhasil diperbarui.', 'success');
    } catch (err){
      console.warn('Gagal update tahap aktif:', err.code, err.message);
      showToast('Gagal menyimpan — cek Firestore Rules koleksi "program_status".', 'error');
    } finally {
      estCurrentStageSave.disabled = false;
      estCurrentStageSave.innerHTML = originalHtml;
    }
  });

  /* =========================================================
     MENU BARU: TURNAMEN CATUR 17 AGUSTUS 2026
     -------------------------------------------------
     Dua koleksi Firestore terpisah dari data pendaftaran/kemeja:
       - chess_tournament_config/agustus17_2026 : 1 dokumen berisi
         judul, tanggal/jam mulai, hadiah juara 1/2/3, & status aktif
         (dibaca real-time oleh modul catur di halaman publik).
       - chess_tournament_agustus17              : 1 dokumen PER
         PESERTA (docId = kodeUnik), berisi nomor WhatsApp & status
         pendaftaran ("pending" | "approved" | "rejected") yang
         diubah admin lewat tombol Terima/Tolak di bawah.
  ========================================================= */
  const TOURNEY_CONFIG_COLLECTION = 'chess_tournament_config';
  const TOURNEY_ID = 'agustus17_2026';
  const TOURNEY_REG_COLLECTION = 'chess_tournament_agustus17';
  const TOURNEY_DEFAULTS = {
    title: 'Turnamen Catur Kemerdekaan 17 Agustus 2026',
    startAtISO: '2026-08-17T09:00:00+07:00',
    prize1: 'Rp 1.000.000 + Trofi + Sertifikat',
    prize2: 'Rp 600.000 + Sertifikat',
    prize3: 'Rp 300.000 + Sertifikat',
    active: true
  };
  const TOURNEY_STATUS_LABEL = {
    pending:  { label: 'Menunggu',  cls: 'badge-warn',    icon: 'fa-hourglass-half' },
    approved: { label: 'Diterima',  cls: 'badge-success', icon: 'fa-circle-check' },
    rejected: { label: 'Ditolak',   cls: 'badge-danger',  icon: 'fa-circle-xmark' }
  };

  const chessTourneyBtn = document.getElementById('chessTourneyBtn');
  const chessTourneyOverlay = document.getElementById('chessTourneyOverlay');
  const chessTourneyClose = document.getElementById('chessTourneyClose');
  const ctourTabs = document.getElementById('ctourTabs');
  const ctourTabCount = document.getElementById('ctourTabCount');
  const ctourSummary = document.getElementById('ctourSummary');
  const ctourSummaryStatus = document.getElementById('ctourSummaryStatus');
  const ctourSummaryTitle = document.getElementById('ctourSummaryTitle');
  const ctourSummaryDate = document.getElementById('ctourSummaryDate');
  const ctourSummaryPrize1 = document.getElementById('ctourSummaryPrize1');
  const ctourSummaryPrize2 = document.getElementById('ctourSummaryPrize2');
  const ctourSummaryPrize3 = document.getElementById('ctourSummaryPrize3');
  const ctourEditBtn = document.getElementById('ctourEditBtn');
  const ctourDeleteBtn = document.getElementById('ctourDeleteBtn');
  const ctourEmptyState = document.getElementById('ctourEmptyState');
  const ctourCreateBtn = document.getElementById('ctourCreateBtn');
  const ctourForm = document.getElementById('ctourForm');
  const ctourCancelBtn = document.getElementById('ctourCancelBtn');
  const ctourTitle = document.getElementById('ctourTitle');
  const ctourStart = document.getElementById('ctourStart');
  const ctourPrize1 = document.getElementById('ctourPrize1');
  const ctourPrize2 = document.getElementById('ctourPrize2');
  const ctourPrize3 = document.getElementById('ctourPrize3');
  const ctourActive = document.getElementById('ctourActive');
  const ctourSaveConfig = document.getElementById('ctourSaveConfig');
  const ctourConfigError = document.getElementById('ctourConfigError');
  const ctourSearchInput = document.getElementById('ctourSearch');
  const ctourFilters = document.getElementById('ctourFilters');
  const ctourList = document.getElementById('ctourList');
  const ctourEmpty = document.getElementById('ctourEmpty');

  let ctourConfigCache = null;
  let ctourExists = false;           // apakah dokumen konfigurasi sudah pernah disimpan
  let ctourMode = 'view';            // 'view' | 'edit' | 'create'
  let ctourRegCache = [];
  let ctourConfigUnsub = null;
  let ctourRegUnsub = null;
  let ctourActiveFilter = 'semua';
  let ctourSearchQuery = '';

  function tourneyConfigRef(fb){ return fb.doc(fb.db, TOURNEY_CONFIG_COLLECTION, TOURNEY_ID); }
  function tourneyRegRef(fb, kodeUnik){ return fb.doc(fb.db, TOURNEY_REG_COLLECTION, kodeUnik); }

  // Isi field-field form (dipakai baik untuk mode "edit" berisi data lama,
  // maupun mode "create" berisi nilai bawaan/kosong).
  function fillCtourFormFields(c){
    if (ctourTitle) ctourTitle.value = c.title;
    if (ctourStart) ctourStart.value = isoToDatetimeLocalValue(c.startAtISO);
    if (ctourPrize1) ctourPrize1.value = c.prize1;
    if (ctourPrize2) ctourPrize2.value = c.prize2;
    if (ctourPrize3) ctourPrize3.value = c.prize3;
    if (ctourActive) ctourActive.checked = c.active !== false;
  }

  // Isi kartu ringkasan (mode "view") dari data konfigurasi tersimpan.
  function renderCtourSummary(){
    const c = { ...TOURNEY_DEFAULTS, ...(ctourConfigCache || {}) };
    if (ctourSummaryTitle) ctourSummaryTitle.textContent = c.title;
    if (ctourSummaryDate){
      let dateLabel = '-';
      try {
        dateLabel = new Date(c.startAtISO).toLocaleString('id-ID', {
          weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
        }) + ' WIB';
      } catch (err) { /* biarkan default '-' kalau tanggal tidak valid */ }
      ctourSummaryDate.textContent = dateLabel;
    }
    if (ctourSummaryPrize1) ctourSummaryPrize1.textContent = c.prize1;
    if (ctourSummaryPrize2) ctourSummaryPrize2.textContent = c.prize2;
    if (ctourSummaryPrize3) ctourSummaryPrize3.textContent = c.prize3;
    if (ctourSummaryStatus){
      const active = c.active !== false;
      ctourSummaryStatus.innerHTML = `<i class="fa-solid fa-circle"></i> ${active ? 'Aktif — tampil di publik' : 'Nonaktif — disembunyikan'}`;
      ctourSummaryStatus.classList.toggle('inactive', !active);
    }
  }

  // Satu fungsi pusat yang memutuskan tampilan mana yang aktif:
  // form (sedang membuat/mengedit), ringkasan (sudah tersimpan & sedang
  // dilihat saja), atau placeholder kosong (belum pernah dibuat sama sekali).
  function updateCtourConfigView(){
    if (!ctourSummary || !ctourEmptyState || !ctourForm) return;
    if (ctourMode === 'edit' || ctourMode === 'create'){
      ctourSummary.style.display = 'none';
      ctourEmptyState.style.display = 'none';
      ctourForm.style.display = 'block';
      return;
    }
    ctourForm.style.display = 'none';
    if (ctourExists){
      renderCtourSummary();
      ctourSummary.style.display = 'block';
      ctourEmptyState.style.display = 'none';
    } else {
      ctourSummary.style.display = 'none';
      ctourEmptyState.style.display = 'block';
    }
  }

  function renderCtourList(){
    if (!ctourList) return;
    const counts = { semua: ctourRegCache.length, pending: 0, approved: 0, rejected: 0 };
    ctourRegCache.forEach(r => { if (counts[r.status] !== undefined) counts[r.status]++; });
    const setCount = (id, n) => { const el = document.getElementById(id); if (el) el.textContent = n; };
    setCount('ctourCountSemua', counts.semua);
    setCount('ctourCountPending', counts.pending);
    setCount('ctourCountApproved', counts.approved);
    setCount('ctourCountRejected', counts.rejected);
    if (ctourTabCount) ctourTabCount.textContent = counts.semua;

    let filtered = ctourActiveFilter === 'semua' ? ctourRegCache.slice() : ctourRegCache.filter(r => r.status === ctourActiveFilter);
    if (ctourSearchQuery.trim() !== ''){
      const q = ctourSearchQuery.trim().toLowerCase();
      filtered = filtered.filter(r =>
        (r.nama || '').toLowerCase().includes(q) ||
        (r.kodeUnik || '').toLowerCase().includes(q) ||
        (r.whatsapp || '').toLowerCase().includes(q)
      );
    }

    if (!filtered.length){
      ctourList.innerHTML = '';
      if (ctourEmpty) ctourEmpty.style.display = 'block';
      return;
    }
    if (ctourEmpty) ctourEmpty.style.display = 'none';

    ctourList.innerHTML = filtered.map(r => {
      const info = TOURNEY_STATUS_LABEL[r.status] || TOURNEY_STATUS_LABEL.pending;
      const waLink = `https://wa.me/${(r.whatsapp || '').replace(/[^\d]/g, '')}`;
      const tanggal = r.registeredAt?.toDate ? r.registeredAt.toDate().toLocaleString('id-ID') : '-';
      return `
        <div class="admin-row" data-kode="${escapeHtml(r.kodeUnik)}">
          <div class="admin-row-top">
            <div class="admin-row-id">
              <div class="admin-row-avatar">${initialsOf(r.nama)}</div>
              <div class="admin-row-head">
                <strong>${escapeHtml(r.nama || '-')}</strong>
                <span><i class="fa-solid fa-hashtag"></i> ${escapeHtml(r.kodeUnik || '-')}</span>
              </div>
            </div>
            <span class="admin-row-badge ${info.cls}"><i class="fa-solid ${info.icon}"></i> ${info.label}</span>
          </div>
          <div class="admin-row-meta">
            <div class="admin-row-meta-group">
              <span><i class="fa-solid fa-clock"></i> Daftar: ${tanggal}</span>
            </div>
          </div>
          <div class="admin-row-actions">
            <div class="admin-row-actions-primary">
              ${r.status !== 'approved' ? `<button class="admin-action-btn admin-action-lunas" data-caction="approve" data-kode="${escapeHtml(r.kodeUnik)}"><i class="fa-solid fa-circle-check"></i> Terima</button>` : ''}
              ${r.status !== 'rejected' ? `<button class="admin-action-btn admin-action-tolak" data-caction="reject" data-kode="${escapeHtml(r.kodeUnik)}"><i class="fa-solid fa-circle-xmark"></i> Tolak</button>` : ''}
              ${r.status !== 'pending' ? `<button class="admin-action-btn admin-action-ubahstatus" data-caction="pending" data-kode="${escapeHtml(r.kodeUnik)}"><i class="fa-solid fa-rotate-left"></i> Batalkan</button>` : ''}
            </div>
            <div class="admin-row-actions-icons">
              ${r.whatsapp ? `<a class="admin-icon-action wa" title="Chat WhatsApp" href="${waLink}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i></a>` : ''}
              <button class="admin-icon-action hapus" type="button" title="Hapus pendaftaran" data-caction="hapus" data-kode="${escapeHtml(r.kodeUnik)}"><i class="fa-solid fa-trash"></i></button>
            </div>
          </div>
        </div>`;
    }).join('');
  }

  async function loadCtourRealtime(){
    const fb = await waitForFirebase(8000);
    if (!fb){
      if (ctourConfigError) ctourConfigError.textContent = 'Tidak bisa memuat data: Firebase belum tersambung.';
      return;
    }
    if (!ctourConfigUnsub){
      ctourConfigUnsub = fb.onSnapshot(tourneyConfigRef(fb), (snap) => {
        ctourExists = snap.exists();
        ctourConfigCache = ctourExists ? snap.data() : null;
        if (ctourMode === 'view') updateCtourConfigView();
      }, (err) => console.warn('Gagal memantau chess_tournament_config:', err.code, err.message));
    }
    if (!ctourRegUnsub){
      try {
        const q = fb.query(fb.collection(fb.db, TOURNEY_REG_COLLECTION), fb.orderBy('registeredAt', 'desc'));
        ctourRegUnsub = fb.onSnapshot(q, (snap) => {
          ctourRegCache = snap.docs.map(d => d.data());
          renderCtourList();
        }, (err) => {
          console.warn('Gagal memantau chess_tournament_agustus17:', err.code, err.message);
          if (ctourConfigError) ctourConfigError.textContent = 'Gagal memuat pendaftar — cek Firestore Rules koleksi "chess_tournament_agustus17".';
        });
      } catch (err){
        console.warn('Gagal memasang listener turnamen catur:', err);
      }
    }
  }

  chessTourneyBtn?.addEventListener('click', () => {
    chessTourneyOverlay?.classList.add('active');
    if (ctourConfigError) ctourConfigError.textContent = '';
    ctourMode = 'view';
    updateCtourConfigView();
    loadCtourRealtime();
  });
  chessTourneyClose?.addEventListener('click', () => chessTourneyOverlay?.classList.remove('active'));
  chessTourneyOverlay?.addEventListener('click', (e) => { if (e.target === chessTourneyOverlay) chessTourneyOverlay.classList.remove('active'); });

  // Tab "Pengaturan Event" <-> "Daftar Pendaftar"
  ctourTabs?.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-ctab]');
    if (!tab) return;
    const target = tab.dataset.ctab;
    ctourTabs.querySelectorAll('.ctour-tab').forEach(t => {
      const active = t === tab;
      t.classList.toggle('active', active);
      t.setAttribute('aria-selected', String(active));
    });
    chessTourneyOverlay?.querySelectorAll('.ctour-panel').forEach(p => {
      p.classList.toggle('active', p.dataset.panel === target);
    });
  });

  // Buka form kosong untuk membuat turnamen baru (dari placeholder "belum ada turnamen")
  ctourCreateBtn?.addEventListener('click', () => {
    ctourMode = 'create';
    fillCtourFormFields(TOURNEY_DEFAULTS);
    if (ctourConfigError) ctourConfigError.textContent = '';
    updateCtourConfigView();
  });

  // Buka form berisi data lama untuk diedit (dari kartu ringkasan)
  ctourEditBtn?.addEventListener('click', () => {
    ctourMode = 'edit';
    fillCtourFormFields({ ...TOURNEY_DEFAULTS, ...(ctourConfigCache || {}) });
    if (ctourConfigError) ctourConfigError.textContent = '';
    updateCtourConfigView();
  });

  // Batalkan membuat/mengedit — kembali ke tampilan ringkasan/placeholder tanpa menyimpan apa pun
  ctourCancelBtn?.addEventListener('click', () => {
    ctourMode = 'view';
    if (ctourConfigError) ctourConfigError.textContent = '';
    updateCtourConfigView();
  });

  ctourFilters?.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-cfilter]');
    if (!chip) return;
    ctourActiveFilter = chip.dataset.cfilter;
    ctourFilters.querySelectorAll('.adash-chip').forEach(c => c.classList.toggle('active', c === chip));
    renderCtourList();
  });

  ctourSearchInput?.addEventListener('input', (e) => {
    ctourSearchQuery = e.target.value;
    renderCtourList();
  });

  // Simpan pengaturan event (judul, tanggal/jam, hadiah, tampil/sembunyikan banner) —
  // dipakai baik untuk membuat turnamen baru maupun menyimpan hasil edit.
  ctourSaveConfig?.addEventListener('click', async () => {
    const title = (ctourTitle?.value || '').trim() || TOURNEY_DEFAULTS.title;
    const startAtISO = datetimeLocalValueToIso(ctourStart?.value || '') || TOURNEY_DEFAULTS.startAtISO;
    const prize1 = (ctourPrize1?.value || '').trim() || TOURNEY_DEFAULTS.prize1;
    const prize2 = (ctourPrize2?.value || '').trim() || TOURNEY_DEFAULTS.prize2;
    const prize3 = (ctourPrize3?.value || '').trim() || TOURNEY_DEFAULTS.prize3;
    const active = !!ctourActive?.checked;
    const isCreating = ctourMode === 'create';

    const confirmed = await showAdminConfirm({
      title: isCreating ? 'Buat Turnamen Catur Baru?' : 'Simpan Perubahan Turnamen Catur?',
      messageHtml: `<p>Perubahan akan langsung tampil real-time ke semua peserta yang membuka Lokon Chess Arena — termasuk countdown, hadiah, dan status tampil/sembunyi banner.</p>`,
      confirmLabel: 'Ya, Simpan'
    });
    if (!confirmed) return;

    const fb = window.__lokonFirebase;
    if (!fb || !fb.setDoc){
      showToast('Gagal menyimpan: Firebase belum tersambung.', 'error');
      return;
    }
    ctourSaveConfig.disabled = true;
    const originalHtml = ctourSaveConfig.innerHTML;
    ctourSaveConfig.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan...';
    try {
      await fb.setDoc(tourneyConfigRef(fb), {
        title, startAtISO, prize1, prize2, prize3, active,
        updatedAt: fb.serverTimestamp ? fb.serverTimestamp() : new Date().toISOString()
      }, { merge: true });
      await logAdminAction('edit', `Judul: "${title}" • Mulai: ${new Date(startAtISO).toLocaleString('id-ID')} • Tampil: ${active ? 'Ya' : 'Tidak'}`, 'Turnamen Catur 17 Agustus');
      ctourExists = true;
      ctourConfigCache = { title, startAtISO, prize1, prize2, prize3, active };
      ctourMode = 'view';
      updateCtourConfigView();
      showToast(isCreating ? 'Turnamen baru berhasil dibuat.' : 'Pengaturan turnamen berhasil disimpan.', 'success');
    } catch (err){
      console.warn('Gagal menyimpan pengaturan turnamen:', err.code, err.message);
      if (ctourConfigError) ctourConfigError.textContent = 'Gagal menyimpan — cek Firestore Rules koleksi "chess_tournament_config".';
    } finally {
      ctourSaveConfig.disabled = false;
      ctourSaveConfig.innerHTML = originalHtml;
    }
  });

  // Hapus turnamen (dokumen pengaturan) — daftar pendaftar yang sudah ada TIDAK ikut terhapus
  ctourDeleteBtn?.addEventListener('click', async () => {
    const c = { ...TOURNEY_DEFAULTS, ...(ctourConfigCache || {}) };
    const confirmed = await showAdminConfirm({
      title: 'Hapus Turnamen Catur?',
      messageHtml: `<p>Turnamen <b>${escapeHtml(c.title)}</b> akan dihapus dari pengaturan. Modul catur di situs publik akan kembali ke pengaturan bawaan sampai turnamen baru dibuat lagi. Daftar pendaftar yang sudah ada tidak ikut terhapus.</p>`,
      confirmLabel: 'Ya, Hapus',
      danger: true
    });
    if (!confirmed) return;

    const fb = window.__lokonFirebase;
    if (!fb || !fb.deleteDoc){
      showToast('Gagal menghapus: Firebase belum tersambung.', 'error');
      return;
    }
    ctourDeleteBtn.disabled = true;
    try {
      await fb.deleteDoc(tourneyConfigRef(fb));
      await logAdminAction('hapus', `Turnamen "${c.title}" dihapus dari pengaturan.`, 'Turnamen Catur 17 Agustus');
      ctourExists = false;
      ctourConfigCache = null;
      ctourMode = 'view';
      updateCtourConfigView();
      showToast('Turnamen berhasil dihapus.', 'success');
    } catch (err){
      console.warn('Gagal menghapus turnamen:', err.code, err.message);
      if (ctourConfigError) ctourConfigError.textContent = 'Gagal menghapus — cek Firestore Rules koleksi "chess_tournament_config".';
    } finally {
      ctourDeleteBtn.disabled = false;
    }
  });

  // Terima / Tolak / Batalkan (kembalikan ke menunggu) / Hapus — event delegation
  // supaya tetap berfungsi walau daftar di-render ulang oleh listener realtime.
  ctourList?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-caction]');
    if (!btn) return;
    const action = btn.dataset.caction;
    const kode = btn.dataset.kode;
    const reg = ctourRegCache.find(r => r.kodeUnik === kode);
    if (!reg) return;

    if (action === 'hapus'){
      const confirmed = await showAdminConfirm({
        title: 'Hapus Pendaftaran Turnamen?',
        messageHtml: `<p>Data pendaftaran <b>${escapeHtml(reg.nama)}</b> (kode ${escapeHtml(reg.kodeUnik)}) akan dihapus permanen dan tidak bisa dikembalikan.</p>`,
        confirmLabel: 'Ya, Hapus',
        danger: true
      });
      if (!confirmed) return;
      const fb = window.__lokonFirebase;
      if (!fb || !fb.deleteDoc){
        showToast('Gagal menghapus: Firebase belum tersambung.', 'error');
        return;
      }
      btn.disabled = true;
      try {
        await fb.deleteDoc(tourneyRegRef(fb, kode));
        await logAdminAction('hapus', 'Pendaftaran turnamen catur dihapus.', `${reg.nama || '-'} (${kode})`);
        showToast(`Pendaftaran "${escapeHtml(reg.nama)}" berhasil dihapus.`, 'success');
      } catch (err){
        console.warn('Gagal menghapus pendaftaran turnamen:', err.code, err.message);
        showToast('Gagal menghapus — cek Firestore Rules koleksi "chess_tournament_agustus17".', 'error');
      } finally {
        btn.disabled = false;
      }
      return;
    }

    const ACTION_META = {
      approve: { newStatus: 'approved', title: 'Terima Pendaftaran Turnamen?', confirmLabel: 'Ya, Terima', danger: false,
        msg: `<p><b>${escapeHtml(reg.nama)}</b> akan resmi terdaftar sebagai peserta Turnamen Catur 17 Agustus dan namanya akan tampil di daftar peserta publik.</p>` },
      reject: { newStatus: 'rejected', title: 'Tolak Pendaftaran Turnamen?', confirmLabel: 'Ya, Tolak', danger: true,
        msg: `<p>Pendaftaran <b>${escapeHtml(reg.nama)}</b> akan ditandai ditolak. Peserta akan melihat status ini di halaman catur dan bisa mendaftar ulang kalau perlu.</p>` },
      pending: { newStatus: 'pending', title: 'Batalkan Keputusan & Kembalikan ke Menunggu?', confirmLabel: 'Ya, Batalkan', danger: false,
        msg: `<p>Status <b>${escapeHtml(reg.nama)}</b> akan dikembalikan ke "Menunggu" seperti sebelum diputuskan.</p>` }
    };
    const meta = ACTION_META[action];
    if (!meta) return;

    const confirmed = await showAdminConfirm({ title: meta.title, messageHtml: meta.msg, confirmLabel: meta.confirmLabel, danger: meta.danger });
    if (!confirmed) return;

    const fb = window.__lokonFirebase;
    if (!fb || !fb.updateDoc){
      showToast('Gagal menyimpan: Firebase belum tersambung.', 'error');
      return;
    }
    btn.disabled = true;
    try {
      await fb.updateDoc(tourneyRegRef(fb, kode), {
        status: meta.newStatus,
        reviewedAt: fb.serverTimestamp ? fb.serverTimestamp() : new Date().toISOString()
      });
      await logAdminAction('status', `Status pendaftaran turnamen catur diubah menjadi "${TOURNEY_STATUS_LABEL[meta.newStatus].label}".`, `${reg.nama || '-'} (${kode})`);
      showToast(`Status "${escapeHtml(reg.nama)}" berhasil diubah.`, 'success');
    } catch (err){
      console.warn('Gagal mengubah status pendaftaran turnamen:', err.code, err.message);
      showToast('Gagal menyimpan — cek Firestore Rules koleksi "chess_tournament_agustus17".', 'error');
    } finally {
      btn.disabled = false;
    }
  });

});