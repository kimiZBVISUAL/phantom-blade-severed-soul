import * as THREE from 'three';

/**
 * Hollywood / 3A Spatial & Dynamic WebAudio Engine (`AudioEngine.js`)
 * -------------------------------------------------------------------
 * - Lossless 44.1kHz Stereo Chinese Voiceovers (`manifest.json`) with exact duration sync
 * - Round-Robin Multi-Sample Foley Containers (eliminates repetitive machine-gun effect)
 * - Dual-Zone Acoustic Convolution Reverb (Open Rainy Courtyard <-> Cavernous Ruined Hall)
 * - Dynamic Sidechain Ducking (Parries, Executions & Dialogue automatically carve space in BGM/Ambience)
 * - 3D Camera-Space Stereo Panning, Distance Attenuation & Proximity Bronze Brazier Fire Audio
 */
const BRAZIER_POSITIONS = [
  new THREE.Vector3(0, 2.2, 5.5),
  new THREE.Vector3(-4.2, 3.6, 20.5),
  new THREE.Vector3(4.2, 3.6, 20.5),
  new THREE.Vector3(-5.2, 2.6, -8.8),
  new THREE.Vector3(5.2, 2.6, -8.8),
  new THREE.Vector3(0, 3.4, -26.2),
];

const SFX_POOLS = {
  slash_1: ['slash_light_1', 'slash_light_2', 'slash_light_3', 'slash_light_4'],
  slash_2: ['slash_light_2', 'slash_light_4', 'slash_light_1', 'slash_light_3'],
  slash_light: ['slash_light_1', 'slash_light_2', 'slash_light_3', 'slash_light_4'],
  slash_heavy: ['slash_heavy_1', 'slash_heavy_2', 'slash_heavy_3'],
  hit_light: ['hit_light_1', 'hit_light_2', 'hit_light_3', 'hit_light_4'],
  hit_heavy: ['hit_heavy_1', 'hit_heavy_2', 'hit_heavy_3'],
  parry: ['parry_perfect_1', 'parry_perfect_2', 'parry_perfect_3'],
  guard_block: ['guard_block_1', 'guard_block_2'],
  dash: ['dash_1', 'dash_2'],
  step_wet: ['step_wet_1', 'step_wet_2', 'step_wet_3', 'step_wet_4'],
  step_stone: ['step_stone_1', 'step_stone_2', 'step_stone_3', 'step_stone_4'],
  thunder: ['thunder_1', 'thunder_2', 'thunder_3'],
  parry_stance: ['parry_stance'],
  perilous_kan: ['perilous_kan'],
  posture_break: ['posture_break'],
  execution_oneslash: ['execution_oneslash'],
  shatter_vase: ['shatter_vase'],
  shatter_crate: ['shatter_crate'],
  gourd_drink: ['gourd_drink'],
  vox_hun_hurt: ['vox_hun_hurt_1', 'vox_hun_hurt_2', 'vox_hun_hurt_3'],
  vox_boss_grunt: ['vox_boss_grunt_1', 'vox_boss_grunt_2', 'vox_boss_grunt_3'],
  vox_assassin_hurt: ['vox_assassin_hurt_1', 'vox_assassin_hurt_2'],
  vox_assassin_die: ['vox_assassin_die_1', 'vox_assassin_die_2'],
  vox_kunoichi_hurt: ['vox_kunoichi_hurt_1', 'vox_kunoichi_hurt_2'],
  vox_kunoichi_die: ['vox_kunoichi_die_1', 'vox_kunoichi_die_2'],
  vox_breath_ragged: ['vox_breath_ragged'],
};

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.buffers = new Map();
    this.voManifest = new Map();
    this.lastPoolPick = new Map();

    this.currentBGM = null;
    this.currentBGMKey = null;
    this.currentVOSource = null;
    this.currentVOPriority = 0;
    this.activeCombatVoices = new Set();
    this.ambienceStarted = false;
    this.breathGain = null;

    this.masterGain = null;
    this.compressor = null;
    this.bgmGain = null;
    this.sfxGain = null;
    this.reverbConvolver = null;
    this.reverbSendGain = null;
    this.ambGain = null;
    this.voGain = null;

    this.rainFilter = null;
    this.rainGain = null;
    this.hallAmbGain = null;
    this.fireGain = null;
    this.firePanner = null;

    this.baseBgmVol = 0.44;
    this.baseAmbVol = 0.62;
    this.recordDest = null;
    this._tmpVec = new THREE.Vector3();
    this._camRight = new THREE.Vector3(1, 0, 0);
    this._listenerPos = new THREE.Vector3();
  }

  _buildHallImpulseResponse() {
    const sr = this.ctx.sampleRate;
    const dur = 1.85;
    const len = Math.floor(sr * dur);
    const ir = this.ctx.createBuffer(2, len, sr);
    const preDelay = Math.floor(sr * 0.024);

    for (let ch = 0; ch < 2; ch++) {
      const data = ir.getChannelData(ch);
      let lp = 0;
      for (let i = preDelay; i < len; i++) {
        const t = (i - preDelay) / sr;
        const decay = Math.exp(-6.9 * t / dur);
        const white = Math.random() * 2 - 1;
        lp += 0.24 * (white - lp);
        data[i] = lp * decay * 0.36;
      }
      // Crisp early stone column reflections
      const taps = ch === 0 ? [0.009, 0.017, 0.029] : [0.012, 0.021, 0.034];
      taps.forEach((sec, idx) => {
        const k = Math.floor(sr * sec);
        if (k < len) data[k] += 0.28 / (idx + 1);
      });
    }
    return ir;
  }

  getRecordingStream() {
    if (!this.ctx || !this.masterGain) return null;
    if (!this.recordDest) {
      this.recordDest = this.ctx.createMediaStreamDestination();
      this.masterGain.connect(this.recordDest);
    }
    return this.recordDest.stream;
  }

  async preload(onProgress) {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();

    // Master glue limiter/compressor for Hollywood headroom & punch
    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -5.5;
    this.compressor.knee.value = 10;
    this.compressor.ratio.value = 4.2;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.14;

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.94;
    this.compressor.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);

    this.bgmGain = this.ctx.createGain();
    this.bgmGain.gain.value = this.baseBgmVol;
    this.bgmGain.connect(this.compressor);

    this.ambGain = this.ctx.createGain();
    this.ambGain.gain.value = this.baseAmbVol;
    this.ambGain.connect(this.compressor);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.92;
    this.sfxGain.connect(this.compressor);

    // Real-time Stone Hall / Courtyard Convolution Reverb Bus
    this.reverbConvolver = this.ctx.createConvolver();
    this.reverbConvolver.buffer = this._buildHallImpulseResponse();
    this.reverbSendGain = this.ctx.createGain();
    this.reverbSendGain.gain.value = 0.22;
    this.reverbConvolver.connect(this.reverbSendGain);
    this.reverbSendGain.connect(this.compressor);

    this.voGain = this.ctx.createGain();
    this.voGain.gain.value = 1.12;
    this.voGain.connect(this.compressor);

    const manifestRes = await fetch('/assets/audio/vo/manifest.json');
    const manifestList = await manifestRes.json();
    for (const item of manifestList) {
      this.voManifest.set(item.id, item);
    }

    const uniqueSfxFiles = new Set(Object.values(SFX_POOLS).flat());
    const assetEntries = [
      ['bgm_courtyard', '/assets/audio/bgm/bgm_courtyard.wav'],
      ['bgm_boss', '/assets/audio/bgm/bgm_boss_phase1.wav'],
      ['bgm_boss_phase2', '/assets/audio/bgm/bgm_boss_phase2.wav'],
      ['amb_rain_courtyard', '/assets/audio/sfx/amb_rain_courtyard.wav'],
      ['amb_temple_drips', '/assets/audio/sfx/amb_temple_drips.wav'],
      ['amb_fire_brazier', '/assets/audio/sfx/amb_fire_brazier.wav'],
      ...Array.from(uniqueSfxFiles).map((f) => [f, `/assets/audio/sfx/${f}.wav`]),
      ...manifestList.map((vo) => [`vo:${vo.id}`, `/assets/audio/vo/${vo.file || `${vo.id}.wav`}`]),
    ];

    let loaded = 0;
    await Promise.all(
      assetEntries.map(async ([key, url]) => {
        try {
          const res = await fetch(url);
          const arr = await res.arrayBuffer();
          const audioBuf = await this.ctx.decodeAudioData(arr);
          this.buffers.set(key, audioBuf);
        } catch (err) {
          console.warn('[AudioEngine] Failed to decode:', url, err);
        } finally {
          loaded++;
          if (onProgress) onProgress(loaded / assetEntries.length);
        }
      })
    );
  }

  getVODuration(voId) {
    const buf = this.buffers.get(`vo:${voId}`);
    if (buf) return buf.duration;
    const meta = this.voManifest.get(voId);
    return meta?.duration || 3.5;
  }

  isPlayingVO() {
    return !!this.currentVOSource;
  }

  async unlock() {
    if (this.ctx && this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
    this._startEnvironmentalLayers();
  }

  _startEnvironmentalLayers() {
    if (!this.ctx || this.ambienceStarted) return;
    this.ambienceStarted = true;

    // 1. Exterior Storm Rain Layer (occludes smoothly when entering Grand Temple Hall!)
    const rainBuf = this.buffers.get('amb_rain_courtyard');
    if (rainBuf) {
      const src = this.ctx.createBufferSource();
      src.buffer = rainBuf;
      src.loop = true;
      this.rainFilter = this.ctx.createBiquadFilter();
      this.rainFilter.type = 'lowpass';
      this.rainFilter.frequency.value = 15000;
      this.rainGain = this.ctx.createGain();
      this.rainGain.gain.value = 0.42;
      src.connect(this.rainFilter);
      this.rainFilter.connect(this.rainGain);
      this.rainGain.connect(this.ambGain);
      src.start();
    }

    // 2. Interior Ruined Sanctuary Eaves Drips & Dark Room Tone
    const hallBuf = this.buffers.get('amb_temple_drips');
    if (hallBuf) {
      const src = this.ctx.createBufferSource();
      src.buffer = hallBuf;
      src.loop = true;
      this.hallAmbGain = this.ctx.createGain();
      this.hallAmbGain.gain.value = 0.08;
      src.connect(this.hallAmbGain);
      this.hallAmbGain.connect(this.ambGain);
      src.start();
    }

    // 3. 3D Proximity Crackling Bronze Brazier Fire
    const fireBuf = this.buffers.get('amb_fire_brazier');
    if (fireBuf) {
      const src = this.ctx.createBufferSource();
      src.buffer = fireBuf;
      src.loop = true;
      this.firePanner = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
      this.fireGain = this.ctx.createGain();
      this.fireGain.gain.value = 0.16;
      if (this.firePanner) {
        src.connect(this.firePanner);
        this.firePanner.connect(this.fireGain);
      } else {
        src.connect(this.fireGain);
      }
      this.fireGain.connect(this.ambGain);
      src.start();
    }

    // 4. Protagonist Near-Death Ragged Panting Loop (muted until HP < 38%)
    const breathBuf = this.buffers.get('vox_breath_ragged');
    if (breathBuf) {
      const src = this.ctx.createBufferSource();
      src.buffer = breathBuf;
      src.loop = true;
      this.breathGain = this.ctx.createGain();
      this.breathGain.gain.value = 0.0001;
      src.connect(this.breathGain);
      this.breathGain.connect(this.sfxGain);
      src.start();
    }
  }

  setLowHealthAgony(isCritical) {
    if (!this.ctx || !this.breathGain) return;
    this.breathGain.gain.setTargetAtTime(isCritical ? 0.34 : 0.0001, this.ctx.currentTime, 0.35);
  }

  /**
   * Updates dual-zone reverb mix, roof rain occlusion, and 3D brazier fire panning each frame.
   */
  updateSpatialListener(playerPos, camera) {
    if (!this.ctx || !playerPos || !camera) return;
    this._listenerPos.copy(playerPos);
    this._camRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
    this._camRight.y = 0;
    if (this._camRight.lengthSq() > 0.001) this._camRight.normalize();

    const now = this.ctx.currentTime;
    // Transition smoothly between Open Rainy Courtyard (z > -9.5) and Grand Ruined Hall (z < -13.0)
    const hallBlend = Math.max(0, Math.min(1, (-9.5 - playerPos.z) / 4.0));

    if (this.reverbSendGain) {
      this.reverbSendGain.gain.setTargetAtTime(0.16 + hallBlend * 0.24, now, 0.18);
    }
    if (this.rainFilter && this.rainGain) {
      this.rainFilter.frequency.setTargetAtTime(15000 - hallBlend * 12600, now, 0.25);
      this.rainGain.gain.setTargetAtTime(0.42 - hallBlend * 0.20, now, 0.25);
    }
    if (this.hallAmbGain) {
      this.hallAmbGain.gain.setTargetAtTime(0.08 + hallBlend * 0.34, now, 0.25);
    }

    // Nearest burning bronze brazier spatial proximity & stereo pan
    if (this.fireGain) {
      let bestDist = 999;
      let bestBrazier = null;
      for (const bp of BRAZIER_POSITIONS) {
        const d = bp.distanceTo(playerPos);
        if (d < bestDist) {
          bestDist = d;
          bestBrazier = bp;
        }
      }
      const prox = Math.max(0, 1 - bestDist / 15.0);
      this.fireGain.gain.setTargetAtTime(0.03 + prox * prox * 0.36, now, 0.12);
      if (this.firePanner && bestBrazier) {
        this._tmpVec.subVectors(bestBrazier, playerPos);
        this._tmpVec.y = 0;
        const pan = Math.max(-0.85, Math.min(0.85, this._tmpVec.dot(this._camRight) * 0.12));
        this.firePanner.pan.setTargetAtTime(pan, now, 0.12);
      }
    }
  }

  _duckBus(bgmTarget, ambTarget, holdSec = 0.26) {
    if (!this.ctx || !this.bgmGain || !this.ambGain) return;
    const now = this.ctx.currentTime;
    this.bgmGain.gain.setTargetAtTime(bgmTarget, now, 0.025);
    this.ambGain.gain.setTargetAtTime(ambTarget, now, 0.025);
    setTimeout(() => {
      if (!this.ctx || this.currentVOSource) return;
      const t2 = this.ctx.currentTime;
      this.bgmGain.gain.setTargetAtTime(this.baseBgmVol, t2, 0.28);
      this.ambGain.gain.setTargetAtTime(this.baseAmbVol, t2, 0.28);
    }, holdSec * 1000);
  }

  playBGM(key, playbackRate = 1.0) {
    if (!this.ctx || !this.buffers.has(key)) return;
    if (this.currentBGMKey === key && this.currentBGM) {
      this.currentBGM.src.playbackRate.setTargetAtTime(playbackRate, this.ctx.currentTime, 0.45);
      return;
    }

    const now = this.ctx.currentTime;
    if (this.currentBGM) {
      const old = this.currentBGM;
      old.gain.gain.setTargetAtTime(0.0001, now, 0.42);
      setTimeout(() => {
        try { old.src.stop(); } catch (_) {}
      }, 1800);
    }

    const src = this.ctx.createBufferSource();
    src.buffer = this.buffers.get(key);
    src.loop = true;
    src.playbackRate.value = playbackRate;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(1.0, now + 1.25);

    src.connect(gain);
    gain.connect(this.bgmGain);
    src.start();

    this.currentBGM = { src, gain };
    this.currentBGMKey = key;
  }

  _pickFromPool(key) {
    const pool = SFX_POOLS[key];
    if (!pool || pool.length === 0) return key;
    if (pool.length === 1) return pool[0];
    const prev = this.lastPoolPick.get(key) ?? -1;
    let idx = Math.floor(Math.random() * pool.length);
    if (idx === prev) idx = (idx + 1) % pool.length;
    this.lastPoolPick.set(key, idx);
    return pool[idx];
  }

  playSFX(key, { volume = 1.0, pitch = 1.0, pitchJitter = 0.055, worldPos = null, reverbSend = 0.28 } = {}) {
    if (!this.ctx) return;
    const resolvedKey = this._pickFromPool(key);
    const buf = this.buffers.get(resolvedKey);
    if (!buf) return;

    // Trigger Sekiro-style sidechain ducking on pinnacle combat impacts!
    if (key === 'parry' || key === 'execution_oneslash' || key === 'posture_break') {
      this._duckBus(this.baseBgmVol * 0.48, this.baseAmbVol * 0.55, 0.30);
    }

    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const rate = pitch * (1.0 + (Math.random() * 2 - 1) * pitchJitter);
    src.playbackRate.value = Math.max(0.55, Math.min(1.75, rate));

    let atten = 1.0;
    let panVal = 0.0;
    if (worldPos && this._listenerPos) {
      const dist = worldPos.distanceTo(this._listenerPos);
      atten = Math.max(0.18, Math.min(1.0, 1.0 / (1.0 + Math.max(0, dist - 2.5) * 0.085)));
      this._tmpVec.subVectors(worldPos, this._listenerPos);
      this._tmpVec.y = 0;
      panVal = Math.max(-0.82, Math.min(0.82, this._tmpVec.dot(this._camRight) * 0.14));
    }

    const gain = this.ctx.createGain();
    gain.gain.value = volume * atten;

    if (this.ctx.createStereoPanner && Math.abs(panVal) > 0.01) {
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = panVal;
      src.connect(panner);
      panner.connect(gain);
    } else {
      src.connect(gain);
    }

    gain.connect(this.sfxGain);
    if (this.reverbConvolver && reverbSend > 0) {
      const send = this.ctx.createGain();
      send.gain.value = reverbSend;
      gain.connect(send);
      send.connect(this.reverbConvolver);
    }
    src.start();
  }

  /**
   * Plays a studio-mastered stereo Chinese VO track with priority scheduling, ducks BGM/Ambience, and resolves when done.
   */
  playVO(voId, onSubtitle, { priority = 10 } = {}) {
    return new Promise((resolve) => {
      if (this.currentVOSource && priority < this.currentVOPriority) {
        resolve();
        return;
      }

      const meta = this.voManifest.get(voId);
      const buf = this.buffers.get(`vo:${voId}`);
      if (meta && onSubtitle) {
        onSubtitle(meta.speaker, `“${meta.text}”`);
      }

      if (!this.ctx || !buf) {
        setTimeout(resolve, (meta?.duration || 2.8) * 1000);
        return;
      }

      if (this.currentVOSource) {
        try { this.currentVOSource.stop(); } catch (_) {}
      }

      const now = this.ctx.currentTime;
      this.bgmGain.gain.setTargetAtTime(this.baseBgmVol * 0.42, now, 0.10);
      this.ambGain.gain.setTargetAtTime(this.baseAmbVol * 0.55, now, 0.10);

      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.voGain);
      this.currentVOSource = src;
      this.currentVOPriority = priority;

      src.onended = () => {
        if (this.currentVOSource === src) {
          this.currentVOSource = null;
          this.currentVOPriority = 0;
          const tEnd = this.ctx.currentTime;
          this.bgmGain.gain.setTargetAtTime(this.baseBgmVol, tEnd, 0.35);
          this.ambGain.gain.setTargetAtTime(this.baseAmbVol, tEnd, 0.35);
        }
        resolve();
      };
      src.start();
    });
  }

  /**
   * Plays an overlapping polyphonic combat agony/taunt/ravage voice line in 3D stereo space
   * without cutting off simultaneous battle cries (just like real cinema actors clashing!).
   */
  playCombatVoice(voId, onSubtitle = null, { worldPos = null, volume = 1.0 } = {}) {
    if (!this.ctx) return;
    // Never talk over story cutscenes (priority >= 9)
    if (this.currentVOSource && this.currentVOPriority >= 9) return;
    const meta = this.voManifest.get(voId);
    const buf = this.buffers.get(`vo:${voId}`);
    if (!buf) return;
    if (meta && onSubtitle) {
      onSubtitle(meta.speaker, `“${meta.text}”`);
    }

    this._duckBus(this.baseBgmVol * 0.48, this.baseAmbVol * 0.62, Math.min(3.5, buf.duration));
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const gain = this.ctx.createGain();
    gain.gain.value = volume;

    if (worldPos && this._listenerPos && this.ctx.createStereoPanner) {
      this._tmpVec.subVectors(worldPos, this._listenerPos);
      this._tmpVec.y = 0;
      const pan = Math.max(-0.65, Math.min(0.65, this._tmpVec.dot(this._camRight) * 0.12));
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = pan;
      src.connect(panner);
      panner.connect(gain);
    } else {
      src.connect(gain);
    }
    gain.connect(this.voGain);
    this.activeCombatVoices.add(src);
    src.onended = () => this.activeCombatVoices.delete(src);
    src.start();
  }

  stopVO() {
    if (this.currentVOSource) {
      try { this.currentVOSource.stop(); } catch (_) {}
      this.currentVOSource = null;
      this.currentVOPriority = 0;
    }
    for (const s of this.activeCombatVoices) {
      try { s.stop(); } catch (_) {}
    }
    this.activeCombatVoices.clear();
    if (this.ctx && this.bgmGain && this.ambGain) {
      const now = this.ctx.currentTime;
      this.bgmGain.gain.setTargetAtTime(this.baseBgmVol, now, 0.25);
      this.ambGain.gain.setTargetAtTime(this.baseAmbVol, now, 0.25);
    }
  }
}
