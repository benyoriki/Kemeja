/* =========================================================
   EFFECTS.JS — Papan & Bidak Catur 3D + Semua Efek Visual
   -------------------------------------------------
   CATATAN DESAIN: Bidak & papan dibuat PROSEDURAL (digabung
   dari bentuk geometri primitif: silinder, bola, kerucut,
   torus) langsung lewat kode Three.js — BUKAN memuat file
   model .glb. Ini disengaja: file model 3D biner (.glb) tidak
   bisa dihasilkan lewat kode teks, dan menaruh file .glb
   kosong/rusak di repo hanya akan membuat papan gagal tampil
   sama sekali. Pendekatan prosedural ini menjamin papan &
   bidak 3D SUNGGUHAN langsung tampil di semua browser tanpa
   perlu meng-hosting file model tambahan.

   Ingin ganti ke model .glb buatan sendiri nanti? Tinggal
   taruh file di chess/assets/ lalu ganti fungsi createPiece()
   di bawah dengan GLTFLoader — arsitektur sudah disiapkan
   supaya penggantian itu mudah (lihat komentar di createPiece).

   -------------------------------------------------
   CATATAN PERFORMA (revisi optimasi):
   Efek visual (glow, bloom, partikel) TIDAK dikurangi — yang
   diubah hanya CARA kerjanya di balik layar supaya lebih ringan:

   1) 64 petak papan sekarang 1 InstancedMesh per warna (dulu 64
      mesh terpisah = 64 draw call, sekarang cuma 2) — beban GPU
      turun signifikan terutama di HP.
   2) Semua partikel (ledakan tangkap, jejak langkah) memakai
      POOL yang dipakai ulang, bukan dibuat & dibuang tiap kali
      ada langkah/tangkapan. Sebelumnya tiap efek bikin buffer
      geometry + material baru lalu di-dispose ~0.5 detik
      kemudian — itu memicu gerakan "patah" (GC stutter) tepat
      saat momen paling seru (menangkap bidak). Sekarang nol
      alokasi baru saat bermain.
   3) Render loop otomatis berhenti total saat tab/HP disembunyikan
      (auto pause) — baterai & CPU tidak terkuras saat game dibuka
      di tab belakang.
   4) Kualitas (resolusi bloom, shadow map, partikel ambient, GPU
      power preference) menyesuaikan otomatis: HP/perangkat 4-core
      ke bawah dapat beban lebih ringan, PC tetap dapat kualitas
      penuh — perilaku ini sudah ada sebelumnya, sekarang sedikit
      lebih agresif di sisi HP tanpa terlihat "murahan".
========================================================= */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const FILES = ['a','b','c','d','e','f','g','h'];
const SQUARE_SIZE = 1;
const BOARD_HALF = (SQUARE_SIZE * 8) / 2;

function squareToXZ(square){
  const file = FILES.indexOf(square[0]);
  const rank = parseInt(square[1], 10) - 1;
  const x = (file - 3.5) * SQUARE_SIZE;
  const z = (3.5 - rank) * SQUARE_SIZE;
  return { x, z };
}

function easeInOutQuad(t){ return t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t+2, 2)/2; }
function easeOutBack(t){ const c1=1.70158, c3=c1+1; return 1+c3*Math.pow(t-1,3)+c1*Math.pow(t-1,2); }

export class Chess3DScene{
  constructor(container, opts = {}){
    this.container = container;
    this.onSquareClick = opts.onSquareClick || (() => {});
    this.orientation = 'w'; // sisi kamera menghadap warna ini di bawah
    this.squareMeshes = new Map();   // square -> mesh petak (kompat lama, tidak dipakai render)
    this.pieceMeshes = new Map();    // square -> group bidak
    this.highlightGroup = null;
    this.checkRing = null;
    this._tweens = [];
    this._raf = null;
    this._paused = false;
    this.quality = { bloom: true, shadows: true };
  }

  async init(){
    const el = this.container;
    const w = el.clientWidth, h = el.clientHeight;

    // --- Deteksi perangkat: turunkan beban render di HP/tablet, tetap penuh di PC ---
    const isCoarse = window.matchMedia('(pointer: coarse)').matches;
    const lowCores = (navigator.hardwareConcurrency || 4) <= 4;
    this._lite = isCoarse || lowCores;
    const dprCap = this._lite ? 1.5 : 2;
    const shadowSize = this._lite ? 1024 : 2048;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0d1526);
    this.scene.fog = new THREE.FogExp2(0x0d1526, 0.028);

