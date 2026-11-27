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

    this._projVec = new THREE.Vector3();
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
    const pct = Math.max(0, (player.hp / player.maxHp) * 100);
    document.getElementById('p-hp-fill').style.width = `${pct}%`;
    document.getElementById('p-hp-delay').style.width = `${pct}%`;
    document.getElementById('p-hp-num').textContent = `${Math.ceil(player.hp)} / ${player.maxHp}`;
    document.getElementById('p-stamina-fill').style.width = `${(player.stamina / player.maxStamina) * 100}%`;
    document.getElementById('gourd-counter').textContent = `葫芦 ×${player.gourds}`;

    const gems = document.querySelectorAll('#shayi-orbs .shayi-gem');
    gems.forEach((el, idx) => {
      el.classList.toggle('filled', idx < player.shayi);
    });
  }

  updateSkillChains(player) {
    const upperCards = document.querySelectorAll('#chain-upper .skill-card');
    upperCards.forEach((c, i) => c.classList.toggle('active', i === player.upperStep && player.upperCooldown <= 0));
    const cdUp = document.getElementById('cd-upper');
    if (player.upperCooldown > 0) {
      cdUp.classList.remove('hidden');
      cdUp.textContent = `调息 ${player.upperCooldown.toFixed(1)}s`;
    } else {
      cdUp.classList.add('hidden');
    }

    const lowerCards = document.querySelectorAll('#chain-lower .skill-card');
    lowerCards.forEach((c, i) => c.classList.toggle('active', i === player.lowerStep && player.lowerCooldown <= 0));
    const cdLow = document.getElementById('cd-lower');
    if (player.lowerCooldown > 0) {
      cdLow.classList.remove('hidden');
      cdLow.textContent = `调息 ${player.lowerCooldown.toFixed(1)}s`;
    } else {
      cdLow.classList.add('hidden');
    }
  }

  updateBoss(boss) {
    if (!boss || !boss.active || boss.dead) {
      this.bossHud.classList.add('hidden');
      return;
    }
    this.bossHud.classList.remove('hidden');
    document.getElementById('boss-name').textContent =
      boss.phase === 2 ? '萧残阳 · 血煞入魔' : '萧残阳 · 断魂重剑';

    const hpPct = Math.max(0, (boss.hp / boss.maxHp) * 100);
    document.getElementById('boss-hp-fill').style.width = `${hpPct}%`;
    document.getElementById('boss-hp-delay').style.width = `${hpPct}%`;

    const posPct = Math.min(100, (boss.posture / boss.maxPosture) * 100);
    document.getElementById('boss-posture-fill').style.width = `${posPct}%`;

    const orbs = document.querySelectorAll('#boss-phases .phase-orb');
    orbs[0].classList.toggle('active', boss.phasesLeft >= 1);
    orbs[1].classList.toggle('active', boss.phasesLeft >= 2);
  }

  onComboUpdate(count, tag) {
    const panel = document.getElementById('combo-panel');
    if (count <= 1) {
      panel.classList.add('hidden');
      return;
    }
    panel.classList.remove('hidden');
    document.getElementById('combo-count').innerHTML = `${count} <span>连斩</span>`;
    if (tag) document.getElementById('combo-action-tag').textContent = tag;

    const grades = ['斩', '破', '疾', '绝', '鬼神', '影之极'];
    const gi = Math.min(grades.length - 1, Math.floor(count / 4));
    document.getElementById('style-grade').textContent = grades[gi];
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
    this.execPrompt.classList.toggle('hidden', !visible);
  }

  createEnemyWorldBar(enemy) {
    const el = document.createElement('div');
    el.className = 'enemy-world-bar';
    el.innerHTML = `
      <div class="ew-name">${enemy.name}</div>
      <div class="ew-hp"><div class="ew-hp-fill"></div></div>
      <div class="ew-posture"><div class="ew-posture-fill"></div></div>
    `;
    this.worldMarkers.appendChild(el);
    return el;
  }

  updateWorldMarkers(enemies) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (const e of enemies) {
      if (!e.worldBarEl) continue;
      if (e.dead || !e.active) {
        e.worldBarEl.style.display = 'none';
        continue;
      }
      this._projVec.copy(e.pos).add(new THREE.Vector3(0, 2.25, 0)).project(this.camera);
      if (this._projVec.z > 1) {
        e.worldBarEl.style.display = 'none';
        continue;
      }
      e.worldBarEl.style.display = 'block';
      e.worldBarEl.style.left = `${(this._projVec.x * 0.5 + 0.5) * w}px`;
      e.worldBarEl.style.top = `${(-this._projVec.y * 0.5 + 0.5) * h}px`;
      e.worldBarEl.querySelector('.ew-hp-fill').style.width = `${(e.hp / e.maxHp) * 100}%`;
      e.worldBarEl.querySelector('.ew-posture-fill').style.width = `${(e.posture / e.maxPosture) * 100}%`;
      e.worldBarEl.classList.toggle('ew-broken', e.brokenTimer > 0);
    }
  }

  spawnPopup(worldPos, text, style = '') {
    const v = worldPos.clone().project(this.camera);
    if (v.z > 1) return;
    const el = document.createElement('div');
    el.className = `dmg-popup ${style}`;
    el.textContent = text;
    el.style.left = `${(v.x * 0.5 + 0.5) * window.innerWidth + (Math.random() - 0.5) * 28}px`;
    el.style.top = `${(-v.y * 0.5 + 0.5) * window.innerHeight}px`;
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
