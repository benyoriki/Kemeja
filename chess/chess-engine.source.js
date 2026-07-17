/* =========================================================
   CHESS-ENGINE.JS
   -------------------------------------------------
   Membungkus dua hal:
   1) Aturan main catur (chess.js, dimuat dari CDN) — validasi
      langkah, skak, skakmat, remis, promosi, dst.
   2) Lawan komputer (Stockfish via Web Worker CDN). Jika CDN
      gagal dimuat (offline / diblokir jaringan), engine
      otomatis jatuh ke AI cadangan bawaan (heuristik materi +
      sedikit acak sesuai level) supaya "Lawan Komputer" TETAP
      bisa dimainkan tanpa internet ke pihak ketiga.
========================================================= */

let ChessCtor = null;

/** Memuat chess.js dari CDN (format ESM). Dipanggil sekali di awal. */
export async function loadChessRules(){
  if (ChessCtor) return ChessCtor;
  try {
    const mod = await import('https://cdn.jsdelivr.net/npm/chess.js@1.0.0-beta.8/+esm');
    ChessCtor = mod.Chess;
  } catch (err){
    console.error('[chess-engine] Gagal memuat chess.js dari CDN:', err);
    throw new Error('Tidak bisa memuat aturan catur (chess.js). Periksa koneksi internet.');
  }
  return ChessCtor;
}

/**
 * ChessMatch — pembungkus satu papan/permainan berjalan.
 * Semua logika aturan (legal move, skak, mat, remis, promosi)
 * didelegasikan ke chess.js supaya tidak ada aturan yang salah.
 */
export class ChessMatch {
  constructor(fen){
    if (!ChessCtor) throw new Error('Panggil loadChessRules() dahulu sebelum membuat ChessMatch.');
    this.chess = fen ? new ChessCtor(fen) : new ChessCtor();
  }

  get fen(){ return this.chess.fen(); }
  get turn(){ return this.chess.turn(); } // 'w' | 'b'
  get pgn(){ return this.chess.pgn(); }
  get history(){ return this.chess.history({ verbose: true }); }

  legalMovesFrom(square){
    try { return this.chess.moves({ square, verbose: true }); }
    catch { return []; }
  }

  /** @returns {object|null} detail langkah (SAN, capture, dll) atau null bila ilegal */
  move(from, to, promotion){
    try {
      const result = this.chess.move({ from, to, promotion: promotion || 'q' });
      return result || null;
    } catch {
      return null;
    }
  }

  undo(){ return this.chess.undo(); }

  isCheck(){ return this.chess.isCheck ? this.chess.isCheck() : this.chess.in_check(); }
  isCheckmate(){ return this.chess.isCheckmate ? this.chess.isCheckmate() : this.chess.in_checkmate(); }
  isStalemate(){ return this.chess.isStalemate ? this.chess.isStalemate() : this.chess.in_stalemate(); }
  isDraw(){ return this.chess.isDraw ? this.chess.isDraw() : this.chess.in_draw(); }
  isGameOver(){ return this.chess.isGameOver ? this.chess.isGameOver() : this.chess.game_over(); }

  /** Ambil semua bidak yang tertangkap sejauh ini, dipisah per warna korban. */
  capturedPieces(){
    const captured = { w: [], b: [] };
    this.history.forEach(m => {
      if (m.captured){
        const victimColor = m.color === 'w' ? 'b' : 'w';
        captured[victimColor].push(m.captured);
      }
    });
    return captured;
  }

  board(){ return this.chess.board(); }
}

/* =========================================================
   LAWAN KOMPUTER
========================================================= */

const STOCKFISH_URLS = {
  wasm: 'https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.wasm.js',
  asm:  'https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js'
};

export class ComputerOpponent {
  constructor(level = 10){
    this.level = Math.min(20, Math.max(1, level));
    this.worker = null;
    this.ready = false;
    this.usingFallback = false;
    this._pending = null;
  }

  /** Mencoba memuat Stockfish sungguhan; jatuh ke AI cadangan bila gagal. */
  async init(){
    const wasmSupported = typeof WebAssembly === 'object' &&
      WebAssembly.validate(Uint8Array.of(0x0, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00));
    const url = wasmSupported ? STOCKFISH_URLS.wasm : STOCKFISH_URLS.asm;

    try {
      await this._tryLoadWorker(url);
      this.usingFallback = false;
    } catch (err){
      console.warn('[chess-engine] Stockfish CDN gagal dimuat, memakai AI cadangan bawaan.', err);
      this.usingFallback = true;
    }
    this.ready = true;
  }

