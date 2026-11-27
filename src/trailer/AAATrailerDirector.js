import * as THREE from 'three';

/**
 * International 3A Game Trailer Director & Audio-Visual Composite Recorder (`AAATrailerDirector.js`)
 * --------------------------------------------------------------------------------------------------
 * Follows Derek Lieu + *Phantom Blade Zero* / *Black Myth: Wukong* / *Sekiro* 3A trailer architecture:
 *   - 2.39:1 Cinemascope anamorphic letterbox + subtle film vignette & drifting ember particles
 *   - Synchronized 1280x720 WebGL + 2D Motion-Graphics Composite Canvas + Stereo WebAudio Master Bus
 *   - Act 0: 2.8s Cold-Open Lightning Blade-Draw & Parry Hook
 *   - Act 1: 3A Opening Slates — `斌哥哥 Game Studio` + `《战魂》 (WAR SOUL)`
 *   - Act 2: Rainy Courtyard Ambush & Emotional VoxCPM-2 Chinese Dialogue Confrontation
 *   - Act 3: Escalating Gameplay & Full Skill Montage (4-Hit Combo, 影杀三绝, 完美振刀, 赤霄破阵)
 *   - Act 4: Climax — Nemesis Boss Showdown (`血衣堂主 · 萧残阳`) + Phase 2 Awakening + `鬼哭·一闪` Button
 *   - Act 5: 3A Ending Slate (`《战魂》`, `斌哥哥 Game Studio`, Platforms, `立即加入愿望单 · WISHLIST NOW`)
 */
export class AAATrailerDirector {
  constructor(game) {
    this.game = game;
    this.width = 1280;
    this.height = 720;

    this.compCanvas = document.createElement('canvas');
    this.compCanvas.width = this.width;
    this.compCanvas.height = this.height;
    this.ctx = this.compCanvas.getContext('2d');

    this.running = false;
    this.camOverride = null; // { pos: Vector3, lookAt: Vector3 }
    this.overlayState = {
      mode: 'gameplay', // 'gameplay' | 'studio_slate' | 'title_slate' | 'end_slate' | 'black'
      fadeBlack: 0.0,
      flashWhite: 0.0,
      letterbox: 1.0,
      showEngineBadge: false,
      subtitleSpeaker: '',
      subtitleText: '',
      skillTitle: '',
      skillSub: '',
      skillAlpha: 0.0,
      slateAlpha: 0.0,
    };

    // Drifting golden embers for opening & ending slates
    this.embers = Array.from({ length: 48 }, () => ({
      x: Math.random() * this.width,
      y: Math.random() * this.height,
      vx: (Math.random() - 0.3) * 28,
      vy: -18 - Math.random() * 42,
      r: 1.0 + Math.random() * 2.4,
      a: 0.25 + Math.random() * 0.75,
    }));
  }

  _sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  _setSubtitle(speaker, text) {
    this.overlayState.subtitleSpeaker = speaker || '';
    this.overlayState.subtitleText = text || '';
  }

  _flashSkill(title, sub, durationMs = 1500) {
    this.overlayState.skillTitle = title;
    this.overlayState.skillSub = sub;
    this.overlayState.skillAlpha = 1.0;
    setTimeout(() => {
      if (this.overlayState.skillTitle === title) {
        this.overlayState.skillAlpha = 0.0;
      }
    }, durationMs);
  }

