/* =========================================================
   SCRIPT.JS — Orkestrator Modul Catur
   -------------------------------------------------
   Menghubungkan: sesi login peserta (dari website utama),
   Firestore (koleksi baru khusus catur, project SAMA),
   aturan main (chess-engine.js), papan 3D (effects.js),
   tampilan (ui.js), dan suara (sound.js).
========================================================= */

import {
  firebaseConfig, SESSION_KEY, FIRESTORE_COLLECTION,
  COL_CHESS_PLAYERS, COL_CHESS_ROOMS, COL_CHESS_MATCHES, COL_CHESS_CHALLENGES,
  GAME_TIME_MS, ELO_K_FACTOR, HEARTBEAT_MS, ONLINE_TIMEOUT_MS, IDLE_TIMEOUT_MS
} from './firebase-config.js';
import { loadChessRules, ChessMatch, ComputerOpponent, calcElo } from './chess-engine.js';
import { Chess3DScene } from './effects.js';
import { sound } from './sound.js';
import * as UI from './ui.js';

const SDK_VER = '10.12.2';

/* ---------------- DOM refs ---------------- */
const $ = (id) => document.getElementById(id);

const el = {
  loading: $('loadingScreen'),
  lobby: $('lobbyScreen'),
  game: $('gameScreen'),
  board3d: $('board3d'),
  guestBadge: $('guestBadge'),
  memberBadge: $('memberBadge'),
  memberName: $('memberName'),
  memberRating: $('memberRating'),
  topAvatarChip: $('topAvatarChip'),

  rankingList: $('rankingList'),
  onlineList: $('onlineList'),
  searchInput: $('searchPlayerInput'),
  statTotalPlayers: $('statTotalPlayers'), statOnlineNow: $('statOnlineNow'), statTopRating: $('statTopRating'),
  onlineCountChip: $('onlineCountChip'),

  btnVsComputer: $('btnVsComputer'),
  btnVsPlayer: $('btnVsPlayerPanel'),
  computerLevelRange: $('computerLevelRange'),
  computerLevelValue: $('computerLevelValue'),
  startComputerBtn: $('startComputerBtn'),

  profileModal: $('profileModal'),
  victoryModal: $('victoryModal'),
  settingsModal: $('settingsModal'),
  guestLockModal: $('guestLockModal'),
  drawOfferBox: $('drawOfferBox'),

  btnMatchHistory: $('btnMatchHistory'),
  matchHistoryModal: $('matchHistoryModal'),
  matchHistoryList: $('matchHistoryList'),
  matchHistoryEmpty: $('matchHistoryEmpty'),
  matchHistoryLoading: $('matchHistoryLoading'),

  btnEmote: $('btnEmote'),
  emotePicker: $('emotePicker'),
  emoteBubbleLayer: $('emoteBubbleLayer'),

  toastContainer: $('toastContainer'),
  challengeContainer: $('challengeContainer'),

  hudSelfName: $('hudSelfName'), hudSelfRating: $('hudSelfRating'),
  hudSelfTimer: $('hudSelfTimer'), hudSelfCaptured: $('hudSelfCaptured'), hudSelfAvatar: $('hudSelfAvatar'),
  hudOppName: $('hudOppName'), hudOppRating: $('hudOppRating'),
  hudOppTimer: $('hudOppTimer'), hudOppCaptured: $('hudOppCaptured'), hudOppAvatar: $('hudOppAvatar'),
  duelFillSelf: $('duelFillSelf'), duelFillOpp: $('duelFillOpp'),
  moveHistoryList: $('moveHistoryList'),
  gameModeLabel: $('gameModeLabel'),

  btnResign: $('btnResign'), btnDraw: $('btnDraw'), btnUndo: $('btnUndo'),
  btnZoomIn: $('btnZoomIn'), btnZoomOut: $('btnZoomOut'),
  btnMute: $('btnMute'), btnFullscreen: $('btnFullscreen'), btnSettings: $('btnSettings'), btnExit: $('btnExitGame'),

  settingVolume: $('settingVolume'), settingMuted: $('settingMuted'),
  settingShadow: $('settingShadow'), settingBloom: $('settingBloom'),
};

/* ---------------- State global ---------------- */
const state = {
  fb: null,           // { app, db, fns }
  session: null,      // { nama, kodeUnik } | null (guest)
  me: null,           // dokumen chess_players milik sendiri (realtime)
  rankingCache: [],
  scene: null,
  match: null,        // ChessMatch aktif
  computer: null,     // ComputerOpponent aktif (mode vs komputer)
  vsComputer: false,
  roomId: null,
  roomUnsub: null,
  myColor: 'w',
  selectedSquare: null,
  timerInterval: null,
  localTimers: { w: GAME_TIME_MS, b: GAME_TIME_MS },
  turnStartedAtMs: 0,
  opponentProfile: null,
  gameStartedAt: 0,
  watchdogLastOpponentActive: 0,
  incrementMs: 0,        // increment waktu per-langkah (Fischer) — hanya PvP
  timeControlLabel: 'Rapid 10+5',
  lastEmoteTs: null,     // dedupe reaksi emoji supaya tidak diputar ulang
  validKodeSet: null,    // Set berisi kodeUnik peserta yang MASIH TERDAFTAR di
                          // koleksi "pendaftaran" (null = belum dimuat sama sekali).
                          // Dipakai buat menyaring ranking/online list supaya
                          // peserta yang sudah dihapus admin (atau dulu dihapus
                          // SEBELUM fitur auto-hapus profil catur ada) tidak lagi
                          // "berhantu" di Lokon Chess Arena walau dokumen
                          // chess_players miliknya masih tersisa di Firestore.
};

