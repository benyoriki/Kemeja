/* =========================================================
   LOKON CHESS ARENA — PAPAN 2D SUPER RINGAN
   ---------------------------------------------------------
   Cadangan otomatis bila WebGL tidak tersedia / GPU hanya software
   (umum di Windows 7 + driver lama), atau dipilih manual di Pengaturan
   ("Mode Super Ringan"). API-nya sama dengan Chess3DScene sehingga
   script.js tidak perlu tahu bedanya. Tanpa library, tanpa canvas:
   hanya 64 <div> + bidak <div> yang digeser dengan CSS transform.
========================================================= */
const FILES = 'abcdefgh';
const GLYPH = { k: '\u265A\uFE0E', q: '\u265B\uFE0E', r: '\u265C\uFE0E', b: '\u265D\uFE0E', n: '\u265E\uFE0E', p: '\u265F\uFE0E' };

const THEMES = {
  neon:   { lt: '#7d97c8', dk: '#131b31', wp: '#f3efe6', bp: '#7a5df0', fr: '#232c46' },
  kayu:   { lt: '#e3c08d', dk: '#8a5a32', wp: '#f6efe0', bp: '#3b2a22', fr: '#4a3220' },
  es:     { lt: '#e9f4ff', dk: '#6f9fd0', wp: '#ffffff', bp: '#1e3a6e', fr: '#2a4b78' },
  zamrud: { lt: '#cfe8d5', dk: '#2f7a5a', wp: '#f7f3e8', bp: '#22313a', fr: '#174232' }
};

export class Chess2DScene {
  constructor(container, opts = {}){
    this.container = container;
    this.onSquareClick = opts.onSquareClick || (() => {});
    this.orientation = 'w';
    this.isLite = true;
    this.is2D = true;
    this.defaults = { bloom: false, shadows: false };
    this.cells = new Map();
    this.pieces = new Map();
    this._scale = 1;
    this._theme = 'neon';
  }

  async init(){
    const c = this.container;
    c.innerHTML = '';
    c.classList.add('b2d-host');

    const board = document.createElement('div');
    board.className = 'b2d-board';
    this.board = board;

    for (let f = 0; f < 8; f++){
      for (let r = 1; r <= 8; r++){
        const sq = FILES[f] + r;
        const cell = document.createElement('div');
        cell.className = 'b2d-cell ' + (((f + r) % 2 === 0) ? 'lt' : 'dk');
        cell.setAttribute('data-sq', sq);
        const fl = document.createElement('i'); fl.className = 'b2d-f'; fl.textContent = FILES[f];
        const rk = document.createElement('i'); rk.className = 'b2d-r'; rk.textContent = String(r);
        cell.appendChild(fl); cell.appendChild(rk);
        board.appendChild(cell);
        this.cells.set(sq, cell);
      }
    }
    const layer = document.createElement('div');
    layer.className = 'b2d-pieces';
    board.appendChild(layer);
    this.layer = layer;
    c.appendChild(board);

    this._onClick = (e) => {
      const cell = e.target.closest ? e.target.closest('.b2d-cell') : null;
      if (cell) this.onSquareClick(cell.getAttribute('data-sq'));
    };
    board.addEventListener('click', this._onClick);

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    this.setTheme(this._theme);
    this._layoutCells();
    this.resize();
  }

  /* ---------- tata letak ---------- */
  _rc(square){
    const f = FILES.indexOf(square[0]);
    const r = parseInt(square[1], 10);
    return this.orientation === 'w' ? { col: f, row: 8 - r } : { col: 7 - f, row: r - 1 };
  }

  _layoutCells(){
    this.cells.forEach((cell, sq) => {
      const { col, row } = this._rc(sq);
      cell.style.gridColumn = String(col + 1);
      cell.style.gridRow = String(row + 1);
      cell.firstChild.style.display = row === 7 ? 'block' : 'none';
      cell.lastChild.style.display = col === 0 ? 'block' : 'none';
    });
    this.pieces.forEach((el, sq) => this._place(el, sq));
  }

  _place(el, sq){
    const { col, row } = this._rc(sq);
    el.style.transform = 'translate(' + (col * 100) + '%,' + (row * 100) + '%)';
  }

  resize(){
    if (!this.board) return;
    const w = this.container.clientWidth, h = this.container.clientHeight;
    const mobile = w <= 900;
    const padT = mobile ? 150 : 80, padB = mobile ? 190 : 100, padX = mobile ? 8 : 340;
    const size = Math.max(160, Math.floor(Math.min(w - padX * 2, h - padT - padB)));
    const b = this.board.style;
    b.width = b.height = size + 'px';
    b.left = Math.round((w - size) / 2) + 'px';
    b.top = Math.round(padT + (h - padT - padB - size) / 2) + 'px';
    b.fontSize = Math.floor(size / 8 * 0.8) + 'px';
    b.transform = 'scale(' + this._scale + ')';
  }