  _drawCompositeFrame(dt) {
    const ctx = this.ctx;
    const W = this.width;
    const H = this.height;
    const st = this.overlayState;

    ctx.save();
    // 1. Base layer: live WebGL canvas or dark ink backdrop
    if (st.mode === 'gameplay') {
      ctx.drawImage(this.game.canvas, 0, 0, W, H);
      // Subtle cinematic vignette
      const vig = ctx.createRadialGradient(W * 0.5, H * 0.5, H * 0.28, W * 0.5, H * 0.5, W * 0.65);
      vig.addColorStop(0, 'rgba(0,0,0,0)');
      vig.addColorStop(1, 'rgba(0,0,0,0.48)');
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, W, H);
    } else {
      const bg = ctx.createRadialGradient(W * 0.5, H * 0.45, 40, W * 0.5, H * 0.5, W * 0.68);
      bg.addColorStop(0, '#161113');
      bg.addColorStop(0.55, '#09090d');
      bg.addColorStop(1, '#020204');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // Drifting golden/crimson embers
      for (const e of this.embers) {
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        if (e.y < -10) { e.y = H + 10; e.x = Math.random() * W; }
        if (e.x > W + 10) e.x = -10;
        ctx.fillStyle = `rgba(245, 178, 86, ${e.a * 0.65})`;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 2. 2.39:1 Cinemascope Letterbox Bars (82px top & bottom)
    if (st.letterbox > 0.01) {
      const barH = Math.round(82 * st.letterbox);
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, W, barH);
      ctx.fillRect(0, H - barH, W, barH);
    }

    // 3. In-Engine Gameplay Capture Badge (top-right inside frame)
    if (st.mode === 'gameplay' && st.showEngineBadge) {
      ctx.fillStyle = 'rgba(8, 10, 14, 0.55)';
      ctx.fillRect(W - 266, 96, 236, 28);
      ctx.strokeStyle = 'rgba(218, 178, 102, 0.45)';
      ctx.lineWidth = 1;
      ctx.strokeRect(W - 266, 96, 236, 28);
      ctx.fillStyle = 'rgba(235, 220, 185, 0.9)';
      ctx.font = '600 12px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('实机画面录制 · CAPTURED IN-ENGINE', W - 42, 114);
    }

    // 4. Calligraphic Skill Stamp (left-mid during combat montage)
    if (st.mode === 'gameplay' && st.skillAlpha > 0.02 && st.skillTitle) {
      ctx.save();
      ctx.globalAlpha = st.skillAlpha;
      const gx = ctx.createLinearGradient(36, 0, 380, 0);
      gx.addColorStop(0, 'rgba(130, 14, 22, 0.85)');
      gx.addColorStop(0.75, 'rgba(22, 12, 14, 0.65)');
      gx.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = gx;
      ctx.fillRect(36, 120, 350, 74);

      ctx.fillStyle = '#d9a441';
      ctx.fillRect(36, 120, 4, 74);

      ctx.textAlign = 'left';
      ctx.fillStyle = '#f8e6be';
      ctx.font = '700 32px "Songti SC", "STSong", "PingFang SC", serif';
      ctx.fillText(st.skillTitle, 54, 158);

      ctx.fillStyle = '#e59a54';
      ctx.font = '500 14px "PingFang SC", sans-serif';
      ctx.fillText(st.skillSub, 56, 182);
      ctx.restore();
    }

    // 5. Cinema Dialogue Subtitles (centered cleanly above bottom letterbox)
    if (st.mode === 'gameplay' && st.subtitleText) {
      const subY = H - 104;
      const gSub = ctx.createLinearGradient(0, subY - 56, 0, H - 82);
      gSub.addColorStop(0, 'rgba(0,0,0,0)');
      gSub.addColorStop(1, 'rgba(0,0,0,0.72)');
      ctx.fillStyle = gSub;
      ctx.fillRect(0, subY - 56, W, 56);

      ctx.textAlign = 'center';
      if (st.subtitleSpeaker) {
        ctx.fillStyle = '#e5b968';
        ctx.font = '600 15px "PingFang SC", sans-serif';
        ctx.fillText(`—  ${st.subtitleSpeaker}  —`, W * 0.5, subY - 26);
      }
      ctx.fillStyle = '#f5f2eb';
      ctx.font = '600 22px "Songti SC", "PingFang SC", serif';
      ctx.shadowColor = 'rgba(0,0,0,0.9)';
      ctx.shadowBlur = 8;
      ctx.fillText(st.subtitleText, W * 0.5, subY + 4);
      ctx.shadowBlur = 0;
    }

    // 6. Opening Studio Slate (`斌哥哥 Game Studio`)
    if (st.mode === 'studio_slate') {
      ctx.save();
      ctx.globalAlpha = st.slateAlpha;
      ctx.textAlign = 'center';
      // Gold horizontal accent lines
      ctx.strokeStyle = 'rgba(214, 168, 86, 0.55)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(W * 0.5 - 220, H * 0.5 - 52);
      ctx.lineTo(W * 0.5 + 220, H * 0.5 - 52);
      ctx.moveTo(W * 0.5 - 220, H * 0.5 + 56);
      ctx.lineTo(W * 0.5 + 220, H * 0.5 + 56);
      ctx.stroke();

      const goldGrad = ctx.createLinearGradient(0, H * 0.5 - 30, 0, H * 0.5 + 20);
      goldGrad.addColorStop(0, '#fff2cf');
      goldGrad.addColorStop(0.5, '#d8a64e');
      goldGrad.addColorStop(1, '#8c5e1c');
      ctx.fillStyle = goldGrad;
      ctx.font = '700 46px "Songti SC", "PingFang SC", serif';
      ctx.fillText('斌哥哥 Game Studio', W * 0.5, H * 0.5 + 8);

      ctx.fillStyle = 'rgba(220, 210, 195, 0.82)';
      ctx.font = '500 16px "PingFang SC", sans-serif';
      ctx.fillText('P R E S E N T S   ·   倾 力 巨 献', W * 0.5, H * 0.5 + 42);
      ctx.restore();
    }

    // 7. Opening Title Slate (`《战魂》 · WAR SOUL`)
    if (st.mode === 'title_slate') {
      ctx.save();
      ctx.globalAlpha = st.slateAlpha;
      // Crimson sword slash behind title
      const slashGrad = ctx.createLinearGradient(W * 0.22, H * 0.58, W * 0.78, H * 0.42);
      slashGrad.addColorStop(0, 'rgba(180, 18, 28, 0)');
      slashGrad.addColorStop(0.5, 'rgba(215, 28, 38, 0.85)');
      slashGrad.addColorStop(1, 'rgba(180, 18, 28, 0)');
      ctx.strokeStyle = slashGrad;
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(W * 0.20, H * 0.57);
      ctx.lineTo(W * 0.80, H * 0.43);
      ctx.stroke();

      ctx.textAlign = 'center';
      const titleGrad = ctx.createLinearGradient(0, H * 0.36, 0, H * 0.56);
      titleGrad.addColorStop(0, '#fff7df');
      titleGrad.addColorStop(0.45, '#e5b962');
      titleGrad.addColorStop(1, '#9a6520');
      ctx.fillStyle = titleGrad;
      ctx.shadowColor = 'rgba(225, 165, 65, 0.45)';
      ctx.shadowBlur = 24;
      ctx.font = '900 116px "Songti SC", "STSong", "PingFang SC", serif';
      ctx.fillText('战 魂', W * 0.5, H * 0.53);
      ctx.shadowBlur = 0;

      ctx.fillStyle = 'rgba(235, 224, 200, 0.88)';
      ctx.font = '600 20px "Georgia", serif';
      ctx.fillText('W A R   S O U L', W * 0.5, H * 0.60);
      ctx.restore();
    }

    // 8. 3A Ending Slate (`《战魂》` + `斌哥哥 Game Studio` + Platforms + Wishlist CTA)
    if (st.mode === 'end_slate') {
      ctx.save();
      ctx.globalAlpha = st.slateAlpha;
      ctx.textAlign = 'center';

      // Crimson brush slash
      const sGrad = ctx.createLinearGradient(W * 0.25, H * 0.39, W * 0.75, H * 0.31);
      sGrad.addColorStop(0, 'rgba(180, 18, 28, 0)');
      sGrad.addColorStop(0.5, 'rgba(210, 26, 36, 0.82)');
      sGrad.addColorStop(1, 'rgba(180, 18, 28, 0)');
      ctx.strokeStyle = sGrad;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(W * 0.24, H * 0.39);
      ctx.lineTo(W * 0.76, H * 0.31);
      ctx.stroke();

      // Main Title
      const tGrad = ctx.createLinearGradient(0, H * 0.22, 0, H * 0.42);
      tGrad.addColorStop(0, '#fff7e0');
      tGrad.addColorStop(0.5, '#e5b962');
      tGrad.addColorStop(1, '#96611c');
      ctx.fillStyle = tGrad;
      ctx.shadowColor = 'rgba(225, 165, 65, 0.4)';
      ctx.shadowBlur = 22;
      ctx.font = '900 96px "Songti SC", "STSong", serif';
      ctx.fillText('战 魂', W * 0.5, H * 0.38);
      ctx.shadowBlur = 0;

      ctx.fillStyle = 'rgba(232, 220, 198, 0.86)';
      ctx.font = '600 18px "Georgia", serif';
      ctx.fillText('W A R   S O U L', W * 0.5, H * 0.44);

      // Studio Credit
      ctx.fillStyle = '#d9aa56';
      ctx.font = '600 22px "PingFang SC", serif';
      ctx.fillText('斌哥哥 Game Studio', W * 0.5, H * 0.52);

      // Wishlist CTA Box
      const bx = W * 0.5 - 190, by = H * 0.57, bw = 380, bh = 48;
      ctx.fillStyle = 'rgba(155, 18, 26, 0.85)';
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = '#e5b962';
      ctx.lineWidth = 1.8;
      ctx.strokeRect(bx, by, bw, bh);
      ctx.fillStyle = '#fff5dc';
      ctx.font = '700 20px "PingFang SC", sans-serif';
      ctx.fillText('立即加入愿望单  ·  WISHLIST NOW', W * 0.5, by + 31);

      // Platform Row
      ctx.fillStyle = 'rgba(230, 226, 218, 0.9)';
      ctx.font = '600 15px "PingFang SC", sans-serif';
      ctx.fillText('PC (STEAM / EPIC)    |    PlayStation®5    |    Xbox Series X|S', W * 0.5, H * 0.72);

      // Release Window & Rating Footer
      ctx.fillStyle = 'rgba(175, 170, 162, 0.75)';
      ctx.font = '500 13px "PingFang SC", sans-serif';
      ctx.fillText('2026 全球同步发售   ·   全实机引擎录制   ·   适龄提示 16+', W * 0.5, H * 0.78);
      ctx.restore();
    }

    // 9. Flash White & Fade Black transitions
    if (st.flashWhite > 0.01) {
      ctx.fillStyle = `rgba(255, 248, 232, ${st.flashWhite})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (st.fadeBlack > 0.01) {
      ctx.fillStyle = `rgba(0, 0, 0, ${st.fadeBlack})`;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }

  async _fadeTo(target, ms = 350) {
    const start = this.overlayState.fadeBlack;
    const steps = Math.max(1, Math.round(ms / 25));
    for (let i = 1; i <= steps; i++) {
      this.overlayState.fadeBlack = start + (target - start) * (i / steps);
      await this._sleep(ms / steps);
    }
    this.overlayState.fadeBlack = target;
  }

  async _playVOTrimmed(voId, maxMs) {
    const audio = this.game.audio;
    const entry = audio.voManifest.get(voId);
    if (!entry) return;
    this._setSubtitle(entry.speaker, entry.text);
    audio.playVO(voId, () => {});
    await this._sleep(maxMs);
  }

  async runAndRecord({ filename = 'war_soul_aaa_trailer.webm' } = {}) {
    const game = this.game;
    if (!game.gameStarted) await game.startGame({ skipIntro: true });
    this.running = true;
    game.promoMode = true;

    // Hide DOM HUD during pure cinematic trailer capture (our 2D composite renders crisp cinema overlays!)
    const hudEl = document.getElementById('hud-root');
    if (hudEl) hudEl.style.opacity = '0';

    // Start composite render loop synced to rAF
    let lastT = performance.now();
    let compRaf = 0;
    const pump = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastT) * 0.001);
      lastT = now;
      if (this.camOverride) {
        game.camera.position.lerp(this.camOverride.pos, Math.min(1, dt * 8));
        game.camera.lookAt(this.camOverride.lookAt);
      }
      this._drawCompositeFrame(dt);
      if (this.running) compRaf = requestAnimationFrame(pump);
    };
    pump();

    // Merge 1280x720 Composite Video Stream + Stereo WebAudio Master Stream!
    const videoStream = this.compCanvas.captureStream(30);
    const audioStream = game.audio.getRecordingStream();
    const combinedTracks = [...videoStream.getVideoTracks()];
    if (audioStream) combinedTracks.push(...audioStream.getAudioTracks());
    const combined = new MediaStream(combinedTracks);

    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus'
      : 'video/webm';
    const chunks = [];
    const recorder = new MediaRecorder(combined, {
      mimeType: mime,
      videoBitsPerSecond: 8_500_000,
      audioBitsPerSecond: 192_000,
    });
    recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
    recorder.start(250);

    const snapToEnemy = (range = 24) => {
      const t = game._findNearestEnemy(range);
      if (!t) return null;
      const dx = t.pos.x - game.player.pos.x;
      const dz = t.pos.z - game.player.pos.z;
      const d = Math.hypot(dx, dz);
      game.player.yaw = Math.atan2(dx, dz);
      game.player.rig.root.rotation.y = game.player.yaw;
      if (d > 3.0) {
        game.player.pos.x += (dx / d) * (d - 2.4);
        game.player.pos.z += (dz / d) * (d - 2.4);
      }
      game.player.hp = 1000;
      game.player.shayi = 5;
      game.player.upperCooldown = 0;
      game.player.lowerCooldown = 0;
      return t;
    };

    try {
      // =========================================================================
      // ACT 0: COLD OPEN HOOK (0.0s - 2.6s) — Thunder + Tight Hero Blade-Draw!
      // =========================================================================
      this.overlayState.mode = 'gameplay';
      this.overlayState.fadeBlack = 1.0;
      this.overlayState.showEngineBadge = false;
      game.player.pos.set(0, 0, 12.2);
      game.player.yaw = Math.PI;
      game.player.rig.root.rotation.y = Math.PI;

      this.camOverride = {
        pos: new THREE.Vector3(1.4, 1.55, 9.6),
        lookAt: new THREE.Vector3(0, 1.48, 12.2),
      };
      game.triggerStormLightning();
      await this._fadeTo(0.0, 320);
      await this._sleep(900);
      // Sudden blade parry spark hook!
      game.player.startParry();
      game.player.rig.triggerParryImpact();
      game.vfx.spawnSparks(game.player.pos.clone().add(new THREE.Vector3(0, 1.38, -0.45)), 48, 0xffe488, 1.35);
      game.audio.playSFX('parry', { volume: 1.0 });
      this.overlayState.flashWhite = 0.65;
      await this._sleep(140);
      this.overlayState.flashWhite = 0.0;
      await this._sleep(500);
      await this._fadeTo(1.0, 260);

      // =========================================================================
      // ACT 1: 3A OPENING SLATES (2.6s - 7.8s) — `斌哥哥 Game Studio` + `《战魂》`
      // =========================================================================
      this.overlayState.mode = 'studio_slate';
      this.overlayState.slateAlpha = 1.0;
      game.audio.playSFX('posture_break', { volume: 0.78 });
      await this._fadeTo(0.0, 380);
      await this._sleep(1750);
      await this._fadeTo(1.0, 320);

      this.overlayState.mode = 'title_slate';
      game.audio.playSFX('thunder', { volume: 0.9 });
      game.audio.playSFX('slash_heavy', { volume: 0.95 });
      await this._fadeTo(0.0, 300);
      await this._sleep(2200);
      await this._fadeTo(1.0, 300);

      // =========================================================================
      // ACT 2: STORY DIALOGUE CONFRONTATION (7.8s - 14.4s)
      // =========================================================================
      this.overlayState.mode = 'gameplay';
      this.overlayState.showEngineBadge = true;
      game.audio.playBGM('bgm_courtyard', 1.0);
      this.camOverride = {
        pos: new THREE.Vector3(-2.6, 1.85, 14.5),
        lookAt: new THREE.Vector3(0.4, 1.35, 9.8),
      };
      await this._fadeTo(0.0, 350);
      await this._playVOTrimmed('intro_3_assassin', 3100);
      // Reverse dramatic close-up on Hun's handsome face!
      this.camOverride = {
        pos: new THREE.Vector3(1.15, 1.62, 10.3),
        lookAt: new THREE.Vector3(0, 1.52, 12.2),
      };
      await this._playVOTrimmed('intro_2_hun', 3400);
      this._setSubtitle('', '');

      // =========================================================================
      // ACT 3: FULL-SKILL REAL GAMEPLAY MONTAGE (14.4s - 25.8s)
      // =========================================================================
      this.camOverride = null; // Return to dynamic live action camera!
      const orbit = setInterval(() => {
        game.camYaw += 0.022;
        game.camPitch = 0.22 + Math.sin(performance.now() * 0.0015) * 0.05;
      }, 33);

      try {
        // 3A. Ghost Dash + 4-Hit Figure-8 Tang-Dao Combo
        this._flashSkill('流水 · 断影四连斩', '双手唐刀八字连击', 1800);
        snapToEnemy();
        game.player.triggerDash();
        await this._sleep(360);
        for (let i = 0; i < 4; i++) {
          snapToEnemy();
          game.player.queueAttack('basic');
          await this._sleep(430);
        }

        // 3B. Upper Skill Chain《影杀三绝》: 踏影刺 -> 旋风斩月 -> 断魂·千裂
        this._flashSkill('影杀上链 · 断魂千裂', '踏影刺 → 旋风斩月 → 杀意绝技', 2200);
        for (let i = 0; i < 3; i++) {
          snapToEnemy();
          game.player.queueAttack('upper');
          await this._sleep(i === 2 ? 950 : 480);
        }

        // 3C. Perfect Parry & Counter-Riposte (`完美振刀 · 追魂斩`)
        const pEnemy = snapToEnemy();
        game.player.startParry();
        await this._sleep(140);
        if (pEnemy) {
          this._flashSkill('完美振刀 · 追魂斩', '金铁交鸣 · 瞬息破势反击', 1600);
          game.player.rig.triggerParryImpact();
          game.vfx.spawnSparks(game.player.pos.clone().add(new THREE.Vector3(0, 1.35, 0)), 52, 0xffe488, 1.45);
          game.vfx.spawnShockwave(game.player.pos, { color: 0xffd56e, maxRadius: 4.5, duration: 0.42 });
          game.audio.playSFX('parry', { volume: 1.0 });
          game.player.riposteTimer = 0.9;
          await this._sleep(220);
          game.player.queueAttack('basic');
          await this._sleep(620);
        }

        // 3D. Lower Skill Chain《赤霄破阵》: 裂地重劈 -> 飞燕掠空 -> 赤霄·坠天
        this._flashSkill('赤霄下链 · 赤霄坠天', '裂地重劈 → 飞燕掠空 → 雷火绝技', 2200);
        for (let i = 0; i < 3; i++) {
          snapToEnemy();
          game.player.queueAttack('lower');
          await this._sleep(i === 2 ? 1050 : 500);
        }
      } finally {
        clearInterval(orbit);
      }

      // =========================================================================
      // ACT 4: CLIMAX — BOSS SHOWDOWN (`血衣堂主 · 萧残阳`) + `鬼哭 · 一闪` (25.8s - 35.8s)
      // =========================================================================
      await this._fadeTo(1.0, 220);
      // Teleport straight into the Elevated Ruined Main Hall for the Nemesis Boss Climax!
      game.bossEncounterStarted = true;
      game.boss.active = true;
      game.boss.dead = false;
      game.boss.hp = game.boss.maxHp;
      game.boss.pos.set(0, 1.29, -22.2);
      game.boss.yaw = 0;
      game.boss.rig.root.rotation.y = 0;

      game.player.pos.set(0, 1.29, -17.5);
      game.player.yaw = Math.PI;
      game.player.rig.root.rotation.y = Math.PI;
      game.player.hp = 1000;
      game.player.shayi = 5;

      game.audio.playBGM('bgm_boss_phase2', 1.0);
      this.camOverride = {
        pos: new THREE.Vector3(3.2, 2.8, -19.5),
        lookAt: new THREE.Vector3(0, 2.4, -21.5),
      };
      await this._fadeTo(0.0, 280);
      await this._playVOTrimmed('boss_intro_2_hun', 3200);

      // Boss Phase 2 Demon Awakening + Storm Lightning!
      game.boss.rig.setPhase2DemonGlow();
      game.triggerStormLightning();
      game.vfx.spawnShockwave(game.boss.pos, { color: 0xff2233, maxRadius: 7.5, duration: 0.65 });
      this._flashSkill('宿敌决战 · 血煞入魔', '血衣堂主 · 萧残阳', 2000);
      await this._playVOTrimmed('boss_phase2_xiao', 2400);
      this._setSubtitle('', '');

      // Final Climax Button: Posture Break -> `鬼哭 · 一闪` Lethal Execution -> Hard Cut to Black!
      this.camOverride = null;
      game.camYaw = 0.55;
      game.camPitch = 0.20;
      game.player.pos.set(0, 1.29, -19.6);
      game.player.yaw = Math.PI;
      game.boss.brokenTimer = 5.0;
      game.boss.posture = game.boss.maxPosture;
      this._flashSkill('破绽绝杀 · 鬼哭一闪', '一刀断魂 · 决胜刹那', 1600);
      game.vfx.spawnShockwave(game.boss.pos, { color: 0xffd56e, maxRadius: 4.8, duration: 0.4 });
      await this._sleep(220);
      game.player.queueAttack('execute');
      await this._sleep(720);
      this.overlayState.flashWhite = 0.92;
      await this._sleep(140);
      this.overlayState.flashWhite = 0.0;
      this.overlayState.fadeBlack = 1.0;
      await this._sleep(380);

      // =========================================================================
      // ACT 5: 3A ENDING SLATE (35.8s - 41.2s) — `《战魂》` + `斌哥哥 Game Studio` + Wishlist CTA
      // =========================================================================
      this.overlayState.mode = 'end_slate';
      this.overlayState.slateAlpha = 1.0;
      this.overlayState.showEngineBadge = false;
      this._setSubtitle('', '');
      game.audio.playSFX('posture_break', { volume: 0.85 });
      await this._fadeTo(0.0, 480);
      await this._sleep(4600);
      await this._fadeTo(1.0, 500);
    } finally {
      this.running = false;
      this.camOverride = null;
      game.promoMode = false;
      cancelAnimationFrame(compRaf);
      if (hudEl) hudEl.style.opacity = '1';
    }

    const done = new Promise((resolve) => {
      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        try {
          await fetch(`/__save_promo?file=${encodeURIComponent(filename)}`, {
            method: 'POST',
            body: blob,
          });
        } catch (e) {
          console.warn('Trailer save failed:', e);
        }
        document.title = 'AAA_TRAILER_COMPLETE';
        resolve({ ok: true, bytes: blob.size, filename });
      };
    });
    recorder.stop();
    return await done;
  }
}
