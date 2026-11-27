import * as THREE from 'three';
import { PLAYER_MOVES, clampToArenaBounds, getArenaFloorHeight } from '../combat/CombatSystem.js';

export class PlayerController {
  constructor({ rig, audio, vfx, hud }) {
    this.rig = rig;
    this.audio = audio;
    this.vfx = vfx;
    this.hud = hud;

    this.pos = rig.root.position;
    this.pos.set(0, 0, 22.5);
    this.yaw = Math.PI; // Facing North (-Z) toward Mountain Gate & Temple
    this.rig.root.rotation.y = this.yaw;

    this.maxHp = 1000;
    this.hp = 1000;
    this.maxStamina = 100;
    this.stamina = 100;
    this.shayi = 2; // Start with 2 Killing Intent gems ready!
    this.maxShayi = 5;
    this.gourds = 3;
    this.dead = false;

    // Combat state
    this.currentMove = null;
    this.moveKey = null;
    this.moveTimer = 0;
    this.hitVictims = new Set();
    this.multiHitTriggered = 0;
    this.comboIndex = 0;
    this.comboResetTimer = 0;
    this.bufferedAction = null;

    // Parry, Riposte & Dodge
    this.parryTimer = 0;      // >0 means active Perfect Parry window (280ms!)
    this.riposteTimer = 0;    // >0 unlocks instant Counter-Riposte after deflect!
    this.guardHolding = false;
    this.dashTimer = 0;
    this.dashDir = new THREE.Vector3();
    this.invulnTimer = 0;
    this.staggerTimer = 0;

    //《影之刃》Dual Skill Chain Steps & Cooldowns
    this.upperStep = 0;
    this.upperCooldown = 0;
    this.lowerStep = 0;
    this.lowerCooldown = 0;
    this.stepDistAccum = 0;
    this.lowHpVoTriggered = false;
    this.hurtVoCooldown = 0;

    this.keys = {};
    this._bindInputs();
  }

