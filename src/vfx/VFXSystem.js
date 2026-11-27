import * as THREE from 'three';

/**
 * Dynamic 3D Sword Trail Ribbon:
 * Records sub-frame (base, tip) world positions and builds a smooth emissive blade arc.
 */
class SwordRibbon {
  constructor(scene, maxSamples = 26, colorHex = 0xa8ecff) {
    this.maxSamples = maxSamples;
    this.samples = [];
    this.geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(maxSamples * 2 * 3);
    const colors = new Float32Array(maxSamples * 2 * 4);
    const indices = [];
    for (let i = 0; i < maxSamples - 1; i++) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      indices.push(a, b, c, b, d, c);
    }
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));
    this.geometry.setIndex(indices);

    this.baseColor = new THREE.Color(colorHex);
    this.material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  setColor(hex) {
    this.baseColor.setHex(hex);
  }

  pushSample(basePos, tipPos, active) {
    if (active) {
      if (this.samples.length > 0) {
        const prev = this.samples[this.samples.length - 1];
        // Sub-step midpoint interpolation for ultra-smooth arcs
        const midBase = prev.base.clone().lerp(basePos, 0.5);
        const midTip = prev.tip.clone().lerp(tipPos, 0.5);
        // Slightly bow midpoint outward along velocity for dramatic wuxia crescent curve
        const vel = tipPos.clone().sub(prev.tip);
        if (vel.lengthSq() > 0.002) {
          midTip.addScaledVector(vel, 0.14);
        }
        this.samples.push({ base: midBase, tip: midTip, life: 1.0 });
      }
      this.samples.push({ base: basePos.clone(), tip: tipPos.clone(), life: 1.0 });
      while (this.samples.length > this.maxSamples) {
        this.samples.shift();
      }
    }
  }

  update(dt) {
    for (let i = this.samples.length - 1; i >= 0; i--) {
      this.samples[i].life -= dt * 7.8;
      if (this.samples[i].life <= 0) {
        this.samples.splice(i, 1);
      }
    }

    const posAttr = this.geometry.attributes.position;
    const colAttr = this.geometry.attributes.color;
    const count = this.samples.length;

    if (count < 2) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;

    for (let i = 0; i < this.maxSamples; i++) {
      const s = this.samples[Math.min(i, count - 1)];
      const t = i < count ? i / (count - 1) : 0;
      const alpha = i < count ? Math.pow(t, 1.5) * Math.max(0, s.life) : 0;

      posAttr.setXYZ(i * 2, s.base.x, s.base.y, s.base.z);
      posAttr.setXYZ(i * 2 + 1, s.tip.x, s.tip.y, s.tip.z);

      // Inner edge subtle, outer blade tip blazing bright
      colAttr.setXYZW(i * 2, this.baseColor.r * 0.6, this.baseColor.g * 0.6, this.baseColor.b * 0.6, alpha * 0.18);
      colAttr.setXYZW(i * 2 + 1, Math.min(1, this.baseColor.r * 1.4), Math.min(1, this.baseColor.g * 1.3), Math.min(1, this.baseColor.b * 1.3), alpha * 0.92);
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  }
}

export class VFXSystem {
  constructor(scene) {
    this.scene = scene;
    this.ribbons = [];
    this.sparks = [];
    this.bloodDrops = [];
    this.shockwaves = [];
    this.afterimages = [];
    this.lightningBolts = [];

    this._initRainSystem();
    this._initSparkPool();
    this._initBloodPool();
  }

  createSwordRibbon(colorHex = 0xa8ecff) {
    const r = new SwordRibbon(this.scene, 28, colorHex);
    this.ribbons.push(r);
    return r;
  }

