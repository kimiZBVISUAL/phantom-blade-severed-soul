import * as THREE from 'three';

export class HUDManager {
  constructor(camera) {
    this.camera = camera;
    this.worldMarkers = document.getElementById('world-markers');
    this.combatHud = document.getElementById('combat-hud');
    this.bossHud = document.getElementById('boss-hud');
    this.dialogueBox = document.getElementById('dialogue-box');
    this.dialogueSpeaker = document.getElementById('dialogue-speaker');
    this.dialogueText = document.getElementById('dialogue-text');
    this.skipBtn = document.getElementById('btn-skip-cutscene');
    this.execPrompt = document.getElementById('execution-prompt');

    // Cached DOM elements to eliminate per-frame querySelector/getElementById churn
    this.elHpFill = document.getElementById('p-hp-fill');
    this.elHpDelay = document.getElementById('p-hp-delay');
    this.elHpNum = document.getElementById('p-hp-num');
    this.elStaminaFill = document.getElementById('p-stamina-fill');
    this.elGourd = document.getElementById('gourd-counter');
    this.elShayiGems = Array.from(document.querySelectorAll('#shayi-orbs .shayi-gem'));
    this.elUpperCards = Array.from(document.querySelectorAll('#chain-upper .skill-card'));
    this.elLowerCards = Array.from(document.querySelectorAll('#chain-lower .skill-card'));
    this.elCdUpper = document.getElementById('cd-upper');
    this.elCdLower = document.getElementById('cd-lower');

    this.elBossName = document.getElementById('boss-name');
    this.elBossHpFill = document.getElementById('boss-hp-fill');
    this.elBossHpDelay = document.getElementById('boss-hp-delay');
    this.elBossPostureFill = document.getElementById('boss-posture-fill');
    this.elBossOrbs = Array.from(document.querySelectorAll('#boss-phases .phase-orb'));

    this.elComboPanel = document.getElementById('combo-panel');
    this.elComboCount = document.getElementById('combo-count');
    this.elComboTag = document.getElementById('combo-action-tag');
    this.elStyleGrade = document.getElementById('style-grade');

    this._projVec = new THREE.Vector3();
    this._popupVec = new THREE.Vector3();

    // Dirty-checking caches so DOM is untouched when values don't change
    this._lastBossState = { visible: false, hp: -1, posture: -1, phase: -1, phasesLeft: -1 };
    this._lastExecVisible = false;
    this._lastPlayerHp = -1;
    this._lastPlayerStamina = -1;
    this._lastPlayerGourds = -1;
    this._lastPlayerShayi = -1;
  }

  setLoadingProgress(pct, label) {
    const fill = document.getElementById('loading-bar-fill');
    const txt = document.getElementById('loading-text');
    const btn = document.getElementById('btn-start-game');
    if (fill) fill.style.width = `${Math.round(pct * 100)}%`;
    if (txt && label) txt.textContent = label;
    if (pct >= 1.0 && btn) {
      btn.disabled = false;
      txt.textContent = '拔刀入局 · 开始游戏';
    }
  }

  hideTitleAndShowHUD() {
    const ts = document.getElementById('title-screen');
    ts.style.opacity = '0';
    setTimeout(() => ts.classList.add('hidden'), 750);
    this.combatHud.classList.remove('hidden');
  }

  setCinematicMode(enabled, onSkip = null) {
    document.body.classList.toggle('cinematic', enabled);
    if (enabled) {
      this.combatHud.classList.add('hidden');
      if (onSkip) {
        this.skipBtn.classList.remove('hidden');
        this.skipBtn.textContent = document.body.classList.contains('is-mobile') ? '跳过演出' : '[Tab] 跳过演出';
        this.skipBtn.onclick = onSkip;
      } else {
        this.skipBtn.classList.add('hidden');
      }
    } else {
      this.combatHud.classList.remove('hidden');
      this.dialogueBox.classList.add('hidden');
      this.skipBtn.classList.add('hidden');
    }
  }

  showSubtitle(speaker, text) {
    this.dialogueBox.classList.remove('hidden');
    this.dialogueSpeaker.textContent = speaker;
    this.dialogueText.textContent = text;
  }

  hideSubtitle() {
    this.dialogueBox.classList.add('hidden');
  }

  setObjective(chapter, desc) {
    document.getElementById('obj-chapter').textContent = chapter;
    document.getElementById('obj-desc').textContent = desc;
  }

