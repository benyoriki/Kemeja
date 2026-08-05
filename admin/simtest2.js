const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

let html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

// Strip external CDN scripts (jspdf) which we can't load, and the CSS link (irrelevant for click logic)
html = html.replace(/<script src="https:\/\/cdnjs[^>]*><\/script>/g, '');
// Replace external admin-script.js / admin-login-fx.js src with inline content
const adminScript = fs.readFileSync(path.join(__dirname, 'admin-script.js'), 'utf8');
const loginFx = fs.readFileSync(path.join(__dirname, 'admin-login-fx.js'), 'utf8');
html = html.replace(/<script src="admin-script\.js\?v=\d+"><\/script>/, `<script>\n${adminScript}\n</script>`);
html = html.replace(/<script src="admin-login-fx\.js\?v=\d+" defer><\/script>/, `<script>\n${loginFx}\n</script>`);
html = html.replace(/<link[^>]*fonts\.googleapis[^>]*>/, '');
html = html.replace(/<link[^>]*admin-style\.css[^>]*>/, '');

const dom = new JSDOM(html, {
  url: 'https://benyoriki.github.io/Kemeja/admin/',
  runScripts: 'dangerously',
  resources: 'usable',
  pretendToBeVisual: true,
  beforeParse(window) {
    window.console.log = (...a) => process.stdout.write('[log] ' + a.map(String).join(' ') + '\n');
    window.console.error = (...a) => process.stdout.write('[error] ' + a.map(String).join(' ') + '\n');
    window.console.warn = (...a) => process.stdout.write('[warn] ' + a.map(String).join(' ') + '\n');
    window.onerror = (msg, src, line, col, err) => {
      process.stdout.write('[window.onerror] ' + msg + ' @' + line + ':' + col + '\n' + (err && err.stack || '') + '\n');
    };
    window.addEventListener('unhandledrejection', (e) => {
      process.stdout.write('[unhandledrejection] ' + (e.reason && e.reason.stack || e.reason) + '\n');
    });
  }
});

dom.window.addEventListener('DOMContentLoaded', () => {
  process.stdout.write('DOMContentLoaded fired\n');
});

setTimeout(() => {
  const doc = dom.window.document;
  const btn = doc.getElementById('formPendaftaranBtn');
  console.log('BUTTON FOUND:', !!btn);
  const overlay = doc.getElementById('formPendaftaranOverlay');
  console.log('OVERLAY FOUND:', !!overlay);
  if (btn) {
    btn.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
  }
  console.log('AFTER CLICK, overlay has active class:', overlay ? overlay.classList.contains('active') : 'N/A');
  process.exit(0);
}, 1500);
