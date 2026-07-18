/* =========================================================
   admin-login-fx.js — Efek visual tambahan KHUSUS layar login
   -------------------------------------------------
   File berdiri sendiri, tidak menyentuh admin-script.js sama
   sekali — hanya "menghias" elemen yang sudah ada:
     1) Kanvas partikel jaringan tipis (constellation) di latar
        layar login — jumlah titik menyesuaikan lebar layar
        supaya tetap ringan di HP.
     2) Cincin kedua di ikon perisai (radar look).
     3) Tilt magnetik halus pada tombol "Masuk" (nonaktif di
        layar sentuh / prefers-reduced-motion).

   Semua efek otomatis berhenti saat:
     - prefers-reduced-motion: reduce
     - layar login sedang tidak tampil (sudah masuk ke dasbor)
     - tab browser sedang tidak aktif (document.hidden)
   sehingga tidak membebani baterai/CPU HP setelah admin login.
========================================================= */
(function(){
  'use strict';

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function ready(fn){
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  ready(function(){
    var adminLogin = document.getElementById('adminLogin');
    if (!adminLogin) return;

    /* -----------------------------------------------------
       0. Helper: apakah layar login sedang terlihat?
       (adminLogin.style.display diatur langsung oleh
       admin-script.js saat login berhasil/gagal/logout)
    ----------------------------------------------------- */
    function isLoginVisible(){
      return adminLogin.style.display !== 'none' &&
             adminLogin.offsetParent !== null;
    }

    /* -----------------------------------------------------
       1. Cincin kedua pada ikon perisai (radar look)
    ----------------------------------------------------- */
    document.querySelectorAll('.admin-icon').forEach(function(icon){
      if (icon.querySelector('.admin-icon-ring2')) return;
      var ring = document.createElement('span');
      ring.className = 'admin-icon-ring2';
      ring.setAttribute('aria-hidden', 'true');
      icon.appendChild(ring);
    });

    /* -----------------------------------------------------
       2. Tilt magnetik ringan pada tombol utama "Masuk"
       (hanya untuk pointer presisi/mouse, bukan sentuhan)
    ----------------------------------------------------- */
    if (!reduceMotion && window.matchMedia && window.matchMedia('(pointer:fine)').matches){
      var magneticBtn = document.getElementById('adminLoginBtn');
      if (magneticBtn){
        var raf = null;
        magneticBtn.addEventListener('mousemove', function(e){
          var r = magneticBtn.getBoundingClientRect();
          var mx = (e.clientX - r.left - r.width / 2) * 0.18;
          var my = (e.clientY - r.top - r.height / 2) * 0.28;
          if (raf) cancelAnimationFrame(raf);
          raf = requestAnimationFrame(function(){
            magneticBtn.style.setProperty('--mx', mx.toFixed(1) + 'px');
            magneticBtn.style.setProperty('--my', my.toFixed(1) + 'px');
          });
        });
        magneticBtn.addEventListener('mouseleave', function(){
          magneticBtn.style.setProperty('--mx', '0px');
          magneticBtn.style.setProperty('--my', '0px');
        });
      }
    }

    /* -----------------------------------------------------
       3. Kanvas partikel jaringan (constellation)
    ----------------------------------------------------- */
    if (reduceMotion) return; // hormati preferensi pengguna, tak perlu kanvas sama sekali
    if (navigator.connection && navigator.connection.saveData) return; // hormati mode Hemat Data

    var alGrid = adminLogin.querySelector('.alogin-grid');
    if (!alGrid) return;

    var canvas = document.createElement('canvas');
    canvas.className = 'alogin-particles';
    canvas.setAttribute('aria-hidden', 'true');
    adminLogin.insertBefore(canvas, alGrid);

    var ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    var particles = [];
    var W = 0, H = 0, DPR = 1; // DPR dipatok ke 1 (bukan devicePixelRatio asli) —
                                // di layar retina/HP modern ini memangkas jumlah
                                // piksel yang digambar tiap frame sampai 3-4x lipat,
                                // penyebab utama "patah-patah" sebelumnya.
    var running = false;
    var rafId = null;
    var lastFrame = 0;
    var FRAME_MS = 42; // ~24fps — cukup halus untuk hiasan latar, jauh lebih hemat baterai/CPU

    var COLORS = ['18,169,224', '15,216,184']; // aqua, teal (sesuai token warna brand)

    function particleCount(width){
      // Jauh lebih sedikit dari versi awal, terutama di HP.
      if (width < 480) return 9;
      if (width < 768) return 13;
      if (width < 1200) return 18;
      return 24;
    }

    function resize(){
      var rect = adminLogin.getBoundingClientRect();
      W = Math.max(rect.width, 1);
      H = Math.max(rect.height, 1);
      canvas.width = Math.floor(W * DPR);
      canvas.height = Math.floor(H * DPR);
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      seed();
    }

    function seed(){
      var count = particleCount(W);
      particles = [];
      for (var i = 0; i < count; i++){
        particles.push({
          x: Math.random() * W,
          y: Math.random() * H,
          vx: (Math.random() - 0.5) * 0.16,
          vy: (Math.random() - 0.5) * 0.16,
          r: Math.random() * 1.4 + 0.6,
          c: COLORS[i % COLORS.length]
        });
      }
    }

    var LINK_DIST = 110;
    var LINK_DIST_SQ = LINK_DIST * LINK_DIST; // bandingkan jarak kuadrat dulu,
                                               // baru hitung akar (Math.sqrt) kalau
                                               // memang perlu — jauh lebih murah
                                               // saat sebagian besar pasangan titik
                                               // sebenarnya terlalu jauh untuk ditarik garis.

    function step(ts){
      if (!running) return;
      if (ts - lastFrame < FRAME_MS){
        rafId = requestAnimationFrame(step);
        return;
      }
      lastFrame = ts;
      ctx.clearRect(0, 0, W, H);

      var i, j, p, q, dx, dy, distSq, dist, alpha;

      for (i = 0; i < particles.length; i++){
        p = particles[i];
        p.x += p.vx; p.y += p.vy;
        if (p.x < -10) p.x = W + 10; else if (p.x > W + 10) p.x = -10;
        if (p.y < -10) p.y = H + 10; else if (p.y > H + 10) p.y = -10;
      }

      // Garis penghubung antar titik yang berdekatan (hanya kalau
      // jaraknya sudah pasti dekat, dicek pakai jarak kuadrat dulu)
      for (i = 0; i < particles.length; i++){
        p = particles[i];
        for (j = i + 1; j < particles.length; j++){
          q = particles[j];
          dx = p.x - q.x; dy = p.y - q.y;
          distSq = dx * dx + dy * dy;
          if (distSq < LINK_DIST_SQ){
            dist = Math.sqrt(distSq);
            alpha = (1 - dist / LINK_DIST) * 0.18;
            ctx.strokeStyle = 'rgba(' + p.c + ',' + alpha.toFixed(3) + ')';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.stroke();
          }
        }
      }

      // Titik-titik
      for (i = 0; i < particles.length; i++){
        p = particles[i];
        ctx.beginPath();
        ctx.fillStyle = 'rgba(' + p.c + ',0.8)';
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      rafId = requestAnimationFrame(step);
    }

    function start(){
      if (running) return;
      running = true;
      lastFrame = 0;
      rafId = requestAnimationFrame(step);
    }
    function stop(){
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
    }

    function syncWithVisibility(){
      if (document.hidden || !isLoginVisible()){ stop(); }
      else { start(); }
    }

    resize();
    syncWithVisibility();

    var resizeTimer = null;
    window.addEventListener('resize', function(){
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 150);
    });

    document.addEventListener('visibilitychange', syncWithVisibility);

    // adminLogin.style.display diubah lewat JS oleh admin-script.js
    // (bukan lewat class), jadi dipantau dengan MutationObserver
    // supaya kanvas otomatis berhenti begitu dasbor tampil, dan
    // otomatis jalan lagi kalau admin logout kembali ke layar login.
    var mo = new MutationObserver(syncWithVisibility);
    mo.observe(adminLogin, { attributes: true, attributeFilter: ['style'] });
  });
})();