  updatePlayer(player) {
    const hpRounded = Math.ceil(player.hp);
    if (hpRounded !== this._lastPlayerHp) {
      this._lastPlayerHp = hpRounded;
      const pct = `${Math.max(0, (player.hp / player.maxHp) * 100).toFixed(1)}%`;
      this.elHpFill.style.width = pct;
      this.elHpDelay.style.width = pct;
      this.elHpNum.textContent = `${hpRounded} / ${player.maxHp}`;
    }

    const stamRounded = Math.round(player.stamina);
    if (stamRounded !== this._lastPlayerStamina) {
      this._lastPlayerStamina = stamRounded;
      this.elStaminaFill.style.width = `${(player.stamina / player.maxStamina) * 100}%`;
    }

    if (player.gourds !== this._lastPlayerGourds) {
      this._lastPlayerGourds = player.gourds;
      this.elGourd.textContent = `葫芦 ×${player.gourds}`;
    }

    if (player.shayi !== this._lastPlayerShayi) {
      this._lastPlayerShayi = player.shayi;
      for (let i = 0; i < this.elShayiGems.length; i++) {
        this.elShayiGems[i].classList.toggle('filled', i < player.shayi);
      }
    }
  }

  updateSkillChains(player) {
    for (let i = 0; i < this.elUpperCards.length; i++) {
      this.elUpperCards[i].classList.toggle('active', i === player.upperStep && player.upperCooldown <= 0);
    }
    if (player.upperCooldown > 0) {
      this.elCdUpper.classList.remove('hidden');
      this.elCdUpper.textContent = `调息 ${player.upperCooldown.toFixed(1)}s`;
    } else {
      this.elCdUpper.classList.add('hidden');
    }

    for (let i = 0; i < this.elLowerCards.length; i++) {
      this.elLowerCards[i].classList.toggle('active', i === player.lowerStep && player.lowerCooldown <= 0);
    }
    if (player.lowerCooldown > 0) {
      this.elCdLower.classList.remove('hidden');
      this.elCdLower.textContent = `调息 ${player.lowerCooldown.toFixed(1)}s`;
    } else {
      this.elCdLower.classList.add('hidden');
    }
  }

  updateBoss(boss) {
    const visible = Boolean(boss && boss.active && !boss.dead);
    const cache = this._lastBossState;
    if (!visible) {
      if (cache.visible) {
        this.bossHud.classList.add('hidden');
        cache.visible = false;
      }
      return;
    }
    if (!cache.visible) {
      this.bossHud.classList.remove('hidden');
      cache.visible = true;
    }
    if (boss.phase !== cache.phase) {
      cache.phase = boss.phase;
      this.elBossName.textContent = boss.phase === 2 ? '萧残阳 · 血煞入魔' : '萧残阳 · 断魂重剑';
    }

    const hpPct = Math.round(Math.max(0, (boss.hp / boss.maxHp) * 1000)) / 10;
    if (hpPct !== cache.hp) {
      cache.hp = hpPct;
      const w = `${hpPct}%`;
      this.elBossHpFill.style.width = w;
      this.elBossHpDelay.style.width = w;
    }

    const posPct = Math.round(Math.min(100, (boss.posture / boss.maxPosture) * 1000)) / 10;
    if (posPct !== cache.posture) {
      cache.posture = posPct;
      this.elBossPostureFill.style.width = `${posPct}%`;
    }

    if (boss.phasesLeft !== cache.phasesLeft) {
      cache.phasesLeft = boss.phasesLeft;
      this.elBossOrbs[0].classList.toggle('active', boss.phasesLeft >= 1);
      this.elBossOrbs[1].classList.toggle('active', boss.phasesLeft >= 2);
    }
  }

  onComboUpdate(count, tag) {
    if (count <= 1) {
      this.elComboPanel.classList.add('hidden');
      return;
    }
    this.elComboPanel.classList.remove('hidden');
    this.elComboCount.innerHTML = `${count} <span>连斩</span>`;
    if (tag) this.elComboTag.textContent = tag;

    const grades = ['斩', '破', '疾', '绝', '鬼神', '影之极'];
    const gi = Math.min(grades.length - 1, Math.floor(count / 4));
    this.elStyleGrade.textContent = grades[gi];
  }

  flashSkillCard(tier, title) {
    const el = document.getElementById('skill-card-flash');
    document.getElementById('card-flash-tier').textContent = tier;
    document.getElementById('card-flash-title').textContent = title;
    el.classList.remove('hidden');
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    setTimeout(() => el.classList.add('hidden'), 620);

    // Subtle ink-flash screen punch
    const ink = document.getElementById('fx-ink-flash');
    ink.style.opacity = '0.45';
    setTimeout(() => { ink.style.opacity = '0'; }, 95);
  }

