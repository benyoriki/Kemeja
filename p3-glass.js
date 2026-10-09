/* PART 03 – Coming Soon glass panel. Ringan, tanpa library (ES5, aman untuk browser lama). */
(function () {
  'use strict';

  /* ===== PENGATURAN ===== */
  // Isi tanggal rilis Part 03 untuk menampilkan hitung mundur, contoh: '2026-11-01T08:00:00+07:00'
  // Biarkan kosong '' jika belum ada tanggal (hitung mundur tidak tampil).
  var LAUNCH_DATE = '';
  var SHOW_DELAY = 700;           // jeda (ms) setelah loading screen selesai
  var STORE_KEY = 'p3GlassClosed';

  var panel = document.getElementById('p3Glass');
  var pill = document.getElementById('p3Pill');
  if (!panel || !pill) return;

  function store(get, val) {
    try {
      if (get) return window.sessionStorage.getItem(STORE_KEY);
      window.sessionStorage.setItem(STORE_KEY, val);
    } catch (e) {}
    return null;
  }

  function openPanel() {
    panel.setAttribute('aria-hidden', 'false');
    panel.className = 'p3-open';
    pill.className = '';
    store(false, '0');
  }
  function closePanel() {
    panel.setAttribute('aria-hidden', 'true');
    panel.className = '';
    pill.className = 'p3-show';
    store(false, '1');
  }

  panel.querySelector('.p3-close').onclick = closePanel;
  panel.querySelector('.p3-ok').onclick = closePanel;
  pill.onclick = openPanel;
  document.addEventListener('keydown', function (e) {
    if ((e.key === 'Escape' || e.keyCode === 27) && panel.className.indexOf('p3-open') > -1) closePanel();
  });

  /* tunggu loading screen website utama selesai, baru tampil */
  var waited = 0;
  function whenReady() {
    var ls = document.getElementById('loading-screen');
    var loaderDone = !ls || /(^|\s)hide(\s|$)/.test(ls.className) || waited > 12000;
    if (!loaderDone) { waited += 300; return setTimeout(whenReady, 300); }
    setTimeout(function () {
      if (store(true) === '1') { pill.className = 'p3-show'; } else { openPanel(); }
    }, SHOW_DELAY);
  }
  whenReady();

  /* hitung mundur opsional */
  var target = LAUNCH_DATE ? new Date(LAUNCH_DATE).getTime() : NaN;
  if (!isNaN(target)) {
    var box = document.getElementById('p3Count');
    var els = box.getElementsByTagName('strong');
    var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    var tick = function () {
      var d = Math.max(0, target - new Date().getTime()) / 1000;
      els[0].innerHTML = pad(Math.floor(d / 86400));
      els[1].innerHTML = pad(Math.floor(d % 86400 / 3600));
      els[2].innerHTML = pad(Math.floor(d % 3600 / 60));
      els[3].innerHTML = pad(Math.floor(d % 60));
    };
    box.className += ' p3-on';
    tick();
    setInterval(tick, 1000);
  }
})();