  _initRainSystem() {
    const rainCount = 3000;
    const positions = new Float32Array(rainCount * 2 * 3);
    this.rainSeeds = new Float32Array(rainCount * 4);
    for (let i = 0; i < rainCount; i++) {
      const x = (Math.random() - 0.5) * 46;
      const y = Math.random() * 20;
      const z = (Math.random() - 0.5) * 68 - 4;
      const speed = 19 + Math.random() * 9;
      this.rainSeeds[i * 4] = x;
      this.rainSeeds[i * 4 + 1] = y;
      this.rainSeeds[i * 4 + 2] = z;
      this.rainSeeds[i * 4 + 3] = speed;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({
      color: 0x9ab8d8,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
    });
    this.rainLines = new THREE.LineSegments(geo, mat);
    this.rainLines.frustumCulled = false;
    this.scene.add(this.rainLines);
  }

  _initSparkPool() {
    this.maxSparks = 260;
    const pos = new Float32Array(this.maxSparks * 2 * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.LineBasicMaterial({
      color: 0xffd275,
      transparent: true,
      opacity: 0.96,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.sparkLines = new THREE.LineSegments(geo, mat);
    this.sparkLines.frustumCulled = false;
    this.scene.add(this.sparkLines);
  }

  _initBloodPool() {
    this.sharedSphereGeo = new THREE.SphereGeometry(0.065, 6, 6);
    this.bloodMat = new THREE.MeshBasicMaterial({
      color: 0x9e0b14,
      transparent: true,
      opacity: 0.88,
    });
    this.inkMat = new THREE.MeshBasicMaterial({
      color: 0x0b0c10,
      transparent: true,
      opacity: 0.78,
    });
  }

  spawnSparks(origin, count = 42, colorHex = 0xffcf6e, speedScale = 1.0) {
    this.sparkLines.material.color.setHex(colorHex);
    for (let i = 0; i < count; i++) {
      if (this.sparks.length >= this.maxSparks) this.sparks.shift();
      const theta = Math.random() * Math.PI * 2;
      const phi = (Math.random() - 0.25) * Math.PI * 0.85;
      const spd = (5.5 + Math.random() * 13.5) * speedScale;
      this.sparks.push({
        pos: origin.clone(),
        vel: new THREE.Vector3(
          Math.cos(theta) * Math.cos(phi) * spd,
          Math.abs(Math.sin(phi)) * spd + 2.2,
          Math.sin(theta) * Math.cos(phi) * spd
        ),
        life: 0.22 + Math.random() * 0.28,
        maxLife: 0.45,
      });
    }
  }

  spawnBloodAndInk(origin, dir, count = 20) {
    for (let i = 0; i < count; i++) {
      const isInk = i % 3 === 0;
      const mesh = new THREE.Mesh(this.sharedSphereGeo, isInk ? this.inkMat : this.bloodMat);
      mesh.position.copy(origin);
      const scale = isInk ? 1.4 + Math.random() * 1.8 : 0.7 + Math.random() * 1.3;
      mesh.scale.setScalar(scale);
      this.scene.add(mesh);

      const spread = new THREE.Vector3(
        (Math.random() - 0.5) * 5.5,
        1.5 + Math.random() * 4.2,
        (Math.random() - 0.5) * 5.5
      );
      if (dir) spread.addScaledVector(dir, 3.5 + Math.random() * 4.0);

      this.bloodDrops.push({
        mesh,
        vel: spread,
        life: 0.35 + Math.random() * 0.3,
      });
    }
  }

  spawnShockwave(pos, { color = 0xff3b3b, maxRadius = 4.2, duration = 0.38, vertical = false } = {}) {
    const geo = new THREE.RingGeometry(0.42, 0.49, 36);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    if (!vertical) {
      mesh.rotation.x = -Math.PI * 0.5;
      mesh.position.y += 0.08;
    } else {
      mesh.lookAt(pos.x, pos.y + 0.2, pos.z + 1);
    }
    this.scene.add(mesh);
    this.shockwaves.push({ mesh, mat, geo, age: 0, duration, maxRadius });
  }

  spawnTelegraphFlash(pos, isUnblockableRed = false) {
    const color = isUnblockableRed ? 0xff1e27 : 0xffe28a;
    this.spawnSparks(pos, isUnblockableRed ? 18 : 10, color, 0.65);
    this.spawnShockwave(pos, { color, maxRadius: isUnblockableRed ? 1.15 : 0.75, duration: 0.22, vertical: true });
  }

  spawnDashAfterimage(sourceGroup, tintHex = 0x5ce6dc) {
    const ghostMat = new THREE.MeshBasicMaterial({
      color: tintHex,
      transparent: true,
      opacity: 0.36,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ghostGroup = new THREE.Group();
    ghostGroup.position.copy(sourceGroup.position);
    ghostGroup.rotation.copy(sourceGroup.rotation);
    ghostGroup.scale.copy(sourceGroup.scale);

    // Lightweight silhouette proxy matching wuxia hat + cloak form
    const bodyGeo = new THREE.CylinderGeometry(0.22, 0.38, 1.55, 10);
    const hatGeo = new THREE.ConeGeometry(0.46, 0.2, 14);
    const body = new THREE.Mesh(bodyGeo, ghostMat);
    body.position.y = 0.85;
    const hat = new THREE.Mesh(hatGeo, ghostMat);
    hat.position.y = 1.72;
    ghostGroup.add(body, hat);

    this.scene.add(ghostGroup);
    this.afterimages.push({ group: ghostGroup, mat: ghostMat, geos: [bodyGeo, hatGeo], life: 0.32 });
  }

  spawnCrimsonLightning(targetPos, colorHex = 0xff2b37) {
    const points = [];
    const segs = 12;
    const topY = targetPos.y + 15.0;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const jitter = (i === 0 || i === segs) ? 0 : (Math.random() - 0.5) * 1.4;
      points.push(new THREE.Vector3(
        targetPos.x + jitter,
        topY * (1 - t) + targetPos.y * t,
        targetPos.z + jitter * 0.8
      ));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
    });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.lightningBolts.push({ line, geo, mat, life: 0.26 });
    this.spawnShockwave(targetPos, { color: colorHex, maxRadius: 5.8, duration: 0.45 });
  }

  update(dt, focusCenter) {
    // 1. Update ribbons
    for (const r of this.ribbons) {
      r.update(dt);
    }

    // 2. Update storm rain centered around player/camera
    const rPos = this.rainLines.geometry.attributes.position;
    const cx = focusCenter ? focusCenter.x : 0;
    const cz = focusCenter ? focusCenter.z : 0;
    for (let i = 0; i < 3000; i++) {
      let x = this.rainSeeds[i * 4];
      let y = this.rainSeeds[i * 4 + 1];
      let z = this.rainSeeds[i * 4 + 2];
      const spd = this.rainSeeds[i * 4 + 3];

      y -= spd * dt;
      x -= 2.8 * dt;
      if (y < 0) {
        y = 18 + Math.random() * 4;
        x = cx + (Math.random() - 0.5) * 44;
        z = cz + (Math.random() - 0.5) * 48;
      }
      this.rainSeeds[i * 4] = x;
      this.rainSeeds[i * 4 + 1] = y;
      this.rainSeeds[i * 4 + 2] = z;

      // Shelter rain under Main Hall roof except through the shattered central skylight!
      const underHallRoof = z < -13.6 && z > -29.4 && Math.abs(x) < 10.6;
      const inSkylightShaft = Math.abs(x) < 3.1 && z < -17.5 && z > -23.5;
      if (underHallRoof && !inSkylightShaft && y < 8.5) {
        rPos.setXYZ(i * 2, 0, -50, 0);
        rPos.setXYZ(i * 2 + 1, 0, -50, 0);
      } else {
        rPos.setXYZ(i * 2, x, y, z);
        rPos.setXYZ(i * 2 + 1, x + 0.09, y + 0.62, z);
      }
    }
    rPos.needsUpdate = true;

    // 3. Update metallic sparks
    const sPos = this.sparkLines.geometry.attributes.position;
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life -= dt;
      if (s.life <= 0) {
        this.sparks.splice(i, 1);
        continue;
      }
      s.vel.y -= 24.0 * dt;
      s.pos.addScaledVector(s.vel, dt);
      if (s.pos.y < 0.05) {
        s.pos.y = 0.05;
        s.vel.y *= -0.45;
        s.vel.x *= 0.7;
        s.vel.z *= 0.7;
      }
    }
    for (let i = 0; i < this.maxSparks; i++) {
      if (i < this.sparks.length) {
        const s = this.sparks[i];
        sPos.setXYZ(i * 2, s.pos.x, s.pos.y, s.pos.z);
        sPos.setXYZ(i * 2 + 1, s.pos.x - s.vel.x * 0.026, s.pos.y - s.vel.y * 0.026, s.pos.z - s.vel.z * 0.026);
      } else {
        sPos.setXYZ(i * 2, 0, -50, 0);
        sPos.setXYZ(i * 2 + 1, 0, -50, 0);
      }
    }
    sPos.needsUpdate = true;

    // 4. Update blood & ink droplets
    for (let i = this.bloodDrops.length - 1; i >= 0; i--) {
      const b = this.bloodDrops[i];
      b.life -= dt;
      b.vel.y -= 18.0 * dt;
      b.mesh.position.addScaledVector(b.vel, dt);
      b.mesh.scale.multiplyScalar(0.95);
      if (b.life <= 0 || b.mesh.position.y < 0) {
        this.scene.remove(b.mesh);
        this.bloodDrops.splice(i, 1);
      }
    }

    // 5. Update shockwaves
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.age += dt;
      const u = Math.min(1, sw.age / sw.duration);
      const sc = 0.4 + sw.maxRadius * (1 - Math.pow(1 - u, 3));
      sw.mesh.scale.setScalar(sc);
      sw.mat.opacity = (1 - u) * 0.9;
      if (u >= 1) {
        this.scene.remove(sw.mesh);
        sw.geo.dispose();
        sw.mat.dispose();
        this.shockwaves.splice(i, 1);
      }
    }

    // 6. Update ghost afterimages
    for (let i = this.afterimages.length - 1; i >= 0; i--) {
      const ai = this.afterimages[i];
      ai.life -= dt;
      ai.mat.opacity = Math.max(0, (ai.life / 0.32) * 0.36);
      if (ai.life <= 0) {
        this.scene.remove(ai.group);
        ai.geos.forEach((g) => g.dispose());
        ai.mat.dispose();
        this.afterimages.splice(i, 1);
      }
    }

    // 7. Update lightning bolts
    for (let i = this.lightningBolts.length - 1; i >= 0; i--) {
      const lb = this.lightningBolts[i];
      lb.life -= dt;
      lb.mat.opacity = Math.max(0, lb.life / 0.26);
      if (lb.life <= 0) {
        this.scene.remove(lb.line);
        lb.geo.dispose();
        lb.mat.dispose();
        this.lightningBolts.splice(i, 1);
      }
    }
  }
}
