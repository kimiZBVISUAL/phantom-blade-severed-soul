import * as THREE from 'three';
import { ENEMY_MOVES, clampToArenaBounds, getArenaFloorHeight } from '../combat/CombatSystem.js';

export class EnemyActor {
  constructor({ id, name, rig, spawnPos, isBoss = false, maxHp = null, maxPosture = null, speedMul = 1.0, audio, vfx, hud }) {
    this.id = id;
    this.name = name;
    this.isFemale = name.includes('女');
    this.rig = rig;
    this.isBoss = isBoss;
    this.speedMul = speedMul;
    this.audio = audio;
    this.vfx = vfx;
    this.hud = hud;

    this.pos = rig.root.position;
    this.pos.copy(spawnPos);
    this.pos.y = getArenaFloorHeight(this.pos.x, this.pos.z);
    this.yaw = 0;
    this.rig.root.rotation.y = this.yaw;

    this.maxHp = maxHp ?? (isBoss ? 1550 : 260);
    this.hp = this.maxHp;
    this.maxPosture = maxPosture ?? (isBoss ? 180 : 75);
    this.posture = 0;
    this.phase = 1;
    this.phasesLeft = isBoss ? 2 : 1;

    this.active = !isBoss; // Assassins active in Act I/II; Boss activates in Act III
    this.dead = false;
    this.deathTimer = 0;
    this.brokenTimer = 0; // >0 means kneeling vulnerable to [F] Execution!
    this.staggerTimer = 0;
    this.shudderOffset = new THREE.Vector3();

    this.currentMove = null;
    this.moveTimer = 0;
    this.telegraphed = false;
    this.dealtDamageThisSwing = false;
    this.thinkCooldown = 0.6 + Math.random() * 0.9;
    this.strafeSign = Math.random() < 0.5 ? -1 : 1;
    this.tauntCooldown = 8.5;
    this.ravageVoCooldown = 0;

    // Reusable scratch vectors (zero per-frame GC churn)
    this._prevPos = new THREE.Vector3();
    this._toPlayer = new THREE.Vector3();
    this._dirToPlayer = new THREE.Vector3();
    this._perp = new THREE.Vector3();
    this._chestPos = new THREE.Vector3();

    if (!isBoss) {
      this.worldBarEl = this.hud.createEnemyWorldBar(this);
    }
  }

  addPosture(amount) {
    if (this.dead || this.brokenTimer > 0) return;
    this.posture = Math.min(this.maxPosture, this.posture + amount);
    if (this.posture >= this.maxPosture) {
      this.triggerPostureBreak();
    }
  }

  triggerPostureBreak() {
    this.currentMove = null;
    this.rig.trailActive = false;
    this.brokenTimer = this.isBoss ? 3.8 : 4.2;
    this.audio.playSFX('posture_break', { volume: 1.0, worldPos: this.pos });
    this.vfx.spawnShockwave(this.pos, { color: 0xffd269, maxRadius: 3.8, duration: 0.48 });
    this.hud.spawnPopup(this.pos.clone().add(new THREE.Vector3(0, 2.2, 0)), '破绽暴露！', 'parry');

    // Visceral posture-broken kneeling agony / panic voice acting!
    const breakVo = this.isBoss ? 'boss_broken_kneel' : (!this.isFemale ? 'assassin_broken_panic' : null);
    if (breakVo) {
      this.audio.playCombatVoice(breakVo, (sp, txt) => {
        this.hud.showSubtitle(sp, txt);
        setTimeout(() => this.hud.hideSubtitle(), 3800);
      }, { worldPos: this.pos, volume: 1.05 });
    }
  }

