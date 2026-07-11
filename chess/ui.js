/* =========================================================
   UI.JS — Semua manipulasi DOM/tampilan
   -------------------------------------------------
   File ini TIDAK tahu apa-apa soal Firebase atau aturan catur.
   Tugasnya cuma satu: render data ke DOM & tangani interaksi
   modal/panel. Semua logika data ada di script.js (orkestrator).
========================================================= */

export const TIER_THRESHOLDS = [
  { min: 0,    label: 'Pemula',      color: '#93A2C2' },
  { min: 900,  label: 'Menengah',    color: '#17E6E6' },
  { min: 1200, label: 'Mahir',       color: '#33E29A' },
  { min: 1500, label: 'Ahli',        color: '#9B5CFF' },
  { min: 1800, label: 'Master',      color: '#F2C14E' },
  { min: 2100, label: 'Grandmaster', color: '#FF4361' }
];

export function tierFor(rating){
  let t = TIER_THRESHOLDS[0];
  for (const tier of TIER_THRESHOLDS) if (rating >= tier.min) t = tier;
  return t;
}

export function initials(name = '?'){
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('') || '?';
}

export function statusMeta(status){
  if (status === 'online') return { color: '#33E29A', label: 'Online' };
  if (status === 'idle')   return { color: '#F2C14E', label: 'Idle' };
  return { color: '#5A7186', label: 'Offline' };
}

export function fmtClock(ms){
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2,'0')}:${String(r).padStart(2,'0')}`;
}

export function fmtDate(d){
  if (!d) return '-';
  const date = d.toDate ? d.toDate() : new Date(d);
  return date.toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' });
}

export function fmtPlayTime(ms){
  const totalMin = Math.floor((ms || 0) / 60000);
  if (totalMin < 60) return `${totalMin} menit`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h} jam ${m} menit`;
}

const PIECE_GLYPH = {
  w: { p:'♙', r:'♖', n:'♘', b:'♗', q:'♕', k:'♔' },
  b: { p:'♟', r:'♜', n:'♞', b:'♝', q:'♛', k:'♚' }
};

export function renderCaptured(el, list, color){
  if (!el) return;
  const order = ['q','r','b','n','p'];
  const sorted = [...list].sort((a,b) => order.indexOf(a) - order.indexOf(b));
  el.innerHTML = sorted.map(t => `<span class="captured-piece">${PIECE_GLYPH[color][t]}</span>`).join('');
}

export function renderMoveHistory(el, verboseHistory){
  if (!el) return;
  let html = '';
  for (let i = 0; i < verboseHistory.length; i += 2){
    const num = i / 2 + 1;
    const white = verboseHistory[i]?.san || '';
    const black = verboseHistory[i+1]?.san || '';
    html += `<div class="move-row"><span class="move-num">${num}.</span><span class="move-san">${white}</span><span class="move-san">${black}</span></div>`;
  }
  el.innerHTML = html;
  el.scrollTop = el.scrollHeight;
}

export function setTimerDisplay(el, ms, isActive){
  if (!el) return;
  el.textContent = fmtClock(ms);
  el.classList.toggle('timer-active', !!isActive);
  el.classList.toggle('timer-low', ms <= 60000);
  el.classList.toggle('timer-critical', ms <= 15000);
}

/* ---------------- Ranking & Online list ---------------- */

export function renderRankingList(el, players, { onOpenProfile } = {}){
  if (!el) return;
  if (!players.length){
    el.innerHTML = `<div class="empty-hint">Belum ada data peringkat.</div>`;
    return;
  }
  el.innerHTML = players.map((p, idx) => {
    const tier = tierFor(p.rating);
    const st = statusMeta(p.status);
    const total = p.totalMatch || 0;
    const winrate = total ? Math.round((p.menang / total) * 100) : 0;
    return `
      <div class="rank-row" data-kode="${p.kodeUnik}">
        <span class="rank-pos ${idx < 3 ? 'rank-top' : ''}">${idx + 1}</span>
        <span class="rank-avatar" style="background:${avatarColor(p.kodeUnik)}">${initials(p.nama)}</span>
        <span class="rank-status-dot" style="background:${st.color}" title="${st.label}"></span>
        <span class="rank-name">${escapeHtml(p.nama)}</span>
        <span class="rank-tier" style="color:${tier.color}">${tier.label}</span>
        <span class="rank-rating">${p.rating}</span>
        <span class="rank-wld">${p.menang}/${p.kalah}/${p.seri}</span>
        <span class="rank-winrate">${winrate}%</span>
      </div>`;
  }).join('');

  el.querySelectorAll('.rank-row').forEach(row => {
    row.addEventListener('click', () => {
      const p = players.find(pp => pp.kodeUnik === row.dataset.kode);
      if (p) onOpenProfile && onOpenProfile(p);
    });
  });
}