  _bindInputs() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const code = e.code;
      this.keys[code] = true;
      if (code === 'KeyJ') this.queueAttack('basic');
      if (code === 'KeyK') this.startParry();
      if (code === 'KeyE' || code === 'Digit1') this.queueAttack('upper');
      if (code === 'KeyQ' || code === 'Digit2') this.queueAttack('lower');
      if (code === 'KeyF') this.queueAttack('execute');
      if (code === 'ShiftLeft' || code === 'ShiftRight' || code === 'Space') this.triggerDash();
      if (code === 'KeyR') this.useGourd();
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      if (e.code === 'KeyK') this.guardHolding = false;
    });

    window.addEventListener('mousedown', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      if (e.button === 0) this.queueAttack('basic');
      if (e.button === 2) this.startParry();
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 2) this.guardHolding = false;
    });

    window.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  addShayi(amount) {
    this.shayi = Math.max(0, Math.min(this.maxShayi, this.shayi + amount));
    this.hud.updatePlayer(this);
  }

  useGourd() {
    if (this.dead || this.gourds <= 0 || this.hp >= this.maxHp) return;
    this.gourds--;
    this.hp = Math.min(this.maxHp, this.hp + 450);
    if (this.hp > this.maxHp * 0.38) {
      this.lowHpVoTriggered = false;
      this.audio.setLowHealthAgony?.(false);
    }
    this.vfx.spawnShockwave(this.pos, { color: 0x5ef2d6, maxRadius: 2.6, duration: 0.38 });
    this.audio.playSFX('gourd_drink', { volume: 0.95 });
    this.hud.spawnPopup(this.pos.clone().add(new THREE.Vector3(0, 1.9, 0)), '+450 回春', 'parry');
    this.hud.updatePlayer(this);
  }

  startParry() {
    if (this.dead) return;
    // Instant animation cancel into Deflect Stance ("操作简单，操纵感顶级"!)
    if (this.currentMove && !this.currentMove.invincible) {
      this.currentMove = null;
      this.rig.trailActive = false;
    }
    this.parryTimer = 0.28; // Generous, crisp 280ms Perfect Parry window
    this.guardHolding = true;
    this.audio.playSFX('parry_stance', { volume: 0.72, pitchJitter: 0.04 });
  }

  triggerDash() {
    if (this.dead || this.dashTimer > 0 || this.stamina < 18) return;
    this.stamina = Math.max(0, this.stamina - 18);
    this.currentMove = null;
    this.rig.trailActive = false;
    this.dashTimer = 0.22;
    this.invulnTimer = 0.30;

    const moveVec = this._getDesiredMoveDir();
    if (moveVec.lengthSq() > 0.01) {
      this.dashDir.copy(moveVec).normalize();
      this.yaw = Math.atan2(this.dashDir.x, this.dashDir.z);
    } else {
      this.dashDir.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    }

    this.vfx.spawnDashAfterimage(this.rig.root, 0x62f5e8);
    this.audio.playSFX('dash', { volume: 0.95 });
    this.hud.updatePlayer(this);
  }

  queueAttack(kind) {
    if (this.dead) return;
    // Allow instant dash-cancel into dash-slash after first 40% of dash!
    if (this.dashTimer > 0 && this.dashTimer < 0.13) {
      this.dashTimer = 0;
    }
    if (this.currentMove) {
      const progress = this.moveTimer / this.currentMove.duration;
      const cancelPoint = this.currentMove.cancelAt || 0.58;
      // If already in Zanshin follow-through window, chain IMMEDIATELY on this exact frame!
      if (progress >= cancelPoint) {
        this.bufferedAction = null;
        this._executeQueued(kind);
        return;
      }
      if (progress >= 0.24) {
        this.bufferedAction = kind;
      }
      return;
    }
    this._executeQueued(kind);
  }

  _executeQueued(kind) {
    this.parryTimer = 0;
    this.guardHolding = false;

    if (kind === 'execute' && this.onTryExecution && this.onTryExecution()) {
      this._startMove('execution');
      return;
    }

    // Post-Parry Empowered Counter-Riposte!
    if (kind === 'basic' && this.riposteTimer > 0) {
      this.riposteTimer = 0;
      this._startMove('parry_riposte');
      return;
    }

    if (kind === 'upper') {
      if (this.upperCooldown > 0) return;
      const step = this.upperStep;
      const key = `upper_${step}`;
      const move = PLAYER_MOVES[key];
      if (move.shayiCost && this.shayi < move.shayiCost) {
        // Still allow casting weaker version if out of Sha-Yi, or consume if available!
      } else if (move.shayiCost) {
        this.addShayi(-move.shayiCost);
      }
      this._startMove(key);
      this.upperStep = (step + 1) % 3;
      if (this.upperStep === 0) this.upperCooldown = 3.2;
      this.hud.updateSkillChains(this);
      return;
    }

    if (kind === 'lower') {
      if (this.lowerCooldown > 0) return;
      const step = this.lowerStep;
      const key = `lower_${step}`;
      const move = PLAYER_MOVES[key];
      if (move.shayiCost && this.shayi >= move.shayiCost) {
        this.addShayi(-move.shayiCost);
      }
      this._startMove(key);
      this.lowerStep = (step + 1) % 3;
      if (this.lowerStep === 0) this.lowerCooldown = 3.8;
      this.hud.updateSkillChains(this);
      return;
    }

    // Default 4-hit fast Tang-Dao combo
    const idx = (this.comboIndex % 4) + 1;
    this.comboIndex = idx;
    this.comboResetTimer = 1.25;
    this._startMove(`combo_${idx}`);
  }

  _startMove(moveKey) {
    const move = PLAYER_MOVES[moveKey];
    if (!move) return;
    this.moveKey = moveKey;
    this.currentMove = move;
    this.moveTimer = 0;
    this.hitVictims.clear();
    this.multiHitTriggered = 0;

    if (this.onFindSoftLockTarget) {
      const target = this.onFindSoftLockTarget(7.2);
      if (target) {
        const dx = target.pos.x - this.pos.x;
        const dz = target.pos.z - this.pos.z;
        this.yaw = Math.atan2(dx, dz);
      }
    }

    this.rig.ribbon.setColor(move.ribbonColor || 0x9cf0ff);
    this.audio.playSFX(move.sfxWhoosh || 'slash_1', { volume: 0.9 });
    if (move.vo) {
      this.audio.playCombatVoice?.(move.vo, null, { volume: 1.0 });
    }
    if (move.showCard) {
      this.hud.flashSkillCard(move.tier, move.name);
    }
    if (move.invincible) {
      this.invulnTimer = move.duration + 0.2;
    }
  }

  _getDesiredMoveDir() {
    let ix = 0, iz = 0;
    if (this.keys.KeyW || this.keys.ArrowUp) iz -= 1;
    if (this.keys.KeyS || this.keys.ArrowDown) iz += 1;
    if (this.keys.KeyA || this.keys.ArrowLeft) ix -= 1;
    if (this.keys.KeyD || this.keys.ArrowRight) ix += 1;
    const v = new THREE.Vector3(ix, 0, iz);
    if (v.lengthSq() > 0 && this.cameraYaw !== undefined) {
      v.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.cameraYaw);
    }
    return v;
  }

  update(dt, { controlsEnabled = true, lockInBossHall = false, cameraYaw = 0 }) {
    this.cameraYaw = cameraYaw;
    const prevPos = this.pos.clone();

    // Timers & cooldown regeneration
    this.parryTimer = Math.max(0, this.parryTimer - dt);
    this.riposteTimer = Math.max(0, this.riposteTimer - dt);
    this.invulnTimer = Math.max(0, this.invulnTimer - dt);
    this.staggerTimer = Math.max(0, this.staggerTimer - dt);
    this.hurtVoCooldown = Math.max(0, this.hurtVoCooldown - dt);
    this.stamina = Math.min(this.maxStamina, this.stamina + 26 * dt);

    if (this.upperCooldown > 0) {
      this.upperCooldown = Math.max(0, this.upperCooldown - dt);
      this.hud.updateSkillChains(this);
    }
    if (this.lowerCooldown > 0) {
      this.lowerCooldown = Math.max(0, this.lowerCooldown - dt);
      this.hud.updateSkillChains(this);
    }
    if (this.comboResetTimer > 0) {
      this.comboResetTimer -= dt;
      if (this.comboResetTimer <= 0) this.comboIndex = 0;
    }

    let speed = 0;
    let combatPose = 'none';
    let poseProgress = 0;

    if (!this.dead && controlsEnabled) {
      if (this.dashTimer > 0) {
        this.dashTimer -= dt;
        const dashSpd = 16.8;
        this.pos.addScaledVector(this.dashDir, dashSpd * dt);
        if (Math.random() < 0.35) {
          this.vfx.spawnDashAfterimage(this.rig.root, 0x62f5e8);
        }
        speed = dashSpd;
      } else if (this.currentMove) {
        this.moveTimer += dt;
        const m = this.currentMove;
        poseProgress = Math.min(1, this.moveTimer / m.duration);
        combatPose = m.pose;

        // Forward martial lunge during windup/strike
        if (poseProgress < 0.45) {
          const lungeSpd = m.lunge * (1 - poseProgress / 0.45);
          this.pos.x += Math.sin(this.yaw) * lungeSpd * dt;
          this.pos.z += Math.cos(this.yaw) * lungeSpd * dt;
        }
        // Aerial leap curve for 飞燕掠空 / 赤霄坠天
        const floorY = getArenaFloorHeight(this.pos.x, this.pos.z);
        if (m.jumpY) {
          this.pos.y = floorY + Math.sin(poseProgress * Math.PI) * m.jumpY;
        } else {
          this.pos.y = floorY;
        }

        const inHitWindow = this.moveTimer >= m.hitWindow[0] && this.moveTimer <= m.hitWindow[1];
        this.rig.trailActive = poseProgress >= 0.16 && poseProgress <= 0.68;
        if (inHitWindow && this.onDealPlayerHit) {
          this.onDealPlayerHit(m, poseProgress);
        }

        // Seamless Figure-8 Combo Chaining at Zanshin Cancel Window!
        const cancelPoint = m.cancelAt || 0.58;
        if (this.bufferedAction && poseProgress >= cancelPoint) {
          const next = this.bufferedAction;
          this.bufferedAction = null;
          this._executeQueued(next);
        } else if (this.moveTimer >= m.duration) {
          this.currentMove = null;
          this.rig.trailActive = false;
          this.pos.y = getArenaFloorHeight(this.pos.x, this.pos.z);
          if (this.bufferedAction) {
            const next = this.bufferedAction;
            this.bufferedAction = null;
            this._executeQueued(next);
          }
        }
      } else if (this.staggerTimer > 0) {
        combatPose = 'stagger';
        poseProgress = 1 - this.staggerTimer / 0.28;
      } else {
        const dir = this._getDesiredMoveDir();
        if (dir.lengthSq() > 0.01) {
          dir.normalize();
          const maxSpd = this.guardHolding ? 3.8 : 7.8;
          this.pos.addScaledVector(dir, maxSpd * dt);
          const targetYaw = Math.atan2(dir.x, dir.z);
          let diff = targetYaw - this.yaw;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          this.yaw += diff * Math.min(1, dt * 16);
          speed = maxSpd;
          this.stepDistAccum += speed * dt;
          const stride = this.guardHolding ? 1.55 : 2.35;
          if (this.stepDistAccum >= stride) {
            this.stepDistAccum -= stride;
            const surfaceSfx = this.pos.z <= -11.2 ? 'step_stone' : 'step_wet';
            this.audio.playSFX(surfaceSfx, { volume: this.guardHolding ? 0.36 : 0.52, pitchJitter: 0.08 });
          }
        }
        this.pos.y = getArenaFloorHeight(this.pos.x, this.pos.z);
      }
    } else {
      this.rig.trailActive = false;
      this.pos.y = getArenaFloorHeight(this.pos.x, this.pos.z);
    }

    const nearTarget = this.onFindSoftLockTarget ? this.onFindSoftLockTarget(9.5) : null;
    clampToArenaBounds(this.pos, prevPos, lockInBossHall);
    this.rig.root.rotation.y = this.yaw;
    this.rig.update(dt, {
      moveSpeed: speed,
      moveMax: 7.8,
      combatPose,
      poseProgress,
      isDashing: this.dashTimer > 0,
      isParrying: this.parryTimer > 0 || this.guardHolding,
      isDead: this.dead,
      lookTargetPos: nearTarget ? nearTarget.pos : null,
    });
  }
}