  triggerScreenFX(type) {
    const id = type === 'parry' ? 'fx-parry-flare' : 'fx-blood-pulse';
    const el = document.getElementById(id);
    el.style.opacity = type === 'parry' ? '0.92' : '0.85';
    setTimeout(() => { el.style.opacity = '0'; }, type === 'parry' ? 140 : 260);
  }

  setExecutionPromptVisible(visible) {
    if (visible !== this._lastExecVisible) {
      this._lastExecVisible = visible;
      this.execPrompt.classList.toggle('hidden', !visible);
    }
  }

  createEnemyWorldBar(enemy) {
    const el = document.createElement('div');
    el.className = 'enemy-world-bar';
    el.style.left = '0px';
    el.style.top = '0px';
    el.style.willChange = 'transform';
    el.innerHTML = `
      <div class="ew-name">${enemy.name}</div>
      <div class="ew-hp"><div class="ew-hp-fill"></div></div>
      <div class="ew-posture"><div class="ew-posture-fill"></div></div>
    `;
    // Cache child refs directly on the element to eliminate querySelector every frame
    el._hpFill = el.querySelector('.ew-hp-fill');
    el._postureFill = el.querySelector('.ew-posture-fill');
    el._lastHp = -1;
    el._lastPosture = -1;
    el._lastBroken = false;
    el._visible = false;
    el.style.display = 'none';
    this.worldMarkers.appendChild(el);
    return el;
  }

  updateWorldMarkers(enemies) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const pv = this._projVec;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      const bar = e.worldBarEl;
      if (!bar) continue;
      if (e.dead || !e.active) {
        if (bar._visible) {
          bar.style.display = 'none';
          bar._visible = false;
        }
        continue;
      }
      pv.set(e.pos.x, e.pos.y + 2.25, e.pos.z).project(this.camera);
      if (pv.z > 1 || pv.x < -1.15 || pv.x > 1.15 || pv.y < -1.15 || pv.y > 1.15) {
        if (bar._visible) {
          bar.style.display = 'none';
          bar._visible = false;
        }
        continue;
      }
      if (!bar._visible) {
        bar.style.display = 'block';
        bar._visible = true;
      }
      const sx = ((pv.x * 0.5 + 0.5) * w) | 0;
      const sy = ((-pv.y * 0.5 + 0.5) * h) | 0;
      // GPU-composited translate3d — ZERO layout reflow!
      bar.style.transform = `translate3d(${sx}px, ${sy}px, 0) translate(-50%, -100%)`;

      const hpPct = Math.round((e.hp / e.maxHp) * 100);
      if (hpPct !== bar._lastHp) {
        bar._lastHp = hpPct;
        bar._hpFill.style.width = `${hpPct}%`;
      }
      const posPct = Math.round((e.posture / e.maxPosture) * 100);
      if (posPct !== bar._lastPosture) {
        bar._lastPosture = posPct;
        bar._postureFill.style.width = `${posPct}%`;
      }
      const isBroken = e.brokenTimer > 0;
      if (isBroken !== bar._lastBroken) {
        bar._lastBroken = isBroken;
        bar.classList.toggle('ew-broken', isBroken);
      }
    }
  }

  spawnPopup(worldPos, text, style = '') {
    this._popupVec.copy(worldPos).project(this.camera);
    if (this._popupVec.z > 1) return;
    const el = document.createElement('div');
    el.className = `dmg-popup ${style}`;
    el.textContent = text;
    el.style.left = `${(this._popupVec.x * 0.5 + 0.5) * window.innerWidth + (Math.random() - 0.5) * 28}px`;
    el.style.top = `${(-this._popupVec.y * 0.5 + 0.5) * window.innerHeight}px`;
    this.worldMarkers.appendChild(el);
    setTimeout(() => el.remove(), 780);
  }

  showResult({ victory, stats }) {
    const scr = document.getElementById('result-screen');
    scr.classList.remove('hidden');
    document.getElementById('result-seal').textContent = victory ? '断魂破局' : '残局未竟';
    document.getElementById('result-title').textContent = victory ? '断魂局 · 破' : '身陨古刹';
    document.getElementById('result-subtitle').textContent = victory
      ? '血衣堂主萧残阳已伏诛。京城执棋者的黑影浮出水面，江湖夜雨未歇……'
      : '刀锋饮恨，宿仇未雪。重整杀意，再破此局。';

    const rank = stats.parries >= 4 ? '影之极 (S+)' : stats.parries >= 2 ? '鬼神 (S)' : '绝影 (A)';
    document.getElementById('result-stats').innerHTML = `
      武道评定：<strong>${rank}</strong><br/>
      最高连斩：${stats.maxCombo} 连 · 精防振刀：${stats.parries} 次 · 破绽绝杀：${stats.executions} 次
    `;
  }
}