export function renderOnlineList(el, players, { onOpenProfile, myKode } = {}){
  if (!el) return;
  const others = players.filter(p => p.kodeUnik !== myKode);
  if (!others.length){
    el.innerHTML = `<div class="empty-hint">Belum ada pemain lain online.</div>`;
    return;
  }
  el.innerHTML = others.map(p => {
    const st = statusMeta(p.status);
    return `
      <div class="online-row" data-kode="${p.kodeUnik}">
        <span class="rank-avatar sm" style="background:${avatarColor(p.kodeUnik)}">${initials(p.nama)}</span>
        <span class="rank-status-dot" style="background:${st.color}" title="${st.label}"></span>
        <span class="online-name">${escapeHtml(p.nama)}</span>
        <span class="online-rating">${p.rating}</span>
        <span class="online-badge ${p.inGame ? 'ingame' : ''}">${p.inGame ? 'Sedang Main' : st.label}</span>
      </div>`;
  }).join('');

  el.querySelectorAll('.online-row').forEach(row => {
    row.addEventListener('click', () => {
      const p = others.find(pp => pp.kodeUnik === row.dataset.kode);
      if (p) onOpenProfile && onOpenProfile(p);
    });
  });
}

function avatarColor(seed = ''){
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 62%, 42%)`;
}

function escapeHtml(str = ''){
  return str.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* ---------------- Modal: Profil pemain ---------------- */

export function openProfileModal(modalEl, player, { myKode, onChallenge, canChallenge }){
  if (!modalEl || !player) return;
  const tier = tierFor(player.rating);
  const st = statusMeta(player.status);
  const total = player.totalMatch || 0;
  const winrate = total ? Math.round((player.menang / total) * 100) : 0;

  modalEl.querySelector('[data-f="avatar"]').textContent = initials(player.nama);
  modalEl.querySelector('[data-f="avatar"]').style.background = avatarColor(player.kodeUnik);
  modalEl.querySelector('[data-f="nama"]').textContent = player.nama;
  modalEl.querySelector('[data-f="statusdot"]').style.background = st.color;
  modalEl.querySelector('[data-f="statustext"]').textContent = st.label;
  modalEl.querySelector('[data-f="rating"]').textContent = player.rating;
  const tierEl = modalEl.querySelector('[data-f="tier"]');
  tierEl.textContent = tier.label; tierEl.style.color = tier.color;
  modalEl.querySelector('[data-f="total"]').textContent = total;
  modalEl.querySelector('[data-f="menang"]').textContent = player.menang || 0;
  modalEl.querySelector('[data-f="kalah"]').textContent = player.kalah || 0;
  modalEl.querySelector('[data-f="seri"]').textContent = player.seri || 0;
  modalEl.querySelector('[data-f="kabur"]').textContent = player.kabur || 0;
  modalEl.querySelector('[data-f="winrate"]').textContent = `${winrate}%`;
  modalEl.querySelector('[data-f="joined"]').textContent = fmtDate(player.joinedAt);
  modalEl.querySelector('[data-f="playtime"]').textContent = fmtPlayTime(player.totalPlayMs);
  modalEl.querySelector('[data-f="fairplay"]').style.display = (player.kabur || 0) === 0 && total > 0 ? 'inline-flex' : 'none';

  const badgesEl = modalEl.querySelector('[data-f="badges"]');
  badgesEl.innerHTML = computeAchievements(player).map(b => `<span class="badge-chip" title="${b.desc}">${b.icon} ${b.label}</span>`).join('') || '<span class="empty-hint">Belum ada pencapaian</span>';

  const challengeBtn = modalEl.querySelector('[data-f="challengebtn"]');
  const isSelf = player.kodeUnik === myKode;
  if (isSelf || !canChallenge){
    challengeBtn.style.display = 'none';
  } else {
    challengeBtn.style.display = 'inline-flex';
    challengeBtn.disabled = player.status === 'offline' || player.inGame;
    challengeBtn.textContent = player.inGame ? 'Sedang Bermain' : (player.status === 'offline' ? 'Pemain Offline' : '⚔ Tantang Duel');
    challengeBtn.onclick = () => onChallenge && onChallenge(player);
  }

  modalEl.classList.add('open');
}

export function computeAchievements(player){
  const list = [];
  const total = player.totalMatch || 0;
  const best = player.bestWinStreak || 0;
  if (total >= 100)  list.push({ icon:'🥉', label:'100 Match',  desc:'Bermain 100 pertandingan' });
  if (total >= 500)  list.push({ icon:'🥈', label:'500 Match',  desc:'Bermain 500 pertandingan' });
  if (total >= 1000) list.push({ icon:'🥇', label:'1000 Match', desc:'Bermain 1000 pertandingan' });
  if (best >= 10) list.push({ icon:'🔥', label:'10 Win Streak', desc:'10 kemenangan beruntun' });
  if (best >= 50) list.push({ icon:'⚡', label:'50 Win Streak', desc:'50 kemenangan beruntun' });
  const tier = tierFor(player.rating);
  if (tier.label === 'Master')      list.push({ icon:'👑', label:'Master',      desc:'Rating 1800+' });
  if (tier.label === 'Grandmaster') list.push({ icon:'💎', label:'Grandmaster', desc:'Rating 2100+' });
  if ((player.kabur || 0) === 0 && total >= 10) list.push({ icon:'🛡️', label:'Fair Play', desc:'Tidak pernah kabur dari permainan' });
  return list;
}

export function closeModal(modalEl){ modalEl && modalEl.classList.remove('open'); }

/* ---------------- Toast tantangan duel ---------------- */

export function showChallengeToast(container, fromPlayer, { onAccept, onReject, autoExpireMs = 30000 } = {}){
  const el = document.createElement('div');
  el.className = 'challenge-toast';
  el.innerHTML = `
    <div class="challenge-toast-head">
      <span class="rank-avatar sm" style="background:${avatarColor(fromPlayer.kodeUnik)}">${initials(fromPlayer.nama)}</span>
      <div>
        <div class="challenge-toast-name">${escapeHtml(fromPlayer.nama)}</div>
        <div class="challenge-toast-sub">Rating ${fromPlayer.rating} • Menantang duel!</div>
      </div>
    </div>
    <div class="challenge-toast-bar"><div class="challenge-toast-bar-fill"></div></div>
    <div class="challenge-toast-actions">
      <button class="btn-mini btn-reject">Tolak</button>
      <button class="btn-mini btn-accept">Terima</button>
    </div>`;
  container.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));

  const fill = el.querySelector('.challenge-toast-bar-fill');
  fill.style.transition = `width ${autoExpireMs}ms linear`;
  requestAnimationFrame(() => { fill.style.width = '0%'; });

  const remove = () => { el.classList.remove('show'); setTimeout(() => el.remove(), 350); };
  const timer = setTimeout(() => { onReject && onReject(); remove(); }, autoExpireMs);

  el.querySelector('.btn-accept').onclick = () => { clearTimeout(timer); onAccept && onAccept(); remove(); };
  el.querySelector('.btn-reject').onclick = () => { clearTimeout(timer); onReject && onReject(); remove(); };
}

/* ---------------- Toast umum ---------------- */

export function toast(container, message, type = 'info'){
  const el = document.createElement('div');
  el.className = `mini-toast mini-toast-${type}`;
  el.textContent = message;
  container.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 3200);
}

/* ---------------- Modal kemenangan/kekalahan ---------------- */

export function showVictoryModal(modalEl, { outcome, reason, ratingDelta, vsComputer }){
  const titleEl = modalEl.querySelector('[data-f="title"]');
  const subEl = modalEl.querySelector('[data-f="subtitle"]');
  const deltaEl = modalEl.querySelector('[data-f="delta"]');

  modalEl.classList.remove('outcome-win','outcome-lose','outcome-draw');
  if (outcome === 'win'){ titleEl.textContent = 'KEMENANGAN!'; modalEl.classList.add('outcome-win'); }
  else if (outcome === 'lose'){ titleEl.textContent = 'KALAH'; modalEl.classList.add('outcome-lose'); }
  else { titleEl.textContent = 'REMIS'; modalEl.classList.add('outcome-draw'); }

  const reasonLabel = {
    checkmate: 'Skakmat', timeout: 'Waktu habis', resign: 'Menyerah',
    abandon: 'Lawan kabur dari permainan', stalemate: 'Stalemate', draw_agree: 'Sepakat remis',
    draw_rule: 'Remis (aturan repetisi/50 langkah)'
  }[reason] || reason;
  subEl.textContent = reasonLabel;

  if (vsComputer){
    deltaEl.textContent = 'Mode lawan komputer — rating tidak berubah';
  } else {
    const sign = ratingDelta > 0 ? '+' : '';
    deltaEl.textContent = `Rating ${sign}${ratingDelta}`;
    deltaEl.className = ratingDelta >= 0 ? 'delta-positive' : 'delta-negative';
  }

  modalEl.classList.add('open');
}

/* ---------------- Loading & panel switching ---------------- */

export function setLoadingProgress(el, pct, label){
  if (!el) return;
  const bar = el.querySelector('[data-f="bar"]');
  const txt = el.querySelector('[data-f="label"]');
  if (bar) bar.style.width = `${pct}%`;
  if (txt && label) txt.textContent = label;
}

export function switchScreen(screens, activeId){
  Object.entries(screens).forEach(([id, el]) => {
    if (!el) return;
    el.classList.toggle('active', id === activeId);
  });
  document.body.classList.toggle('in-game', activeId === 'gameScreen');
}