  /* ---------- API yang sama dengan Chess3DScene ---------- */
  setBloom(){}
  setShadows(){}

  setTheme(name){
    const t = THEMES[name] || THEMES.neon;
    this._theme = THEMES[name] ? name : 'neon';
    if (!this.board) return;
    const s = this.board.style;
    s.setProperty('--lt', t.lt); s.setProperty('--dk', t.dk);
    s.setProperty('--wp', t.wp); s.setProperty('--bp', t.bp); s.setProperty('--fr', t.fr);
  }

  setOrientation(color){
    this.orientation = color;
    this._layoutCells();
  }

  zoomBy(f){ this._scale = Math.min(1.3, Math.max(0.6, this._scale * f)); this.resize(); }
  zoomIn(){ this.zoomBy(1.12); }
  zoomOut(){ this.zoomBy(0.89); }
  resetCamera(){ this._scale = 1; this.resize(); }

  _makePiece(type, color){
    const el = document.createElement('div');
    el.className = 'b2d-p ' + (color === 'w' ? 'wp' : 'bp');
    const g = document.createElement('span');
    g.textContent = GLYPH[type];
    el.appendChild(g);
    el.setAttribute('data-t', type);
    return el;
  }

  setPosition(boardArray){
    this.layer.innerHTML = '';
    this.pieces.clear();
    for (let r = 0; r < 8; r++){
      for (let f = 0; f < 8; f++){
        const cell = boardArray[r][f];
        if (!cell) continue;
        const sq = FILES[f] + (8 - r);
        const el = this._makePiece(cell.type, cell.color);
        this._place(el, sq);
        this.layer.appendChild(el);
        this.pieces.set(sq, el);
      }
    }
  }

  _clearCls(cls){
    this.cells.forEach((c) => c.classList.remove(cls));
  }
  clearHighlights(){ ['sel', 'legal', 'cap', 'last'].forEach((k) => this._clearCls(k)); }
  highlightSelected(sq){ this.clearHighlights(); if (sq && this.cells.get(sq)) this.cells.get(sq).classList.add('sel'); }
  showLegalMoves(moves){
    moves.forEach((m) => { const c = this.cells.get(m.to); if (c) c.classList.add(m.captured ? 'cap' : 'legal'); });
  }
  showLastMove(from, to){
    [from, to].forEach((sq) => { const c = this.cells.get(sq); if (c) c.classList.add('last'); });
  }
  showCheck(sq){ this.clearCheck(); const c = this.cells.get(sq); if (c) c.classList.add('chk'); }
  clearCheck(){ this._clearCls('chk'); }

  animateMove({ from, to, captured, promotion, color }){
    const moving = this.pieces.get(from);
    if (!moving) return Promise.resolve();
    const victim = this.pieces.get(to);
    if (victim && captured){
      victim.classList.add('b2d-out');
      setTimeout(() => { if (victim.parentNode) victim.parentNode.removeChild(victim); }, 260);
      this.pieces.delete(to);
    }
    this._place(moving, to);
    this.pieces.delete(from);
    this.pieces.set(to, moving);
    return new Promise((resolve) => {
      setTimeout(() => {
        if (promotion){
          const np = this._makePiece(promotion, color);
          this._place(np, to);
          if (moving.parentNode) moving.parentNode.removeChild(moving);
          this.layer.appendChild(np);
          this.pieces.set(to, np);
        }
        resolve();
      }, 240);
    });
  }

  celebrateVictory(){
    const host = this.container;
    const wrap = document.createElement('div');
    wrap.className = 'b2d-confetti';
    const colors = ['#17e6e6', '#9b5cff', '#F2C14E', '#ff4d5e'];
    for (let i = 0; i < 28; i++){
      const d = document.createElement('i');
      d.style.left = (Math.random() * 100) + '%';
      d.style.background = colors[i % colors.length];
      d.style.animationDelay = (Math.random() * 0.8) + 's';
      d.style.animationDuration = (1.8 + Math.random() * 1.4) + 's';
      wrap.appendChild(d);
    }
    host.appendChild(wrap);
    setTimeout(() => { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }, 4000);
  }

  dispose(){
    window.removeEventListener('resize', this._onResize);
    if (this.board) this.board.removeEventListener('click', this._onClick);
    this.container.innerHTML = '';
    this.container.classList.remove('b2d-host');
  }
}