/* =========================================================
   1. FIREBASE INIT (pola sama seperti index.html utama)
========================================================= */
async function initFirebase(){
  const [{ initializeApp }, fs] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${SDK_VER}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${SDK_VER}/firebase-firestore.js`)
  ]);
  const app = initializeApp(firebaseConfig);
  const db = fs.getFirestore(app);
  return { app, db, fns: fs };
}

/* =========================================================
   2. SESI PESERTA (dibaca dari localStorage — TIDAK membuat
      login baru, murni membaca sesi yang sudah dibuat oleh
      index.html website utama)
========================================================= */
function readSession(){
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.kodeUnik) return null;
    return parsed;
  } catch { return null; }
}

/* =========================================================
   3. PROFIL CATUR PESERTA (chess_players/{kodeUnik})
========================================================= */
async function ensurePlayerDoc(){
  const { db, fns } = state.fb;
  const kode = state.session.kodeUnik.toUpperCase();
  const ref = fns.doc(db, COL_CHESS_PLAYERS, kode);
  const snap = await fns.getDoc(ref);
  if (!snap.exists()){
    await fns.setDoc(ref, {
      kodeUnik: kode,
      nama: state.session.nama || 'Peserta',
      rating: 1000,
      totalMatch: 0, menang: 0, kalah: 0, seri: 0, kabur: 0,
      winStreak: 0, bestWinStreak: 0,
      totalPlayMs: 0,
      inGame: false, currentRoomId: null,
      joinedAt: fns.serverTimestamp(),
      lastActiveAt: fns.serverTimestamp()
    });
  } else {
    // Sinkronkan nama terbaru dari pendaftaran (kalau berubah)
    await fns.updateDoc(ref, { nama: state.session.nama || snap.data().nama });
  }
  return ref;
}

function startHeartbeat(ref){
  const { fns } = state.fb;
  const beat = () => fns.updateDoc(ref, { lastActiveAt: fns.serverTimestamp() }).catch(() => {});
  beat();
  setInterval(beat, HEARTBEAT_MS);
  window.addEventListener('visibilitychange', () => { if (!document.hidden) beat(); });
  window.addEventListener('beforeunload', () => { fns.updateDoc(ref, { lastActiveAt: fns.serverTimestamp() }).catch(() => {}); });
}

/** Hitung status realtime dari lastActiveAt (bukan field status statis). */
function computeStatus(lastActiveAt){
  if (!lastActiveAt) return 'offline';
  const ms = lastActiveAt.toMillis ? lastActiveAt.toMillis() : new Date(lastActiveAt).getTime();
  const diff = Date.now() - ms;
  if (diff <= ONLINE_TIMEOUT_MS) return 'online';
  if (diff <= IDLE_TIMEOUT_MS) return 'idle';
  return 'offline';
}

/* =========================================================
   4. RANKING & PLAYER ONLINE (realtime, top 100 by rating)
========================================================= */
function listenRanking(){
  const { db, fns } = state.fb;
  const q = fns.query(fns.collection(db, COL_CHESS_PLAYERS), fns.orderBy('rating', 'desc'), fns.limit(100));
  fns.onSnapshot(q, (snap) => {
    const players = snap.docs.map(d => {
      const data = d.data();
      return { ...data, status: computeStatus(data.lastActiveAt) };
    });
    state.rankingCache = players;
    renderLists();
    if (state.session){
      const mine = players.find(p => p.kodeUnik === state.session.kodeUnik.toUpperCase());
      if (mine) updateSelfBadge(mine);
    }
  }, (err) => console.error('[ranking] listener error', err));
}

/* Menyaring "chess_players" hantu: peserta yang sudah dihapus dari koleksi
   "pendaftaran" (baik lewat tombol hapus admin, ATAU lebih dulu dihapus
   sebelum fitur auto-hapus profil catur ditambahkan) tidak akan pernah
   ikut terhapus otomatis dari chess_players jika penghapusannya terjadi
   di luar tombol hapus dasbor. Daripada mengandalkan penghapusan itu selalu
   sempurna, di sini kita dengarkan LANGSUNG koleksi "pendaftaran" (sumber
   kebenaran) secara realtime, dan tampilkan ranking/online HANYA untuk
   kodeUnik yang benar-benar masih terdaftar di sana. Jadi begitu admin
   menghapus peserta di dasbor, orangnya langsung hilang juga dari Lokon
   Chess Arena — real-time, tanpa perlu bersih-bersih manual di Firestore. */
function listenValidPeserta(){
  const { db, fns } = state.fb;
  fns.onSnapshot(fns.collection(db, FIRESTORE_COLLECTION), (snap) => {
    const set = new Set();
    snap.docs.forEach(d => {
      const kode = d.data()?.kodeUnik;
      if (kode) set.add(String(kode).toUpperCase());
    });
    state.validKodeSet = set;
    renderLists();
  }, (err) => console.error('[valid-peserta] listener error', err));
}

/* Daftar pemain yang sudah disaring terhadap peserta aktif. Selama
   validKodeSet belum sempat dimuat (null), tampilkan apa adanya dulu
   supaya arena tidak terlihat kosong sesaat — begitu data pendaftaran
   datang (biasanya hampir bersamaan), daftar langsung tersaring rapi. */
function getActivePlayers(){
  if (!state.validKodeSet) return state.rankingCache;
  return state.rankingCache.filter(p => state.validKodeSet.has(String(p.kodeUnik || '').toUpperCase()));
}

function renderLists(){
  const activePlayers = getActivePlayers();
  const filterTxt = (el.searchInput?.value || '').trim().toLowerCase();
  const filtered = filterTxt
    ? activePlayers.filter(p => p.nama.toLowerCase().includes(filterTxt))
    : activePlayers;

  UI.renderRankingList(el.rankingList, filtered, { onOpenProfile: openProfile });
  UI.renderOnlineList(el.onlineList, activePlayers, {
    onOpenProfile: openProfile,
    myKode: state.session ? state.session.kodeUnik.toUpperCase() : null
  });

  const onlineCount = activePlayers.filter(p => p.status === 'online').length;
  const topRating = activePlayers.length ? activePlayers[0].rating : 0;
  if (el.statTotalPlayers) el.statTotalPlayers.textContent = activePlayers.length;
  if (el.statOnlineNow) el.statOnlineNow.textContent = onlineCount;
  if (el.statTopRating) el.statTopRating.textContent = topRating || '-';
  if (el.onlineCountChip) el.onlineCountChip.textContent = onlineCount;
}

function updateSelfBadge(mine){
  state.me = mine;
  if (el.memberName) el.memberName.textContent = mine.nama;
  if (el.memberRating) el.memberRating.textContent = `Rating ${mine.rating}`;
  if (el.topAvatarChip){
    el.topAvatarChip.textContent = UI.initials(mine.nama);
    el.topAvatarChip.style.background = UI.avatarColor(mine.kodeUnik || mine.nama || '');
  }
}

/**
 * PENTING (perbaikan bug utama): profil catur milik sendiri (state.me)
 * dulunya HANYA diisi lewat listener ranking Top-100. Kalau peserta
 * belum masuk Top-100 (rating rendah/baru daftar dengan banyak pemain
 * lain), atau listener ranking itu belum sempat memuat waktu peserta
 * buru-buru klik "Terima" di tantangan duel yang masuk, state.me tetap
 * null -> acceptChallenge() crash diam-diam (game tidak pernah jalan).
 * Listener khusus 1 dokumen ini jauh lebih cepat & selalu akurat
 * berapa pun rating/posisi peserta di ranking.
 */
function listenMyProfile(ref){
  const { fns } = state.fb;
  fns.onSnapshot(ref, (snap) => {
    if (!snap.exists()) return;
    const data = snap.data();
    updateSelfBadge({ ...data, status: computeStatus(data.lastActiveAt) });
  }, (err) => console.error('[profil-sendiri] listener error', err));
}

/**
 * PERBAIKAN BUG: kalau sesi sebelumnya terputus mendadak (tab ditutup,
 * koneksi putus) SEBELUM finishRoom() sempat jalan, field inGame di
 * Firestore bisa "nyangkut" true selamanya. Akibatnya peserta terkunci
 * permanen: semua tantangan masuk otomatis ditolak diam-diam, dan dia
 * sendiri tidak bisa mengirim tantangan baru. Dipanggil sekali saat
 * boot untuk memulihkan keadaan:
 * - Kalau room-nya ternyata masih berjalan -> otomatis disambungkan
 *   kembali ke papan (reconnect), bukan cuma direset.
 * - Kalau room sudah selesai/hilang -> reset inGame supaya tidak
 *   terkunci permanen.
 */
async function recoverActiveSession(ref){
  const { db, fns } = state.fb;
  try {
    const snap = await fns.getDoc(ref);
    if (!snap.exists()) return;
    const data = snap.data();
    if (!data.inGame || !data.currentRoomId) return;

    const roomSnap = await fns.getDoc(fns.doc(db, COL_CHESS_ROOMS, data.currentRoomId));
    if (roomSnap.exists() && roomSnap.data().status === 'ongoing'){
      UI.toast(el.toastContainer, 'Menyambungkan kembali ke permainan yang tertunda…', 'info');
      enterRoom(data.currentRoomId);
    } else {
      await fns.updateDoc(ref, { inGame: false, currentRoomId: null });
    }
  } catch (err){
    console.error('[recoverActiveSession] gagal memulihkan sesi', err);
  }
}

/* =========================================================
   5b. RIWAYAT PERTANDINGAN SAYA
   Datanya sebenarnya SUDAH lama disimpan tiap game PvP selesai
   (koleksi chess_matches, lihat finishRoom) tapi belum pernah
   ditampilkan ke pemain — di sini baru dibaca & dirender.
========================================================= */
async function openMatchHistory(){
  if (!state.session){ openGuestLock(); return; }
  el.matchHistoryModal.classList.add('open');
  el.matchHistoryList.innerHTML = '';
  el.matchHistoryEmpty.style.display = 'none';
  el.matchHistoryLoading.style.display = 'block';

  const { db, fns } = state.fb;
  const myKode = state.session.kodeUnik.toUpperCase();
  try {
    // Sengaja TANPA orderBy digabung where(array-contains) — kombinasi itu
    // butuh composite index tambahan di Firestore Console. Diambil lalu
    // diurutkan di sisi klien saja (jumlahnya kecil, ringan).
    const q = fns.query(
      fns.collection(db, COL_CHESS_MATCHES),
      fns.where('players', 'array-contains', myKode),
      fns.limit(60)
    );
    const snap = await fns.getDocs(q);
    let matches = snap.docs.map(d => d.data());
    matches.sort((a, b) => (b.endedAt?.toMillis?.() || 0) - (a.endedAt?.toMillis?.() || 0));
    matches = matches.slice(0, 30);

    el.matchHistoryLoading.style.display = 'none';
    if (!matches.length){
      el.matchHistoryEmpty.style.display = 'block';
      return;
    }
    UI.renderMatchHistory(el.matchHistoryList, matches, myKode);
  } catch (err){
    console.warn('Gagal memuat riwayat pertandingan:', err);
    el.matchHistoryLoading.style.display = 'none';
    el.matchHistoryEmpty.textContent = 'Gagal memuat riwayat. Coba lagi sesaat.';
    el.matchHistoryEmpty.style.display = 'block';
  }
}

/* =========================================================
   5. PROFIL POPUP + KIRIM TANTANGAN
========================================================= */
function openProfile(player){
  sound.click();
  const myKode = state.session ? state.session.kodeUnik.toUpperCase() : null;
  UI.openProfileModal(el.profileModal, player, {
    myKode,
    canChallenge: !!state.session,
    onChallenge: (target, tc) => {
      if (!state.session){ openGuestLock(); return; }
      sendChallenge(target, tc);
      UI.closeModal(el.profileModal);
    }
  });
}

async function sendChallenge(target, tc){
  const { db, fns } = state.fb;
  const me = state.me;
  if (!me){ UI.toast(el.toastContainer, 'Profil kamu belum siap, coba lagi sesaat.', 'error'); return; }
  if (me.inGame){ UI.toast(el.toastContainer, 'Kamu sedang dalam permainan.', 'error'); return; }
  const timeControl = tc || UI.TIME_CONTROLS.rapid;

  const ref = await fns.addDoc(fns.collection(db, COL_CHESS_CHALLENGES), {
    from: { kodeUnik: me.kodeUnik, nama: me.nama, rating: me.rating },
    to: target.kodeUnik,
    status: 'pending',
    timeControlMs: timeControl.ms,
    incrementMs: timeControl.inc,
    timeControlLabel: timeControl.label,
    createdAt: fns.serverTimestamp()
  });
  UI.toast(el.toastContainer, `Tantangan ${timeControl.label} dikirim ke ${target.nama}, menunggu respons…`, 'info');
  sound.challenge();

  // Batas waktu tunggu di sisi penantang
  let unsub = () => {};
  const timeout = setTimeout(async () => {
    const snap = await fns.getDoc(ref);
    if (snap.exists() && snap.data().status === 'pending'){
      await fns.updateDoc(ref, { status: 'expired' });
      UI.toast(el.toastContainer, `${target.nama} tidak merespons tantangan.`, 'error');
    }
    unsub(); // PERBAIKAN BUG: dulu listener ini tidak pernah dilepas saat expired (kebocoran listener)
  }, 30000);

  unsub = fns.onSnapshot(ref, (snap) => {
    if (!snap.exists()) return;
    const d = snap.data();
    if (d.status === 'accepted' && d.roomId){
      clearTimeout(timeout); unsub();
      UI.toast(el.toastContainer, `${target.nama} menerima tantanganmu!`, 'success');
      enterRoom(d.roomId);
    } else if (d.status === 'rejected'){
      clearTimeout(timeout); unsub();
      UI.toast(el.toastContainer, `${target.nama} menolak tantangan.`, 'error');
    }
  });
}

/** Dengarkan tantangan MASUK ditujukan ke saya. */
function listenIncomingChallenges(){
  const { db, fns } = state.fb;
  const myKode = state.session.kodeUnik.toUpperCase();
  const q = fns.query(
    fns.collection(db, COL_CHESS_CHALLENGES),
    fns.where('to', '==', myKode),
    fns.where('status', '==', 'pending')
  );
  const seen = new Set();
  fns.onSnapshot(q, (snap) => {
    snap.docChanges().forEach(change => {
      if (change.type !== 'added') return;
      const id = change.doc.id;
      if (seen.has(id)) return;
      seen.add(id);
      const data = change.doc.data();
      if (state.me && state.me.inGame) {
        fns.updateDoc(change.doc.ref, { status: 'rejected' });
        return;
      }
      sound.notification();
      UI.showChallengeToast(el.challengeContainer, data.from, {
        onAccept: () => acceptChallenge(id, data),
        onReject: () => fns.updateDoc(change.doc.ref, { status: 'rejected' })
      });
    });
  });
}

async function acceptChallenge(challengeId, data){
  const { db, fns } = state.fb;
  let me = state.me;

  // PERBAIKAN BUG: dulu kalau state.me belum siap, baris di bawah
  // langsung crash (me.kodeUnik pada null) dan permainan tidak pernah
  // jalan sama sekali tanpa pesan apa pun ke peserta. Sekarang: coba
  // ambil profil langsung sekali sebagai fallback, dan kalau tetap
  // gagal, tolak tantangan dengan pesan yang jelas alih-alih diam saja.
  if (!me){
    try {
      const myKode = state.session.kodeUnik.toUpperCase();
      const snap = await fns.getDoc(fns.doc(db, COL_CHESS_PLAYERS, myKode));
      if (snap.exists()) me = { ...snap.data(), status: computeStatus(snap.data().lastActiveAt) };
    } catch (err){ console.error('[acceptChallenge] gagal ambil profil sendiri', err); }
  }
  if (!me){
    UI.toast(el.toastContainer, 'Profil kamu belum siap, coba lagi sesaat.', 'error');
    fns.updateDoc(fns.doc(db, COL_CHESS_CHALLENGES, challengeId), { status: 'rejected' }).catch(() => {});
    return;
  }
  if (me.inGame){
    UI.toast(el.toastContainer, 'Kamu sedang dalam permainan lain.', 'error');
    fns.updateDoc(fns.doc(db, COL_CHESS_CHALLENGES, challengeId), { status: 'rejected' }).catch(() => {});
    return;
  }

  const iAmWhite = Math.random() < 0.5;
  // Fallback GAME_TIME_MS/0 kalau ini tantangan format lama (sebelum fitur
  // kontrol waktu ada) yang kebetulan masih 'pending' saat fitur ini dirilis.
  const timeControlMs = data.timeControlMs || GAME_TIME_MS;
  const incrementMs = data.incrementMs || 0;
  const timeControlLabel = data.timeControlLabel || 'Rapid 10+5';
  const roomRef = await fns.addDoc(fns.collection(db, COL_CHESS_ROOMS), {
    players: {
      w: iAmWhite ? pick(me) : pick(data.from),
      b: iAmWhite ? pick(data.from) : pick(me)
    },
    playersKode: [me.kodeUnik, data.from.kodeUnik],
    fen: 'start',
    pgn: [],
    turn: 'w',
    whiteTimeMs: timeControlMs,
    blackTimeMs: timeControlMs,
    timeControlMs, incrementMs, timeControlLabel,
    turnStartedAt: fns.serverTimestamp(),
    status: 'ongoing',
    drawOfferBy: null,
    emote: null,
    vsComputer: false,
    createdAt: fns.serverTimestamp(),
    updatedAt: fns.serverTimestamp()
  });

  await fns.updateDoc(fns.doc(db, COL_CHESS_CHALLENGES, challengeId), { status: 'accepted', roomId: roomRef.id });

  await Promise.all([
    fns.updateDoc(fns.doc(db, COL_CHESS_PLAYERS, me.kodeUnik), { inGame: true, currentRoomId: roomRef.id }),
    fns.updateDoc(fns.doc(db, COL_CHESS_PLAYERS, data.from.kodeUnik), { inGame: true, currentRoomId: roomRef.id })
  ]);

  enterRoom(roomRef.id);
}

function pick(p){ return { kodeUnik: p.kodeUnik, nama: p.nama, rating: p.rating }; }

/* =========================================================
   6. GUEST LOCK
========================================================= */
function openGuestLock(){
  el.guestLockModal && el.guestLockModal.classList.add('open');
}

/* =========================================================
   7. MODE: LAWAN KOMPUTER (praktik — TIDAK memengaruhi rating/statistik)
========================================================= */
async function startComputerGame(){
  if (!state.session){ openGuestLock(); return; }
  const level = parseInt(el.computerLevelRange.value, 10) || 10;

  UI.switchScreen({ lobbyScreen: el.lobby, gameScreen: el.game }, 'gameScreen');
  el.gameModeLabel.textContent = `Lawan Komputer • Level ${level} (latihan, rating tidak berubah)`;

  state.vsComputer = true;
  state.roomId = null;
  state.myColor = 'w';
  state.opponentProfile = { nama: `Komputer Lv.${level}`, rating: 800 + level * 60, kodeUnik: '__CPU__' };
  await setupBoardForNewGame();

  state.computer = new ComputerOpponent(level);
  await state.computer.init();
  if (state.computer.usingFallback){
    UI.toast(el.toastContainer, 'Mesin Stockfish online tidak tersedia — memakai AI cadangan bawaan.', 'info');
  }

  startLocalTimerLoop();
}

/* =========================================================
   8. MASUK RUANG PVP REALTIME
========================================================= */
function enterRoom(roomId){
  const { db, fns } = state.fb;
  state.vsComputer = false;
  state.roomId = roomId;
  UI.switchScreen({ lobbyScreen: el.lobby, gameScreen: el.game }, 'gameScreen');
  el.gameModeLabel.textContent = 'Lawan Player • Menyambung…';

  if (state.roomUnsub) state.roomUnsub();
  const roomRef = fns.doc(db, COL_CHESS_ROOMS, roomId);

  let initialized = false;
  state.roomUnsub = fns.onSnapshot(roomRef, async (snap) => {
    if (!snap.exists()) return;
    const room = snap.data();

    if (!initialized){
      initialized = true;
      const myKode = state.session.kodeUnik.toUpperCase();
      state.myColor = room.players.w.kodeUnik === myKode ? 'w' : 'b';
      state.opponentProfile = state.myColor === 'w' ? room.players.b : room.players.w;
      state.incrementMs = room.incrementMs || 0;
      state.timeControlLabel = room.timeControlLabel || 'Rapid 10+5';
      state.lastEmoteTs = room.emote?.ts || null; // jangan putar ulang reaksi lama saat baru masuk/reconnect
      el.gameModeLabel.textContent = `Lawan Player • ${state.timeControlLabel}`;
      await setupBoardForNewGame(room.fen === 'start' ? undefined : room.fen);
      state.scene.setOrientation(state.myColor);
      startLocalTimerLoop();
    }

    applyRoomSnapshot(room);

    if (room.status === 'finished'){
      handleRoomFinished(room);
    }
  });
}

function applyRoomSnapshot(room){
  state.localTimers.w = room.whiteTimeMs;
  state.localTimers.b = room.blackTimeMs;
  state.turnStartedAtMs = room.turnStartedAt?.toMillis ? room.turnStartedAt.toMillis() : Date.now();
  state.currentTurn = room.turn;

  // Rekonstruksi papan dari FEN kalau berbeda dari state lokal (langkah lawan masuk)
  const fen = room.fen === 'start' ? undefined : room.fen;
  const localFen = state.match ? state.match.fen : null;
  if (fen && fen !== localFen){
    const lastMove = room.pgn && room.pgn.length ? room.pgn[room.pgn.length - 1] : null;
    state.match = new ChessMatch(fen);
    state.scene.setPosition(state.match.board());
    if (lastMove) state.scene.showLastMove(lastMove.from, lastMove.to);
    reflectGameStatusEffects();
    if (lastMove && lastMove.captured) sound.capture(); else if (lastMove) sound.move();
  }

  renderHud();
  UI.renderMoveHistory(el.moveHistoryList, state.match.history);

  if (room.drawOfferBy && room.drawOfferBy !== state.myColor){
    showDrawOfferPrompt(room);
  } else {
    el.drawOfferBox && el.drawOfferBox.classList.remove('show');
  }

  // Reaksi emoji cepat (👍😮😂 dst.) — dibandingkan pakai timestamp klien
  // supaya tiap reaksi baru cuma "diputar" sekali, tidak berulang tiap
  // snapshot lain masuk (mis. saat lawan jalan).
  if (room.emote && room.emote.ts && room.emote.ts !== state.lastEmoteTs){
    state.lastEmoteTs = room.emote.ts;
    const isSelf = room.emote.by === state.myColor;
    UI.showEmoteBubble(el.emoteBubbleLayer, room.emote.emoji, isSelf);
    if (!isSelf && navigator.vibrate){ try { navigator.vibrate(35); } catch (err) { /* diabaikan */ } }
  }
}

function showDrawOfferPrompt(room){
  if (!el.drawOfferBox) return;
  el.drawOfferBox.classList.add('show');
  el.drawOfferBox.innerHTML = `
    <span>Lawan menawarkan remis</span>
    <button class="btn-mini btn-accept" id="acceptDrawBtn">Terima</button>
    <button class="btn-mini btn-reject" id="rejectDrawBtn">Tolak</button>`;
  $('acceptDrawBtn').onclick = () => finishRoom(state.roomId, 'draw', 'draw_agree');
  $('rejectDrawBtn').onclick = () => {
    const { db, fns } = state.fb;
    fns.updateDoc(fns.doc(db, COL_CHESS_ROOMS, state.roomId), { drawOfferBy: null });
  };
}

async function handleRoomFinished(room){
  if (state.roomUnsub) { state.roomUnsub(); state.roomUnsub = null; }
  stopLocalTimerLoop();

  const myKode = state.session.kodeUnik.toUpperCase();
  const iWon = room.result === state.myColor;
  const isDraw = room.result === 'draw';
  const outcome = isDraw ? 'draw' : (iWon ? 'win' : 'lose');

  if (outcome === 'win'){ sound.victory(); state.scene.celebrateVictory(); }
  else if (outcome === 'lose'){ sound.lose(); }
  else { sound.draw(); }
  vibrateOutcome(outcome);

  const myDelta = room.ratingDelta ? (state.myColor === 'w' ? room.ratingDelta.w : room.ratingDelta.b) : 0;
  UI.showVictoryModal(el.victoryModal, { outcome, reason: room.reason, ratingDelta: myDelta, vsComputer: false });
}

/** Pola getar HP singkat sesuai hasil akhir — aman dilewati di device/browser tanpa dukungan getar. */
function vibrateOutcome(outcome){
  if (!navigator.vibrate) return;
  try {
    if (outcome === 'win') navigator.vibrate([40, 60, 40, 60, 120]);
    else if (outcome === 'lose') navigator.vibrate(180);
    else navigator.vibrate([60, 40, 60]);
  } catch (err) { /* diabaikan */ }
}

/* =========================================================
   9. PAPAN & INTERAKSI (dipakai baik mode komputer maupun PvP)
========================================================= */
async function setupBoardForNewGame(fen){
  await loadChessRules();
  state.match = new ChessMatch(fen);
  state.selectedSquare = null;
  state.gameStartedAt = Date.now();
  state.localTimers = { w: GAME_TIME_MS, b: GAME_TIME_MS };
  state.turnStartedAtMs = Date.now();

  if (!state.scene){
    state.scene = new Chess3DScene(el.board3d, { onSquareClick: onBoardSquareClick });
    await state.scene.init();
    state.scene.setBloom(el.settingBloom ? el.settingBloom.checked : true);
    state.scene.setShadows(el.settingShadow ? el.settingShadow.checked : true);
  }
  state.scene.setPosition(state.match.board());
  state.scene.clearHighlights();
  state.scene.clearCheck();
  state.scene.setOrientation(state.vsComputer ? 'w' : state.myColor);
  renderHud();
  UI.renderMoveHistory(el.moveHistoryList, []);
}

function myTurnNow(){
  if (state.vsComputer) return state.match.turn === 'w'; // manusia selalu putih vs komputer
  return state.match.turn === state.myColor;
}

function onBoardSquareClick(square){
  if (!state.match || !myTurnNow()) return;

  if (state.selectedSquare){
    if (square === state.selectedSquare){
      state.selectedSquare = null;
      state.scene.clearHighlights();
      return;
    }
    const legal = state.match.legalMovesFrom(state.selectedSquare);
    const chosen = legal.find(m => m.to === square);
    if (chosen){
      commitMove(state.selectedSquare, square, chosen.promotion ? 'q' : undefined);
      state.selectedSquare = null;
      state.scene.clearHighlights();
      return;
    }
    // Klik petak lain milik sendiri -> pindah seleksi
    const piece = state.match.board()[8 - parseInt(square[1],10)][square.charCodeAt(0)-97];
    if (piece && piece.color === state.match.turn){
      selectSquare(square);
    } else {
      state.selectedSquare = null;
      state.scene.clearHighlights();
    }
    return;
  }

  const piece = state.match.board()[8 - parseInt(square[1],10)][square.charCodeAt(0)-97];
  if (piece && piece.color === state.match.turn) selectSquare(square);
}

function selectSquare(square){
  state.selectedSquare = square;
  state.scene.highlightSelected(square);
  state.scene.showLegalMoves(state.match.legalMovesFrom(square));
}

async function commitMove(from, to, promotion){
  const beforeFen = state.match.fen;
  const moveResult = state.match.move(from, to, promotion);
  if (!moveResult) return;

  await state.scene.animateMove({
    from, to, captured: moveResult.captured, promotion: moveResult.promotion, color: moveResult.color
  });

  if (moveResult.captured) sound.capture(); else sound.move();
  if (state.match.isCheck() && !state.match.isCheckmate()){
    sound.check();
    if (navigator.vibrate){ try { navigator.vibrate(60); } catch (err) { /* diabaikan */ } }
  }

  reflectGameStatusEffects();
  renderHud();
  UI.renderMoveHistory(el.moveHistoryList, state.match.history);

  const now = Date.now();
  const elapsed = now - state.turnStartedAtMs;
  const moverColor = moveResult.color;
  state.localTimers[moverColor] = Math.max(0, state.localTimers[moverColor] - elapsed);
  // Fischer increment: tambahkan waktu setelah bergerak (hanya PvP, kalau
  // kontrol waktunya memang punya increment — Bullet 3+0 tidak dapat tambahan).
  if (!state.vsComputer && state.incrementMs) state.localTimers[moverColor] += state.incrementMs;
  state.turnStartedAtMs = now;

  if (state.vsComputer){
    await checkGameEndVsComputer();
    // PENTING (perbaikan bug "bidak jalan otomatis"): hanya jadwalkan
    // giliran komputer kalau yang BARU SAJA jalan adalah bidak manusia
    // (putih). Sebelumnya kode ini terpanggil lagi setelah komputer
    // SENDIRI selesai jalan, sehingga Stockfish diminta mencarikan
    // langkah terbaik untuk giliran putih (manusia) dan otomatis
    // menjalankannya sendiri tanpa diklik user.
    if (!state.match.isGameOver() && moveResult.color === 'w'){
      window.setTimeout(() => makeComputerMove(), 260);
    }
  } else {
    await syncMoveToRoom(moveResult);
  }
}

async function makeComputerMove(){
  if (!state.match || state.match.isGameOver()) return;
  const legalAll = [];
  'abcdefgh'.split('').forEach(f => {
    for (let r = 1; r <= 8; r++) legalAll.push(...state.match.legalMovesFrom(f + r));
  });
  const uciMove = await state.computer.bestMove(state.match.fen, () => legalAll);
  if (!uciMove) return;
  await commitMove(uciMove.from, uciMove.to, uciMove.promotion);
}

function reflectGameStatusEffects(){
  if (state.match.isCheck()){
    const board = state.match.board();
    const turnColor = state.match.turn;
    outer: for (let r = 0; r < 8; r++){
      for (let f = 0; f < 8; f++){
        const cell = board[r][f];
        if (cell && cell.type === 'k' && cell.color === turnColor){
          const square = 'abcdefgh'[f] + (8 - r);
          state.scene.showCheck(square);
          break outer;
        }
      }
    }
  } else {
    state.scene.clearCheck();
  }
}

/* ---------------- HUD ---------------- */
function renderHud(){
  const selfName = state.vsComputer ? (state.session ? state.session.nama : 'Tamu') : (state.me ? state.me.nama : '-');
  const selfRating = state.vsComputer ? (state.me ? state.me.rating : '-') : (state.me ? state.me.rating : '-');
  el.hudSelfName.textContent = selfName;
  el.hudSelfRating.textContent = selfRating;
  el.hudSelfAvatar.textContent = UI.initials(selfName);

  el.hudOppName.textContent = state.opponentProfile ? state.opponentProfile.nama : '-';
  el.hudOppRating.textContent = state.opponentProfile ? state.opponentProfile.rating : '-';
  el.hudOppAvatar.textContent = state.opponentProfile ? UI.initials(state.opponentProfile.nama) : '?';

  const myColor = state.vsComputer ? 'w' : state.myColor;
  const oppColor = myColor === 'w' ? 'b' : 'w';
  const captured = state.match.capturedPieces();
  UI.renderCaptured(el.hudSelfCaptured, captured[oppColor], oppColor);
  UI.renderCaptured(el.hudOppCaptured, captured[myColor], myColor);

  const total = state.localTimers.w + state.localTimers.b || 1;
  const selfMs = state.localTimers[myColor], oppMs = state.localTimers[oppColor];
  if (el.duelFillSelf) el.duelFillSelf.style.width = `${(selfMs/total)*100}%`;
  if (el.duelFillOpp) el.duelFillOpp.style.width = `${(oppMs/total)*100}%`;
}

/* ---------------- Timer loop ---------------- */
function startLocalTimerLoop(){
  stopLocalTimerLoop();
  state.timerInterval = setInterval(() => {
    if (!state.match || state.match.isGameOver()) return;
    const activeColor = state.match.turn;
    const myColor = state.vsComputer ? 'w' : state.myColor;
    const elapsed = Date.now() - state.turnStartedAtMs;
    const liveMs = Math.max(0, state.localTimers[activeColor] - elapsed);

    UI.setTimerDisplay(activeColor === myColor ? el.hudSelfTimer : el.hudOppTimer, liveMs, true);
    UI.setTimerDisplay(activeColor === myColor ? el.hudOppTimer : el.hudSelfTimer,
      state.localTimers[activeColor === 'w' ? 'b' : 'w'], false);

    if (liveMs <= 15000 && liveMs > 0 && Math.floor(liveMs/1000) !== Math.floor((liveMs+250)/1000)) sound.countdown();

    if (liveMs <= 0){
      stopLocalTimerLoop();
      if (state.vsComputer){
        finishLocalGame(activeColor === 'w' ? 'b' : 'w', 'timeout');
      } else {
        finishRoom(state.roomId, activeColor === 'w' ? 'b' : 'w', 'timeout');
      }
    }
  }, 250);
}
function stopLocalTimerLoop(){ if (state.timerInterval) clearInterval(state.timerInterval); state.timerInterval = null; }

/* =========================================================
   10. AKHIR PERMAINAN
========================================================= */

async function checkGameEndVsComputer(){
  if (!state.match.isGameOver()) return;
  let winner = null, reason = 'draw_rule';
  if (state.match.isCheckmate()){ winner = state.match.turn === 'w' ? 'b' : 'w'; reason = 'checkmate'; sound.checkmate(); }
  else if (state.match.isStalemate()){ reason = 'stalemate'; }
  else if (state.match.isDraw()){ reason = 'draw_rule'; }
  finishLocalGame(winner, reason);
}

/** Mode Lawan Komputer: TIDAK menulis rating/statistik apa pun (sesuai permintaan). */
function finishLocalGame(winnerColor, reason){
  stopLocalTimerLoop();
  const outcome = !winnerColor ? 'draw' : (winnerColor === 'w' ? 'win' : 'lose');
  if (outcome === 'win'){ sound.victory(); state.scene.celebrateVictory(); }
  else if (outcome === 'lose'){ sound.lose(); }
  else { sound.draw(); }
  vibrateOutcome(outcome);
  UI.showVictoryModal(el.victoryModal, { outcome, reason, ratingDelta: 0, vsComputer: true });
  if (state.computer){ state.computer.destroy(); state.computer = null; }
}

/** Klik user sendiri (resign/timeout terdeteksi lokal) untuk room PvP. */
async function finishRoom(roomId, winnerColor, reason){
  const { db, fns } = state.fb;
  const roomRef = fns.doc(db, COL_CHESS_ROOMS, roomId);

  try {
    await fns.runTransaction(db, async (tx) => {
      const snap = await tx.get(roomRef);
      if (!snap.exists()) return;
      const room = snap.data();
      if (room.status === 'finished') return; // sudah diproses klien lain

      const wRef = fns.doc(db, COL_CHESS_PLAYERS, room.players.w.kodeUnik);
      const bRef = fns.doc(db, COL_CHESS_PLAYERS, room.players.b.kodeUnik);
      const wSnap = await tx.get(wRef);
      const bSnap = await tx.get(bRef);
      const wData = wSnap.data(); const bData = bSnap.data();

      let scoreW = 0.5, scoreB = 0.5;
      if (winnerColor === 'w'){ scoreW = 1; scoreB = 0; }
      else if (winnerColor === 'b'){ scoreW = 0; scoreB = 1; }

      const { newA: newW, newB: newBRating, deltaA, deltaB } = calcElo(wData.rating, bData.rating, scoreW, ELO_K_FACTOR);

      tx.update(roomRef, {
        status: 'finished', result: winnerColor || 'draw', reason,
        ratingDelta: { w: deltaA, b: deltaB }, updatedAt: fns.serverTimestamp()
      });

      tx.update(wRef, buildStatUpdate(wData, scoreW, newW, reason, 'w', winnerColor));
      tx.update(bRef, buildStatUpdate(bData, scoreB, newBRating, reason, 'b', winnerColor));

      tx.set(fns.doc(db, COL_CHESS_MATCHES, roomId), {
        players: [room.players.w.kodeUnik, room.players.b.kodeUnik],
        white: room.players.w, black: room.players.b,
        result: winnerColor || 'draw', reason,
        ratingDelta: { w: deltaA, b: deltaB },
        pgn: room.pgn || [],
        timeControlLabel: room.timeControlLabel || 'Rapid 10+5',
        durationMs: Date.now() - (room.createdAt?.toMillis ? room.createdAt.toMillis() : Date.now()),
        endedAt: fns.serverTimestamp()
      });
    });
  } catch (err){
    console.error('[finishRoom] transaksi gagal', err);
  }
}

function buildStatUpdate(data, score, newRating, reason, color, winnerColor){
  const won = score === 1;
  const lost = score === 0;
  const kabur = reason === 'abandon' && winnerColor && winnerColor !== color;
  const newStreak = won ? (data.winStreak || 0) + 1 : 0;
  return {
    rating: newRating,
    totalMatch: (data.totalMatch || 0) + 1,
    menang: (data.menang || 0) + (won ? 1 : 0),
    kalah: (data.kalah || 0) + (lost ? 1 : 0),
    seri: (data.seri || 0) + (score === 0.5 ? 1 : 0),
    kabur: (data.kabur || 0) + (kabur ? 1 : 0),
    winStreak: newStreak,
    bestWinStreak: Math.max(data.bestWinStreak || 0, newStreak),
    inGame: false, currentRoomId: null
  };
}

async function syncMoveToRoom(moveResult){
  const { db, fns } = state.fb;
  const roomRef = fns.doc(db, COL_CHESS_ROOMS, state.roomId);
  await fns.updateDoc(roomRef, {
    fen: state.match.fen,
    pgn: state.match.history,
    turn: state.match.turn,
    whiteTimeMs: state.localTimers.w,
    blackTimeMs: state.localTimers.b,
    turnStartedAt: fns.serverTimestamp(),
    lastMove: { from: moveResult.from, to: moveResult.to, san: moveResult.san, captured: !!moveResult.captured },
    drawOfferBy: null,
    updatedAt: fns.serverTimestamp()
  });

  if (state.match.isGameOver()){
    let winner = null, reason = 'draw_rule';
    if (state.match.isCheckmate()){ winner = state.match.turn === 'w' ? 'b' : 'w'; reason = 'checkmate'; sound.checkmate(); }
    else if (state.match.isStalemate()) reason = 'stalemate';
    await finishRoom(state.roomId, winner, reason);
  }
}

/* =========================================================
   11. TOMBOL AKSI DALAM GAME
========================================================= */
function wireGameActions(){
  el.btnResign && el.btnResign.addEventListener('click', () => {
    if (!confirm('Yakin ingin menyerah dari permainan ini?')) return;
    const myColor = state.vsComputer ? 'w' : state.myColor;
    const winner = myColor === 'w' ? 'b' : 'w';
    if (state.vsComputer) finishLocalGame(winner, 'resign');
    else finishRoom(state.roomId, winner, 'resign');
  });

  el.btnDraw && el.btnDraw.addEventListener('click', async () => {
    if (state.vsComputer){ UI.toast(el.toastContainer, 'Tawaran remis hanya berlaku saat lawan player.', 'info'); return; }
    const { db, fns } = state.fb;
    await fns.updateDoc(fns.doc(db, COL_CHESS_ROOMS, state.roomId), { drawOfferBy: state.myColor });
    UI.toast(el.toastContainer, 'Tawaran remis dikirim ke lawan.', 'info');
  });

  el.btnUndo && el.btnUndo.addEventListener('click', () => {
    if (!state.vsComputer){ UI.toast(el.toastContainer, 'Undo hanya tersedia saat lawan komputer.', 'error'); return; }
    state.match.undo(); state.match.undo(); // batalkan langkah AI + langkah sendiri
    state.scene.setPosition(state.match.board());
    state.scene.clearHighlights(); state.scene.clearCheck();
    UI.renderMoveHistory(el.moveHistoryList, state.match.history);
    renderHud();
  });

  el.btnZoomIn && el.btnZoomIn.addEventListener('click', () => { sound.click(); state.scene && state.scene.zoomIn(); });
  el.btnZoomOut && el.btnZoomOut.addEventListener('click', () => { sound.click(); state.scene && state.scene.zoomOut(); });

  el.btnMute && el.btnMute.addEventListener('click', () => {
    const muted = !sound.muted;
    sound.setMuted(muted);
    el.btnMute.innerHTML = muted ? '<i class="fa-solid fa-volume-xmark"></i>' : '<i class="fa-solid fa-volume-high"></i>';
  });

  el.btnFullscreen && el.btnFullscreen.addEventListener('click', () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    else document.exitFullscreen();
  });

  el.btnSettings && el.btnSettings.addEventListener('click', () => el.settingsModal.classList.add('open'));

  el.btnExit && el.btnExit.addEventListener('click', () => {
    if (state.timerInterval && state.match && !state.match.isGameOver()){
      if (!confirm('Keluar sekarang akan dianggap KABUR dari permainan. Lanjutkan?')) return;
      if (!state.vsComputer){
        const winner = state.myColor === 'w' ? 'b' : 'w';
        finishRoom(state.roomId, winner, 'abandon');
      }
    }
    exitToLobby();
  });

  $('victoryExitBtn') && $('victoryExitBtn').addEventListener('click', () => {
    UI.closeModal(el.victoryModal);
    exitToLobby();
  });
  $('victoryRematchBtn') && $('victoryRematchBtn').addEventListener('click', () => {
    UI.closeModal(el.victoryModal);
    if (state.vsComputer){
      startComputerGame();
    } else if (state.opponentProfile){
      // PERBAIKAN: sebelumnya tombol "Main Lagi" untuk mode PvP cuma
      // exitToLobby() — sama saja dengan tombol Keluar, TIDAK benar-benar
      // mengirim rematch. Sekarang kirim ulang tantangan sungguhan ke
      // lawan yang sama, pakai kontrol waktu yang sama seperti game barusan.
      const opp = state.opponentProfile;
      const tc = Object.values(UI.TIME_CONTROLS).find(t => t.label === state.timeControlLabel) || UI.TIME_CONTROLS.rapid;
      exitToLobby();
      sendChallenge(opp, tc);
    } else {
      exitToLobby();
    }
  });

  // ---- Reaksi emoji cepat saat main (👍😮😂 dst., hanya mode PvP) ----
  if (el.emotePicker){
    UI.buildEmotePicker(el.emotePicker, {
      onPick: async (emoji) => {
        el.emotePicker.classList.remove('show');
        if (state.vsComputer || !state.roomId){ return; }
        const { db, fns } = state.fb;
        try {
          await fns.updateDoc(fns.doc(db, COL_CHESS_ROOMS, state.roomId), {
            emote: { by: state.myColor, emoji, ts: Date.now() }
          });
        } catch (err){ console.warn('Gagal mengirim reaksi:', err); }
      }
    });
  }
  el.btnEmote && el.btnEmote.addEventListener('click', () => {
    if (state.vsComputer){ UI.toast(el.toastContainer, 'Reaksi hanya tersedia saat lawan player.', 'info'); return; }
    el.emotePicker.classList.toggle('show');
  });
  document.addEventListener('click', (e) => {
    if (el.emotePicker && el.emotePicker.classList.contains('show') &&
        !el.emotePicker.contains(e.target) && e.target !== el.btnEmote && !el.btnEmote?.contains(e.target)){
      el.emotePicker.classList.remove('show');
    }
  });

  // ---- Riwayat Pertandingan Saya ----
  el.btnMatchHistory && el.btnMatchHistory.addEventListener('click', openMatchHistory);

  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => UI.closeModal(btn.closest('.modal-backdrop')));
  });

  el.settingVolume && el.settingVolume.addEventListener('input', (e) => sound.setVolume(parseFloat(e.target.value)));
  el.settingMuted && el.settingMuted.addEventListener('change', (e) => sound.setMuted(e.target.checked));
  el.settingShadow && el.settingShadow.addEventListener('change', (e) => state.scene && state.scene.setShadows(e.target.checked));
  el.settingBloom && el.settingBloom.addEventListener('change', (e) => state.scene && state.scene.setBloom(e.target.checked));
}

function exitToLobby(){
  stopLocalTimerLoop();
  if (state.roomUnsub){ state.roomUnsub(); state.roomUnsub = null; }
  if (state.computer){ state.computer.destroy(); state.computer = null; }
  state.roomId = null; state.opponentProfile = null;
  UI.switchScreen({ lobbyScreen: el.lobby, gameScreen: el.game }, 'lobbyScreen');
}

/* =========================================================
   12. BOOTSTRAP
========================================================= */
async function boot(){
  UI.setLoadingProgress(el.loading, 10, 'Menyiapkan koneksi Firebase…');
  state.fb = await initFirebase();

  UI.setLoadingProgress(el.loading, 35, 'Memuat aturan catur…');
  await loadChessRules();

  UI.setLoadingProgress(el.loading, 55, 'Memeriksa sesi peserta…');
  state.session = readSession();

  let myPlayerRef = null;
  if (state.session){
    el.guestBadge && (el.guestBadge.style.display = 'none');
    el.memberBadge && (el.memberBadge.style.display = 'flex');
    el.btnMatchHistory && (el.btnMatchHistory.style.display = 'flex');
    myPlayerRef = await ensurePlayerDoc();
    startHeartbeat(myPlayerRef);
    listenMyProfile(myPlayerRef);
    listenIncomingChallenges();
  } else {
    el.guestBadge && (el.guestBadge.style.display = 'flex');
    el.memberBadge && (el.memberBadge.style.display = 'none');
  }

  UI.setLoadingProgress(el.loading, 80, 'Memuat papan 3D…');
  listenRanking();
  listenValidPeserta();
  wireGameActions();

  el.searchInput && el.searchInput.addEventListener('input', renderLists);
  el.computerLevelRange && el.computerLevelRange.addEventListener('input', (e) => {
    el.computerLevelValue.textContent = e.target.value;
  });
  el.btnVsComputer && el.btnVsComputer.addEventListener('click', () => {
    if (!state.session){ openGuestLock(); return; }
    document.getElementById('computerLevelPanel').classList.add('open');
  });
  el.btnVsPlayer && el.btnVsPlayer.addEventListener('click', () => {
    if (!state.session){ openGuestLock(); return; }
    el.onlineList && el.onlineList.scrollIntoView({ behavior: 'smooth', block: 'center' });
    UI.toast(el.toastContainer, 'Pilih pemain online lalu klik "Tantang Duel" di profilnya.', 'info');
  });
  el.startComputerBtn && el.startComputerBtn.addEventListener('click', () => {
    document.getElementById('computerLevelPanel').classList.remove('open');
    startComputerGame();
  });

  UI.setLoadingProgress(el.loading, 100, 'Selesai!');
  setTimeout(() => { el.loading && el.loading.classList.add('done'); }, 350);

  if ('serviceWorker' in navigator){
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  // PENTING: pemulihan sesi (reconnect ke room yang masih berjalan, atau
  // reset flag inGame yang nyangkut) dijalankan PALING TERAKHIR, setelah
  // semua tombol aksi dalam game (wireGameActions) sudah ter-pasang —
  // supaya kalau langsung reconnect ke papan, tombol menyerah/remis/keluar
  // sudah berfungsi, bukan mati karena listenernya belum sempat dipasang.
  if (myPlayerRef) await recoverActiveSession(myPlayerRef);
}

boot().catch(err => {
  console.error('[boot] gagal memulai modul catur:', err);
  UI.setLoadingProgress(el.loading, 100, 'Gagal memuat. Periksa koneksi internet lalu muat ulang halaman.');
});
