/* Tombol "Animasi: OFF/ON". Ringan, ES5. */
(function () {
  'use strict';
  var lite = !!window.__LP_LITE;
  var b = document.createElement('button');
  b.type = 'button';
  b.id = 'lpToggle';
  b.className = lite ? '' : 'lp-on';
  b.innerHTML = '<i></i>Animasi: ' + (lite ? 'OFF' : 'ON');
  b.title = lite ? 'Klik untuk menyalakan animasi (butuh perangkat yang kuat)' : 'Klik untuk mematikan animasi (website lebih ringan)';
  b.onclick = function () {
    try { localStorage.setItem('lpAnim', lite ? 'on' : 'off'); } catch (e) {}
    try {
      var p = document.getElementById('p3Glass');
      if (p && p.className.indexOf('p3-open') < 0) sessionStorage.setItem('p3Keep', '1');   // layar kedua sudah ditutup: jangan muncul lagi
    } catch (e2) {}
    location.reload();
  };
  document.body.appendChild(b);
})();
