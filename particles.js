/* =========================================================
   LOKON PRIMA — particles.js (VERSI RINGAN / LOW-PERFORMANCE MODE)
   -------------------------------------------------
   File ini sudah dioptimasi supaya jauh lebih ringan di PC lama
   (mis. Windows 7 / GPU terintegrasi lama). Perubahan utama vs
   versi sebelumnya:

   1. Partikel latar Hero: jumlah dipangkas jauh, frame rate
      dibatasi ~24fps (bukan 60fps), DPR dipatok maksimal 1
      (bukan 2), dan animasi OTOMATIS BERHENTI saat tab tidak
      aktif atau Hero tidak terlihat di layar (IntersectionObserver).
   2. "Ambient cursor glow" & "tombol magnetik" (efek yang terus
      menerus menulis ulang style setiap gerakan mouse) DIMATIKAN
      total — efeknya nyaris tidak terlihat tapi cukup mahal untuk
      GPU lama.
   3. Tilt 3D kartu (Keunggulan/Galeri/Peta) & glow kartu Keunggulan
      tetap ada (masih terasa "hidup"), tapi sekarang DIBATASI lewat
      requestAnimationFrame supaya tidak menulis style di setiap
      event mousemove mentah-mentah.
   4. Bintang kelap-kelip di Hero: jumlah dipangkas.
   5. Confetti tetap ada (cuma muncul sekali saat pendaftaran
      berhasil, jadi aman) tapi jumlah partikelnya dikurangi.

   Fitur INTI situs (navbar, form pendaftaran, Firebase, dasbor
   admin, chat) tidak disentuh sama sekali oleh file ini.
========================================================= */

