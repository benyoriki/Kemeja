const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

const dom = new JSDOM(html, {
  url: 'https://benyoriki.github.io/Kemeja/admin/',
  runScripts: 'dangerously',
  resources: 'usable',
  pretendToBeVisual: true,
  beforeParse(window) {
    window.console.log = (...a) => process.stdout.write('[console.log] ' + a.map(String).join(' ') + '\n');
    window.console.error = (...a) => process.stdout.write('[console.error] ' + a.map(String).join(' ') + '\n');
    window.onerror = (msg, src, line, col, err) => {
      process.stdout.write('[window.onerror] ' + msg + ' @' + line + ':' + col + '\n' + (err && err.stack || '') + '\n');
    };
  }
});

dom.window.addEventListener('load', () => {
  setTimeout(() => {
    const btn = dom.window.document.getElementById('formPendaftaranBtn');
    console.log('BUTTON FOUND:', !!btn);
    const overlay = dom.window.document.getElementById('formPendaftaranOverlay');
    console.log('OVERLAY FOUND:', !!overlay);
    if (btn) {
      btn.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
      console.log('AFTER CLICK, overlay has active class:', overlay ? overlay.classList.contains('active') : 'N/A');
    }
    process.exit(0);
  }, 1500);
});
