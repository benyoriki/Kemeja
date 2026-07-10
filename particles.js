/* =========================================================
   LOKON PRIMA — particles.js
   -------------------------------------------------
   File terpisah khusus untuk EFEK VISUAL / PARTIKEL:
   - Partikel tetesan air + ripple di background Hero
   - Confetti burst saat pendaftaran berhasil
   - Cursor glow (ambient, desktop saja)
   - Tombol magnetik (desktop saja)
   - Efek ripple saat tombol ditekan
   - Glow mengikuti kursor di kartu Keunggulan

   Kenapa dipisah dari script.js?
   - script.js     -> FUNGSI SISTEM (wajib): navbar, form
                      pendaftaran, Firebase, dasbor admin,
                      chat grup, dsb. Situs tetap berjalan
                      normal tanpa file ini.
   - particles.js  -> murni hiasan. Kalau file ini gagal
                      dimuat/error, fitur INTI (daftar, admin,
                      chat) tetap aman — yang hilang hanya
                      efek visualnya. Ini sengaja, supaya
                      lebih mudah melacak bug: bug fungsi vs
                      bug tampilan jadi jelas terpisah.

   PENTING: file ini HARUS tetap disertakan di index.html
   SETELAH script.js (lihat urutan <script> di bagian bawah
   halaman), karena efek confetti dipicu dari script.js lewat
   window.lokonFireConfetti.
========================================================= */

document.addEventListener('DOMContentLoaded', () => {

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

  /* ============ 7a2. CONFETTI BURST (2026 refresh) ============
     Ledakan konfeti singkat (2.4 detik) di atas seluruh layar saat
     pendaftaran berhasil dikirim — efek "menjual" & merayakan momen
     pendaftaran, memakai canvas terpisah supaya tidak mengganggu
     animasi hero yang lain. Otomatis dihormati prefers-reduced-motion. */
  function fireConfetti(){
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return;
    const cCanvas = document.getElementById('confettiCanvas');
    if (!cCanvas) return;
    const cCtx = cCanvas.getContext('2d');
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    cCanvas.width = window.innerWidth * DPR;
    cCanvas.height = window.innerHeight * DPR;
    cCanvas.style.width = window.innerWidth + 'px';
    cCanvas.style.height = window.innerHeight + 'px';
    cCtx.setTransform(DPR, 0, 0, DPR, 0, 0);

    const colors = ['#12A9E0', '#0FD8B8', '#F2C94C', '#FFFFFF', '#0A84C4'];
    const count = window.matchMedia('(pointer: coarse)').matches ? 70 : 120;
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
    const duration = 2400;
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
  // Diekspos secara global supaya script.js (logika inti pendaftaran)
  // bisa memicu confetti tanpa perlu tahu detail implementasinya di sini.
  window.lokonFireConfetti = fireConfetti;

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

  /* =========================================================
     2026 VISUAL REFRESH — EFEK TAMBAHAN (murni hiasan)
  ========================================================= */
  const reduceMotionGlobal = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isFinePointer = window.matchMedia('(pointer: fine)').matches;

  /* ---- 11. Bintang kelap-kelip di Hero ---- */
  const twinkleLayer = document.getElementById('heroTwinkleLayer');
  if (twinkleLayer && !reduceMotionGlobal){
    const starCount = window.matchMedia('(pointer: coarse)').matches ? 18 : 30;
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

  /* ---- 12. Tilt 3D lembut untuk kartu Keunggulan & Galeri (desktop) ---- */
  if (isFinePointer && !reduceMotionGlobal){
    document.querySelectorAll('.tilt-card').forEach(card => {
      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const px = (e.clientX - rect.left) / rect.width - 0.5;
        const py = (e.clientY - rect.top) / rect.height - 0.5;
        card.style.transform = `perspective(700px) rotateX(${(-py * 7).toFixed(2)}deg) rotateY(${(px * 7).toFixed(2)}deg) translateY(-2px)`;
      });
      card.addEventListener('mouseleave', () => { card.style.transform = ''; });
    });
  }

  /* ---- 13. Sparkle burst kecil saat memilih kartu metode pembayaran ---- */
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

  /* ---- 14. Tilt 3D + lift untuk Kartu Peta Lokasi (desktop) ---- */
  const mapCardEl = document.querySelector('.map-card');
  if (mapCardEl && isFinePointer && !reduceMotionGlobal){
    mapCardEl.addEventListener('mousemove', (e) => {
      const rect = mapCardEl.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width - 0.5;
      const py = (e.clientY - rect.top) / rect.height - 0.5;
      mapCardEl.style.transform =
        `perspective(900px) rotateX(${(-py * 5).toFixed(2)}deg) rotateY(${(px * 5).toFixed(2)}deg) translateY(-8px) scale(1.012)`;
    });
    mapCardEl.addEventListener('mouseleave', () => { mapCardEl.style.transform = ''; });
  }

});
