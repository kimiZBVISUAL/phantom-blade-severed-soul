import * as THREE from 'three';

/**
 * Move definitions for Player combos,《影之刃》Upper/Lower Skill Chains, and Execution.
 */
export const PLAYER_MOVES = {
  // Basic 4-hit Figure-8 Two-Handed Tang-Dao Combo (Left Click / J)
  combo_1: {
    pose: 'slash_1', duration: 0.44, cancelAt: 0.55, hitWindow: [0.14, 0.28], range: 3.1, arc: 2.2,
    dmg: 50, postureDmg: 19, lunge: 4.8, hitstop: 0.048, shake: 0.16,
    ribbonColor: 0x9cf0ff, sfxWhoosh: 'slash_1', sfxHit: 'hit_light', shayiGain: 0,
  },
  combo_2: {
    pose: 'slash_2', duration: 0.42, cancelAt: 0.54, hitWindow: [0.13, 0.27], range: 3.2, arc: 2.3,
    dmg: 56, postureDmg: 22, lunge: 5.0, hitstop: 0.052, shake: 0.18,
    ribbonColor: 0x9cf0ff, sfxWhoosh: 'slash_2', sfxHit: 'hit_light', shayiGain: 0,
  },
  combo_3: {
    pose: 'slash_3', duration: 0.45, cancelAt: 0.56, hitWindow: [0.14, 0.29], range: 3.3, arc: 2.5,
    dmg: 68, postureDmg: 26, lunge: 5.8, hitstop: 0.062, shake: 0.22,
    ribbonColor: 0xc2f6ff, sfxWhoosh: 'slash_1', sfxHit: 'hit_light', shayiGain: 1,
  },
  combo_4: {
    pose: 'slash_4', duration: 0.56, cancelAt: 0.68, hitWindow: [0.15, 0.40], range: 3.7, arc: Math.PI * 2,
    dmg: 98, postureDmg: 38, lunge: 6.4, hitstop: 0.088, shake: 0.34,
    ribbonColor: 0xffd573, sfxWhoosh: 'slash_heavy', sfxHit: 'hit_heavy', shayiGain: 1,
  },

  // Empowered Counter-Riposte immediately after Perfect Parry!
  parry_riposte: {
    name: '振刀 · 追魂斩', tier: '破势反击',
    pose: 'slash_3', duration: 0.44, cancelAt: 0.58, hitWindow: [0.10, 0.28], range: 4.0, arc: 2.6,
    dmg: 132, postureDmg: 48, lunge: 9.2, hitstop: 0.092, shake: 0.40,
    ribbonColor: 0xffe07d, sfxWhoosh: 'slash_heavy', sfxHit: 'hit_heavy', shayiGain: 1,
    showCard: true, superArmor: true,
  },

  // Upper Skill Chain [E / 1]:《影杀三绝》(踏影刺 -> 旋风斩月 -> 断魂千裂)
  upper_0: {
    name: '踏影刺', tier: '影杀上链 · 壹式',
    pose: 'thrust', duration: 0.36, hitWindow: [0.08, 0.24], range: 4.4, arc: 1.5,
    dmg: 78, postureDmg: 28, lunge: 11.5, hitstop: 0.065, shake: 0.25,
    ribbonColor: 0x6ef7e8, sfxWhoosh: 'slash_2', sfxHit: 'hit_light', shayiGain: 1,
  },
  upper_1: {
    name: '旋风斩月', tier: '影杀上链 · 贰式',
    pose: 'slash_4', duration: 0.44, hitWindow: [0.10, 0.34], range: 3.8, arc: Math.PI * 2,
    dmg: 98, postureDmg: 36, lunge: 6.5, hitstop: 0.075, shake: 0.30,
    ribbonColor: 0x6ef7e8, sfxWhoosh: 'slash_heavy', sfxHit: 'hit_heavy', shayiGain: 1,
  },
  upper_2: {
    name: '断魂 · 千裂', tier: '杀意绝技 · 影杀终式',
    pose: 'whirlwind', duration: 0.68, hitWindow: [0.08, 0.56], multiHits: 3, range: 4.3, arc: Math.PI * 2,
    dmg: 76, postureDmg: 30, lunge: 7.5, hitstop: 0.085, shake: 0.42,
    ribbonColor: 0xff3b47, sfxWhoosh: 'slash_heavy', sfxHit: 'hit_heavy',
    shayiCost: 1, vo: 'combat_chain_upper', showCard: true, superArmor: true,
  },

  // Lower Skill Chain [Q / 2]:《赤霄破阵》(裂地重劈 -> 飞燕掠空 -> 赤霄坠天)
  lower_0: {
    name: '裂地重劈', tier: '赤霄下链 · 壹式',
    pose: 'overhead_slam', duration: 0.44, hitWindow: [0.16, 0.31], range: 3.5, arc: 2.0,
    dmg: 92, postureDmg: 42, lunge: 5.8, hitstop: 0.082, shake: 0.34,
    ribbonColor: 0xff9f45, sfxWhoosh: 'slash_heavy', sfxHit: 'hit_heavy', shayiGain: 1, shockwave: true,
  },
  lower_1: {
    name: '飞燕掠空', tier: '赤霄下链 · 贰式',
    pose: 'rising_slash', duration: 0.40, hitWindow: [0.10, 0.28], range: 3.6, arc: 2.2,
    dmg: 88, postureDmg: 34, lunge: 7.2, jumpY: 1.35, hitstop: 0.070, shake: 0.28,
    ribbonColor: 0xffb85c, sfxWhoosh: 'slash_2', sfxHit: 'hit_heavy', shayiGain: 1,
  },
  lower_2: {
    name: '赤霄 · 坠天', tier: '杀意绝技 · 赤霄终式',
    pose: 'overhead_slam', duration: 0.66, hitWindow: [0.28, 0.48], range: 5.0, arc: Math.PI * 2,
    dmg: 195, postureDmg: 68, lunge: 8.5, jumpY: 2.5, hitstop: 0.115, shake: 0.56,
    ribbonColor: 0xff2633, sfxWhoosh: 'slash_heavy', sfxHit: 'hit_heavy',
    shayiCost: 1, vo: 'combat_chain_lower', showCard: true, lightning: true, superArmor: true,
  },

  // Posture-Break Lethal Execution [F]:《鬼哭·一闪》
  execution: {
    name: '鬼哭 · 一闪', tier: '破绽绝杀',
    pose: 'thrust', duration: 0.72, hitWindow: [0.24, 0.42], range: 5.2, arc: Math.PI * 2,
    dmg: 360, postureDmg: 0, lunge: 14.0, hitstop: 0.145, shake: 0.65,
    ribbonColor: 0xffe494, sfxWhoosh: 'execution_oneslash', sfxHit: 'hit_heavy',
    vo: 'combat_execute', showCard: true, superArmor: true, invincible: true,
  },
};