  takeDamage(dmg, postureDmg, knockDir, { isExecution = false } = {}) {
    if (this.dead) return;
    this.hp = Math.max(0, this.hp - dmg);
    this.rig.triggerHitFlash(0.11);

    // Instant 0ms real-human hit-reaction grunt + emotional Boss ravage / execution screams!
    if (this.hp > 0) {
      if (this.isBoss) {
        if (isExecution) {
          this.audio.playCombatVoice('boss_executed_scream', (sp, txt) => {
            this.hud.showSubtitle(sp, txt);
            setTimeout(() => this.hud.hideSubtitle(), 3200);
          }, { worldPos: this.pos, volume: 1.08 });
        } else {
          this.audio.playSFX('vox_boss_grunt', { volume: 0.85, worldPos: this.pos, pitchJitter: 0.06 });
          if (dmg >= 78 && this.ravageVoCooldown <= 0) {
            this.ravageVoCooldown = 7.5;
            const ravageId = Math.random() < 0.5 ? 'boss_hurt_ravage_1' : 'boss_hurt_ravage_2';
            this.audio.playCombatVoice(ravageId, (sp, txt) => {
              this.hud.showSubtitle(sp, txt);
              setTimeout(() => this.hud.hideSubtitle(), 3200);
            }, { worldPos: this.pos, volume: 1.0 });
          }
        }
      } else {
        this.audio.playSFX(this.isFemale ? 'vox_kunoichi_hurt' : 'vox_assassin_hurt', {
          volume: 0.82,
          worldPos: this.pos,
          pitchJitter: 0.07,
        });
      }
    }

    if (knockDir && (!this.isBoss || isExecution || this.brokenTimer > 0)) {
      const push = this.isBoss ? 0.35 : 0.75;
      this.pos.addScaledVector(knockDir, push);
    }

    if (!this.isBoss && (!this.currentMove || isExecution)) {
      this.currentMove = null;
      this.rig.trailActive = false;
      this.staggerTimer = 0.28;
    }

    if (postureDmg > 0) {
      this.addPosture(postureDmg);
    }

    if (this.hp <= 0) {
      if (this.isBoss && this.phase === 1) {
        // Trigger Boss Phase 2 ("血煞入魔")!
        this.phase = 2;
        this.phasesLeft = 1;
        this.maxHp = 1750;
        this.hp = this.maxHp;
        this.posture = 0;
        this.brokenTimer = 0;
        this.currentMove = null;
        this.rig.setPhase2DemonGlow();
        this.rig.ribbon.setColor(0xff1724);
        if (this.onBossPhase2) this.onBossPhase2();
      } else {
        this.dead = true;
        this.brokenTimer = 0;
        this.currentMove = null;
        this.rig.trailActive = false;
        if (!this.isBoss) {
          this.audio.playSFX(this.isFemale ? 'vox_kunoichi_die' : 'vox_assassin_die', {
            volume: 0.92,
            worldPos: this.pos,
            pitchJitter: 0.05,
          });
        }
        if (this.worldBarEl) this.worldBarEl.remove();
        if (this.onDeath) this.onDeath(this);
      }
    }
  }

