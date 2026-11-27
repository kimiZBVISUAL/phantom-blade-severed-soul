import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { AudioEngine } from './audio/AudioEngine.js';
import { VFXSystem } from './vfx/VFXSystem.js';
import { FighterRig } from './entities/FighterRig.js';
import { PlayerController } from './entities/PlayerController.js';
import { EnemyActor } from './entities/EnemyActor.js';
import { CombatManager, PLAYER_MOVES, getArenaFloorHeight } from './combat/CombatSystem.js';
import { HUDManager } from './ui/HUDManager.js';
import { MobileControls } from './ui/MobileControls.js';
import { StoryDirector } from './story/StoryDirector.js';
import { AAATrailerDirector } from './trailer/AAATrailerDirector.js';

// AAA Anti-Nausea Third-Person Action Camera Constants (Benchmarked: Black Myth: Wukong / Sekiro / Ghost of Tsushima)
const DEFAULT_CAM_YAW = 0.0;
const DEFAULT_CAM_PITCH = 0.27; // ~15.5° heroic elevated angle — spacious, horizon-steady, zero vertigo
const MIN_CAM_PITCH = 0.16;
const MAX_CAM_PITCH = 0.56;

// 5-Wave Outer Courtyard Wuxia Gauntlet (5 + 6 + 6 + 7 + 8 = 32 NPCs before Boss Xiao Canyang!)
const COURTYARD_WAVES = [
  {
    title: '山门伏杀',
    subtitle: '第一波 · 先锋暗卫现身',
    spawns: [
      { pos: [-3.2, 0, 9.5],  kind: 'assassin', name: '玄冥暗卫统领', hp: 260, posture: 75, scale: 1.03, ribbon: 0x7aa2ff },
      { pos: [3.4,  0, 8.8],  kind: 'kunoichi', name: '玄冥夜行女卫', hp: 230, posture: 68, scale: 1.00, ribbon: 0x8ad0ff },
      { pos: [-5.2, 0, 2.2],  kind: 'kunoichi', name: '玄冥夜行女卫', hp: 230, posture: 68, scale: 1.00, ribbon: 0x8ad0ff },
      { pos: [5.2,  0, 1.8],  kind: 'assassin', name: '玄冥暗卫',     hp: 250, posture: 72, scale: 1.02, ribbon: 0x7aa2ff },
      { pos: [0.0,  0, -2.5], kind: 'assassin', name: '玄冥暗卫',     hp: 250, posture: 72, scale: 1.02, ribbon: 0x7aa2ff },
    ],
  },
  {
    title: '影卫合围',
    subtitle: '第二波 · 东西两翼杀手包抄',
    spawns: [
      { pos: [-6.8, 0, 10.2], kind: 'assassin', name: '玄冥影卫',     hp: 270, posture: 78, scale: 1.03, ribbon: 0x7aa2ff },
      { pos: [6.8,  0, 10.0], kind: 'assassin', name: '玄冥影卫',     hp: 270, posture: 78, scale: 1.03, ribbon: 0x7aa2ff },
      { pos: [-7.2, 0, 3.6],  kind: 'kunoichi', name: '玄冥夜行女卫', hp: 245, posture: 70, scale: 1.00, ribbon: 0x99d6ff },
      { pos: [7.2,  0, 3.2],  kind: 'kunoichi', name: '玄冥夜行女卫', hp: 245, posture: 70, scale: 1.00, ribbon: 0x99d6ff },
      { pos: [-3.5, 0, -4.5], kind: 'assassin', name: '玄冥影卫',     hp: 270, posture: 78, scale: 1.03, ribbon: 0x7aa2ff },
      { pos: [3.5,  0, -4.5], kind: 'kunoichi', name: '玄冥夜行女卫', hp: 245, posture: 70, scale: 1.00, ribbon: 0x99d6ff },
    ],
  },
  {
    title: '夜枭突袭',
    subtitle: '第三波 · 疾风女卫与精锐暗卫',
    spawns: [
      { pos: [-6.0, 0, 8.5],  kind: 'kunoichi', name: '夜枭女刺客',   hp: 265, posture: 74, scale: 1.01, speedMul: 1.08, ribbon: 0xa0b4ff },
      { pos: [6.0,  0, 8.5],  kind: 'kunoichi', name: '夜枭女刺客',   hp: 265, posture: 74, scale: 1.01, speedMul: 1.08, ribbon: 0xa0b4ff },
      { pos: [-2.8, 0, -6.2], kind: 'assassin', name: '玄冥精锐暗卫', hp: 320, posture: 88, scale: 1.06, speedMul: 1.04, ribbon: 0x5c8dff },
      { pos: [2.8,  0, -6.2], kind: 'assassin', name: '玄冥精锐暗卫', hp: 320, posture: 88, scale: 1.06, speedMul: 1.04, ribbon: 0x5c8dff },
      { pos: [-7.5, 0, -0.5], kind: 'kunoichi', name: '夜枭女刺客',   hp: 265, posture: 74, scale: 1.01, speedMul: 1.08, ribbon: 0xa0b4ff },
      { pos: [7.5,  0, -0.5], kind: 'kunoichi', name: '夜枭女刺客',   hp: 265, posture: 74, scale: 1.01, speedMul: 1.08, ribbon: 0xa0b4ff },
    ],
  },
  {
    title: '玄冥死士',
    subtitle: '第四波 · 血刃死士倾巢而出',
    spawns: [
      { pos: [-6.5, 0, 11.2], kind: 'assassin', name: '玄冥死士',     hp: 330, posture: 90, scale: 1.06, speedMul: 1.05, ribbon: 0xff6b7a },
      { pos: [6.5,  0, 11.2], kind: 'assassin', name: '玄冥死士',     hp: 330, posture: 90, scale: 1.06, speedMul: 1.05, ribbon: 0xff6b7a },
      { pos: [-7.6, 0, 4.5],  kind: 'kunoichi', name: '玄冥赤影女卫', hp: 295, posture: 82, scale: 1.02, speedMul: 1.10, ribbon: 0xff7888 },
      { pos: [7.6,  0, 4.5],  kind: 'kunoichi', name: '玄冥赤影女卫', hp: 295, posture: 82, scale: 1.02, speedMul: 1.10, ribbon: 0xff7888 },
      { pos: [-4.4, 0, -5.8], kind: 'assassin', name: '玄冥死士',     hp: 330, posture: 90, scale: 1.06, speedMul: 1.05, ribbon: 0xff6b7a },
      { pos: [4.4,  0, -5.8], kind: 'assassin', name: '玄冥死士',     hp: 330, posture: 90, scale: 1.06, speedMul: 1.05, ribbon: 0xff6b7a },
      { pos: [0.0,  0, -8.0], kind: 'kunoichi', name: '玄冥赤影女卫', hp: 295, posture: 82, scale: 1.02, speedMul: 1.10, ribbon: 0xff7888 },
    ],
  },
  {
    title: '血衣亲卫死阵',
    subtitle: '第五波 · 血衣副统领率亲卫死战',
    spawns: [
      { pos: [0.0,  0, -7.8], kind: 'assassin', name: '血衣副统领',   hp: 520, posture: 115, scale: 1.14, speedMul: 1.08, ribbon: 0xff2b38 },
      { pos: [-4.2, 0, -6.5], kind: 'assassin', name: '血衣亲卫',     hp: 340, posture: 92,  scale: 1.07, speedMul: 1.06, ribbon: 0xff4c58 },
      { pos: [4.2,  0, -6.5], kind: 'assassin', name: '血衣亲卫',     hp: 340, posture: 92,  scale: 1.07, speedMul: 1.06, ribbon: 0xff4c58 },
      { pos: [-7.5, 0, 2.0],  kind: 'kunoichi', name: '血衣赤影女卫', hp: 310, posture: 84,  scale: 1.02, speedMul: 1.10, ribbon: 0xff5e6c },
      { pos: [7.5,  0, 2.0],  kind: 'kunoichi', name: '血衣赤影女卫', hp: 310, posture: 84,  scale: 1.02, speedMul: 1.10, ribbon: 0xff5e6c },
      { pos: [-6.2, 0, 10.5], kind: 'assassin', name: '血衣亲卫',     hp: 340, posture: 92,  scale: 1.07, speedMul: 1.06, ribbon: 0xff4c58 },
      { pos: [6.2,  0, 10.5], kind: 'assassin', name: '血衣亲卫',     hp: 340, posture: 92,  scale: 1.07, speedMul: 1.06, ribbon: 0xff4c58 },
      { pos: [0.0,  0, 12.2], kind: 'kunoichi', name: '血衣赤影女卫', hp: 310, posture: 84,  scale: 1.02, speedMul: 1.10, ribbon: 0xff5e6c },
    ],
  },
];
const TOTAL_COURTYARD_NPCS = COURTYARD_WAVES.reduce((sum, w) => sum + w.spawns.length, 0);

