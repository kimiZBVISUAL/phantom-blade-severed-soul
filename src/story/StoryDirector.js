import * as THREE from 'three';

/**
 * Real-time 3D Cutscene Camera & Voiced Dialogue Director
 */
export class StoryDirector {
  constructor({ audio, hud, vfx, onTriggerLightning }) {
    this.audio = audio;
    this.hud = hud;
    this.vfx = vfx;
    this.onTriggerLightning = onTriggerLightning;

    this.inCutscene = false;
    this.skipRequested = false;
    this.shot = null;

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' && this.inCutscene) {
        e.preventDefault();
        this.requestSkip();
      }
    });
  }

  requestSkip() {
    if (!this.inCutscene) return;
    this.skipRequested = true;
    this.audio.stopVO();
  }

  _setCameraShot(fromPos, toPos, lookFrom, lookTo, duration) {
    this.shot = {
      fromPos: fromPos.clone(),
      toPos: toPos.clone(),
      lookFrom: lookFrom.clone(),
      lookTo: lookTo.clone(),
      duration: Math.max(0.1, duration),
      elapsed: 0,
    };
  }

  updateCamera(dt, camera) {
    if (!this.inCutscene || !this.shot) return false;
    this.shot.elapsed += dt;
    const t = Math.min(1, this.shot.elapsed / this.shot.duration);
    const smooth = t * t * (3 - 2 * t);

    camera.position.lerpVectors(this.shot.fromPos, this.shot.toPos, smooth);
    const look = new THREE.Vector3().lerpVectors(this.shot.lookFrom, this.shot.lookTo, smooth);
    camera.lookAt(look);
    return true;
  }

  async _runBeat(shotConfig, voId, extraFx = null) {
    if (this.skipRequested) return;
    const voDur = this.audio.getVODuration ? this.audio.getVODuration(voId) : shotConfig.duration;
    this._setCameraShot(
      shotConfig.fromPos,
      shotConfig.toPos,
      shotConfig.lookFrom,
      shotConfig.lookTo,
      Math.max(shotConfig.duration, voDur + 0.12)
    );
    if (extraFx) extraFx();
    await this.audio.playVO(voId, (sp, txt) => this.hud.showSubtitle(sp, txt));
  }

  async playIntroCutscene(player, assassins) {
    this.inCutscene = true;
    this.skipRequested = false;
    this.hud.setCinematicMode(true, () => this.requestSkip());

    // Shot 1: Sweeping crane down the rain-soaked Mountain Gate & Stone Lions
    await this._runBeat({
      fromPos: new THREE.Vector3(0, 9.5, 31.0),
      toPos: new THREE.Vector3(2.4, 3.6, 25.2),
      lookFrom: new THREE.Vector3(0, 4.2, 16.0),
      lookTo: new THREE.Vector3(0, 1.8, 20.5),
      duration: 5.5,
    }, 'intro_1_narrator', () => this.onTriggerLightning());

    // Shot 2: Low-angle hero close-up on Hun's bamboo rain hat & gleaming Tang-Dao
    await this._runBeat({
      fromPos: new THREE.Vector3(-1.45, 1.35, 20.6),
      toPos: new THREE.Vector3(1.25, 1.55, 20.8),
      lookFrom: player.pos.clone().add(new THREE.Vector3(0, 1.55, 0)),
      lookTo: player.pos.clone().add(new THREE.Vector3(0, 1.62, 0)),
      duration: 5.5,
    }, 'intro_2_hun');

    // Shot 3: Whip-pan to Courtyard Xuanming Assassins drawing sabers
    const lead = assassins[0] ? assassins[0].pos : new THREE.Vector3(0, 0, 5);
    await this._runBeat({
      fromPos: new THREE.Vector3(3.2, 2.5, 12.5),
      toPos: new THREE.Vector3(0.5, 2.0, 9.8),
      lookFrom: lead.clone().add(new THREE.Vector3(0, 1.4, 0)),
      lookTo: lead.clone().add(new THREE.Vector3(0, 1.5, 0)),
      duration: 3.5,
    }, 'intro_3_assassin');

    this.inCutscene = false;
    this.shot = null;
    this.hud.setCinematicMode(false);
  }

  async playBossIntroCutscene(player, boss) {
    this.inCutscene = true;
    this.skipRequested = false;
    this.hud.setCinematicMode(true, () => this.requestSkip());

    // Position player & boss at iconic duel standoff on the Grand Ruined Hall stone floor
    player.pos.set(0, 1.29, -15.2);
    player.yaw = Math.PI;
    boss.pos.set(0, 1.29, -22.8);
    boss.yaw = 0;

    await this._runBeat({
      fromPos: new THREE.Vector3(3.2, 2.4, -18.2),
      toPos: new THREE.Vector3(-1.6, 2.8, -19.5),
      lookFrom: boss.pos.clone().add(new THREE.Vector3(0, 1.6, 0)),
      lookTo: boss.pos.clone().add(new THREE.Vector3(0, 1.75, 0)),
      duration: 6.0,
    }, 'boss_intro_1_xiao', () => this.onTriggerLightning());

    await this._runBeat({
      fromPos: new THREE.Vector3(-1.5, 2.6, -13.6),
      toPos: new THREE.Vector3(-2.1, 2.7, -14.0),
      lookFrom: player.pos.clone().add(new THREE.Vector3(0, 1.5, -2.0)),
      lookTo: boss.pos.clone().add(new THREE.Vector3(0, 1.6, 0)),
      duration: 4.2,
    }, 'boss_intro_2_hun');

    await this._runBeat({
      fromPos: new THREE.Vector3(0.9, 2.3, -20.2),
      toPos: new THREE.Vector3(2.2, 2.8, -18.5),
      lookFrom: boss.pos.clone().add(new THREE.Vector3(0, 1.65, 0)),
      lookTo: player.pos.clone().add(new THREE.Vector3(0, 1.4, -3.5)),
      duration: 4.5,
    }, 'boss_intro_3_xiao', () => {
      this.vfx.spawnShockwave(boss.pos, { color: 0xff2b36, maxRadius: 5.2, duration: 0.55 });
    });

    this.inCutscene = false;
    this.shot = null;
    this.hud.setCinematicMode(false);
  }

  async playBossPhase2Cutscene(boss) {
    this.inCutscene = true;
    this.skipRequested = false;
    this.hud.setCinematicMode(true, () => this.requestSkip());

    this.vfx.spawnCrimsonLightning(boss.pos, 0xff1e2d);
    this.onTriggerLightning();

    await this._runBeat({
      fromPos: new THREE.Vector3(-2.6, 2.4, boss.pos.z + 4.2),
      toPos: new THREE.Vector3(2.4, 3.1, boss.pos.z + 3.6),
      lookFrom: boss.pos.clone().add(new THREE.Vector3(0, 1.6, 0)),
      lookTo: boss.pos.clone().add(new THREE.Vector3(0, 1.85, 0)),
      duration: 4.6,
    }, 'boss_phase2_xiao');

    this.inCutscene = false;
    this.shot = null;
    this.hud.setCinematicMode(false);

    // Tactical voice hint continues seamlessly while combat resumes!
    this.audio.playVO('boss_phase2_narrator', (sp, txt) => {
      this.hud.showSubtitle(sp, txt);
      setTimeout(() => {
        if (!this.inCutscene) this.hud.hideSubtitle();
      }, 4600);
    });
  }

  async playEndingCutscene(player, boss) {
    this.inCutscene = true;
    this.skipRequested = false;
    this.hud.setCinematicMode(true);

    await this._runBeat({
      fromPos: new THREE.Vector3(2.2, 2.3, boss.pos.z + 3.2),
      toPos: new THREE.Vector3(-1.8, 2.0, boss.pos.z + 2.6),
      lookFrom: boss.pos.clone().add(new THREE.Vector3(0, 0.8, 0)),
      lookTo: boss.pos.clone().add(new THREE.Vector3(0, 0.6, 0)),
      duration: 5.5,
    }, 'ending_1_xiao');

    await this._runBeat({
      fromPos: new THREE.Vector3(-1.4, 2.2, player.pos.z + 2.4),
      toPos: new THREE.Vector3(0.0, 4.2, player.pos.z + 5.8),
      lookFrom: player.pos.clone().add(new THREE.Vector3(0, 1.55, 0)),
      lookTo: player.pos.clone().add(new THREE.Vector3(0, 1.8, -3.0)),
      duration: 4.8,
    }, 'ending_2_hun', () => this.onTriggerLightning());

    this.inCutscene = false;
    this.shot = null;
    this.hud.hideSubtitle();
  }
}