  _tryLoadWorker(url){
    return new Promise((resolve, reject) => {
      let settled = false;
      let worker;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        try { worker && worker.terminate(); } catch {}
        reject(new Error('Timeout memuat Stockfish'));
      }, 6000);

      try {
        worker = new Worker(url);
      } catch (err){
        clearTimeout(timeout);
        reject(err);
        return;
      }

      worker.onerror = (e) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        try { worker.terminate(); } catch {}
        reject(e.error || new Error('Worker error'));
      };

      worker.onmessage = (e) => {
        const line = typeof e.data === 'string' ? e.data : '';
        if (!settled && line.includes('uciok')){
          settled = true;
          clearTimeout(timeout);
          this.worker = worker;
          worker.postMessage(`setoption name Skill Level value ${this.level}`);
          worker.onmessage = (ev) => this._onEngineMessage(ev);
          resolve();
          return;
        }
      };

      worker.postMessage('uci');
    });
  }

  _onEngineMessage(e){
    const line = typeof e.data === 'string' ? e.data : '';
    if (line.startsWith('bestmove') && this._pending){
      const parts = line.split(' ');
      const uciMove = parts[1]; // ex: "e2e4" atau "e7e8q"
      const { resolve } = this._pending;
      this._pending = null;
      resolve(this._parseUciMove(uciMove));
    }
  }

  _parseUciMove(uci){
    if (!uci || uci === '(none)') return null;
    return {
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.length > 4 ? uci[4] : undefined
    };
  }

  /** @param {string} fen posisi saat ini @returns {Promise<{from,to,promotion}|null>} */
  async bestMove(fen, legalMovesProvider){
    if (!this.usingFallback && this.worker){
      return new Promise((resolve) => {
        this._pending = { resolve };
        const depth = 2 + Math.round(this.level * 0.7); // level 1 -> depth ~3, level 20 -> depth ~16
        this.worker.postMessage(`position fen ${fen}`);
        this.worker.postMessage(`go depth ${depth}`);
        // Jaga-jaga: bila worker diam saja (jarang terjadi), pakai fallback setelah 8 detik.
        setTimeout(() => {
          if (this._pending){
            this._pending = null;
            resolve(this._fallbackMove(legalMovesProvider));
          }
        }, 8000);
      });
    }
    return this._fallbackMove(legalMovesProvider);
  }

  /**
   * AI cadangan sederhana (tanpa dependensi luar): memilih di antara
   * semua langkah legal dengan bobot — mengutamakan tangkapan bidak
   * bernilai tinggi, sedikit keacakan berbanding terbalik dengan level
   * supaya level rendah terasa "lemah" dan level tinggi lebih tajam.
   */
  _fallbackMove(legalMovesProvider){
    const moves = legalMovesProvider(); // array verbose chess.js moves untuk SEMUA bidak giliran ini
    if (!moves || !moves.length) return null;

    const VALUE = { p:1, n:3, b:3, r:5, q:9, k:0 };
    const scored = moves.map(m => {
      let score = 0;
      if (m.captured) score += (VALUE[m.captured] || 0) * 10 - (VALUE[m.piece] || 0);
      if (m.san && m.san.includes('+')) score += 4;   // beri skak
      if (m.san && m.san.includes('#')) score += 999;  // skakmat
      if (m.promotion) score += 8;
      score += Math.random() * (21 - this.level); // makin rendah level, makin acak
      return { m, score };
    });
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0].m;
    return { from: best.from, to: best.to, promotion: best.promotion };
  }

  destroy(){
    try { this.worker && this.worker.terminate(); } catch {}
    this.worker = null;
  }
}

/* =========================================================
   RATING ELO
========================================================= */

/**
 * Hitung rating baru gaya ELO (seperti Chess.com/Lichess).
 * @param {number} ratingA rating pemain A sebelum main
 * @param {number} ratingB rating pemain B sebelum main
 * @param {number} scoreA  1 = A menang, 0.5 = seri, 0 = A kalah
 * @param {number} k       K-factor (default 32)
 */
export function calcElo(ratingA, ratingB, scoreA, k = 32){
  const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  const newA = Math.round(ratingA + k * (scoreA - expectedA));
  const newB = Math.round(ratingB + k * ((1 - scoreA) - (1 - expectedA)));
  return { newA, newB, deltaA: newA - ratingA, deltaB: newB - ratingB };
}