export const ENEMY_MOVES = {
  assassin_slash: {
    pose: 'slash_1', duration: 0.88, telegraphAt: 0.12, hitWindow: [0.46, 0.60],
    range: 2.7, dmg: 68, lunge: 4.2, unblockable: false,
  },
  assassin_combo: {
    pose: 'slash_2', duration: 0.82, telegraphAt: 0.10, hitWindow: [0.42, 0.56],
    range: 2.9, dmg: 76, lunge: 5.2, unblockable: false,
  },
  boss_sweep: {
    pose: 'slash_1', duration: 1.02, telegraphAt: 0.16, hitWindow: [0.52, 0.68],
    range: 4.1, dmg: 110, lunge: 6.2, unblockable: false,
  },
  boss_double_fang: {
    pose: 'slash_2', duration: 0.86, telegraphAt: 0.12, hitWindow: [0.42, 0.58],
    range: 4.2, dmg: 118, lunge: 7.0, unblockable: false,
  },
  boss_overhead: {
    pose: 'overhead_slam', duration: 1.24, telegraphAt: 0.18, hitWindow: [0.66, 0.80],
    range: 4.5, dmg: 165, lunge: 7.5, unblockable: false, shockwave: true,
  },
  boss_crimson_thrust: {
    pose: 'thrust', duration: 1.08, telegraphAt: 0.14, hitWindow: [0.56, 0.70],
    range: 5.4, dmg: 155, lunge: 12.5, unblockable: true, // Red perilous attack (dodge or parry at exact frame!)
  },
  boss_phase2_whirlwind: {
    pose: 'whirlwind', duration: 1.32, telegraphAt: 0.15, hitWindow: [0.46, 0.92],
    range: 4.8, dmg: 175, lunge: 8.0, unblockable: false, lightning: true,
  },
};