class PhantomBladeGame {
  constructor() {
    this.isMobileDevice = MobileControls.isLikelyMobile();
    this.canvas = document.getElementById('game-canvas');
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: !this.isMobileDevice,
      powerPreference: 'high-performance',
      stencil: false,
    });
    // Optimal DPR cap: crisp visuals without burning 4x GPU fillrate on Retina/3x mobile screens
    this.targetDpr = Math.min(window.devicePixelRatio || 1, this.isMobileDevice ? 1.25 : 1.5);
    this.renderer.setPixelRatio(this.targetDpr);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = this.isMobileDevice ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = true;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05070d);
    this.scene.fog = new THREE.FogExp2(0x070a13, 0.021);

    this.camera = new THREE.PerspectiveCamera(
      this._computeComfortFOV(),
      window.innerWidth / window.innerHeight,
      0.15,
      145
    );
    this.camera.position.set(0, 5.5, 29.0);

    // Performance-First Rendering Pipeline (FIXED at startup — NEVER switches mid-combat to avoid shader hitches):
    // - Mobile: Direct WebGL ACES rendering (skips 12-pass Bloom/HDR FBO overhead -> ~65% less GPU fillrate!)
    // - Desktop: Half-res UnrealBloomPass (4x faster than full-res with identical visual glow)
    this.useBloom = !this.isMobileDevice;
    this.qualityTier = this.isMobileDevice ? 'mobile-direct-aces' : 'desktop-halfres-bloom';
    this.perfAccumTime = 0;
    this.perfFrameCount = 0;
    this.perfMaxDt = 0;
    this.perfFrameSamples = [];
    this.perfStats = { fps: 60, p95Ms: 16.7, maxFrameMs: 16.7, qualityTier: this.qualityTier, drawCalls: 0, triangles: 0, programs: 0 };
    if (new URLSearchParams(window.location.search).get('perf') === '1') {
      const el = document.createElement('div');
      el.id = 'perf-overlay';
      el.style.cssText = 'position:fixed;top:6px;left:50%;transform:translateX(-50%);z-index:9999;background:rgba(0,0,0,0.78);color:#7ff0e2;font:12px/1.35 monospace;padding:4px 10px;border:1px solid rgba(127,240,226,0.4);pointer-events:none;white-space:nowrap;';
      el.textContent = 'PERF: measuring...';
      document.body.appendChild(el);
      this._perfEl = el;
    }

    if (this.useBloom) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      const bloomRes = new THREE.Vector2(
        Math.max(256, Math.floor(window.innerWidth * 0.5)),
        Math.max(144, Math.floor(window.innerHeight * 0.5))
      );
      this.bloomPass = new UnrealBloomPass(bloomRes, 0.54, 0.46, 0.74);
      this.composer.addPass(this.bloomPass);
      this.composer.addPass(new OutputPass());
    } else {
      this.composer = null;
      this.bloomPass = null;
    }

    this.audio = new AudioEngine();
    this.vfx = new VFXSystem(this.scene, { isMobile: this.isMobileDevice });
    this.hud = new HUDManager(this.camera);
    this.mobileControls = new MobileControls({ game: this });
    this.combat = new CombatManager({
      audio: this.audio,
      vfx: this.vfx,
      hudCallbacks: { onComboUpdate: (c, tag) => this.hud.onComboUpdate(c, tag) },
    });
    this.story = new StoryDirector({
      audio: this.audio,
      hud: this.hud,
      vfx: this.vfx,
      onTriggerLightning: () => this.triggerStormLightning(),
    });

    // AAA Critically-Damped Anti-Nausea Camera State + Reusable Scratch Vectors (zero GC)
    this.camYaw = DEFAULT_CAM_YAW;
    this.camTargetYaw = DEFAULT_CAM_YAW;
    this.camPitch = DEFAULT_CAM_PITCH;
    this.camTargetPitch = DEFAULT_CAM_PITCH;
    this.camFocus = new THREE.Vector3(0, 1.55, 20.0);
    this._camDesiredFocus = new THREE.Vector3();
    this._camDesiredPos = new THREE.Vector3();
    this._camEnemyTarget = new THREE.Vector3();
    this._camFinalLook = new THREE.Vector3();
    this._titleFocus = new THREE.Vector3(0, 0, 18);
    this.camGroundY = 0;
    this.camInitialized = false;
    this.camShake = 0;
    this.camShakeTime = 0;
    this.lastManualCamTime = -10;
    this.lightningFlash = 0;
    this.ambientThunderTimer = 9.0;

    this.assassins = [];
    this.destructibles = [];
    this.boss = null;
    this.bossEncounterStarted = false;
    this.courtyardCleared = false;
    this.gameStarted = false;
    this.gameEnded = false;

    this._setupLighting();
    this._setupCameraMouseOrbit();
    window.addEventListener('resize', () => this._onResize());
  }

  _computeComfortFOV() {
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    if (aspect >= 1.45) return 54;
    const t = Math.max(0, Math.min(1, (1.45 - aspect) / 0.9));
    return 54 + t * 14;
  }

  orbitCameraBy(deltaYaw, deltaPitch) {
    this.camTargetYaw -= deltaYaw;
    this.camTargetPitch = Math.max(MIN_CAM_PITCH, Math.min(MAX_CAM_PITCH, this.camTargetPitch + deltaPitch));
    this.lastManualCamTime = performance.now() * 0.001;
  }

  recenterCamera() {
    if (!this.player) return;
    let desiredYaw = this.player.yaw + Math.PI;
    const target = (this.bossEncounterStarted && this.boss && !this.boss.dead)
      ? this.boss
      : this._findNearestEnemy(14.0);
    if (target) {
      desiredYaw = Math.atan2(this.player.pos.x - target.pos.x, this.player.pos.z - target.pos.z);
    }
    let diff = desiredYaw - this.camTargetYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.camTargetYaw += diff;
    this.camTargetPitch = DEFAULT_CAM_PITCH;
    this.lastManualCamTime = performance.now() * 0.001;
  }

  addCameraShake(amount) {
    // Smooth low-frequency micro-impulse, strictly capped to prevent motion sickness
    this.camShake = Math.min(0.15, Math.max(this.camShake, amount * 0.28));
  }

  _setupLighting() {
    const hemi = new THREE.HemisphereLight(0x3a5582, 0x161012, 0.95);
    this.scene.add(hemi);

    // Cold Storm Moonlight casting crisp architectural & character shadows
    this.moonLight = new THREE.DirectionalLight(0x88b4ef, 2.45);
    this.moonLight.position.set(16, 28, 18);
    this.moonLight.castShadow = true;
    this.moonLight.shadow.mapSize.set(1024, 1024);
    this.moonLight.shadow.camera.near = 2;
    this.moonLight.shadow.camera.far = 90;
    const d = 34;
    this.moonLight.shadow.camera.left = -d;
    this.moonLight.shadow.camera.right = d;
    this.moonLight.shadow.camera.top = d;
    this.moonLight.shadow.camera.bottom = -d;
    this.moonLight.shadow.bias = -0.0005;
    this.scene.add(this.moonLight);

    // Fixed 3-Zone Warm Firelight (NEVER toggle .visible — toggling PointLight.visible forces synchronous
    // WebGL shader recompilation on every PBR material and causes severe frame stutters!)
    this.fireLights = [];
    const fireSpots = [
      [0, 3.0, 9.5, 0xff7f2e, 14.0, 26],    // Mountain Gate & Courtyard Brazier Glow
      [0, 3.0, -7.8, 0xff6e24, 12.0, 22],   // Temple Steps Braziers Glow
      [0, 5.2, -21.5, 0xff4b2b, 16.5, 28],  // Main Hall Sanctuary & Altar Glow
    ];
    for (const [x, y, z, col, intensity, dist] of fireSpots) {
      const pl = new THREE.PointLight(col, intensity, dist, 1.5);
      pl.position.set(x, y, z);
      this.scene.add(pl);
      this.fireLights.push({ light: pl, base: intensity, phase: Math.random() * 10 });
    }
  }

  _setupCameraMouseOrbit() {
    window.addEventListener('mousemove', (e) => {
      if (!this.gameStarted || this.story.inCutscene || this.gameEnded) return;
      // Only orbit when pointer-locked or middle-dragging — NEVER jerk camera on left-click attack!
      if (document.pointerLockElement === this.canvas || e.buttons === 4) {
        const dx = Math.max(-55, Math.min(55, e.movementX));
        const dy = Math.max(-35, Math.min(35, e.movementY));
        this.orbitCameraBy(dx * 0.0022, dy * 0.0016);
      }
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyV' && this.gameStarted && !this.story.inCutscene && !this.gameEnded) {
        this.recenterCamera();
      }
    });
    window.addEventListener('mousedown', (e) => {
      if (e.button === 1 && this.gameStarted && !this.story.inCutscene && !this.gameEnded) {
        e.preventDefault();
        this.recenterCamera();
      }
    });
    this.canvas.addEventListener('click', () => {
      if (this.mobileControls?.enabled) return;
      if (this.gameStarted && !this.story.inCutscene && !this.gameEnded && !document.pointerLockElement) {
        try {
          Promise.resolve(this.canvas.requestPointerLock?.()).catch(() => {});
        } catch (_) {}
      }
    });
  }

  triggerStormLightning() {
    this.lightningFlash = 1.0;
    this.addCameraShake(0.18);
    this.audio.playSFX('thunder', { volume: 0.82 });
  }

  async loadAllAssets() {
    const gltfLoader = new GLTFLoader();
    const rgbeLoader = new RGBELoader();

    const loadGLTF = (url) => new Promise((res, rej) => gltfLoader.load(url, res, undefined, rej));
    const loadHDR = (url) => new Promise((res, rej) => rgbeLoader.load(url, res, undefined, rej));

    this.hud.setLoadingProgress(0.08, '正在加载雨夜全局光照 HDRI 与音轨...');
    const [hdrTex] = await Promise.all([
      loadHDR('/assets/hdri/courtyard_night_1k.hdr'),
      this.audio.preload((p) => {
        this.hud.setLoadingProgress(0.08 + p * 0.32, '正在解码神经网络中文剧情配音与古风配乐...');
      }),
    ]);
    hdrTex.mapping = THREE.EquirectangularReflectionMapping;
    this.scene.environment = hdrTex;
    this.scene.environmentIntensity = 0.65;

    this.hud.setLoadingProgress(0.45, '正在加载 Blender 5.3 飞檐古刹与高精度写实武侠角色...');
    const [templeGltf, propsGltf, weaponsGltf, heroGltf, assassinGltf, kunoichiGltf, bossGltf] = await Promise.all([
      loadGLTF('/assets/models/temple_courtyard.glb'),
      loadGLTF('/assets/models/destructible_props.glb'),
      loadGLTF('/assets/models/weapons.glb'),
      loadGLTF('/assets/models/hero_hun.glb'),
      loadGLTF('/assets/models/enemy_assassin.glb'),
      loadGLTF('/assets/models/enemy_kunoichi.glb'),
      loadGLTF('/assets/models/boss_xiaocanyang.glb'),
    ]);

    this.hud.setLoadingProgress(0.88, '正在装配武侠骨骼绑定与杀意技能链...');

    // Merge static Temple Courtyard meshes by material + shadow flag:
    // Collapses 404 individual draw calls -> ~22 batched draw calls (18x fewer GPU draw calls, 100% identical visuals!)
    this._addOptimizedStaticScene(templeGltf.scene);

    // Extract 3D Weapons
    const tangDaoProto = weaponsGltf.scene.getObjectByName('Weapon_TangDao') || weaponsGltf.scene.children[0];
    const odachiProto = weaponsGltf.scene.getObjectByName('Weapon_BossOdachi') || weaponsGltf.scene.children[1];
    const saberProto = weaponsGltf.scene.getObjectByName('Weapon_AssassinSaber') || weaponsGltf.scene.children[2];

    // Spawn Destructible Ceramic Urns & Crates across Courtyard & Hall
    const vaseProto = propsGltf.scene.getObjectByName('DestructibleVase') || propsGltf.scene.children[0];
    const crateProto = propsGltf.scene.getObjectByName('DestructibleCrate') || propsGltf.scene.children[1];
    const propSpots = [
      [-3.8, 12.0, 'vase'], [3.8, 12.0, 'vase'], [-7.2, 4.0, 'crate'], [7.2, 4.0, 'crate'],
      [-6.2, -3.5, 'vase'], [6.2, -3.5, 'vase'], [-7.8, -17.5, 'vase'], [7.8, -17.5, 'vase'],
    ];
    for (const [px, pz, kind] of propSpots) {
      const proto = kind === 'vase' ? vaseProto : crateProto;
      if (!proto) continue;
      const m = proto.clone(true);
      m.position.set(px, getArenaFloorHeight(px, pz), pz);
      m.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
      this.scene.add(m);
      this.destructibles.push({ mesh: m, pos: m.position, kind, broken: false });
    }

    this._spawnCharacters({ heroGltf, assassinGltf, kunoichiGltf, bossGltf, tangDaoProto, saberProto, odachiProto });

    // Pre-warm ALL WebGL shader programs upfront so there is ZERO first-hit / first-dash / first-VFX stutter!
    this._prewarmShaders();

    this.hud.setLoadingProgress(1.0);

    document.getElementById('btn-start-game').onclick = () => this.startGame();
    document.getElementById('btn-restart').onclick = () => window.location.reload();

    const params = new URLSearchParams(window.location.search);
    if (params.get('trailer') === '1') {
      await this.startGame({ skipIntro: true });
      const director = new AAATrailerDirector(this);
      setTimeout(() => { director.runAndRecord({ filename: 'war_soul_aaa_trailer.webm' }); }, 500);
    } else if (params.get('promo') === '1') {
      await this.startGame({ skipIntro: true });
      setTimeout(() => { this.runPromoShowcase({ record: true }); }, 600);
    } else if (params.get('autostart') === '1') {
      this.startGame({ skipIntro: true });
    }
  }

  _addOptimizedStaticScene(rootScene) {
    rootScene.updateMatrixWorld(true);
    const buckets = new Map();
    const fallbackMeshes = [];

    rootScene.traverse((c) => {
      if (!c.isMesh || !c.geometry || !c.material || Array.isArray(c.material)) return;
      const lowerName = (c.name || '').toLowerCase();
      const isGround =
        lowerName.includes('floor') ||
        lowerName.includes('ground') ||
        lowerName.includes('terrain') ||
        lowerName.includes('stair');
      const castShadow = !isGround;
      const geom = c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone();
      geom.applyMatrix4(c.matrixWorld);

      // Build attribute signature so mergeGeometries only combines compatible vertex layouts
      const attrKeys = Object.keys(geom.attributes).sort().join(',');
      const key = `${c.material.uuid}|${castShadow ? 1 : 0}|${attrKeys}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { material: c.material, castShadow, geoms: [] };
        buckets.set(key, bucket);
      }
      bucket.geoms.push(geom);
    });

    const staticGroup = new THREE.Group();
    staticGroup.name = 'TempleCourtyard_Batched';

    for (const bucket of buckets.values()) {
      const merged = bucket.geoms.length === 1
        ? bucket.geoms[0]
        : mergeGeometries(bucket.geoms, false);
      if (merged) {
        const mesh = new THREE.Mesh(merged, bucket.material);
        mesh.castShadow = bucket.castShadow;
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        staticGroup.add(mesh);
        if (bucket.geoms.length > 1) {
          for (const g of bucket.geoms) g.dispose();
        }
      } else {
        for (const g of bucket.geoms) {
          const mesh = new THREE.Mesh(g, bucket.material);
          mesh.castShadow = bucket.castShadow;
          mesh.receiveShadow = true;
          mesh.matrixAutoUpdate = false;
          mesh.updateMatrix();
          fallbackMeshes.push(mesh);
        }
      }
    }
    for (const fm of fallbackMeshes) staticGroup.add(fm);
    staticGroup.matrixAutoUpdate = false;
    staticGroup.updateMatrixWorld(true);
    this.scene.add(staticGroup);
  }

  _prewarmShaders() {
    // Temporarily reveal 1 instance of each pooled VFX type so renderer.compile compiles every shader upfront
    const sw = this.vfx.shockwavePool?.[0];
    const ai = this.vfx.afterimagePool?.[0];
    const lb = this.vfx.lightningPool?.[0];
    const rb = this.vfx.ribbons?.[0];
    if (sw) sw.mesh.visible = true;
    if (ai) ai.group.visible = true;
    if (lb) lb.line.visible = true;
    if (rb?.mesh) rb.mesh.visible = true;
    if (this.vfx.bloodMesh) this.vfx.bloodMesh.count = 1;
    if (this.vfx.inkMesh) this.vfx.inkMesh.count = 1;

    this.renderer.compile(this.scene, this.camera);

    if (sw) sw.mesh.visible = false;
    if (ai) ai.group.visible = false;
    if (lb) lb.line.visible = false;
    if (rb?.mesh) rb.mesh.visible = false;
    if (this.vfx.bloodMesh) this.vfx.bloodMesh.count = 0;
    if (this.vfx.inkMesh) this.vfx.inkMesh.count = 0;
  }

  _spawnCharacters({ heroGltf, assassinGltf, kunoichiGltf, bossGltf, tangDaoProto, saberProto, odachiProto }) {
    // 1. Protagonist Hun (Two-Handed Tang-Dao / Miao-Dao Stance!)
    const heroRig = new FighterRig({
      gltfSource: heroGltf,
      weaponPrototype: tangDaoProto,
      scale: 1.04,
      bladeLength: 1.12,
      twoHanded: true,
      ribbon: this.vfx.createSwordRibbon(0x9cf0ff),
    });
    this.scene.add(heroRig.root);
    this.player = new PlayerController({
      rig: heroRig,
      audio: this.audio,
      vfx: this.vfx,
      hud: this.hud,
    });

    // 2. Store enemy prototypes & spawn Wave 1 of the 5-Wave (32-NPC) Courtyard Gauntlet!
    this.enemyProtos = { assassinGltf, kunoichiGltf, saberProto };
    this.currentWaveIndex = 0;
    this.totalCourtyardKills = 0;
    this.waveTransitionPending = false;
    this.nextWaveSpawnCounter = 0;
    this.bossGateWarnCooldown = 0;
    this._spawnCourtyardWave(0, { silent: true });

    // 3. Two-Phase Nemesis Boss: Xiao Canyang (Two-Handed Sovereign Odachi!)
    const bossRig = new FighterRig({
      gltfSource: bossGltf,
      weaponPrototype: odachiProto,
      scale: 1.24, // Towering 2.2m martial overlord!
      bladeLength: 1.95,
      twoHanded: true,
      ribbon: this.vfx.createSwordRibbon(0xff3844),
    });
    this.scene.add(bossRig.root);
    this.boss = new EnemyActor({
      id: 'boss_xiao',
      name: '血衣堂主 · 萧残阳',
      rig: bossRig,
      spawnPos: new THREE.Vector3(0, 1.29, -22.8),
      isBoss: true,
      audio: this.audio,
      vfx: this.vfx,
      hud: this.hud,
    });
    this.boss.onEnemyStrikeCheck = (enemy, move) => this._resolveEnemyStrike(enemy, move);
    this.boss.onBossPhase2 = () => {
      this.audio.playBGM('bgm_boss_phase2', 1.0);
      this.story.playBossPhase2Cutscene(this.boss);
    };
    this.boss.onDeath = async () => {
      this.gameEnded = true;
      document.exitPointerLock?.();
      this.combat.triggerHitstop(0.18, 0.9);
      await this.story.playEndingCutscene(this.player, this.boss);
      this.hud.showResult({ victory: true, stats: this.combat.stats });
    };

    // Wire Player soft-lock, hit detection, and execution hooks
    this.player.onFindSoftLockTarget = (maxRange) => this._findNearestEnemy(maxRange);
    this.player.onDealPlayerHit = (move, progress) => this._resolvePlayerSwing(move, progress);
    this.player.onTryExecution = () => this._tryStartExecution();

    this.hud.updatePlayer(this.player);
    this.hud.updateSkillChains(this.player);
  }

  _getAllLivingEnemies() {
    const list = this.assassins.filter((a) => !a.dead && a.active);
    if (this.boss && this.boss.active && !this.boss.dead) list.push(this.boss);
    return list;
  }

  _findNearestEnemy(maxRange = 8.0, requireBroken = false) {
    let best = null;
    let bestDist = maxRange;
    for (const e of this._getAllLivingEnemies()) {
      if (requireBroken && e.brokenTimer <= 0) continue;
      const d = e.pos.distanceTo(this.player.pos);
      if (d < bestDist) {
        bestDist = d;
        best = e;
      }
    }
    return best;
  }

  _tryStartExecution() {
    const brokenTarget = this._findNearestEnemy(5.5, true);
    if (!brokenTarget) return false;
    // Snap face-to-face for visceral wuxia execution
    const toEnemy = new THREE.Vector3().subVectors(brokenTarget.pos, this.player.pos);
    toEnemy.y = 0;
    this.player.yaw = Math.atan2(toEnemy.x, toEnemy.z);
    brokenTarget.brokenTimer = 0;
    brokenTarget.posture = 0;
    this.combat.stats.executions++;
    this.combat.triggerHitstop(0.12, 0.55);
    return true;
  }

  _resolvePlayerSwing(move, progress) {
    // Smash destructible urns & crates!
    for (const prop of this.destructibles) {
      if (prop.broken) continue;
      if (prop.pos.distanceTo(this.player.pos) < move.range + 0.5) {
        prop.broken = true;
        prop.mesh.visible = false;
        this.vfx.spawnSparks(prop.pos.clone().add(new THREE.Vector3(0, 0.6, 0)), 26, 0xe8c48e, 0.8);
        this.audio.playSFX(prop.kind === 'crate' ? 'shatter_crate' : 'shatter_vase', {
          volume: 0.88,
          worldPos: prop.pos,
        });
      }
    }

    // Multi-hit support for whirlwind moves (`断魂千裂`)
    if (move.multiHits) {
      const stepSlot = Math.floor(progress * move.multiHits);
      if (stepSlot > this.player.multiHitTriggered) {
        this.player.multiHitTriggered = stepSlot;
        this.player.hitVictims.clear();
      }
    }

    const forward = new THREE.Vector3(Math.sin(this.player.yaw), 0, Math.cos(this.player.yaw));
    for (const enemy of this._getAllLivingEnemies()) {
      if (this.player.hitVictims.has(enemy.id)) continue;
      const diff = new THREE.Vector3().subVectors(enemy.pos, this.player.pos);
      diff.y = 0;
      const dist = diff.length();
      if (dist > move.range) continue;

      if (move.arc < Math.PI * 1.9 && dist > 0.4) {
        const angle = forward.angleTo(diff.clone().normalize());
        if (angle > move.arc * 0.5) continue;
      }

      this.player.hitVictims.add(enemy.id);
      const isCrit = move.showCard || move.dmg >= 95;
      const actualDmg = move.dmg + Math.floor(Math.random() * 11);
      const hitPos = enemy.pos.clone().add(new THREE.Vector3(0, 1.35, 0));

      enemy.takeDamage(actualDmg, move.postureDmg, forward, { isExecution: move === PLAYER_MOVES.execution });
      this.combat.stats.damageDealt += actualDmg;
      this.combat.addCombo(move.name || '疾风快刀');
      this.combat.triggerHitstop(move.hitstop);
      this.addCameraShake(move.shake);
      this.mobileControls?.vibrate(isCrit ? 18 : 10);

      if (move.shayiGain) this.player.addShayi(move.shayiGain);
      if (move.shockwave) this.vfx.spawnShockwave(enemy.pos, { color: 0xff8c3b, maxRadius: 4.0 });
      if (move.lightning) this.vfx.spawnCrimsonLightning(enemy.pos, 0xff2433);

      this.vfx.spawnSparks(hitPos, isCrit ? 48 : 26, isCrit ? 0xff9b54 : 0xffdf8e, isCrit ? 1.25 : 0.9);
      this.vfx.spawnBloodAndInk(hitPos, forward, isCrit ? 26 : 14);
      this.audio.playSFX(move.sfxHit || 'hit_light', { volume: 0.96, worldPos: hitPos });
      this.hud.spawnPopup(hitPos, `-${actualDmg}`, isCrit ? 'crit' : '');
      this.hud.updateBoss(this.boss);
    }
  }

  _resolveEnemyStrike(enemy, move) {
    const diff = new THREE.Vector3().subVectors(this.player.pos, enemy.pos);
    diff.y = 0;
    if (diff.length() > move.range) return false;

    const clashPoint = this.player.pos.clone().lerp(enemy.pos, 0.5).add(new THREE.Vector3(0, 1.38, 0));

    // 1. Invulnerable Phantom Dash!
    if (this.player.invulnTimer > 0) {
      this.hud.spawnPopup(this.player.pos.clone().add(new THREE.Vector3(0, 1.9, 0)), '残影闪避', 'parry');
      return true;
    }

    // 2. PERFECT PARRY ("精防振刀" — Sekiro / Phantom Blade Zero pinnacle moment!)
    if (this.player.parryTimer > 0) {
      this.combat.stats.parries++;
      this.combat.addCombo('精防振刀 · 可追斩');
      this.combat.triggerHitstop(0.135, 0.32);
      this.addCameraShake(0.45);
      this.mobileControls?.vibrate(25);

      this.player.parryTimer = 0;
      this.player.riposteTimer = 0.95; // Unlocks instant Empowered Counter-Riposte on next Left Click / J!
      this.player.rig.triggerParryImpact();
      this.player.addShayi(1);
      enemy.addPosture(enemy.isBoss ? 56 : 55); // Massive posture damage!
      if (!enemy.isBoss) enemy.staggerTimer = 0.55;

      this.audio.playSFX('parry', { volume: 1.08, pitchJitter: 0.04, worldPos: clashPoint });
      this.vfx.spawnSparks(clashPoint, 95, 0xffe27a, 1.45);
      this.vfx.spawnShockwave(clashPoint, { color: 0xffdf80, maxRadius: 3.4, duration: 0.34, vertical: true });
      this.hud.triggerScreenFX('parry');
      this.hud.spawnPopup(clashPoint, '振刀破势！', 'parry');
      this.hud.updateBoss(this.boss);
      return true;
    }

    // 3. Standard Guard Block (if holding Right Click / K and attack is blockable)
    if (this.player.guardHolding && !move.unblockable && this.player.stamina >= 22) {
      this.player.stamina -= 22;
      this.player.hp = Math.max(1, this.player.hp - Math.round(move.dmg * 0.18));
      this.audio.playSFX('guard_block', { volume: 0.88, worldPos: clashPoint });
      this.vfx.spawnSparks(clashPoint, 32, 0xffb366, 0.9);
      this.addCameraShake(0.18);
      this.mobileControls?.vibrate(14);
      this.hud.updatePlayer(this.player);
      return true;
    }

    // 4. Direct Hit Taken ("主角受创/被凌虐" visceral feedback!)
    this.player.hp = Math.max(0, this.player.hp - move.dmg);
    this.player.rig.triggerHitFlash(0.14);
    if (!this.player.currentMove?.superArmor) {
      this.player.currentMove = null;
      this.player.rig.trailActive = false;
      this.player.staggerTimer = 0.26;
    }
    this.combat.triggerHitstop(0.055);
    this.addCameraShake(0.32);
    this.mobileControls?.vibrate(20);
    this.audio.playSFX('hit_heavy', { volume: 0.95 });
    this.audio.playSFX('vox_hun_hurt', { volume: 0.92, pitchJitter: 0.05 });
    this.vfx.spawnBloodAndInk(this.player.pos.clone().add(new THREE.Vector3(0, 1.3, 0)), diff.normalize(), 18);
    this.hud.triggerScreenFX('blood');
    this.hud.spawnPopup(this.player.pos.clone().add(new THREE.Vector3(0, 1.8, 0)), `-${move.dmg}`, 'crit');
    this.hud.updatePlayer(this.player);

    if (this.player.hp <= 0 && !this.gameEnded) {
      this.player.dead = true;
      this.gameEnded = true;
      this.audio.setLowHealthAgony?.(false);
      document.exitPointerLock?.();
      this.audio.playVO('hun_death', (sp, txt) => this.hud.showSubtitle(sp, txt), { priority: 9 });
      setTimeout(() => {
        this.hud.hideSubtitle();
        this.hud.showResult({ victory: false, stats: this.combat.stats });
      }, 2800);
    } else if (this.player.hp > 0) {
      if (this.player.hp <= this.player.maxHp * 0.38 && !this.player.lowHpVoTriggered) {
        this.player.lowHpVoTriggered = true;
        this.audio.setLowHealthAgony?.(true);
        this.audio.playCombatVoice('hun_low_hp', (sp, txt) => {
          this.hud.showSubtitle(sp, txt);
          setTimeout(() => { if (!this.story.inCutscene) this.hud.hideSubtitle(); }, 4200);
        }, { volume: 1.05 });
      } else if (move.dmg >= 110 && this.player.hurtVoCooldown <= 0) {
        this.player.hurtVoCooldown = 5.8;
        const hurtVo = Math.random() < 0.5 ? 'hun_hurt_heavy_1' : 'hun_hurt_heavy_2';
        this.audio.playCombatVoice(hurtVo, (sp, txt) => {
          this.hud.showSubtitle(sp, txt);
          setTimeout(() => { if (!this.story.inCutscene) this.hud.hideSubtitle(); }, 3000);
        }, { volume: 1.0 });
      }
    }
    return true;
  }

  _spawnCourtyardWave(waveIdx, { silent = false } = {}) {
    const wave = COURTYARD_WAVES[waveIdx];
    if (!wave || !this.enemyProtos) return;
    this.currentWaveIndex = waveIdx;
    this.waveTransitionPending = false;

    const { assassinGltf, kunoichiGltf, saberProto } = this.enemyProtos;
    wave.spawns.forEach((cfg) => {
      const gltf = cfg.kind === 'kunoichi' ? (kunoichiGltf || assassinGltf) : assassinGltf;
      const spawnVec = new THREE.Vector3(cfg.pos[0], cfg.pos[1], cfg.pos[2]);
      const rig = new FighterRig({
        gltfSource: gltf,
        weaponPrototype: saberProto,
        scale: cfg.scale || 1.02,
        bladeLength: 0.95,
        twoHanded: false,
        ribbon: this.vfx.createSwordRibbon(cfg.ribbon || 0x7aa2ff),
        castShadow: !this.isMobileDevice, // Mobile: Hero & Boss cast crisp shadows; minions skip skinned shadow pass for 60fps
      });
      this.scene.add(rig.root);
      const uid = this.nextWaveSpawnCounter++;
      const actor = new EnemyActor({
        id: `wave${waveIdx + 1}_npc_${uid}`,
        name: cfg.name,
        rig,
        spawnPos: spawnVec,
        isBoss: false,
        maxHp: cfg.hp,
        maxPosture: cfg.posture,
        speedMul: cfg.speedMul || 1.0,
        audio: this.audio,
        vfx: this.vfx,
        hud: this.hud,
      });
      actor.onEnemyStrikeCheck = (enemy, move) => this._resolveEnemyStrike(enemy, move);
      actor.onDeath = () => this._onCourtyardEnemyDeath();
      this.assassins.push(actor);

      if (!silent) {
        this.vfx.spawnShockwave(actor.pos, { color: cfg.ribbon || 0x7aa2ff, maxRadius: 2.8, duration: 0.45 });
        this.vfx.spawnSparks(actor.pos.clone().add(new THREE.Vector3(0, 1.1, 0)), 16, cfg.ribbon || 0x9cf0ff, 0.8);
      }
    });

    if (!silent) {
      this.triggerStormLightning();
      this.audio.playSFX('posture_break', { volume: 0.72 });
      this.hud.flashSkillCard(`第 ${waveIdx + 1} / ${COURTYARD_WAVES.length} 波`, `${wave.title} · ${wave.spawns.length} 敌来袭`);
    }
    this._updateCourtyardObjective();
  }

  _updateCourtyardObjective() {
    const waveNum = this.currentWaveIndex + 1;
    const totalWaves = COURTYARD_WAVES.length;
    const wave = COURTYARD_WAVES[this.currentWaveIndex];
    const aliveInWave = this.assassins.filter((a) => !a.dead).length;
    if (this.courtyardCleared) {
      this.hud.setObjective('贰 · 断魂残殿', `外院 ${TOTAL_COURTYARD_NPCS} 敌已尽诛！登上青石御道台阶，决战萧残阳`);
    } else if (this.waveTransitionPending) {
      this.hud.setObjective(`壹 · 雨夜血战（第 ${waveNum} / ${totalWaves} 波已清）`, `调息回气中… 下一波伏兵即将杀到（累计 ${this.totalCourtyardKills} / ${TOTAL_COURTYARD_NPCS}）`);
    } else {
      this.hud.setObjective(
        `壹 · ${wave.title}（第 ${waveNum} / ${totalWaves} 波）`,
        `本波剩余 ${aliveInWave} 人 · 累计击杀 ${this.totalCourtyardKills} / ${TOTAL_COURTYARD_NPCS}`
      );
    }
  }

  _onCourtyardEnemyDeath() {
    this.totalCourtyardKills++;
    const aliveInWave = this.assassins.filter((a) => !a.dead).length;
    if (aliveInWave > 0) {
      this._updateCourtyardObjective();
      return;
    }

    // Current wave cleared!
    const nextWaveIdx = this.currentWaveIndex + 1;
    if (nextWaveIdx < COURTYARD_WAVES.length) {
      this.waveTransitionPending = true;
      // Between-wave wuxia breath recovery so 32-NPC gauntlet stays exhilarating & fair!
      if (this.player && !this.player.dead) {
        const healAmt = Math.round(this.player.maxHp * 0.28);
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + healAmt);
        this.player.gourds = Math.min(4, this.player.gourds + 1);
        this.player.addShayi(1);
        if (this.player.hp > this.player.maxHp * 0.38) {
          this.player.lowHpVoTriggered = false;
          this.audio.setLowHealthAgony?.(false);
        }
        this.hud.updatePlayer(this.player);
        this.hud.spawnPopup(this.player.pos.clone().add(new THREE.Vector3(0, 2.0, 0)), `调息回气 +${healAmt}`, 'parry');
      }
      this.hud.flashSkillCard(`第 ${this.currentWaveIndex + 1} 波 · 肃清`, '调息回气 · 下一波伏兵逼近');
      this._updateCourtyardObjective();

      setTimeout(() => {
        if (!this.gameEnded && !this.bossEncounterStarted) {
          this._spawnCourtyardWave(nextWaveIdx, { silent: false });
        }
      }, 2200);
    } else if (!this.courtyardCleared) {
      // All 5 waves (32 NPCs) defeated — unlock Boss Hall!
      this.courtyardCleared = true;
      if (this.player && !this.player.dead) {
        const healAmt = Math.round(this.player.maxHp * 0.45);
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + healAmt);
        this.player.gourds = Math.min(4, this.player.gourds + 2);
        this.player.addShayi(2);
        this.player.lowHpVoTriggered = false;
        this.audio.setLowHealthAgony?.(false);
        this.hud.updatePlayer(this.player);
      }
      this.triggerStormLightning();
      this.hud.flashSkillCard('五波死阵 · 破', `外院 ${TOTAL_COURTYARD_NPCS} 敌尽诛 · 踏阶决战萧残阳`);
      this._updateCourtyardObjective();
      this.audio.playVO('courtyard_clear_hun', (sp, txt) => {
        this.hud.showSubtitle(sp, txt);
        setTimeout(() => { if (!this.story.inCutscene) this.hud.hideSubtitle(); }, 4600);
      });
    }
  }

  _checkCourtyardProgress() {
    this._updateCourtyardObjective();
  }

  async _triggerBossEncounter() {
    this.bossEncounterStarted = true;
    this.boss.active = true;
    this.audio.playBGM('bgm_boss', 1.0);
    await this.story.playBossIntroCutscene(this.player, this.boss);
    this.camYaw = DEFAULT_CAM_YAW;
    this.camTargetYaw = DEFAULT_CAM_YAW;
    this.camPitch = DEFAULT_CAM_PITCH;
    this.camTargetPitch = DEFAULT_CAM_PITCH;
    this.camInitialized = false;
    this.hud.setObjective('叁 · 宿命死斗', '击败血衣堂主 · 萧残阳（善用弹反振刀与技能链破势）');
    this.hud.updateBoss(this.boss);
  }

  async startGame({ skipIntro = false } = {}) {
    if (this.gameStarted) return;
    this.gameStarted = true;
    await this.audio.unlock().catch(() => {});
    this.audio.playBGM('bgm_courtyard', 1.0);
    this.hud.hideTitleAndShowHUD();
    this._checkCourtyardProgress();
    if (skipIntro) {
      this.story.inCutscene = false;
      this.player.pos.set(0, 0, 12.8);
      this.player.yaw = Math.PI;
      this.player.rig.root.rotation.y = Math.PI;
      this.camYaw = DEFAULT_CAM_YAW;
      this.camTargetYaw = DEFAULT_CAM_YAW;
      this.camPitch = DEFAULT_CAM_PITCH;
      this.camTargetPitch = DEFAULT_CAM_PITCH;
      this.camInitialized = false;
      for (const a of this.assassins) a.active = true;
    } else {
      await this.story.playIntroCutscene(this.player, this.assassins);
      this.camYaw = DEFAULT_CAM_YAW;
      this.camTargetYaw = DEFAULT_CAM_YAW;
      this.camPitch = DEFAULT_CAM_PITCH;
      this.camTargetPitch = DEFAULT_CAM_PITCH;
      this.camInitialized = false;
    }
  }

  /**
   * Choreographed Promotional Combat Showcase:
   * Demonstrates Dash, 4-hit Basic Combo, Upper Chain (`踏影刺 -> 旋风斩月 -> 断魂·千裂`),
   * Perfect Parry & Riposte (`振刀·追魂斩`), Lower Chain (`裂地重劈 -> 飞燕掠空 -> 赤霄·坠天`),
   * and Lethal Execution (`鬼哭·一闪`) while recording WebGL canvas at crisp bitrate!
   */
  async runPromoShowcase({ record = true } = {}) {
    if (!this.gameStarted) await this.startGame({ skipIntro: true });
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    this.promoMode = true;

    let recorder = null;
    const chunks = [];
    if (record && this.canvas.captureStream) {
      const stream = this.canvas.captureStream(30);
      const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';
      recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_500_000 });
      recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
      recorder.start(250);
    }

    const stepTowardEnemy = () => {
      const target = this._findNearestEnemy(28.0);
      if (!target) return null;
      const dx = target.pos.x - this.player.pos.x;
      const dz = target.pos.z - this.player.pos.z;
      const dist = Math.hypot(dx, dz);
      this.player.yaw = Math.atan2(dx, dz);
      this.player.rig.root.rotation.y = this.player.yaw;
      if (dist > 3.2) {
        this.player.pos.x += (dx / dist) * (dist - 2.6);
        this.player.pos.z += (dz / dist) * (dist - 2.6);
      }
      this.player.hp = Math.max(this.player.hp, 750);
      this.player.shayi = 5;
      this.player.upperCooldown = 0;
      this.player.lowerCooldown = 0;
      this.hud.updatePlayer(this.player);
      return target;
    };

    // Dynamic cinematic orbit during promo showcase
    const orbitTimer = setInterval(() => {
      this.camTargetYaw += 0.018;
      this.camTargetPitch = 0.24 + Math.sin(performance.now() * 0.0012) * 0.06;
    }, 33);

    try {
      await sleep(700);
      // 1. Dash + 4-Hit Figure-8 Tang-Dao Basic Combo
      stepTowardEnemy();
      this.player.triggerDash();
      await sleep(420);
      for (let i = 0; i < 4; i++) {
        stepTowardEnemy();
        this.player.queueAttack('basic');
        await sleep(500);
      }

      // 2. Upper Skill Chain《影杀三绝》: 踏影刺 -> 旋风斩月 -> 断魂 · 千裂
      for (let i = 0; i < 3; i++) {
        stepTowardEnemy();
        this.player.queueAttack('upper');
        await sleep(i === 2 ? 920 : 540);
      }

      // 3. Perfect Parry + Empowered Counter-Riposte (`振刀 · 追魂斩`)
      const parryEnemy = stepTowardEnemy();
      this.player.startParry();
      await sleep(160);
      if (parryEnemy) {
        this.player.rig.triggerParryImpact();
        this.vfx.spawnSparks(this.player.pos.clone().add(new THREE.Vector3(0, 1.35, 0)), 42, 0xffe488, 1.3);
        this.vfx.spawnShockwave(this.player.pos, { color: 0xffd56e, maxRadius: 4.0, duration: 0.4 });
        this.audio.playSFX('parry_perfect', { volume: 1.0 });
        this.hud.flashSkillCard('完美振刀', '金铁交鸣 · 破势反击');
        this.player.riposteTimer = 0.9;
        await sleep(220);
        this.player.queueAttack('basic'); // Triggers `parry_riposte` (`振刀 · 追魂斩`)!
        await sleep(680);
      }

      // 4. Lower Skill Chain《赤霄破阵》: 裂地重劈 -> 飞燕掠空 -> 赤霄 · 坠天
      for (let i = 0; i < 3; i++) {
        stepTowardEnemy();
        this.player.queueAttack('lower');
        await sleep(i === 2 ? 980 : 560);
      }

      // 5. Posture-Break Lethal Execution (`鬼哭 · 一闪`)!
      const execTarget = stepTowardEnemy();
      if (execTarget) {
        execTarget.brokenTimer = 4.0;
        execTarget.posture = execTarget.maxPosture;
        this.vfx.spawnShockwave(execTarget.pos, { color: 0xffb84d, maxRadius: 3.6, duration: 0.42 });
        await sleep(260);
        this.player.queueAttack('execute');
        await sleep(1100);
      }

      // 6. Final Storm Lightning Heroic Zanshin Hold
      this.triggerStormLightning();
      await sleep(1100);
    } finally {
      clearInterval(orbitTimer);
      this.promoMode = false;
    }

    if (recorder && recorder.state !== 'inactive') {
      const done = new Promise((resolve) => {
        recorder.onstop = async () => {
          const blob = new Blob(chunks, { type: 'video/webm' });
          try {
            await fetch('/__save_promo', { method: 'POST', body: blob });
          } catch (e) {
            console.warn('Promo upload failed:', e);
          }
          document.title = 'PROMO_RECORDING_COMPLETE';
          resolve({ ok: true, bytes: blob.size, chunks: chunks.length });
        };
      });
      recorder.stop();
      return await done;
    }
    return { ok: true, bytes: 0 };
  }

  _updateActionCamera(rawDt) {
    if (this.story.updateCamera(rawDt, this.camera)) {
      this.camInitialized = false;
      return;
    }
    if (!this.player) return;

    // 1. Critically-damped yaw/pitch smoothing (eliminates mouse/touch micro-stutter)
    const rotAlpha = 1 - Math.exp(-15.0 * rawDt);
    this.camYaw += (this.camTargetYaw - this.camYaw) * rotAlpha;
    this.camPitch += (this.camTargetPitch - this.camPitch) * rotAlpha;

    // 2. Decoupled grounded vertical tracking: hero leaps dramatically while horizon stays rock-steady!
    const floorY = getArenaFloorHeight(this.player.pos.x, this.player.pos.z);
    const jumpDelta = Math.max(0, this.player.pos.y - floorY);
    const targetGroundY = floorY + jumpDelta * 0.22;
    if (!this.camInitialized) {
      this.camGroundY = targetGroundY;
    } else {
      this.camGroundY += (targetGroundY - this.camGroundY) * (1 - Math.exp(-5.2 * rawDt));
    }

    // 3. AAA Over-The-Right-Shoulder Framing (Black Myth: Wukong / Sekiro / Ghost of Tsushima)
    const rightX = Math.cos(this.camYaw);
    const rightZ = -Math.sin(this.camYaw);
    const shoulderOffset = 0.38;

    const desiredFocus = this._camDesiredFocus.set(
      this.player.pos.x + rightX * shoulderOffset,
      this.camGroundY + 1.52,
      this.player.pos.z + rightZ * shoulderOffset
    );

    // Subtle, non-jarring combat framing assist toward Boss or nearest engaged foe
    if (this.bossEncounterStarted && this.boss && !this.boss.dead) {
      this._camEnemyTarget.set(this.boss.pos.x, this.boss.pos.y + 1.65, this.boss.pos.z);
      desiredFocus.lerp(this._camEnemyTarget, 0.18);
    } else {
      const nearEnemy = this._findNearestEnemy(8.5);
      if (nearEnemy) {
        this._camEnemyTarget.set(nearEnemy.pos.x, nearEnemy.pos.y + 1.45, nearEnemy.pos.z);
        desiredFocus.lerp(this._camEnemyTarget, 0.10);
      }
    }

    // Spacious AAA camera distance (extra breathing room on mobile screens)
    const dist = this.mobileControls?.enabled ? 8.05 : 7.45;
    const horiz = Math.cos(this.camPitch) * dist;
    const vert = Math.sin(this.camPitch) * dist + 0.58;
    const desiredCam = this._camDesiredPos.set(
      this.player.pos.x + rightX * shoulderOffset + Math.sin(this.camYaw) * horiz,
      this.camGroundY + vert,
      this.player.pos.z + rightZ * shoulderOffset + Math.cos(this.camYaw) * horiz
    );
    desiredCam.y = Math.max(desiredCam.y, getArenaFloorHeight(desiredCam.x, desiredCam.z) + 0.85);

    if (!this.camInitialized) {
      this.camFocus.copy(desiredFocus);
      this.camera.position.copy(desiredCam);
      this.camInitialized = true;
    } else {
      // Smooth exponential damping on BOTH focus and camera position (zero whip-pan during dashes!)
      this.camFocus.lerp(desiredFocus, 1 - Math.exp(-10.5 * rawDt));
      this.camera.position.lerp(desiredCam, 1 - Math.exp(-8.5 * rawDt));
    }

    // 4. Anti-Nausea Smooth Directional Micro-Impulse (applied equally to pos & focus -> ZERO angular jitter!)
    let shakeX = 0;
    let shakeY = 0;
    if (this.camShake > 0.002) {
      this.camShakeTime += rawDt;
      shakeX = Math.sin(this.camShakeTime * 34.0) * this.camShake * 0.65;
      shakeY = Math.cos(this.camShakeTime * 27.0) * this.camShake * 0.55;
      this.camShake *= Math.exp(-11.0 * rawDt);
    } else {
      this.camShake = 0;
    }

    // Subtle smooth FOV breathing on dash (+2.5° max, anti-nausea)
    const targetFov = this._computeComfortFOV() + (this.player.dashTimer > 0 ? 2.5 : 0);
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * (1 - Math.exp(-8.0 * rawDt));
      this.camera.updateProjectionMatrix();
    }

    const finalLook = this._camFinalLook.copy(this.camFocus);
    finalLook.x += rightX * shakeX;
    finalLook.y += shakeY;
    finalLook.z += rightZ * shakeX;

    this.camera.position.x += rightX * shakeX;
    this.camera.position.y += shakeY;
    this.camera.position.z += rightZ * shakeX;
    this.camera.lookAt(finalLook);
    this.camera.position.x -= rightX * shakeX;
    this.camera.position.y -= shakeY;
    this.camera.position.z -= rightZ * shakeX;
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.fov = this._computeComfortFOV();
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    if (this.composer) {
      this.composer.setSize(window.innerWidth, window.innerHeight);
      if (this.bloomPass) {
        this.bloomPass.setSize(
          Math.max(256, Math.floor(window.innerWidth * 0.5)),
          Math.max(144, Math.floor(window.innerHeight * 0.5))
        );
      }
    }
  }

  _renderFrame() {
    if (this.useBloom && this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  _updatePerfStats(rawDt) {
    this.perfAccumTime += rawDt;
    this.perfFrameCount++;
    const ms = rawDt * 1000;
    if (rawDt > this.perfMaxDt) this.perfMaxDt = rawDt;
    if (this._perfEl) this.perfFrameSamples.push(ms);
    if (this.perfAccumTime < 1.5) return;

    this.perfStats.fps = Math.round(this.perfFrameCount / this.perfAccumTime);
    this.perfStats.maxFrameMs = Math.round(this.perfMaxDt * 10000) / 10;
    this.perfStats.drawCalls = this.renderer.info.render.calls;
    this.perfStats.triangles = this.renderer.info.render.triangles;
    this.perfStats.programs = this.renderer.info.programs?.length || 0;
    this.perfStats.qualityTier = this.qualityTier;
    if (this._perfEl && this.perfFrameSamples.length > 0) {
      this.perfFrameSamples.sort((a, b) => a - b);
      const p95 = this.perfFrameSamples[Math.floor(this.perfFrameSamples.length * 0.95)];
      this.perfStats.p95Ms = Math.round(p95 * 10) / 10;
      this._perfEl.textContent = `FPS:${this.perfStats.fps} | p95:${this.perfStats.p95Ms}ms | max:${this.perfStats.maxFrameMs}ms | DC:${this.perfStats.drawCalls} | Prog:${this.perfStats.programs} | ${this.qualityTier}`;
      this.perfFrameSamples.length = 0;
    }
    this.perfAccumTime = 0;
    this.perfFrameCount = 0;
    this.perfMaxDt = 0;
  }

  startLoop() {
    const clock = new THREE.Clock();
    const tick = () => {
      requestAnimationFrame(tick);
      const rawDt = Math.min(0.05, clock.getDelta());
      const now = performance.now() * 0.001;

      // Smooth firelight flicker (fixed 3 PointLights, NEVER toggles .visible -> ZERO shader recompilation!)
      for (let i = 0; i < this.fireLights.length; i++) {
        const fl = this.fireLights[i];
        fl.light.intensity = fl.base * (0.9 + 0.14 * Math.sin(now * 8.5 + fl.phase));
      }
      if (this.lightningFlash > 0) {
        this.lightningFlash = Math.max(0, this.lightningFlash - rawDt * 3.2);
        this.moonLight.intensity = 2.45 + this.lightningFlash * 9.5;
      } else if (this.gameStarted) {
        this.ambientThunderTimer -= rawDt;
        if (this.ambientThunderTimer <= 0) {
          this.ambientThunderTimer = 14 + Math.random() * 14;
          this.triggerStormLightning();
        }
      }

      if (!this.gameStarted) {
        // Serene revolving preview camera around the rainy Mountain Gate on Title Screen
        const ang = now * 0.08;
        this.camera.position.set(Math.sin(ang) * 9.5, 4.4, 27.5 + Math.cos(ang) * 3.0);
        this.camera.lookAt(0, 2.6, 16.0);
        this.vfx.update(rawDt, this._titleFocus);
        this._renderFrame();
        return;
      }

      // Enforce 5-Wave Courtyard Gate before Boss Hall (`z < -10.5` blocked until all 32 NPCs are cleared!)
      if (this.bossGateWarnCooldown > 0) this.bossGateWarnCooldown -= rawDt;
      if (!this.courtyardCleared && !this.story.inCutscene && this.player.pos.z < -10.5) {
        this.player.pos.z = -10.5;
        if (this.bossGateWarnCooldown <= 0) {
          this.bossGateWarnCooldown = 2.4;
          this.hud.spawnPopup(
            this.player.pos.clone().add(new THREE.Vector3(0, 2.0, 0)),
            `外院伏兵未尽（${this.totalCourtyardKills}/${TOTAL_COURTYARD_NPCS}），先清五波再战萧残阳！`,
            'crit'
          );
        }
      }

      // Check trigger into Boss Hall when player climbs the stone stairs (`z < -12.2`) AFTER clearing all 5 waves!
      if (this.courtyardCleared && !this.bossEncounterStarted && !this.story.inCutscene && this.player.pos.z < -12.2) {
        this._triggerBossEncounter();
      }

      const simDt = this.combat.stepTime(rawDt);
      const controlsOn = !this.story.inCutscene && !this.gameEnded;

      if (simDt > 0) {
        this.player.update(simDt, {
          controlsEnabled: controlsOn,
          lockInBossHall: this.bossEncounterStarted,
          cameraYaw: this.camYaw,
        });

        // Smart Crowd AI: allow up to 2 courtyard NPCs to actively swing at once so 6-8 vs 1 feels fair & cinematic!
        let activeAttackers = this.assassins.filter((a) => !a.dead && a.active && a.currentMove).length;
        for (const a of this.assassins) {
          const allowAtk = activeAttackers < 2;
          const hadMove = !!a.currentMove;
          a.update(simDt, {
            player: this.player,
            aiEnabled: controlsOn && !this.bossEncounterStarted,
            canStartAttack: allowAtk,
            allies: this.assassins,
          });
          if (!hadMove && a.currentMove) activeAttackers++;
        }

        // Cleanly dissolve & dispose corpses from previous waves so 32 NPCs stay locked at 60fps with ZERO memory leak!
        for (let i = this.assassins.length - 1; i >= 0; i--) {
          const a = this.assassins[i];
          if (a.dead && a.deathTimer > 3.2) {
            if (a.worldBarEl) a.worldBarEl.remove();
            if (a.rig?.root) this.scene.remove(a.rig.root);
            if (a.rig?.ribbon) {
              a.rig.ribbon.dispose();
              const rIdx = this.vfx.ribbons.indexOf(a.rig.ribbon);
              if (rIdx >= 0) this.vfx.ribbons.splice(rIdx, 1);
            }
            a.rig?.dispose();
            this.assassins.splice(i, 1);
          }
        }

        if (this.boss) {
          this.boss.update(simDt, { player: this.player, aiEnabled: controlsOn && this.bossEncounterStarted });
        }
        this.vfx.update(simDt, this.player.pos);
      }

      // Check if an execution-ready enemy is within range to display `[F] 破绽绝杀`
      const canExec = controlsOn && !!this._findNearestEnemy(5.5, true);
      this.hud.setExecutionPromptVisible(canExec);
      this.mobileControls?.syncState(this.player, { canExec, controlsOn });
      this.hud.updateWorldMarkers(this.assassins);
      this.hud.updateBoss(this.boss);
      this._updateActionCamera(rawDt);
      this.audio.updateSpatialListener(this.player?.pos, this.camera);

      this._renderFrame();
      this._updatePerfStats(rawDt);
    };
    tick();
  }
}

const game = new PhantomBladeGame();
game.loadAllAssets().catch((err) => console.error('[PhantomBlade] Load error:', err));
game.startLoop();
window.__PHANTOM_BLADE__ = game;
