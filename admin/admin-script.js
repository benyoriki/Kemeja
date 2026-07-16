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
  const adminExportJpgBtn = document.getElementById('adminExportJpgBtn');
  const adminSearchInput = document.getElementById('adminSearch');
  const adminFiltersWrap = document.getElementById('adminFilters');
  const adashClock = document.getElementById('adashClock');
  const adashTotal = document.getElementById('adashTotal');
  const adashPendapatan = document.getElementById('adashPendapatan');
  const adashMenunggu = document.getElementById('adashMenunggu');
  const adashCicilan = document.getElementById('adashCicilan');
  const adashLunas = document.getElementById('adashLunas');

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

  // Halaman ini SELALU tampil penuh (bukan modal yang bisa ditutup) —
  // begitu dibuka, langsung tampilkan layar login (kecuali sesi Firebase
  // Auth sebelumnya masih aktif, ditangani watchAdminAuthState di bawah).
  resetAdminLoginForm();

  async function logoutAdmin(){
    adminUnlocked = false;
    adminOverlay.classList.remove('admin-dash-mode');
    stopAdminClock();
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
        startAdminClock();
        startPesertaListener();
        renderAdminList();
      } else if (!user && adminUnlocked){
        adminUnlocked = false;
        adminOverlay.classList.remove('admin-dash-mode');
        adminLogin.style.display = 'block';
        adminPanel.style.display = 'none';
        stopAdminClock();
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
      startAdminClock();
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
     18b. EXPORT DAFTAR PESERTA SEBAGAI GAMBAR JPG
     Dipakai admin untuk share cepat ke grup WhatsApp — jadi TIDAK
     mengandalkan screenshot manual dasbor (yang suka kepotong/berantakan
     kalau daftarnya panjang). Digambar sendiri di <canvas> baris demi
     baris, jadi hasilnya selalu rapi & lengkap sepanjang apa pun
     datanya, lalu diunduh sebagai satu file .jpg.
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

  // Rounded-rect helper (Canvas belum semua browser dukung ctx.roundRect asli)
  function jpgRoundedRect(ctx, x, y, w, h, r){
    if (typeof r === 'number') r = { tl:r, tr:r, br:r, bl:r };
    ctx.beginPath();
    ctx.moveTo(x + r.tl, y);
    ctx.lineTo(x + w - r.tr, y);
    ctx.arcTo(x + w, y, x + w, y + r.tr, r.tr);
    ctx.lineTo(x + w, y + h - r.br);
    ctx.arcTo(x + w, y + h, x + w - r.br, y + h, r.br);
    ctx.lineTo(x + r.bl, y + h);
    ctx.arcTo(x, y + h, x, y + h - r.bl, r.bl);
    ctx.lineTo(x, y + r.tl);
    ctx.arcTo(x, y, x + r.tl, y, r.tl);
    ctx.closePath();
  }

  function jpgTruncate(ctx, text, maxWidth){
    text = String(text ?? '-');
    if (ctx.measureText(text).width <= maxWidth) return text;
    while (text.length > 1 && ctx.measureText(text + '…').width > maxWidth){
      text = text.slice(0, -1);
    }
    return text + '…';
  }

  function jpgGlow(ctx, x, y, r, color){
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }

  // Lencana bulat kecil bertanda centang — sentuhan "istimewa" khusus untuk
  // status LUNAS, supaya beda dari sekadar teks/pill polos.
  function jpgCheckBadge(ctx, cx, cy, r, bg, fg){
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = fg; ctx.lineWidth = 1.8;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.45, cy);
    ctx.lineTo(cx - r * 0.1, cy + r * 0.4);
    ctx.lineTo(cx + r * 0.5, cy - r * 0.45);
    ctx.stroke();
  }

  async function exportPesertaAsJpg(){
    if (!pesertaData.length){
      showToast('Belum ada data peserta untuk diunduh.', 'error');
      return;
    }
    const iconEl = adminExportJpgBtn.querySelector('i');
    adminExportJpgBtn.disabled = true;
    iconEl?.classList.replace('fa-image', 'fa-circle-notch');
    iconEl?.classList.add('fa-spin');
    try {
      // Pastikan font Google Fonts (Outfit/Inter/JetBrains Mono) sudah
      // benar-benar kepasang sebelum digambar, kalau tidak Canvas akan
      // diam-diam fallback ke font default sistem dan hasilnya beda jauh.
      if (document.fonts?.ready) await document.fonts.ready;

      const rows = [...pesertaData].sort((a, b) => (a._ms || 0) - (b._ms || 0));

      const W = 1080;
      const PAD = 56;
      const HEADER_H = 300;
      const TABLE_HEAD_H = 64;
      const ROW_H = 76;
      const FOOTER_H = 176;
      const PAYMENT_CARD_H = 132;   // tinggi kartu info rekening transfer
      const PAYMENT_BLOCK_H = 40 + PAYMENT_CARD_H + 34; // margin atas + kartu + margin bawah
      const COLW = { no:56, nama:266, bordir:206, ukuran:96, lengan:108 };
      COLW.status = (W - PAD * 2) - COLW.no - COLW.nama - COLW.bordir - COLW.ukuran - COLW.lengan;
      const tableH = TABLE_HEAD_H + rows.length * ROW_H;
      const H = HEADER_H + tableH + PAYMENT_BLOCK_H + FOOTER_H;

      // Data rekening pembayaran — tampil sebagai kartu info di bawah tabel,
      // supaya peserta yang menerima gambar ini langsung tahu ke mana harus
      // transfer tanpa perlu tanya lagi di chat.
      const REKENING = { bank: 'Bank BCA', nomor: '0830142452', atasNama: 'KAMIL MUHAMMAD NUR' };

      const canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d');

      // ===== Latar belakang: PUTIH BERSIH — supaya nama peserta jauh lebih
      // kebaca ketimbang versi gelap sebelumnya. Glow brand tetap ada di
      // pojok tapi dibuat SANGAT tipis, sekadar sentuhan "canggih" tanpa
      // mengganggu kontras teks. =====
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, W, H);
      jpgGlow(ctx, W - 40, 10, 340, 'rgba(18,169,224,0.07)');
      jpgGlow(ctx, 20, H - 50, 300, 'rgba(15,216,184,0.06)');

      // ===== Header =====
      ctx.fillStyle = '#475569';
      ctx.font = '600 24px Outfit, sans-serif';
      ctx.fillText('PT. LOKON PRIMA — DISTRIBUTOR AIR MINUM', PAD, 76);

      ctx.fillStyle = '#CCFBF1';
      jpgRoundedRect(ctx, PAD, 94, 258, 40, 20); ctx.fill();
      ctx.fillStyle = '#0D9488';
      ctx.beginPath(); ctx.arc(PAD + 22, 114, 5, 0, Math.PI * 2); ctx.fill();
      ctx.font = '700 14px "JetBrains Mono", monospace';
      ctx.fillText('DAFTAR PESERTA RESMI', PAD + 38, 119);

      ctx.fillStyle = '#0B2545';
      ctx.font = '800 56px Outfit, sans-serif';
      ctx.fillText('Kemeja Kerja 2026', PAD, 202);

      const { hariTanggal, jam } = formatTanggalJamIndo(new Date());
      ctx.fillStyle = '#64748B';
      ctx.font = '500 24px Inter, sans-serif';
      ctx.fillText(`${hariTanggal}  •  Diperbarui pukul ${jam}`, PAD, 242);

      const lineGrad = ctx.createLinearGradient(PAD, 0, W - PAD, 0);
      lineGrad.addColorStop(0, '#12A9E0'); lineGrad.addColorStop(1, '#0FD8B8');
      ctx.fillStyle = lineGrad;
      ctx.fillRect(PAD, 266, W - PAD * 2, 3);

      // ===== Kartu tabel — putih dengan garis tepi tipis + bayangan lembut,
      // supaya tetap terlihat sebagai "kartu" walau latarnya sudah putih =====
      const tableX = PAD, tableY = HEADER_H, tableW = W - PAD * 2;
      ctx.save();
      ctx.shadowColor = 'rgba(15,23,42,0.10)';
      ctx.shadowBlur = 26;
      ctx.shadowOffsetY = 10;
      ctx.fillStyle = '#FFFFFF';
      jpgRoundedRect(ctx, tableX, tableY, tableW, tableH, 22); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = '#E2E8F0'; ctx.lineWidth = 1;
      jpgRoundedRect(ctx, tableX, tableY, tableW, tableH, 22); ctx.stroke();

      ctx.fillStyle = '#F8FAFC';
      jpgRoundedRect(ctx, tableX, tableY, tableW, TABLE_HEAD_H, { tl:22, tr:22, br:0, bl:0 }); ctx.fill();
      ctx.strokeStyle = '#E2E8F0';
      ctx.beginPath();
      ctx.moveTo(tableX, tableY + TABLE_HEAD_H);
      ctx.lineTo(tableX + tableW, tableY + TABLE_HEAD_H);
      ctx.stroke();

      let cx = tableX + 24;
      ctx.font = '700 15px "JetBrains Mono", monospace';
      ctx.fillStyle = '#64748B';
      [['NO', COLW.no], ['NAMA PESERTA', COLW.nama], ['NAMA BORDIR', COLW.bordir],
       ['UKURAN', COLW.ukuran], ['LENGAN', COLW.lengan], ['STATUS PEMBAYARAN', COLW.status]]
        .forEach(([label, w]) => { ctx.fillText(label, cx, tableY + 40); cx += w; });

      // PERBAIKAN: seluruh isi baris (zebra, garis aksen kiri, dsb.) di-"clip"
      // ke bentuk rounded-rect kartu ini, supaya tidak ada lagi warna yang
      // "bocor"/menonjol keluar melewati sudut membundar di baris paling
      // atas & paling bawah (bug yang terlihat di versi sebelumnya).
      ctx.save();
      jpgRoundedRect(ctx, tableX, tableY, tableW, tableH, 22);
      ctx.clip();

      rows.forEach((p, i) => {
        const y = tableY + TABLE_HEAD_H + i * ROW_H;
        const status = p.pembayaran?.status || 'belum_dp';
        const dibayar = p.pembayaran?.totalDibayar || 0;
        const isLunas = status === 'lunas';
        const isDp = !isLunas && dibayar > 0;

        // Warna aksen per status — merah untuk "Belum DP" dibuat beda jelas
        // supaya langsung kelihatan siapa yang perlu ditagih, tapi memakai
        // nuansa yang sedikit lebih lembut (bukan merah menyala) supaya
        // daftar tetap enak dipandang meski banyak yang belum bayar.
        const accent = isLunas ? '#16A34A' : isDp ? '#D97706' : '#E0524F';

        if (i % 2 === 1){
          ctx.fillStyle = '#F8FAFC';
          ctx.fillRect(tableX, y, tableW, ROW_H);
        }
        // Garis aksen tipis di kiri tiap baris sesuai status pembayaran —
        // bantu mata memindai daftar panjang tanpa perlu baca satu-satu.
        ctx.fillStyle = accent;
        ctx.fillRect(tableX, y, 4, ROW_H);

        let x = tableX + 24;
        const midY = y + ROW_H / 2 + 6;

        ctx.font = '600 17px Inter, sans-serif';
        ctx.fillStyle = '#94A3B8';
        ctx.fillText(String(i + 1), x, midY);
        x += COLW.no;

        // Nama peserta: hitam pekat & extra-bold — elemen paling penting
        // di kartu, jadi harus paling menonjol di antara semua kolom.
        ctx.font = '800 18px Outfit, sans-serif';
        ctx.fillStyle = '#0F172A';
        ctx.fillText(jpgTruncate(ctx, p.nama || '-', COLW.nama - 20), x, midY);
        x += COLW.nama;

        ctx.font = '500 17px Inter, sans-serif';
        ctx.fillStyle = '#475569';
        ctx.fillText(jpgTruncate(ctx, p.namaBordir || '-', COLW.bordir - 20), x, midY);
        x += COLW.bordir;

        ctx.font = '700 17px "JetBrains Mono", monospace';
        ctx.fillStyle = '#0369A1';
        ctx.fillText(p.ukuranKemeja || '-', x, midY);
        x += COLW.ukuran;

        ctx.font = '500 16px Inter, sans-serif';
        ctx.fillStyle = '#64748B';
        ctx.fillText(p.jenis === 'Lengan Panjang' ? 'Panjang' : 'Pendek', x, midY);
        x += COLW.lengan;

        let statusText, statusFg, statusBg;
        if (isLunas){
          statusText = 'LUNAS'; statusFg = '#15803D'; statusBg = '#DCFCE7';
        } else if (isDp){
          statusText = `DP ${formatRupiah(dibayar)}`; statusFg = '#B45309'; statusBg = '#FEF3C7';
        } else {
          // "Belum DP": tetap beda jelas dari status lain, tapi memakai
          // merah-koral yang sedikit lebih lembut supaya tidak terlalu
          // "berteriak" saat daftarnya panjang & didominasi status ini.
          statusText = 'Belum DP'; statusFg = '#C0392B'; statusBg = '#FCEAEA';
        }

        ctx.font = '700 16px "JetBrains Mono", monospace';
        const badgeExtra = isLunas ? 28 : 0; // ruang tambahan untuk lencana centang
        const badgeW = Math.min(ctx.measureText(statusText).width + 28 + badgeExtra, COLW.status - 16);
        const badgeY = y + ROW_H / 2 - 18;
        ctx.fillStyle = statusBg;
        jpgRoundedRect(ctx, x, badgeY, badgeW, 36, 18); ctx.fill();

        if (isLunas){
          // Sentuhan "istimewa" khusus peserta lunas: garis tepi hijau tipis
          // + lencana bulat bertanda centang di dalam pill, bukan cuma teks polos.
          ctx.strokeStyle = 'rgba(21,128,61,0.35)'; ctx.lineWidth = 1.4;
          jpgRoundedRect(ctx, x, badgeY, badgeW, 36, 18); ctx.stroke();
          jpgCheckBadge(ctx, x + 18, badgeY + 18, 9, '#16A34A', '#FFFFFF');
          ctx.fillStyle = statusFg;
          ctx.fillText(jpgTruncate(ctx, statusText, badgeW - 46), x + 32, midY);
        } else {
          ctx.fillStyle = statusFg;
          ctx.fillText(jpgTruncate(ctx, statusText, badgeW - 24), x + 14, midY);
        }

        // Garis pemisah super tipis antar baris — bantu mata menyusuri baris
        // panjang ke kanan tanpa "tersasar" ke baris tetangga.
        if (i < rows.length - 1){
          ctx.strokeStyle = 'rgba(226,232,240,0.8)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(tableX + 20, y + ROW_H);
          ctx.lineTo(tableX + tableW - 20, y + ROW_H);
          ctx.stroke();
        }
      });

      ctx.restore(); // lepas clip rounded-rect setelah semua baris selesai digambar

      // =========================================================
      // KARTU INFO REKENING TRANSFER — tampil menonjol di bawah tabel,
      // supaya siapa pun yang menerima gambar ini langsung tahu ke mana
      // harus transfer, tanpa perlu tanya lagi di chat grup.
      // =========================================================
      const cardX = tableX, cardY = tableY + tableH + 40, cardW = tableW, cardH = PAYMENT_CARD_H;

      ctx.save();
      ctx.shadowColor = 'rgba(15,23,42,0.10)';
      ctx.shadowBlur = 22;
      ctx.shadowOffsetY = 8;
      const cardGrad = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + cardH);
      cardGrad.addColorStop(0, '#EFFCF9'); cardGrad.addColorStop(1, '#EAF6FD');
      ctx.fillStyle = cardGrad;
      jpgRoundedRect(ctx, cardX, cardY, cardW, cardH, 22); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = 'rgba(18,169,224,0.28)'; ctx.lineWidth = 1.4;
      jpgRoundedRect(ctx, cardX, cardY, cardW, cardH, 22); ctx.stroke();

      // Ikon kartu/bank di kiri, kotak gradient teal→biru khas brand
      const iconSize = 64, iconX = cardX + 22, iconY = cardY + (cardH - iconSize) / 2;
      const iconGrad = ctx.createLinearGradient(iconX, iconY, iconX + iconSize, iconY + iconSize);
      iconGrad.addColorStop(0, '#12A9E0'); iconGrad.addColorStop(1, '#0FD8B8');
      ctx.fillStyle = iconGrad;
      jpgRoundedRect(ctx, iconX, iconY, iconSize, iconSize, 16); ctx.fill();
      // Piktogram kartu bank sederhana (strip + chip) di dalam ikon
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      jpgRoundedRect(ctx, iconX + 10, iconY + 16, iconSize - 20, iconSize - 32, 5); ctx.fill();
      ctx.fillStyle = iconGrad;
      ctx.fillRect(iconX + 10, iconY + 24, iconSize - 20, 7);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      jpgRoundedRect(ctx, iconX + 14, iconY + 38, 14, 10, 3); ctx.fill();

      // Lencana kecil "BCA" di pojok kanan atas kartu — kesan logo bank
      const bcaW = 68, bcaH = 30, bcaX = cardX + cardW - bcaW - 20, bcaY = cardY + 18;
      ctx.fillStyle = '#12A9E0';
      jpgRoundedRect(ctx, bcaX, bcaY, bcaW, bcaH, 9); ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '800 14px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('BCA', bcaX + bcaW / 2, bcaY + bcaH / 2 + 5);
      ctx.textAlign = 'left';

      // Teks: label kecil, nomor rekening besar & tebal (paling penting,
      // jadi elemen paling menonjol di kartu), lalu bank + atas nama.
      const textX = iconX + iconSize + 22;
      ctx.font = '700 13px "JetBrains Mono", monospace';
      ctx.fillStyle = '#0D9488';
      ctx.fillText('TRANSFER PEMBAYARAN KE REKENING', textX, cardY + 32);

      ctx.font = '800 30px "JetBrains Mono", monospace';
      ctx.fillStyle = '#0B2545';
      ctx.fillText(REKENING.nomor, textX, cardY + 68);

      ctx.font = '600 16px Inter, sans-serif';
      ctx.fillStyle = '#475569';
      ctx.fillText(`${REKENING.bank}  •  a.n. ${REKENING.atasNama}`, textX, cardY + 96);

      // ===== Footer: ringkasan + branding =====
      const lunasCount = rows.filter(p => p.pembayaran?.status === 'lunas').length;
      const dpCount = rows.filter(p => p.pembayaran?.status !== 'lunas' && (p.pembayaran?.totalDibayar || 0) > 0).length;
      const footerY = cardY + cardH + 54;

      ctx.font = '700 22px Outfit, sans-serif';
      ctx.fillStyle = '#0B2545';
      const totalLabel = `Total ${rows.length} Peserta`;
      ctx.fillText(totalLabel, PAD, footerY);
      const totalLabelW = ctx.measureText(totalLabel).width;
      ctx.font = '500 20px Inter, sans-serif';
      ctx.fillStyle = '#64748B';
      ctx.fillText(`•  ${lunasCount} Lunas   •  ${dpCount} DP Terbayar`, PAD + totalLabelW + 90, footerY);

      // Tautan website ditampilkan sebagai pil/tombol kecil supaya lebih
      // menarik & terlihat "bisa diklik", bukan cuma teks polos.
      const linkText = 'benyoriki.github.io/Kemeja';
      ctx.font = '700 16px "JetBrains Mono", monospace';
      const linkTextW = ctx.measureText(linkText).width;
      const linkPadX = 16, linkDot = 10;
      const linkW = linkDot + 10 + linkTextW + linkPadX * 2;
      const linkH = 34, linkX = PAD, linkY = footerY + 20;
      ctx.fillStyle = '#E6F7F4';
      jpgRoundedRect(ctx, linkX, linkY, linkW, linkH, 17); ctx.fill();
      ctx.strokeStyle = 'rgba(13,148,136,0.3)'; ctx.lineWidth = 1.2;
      jpgRoundedRect(ctx, linkX, linkY, linkW, linkH, 17); ctx.stroke();
      ctx.fillStyle = '#0D9488';
      ctx.beginPath(); ctx.arc(linkX + linkPadX + linkDot / 2, linkY + linkH / 2, linkDot / 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillText(linkText, linkX + linkPadX + linkDot + 10, linkY + linkH / 2 + 5);

      ctx.font = '400 15px Inter, sans-serif';
      ctx.fillStyle = '#94A3B8';
      ctx.fillText('Dibuat otomatis oleh Dasbor Admin — LOKON PRIMA', PAD, linkY + linkH + 34);

      canvas.toBlob((blob) => {
        if (!blob){ showToast('Gagal membuat gambar. Coba lagi.', 'error'); return; }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `daftar-peserta-kemeja-${new Date().toISOString().slice(0,10)}.jpg`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Gambar daftar peserta berhasil diunduh — siap dikirim ke grup WhatsApp.', 'success');
      }, 'image/jpeg', 0.94);
    } catch (err){
      console.error('Gagal membuat gambar daftar peserta:', err);
      showToast('Terjadi kesalahan saat membuat gambar.', 'error');
    } finally {
      adminExportJpgBtn.disabled = false;
      iconEl?.classList.remove('fa-spin');
      iconEl?.classList.replace('fa-circle-notch', 'fa-image');
    }
  }

  adminExportJpgBtn?.addEventListener('click', exportPesertaAsJpg);

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

  /* =========================================================
     19c. ADMIN — KELOLA CHAT (sematkan 1 pesan / hapus per-pesan)
     Pelengkap "Reset Chat" (yang menghapus SEMUA pesan sekaligus).
     Di sini admin bisa:
     - Menyematkan (pin) SATU pesan penting supaya muncul sebagai
       banner di atas chat peserta (situs publik). Menyematkan
       pesan lain otomatis melepas pin pesan sebelumnya (hanya
       boleh 1 pesan disematkan dalam satu waktu).
     - Menghapus pesan tertentu saja tanpa harus reset semua chat.
  ========================================================= */
  const adminManageChatBtn = document.getElementById('adminManageChatBtn');
  const manageChatOverlay = document.getElementById('manageChatOverlay');
  const manageChatClose = document.getElementById('manageChatClose');
  const manageChatList = document.getElementById('manageChatList');
  const manageChatEmpty = document.getElementById('manageChatEmpty');
  const manageChatSearch = document.getElementById('manageChatSearch');

  let manageChatCache = [];
  let manageChatLoaded = false;

  async function loadManageChat(){
    const fb = await waitForFirebase(8000);
    if (!fb){
      showToast('Tidak bisa memuat chat: Firebase belum tersambung.', 'error');
      return;
    }
    try {
      const q = fb.query(fb.collection(fb.db, fb.CHAT_COLLECTION), fb.orderBy('timestamp', 'desc'), fb.limit(150));
      const snap = await fb.getDocs(q);
      manageChatCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      manageChatLoaded = true;
      renderManageChat();
    } catch (err){
      console.warn('Gagal memuat daftar chat:', err.code, err.message);
      showToast('Gagal memuat daftar chat. Cek Firestore Rules koleksi "chat_pesan".', 'error');
    }
  }

  function renderManageChat(){
    if (!manageChatList) return;
    const q = (manageChatSearch?.value || '').trim().toLowerCase();
    let list = manageChatCache.slice();
    if (q){
      list = list.filter(m =>
        (m.nama || '').toLowerCase().includes(q) || (m.pesan || '').toLowerCase().includes(q)
      );
    }
    manageChatList.innerHTML = '';
    if (manageChatEmpty) manageChatEmpty.style.display = list.length === 0 ? 'block' : 'none';
    list.forEach(m => {
      const waktu = m.timestamp?.toDate ? m.timestamp.toDate().toLocaleString('id-ID', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) : '-';
      const item = document.createElement('div');
      item.className = 'chatmng-item' + (m.pinned ? ' is-pinned' : '');
      item.innerHTML = `
        <div class="chatmng-body">
          <div class="chatmng-top">
            <span class="chatmng-name">${escapeHtml(m.nama || 'Peserta')}</span>
            <span class="chatmng-time">${escapeHtml(waktu)}</span>
          </div>
          <div class="chatmng-text">${escapeHtml(m.pesan || '')}</div>
        </div>
        <div class="chatmng-actions">
          <button type="button" class="chatmng-btn pin-btn${m.pinned ? ' active' : ''}" title="${m.pinned ? 'Lepas sematan' : 'Sematkan pesan ini'}"><i class="fa-solid fa-thumbtack"></i></button>
          <button type="button" class="chatmng-btn del-btn" title="Hapus pesan ini"><i class="fa-solid fa-trash-can"></i></button>
        </div>
      `;
      item.querySelector('.pin-btn')?.addEventListener('click', () => toggleChatPin(m));
      item.querySelector('.del-btn')?.addEventListener('click', () => deleteChatMessage(m));
      manageChatList.appendChild(item);
    });
  }

  async function toggleChatPin(msg){
    const fb = await waitForFirebase(6000);
    if (!fb){ showToast('Firebase belum tersambung.', 'error'); return; }
    try {
      const nowPinning = !msg.pinned;
      // Hanya 1 pesan boleh disematkan dalam satu waktu — lepas pin
      // pesan lain yang sedang aktif dulu (kalau ada) sebelum
      // menyematkan yang baru, supaya banner di situs publik tidak ambigu.
      if (nowPinning){
        const others = manageChatCache.filter(m => m.pinned && m.id !== msg.id);
        for (const o of others){
          await fb.updateDoc(fb.doc(fb.db, fb.CHAT_COLLECTION, o.id), { pinned: false });
          o.pinned = false;
        }
      }
      await fb.updateDoc(fb.doc(fb.db, fb.CHAT_COLLECTION, msg.id), { pinned: nowPinning });
      msg.pinned = nowPinning;
      renderManageChat();
      showToast(nowPinning ? 'Pesan disematkan di atas chat peserta.' : 'Sematan pesan dilepas.', 'success');
      await logAdminAction('chat', nowPinning ? `Menyematkan pesan: "${(msg.pesan || '').slice(0, 80)}"` : `Melepas sematan pesan: "${(msg.pesan || '').slice(0, 80)}"`, msg.nama || '-');
    } catch (err){
      console.warn('Gagal mengubah status pin:', err);
      showToast('Gagal menyematkan pesan, coba lagi.', 'error');
    }
  }

  async function deleteChatMessage(msg){
    if (!confirm(`Hapus pesan dari "${msg.nama || 'peserta'}" ini untuk semua orang?`)) return;
    const fb = await waitForFirebase(6000);
    if (!fb){ showToast('Firebase belum tersambung.', 'error'); return; }
    try {
      await fb.deleteDoc(fb.doc(fb.db, fb.CHAT_COLLECTION, msg.id));
      manageChatCache = manageChatCache.filter(m => m.id !== msg.id);
      renderManageChat();
      showToast('Pesan berhasil dihapus.', 'success');
      await logAdminAction('chat', `Menghapus 1 pesan chat: "${(msg.pesan || '').slice(0, 80)}"`, msg.nama || '-');
    } catch (err){
      console.warn('Gagal menghapus pesan:', err);
      showToast('Gagal menghapus pesan, coba lagi.', 'error');
    }
  }

  adminManageChatBtn?.addEventListener('click', () => {
    manageChatOverlay?.classList.add('active');
    loadManageChat();
  });
  manageChatClose?.addEventListener('click', () => manageChatOverlay?.classList.remove('active'));
  manageChatOverlay?.addEventListener('click', (e) => { if (e.target === manageChatOverlay) manageChatOverlay.classList.remove('active'); });
  manageChatSearch?.addEventListener('input', renderManageChat);

  function renderAdminList(){
    if (!adminUnlocked || !adminList) return;

    // ---- Statistik dasbor (dihitung dari SELURUH data) ----
    const total = pesertaData.length;
    const menunggu = pesertaData.filter(p => (p.pembayaran?.status || 'belum_dp') === 'belum_dp').length;
    const cicilanJalan = pesertaData.filter(p => ['dp','cicilan'].includes(p.pembayaran?.status)).length;
    const lunas = pesertaData.filter(p => p.pembayaran?.status === 'lunas').length;
    const pendapatan = pesertaData.reduce((sum, p) => sum + (p.pembayaran?.totalDibayar || 0), 0);
    if (adashTotal) animateStatNumber(adashTotal, total);
    if (adashMenunggu) animateStatNumber(adashMenunggu, menunggu);
    if (adashCicilan) animateStatNumber(adashCicilan, cicilanJalan);
    if (adashLunas) animateStatNumber(adashLunas, lunas);
    if (adashPendapatan) adashPendapatan.textContent = formatRupiah(pendapatan);

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
          <span class="admin-code-chip"><i class="fa-solid fa-hashtag"></i>${escapeHtml(p.kodeUnik || '-')}</span>
          <span><i class="fa-solid fa-shirt"></i> ${escapeHtml(p.jenis || '-')} • ${escapeHtml(p.ukuranKemeja || '-')}</span>
          <span><i class="fa-solid fa-cubes"></i> ${p.jumlah || 1} pcs</span>
          <span><i class="fa-solid fa-wallet"></i> ${isCicilan ? '2x Cicilan' : 'Tunai'}</span>
          <span class="admin-row-total"><i class="fa-solid fa-tag"></i> ${formatRupiah(p.total || 0)}</span>
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

  // Update tahap aktif (dengan pencatatan otomatis "selesaiPadaISO" untuk
  // tahap-tahap yang baru saja dilewati, supaya badge "Selesai" di situs
  // publik bisa menampilkan tanggal selesai yang sebenarnya).
  estCurrentStageSave?.addEventListener('click', async () => {
    const newStage = parseInt(estCurrentStage?.value, 10) || 1;
    const oldStage = Math.min(4, Math.max(1, parseInt(estimasiDataCache?.currentStage, 10) || 1));

    if (newStage === oldStage){
      showToast('Tahap aktif tidak berubah.', 'error');
      return;
    }

    const confirmed = await showAdminConfirm({
      title: 'Update Tahap Aktif Program?',
      messageHtml: `<p>Tahap aktif akan diubah dari <b>"${escapeHtml(STAGE_LABELS[oldStage])}"</b> menjadi <b>"${escapeHtml(STAGE_LABELS[newStage])}"</b>. Semua pengunjung situs akan langsung melihat perubahan ini di bagian "Progress Iuran Bersama".</p>`,
      confirmLabel: 'Ya, Update Tahap',
      danger: newStage < oldStage
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
      const patch = { currentStage: newStage, updatedAt: fb.serverTimestamp ? fb.serverTimestamp() : new Date().toISOString() };
      // Kalau tahap MAJU, catat tanggal selesai riil untuk tahap-tahap yang baru dilewati.
      if (newStage > oldStage){
        const nowIso = new Date().toISOString();
        for (let n = oldStage; n < newStage; n++){
          const existing = estimasiDataCache?.[`stage${n}`] || {};
          patch[`stage${n}`] = { ...existing, selesaiPadaISO: nowIso };
        }
      }
      await fb.setDoc(programStatusRef(fb), patch, { merge: true });
      await logAdminAction('edit', `Tahap aktif: "${STAGE_LABELS[oldStage]}" → "${STAGE_LABELS[newStage]}"`, 'Progres Program');
      showToast('Tahap aktif berhasil diperbarui.', 'success');
    } catch (err){
      console.warn('Gagal update tahap aktif:', err.code, err.message);
      showToast('Gagal menyimpan — cek Firestore Rules koleksi "program_status".', 'error');
    } finally {
      estCurrentStageSave.disabled = false;
      estCurrentStageSave.innerHTML = originalHtml;
    }
  });

});