/**
 * Returns terrain floor Y at (x, z) matching our Blender temple layout!
 * Note: Blender Y mapped to Three.js -Z (`export_yup=True`):
 *   - Outer Courtyard (`z > -9.2`): y = 0.0
 *   - Stone Stairs (`-12.5 <= z <= -9.2` and `|x| < 4.2`): smooth ramp 0.0 -> 1.29
 *   - Elevated Ruined Main Hall (`z < -12.5` and `|x| < 12.8`): y = 1.29
 */
export function getArenaFloorHeight(x, z) {
  if (z <= -12.5 && Math.abs(x) <= 12.8) {
    return 1.29;
  }
  if (z < -9.0 && z > -12.5 && Math.abs(x) <= 4.3) {
    const t = (-9.0 - z) / 3.5;
    return Math.max(0, Math.min(1.29, t * 1.29));
  }
  return 0.0;
}

/**
 * Clamps position inside playable courtyard & temple hall walls (including stair balustrade check).
 */
export function clampToArenaBounds(pos, prevPos, lockInBossHall = false) {
  pos.x = Math.max(-15.6, Math.min(15.6, pos.x));
  pos.z = Math.max(-28.2, Math.min(25.5, pos.z));

  if (lockInBossHall) {
    pos.x = Math.max(-10.4, Math.min(10.4, pos.x));
    pos.z = Math.max(-27.5, Math.min(-13.0, pos.z));
  } else {
    // Prevent walking straight through the 1.25m stone terrace ledge outside the central stairs!
    const wasBelow = prevPos.z >= -12.1;
    const nowAbove = pos.z < -12.1;
    if (wasBelow && nowAbove && Math.abs(pos.x) > 3.9) {
      pos.z = -12.1;
    }
  }
  pos.y = Math.max(pos.y, getArenaFloorHeight(pos.x, pos.z));
}

export class CombatManager {
  constructor({ audio, vfx, hudCallbacks }) {
    this.audio = audio;
    this.vfx = vfx;
    this.hud = hudCallbacks;

    this.hitstopTimer = 0;
    this.timeScale = 1.0;
    this.slowMoTimer = 0;

    this.comboCount = 0;
    this.comboDecayTimer = 0;
    this.stats = {
      parries: 0,
      executions: 0,
      maxCombo: 0,
      damageDealt: 0,
    };
  }

  triggerHitstop(duration, slowMoAfter = 0) {
    this.hitstopTimer = Math.max(this.hitstopTimer, duration);
    if (slowMoAfter > 0) {
      this.slowMoTimer = Math.max(this.slowMoTimer, slowMoAfter);
      this.timeScale = 0.24;
    }
  }

  addCombo(tag = '') {
    this.comboCount++;
    this.comboDecayTimer = 4.2;
    if (this.comboCount > this.stats.maxCombo) {
      this.stats.maxCombo = this.comboCount;
    }
    this.hud.onComboUpdate(this.comboCount, tag);
  }

  stepTime(rawDt) {
    if (this.comboCount > 0) {
      this.comboDecayTimer -= rawDt;
      if (this.comboDecayTimer <= 0) {
        this.comboCount = 0;
        this.hud.onComboUpdate(0, '');
      }
    }

    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= rawDt;
      return 0; // True freeze-frame ("卡肉感"!)
    }

    if (this.slowMoTimer > 0) {
      this.slowMoTimer -= rawDt;
      if (this.slowMoTimer <= 0) {
        this.timeScale = 1.0;
      }
    } else {
      this.timeScale += (1.0 - this.timeScale) * Math.min(1, rawDt * 12);
    }

    return rawDt * this.timeScale;
  }
}
