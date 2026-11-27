import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

/**
 * 3A Martial-Arts Skeletal Rig & Weapon Constraint Engine:
 * 1. Drives zero-shield mocap clips (`idle`, `walk`, `run`, `dash`, `slash_1..4`,
 *    `thrust`, `rising_slash`, `whirlwind`, `overhead_slam`, `parry`, `parry_impact`, `stagger`, `death`).
 * 2. Applies non-linear wuxia strike velocity curve (蓄劲 Coiling -> 爆发 Whip Strike -> 残心 Zanshin Follow-Through)
 *    with smooth Zanshin recovery crossfades (zero pose snapping!).
 * 3. Solves exact anatomical palm-center & knuckle orthonormal basis + Two-Handed Co-Axial Hilt Alignment
 *    every frame so single- and two-handed blades NEVER float, flip, or clip!
 */
export class FighterRig {
  constructor({ gltfSource, weaponPrototype, scale = 1.0, bladeLength = 1.08, twoHanded = false, ribbon }) {
    this.root = new THREE.Group();
    this.model = SkeletonUtils.clone(gltfSource.scene);
    this.model.scale.setScalar(scale);
    this.root.add(this.model);

    this.scale = scale;
    this.bladeLength = bladeLength;
    this.twoHanded = twoHanded;
    this.ribbon = ribbon;
    this.trailActive = false;

    this.bones = {};
    this.meshes = [];

    this.model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (child.material) {
          child.material = child.material.clone();
        }
        this.meshes.push(child);
      }
      if (child.isBone) {
        const cleanName = child.name.replace(/^mixamorig:?/, '');
        this.bones[cleanName] = child;
      }
    });

    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    this.clips = {};
    for (const clip of gltfSource.animations || []) {
      const key = clip.name.toLowerCase();
      const action = this.mixer.clipAction(clip);
      if (key === 'death') {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      } else if (
        key.startsWith('slash') ||
        key === 'thrust' ||
        key === 'rising_slash' ||
        key === 'whirlwind' ||
        key === 'overhead_slam' ||
        key === 'parry_impact' ||
        key === 'stagger' ||
        key === 'dash'
      ) {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      this.actions[key] = action;
      this.clips[key] = clip;
    }

    this.activeAction = null;
    this.activeKey = null;
    this.deathStarted = false;
    this.parryImpactTimer = 0;
    this._switchAction('idle', { fade: 0.01, reset: true });

    // Mount weapon directly in world-aligned root space (scale 1:1, immune to 0.01 bone scale!)
    this.weaponSocket = new THREE.Group();
    this.weaponSocket.scale.setScalar(scale);
    this.bladeBaseMarker = new THREE.Object3D();
    this.bladeTipMarker = new THREE.Object3D();
    this.bladeBaseMarker.position.set(0, 0.06, 0);
    this.bladeTipMarker.position.set(0, bladeLength, 0);
    this.weaponSocket.add(this.bladeBaseMarker, this.bladeTipMarker);

    if (weaponPrototype) {
      this.weaponMesh = weaponPrototype.clone(true);
      this.weaponMesh.position.set(0, 0, 0);
      this.weaponMesh.rotation.set(0, 0, 0);
      this.weaponMesh.scale.set(1, 1, 1);
      this.weaponSocket.add(this.weaponMesh);
    }
    this.root.add(this.weaponSocket);

    this.poseState = {
      hitFlash: 0,
      kneel: 0,
      lookYaw: 0,
    };

    // Reusable math scratchpad (zero GC churn at 60/120Hz!)
    this._vRWrist = new THREE.Vector3();
    this._vRIndex = new THREE.Vector3();
    this._vRMid = new THREE.Vector3();
    this._vRPinky = new THREE.Vector3();
    this._vLWrist = new THREE.Vector3();
    this._vLMid = new THREE.Vector3();
    this._vGrip = new THREE.Vector3();
    this._vLPalm = new THREE.Vector3();
    this._vThumbSide = new THREE.Vector3();
    this._vKnuckle = new THREE.Vector3();
    this._vPalmNormal = new THREE.Vector3();
    this._vTwoHand = new THREE.Vector3();
    this._vBladeY = new THREE.Vector3();
    this._vEdgeZ = new THREE.Vector3();
    this._vFlatX = new THREE.Vector3();
    this._mBasis = new THREE.Matrix4();
    this._qWorld = new THREE.Quaternion();
    this._qRootInv = new THREE.Quaternion();
    this._tmpBase = new THREE.Vector3();
    this._tmpTip = new THREE.Vector3();
  }

  _resolveClipKey(requested) {
    if (this.actions[requested]) return requested;
    const fallbacks = {
      dash: 'run',
      rising_slash: 'slash_2',
      slash_3: 'slash_1',
      slash_4: 'slash_2',
      whirlwind: 'slash_2',
      overhead_slam: 'slash_1',
      parry_impact: 'parry',
      stagger: 'parry',
    };
    const alt = fallbacks[requested];
    if (alt && this.actions[alt]) return alt;
    return 'idle';
  }

  /**
   * Non-linear martial strike timing curve (蓄劲 -> 爆发 -> 残心收势):
   * Gives unmistakable windup, blistering whip-speed impact, and poised follow-through!
   */
  _martialTimingCurve(t) {
    const p = Math.max(0, Math.min(1, t));
    if (p < 0.20) {
      // Coiling anticipation (0.00 -> 0.16)
      const u = p / 0.20;
      return 0.16 * (u * u);
    }
    if (p < 0.54) {
      // Blistering whip-through strike (0.16 -> 0.80)
      const u = (p - 0.20) / 0.34;
      const snap = 1 - Math.pow(1 - u, 2.8);
      return 0.16 + 0.64 * snap;
    }
    // Zanshin poised deceleration (0.80 -> 0.96)
    const u = (p - 0.54) / 0.46;
    return 0.80 + 0.16 * (1 - Math.pow(1 - u, 2));
  }

  _switchAction(key, { fade = 0.12, timeScale = 1.0, reset = false, startRatio = 0.0 } = {}) {
    const actualKey = this._resolveClipKey(key);
    const next = this.actions[actualKey];
    if (!next) return null;

    if (this.activeAction === next) {
      next.timeScale = timeScale;
      return next;
    }

    const prev = this.activeAction;
    if (reset) {
      next.reset();
      if (startRatio > 0 && this.clips[actualKey]) {
        next.time = this.clips[actualKey].duration * startRatio;
      }
    }
    next.enabled = true;
    next.setEffectiveWeight(1.0);
    next.timeScale = timeScale;
    next.fadeIn(fade).play();

    if (prev) {
      // Keep outgoing attack pose settling gently during Zanshin crossfade instead of freezing!
      if (prev.timeScale === 0) prev.timeScale = 0.28;
      prev.fadeOut(fade);
    }

    this.activeAction = next;
    this.activeKey = actualKey;
    return next;
  }

  triggerParryImpact() {
    this.parryImpactTimer = 0.26;
    this._switchAction('parry_impact', { fade: 0.04, timeScale: 1.35, reset: true, startRatio: 0.08 });
  }

  triggerHitFlash(duration = 0.11) {
    this.poseState.hitFlash = duration;
  }

  setPhase2DemonGlow() {
    for (const m of this.meshes) {
      if (m.material && m.material.emissive) {
        m.material.emissive.setHex(0x52080d);
        m.material.emissiveIntensity = 0.72;
      }
    }
  }

  /**
   * Solves exact anatomical palm grip & Two-Handed Hilt Co-Axial Alignment every frame!
   */
  _solveWeaponHandConstraint() {
    const bRWrist = this.bones.RightHand;
    const bRIndex = this.bones.RightHandIndex1;
    const bRMid = this.bones.RightHandMiddle1;
    const bRPinky = this.bones.RightHandPinky1;
    if (!bRWrist || !bRIndex || !bRMid || !bRPinky) return;

    this.root.updateMatrixWorld(true);

    bRWrist.getWorldPosition(this._vRWrist);
    bRIndex.getWorldPosition(this._vRIndex);
    bRMid.getWorldPosition(this._vRMid);
    bRPinky.getWorldPosition(this._vRPinky);

    // 1. Single-hand anatomical basis from closed fist knuckles
    this._vThumbSide.subVectors(this._vRIndex, this._vRPinky).normalize();
    this._vKnuckle.subVectors(this._vRMid, this._vRWrist).normalize();
    this._vPalmNormal.crossVectors(this._vThumbSide, this._vKnuckle).normalize();

    // Exact palm grip center tucked inside curled fingers
    this._vGrip.lerpVectors(this._vRWrist, this._vRMid, 0.56)
      .addScaledVector(this._vPalmNormal, 0.028 * this.scale);

    // 2. Two-Handed Hilt Alignment (passes hilt shaft straight through BOTH palms!)
    this._vBladeY.copy(this._vThumbSide);
    if (this.twoHanded && this.bones.LeftHand) {
      this.bones.LeftHand.getWorldPosition(this._vLWrist);
      if (this.bones.LeftHandMiddle1) {
        this.bones.LeftHandMiddle1.getWorldPosition(this._vLMid);
        this._vLPalm.lerpVectors(this._vLWrist, this._vLMid, 0.56);
      } else {
        this._vLPalm.copy(this._vLWrist);
      }

      this._vTwoHand.subVectors(this._vGrip, this._vLPalm);
      const dist = this._vTwoHand.length();
      const minTwoHandDist = 0.13 * this.scale;
      const maxTwoHandDist = 0.44 * this.scale;
      if (dist > minTwoHandDist && dist < maxTwoHandDist) {
        this._vTwoHand.divideScalar(dist);
        const alignDot = this._vTwoHand.dot(this._vThumbSide);
        const absDot = Math.abs(alignDot);
        // Only lock onto two-hand vector when palms are genuinely spaced along the hilt axis (absDot > 0.52),
        // preventing sideways tilt if wrists cross side-by-side at overhead swing apex!
        if (absDot > 0.52) {
          if (alignDot < 0) this._vTwoHand.negate();
          const distFactor = 1.0 - Math.max(0, Math.min(1, (dist - 0.28 * this.scale) / (0.16 * this.scale)));
          const dotFactor = Math.min(1, (absDot - 0.52) / 0.28);
          const blend = distFactor * dotFactor * 0.88;
          this._vBladeY.lerp(this._vTwoHand, blend).normalize();
        }
      }
    }

    // 3. Orthogonalize cutting-edge direction (+Z) and blade-flat normal (+X)
    this._vEdgeZ.copy(this._vKnuckle)
      .addScaledVector(this._vBladeY, -this._vKnuckle.dot(this._vBladeY));
    if (this._vEdgeZ.lengthSq() < 1e-5) {
      this._vEdgeZ.set(0, 0, 1);
    } else {
      this._vEdgeZ.normalize();
    }
    this._vFlatX.crossVectors(this._vBladeY, this._vEdgeZ).normalize();
    this._vEdgeZ.crossVectors(this._vFlatX, this._vBladeY).normalize();

    this._mBasis.makeBasis(this._vFlatX, this._vBladeY, this._vEdgeZ);
    this._qWorld.setFromRotationMatrix(this._mBasis);

    // Convert world transform into `this.root` local space
    this.root.WorldToLocal_Pos = this.weaponSocket.position.copy(this._vGrip);
    this.root.worldToLocal(this.weaponSocket.position);
    this.root.getWorldQuaternion(this._qRootInv).invert();
    this.weaponSocket.quaternion.copy(this._qRootInv).multiply(this._qWorld);
    this.weaponSocket.updateMatrixWorld(true);
  }

  getBladeWorldSegment() {
    this.weaponSocket.updateMatrixWorld(true);
    this.bladeBaseMarker.getWorldPosition(this._tmpBase);
    this.bladeTipMarker.getWorldPosition(this._tmpTip);
    return { base: this._tmpBase, tip: this._tmpTip };
  }

  _applyBoneOffset(boneName, rx, ry, rz, blend = 1.0) {
    const b = this.bones[boneName];
    if (!b) return;
    const offsetQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'XYZ'));
    const targetQ = b.quaternion.clone().multiply(offsetQ);
    b.quaternion.slerp(targetQ, blend);
  }

  update(dt, {
    moveSpeed = 0,
    moveMax = 7.8,
    combatPose = 'none',
    poseProgress = 0,
    isDashing = false,
    isParrying = false,
    isBroken = false,
    isDead = false,
    lookTargetPos = null,
  } = {}) {
    if (this.parryImpactTimer > 0) {
      this.parryImpactTimer = Math.max(0, this.parryImpactTimer - dt);
    }

    const wasAttack =
      this.activeKey &&
      (this.activeKey.startsWith('slash') ||
        this.activeKey === 'thrust' ||
        this.activeKey === 'rising_slash' ||
        this.activeKey === 'whirlwind' ||
        this.activeKey === 'overhead_slam');

    if (isDead) {
      if (!this.deathStarted) {
        this.deathStarted = true;
        this._switchAction('death', { fade: 0.10, timeScale: 1.1, reset: true });
      }
      this.mixer.update(dt);
    } else if (isDashing) {
      this._switchAction('dash', { fade: 0.06, timeScale: 1.55, reset: this.activeKey !== 'dash', startRatio: 0.12 });
      this.mixer.update(dt);
      // Forward martial鬼步 torso lean!
      this._applyBoneOffset('Spine1', 0.28, 0, 0, 0.85);
    } else if (combatPose !== 'none') {
      const key = this._resolveClipKey(combatPose);
      // Crisp 0.085s chain crossfade when linking combos!
      const isNewMove = this.activeKey !== key;
      const act = this._switchAction(key, { fade: 0.085, timeScale: 0.0, reset: isNewMove });
      const clip = this.clips[key];
      if (act && clip) {
        const martialP = this._martialTimingCurve(poseProgress);
        const startOff = clip.duration * 0.08;
        const activeSpan = clip.duration * 0.84;
        act.time = startOff + martialP * activeSpan;
      }
      this.mixer.update(dt);
    } else if (this.parryImpactTimer > 0) {
      this.mixer.update(dt);
    } else if (isParrying) {
      // Instant 55ms whip into Two-Handed Cross-Blade Deflect!
      this._switchAction('parry', { fade: 0.055, timeScale: 1.0, reset: false });
      this.mixer.update(dt);
    } else {
      // Smooth 0.26s Zanshin recovery crossfade when returning from an attack to guard/run!
      const recovFade = wasAttack ? 0.26 : 0.14;
      if (moveSpeed > 2.8) {
        this._switchAction('run', {
          fade: wasAttack ? 0.18 : 0.12,
          timeScale: Math.min(1.32, 0.92 + (moveSpeed / moveMax) * 0.35),
          reset: false,
        });
      } else if (moveSpeed > 0.35) {
        this._switchAction('walk', { fade: recovFade, timeScale: 1.12, reset: false });
      } else {
        this._switchAction('idle', { fade: recovFade, timeScale: 1.0, reset: false });
      }
      this.mixer.update(dt);
    }

    // Subtle Martial Head/Upper-Spine Target Tracking ("目视敌手，腰马合一")
    if (!isDead && combatPose === 'none' && lookTargetPos) {
      const dx = lookTargetPos.x - this.root.position.x;
      const dz = lookTargetPos.z - this.root.position.z;
      if (dx * dx + dz * dz < 85) {
        let relYaw = Math.atan2(dx, dz) - this.root.rotation.y;
        while (relYaw > Math.PI) relYaw -= Math.PI * 2;
        while (relYaw < -Math.PI) relYaw += Math.PI * 2;
        const clampedYaw = Math.max(-0.42, Math.min(0.42, relYaw));
        this.poseState.lookYaw += (clampedYaw - this.poseState.lookYaw) * Math.min(1, dt * 10);
        this._applyBoneOffset('Spine2', 0, this.poseState.lookYaw * 0.35, 0, 0.65);
        this._applyBoneOffset('Head', 0, this.poseState.lookYaw * 0.55, 0, 0.75);
      }
    }

    // Posture-Broken Kneel State
    const targetKneel = isBroken && !isDead ? 1.0 : 0.0;
    this.poseState.kneel += (targetKneel - this.poseState.kneel) * Math.min(1, dt * 10);
    if (this.poseState.kneel > 0.02) {
      const k = this.poseState.kneel;
      this.model.position.y = -0.34 * k;
      this._applyBoneOffset('Spine1', 0.48 * k, 0, 0, k);
      this._applyBoneOffset('Head', 0.32 * k, 0, 0, k);
    } else if (!isDead) {
      this.model.position.y = 0;
    }

    // Hit-Flash Emissive Feedback
    if (this.poseState.hitFlash > 0) {
      this.poseState.hitFlash -= dt;
      const flashOn = this.poseState.hitFlash > 0;
      for (const m of this.meshes) {
        if (m.material && m.material.emissive) {
          m.material.emissive.setHex(flashOn ? 0xffeedd : 0x000000);
          m.material.emissiveIntensity = flashOn ? 1.35 : 0.0;
        }
      }
    }

    // Solve exact anatomical palm/two-handed sword alignment AFTER all skeletal deformations!
    this._solveWeaponHandConstraint();

    if (this.ribbon) {
      const seg = this.getBladeWorldSegment();
      this.ribbon.pushSample(seg.base, seg.tip, this.trailActive && !isDead);
    }
  }
}