document.addEventListener('DOMContentLoaded', () => {

  const reduceMotionGlobal = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isFinePointer = window.matchMedia('(pointer: fine)').matches;
  const isCoarse = window.matchMedia('(pointer: coarse)').matches;
  const saveData = !!(navigator.connection && navigator.connection.saveData);
  // Mode ringan aktif kalau: pengguna minta reduced motion, mode hemat data aktif,
  // ATAU perangkat hanya punya sedikit inti CPU (indikasi PC/HP lama & lemah).
  const lowPowerMode = reduceMotionGlobal || saveData || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2);

  /* ============ 7. WATER DROPLET + RIPPLE PARTICLE BACKGROUND (HERO) ============ */
  const canvas = document.getElementById('particleCanvas');
  if (canvas && !lowPowerMode){
    const ctx = canvas.getContext('2d');
    const hero = document.getElementById('home');
    let particles = [];
    let ripples = [];
    let W, H, DPR;
    let running = false;
    let rafId = null;
    let lastFrame = 0;
    const FRAME_MS = 42; // ~24fps — cukup halus untuk hiasan latar, jauh lebih hemat CPU/GPU

    function resizeCanvas(){
      DPR = 1; // dipatok 1 (bukan devicePixelRatio asli) — memangkas jumlah piksel
                // yang harus digambar tiap frame, penyebab utama "berat" di layar HD/retina
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
      // Jumlah partikel dipangkas jauh dari versi awal (dulu sampai 70).
      const cap = isCoarse ? 16 : 22;
      const density = Math.min(cap, Math.max(8, Math.floor((W * H) / 60000)));
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

    // Riak ambient dibuat lebih jarang muncul (hemat CPU)
    let rippleTimer = 0;
    function maybeSpawnAmbientRipple(){
      rippleTimer++;
      if (rippleTimer > (isCoarse ? 220 : 170)){
        rippleTimer = 0;
        spawnRipple(Math.random() * W, H * (0.55 + Math.random() * 0.4));
      }
    }

    // Riak interaktif saat tap/klik di area Hero
    hero.addEventListener('pointerdown', (e) => {
      const rect = hero.getBoundingClientRect();
      spawnRipple(e.clientX - rect.left, e.clientY - rect.top);
    });

    function draw(ts){
      if (!running) return;
      if (ts - lastFrame < FRAME_MS){
        rafId = requestAnimationFrame(draw);
        return;
      }
      lastFrame = ts;
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

      rafId = requestAnimationFrame(draw);
    }

    function start(){
      if (running) return;
      running = true;
      lastFrame = 0;
      rafId = requestAnimationFrame(draw);
    }
    function stop(){
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
    }

    // Animasi otomatis berhenti kalau tab tidak aktif ATAU Hero sedang di luar layar
    // (mis. pengguna sudah scroll jauh ke bawah) — tidak buang-buang CPU untuk sesuatu
    // yang tidak terlihat sama sekali.
    let heroVisible = true;
    function syncRunning(){
      if (document.hidden || !heroVisible) stop(); else start();
    }
    document.addEventListener('visibilitychange', syncRunning);
    if ('IntersectionObserver' in window){
      const io = new IntersectionObserver((entries) => {
        heroVisible = entries[0].isIntersecting;
        syncRunning();
      }, { threshold: 0.05 });
      io.observe(hero);
    }

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    syncRunning();
  }

  /* ============ 7a2. CONFETTI BURST (saat pendaftaran berhasil) ============
     Tetap dipertahankan karena cuma tampil sekali & singkat (2 detik),
     tapi jumlah partikelnya dikurangi supaya lebih ringan. */
  function fireConfetti(){
    if (reduceMotionGlobal) return;
    const cCanvas = document.getElementById('confettiCanvas');
    if (!cCanvas) return;
    const cCtx = cCanvas.getContext('2d');
    const DPR = 1;
    cCanvas.width = window.innerWidth * DPR;
    cCanvas.height = window.innerHeight * DPR;
    cCanvas.style.width = window.innerWidth + 'px';
    cCanvas.style.height = window.innerHeight + 'px';
    cCtx.setTransform(DPR, 0, 0, DPR, 0, 0);

    const colors = ['#12A9E0', '#0FD8B8', '#F2C94C', '#FFFFFF', '#0A84C4'];
    const count = isCoarse ? 36 : 60; // dulu 70/120, dipangkas ~separuh
    const pieces = Array.from({ length: count }, () => ({
      x: window.innerWidth / 2 + (Math.random() - 0.5) * window.innerWidth * 0.5,
      y: window.innerHeight * 0.32,
      vx: (Math.random() - 0.5) * 9,
      vy: Math.random() * -9 - 3,
      w: Math.random() * 7 + 4,
      h: Math.random() * 10 + 5,
      rot: Math.random() * 360,
      vr: (Math.random() - 0.5) * 14,
      color: colors[Math.floor(Math.random() * colors.length)],
      gravity: 0.28 + Math.random() * 0.12
    }));

    const start = performance.now();
    const duration = 2000;
    function step(now){
      const t = now - start;
      cCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      pieces.forEach(p => {
        p.vy += p.gravity * 0.06;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        cCtx.save();
        cCtx.translate(p.x, p.y);
        cCtx.rotate((p.rot * Math.PI) / 180);
        cCtx.fillStyle = p.color;
        cCtx.globalAlpha = Math.max(0, 1 - t / duration);
        cCtx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        cCtx.restore();
      });
      if (t < duration){
        requestAnimationFrame(step);
      } else {
        cCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      }
    }
    requestAnimationFrame(step);
  }
  window.lokonFireConfetti = fireConfetti;

  /* ============ 7b. AMBIENT CURSOR GLOW — DIMATIKAN ============
     Efek ini dulu menulis ulang style setiap gerakan mouse di
     seluruh halaman. Dampak visualnya kecil tapi biayanya besar
     di GPU lama, jadi dinonaktifkan sepenuhnya. */

  /* ============ 7c. MAGNETIC BUTTONS — DIMATIKAN ============
     Sama seperti di atas: efek "magnet" pada tombol dihilangkan
     karena menulis transform di setiap event mousemove tanpa
     pembatasan. Tombol tetap punya efek hover normal lewat CSS. */

  /* ============ 9. RIPPLE BUTTON EFFECT (tetap, ringan) ============ */
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

  /* ============ 10. FEATURE CARD MOUSE GLOW (dibatasi via rAF) ============ */
  if (isFinePointer && !lowPowerMode){
    document.querySelectorAll('.feature-card').forEach(card => {
      let ticking = false, lastX = 0, lastY = 0;
      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        lastX = e.clientX - rect.left;
        lastY = e.clientY - rect.top;
        if (!ticking){
          ticking = true;
          requestAnimationFrame(() => {
            card.style.setProperty('--mx', `${lastX}px`);
            card.style.setProperty('--my', `${lastY}px`);
            ticking = false;
          });
        }
      });
    });
  }

  /* ---- 11. Bintang kelap-kelip di Hero (jumlah dipangkas) ---- */
  const twinkleLayer = document.getElementById('heroTwinkleLayer');
  if (twinkleLayer && !lowPowerMode){
    const starCount = isCoarse ? 8 : 14; // dulu 18/30
    const frag = document.createDocumentFragment();
    for (let i = 0; i < starCount; i++){
      const star = document.createElement('span');
      star.className = 'twinkle-star';
      const size = (Math.random() * 1.8 + 1).toFixed(1);
      star.style.width = star.style.height = `${size}px`;
      star.style.left = `${Math.random() * 100}%`;
      star.style.top = `${Math.random() * 100}%`;
      star.style.animationDuration = `${(Math.random() * 3 + 2.2).toFixed(2)}s`;
      star.style.animationDelay = `${(Math.random() * 4).toFixed(2)}s`;
      frag.appendChild(star);
    }
    twinkleLayer.appendChild(frag);
  }

  /* ---- 12. Tilt 3D lembut untuk kartu Keunggulan & Galeri (dibatasi via rAF) ---- */
  if (isFinePointer && !lowPowerMode){
    document.querySelectorAll('.tilt-card').forEach(card => {
      let ticking = false, lastPx = 0, lastPy = 0;
      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        lastPx = (e.clientX - rect.left) / rect.width - 0.5;
        lastPy = (e.clientY - rect.top) / rect.height - 0.5;
        if (!ticking){
          ticking = true;
          requestAnimationFrame(() => {
            card.style.transform = `perspective(700px) rotateX(${(-lastPy * 7).toFixed(2)}deg) rotateY(${(lastPx * 7).toFixed(2)}deg) translateY(-2px)`;
            ticking = false;
          });
        }
      });
      card.addEventListener('mouseleave', () => { card.style.transform = ''; });
    });
  }

  /* ---- 13. Sparkle burst kecil saat memilih kartu metode pembayaran (tetap, ringan) ---- */
  document.querySelectorAll('input[name="metodeBayar"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      if (reduceMotionGlobal || !e.target.checked) return;
      const card = e.target.closest('.payment-card');
      if (!card) return;
      const burstCount = 6;
      for (let i = 0; i < burstCount; i++){
        const spark = document.createElement('span');
        spark.className = 'fee-sparkle';
        const angle = (Math.PI * 2 * i) / burstCount + Math.random() * 0.4;
        const dist = 18 + Math.random() * 14;
        spark.style.setProperty('--sx', `${(Math.cos(angle) * dist).toFixed(1)}px`);
        spark.style.setProperty('--sy', `${(Math.sin(angle) * dist).toFixed(1)}px`);
        spark.style.background = i % 2 === 0 ? '#0FD8B8' : '#12A9E0';
        card.appendChild(spark);
        setTimeout(() => spark.remove(), 600);
      }
    });
  });

  /* ---- 14. Tilt 3D + lift untuk Kartu Peta Lokasi (dibatasi via rAF) ---- */
  const mapCardEl = document.querySelector('.map-card');
  if (mapCardEl && isFinePointer && !lowPowerMode){
    let ticking = false, lastPx = 0, lastPy = 0;
    mapCardEl.addEventListener('mousemove', (e) => {
      const rect = mapCardEl.getBoundingClientRect();
      lastPx = (e.clientX - rect.left) / rect.width - 0.5;
      lastPy = (e.clientY - rect.top) / rect.height - 0.5;
      if (!ticking){
        ticking = true;
        requestAnimationFrame(() => {
          mapCardEl.style.transform =
            `perspective(900px) rotateX(${(-lastPy * 5).toFixed(2)}deg) rotateY(${(lastPx * 5).toFixed(2)}deg) translateY(-8px) scale(1.012)`;
          ticking = false;
        });
      }
    });
    mapCardEl.addEventListener('mouseleave', () => { mapCardEl.style.transform = ''; });
  }

});