    this.camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 100);
    this._setCameraForOrientation('w', true);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this._lite, alpha: false,
      powerPreference: this._lite ? 'low-power' : 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, dprCap));
    this.renderer.setSize(w, h);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = this._lite ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    el.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 4.2;
    this.controls.maxDistance = 26;
    this.controls.minPolarAngle = 0.35;
    this.controls.maxPolarAngle = 1.15;
    this.controls.enablePan = false;
    this.controls.target.set(0, 0, 0);

    this._setupLights(shadowSize);
    this._setupBoard();
    this._setupAmbientParticles();
    this._setupParticlePools();
    this._setupComposer(w, h);
    this._setupRaycast();

    this._onResize = () => this._scheduleResize();
    window.addEventListener('resize', this._onResize);
    this._onVisibility = () => this._handleVisibility();
    document.addEventListener('visibilitychange', this._onVisibility);

    this._animate();
  }

  _setupLights(shadowSize = 2048){
    const hemi = new THREE.HemisphereLight(0xd8ecff, 0x3d4b72, 1.25);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xffffff, 2.1);
    sun.position.set(6, 10, 4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(shadowSize, shadowSize);
    sun.shadow.camera.left = -7; sun.shadow.camera.right = 7;
    sun.shadow.camera.top = 7; sun.shadow.camera.bottom = -7;
    sun.shadow.bias = -0.0015;
    this.scene.add(sun);
    this.sun = sun;

    const fill = new THREE.AmbientLight(0x8a97c4, 0.75);
    this.scene.add(fill);

    const cyan = new THREE.PointLight(0x17e6e6, 6, 14, 2);
    cyan.position.set(-6, 3.2, -6);
    this.scene.add(cyan);

    const violet = new THREE.PointLight(0x9b5cff, 6, 14, 2);
    violet.position.set(6, 3.2, 6);
    this.scene.add(violet);

    this._cyanLight = cyan; this._violetLight = violet;
  }

  _setupBoard(){
    const boardGroup = new THREE.Group();

    // Alas / dasar panggung
    const baseGeo = new THREE.CylinderGeometry(6.4, 6.7, 0.5, 48);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x161d30, metalness: 0.55, roughness: 0.38 });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = -0.42;
    base.receiveShadow = true;
    boardGroup.add(base);

    // Cincin neon di tepi alas (elemen ciri khas — energy ring)
    const ringGeo = new THREE.TorusGeometry(6.55, 0.035, 12, 96);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x17e6e6, emissive: 0x17e6e6, emissiveIntensity: 2.2, metalness: 0.2, roughness: 0.3 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.16;
    boardGroup.add(ring);
    this._energyRing = ring;

    // Bingkai papan
    const frameGeo = new THREE.BoxGeometry(9.2, 0.32, 9.2);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x232c46, metalness: 0.5, roughness: 0.42 });
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.position.y = -0.16;
    frame.receiveShadow = true;
    frame.castShadow = true;
    boardGroup.add(frame);

    // 64 petak — DIGABUNG jadi 2 InstancedMesh (terang/gelap) alih-alih 64
    // mesh terpisah. Sama persis secara visual, tapi draw call turun dari
    // 64 jadi 2 → beban GPU jauh lebih ringan, khususnya di HP.
    const lightMat = new THREE.MeshStandardMaterial({ color: 0x4a6087, metalness: 0.2, roughness: 0.48 });
    const darkMat  = new THREE.MeshStandardMaterial({ color: 0x1a2338, metalness: 0.3, roughness: 0.42 });
    const squareGeo = new THREE.BoxGeometry(SQUARE_SIZE * 0.97, 0.12, SQUARE_SIZE * 0.97);

    const lightMesh = new THREE.InstancedMesh(squareGeo, lightMat, 32);
    const darkMesh  = new THREE.InstancedMesh(squareGeo, darkMat, 32);
    lightMesh.receiveShadow = true;
    darkMesh.receiveShadow = true;
    lightMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    darkMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);

    const dummy = new THREE.Object3D();
    this._squareByInstance = { light: new Array(32), dark: new Array(32) };
    let li = 0, di = 0;

    for (let f = 0; f < 8; f++){
      for (let r = 0; r < 8; r++){
        const square = FILES[f] + (r + 1);
        const isLight = (f + r) % 2 === 1;
        const { x, z } = squareToXZ(square);
        dummy.position.set(x, 0, z);
        dummy.updateMatrix();
        if (isLight){
          lightMesh.setMatrixAt(li, dummy.matrix);
          this._squareByInstance.light[li] = square;
          li++;
        } else {
          darkMesh.setMatrixAt(di, dummy.matrix);
          this._squareByInstance.dark[di] = square;
          di++;
        }
        // Peta square->posisi tetap disimpan (ringan, cuma {x,z}) untuk
        // dipakai highlight/animasi langkah — tidak perlu mesh sungguhan.
        this.squareMeshes.set(square, { userData: { square, baseY: 0 }, position: { x, y: 0, z } });
      }
    }
    lightMesh.instanceMatrix.needsUpdate = true;
    darkMesh.instanceMatrix.needsUpdate = true;

    boardGroup.add(lightMesh, darkMesh);
    this._boardLightMesh = lightMesh;
    this._boardDarkMesh = darkMesh;

    // Plakat nama di sisi kanan & kiri papan (menyatu dengan alas board,
    // dibuat dari canvas texture ringan — tidak menambah draw call berarti).
    this._addSidePlaques(boardGroup);

    this.boardGroup = boardGroup;
    this.scene.add(boardGroup);

    this.pieceLayer = new THREE.Group();
    this.scene.add(this.pieceLayer);

    this.highlightGroup = new THREE.Group();
    this.scene.add(this.highlightGroup);
  }

  /**
   * Papan sponsor berdiri di sisi kanan & kiri board — seperti papan iklan
   * di pinggir lapangan sepak bola. Dibangun dari satu CanvasTexture per
   * papan (bukan model 3D/font-loader), jadi tetap ringan di HP maupun PC.
   * Panel menghadap ke tengah board (arah kamera default) supaya terbaca,
   * dan posisinya dihitung supaya kedua ujung panel tetap berada di atas
   * alas bulat (tidak melayang di luar lingkaran base).
   * GANTI teks di sini bila suatu saat perlu diperbarui.
   */
  _addSidePlaques(boardGroup){
    const roundedRectPath = (ctx, x, y, w, h, r) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    };

    // panjang papan di dunia nyata (sepanjang sisi board, sumbu Z) &
    // tinggi papan (sumbu Y) — rasio ini dipakai supaya teks di canvas
    // tidak gepeng/melar saat dipetakan ke plane.
    const boardLen = 7.2, boardHeight = 0.95;

    const makePlaque = (lines, xPos, faceSign) => {
      const cw = 2400, ch = Math.round(cw * (boardHeight / boardLen));
      const canvas = document.createElement('canvas');
      canvas.width = cw; canvas.height = ch;
      const ctx = canvas.getContext('2d');

      const draw = () => {
        ctx.clearRect(0, 0, cw, ch);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Cari ukuran font terbesar yang muat (baris terpanjang & tinggi blok).
        let size = 220, lineHeight = 0;
        const maxW = cw - 160;
        const maxBlockH = ch - 46;
        for (;;){
          ctx.font = `700 ${size}px Outfit, sans-serif`;
          const maxLineW = Math.max(...lines.map(l => ctx.measureText(l).width));
          lineHeight = size * 1.12;
          const blockH = lineHeight * lines.length;
          if ((maxLineW <= maxW && blockH <= maxBlockH) || size <= 16) break;
          size -= 2;
        }

        const cx = cw / 2, cy = ch / 2;
        const startY = cy - ((lines.length - 1) * lineHeight) / 2;
        const maxLineW = Math.max(...lines.map(l => ctx.measureText(l).width));

        // Alas panel — lempeng gelap + tepi emas, kesan papan sponsor logam.
        roundedRectPath(ctx, 10, 10, cw - 20, ch - 20, 22);
        ctx.fillStyle = 'rgba(9,15,30,0.55)';
        ctx.fill();
        ctx.lineWidth = 5;
        ctx.strokeStyle = 'rgba(242,193,78,0.6)';
        ctx.stroke();
        // Garis aksen tipis kedua di dalamnya — kesan bingkai ganda/premium.
        roundedRectPath(ctx, 22, 22, cw - 44, ch - 44, 16);
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(23,230,230,0.4)';
        ctx.stroke();

        ctx.shadowColor = 'rgba(23,230,230,0.85)';
        ctx.shadowBlur = 22;
        ctx.fillStyle = '#F2C14E';
        lines.forEach((line, i) => ctx.fillText(line, cx, startY + i * lineHeight));
        ctx.shadowBlur = 0;
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(23,230,230,0.35)';
        lines.forEach((line, i) => ctx.strokeText(line, cx, startY + i * lineHeight));
      };
      draw();

      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;

      // Kalau font "Outfit" belum sempat termuat saat draw pertama,
      // gambar ulang begitu font siap (tetap 1x saja, tidak per-frame).
      if (document.fonts && document.fonts.load){
        document.fonts.load('700 200px Outfit').then(() => {
          draw();
          tex.needsUpdate = true;
        }).catch(() => {});
      }

      const group = new THREE.Group();

      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
      const geo = new THREE.PlaneGeometry(boardLen, boardHeight);
      const panel = new THREE.Mesh(geo, mat);
      // faceSign menentukan arah hadap panel: -1 → menghadap -X (dipakai
      // panel di sisi kanan, x positif, agar menghadap ke tengah board),
      // +1 → menghadap +X (panel di sisi kiri, x negatif).
      panel.rotation.y = faceSign * Math.PI / 2;
      panel.position.y = 0.02;
      group.add(panel);

      // Rel tipis di kaki panel — kesan dudukan/penyangga papan sponsor,
      // sekaligus menyatu dengan cahaya neon tema board.
      const railMat = new THREE.MeshStandardMaterial({
        color: 0x1c2438, emissive: 0x17e6e6, emissiveIntensity: 0.9, metalness: 0.4, roughness: 0.4
      });
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, boardLen - 0.1), railMat);
      rail.position.y = -0.46;
      group.add(rail);

      group.position.set(xPos, 0.32, 0);
      return group;
    };

    // Sisi kanan (mengarah ke file h saat orientasi putih di bawah) —
    // panel menghadap -X (ke tengah board).
    boardGroup.add(makePlaque(['PT. LOKON PRIMA DEPO PARUNG', 'ARENA DUEL CATUR'], 5.15, -1));
    // Sisi kiri (mengarah ke file a) — panel menghadap +X (ke tengah board).
    boardGroup.add(makePlaque(['WEBSITE DEVELOPER @BENYORIKI'], -5.15, 1));
  }

  _setupAmbientParticles(){
    const COUNT = this._lite ? 80 : 140;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(COUNT * 3);
    const speeds = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++){
      positions[i*3]     = (Math.random() - 0.5) * 14;
      positions[i*3 + 1] = Math.random() * 5 + 0.5;
      positions[i*3 + 2] = (Math.random() - 0.5) * 14;
      speeds[i] = 0.05 + Math.random() * 0.12;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0x8fd9ff, size: 0.028, transparent: true, opacity: 0.45,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    this.scene.add(points);
    this._ambientParticles = { points, speeds, positions };
  }

  /**
   * Kolam (pool) partikel yang dipakai ulang untuk efek ledakan tangkap
   * & jejak langkah. Dulu tiap efek bikin BufferGeometry + PointsMaterial
   * baru lalu membuangnya ~0.3–0.65 detik kemudian — itu memicu garbage
   * collection tepat saat animasi paling penting berjalan (kelihatan
   * seperti "nge-lag" sesaat). Sekarang setiap slot dipakai bergiliran
   * (round-robin) dan tidak pernah benar-benar dibuang selama scene hidup.
   */
  _setupParticlePools(){
    const MAX_BURST = 40;
    const burstSlots = this._lite ? 4 : 8;
    this._burstPool = [];
    for (let s = 0; s < burstSlots; s++){
      const geo = new THREE.BufferGeometry();
      const positions = new Float32Array(MAX_BURST * 3);
      const attr = new THREE.BufferAttribute(positions, 3);
      attr.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('position', attr);
      geo.setDrawRange(0, 0);
      const mat = new THREE.PointsMaterial({ size: 0.09, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
      const points = new THREE.Points(geo, mat);
      points.visible = false;
      points.frustumCulled = false;
      this.scene.add(points);
      this._burstPool.push({ points, geo, mat, velocities: [], token: 0 });
    }
    this._burstCursor = 0;

    const MAX_TRAIL = 12;
    const trailSlots = this._lite ? 3 : 6;
    this._trailPool = [];
    for (let s = 0; s < trailSlots; s++){
      const geo = new THREE.BufferGeometry();
      const positions = new Float32Array(MAX_TRAIL * 3);
      const attr = new THREE.BufferAttribute(positions, 3);
      attr.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('position', attr);
      const mat = new THREE.PointsMaterial({ color: 0x8fe9ff, size: 0.06, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
      const points = new THREE.Points(geo, mat);
      points.visible = false;
      points.frustumCulled = false;
      this.scene.add(points);
      this._trailPool.push({ points, geo, mat, token: 0 });
    }
    this._trailCursor = 0;
  }

  _setupComposer(w, h){
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    const bloomScale = this._lite ? 0.55 : 1;
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(w * bloomScale, h * bloomScale), 0.4, 0.4, 0.62);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());
  }

  _setupRaycast(){
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    let downX = 0, downY = 0;
    const dom = this.renderer.domElement;

    dom.addEventListener('pointerdown', (e) => { downX = e.clientX; downY = e.clientY; });
    dom.addEventListener('pointerup', (e) => {
      const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
      if (moved > 6) return; // itu drag kamera, bukan klik petak
      const rect = dom.getBoundingClientRect();
      this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const targets = [this._boardLightMesh, this._boardDarkMesh];
      const hits = this.raycaster.intersectObjects(targets, false);
      if (!hits.length) return;
      const hit = hits[0];
      const list = hit.object === this._boardLightMesh ? this._squareByInstance.light : this._squareByInstance.dark;
      const square = list[hit.instanceId];
      if (square) this.onSquareClick(square);
    });
  }

  _setCameraForOrientation(color, instant){
    const aspect = this.container.clientWidth / Math.max(1, this.container.clientHeight);
    // Layar sempit/portrait (HP) butuh jarak kamera lebih jauh supaya papan
    // tidak terpotong di kiri-kanan; layar lebar (PC/tablet) tetap dekat.
    const dist = aspect < 0.55 ? 12.5 : aspect < 0.8 ? 10.5 : 8.4;
    const height = aspect < 0.55 ? 10.8 : aspect < 0.8 ? 9.2 : 7.6;
    const pos = color === 'w' ? { x: 0, y: height, z: dist } : { x: 0, y: height, z: -dist };
    if (instant || !this.camera){
      this.camera && this.camera.position.set(pos.x, pos.y, pos.z);
      this.camera && this.camera.lookAt(0, 0, 0);
      return;
    }
    const start = this.camera.position.clone();
    this._tweenValue(0, 1, 900, easeInOutQuad, (t) => {
      this.camera.position.lerpVectors(start, new THREE.Vector3(pos.x, pos.y, pos.z), t);
      this.camera.lookAt(0, 0, 0);
    });
  }

  setOrientation(color){
    this.orientation = color;
    this._setCameraForOrientation(color, false);
  }

  /** Dolly kamera masuk/keluar sepanjang garis pandang saat ini (dipakai tombol zoom di dock). */
  zoomBy(factor){
    const cam = this.camera, target = this.controls.target;
    const dir = new THREE.Vector3().subVectors(cam.position, target);
    const dist = dir.length();
    const newDist = Math.min(this.controls.maxDistance, Math.max(this.controls.minDistance, dist * factor));
    dir.setLength(newDist);
    const from = cam.position.clone();
    const to = new THREE.Vector3().addVectors(target, dir);
    this._tweenValue(0, 1, 260, easeInOutQuad, (t) => {
      cam.position.lerpVectors(from, to, t);
    });
  }
  zoomIn(){ this.zoomBy(0.82); }
  zoomOut(){ this.zoomBy(1.22); }

  /* ---------------- Bidak (dibuat prosedural) ---------------- */

  /**
   * Bangun mesh satu bidak. GANTI FUNGSI INI dengan GLTFLoader
   * bila suatu saat Anda punya file assets/pieces.glb sendiri —
   * cukup return sebuah THREE.Group berisi model yang dimuat.
   */
  createPiece(type, color){
    const isWhite = color === 'w';
    const mat = new THREE.MeshStandardMaterial({
      color: isWhite ? 0xEDEFF3 : 0x717CAD,
      metalness: isWhite ? 0.08 : 0.22,
      roughness: isWhite ? 0.48 : 0.46,
      emissive: isWhite ? 0x0d1520 : 0x3a2570,
      emissiveIntensity: isWhite ? 0.04 : 0.42
    });
    const group = new THREE.Group();
    const add = (geo, y) => { const m = new THREE.Mesh(geo, mat); m.position.y = y; m.castShadow = true; m.receiveShadow = true; group.add(m); return m; };

    const base = add(new THREE.CylinderGeometry(0.24, 0.28, 0.1, 24), 0.05);
    add(new THREE.CylinderGeometry(0.16, 0.22, 0.14, 24), 0.16);

    switch (type){
      case 'p': // pion
        add(new THREE.SphereGeometry(0.15, 20, 16), 0.36);
        break;
      case 'r': // benteng
        add(new THREE.CylinderGeometry(0.19, 0.19, 0.42, 20), 0.42);
        { const crown = add(new THREE.CylinderGeometry(0.22, 0.22, 0.1, 8), 0.66); crown.rotation.y = Math.PI/8; }
        break;
      case 'n': { // kuda (stilisasi kepala L)
        add(new THREE.CylinderGeometry(0.16, 0.2, 0.4, 18), 0.4);
        const head = add(new THREE.BoxGeometry(0.16, 0.28, 0.34), 0.66);
        head.position.z = 0.06;
        head.rotation.x = -0.25;
        const nose = add(new THREE.BoxGeometry(0.12, 0.14, 0.18), 0.68);
        nose.position.z = 0.2;
        break;
      }
      case 'b': // gajah/uskup
        add(new THREE.ConeGeometry(0.19, 0.5, 22), 0.5);
        add(new THREE.SphereGeometry(0.09, 16, 12), 0.82);
        break;
      case 'q': // menteri
        add(new THREE.CylinderGeometry(0.1, 0.22, 0.58, 22), 0.55);
        add(new THREE.TorusGeometry(0.19, 0.045, 10, 24), 0.86);
        add(new THREE.SphereGeometry(0.09, 16, 12), 0.98);
        break;
      case 'k': // raja
        add(new THREE.CylinderGeometry(0.1, 0.22, 0.62, 22), 0.57);
        add(new THREE.TorusGeometry(0.2, 0.04, 10, 24), 0.9);
        add(new THREE.BoxGeometry(0.06, 0.2, 0.06), 1.06);
        add(new THREE.BoxGeometry(0.16, 0.06, 0.06), 1.03);
        break;
    }

    group.userData.type = type;
    group.userData.color = color;
    group.scale.setScalar(0.92);
    return group;
  }

  /** Set seluruh posisi papan dari array chess.js board() (8x8, baris a8..h1). */
  setPosition(boardArray){
    this.pieceLayer.clear();
    this.pieceMeshes.clear();
    for (let r = 0; r < 8; r++){
      for (let f = 0; f < 8; f++){
        const cell = boardArray[r][f];
        if (!cell) continue;
        const file = FILES[f];
        const rank = 8 - r;
        const square = file + rank;
        const piece = this.createPiece(cell.type, cell.color);
        const { x, z } = squareToXZ(square);
        piece.position.set(x, 0.12, z);
        this.pieceLayer.add(piece);
        this.pieceMeshes.set(square, piece);
      }
    }
  }

  /**
   * Animasikan satu langkah secara visual (dipanggil SETELAH chess.js
   * memvalidasi langkah). Mengembalikan Promise yang selesai saat animasi beres.
   */
  async animateMove({ from, to, captured, promotion, color }){
    const moving = this.pieceMeshes.get(from);
    if (!moving) return;

    // Bidak lawan yang tertangkap di petak tujuan: animasikan hancur/terpental dulu.
    const victim = this.pieceMeshes.get(to);
    if (victim && captured){
      await this._animateCapture(victim, to);
      this.pieceMeshes.delete(to);
    }

    const startXZ = squareToXZ(from);
    const endXZ = squareToXZ(to);
    const startPos = moving.position.clone();
    const arcHeight = 0.55;

    await new Promise((resolve) => {
      this._tweenValue(0, 1, 380, easeInOutQuad, (t) => {
        moving.position.x = startXZ.x + (endXZ.x - startXZ.x) * t;
        moving.position.z = startXZ.z + (endXZ.z - startXZ.z) * t;
        moving.position.y = startPos.y + Math.sin(Math.PI * t) * arcHeight;
        moving.rotation.y = Math.sin(Math.PI * t) * 0.15;
      }, () => {
        moving.position.set(endXZ.x, 0.12, endXZ.z);
        moving.rotation.y = 0;
        resolve();
      });
      this._emitTrailParticles(startXZ, endXZ);
    });

    this.pieceMeshes.delete(from);
    this.pieceMeshes.set(to, moving);

    // Promosi: ganti mesh pion jadi bidak baru dengan kilatan cahaya.
    if (promotion){
      this.pieceLayer.remove(moving);
      const promoted = this.createPiece(promotion, color);
      promoted.position.set(endXZ.x, 0.12, endXZ.z);
      promoted.scale.setScalar(0.01);
      this.pieceLayer.add(promoted);
      this.pieceMeshes.set(to, promoted);
      this._emitBurst(endXZ, 0xF2C14E, 26);
      await new Promise((resolve) => {
        this._tweenValue(0, 1, 420, easeOutBack, (t) => {
          promoted.scale.setScalar(0.01 + 0.91 * t);
        }, resolve);
      });
    }
  }

  async _animateCapture(victimMesh, square){
    const xz = squareToXZ(square);
    this._emitBurst(xz, 0xff4361, 30);
    await new Promise((resolve) => {
      const startY = victimMesh.position.y;
      this._tweenValue(0, 1, 300, easeInOutQuad, (t) => {
        victimMesh.position.y = startY + t * 1.1;
        victimMesh.scale.setScalar(1 - t);
        victimMesh.rotation.y += 0.25;
      }, () => {
        this.pieceLayer.remove(victimMesh);
        resolve();
      });
    });
  }

  /* ---------------- Highlight & indikator ---------------- */

  clearHighlights(){
    while (this.highlightGroup.children.length) this.highlightGroup.remove(this.highlightGroup.children[0]);
  }

  highlightSelected(square){
    this.clearHighlights();
    if (!square) return;
    const { x, z } = squareToXZ(square);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.48, 32),
      new THREE.MeshBasicMaterial({ color: 0x17e6e6, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.14, z);
    this.highlightGroup.add(ring);
  }

  showLegalMoves(moves){
    moves.forEach(m => {
      const { x, z } = squareToXZ(m.to);
      let mesh;
      if (m.captured){
        mesh = new THREE.Mesh(
          new THREE.RingGeometry(0.38, 0.46, 28),
          new THREE.MeshBasicMaterial({ color: 0xff4361, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
        );
      } else {
        mesh = new THREE.Mesh(
          new THREE.CircleGeometry(0.13, 24),
          new THREE.MeshBasicMaterial({ color: 0x17e6e6, transparent: true, opacity: 0.65 })
        );
      }
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, 0.14, z);
      this.highlightGroup.add(mesh);
    });
  }

  showLastMove(from, to){
    [from, to].forEach(sq => {
      const { x, z } = squareToXZ(sq);
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.97, 0.97),
        new THREE.MeshBasicMaterial({ color: 0xF2C14E, transparent: true, opacity: 0.22, side: THREE.DoubleSide })
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, 0.13, z);
      this.highlightGroup.add(mesh);
    });
  }

  showCheck(square){
    this.clearCheck();
    if (!square) return;
    const { x, z } = squareToXZ(square);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.3, 0.5, 32),
      new THREE.MeshBasicMaterial({ color: 0xff2244, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.15, z);
    this.scene.add(ring);
    this.checkRing = ring;
  }

  clearCheck(){
    if (this.checkRing){ this.scene.remove(this.checkRing); this.checkRing = null; }
  }

  /* ---------------- Partikel efek (pakai pool, lihat _setupParticlePools) ---------------- */

  _emitBurst(xz, color, count = 24){
    const pool = this._burstPool;
    const slot = pool[this._burstCursor];
    this._burstCursor = (this._burstCursor + 1) % pool.length;
    const myToken = ++slot.token; // batalkan animasi lama di slot ini kalau dipakai ulang lebih cepat dari durasinya

    const capacity = slot.geo.attributes.position.count;
    const n = Math.min(count, capacity);
    slot.mat.color.set(color);
    slot.geo.setDrawRange(0, n);

    const positions = slot.geo.attributes.position.array;
    const velocities = slot.velocities;
    for (let i = 0; i < n; i++){
      positions[i*3] = xz.x; positions[i*3+1] = 0.3; positions[i*3+2] = xz.z;
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.02 + Math.random() * 0.05;
      velocities[i] = velocities[i] || {};
      velocities[i].x = Math.cos(angle) * speed;
      velocities[i].y = 0.04 + Math.random() * 0.08;
      velocities[i].z = Math.sin(angle) * speed;
    }
    slot.geo.attributes.position.needsUpdate = true;
    slot.mat.opacity = 1;
    slot.points.visible = true;

    const start = performance.now();
    const duration = 650;
    const step = () => {
      if (slot.token !== myToken) return; // slot sudah dipakai efek lain, hentikan loop lama
      const t = (performance.now() - start) / duration;
      if (t >= 1){ slot.points.visible = false; return; }
      const pos = slot.geo.attributes.position;
      for (let i = 0; i < n; i++){
        pos.array[i*3]   += velocities[i].x;
        pos.array[i*3+1] += velocities[i].y;
        pos.array[i*3+2] += velocities[i].z;
        velocities[i].y -= 0.0025; // gravitasi ringan
      }
      pos.needsUpdate = true;
      slot.mat.opacity = 1 - t;
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  _emitTrailParticles(startXZ, endXZ){
    const pool = this._trailPool;
    const slot = pool[this._trailCursor];
    this._trailCursor = (this._trailCursor + 1) % pool.length;
    const myToken = ++slot.token;

    const count = slot.geo.attributes.position.count;
    const positions = slot.geo.attributes.position.array;
    for (let i = 0; i < count; i++){
      const t = i / count;
      positions[i*3]   = startXZ.x + (endXZ.x - startXZ.x) * t;
      positions[i*3+1] = 0.15;
      positions[i*3+2] = startXZ.z + (endXZ.z - startXZ.z) * t;
    }
    slot.geo.attributes.position.needsUpdate = true;
    slot.mat.opacity = 0.7;
    slot.points.visible = true;

    const start = performance.now();
    const step = () => {
      if (slot.token !== myToken) return;
      const t = (performance.now() - start) / 400;
      if (t >= 1){ slot.points.visible = false; return; }
      slot.mat.opacity = 0.7 * (1 - t);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /** Confetti kemenangan — hujan partikel tiga warna dari atas papan (jarang terjadi, sekali per match: tetap satu-kali pakai, jumlah menyesuaikan perangkat). */
  celebrateVictory(){
    const COUNT = this._lite ? 130 : 220;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(COUNT * 3);
    const velocities = [];
    const colors = new Float32Array(COUNT * 3);
    const palette = [new THREE.Color(0x17e6e6), new THREE.Color(0x9b5cff), new THREE.Color(0xF2C14E)];
    for (let i = 0; i < COUNT; i++){
      positions[i*3]   = (Math.random() - 0.5) * 8;
      positions[i*3+1] = 5 + Math.random() * 3;
      positions[i*3+2] = (Math.random() - 0.5) * 8;
      velocities.push({ x: (Math.random()-0.5)*0.02, y: -(0.03 + Math.random()*0.04), z: (Math.random()-0.5)*0.02, spin: Math.random()*0.2 });
      const c = palette[i % 3];
      colors[i*3] = c.r; colors[i*3+1] = c.g; colors[i*3+2] = c.b;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({ size: 0.11, vertexColors: true, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    this.scene.add(points);

    const start = performance.now();
    const duration = 3200;
    const step = () => {
      const t = (performance.now() - start) / duration;
      if (t >= 1){ this.scene.remove(points); geo.dispose(); mat.dispose(); return; }
      const pos = geo.attributes.position;
      for (let i = 0; i < COUNT; i++){
        pos.array[i*3]   += velocities[i].x;
        pos.array[i*3+1] += velocities[i].y;
        pos.array[i*3+2] += velocities[i].z;
      }
      pos.needsUpdate = true;
      mat.opacity = t < 0.8 ? 1 : 1 - (t - 0.8) / 0.2;
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* ---------------- Kualitas / performa ---------------- */

  setBloom(enabled){ this.quality.bloom = enabled; if (this.bloomPass) this.bloomPass.enabled = enabled; }
  setShadows(enabled){
    this.quality.shadows = enabled;
    this.renderer.shadowMap.enabled = enabled;
    if (this.sun) this.sun.castShadow = enabled;
  }

  /* ---------------- Util tween & loop ---------------- */

  _tweenValue(from, to, durationMs, ease, onUpdate, onComplete){
    const start = performance.now();
    const tick = (now) => {
      const raw = Math.min(1, (now - start) / durationMs);
      const t = ease(raw);
      onUpdate(from + (to - from) * t);
      if (raw < 1) requestAnimationFrame(tick);
      else onComplete && onComplete();
    };
    requestAnimationFrame(tick);
  }

  /** Debounce resize lewat requestAnimationFrame supaya resize/orientation-change
   *  yang beruntun (umum di HP saat rotasi layar) tidak memicu banyak reflow. */
  _scheduleResize(){
    if (this._resizeScheduled) return;
    this._resizeScheduled = true;
    requestAnimationFrame(() => {
      this._resizeScheduled = false;
      this.resize();
    });
  }

  resize(){
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
  }

  /** Auto-pause total (hemat baterai/CPU) saat tab/HP disembunyikan, resume otomatis saat kembali aktif. */
  _handleVisibility(){
    if (document.hidden){
      if (this._raf){ cancelAnimationFrame(this._raf); this._raf = null; }
      this._paused = true;
    } else if (this._paused){
      this._paused = false;
      this._animate();
    }
  }

  _animate(){
    if (this._paused) return;
    this._raf = requestAnimationFrame(() => this._animate());

    // PERFORMA: di perangkat "lite" (HP/PC lemah), batasi render ke
    // ~30fps alih-alih mengikuti refresh rate layar (bisa 60-120fps).
    // Mata nyaris tidak bisa membedakan 30fps vs 60fps untuk papan
    // catur yang sebagian besar statis, tapi bedanya besar untuk
    // panas/baterai HP dan kelancaran keseluruhan halaman.
    if (this._lite){
      const now = performance.now();
      if (this._lastFrameAt && now - this._lastFrameAt < 33) return;
      this._lastFrameAt = now;
    }

    this.controls.update();

    // Partikel ambient melayang pelan ke atas lalu reset
    const ap = this._ambientParticles;
    const pos = ap.points.geometry.attributes.position;
    for (let i = 0; i < ap.speeds.length; i++){
      pos.array[i*3 + 1] += ap.speeds[i] * 0.01;
      if (pos.array[i*3 + 1] > 5.5) pos.array[i*3 + 1] = 0.3;
    }
    pos.needsUpdate = true;

    const t = performance.now() * 0.001;
    if (this._energyRing) this._energyRing.material.emissiveIntensity = 1.8 + Math.sin(t * 2) * 0.5;
    if (this.checkRing) this.checkRing.material.opacity = 0.5 + Math.sin(t * 8) * 0.35;
    if (this._cyanLight) this._cyanLight.intensity = 5 + Math.sin(t * 1.3) * 1.2;
    if (this._violetLight) this._violetLight.intensity = 5 + Math.cos(t * 1.1) * 1.2;

    if (this.quality.bloom) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  dispose(){
    cancelAnimationFrame(this._raf);
    this._paused = true;
    if (this._onResize) window.removeEventListener('resize', this._onResize);
    if (this._onVisibility) document.removeEventListener('visibilitychange', this._onVisibility);
    if (this._burstPool) this._burstPool.forEach(s => { s.geo.dispose(); s.mat.dispose(); });
    if (this._trailPool) this._trailPool.forEach(s => { s.geo.dispose(); s.mat.dispose(); });
    this.renderer && this.renderer.dispose();
  }
}