  _pickNextAttack(dist) {
    if (!this.isBoss) {
      return Math.random() < 0.55 ? 'assassin_slash' : 'assassin_combo';
    }
    if (this.phase === 2 && Math.random() < 0.32) {
      return 'boss_phase2_whirlwind';
    }
    if (dist > 4.2) {
      return 'boss_crimson_thrust';
    }
    const pool = ['boss_sweep', 'boss_double_fang', 'boss_overhead', 'boss_crimson_thrust'];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  update(dt, { player, aiEnabled = true, canStartAttack = true, allies = null }) {
    if (this.dead) {
      this.deathTimer += dt;
      // Stop running skeletal solver once death animation finishes settling
      if (this.deathTimer < 2.0) {
        this.rig.update(dt, { isDead: true });
      }
      if (!this.isBoss && this.deathTimer > 2.2) {
        this.pos.y -= dt * 0.45;
      }
      return;
    }
    if (!this.active) {
      // Skip skeletal updates for distant inactive Boss until player approaches the temple stairs
      if (!this.isBoss || (player && player.pos.z < -6.0)) {
        this.rig.update(dt, { moveSpeed: 0 });
      }
      return;
    }

    const prevPos = this._prevPos.copy(this.pos);
    // Slowly recover posture when not broken
    if (this.brokenTimer > 0) {
      this.brokenTimer -= dt;
      if (this.brokenTimer <= 0) {
        this.posture = this.maxPosture * 0.25;
      }
    } else if (!this.currentMove) {
      this.posture = Math.max(0, this.posture - (this.isBoss ? 7 : 5) * dt);
    }

    if (this.staggerTimer > 0) {
      this.staggerTimer -= dt;
    }
    if (this.tauntCooldown > 0) {
      this.tauntCooldown -= dt;
    }
    if (this.ravageVoCooldown > 0) {
      this.ravageVoCooldown -= dt;
    }

    const toPlayer = this._toPlayer.subVectors(player.pos, this.pos);
    toPlayer.y = 0;
    const dist = toPlayer.length();
    const dirToPlayer = dist > 0.001
      ? this._dirToPlayer.copy(toPlayer).divideScalar(dist)
      : this._dirToPlayer.set(0, 0, 1);

    let speed = 0;
    let combatPose = 'none';
    let poseProgress = 0;

    if (aiEnabled && !player.dead && this.brokenTimer <= 0 && this.staggerTimer <= 0) {
      if (this.currentMove) {
        const m = this.currentMove;
        const speedMul = this.isBoss && this.phase === 2 ? 1.18 : 1.0;
        this.moveTimer += dt * speedMul;
        poseProgress = Math.min(1, this.moveTimer / m.duration);
        combatPose = m.pose;

        // Track player smoothly during early windup
        if (poseProgress < 0.36) {
          const targetYaw = Math.atan2(dirToPlayer.x, dirToPlayer.z);
          let diff = targetYaw - this.yaw;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          this.yaw += diff * Math.min(1, dt * 8);
        }

        // Telegraph blade flash so player can read & Perfect Parry!
        if (!this.telegraphed && this.moveTimer >= m.telegraphAt) {
          this.telegraphed = true;
          const chest = this._chestPos.set(this.pos.x, this.pos.y + 1.55, this.pos.z);
          this.vfx.spawnTelegraphFlash(chest, m.unblockable);
          if (m.unblockable) {
            this.audio.playSFX('perilous_kan', { volume: 0.92, worldPos: this.pos });
          } else {
            this.audio.playSFX(this.isBoss ? 'slash_heavy' : 'slash_1', {
              pitch: this.isBoss ? 0.92 : 1.08,
              volume: 0.78,
              worldPos: this.pos,
            });
          }
          if (this.isBoss && this.tauntCooldown <= 0 && !this.audio.isPlayingVO?.() && Math.random() < 0.35) {
            this.tauntCooldown = 14.0;
            const tauntId = this.phase === 2 ? 'boss_taunt_2' : 'boss_taunt_1';
            this.audio.playVO(tauntId, (sp, txt) => {
              this.hud.showSubtitle(sp, txt);
              setTimeout(() => this.hud.hideSubtitle(), 3500);
            }, { priority: 2 });
          }
        }

        // Forward lunge during strike
        if (poseProgress > 0.25 && poseProgress < 0.58 && dist > 1.55) {
          this.pos.x += Math.sin(this.yaw) * m.lunge * dt;
          this.pos.z += Math.cos(this.yaw) * m.lunge * dt;
        }

        const inHit = this.moveTimer >= m.hitWindow[0] && this.moveTimer <= m.hitWindow[1];
        this.rig.trailActive = poseProgress >= 0.28 && poseProgress <= 0.80;

        if (inHit && !this.dealtDamageThisSwing && this.onEnemyStrikeCheck) {
          const resolved = this.onEnemyStrikeCheck(this, m);
          if (resolved) this.dealtDamageThisSwing = true;
        }

        if (this.moveTimer >= m.duration) {
          if (m.shockwave) {
            this.vfx.spawnShockwave(this.pos, { color: 0xff3038, maxRadius: 4.5, duration: 0.42 });
          }
          if (m.lightning) {
            this.vfx.spawnCrimsonLightning(this.pos, 0xff2230);
          }
          this.currentMove = null;
          this.rig.trailActive = false;
          this.thinkCooldown = this.isBoss ? (this.phase === 2 ? 0.42 : 0.68) : (0.95 + Math.random() * 0.7);
        }
      } else {
        // Face player
        this.yaw = Math.atan2(dirToPlayer.x, dirToPlayer.z);
        this.thinkCooldown -= dt;

        const idealRange = this.isBoss ? 3.3 : (canStartAttack ? 2.35 : 3.6);
        if (dist > idealRange + 0.6) {
          const chaseSpd = (this.isBoss ? (this.phase === 2 ? 6.4 : 5.1) : 4.6) * this.speedMul;
          // Phase 2 Boss phantom blood-dash when far!
          if (this.isBoss && this.phase === 2 && dist > 7.5 && this.thinkCooldown <= 0) {
            this.vfx.spawnDashAfterimage(this.rig.root, 0xff2233);
            this.pos.addScaledVector(dirToPlayer, 4.2);
            this.audio.playSFX('dash', { pitch: 0.8 });
          } else {
            this.pos.addScaledVector(dirToPlayer, chaseSpd * dt);
          }
          speed = chaseSpd;
        } else {
          // Martial circle-strafe
          const perp = this._perp.set(-dirToPlayer.z * this.strafeSign, 0, dirToPlayer.x * this.strafeSign);
          this.pos.addScaledVector(perp, 1.85 * this.speedMul * dt);
          speed = 1.85 * this.speedMul;

          if (this.thinkCooldown <= 0 && canStartAttack && dist <= 3.1) {
            const key = this._pickNextAttack(dist);
            this.currentMove = ENEMY_MOVES[key];
            this.moveTimer = 0;
            this.telegraphed = false;
            this.dealtDamageThisSwing = false;
          }
        }
      }
    } else if (this.staggerTimer > 0) {
      combatPose = 'stagger';
      poseProgress = 1 - this.staggerTimer / 0.28;
    }

    // Gentle ally separation so 6-8 crowd NPCs form a cinematic martial encirclement without stacking!
    if (!this.isBoss && allies && allies.length > 1) {
      for (const other of allies) {
        if (other === this || other.dead || !other.active) continue;
        const dx = this.pos.x - other.pos.x;
        const dz = this.pos.z - other.pos.z;
        const dSq = dx * dx + dz * dz;
        const minSep = 1.55;
        if (dSq > 0.0001 && dSq < minSep * minSep) {
          const d = Math.sqrt(dSq);
          const push = (minSep - d) * 2.4 * dt;
          this.pos.x += (dx / d) * push;
          this.pos.z += (dz / d) * push;
        }
      }
    }

    this.pos.y = getArenaFloorHeight(this.pos.x, this.pos.z);
    clampToArenaBounds(this.pos, prevPos, this.isBoss);
    this.rig.root.rotation.y = this.yaw;

    this.rig.update(dt, {
      moveSpeed: speed,
      moveMax: 6.0,
      combatPose,
      poseProgress,
      isBroken: this.brokenTimer > 0,
      isDead: this.dead,
      lookTargetPos: player.pos,
    });
  }
}
