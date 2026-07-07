/* =========================================================
   LOKON PRIMA — script.js
   Catatan: browser tidak dapat mengirim WhatsApp/menyimpan file
   secara sepenuhnya otomatis tanpa aksi apapun dari pengguna
   karena batasan keamanan browser. Skrip ini memicu unduhan
   struk JPG lalu membuka WhatsApp dengan pesan yang sudah terisi,
   sehingga pengguna tinggal menekan tombol kirim di WhatsApp.
========================================================= */

document.addEventListener('DOMContentLoaded', () => {

  /* ============ 1. LOADING SCREEN ============ */
  const loadingScreen = document.getElementById('loading-screen');
  window.addEventListener('load', () => {
    setTimeout(() => loadingScreen.classList.add('hide'), 500);
  });
  // Fallback in case 'load' already fired or takes too long
  setTimeout(() => loadingScreen && loadingScreen.classList.add('hide'), 2500);

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
  hamburger.addEventListener('click', () => {
    navLinks.classList.toggle('open');
    hamburger.classList.toggle('active');
  });
  navLinks.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      navLinks.classList.remove('open');
      hamburger.classList.remove('active');
    });
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

  /* ============ 7. WATER DROPLET + RIPPLE PARTICLE BACKGROUND (HERO) ============ */
  const canvas = document.getElementById('particleCanvas');
  if (canvas){
    const ctx = canvas.getContext('2d');
    const hero = document.getElementById('home');
    let particles = [];
    let ripples = [];
    let W, H, DPR;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isCoarse = window.matchMedia('(pointer: coarse)').matches;

    function resizeCanvas(){
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      W = hero.offsetWidth;
      H = hero.offsetHeight;
      canvas.width = W * DPR;
      canvas.height = H * DPR;
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      initParticles();
    }

    function initParticles(){
      // Slightly lighter density on touch devices to keep scrolling smooth
      const cap = isCoarse ? 46 : 70;
      const density = Math.min(cap, Math.max(24, Math.floor((W * H) / 24000)));
      particles = Array.from({ length: density }, () => makeDroplet());
    }

    function makeDroplet(y){
      const r = Math.random() * 2.4 + 1;
      return {
        x: Math.random() * W,
        y: y !== undefined ? y : Math.random() * H,
        r,
        speed: Math.random() * 0.5 + 0.18,
        drift: (Math.random() - 0.5) * 0.35,
        alpha: Math.random() * 0.35 + 0.18,
        pulse: Math.random() * Math.PI * 2
      };
    }

    function spawnRipple(x, y){
      ripples.push({ x, y, r: 4, maxR: 70 + Math.random() * 50, alpha: 0.5 });
    }

    // Ambient ripples appear occasionally on their own
    let rippleTimer = 0;
    function maybeSpawnAmbientRipple(){
      rippleTimer++;
      if (rippleTimer > (isCoarse ? 130 : 90)){
        rippleTimer = 0;
        spawnRipple(Math.random() * W, H * (0.55 + Math.random() * 0.4));
      }
    }

    // Interactive ripple on tap/click within the hero
    hero.addEventListener('pointerdown', (e) => {
      if (reduceMotion) return;
      const rect = hero.getBoundingClientRect();
      spawnRipple(e.clientX - rect.left, e.clientY - rect.top);
    });

    function draw(){
      ctx.clearRect(0, 0, W, H);

      particles.forEach(p => {
        p.y -= p.speed;
        p.x += p.drift;
        p.pulse += 0.02;
        if (p.y < -10){
          Object.assign(p, makeDroplet(H + 10));
        }
        const glow = (Math.sin(p.pulse) + 1) / 2;
        ctx.beginPath();
        ctx.fillStyle = `rgba(180, 236, 250, ${p.alpha + glow * 0.12})`;
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      });

      maybeSpawnAmbientRipple();
      ripples = ripples.filter(r => r.alpha > 0.01);
      ripples.forEach(r => {
        r.r += (r.maxR - r.r) * 0.045 + 0.4;
        r.alpha *= 0.965;
        ctx.beginPath();
        ctx.strokeStyle = `rgba(150, 230, 245, ${r.alpha})`;
        ctx.lineWidth = 1.4;
        ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
        ctx.stroke();
      });

      if (!reduceMotion) requestAnimationFrame(draw);
    }

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    if (!reduceMotion){
      requestAnimationFrame(draw);
    } else {
      draw();
    }
  }

  /* ============ 7b. AMBIENT CURSOR GLOW (desktop / fine pointer only) ============ */
  const cursorGlow = document.getElementById('cursorGlow');
  if (cursorGlow && window.matchMedia('(pointer: fine)').matches && !window.matchMedia('(prefers-reduced-motion: reduce)').matches){
    let glowRAF = null, gx = 0, gy = 0;
    window.addEventListener('mousemove', (e) => {
      gx = e.clientX; gy = e.clientY;
      cursorGlow.classList.add('active');
      if (!glowRAF){
        glowRAF = requestAnimationFrame(() => {
          cursorGlow.style.transform = `translate(${gx}px, ${gy}px) translate(-50%, -50%)`;
          glowRAF = null;
        });
      }
    });
    window.addEventListener('mouseleave', () => cursorGlow.classList.remove('active'));
  }

  /* ============ 7c. MAGNETIC BUTTONS (desktop / fine pointer only) ============ */
  if (window.matchMedia('(pointer: fine)').matches && !window.matchMedia('(prefers-reduced-motion: reduce)').matches){
    document.querySelectorAll('.magnetic').forEach(btn => {
      btn.addEventListener('mousemove', (e) => {
        const rect = btn.getBoundingClientRect();
        const relX = e.clientX - rect.left - rect.width / 2;
        const relY = e.clientY - rect.top - rect.height / 2;
        btn.style.transform = `translate(${relX * 0.18}px, ${relY * 0.28 - 3}px)`;
      });
      btn.addEventListener('mouseleave', () => { btn.style.transform = ''; });
    });
  }

  /* ============ 8. GALLERY LIGHTBOX ============ */
  const galleryItems = document.querySelectorAll('.gallery-item');
  const lightbox = document.getElementById('lightbox');
  const lightboxImg = document.getElementById('lightboxImg');
  const lightboxCaption = document.getElementById('lightboxCaption');
  const lightboxClose = document.getElementById('lightboxClose');

  galleryItems.forEach(item => {
    item.addEventListener('click', () => {
      const img = item.querySelector('img');
      lightboxImg.src = img.src;
      lightboxImg.alt = img.alt;
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

  /* ============ 9. RIPPLE BUTTON EFFECT ============ */
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

  /* ============ 10. FEATURE CARD MOUSE GLOW ============ */
  document.querySelectorAll('.feature-card').forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - rect.left}px`);
      card.style.setProperty('--my', `${e.clientY - rect.top}px`);
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
  const jenisKemejaRadios = document.querySelectorAll('input[name="jenisKemeja"]');

  const requiredFields = form.querySelectorAll('[required]');

  function formatRupiah(angka){
    return 'Rp' + angka.toLocaleString('id-ID');
  }

  function getHargaSatuan(){
    const checked = form.querySelector('input[name="jenisKemeja"]:checked');
    return checked ? parseInt(checked.dataset.harga, 10) : 0;
  }

  function hitungTotal(){
    const harga = getHargaSatuan();
    const jumlah = parseInt(jumlahInput.value, 10) || 0;
    const total = harga * jumlah;
    totalHargaEl.textContent = formatRupiah(total);
    return total;
  }

  jenisKemejaRadios.forEach(r => r.addEventListener('change', hitungTotal));
  jumlahInput.addEventListener('input', hitungTotal);
  hitungTotal();

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
     14. SUBMIT FORM: LOADING -> STRUK JPG -> WHATSAPP -> POPUP
     (Perbaikan bug: sebelumnya kode mencoba membaca field
     'nik', 'departemen', 'jabatan', 'noHp', 'alamat' yang
     kolom HTML-nya belum tersedia, menyebabkan proses macet
     selamanya di layar "Memproses pendaftaran...". Sekarang
     seluruh kolom formulir tersedia dan sinkron dengan skrip.)
  ========================================================= */
  const submitLoading = document.getElementById('submitLoading');
  const successModal = document.getElementById('successModal');
  const closeModal = document.getElementById('closeModal');

  closeModal.addEventListener('click', () => successModal.classList.remove('active'));
  successModal.addEventListener('click', (e) => {
    if (e.target === successModal) successModal.classList.remove('active');
  });

  form.addEventListener('submit', function(e){
    e.preventDefault();

    if (!validateAll()){
      showToast('Mohon lengkapi data dengan benar.', 'error');
      const firstInvalid = form.querySelector('.invalid');
      if (firstInvalid) firstInvalid.scrollIntoView({ behavior:'smooth', block:'center' });
      return;
    }

    submitBtn.disabled = true;
    submitLoading.classList.add('active');

    let data;
    try {
      data = collectFormData();
    } catch (err){
      submitLoading.classList.remove('active');
      submitBtn.disabled = false;
      showToast('Terjadi kesalahan, silakan coba lagi.', 'error');
      console.error('collectFormData error:', err);
      return;
    }

    setTimeout(() => {
      try {
        generateStrukJPG(data);
      } catch (err){
        console.error('generateStrukJPG error:', err);
      }
      submitLoading.classList.remove('active');
      successModal.classList.add('active');
      showToast('Pendaftaran berhasil dikirim!', 'success');
      submitBtn.disabled = false;

      setTimeout(() => openWhatsApp(data), 900);
    }, 1600);
  });

  function collectFormData(){
    const jenisChecked = form.querySelector('input[name="jenisKemeja"]:checked');
    const jenisLabel = jenisChecked.value === 'pendek' ? 'Tangan Pendek' : 'Tangan Panjang';
    const harga = parseInt(jenisChecked.dataset.harga, 10);
    const jumlah = parseInt(jumlahInput.value, 10);
    const total = harga * jumlah;

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
      total: total,
      catatan: document.getElementById('catatan').value.trim(),
      tanggal, jam
    };
  }

  /* ============ 15. GENERATE STRUK JPG (CANVAS) ============ */
  function generateStrukJPG(data){
    const canvasEl = document.getElementById('strukCanvas');
    const rows = [
      ['Nama', data.nama],
      ['Nama Bordir', data.namaBordir],
      ['Departemen', data.departemen],
      ['Jenis Kelamin', data.gender],
      ['Ukuran', data.ukuranKemeja],
      ['Jenis Kemeja', data.jenis],
      ['Jumlah', String(data.jumlah)],
      ['Harga Satuan', formatRupiah(data.harga)],
    ];
    // dynamic canvas height based on content
    const baseHeight = 640;
    const extraPerRow = 30;
    const catatanLines = Math.ceil((data.catatan || '-').length / 46) || 1;
    const neededHeight = baseHeight + rows.length * extraPerRow + catatanLines * 18 + 220;
    canvasEl.height = Math.max(900, neededHeight);

    const ctx = canvasEl.getContext('2d');
    const W = canvasEl.width, H = canvasEl.height;

    // Background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, W, H);

    // Header gradient
    const grad = ctx.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, '#0B2545');
    grad.addColorStop(0.55, '#0A84C4');
    grad.addColorStop(1, '#0FD8B8');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, 130);

    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.font = '700 26px Outfit, Poppins, sans-serif';
    ctx.fillText('PT. LOKON PRIMA', W/2, 55);
    ctx.font = '400 14px Inter, sans-serif';
    ctx.fillText('Distributor Air Kemasan AQUA', W/2, 80);
    ctx.font = '600 13px Inter, sans-serif';
    ctx.fillText('STRUK PENDAFTARAN KEMEJA KERJA', W/2, 108);

    // Body
    ctx.textAlign = 'left';
    ctx.fillStyle = '#0A1826';
    let y = 170;
    const lineGap = 32;
    const labelX = 40;
    const valueX = 210;

    ctx.font = '600 13px Inter, sans-serif';
    ctx.fillStyle = '#5A7186';
    ctx.fillText(`${data.tanggal}  •  ${data.jam}`, labelX, y);
    y += 40;

    ctx.strokeStyle = '#E4F3F9';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(40, y); ctx.lineTo(W-40, y); ctx.stroke();
    y += 30;

    rows.forEach(([label, value]) => {
      ctx.font = '500 13.5px Inter, sans-serif';
      ctx.fillStyle = '#5A7186';
      ctx.fillText(label, labelX, y);
      ctx.font = '600 13.5px Inter, sans-serif';
      ctx.fillStyle = '#0A1826';
      const endY = wrapText(ctx, value || '-', valueX, y, W - valueX - 40, 18);
      y = Math.max(y + lineGap, endY + lineGap);
    });

    y += 6;
    ctx.strokeStyle = '#E4F3F9';
    ctx.beginPath(); ctx.moveTo(40, y); ctx.lineTo(W-40, y); ctx.stroke();
    y += 40;

    // Total box
    const totalGrad = ctx.createLinearGradient(40, 0, W - 40, 0);
    totalGrad.addColorStop(0, '#12A9E0');
    totalGrad.addColorStop(1, '#0FD8B8');
    ctx.fillStyle = totalGrad;
    roundRect(ctx, 40, y - 26, W - 80, 56, 14);
    ctx.fill();
    ctx.fillStyle = '#04213A';
    ctx.font = '600 15px Inter, sans-serif';
    ctx.fillText('TOTAL PEMBAYARAN', 58, y - 2);
    ctx.textAlign = 'right';
    ctx.font = '700 18px Inter, sans-serif';
    ctx.fillText(formatRupiah(data.total), W - 58, y - 2);
    ctx.textAlign = 'left';
    y += 60;

    // Catatan
    ctx.font = '500 13px Inter, sans-serif';
    ctx.fillStyle = '#5A7186';
    ctx.fillText('Catatan:', labelX, y);
    y += 20;
    ctx.font = '400 13px Inter, sans-serif';
    ctx.fillStyle = '#0A1826';
    y = wrapText(ctx, data.catatan || '-', labelX, y, W - 80, 18);
    y += 34;

    // QR placeholder
    const qrSize = 110;
    const qrX = (W - qrSize) / 2;
    ctx.fillStyle = '#F2FAFC';
    roundRect(ctx, qrX, y, qrSize, qrSize, 10);
    ctx.fill();
    ctx.strokeStyle = '#12A9E0';
    ctx.lineWidth = 2;
    roundRect(ctx, qrX, y, qrSize, qrSize, 10);
    ctx.stroke();
    ctx.fillStyle = '#0A84C4';
    ctx.font = '600 11px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('QR CODE', W/2, y + qrSize/2 - 4);
    ctx.font = '400 9px Inter, sans-serif';
    ctx.fillText('(placeholder)', W/2, y + qrSize/2 + 12);
    y += qrSize + 36;

    // Status
    ctx.fillStyle = '#0BB89C';
    ctx.font = '700 16px Inter, sans-serif';
    ctx.fillText('✔ PENDAFTARAN BERHASIL', W/2, y);
    y += 26;
    ctx.fillStyle = '#5A7186';
    ctx.font = '400 12px Inter, sans-serif';
    ctx.fillText(`WhatsApp Perusahaan: +62 856-9732-1423`, W/2, y);

    ctx.textAlign = 'left';

    // Trigger download
    const link = document.createElement('a');
    link.download = 'STRUK_PEMESANAN_KEMEJA.jpg';
    link.href = canvasEl.toDataURL('image/jpeg', 0.95);
    link.click();
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
    const pesan =
`================================
PENDAFTARAN KEMEJA KERJA
PT. LOKON PRIMA
================================
Nama : ${data.nama}
Nama Bordir : ${data.namaBordir}
Departemen : ${data.departemen}
Ukuran : ${data.ukuranKemeja}
Jenis : ${data.jenis}
Jumlah : ${data.jumlah}
Harga : ${formatRupiah(data.harga)}
Total : ${formatRupiah(data.total)}
Catatan : ${data.catatan}
================================
Terima kasih.`;

    const nomorTujuan = '6285697321423';
    const url = `https://wa.me/${nomorTujuan}?text=${encodeURIComponent(pesan)}`;
    window.open(url, '_blank');
  }

  /* ============ 17. FOOTER YEAR ============ */
  document.getElementById('year').textContent = new Date().getFullYear();

});
