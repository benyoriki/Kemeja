/* PART 03 – Coming Soon glass panel + kunci soal logika matematika.
   Ringan, tanpa library (ES5, aman untuk browser lama / Windows 7). */
(function () {
  'use strict';

  /* ===== PENGATURAN ===== */
  // Isi tanggal rilis Part 03 untuk menampilkan hitung mundur, contoh: '2026-11-01T08:00:00+07:00'
  // Biarkan kosong '' jika belum ada tanggal.
  var LAUNCH_DATE = '';
  var SHOW_DELAY = 700;           // jeda (ms) setelah loading screen selesai

  var panel = document.getElementById('p3Glass');
  var pill = document.getElementById('p3Pill');
  var quiz = document.getElementById('p3Quiz');
  var form = document.getElementById('p3Form');
  var qText = document.getElementById('p3QText');
  var qType = document.getElementById('p3QType');
  var qInput = document.getElementById('p3QInput');
  var qMsg = document.getElementById('p3QMsg');
  var qHint = document.getElementById('p3QHint');
  if (!panel || !pill || !quiz || !form) return;

  /* ---------- GENERATOR SOAL: logika matematika komputer (acak tiap muat ulang & tiap salah) ---------- */
  function r(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
  function pick(arr) { return arr[r(0, arr.length - 1)]; }
  function bin(n, len) { var s = n.toString(2); while (s.length < len) s = '0' + s; return s; }
  function code(lines) { return '<span class="p3-qcode">' + lines.join('\n') + '</span>'; }
  var lastKind = -1, answer = '0';

  /* tiap generator mengisi `answer` (teks) dan mengembalikan [judul, soal, petunjuk, jenis papan ketik] */
  var kinds = [
    function () { // biner -> desimal
      var n = r(73, 255); answer = String(n);
      return ['Biner ke Desimal', 'Ubah bilangan biner <b>' + bin(n, 8) + '</b><sub>2</sub> menjadi desimal.', 'Jawab dalam angka desimal.', 'numeric'];
    },
    function () { // desimal -> biner
      var n = r(37, 255); answer = bin(n, 0);
      return ['Desimal ke Biner', 'Ubah bilangan desimal <b>' + n + '</b> menjadi biner.', 'Jawab hanya dengan angka 0 dan 1.', 'numeric'];
    },
    function () { // heksa -> desimal
      var n = r(40, 255); answer = String(n);
      return ['Heksa ke Desimal', 'Ubah bilangan heksadesimal <b>' + n.toString(16).toUpperCase() + '</b><sub>16</sub> menjadi desimal.', 'Jawab dalam angka desimal. (A=10 ... F=15)', 'numeric'];
    },
    function () { // desimal -> heksa
      var n = r(60, 255); answer = n.toString(16).toUpperCase();
      return ['Desimal ke Heksa', 'Ubah bilangan desimal <b>' + n + '</b> menjadi heksadesimal.', 'Jawab dengan angka 0-9 dan huruf A-F.', 'text'];
    },
    function () { // operasi bit bertingkat
      var a = r(20, 255), b = r(20, 255), c = r(20, 255), t = r(0, 2), txt;
      if (t === 0) { answer = String((a ^ b) & c); txt = '(' + a + ' XOR ' + b + ') AND ' + c; }
      else if (t === 1) { answer = String((a | b) ^ c); txt = '(' + a + ' OR ' + b + ') XOR ' + c; }
      else { answer = String((a & b) | c); txt = '(' + a + ' AND ' + b + ') OR ' + c; }
      return ['Operasi Bit', 'Hitung bit demi bit: <b>' + txt + '</b>', 'Ubah ke biner dulu. Jawab dalam desimal.', 'numeric'];
    },
    function () { // geser bit
      var x = r(5, 31), n = r(2, 4), m = r(1, 3);
      answer = String(((x << n) >> m) + x);
      return ['Geser Bit', 'Jika x = ' + x + ', berapa nilai <b>((x &lt;&lt; ' + n + ') &gt;&gt; ' + m + ') + x</b> ?', '&lt;&lt; geser kiri = kali 2, &gt;&gt; geser kanan = bagi 2 (dibulatkan ke bawah).', 'numeric'];
    },
    function () { // modulo bertingkat
      var a = r(12, 40), b = r(7, 19), c = r(3, 50), m = r(7, 13);
      answer = String((a * b + c) % m);
      return ['Aritmetika Modulo', 'Berapa sisa dari <b>(' + a + ' &times; ' + b + ' + ' + c + ') mod ' + m + '</b> ?', 'mod = sisa bagi.', 'numeric'];
    },
    function () { // telusur perulangan
      var n = r(18, 45), k = r(3, 7), s = 0, i;
      for (i = 1; i <= n; i++) { if (i % k === 0) s += i; }
      answer = String(s);
      return ['Telusur Program', 'Berapa nilai <b>s</b> di akhir?' + code(['s = 0', 'for i = 1 to ' + n, '  if i mod ' + k + ' = 0 then s = s + i']), 'Jawab dalam desimal.', 'numeric'];
    },
    function () { // tukar variabel tanpa temp
      var a = r(5, 40), b = r(41, 95);
      answer = String(b - a);
      return ['Telusur Program', 'Berapa nilai <b>x &minus; y</b> di akhir?' + code(['x = ' + a, 'y = ' + b, 'x = x + y', 'y = x - y', 'x = x - y']), 'Telusuri baris demi baris.', 'numeric'];
    },
    function () { // rekursi
      var a = r(1, 4), b = r(1, 5), k = r(1, 3), f = [a, b], i;
      for (i = 2; i <= 7; i++) f[i] = f[i - 1] + k * f[i - 2];
      answer = String(f[7]);
      return ['Rekursi', 'Diketahui <b>f(0) = ' + a + '</b>, <b>f(1) = ' + b + '</b>, dan <b>f(n) = f(n&minus;1) + ' + (k > 1 ? k + ' &times; ' : '') + 'f(n&minus;2)</b>. Berapa <b>f(7)</b> ?', 'Hitung berurutan dari f(2).', 'numeric'];
    },
    function () { // subnet
      var p = r(22, 28);
      answer = String(Math.pow(2, 32 - p) - 2);
      return ['Jaringan Komputer', 'Sebuah subnet IPv4 berprefix <b>/' + p + '</b>. Berapa jumlah alamat host yang bisa dipakai?', 'Alamat network dan broadcast tidak bisa dipakai.', 'numeric'];
    },
    function () { // tabel kebenaran
      var ex = pick([
        ['(A AND B) OR NOT C', function (A, B, C) { return (A && B) || !C; }],
        ['(A OR B) AND (NOT A OR C)', function (A, B, C) { return (A || B) && (!A || C); }],
        ['A XOR B XOR C', function (A, B, C) { return (A !== B) !== C; }],
        ['NOT (A AND B) AND (B OR C)', function (A, B, C) { return !(A && B) && (B || C); }],
        ['(A AND NOT B) OR (B AND C)', function (A, B, C) { return (A && !B) || (B && C); }]
      ]), cnt = 0, i;
      for (i = 0; i < 8; i++) { if (ex[1]((i & 4) > 0, (i & 2) > 0, (i & 1) > 0)) cnt++; }
      answer = String(cnt);
      return ['Logika Boolean', 'Ada 8 kombinasi nilai (A, B, C). Berapa kombinasi yang membuat <b>' + ex[0] + '</b> bernilai TRUE?', 'Jawab dalam desimal (0 sampai 8).', 'numeric'];
    },
    function () { // two's complement
      var n = r(129, 253);
      answer = String(n - 256);
      return ['Two’s Complement', 'Bilangan 8-bit bertanda (two’s complement): <b>' + bin(n, 8) + '</b>. Berapa nilai desimalnya?', 'Jawab desimal. Bit paling kiri = 1 berarti negatif (pakai tanda &minus;).', 'text'];
    },
    function () { // hitung bit 1
      var n = r(150, 1023), c = 0, t = n;
      while (t) { c += t & 1; t >>= 1; }
      answer = String(c);
      return ['Hitung Bit', 'Ubah <b>' + n + '</b> ke biner. Berapa banyak angka <b>1</b> di dalamnya?', 'Jawab dalam desimal.', 'numeric'];
    },
    function () { // FPB
      var g = r(3, 12), pr = pick([[5, 7], [7, 9], [8, 11], [9, 10], [11, 13], [4, 15], [6, 11], [13, 8]]);
      answer = String(g);
      return ['Algoritma Euclid', 'Berapa FPB (GCD) dari <b>' + (g * pr[0]) + '</b> dan <b>' + (g * pr[1]) + '</b> ?', 'Gunakan algoritma Euclid.', 'numeric'];
    },
    function () { // array
      var A = [], s = 0, i;
      for (i = 0; i < 5; i++) { A[i] = r(1, 9); s += A[i] * i; }
      answer = String(s);
      return ['Telusur Array', 'Berapa nilai <b>s</b> di akhir? (indeks array mulai dari 0)' + code(['A = [' + A.join(', ') + ']', 's = 0', 'for i = 0 to 4', '  s = s + A[i] * i']), 'Jawab dalam desimal.', 'numeric'];
    },
    function () { // satuan data
      var n = r(2, 9);
      answer = String(n * 1024 * 8);
      return ['Satuan Data', 'Sebuah berkas berukuran <b>' + n + ' KB</b>. Berapa jumlah <b>bit</b>nya?', '1 KB = 1024 byte, 1 byte = 8 bit.', 'numeric'];
    },
    function () { // overflow register
      var a = r(170, 250), b = r(100, 200);
      answer = String((a + b) % 256);
      return ['Overflow Register', 'Register 8-bit tak bertanda berisi <b>' + a + '</b>, lalu ditambah <b>' + b + '</b>. Berapa isi register setelah penjumlahan (overflow terjadi)?', 'Register 8-bit hanya menampung 0 sampai 255.', 'numeric'];
    },
    function () { // loop bersarang
      var A = r(6, 12), B = r(6, 12), K = r(3, 5), cnt = 0, i, j;
      for (i = 1; i <= A; i++) { for (j = 1; j <= B; j++) { if ((i + j) % K === 0) cnt++; } }
      answer = String(cnt);
      return ['Perulangan Bersarang', 'Berapa nilai <b>c</b> di akhir?' + code(['c = 0', 'for i = 1 to ' + A, '  for j = 1 to ' + B, '    if (i + j) mod ' + K + ' = 0 then c = c + 1']), 'Jawab dalam desimal.', 'numeric'];
    }
  ];

  function norm(s) {
    s = String(s).replace(/\s+/g, '').toUpperCase().replace(/^(0X|0B)/, '').replace(',', '.');
    if (/^-?[0-9]+$/.test(s)) { var neg = s.charAt(0) === '-'; s = s.replace(/^-/, '').replace(/^0+(?=[0-9])/, ''); s = (neg && s !== '0' ? '-' : '') + s; }
    else if (/^[0-9A-F]+$/.test(s)) { s = s.replace(/^0+(?=.)/, ''); }
    return s;
  }

  function newQuestion() {
    var k;
    do { k = r(0, kinds.length - 1); } while (k === lastKind);
    lastKind = k;
    var q = kinds[k]();
    qType.innerHTML = q[0];
    qText.innerHTML = q[1];
    qHint.innerHTML = q[2];
    qInput.setAttribute('inputmode', q[3]);
    qInput.value = '';
  }

  /* ---------- POLLING MINAT + JUMLAH PENGUNJUNG (Firestore: part3_stats/summary) ---------- */
  var pollBox = document.getElementById('p3Poll');
  var elViews = document.getElementById('p3Views');
  var elTotal = document.getElementById('p3Total');
  var pMsg = document.getElementById('p3PMsg');
  var STAT_COL = 'part3_stats', STAT_DOC = 'summary';
  var myVote = '', jaketCounted = false, viewCounted = false, subscribed = false, lastData = null;
  try { myVote = localStorage.getItem('p3Vote') || ''; viewCounted = localStorage.getItem('p3Viewed') === '1'; jaketCounted = localStorage.getItem('p3JaketSeen') === '1'; } catch (e) {}

  function fmt(n) { n = Number(n) || 0; try { return n.toLocaleString('id-ID'); } catch (e) { return String(n); } }
  function render(d) {
    lastData = d;
    document.getElementById('p3JView').innerHTML = fmt(d.jaket);
    document.getElementById('p3GCount').innerHTML = fmt(d.jaket);
    var y = Math.max(0, Number(d.yes) || 0), n = Math.max(0, Number(d.no) || 0), t = y + n;
    var py = t ? Math.round(y * 100 / t) : 0, pn = t ? 100 - py : 0;
    elViews.innerHTML = fmt(d.views);
    elTotal.innerHTML = fmt(t);
    document.getElementById('p3PctYes').innerHTML = py + '%';
    document.getElementById('p3PctNo').innerHTML = pn + '%';
    document.getElementById('p3BarYes').style.width = py + '%';
    document.getElementById('p3BarNo').style.width = pn + '%';
  }
  function paintVote() {
    var yb = document.getElementById('p3Yes'), nb = document.getElementById('p3No');
    yb.className = 'p3-pbtn p3-yes' + (myVote === 'yes' ? ' p3-sel' : '');
    nb.className = 'p3-pbtn p3-no' + (myVote === 'no' ? ' p3-sel' : '');
    pollBox.className = 'p3-poll' + (myVote ? ' p3-voted' : '');
    if (myVote === 'yes') pMsg.innerHTML = 'Terima kasih! Dukungan Anda menjadi semangat kami untuk menghadirkan yang terbaik.';
    else if (myVote === 'no') pMsg.innerHTML = 'Terima kasih atas kejujuran Anda. Masukan ini membantu kami terus berbenah. Anda boleh mengubah pilihan kapan saja.';
  }
  function fb() { var f = window.__lokonFirebase; return (f && f.db && f.doc && f.setDoc && f.increment) ? f : null; }

  function connect() {
    var f = fb();
    if (!f) return;
    var ref = f.doc(f.db, STAT_COL, STAT_DOC);
    if (!viewCounted) {
      viewCounted = true;
      try { localStorage.setItem('p3Viewed', '1'); } catch (e) {}
      f.setDoc(ref, { views: f.increment(1) }, { merge: true }).catch(function () {
        viewCounted = false; try { localStorage.removeItem('p3Viewed'); } catch (e) {}
      });
    }
    if (!subscribed) {
      subscribed = true;
      f.onSnapshot(ref, function (snap) {
        var d = snap.exists() ? snap.data() : {};
        render({ views: d.views || 0, yes: d.yes || 0, no: d.no || 0, jaket: d.jaket || 0 });
      }, function () { subscribed = false; });
    }
  }
  window.addEventListener('lokon-firebase-ready', connect);
  connect();

  function vote(v) {
    if (v === myVote) return;
    var prev = myVote, f = fb();
    myVote = v;
    try { localStorage.setItem('p3Vote', v); } catch (e) {}
    paintVote();
    if (!f) { pMsg.innerHTML += ' (Koneksi belum tersambung, suara belum terhitung.)'; return; }
    var upd = {};
    upd[v] = f.increment(1);
    if (prev) upd[prev] = f.increment(-1);
    f.setDoc(f.doc(f.db, STAT_COL, STAT_DOC), upd, { merge: true }).catch(function () {
      myVote = prev; try { if (prev) localStorage.setItem('p3Vote', prev); else localStorage.removeItem('p3Vote'); } catch (e) {}
      paintVote();
      pMsg.innerHTML = 'Maaf, suara belum dapat dikirim. Silakan coba lagi sebentar lagi.';
      pollBox.className = 'p3-poll' + (myVote ? ' p3-voted' : '');
    });
  }
  document.getElementById('p3Yes').onclick = function () { vote('yes'); };
  document.getElementById('p3No').onclick = function () { vote('no'); };
  paintVote();

  /* ---------- PENAMPIL MODEL JAKET (dihitung sekali per perangkat) ---------- */
  var gallery = document.getElementById('p3Gallery');
  function openGallery() {
    gallery.className = 'p3-gopen';
    gallery.setAttribute('aria-hidden', 'false');
    var f = fb();
    if (!jaketCounted && f) {
      jaketCounted = true;
      try { localStorage.setItem('p3JaketSeen', '1'); } catch (e) {}
      f.setDoc(f.doc(f.db, STAT_COL, STAT_DOC), { jaket: f.increment(1) }, { merge: true }).catch(function () {
        jaketCounted = false; try { localStorage.removeItem('p3JaketSeen'); } catch (e) {}
      });
    }
  }
  function closeGallery() { gallery.className = ''; gallery.setAttribute('aria-hidden', 'true'); }
  document.getElementById('p3Jaket').onclick = openGallery;
  document.getElementById('p3GClose').onclick = closeGallery;
  document.addEventListener('keydown', function (e) {
    if ((e.key === 'Escape' || e.keyCode === 27) && gallery.className.indexOf('p3-gopen') > -1) {
      closeGallery(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    }
  });

  /* ---------- BUKA / TUTUP ---------- */
  function openPanel() {
    panel.setAttribute('aria-hidden', 'false');
    panel.className = 'p3-open';
    pill.className = '';
  }
  function closePanel() {
    quiz.className = 'p3-quiz';
    panel.setAttribute('aria-hidden', 'true');
    panel.className = '';
    pill.className = 'p3-show';
  }
  function showQuiz() {
    if (quiz.className.indexOf('p3-qon') > -1) return;
    newQuestion();
    qMsg.innerHTML = 'Jawab dengan benar agar layar tertutup.';
    qMsg.className = 'p3-qmsg';
    quiz.className = 'p3-quiz p3-qon';
    try { qInput.focus(); } catch (e) {}
  }
  function hideQuiz() { quiz.className = 'p3-quiz'; }

  panel.querySelector('.p3-close').onclick = showQuiz;
    document.getElementById('p3QCancel').onclick = hideQuiz;
  pill.onclick = openPanel;

  form.onsubmit = function (e) {
    if (e && e.preventDefault) e.preventDefault();
    var raw = norm(qInput.value);
    if (raw !== '' && raw === norm(answer)) { closePanel(); return false; }
    // salah: ganti soal otomatis
    newQuestion();
    qMsg.innerHTML = raw === '' ? 'Isi jawabannya dulu ya. Soal diganti.' : 'Jawaban salah. Soal diganti otomatis, coba lagi!';
    qMsg.className = 'p3-qmsg p3-bad';
    form.className = 'p3-qcard';
    void form.offsetWidth;                // restart animasi getar
    form.className = 'p3-qcard p3-shake';
    try { qInput.focus(); } catch (e2) {}
    return false;
  };

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' || e.keyCode === 27) {
      if (quiz.className.indexOf('p3-qon') > -1) hideQuiz();
      else if (panel.className.indexOf('p3-open') > -1) showQuiz();
    }
  });

  /* tunggu loading screen website utama selesai, baru tampil (tiap muat ulang) */
  var waited = 0;
  function whenReady() {
    var ls = document.getElementById('loading-screen');
    var loaderDone = !ls || /(^|\s)hide(\s|$)/.test(ls.className) || waited > 12000;
    if (!loaderDone) { waited += 300; return setTimeout(whenReady, 300); }
    var keep = false;
    try { keep = sessionStorage.getItem('p3Keep') === '1'; sessionStorage.removeItem('p3Keep'); } catch (e) {}
    setTimeout(function () { if (keep) { pill.className = 'p3-show'; } else { openPanel(); } }, SHOW_DELAY);
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
