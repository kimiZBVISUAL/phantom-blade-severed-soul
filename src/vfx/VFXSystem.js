import * as THREE from 'three';

/**
 * Dynamic 3D Sword Trail Ribbon (Zero-GC Pooled Implementation):
 * Records sub-frame (base, tip) world positions and builds a smooth emissive blade arc.
 */
class SwordRibbon {
  constructor(scene, maxSamples = 24, colorHex = 0xa8ecff) {
    this.scene = scene;
    this.maxSamples = maxSamples;
    this.count = 0;
    this.samples = Array.from({ length: maxSamples }, () => ({
      bx: 0, by: 0, bz: 0,
      tx: 0, ty: 0, tz: 0,
      life: 0,
    }));

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
    this.posArr = positions;
    this.colArr = colors;
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
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  setColor(hex) {
    this.baseColor.setHex(hex);
  }

  _appendRaw(bx, by, bz, tx, ty, tz) {
    if (this.count >= this.maxSamples) {
      // Shift left in-place (zero allocation)
      const first = this.samples[0];
      for (let i = 0; i < this.maxSamples - 1; i++) {
        this.samples[i] = this.samples[i + 1];
      }
      this.samples[this.maxSamples - 1] = first;
      this.count = this.maxSamples - 1;
    }
    const slot = this.samples[this.count++];
    slot.bx = bx; slot.by = by; slot.bz = bz;
    slot.tx = tx; slot.ty = ty; slot.tz = tz;
    slot.life = 1.0;
  }

  pushSample(basePos, tipPos, active) {
    if (!active) return;
    if (this.count > 0) {
      const prev = this.samples[this.count - 1];
      const mbx = (prev.bx + basePos.x) * 0.5;
      const mby = (prev.by + basePos.y) * 0.5;
      const mbz = (prev.bz + basePos.z) * 0.5;
      let mtx = (prev.tx + tipPos.x) * 0.5;
      let mty = (prev.ty + tipPos.y) * 0.5;
      let mtz = (prev.tz + tipPos.z) * 0.5;

      const vx = tipPos.x - prev.tx;
      const vy = tipPos.y - prev.ty;
      const vz = tipPos.z - prev.tz;
      if (vx * vx + vy * vy + vz * vz > 0.002) {
        mtx += vx * 0.14;
        mty += vy * 0.14;
        mtz += vz * 0.14;
      }
      this._appendRaw(mbx, mby, mbz, mtx, mty, mtz);
    }
    this._appendRaw(basePos.x, basePos.y, basePos.z, tipPos.x, tipPos.y, tipPos.z);
  }

  update(dt) {
    if (this.count === 0) {
      this.mesh.visible = false;
      return;
    }

    const decay = dt * 7.8;
    let writeIdx = 0;
    for (let i = 0; i < this.count; i++) {
      const s = this.samples[i];
      s.life -= decay;
      if (s.life > 0) {
        if (writeIdx !== i) {
          const tmp = this.samples[writeIdx];
          this.samples[writeIdx] = s;
          this.samples[i] = tmp;
        }
        writeIdx++;
      }
    }
    this.count = writeIdx;

    if (this.count < 2) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;

    const pos = this.posArr;
    const col = this.colArr;
    const br = this.baseColor.r;
    const bg = this.baseColor.g;
    const bb = this.baseColor.b;
    const br6 = br * 0.6;
    const bg6 = bg * 0.6;
    const bb6 = bb * 0.6;
    const brHi = Math.min(1, br * 1.4);
    const bgHi = Math.min(1, bg * 1.3);
    const bbHi = Math.min(1, bb * 1.3);
    const invCount = 1 / (this.count - 1);

    for (let i = 0; i < this.count; i++) {
      const s = this.samples[i];
      const t = i * invCount;
      const alpha = Math.pow(t, 1.5) * s.life;

      const pIdx = i * 6;
      pos[pIdx] = s.bx;
      pos[pIdx + 1] = s.by;
      pos[pIdx + 2] = s.bz;
      pos[pIdx + 3] = s.tx;
      pos[pIdx + 4] = s.ty;
      pos[pIdx + 5] = s.tz;

      const cIdx = i * 8;
      col[cIdx] = br6;
      col[cIdx + 1] = bg6;
      col[cIdx + 2] = bb6;
      col[cIdx + 3] = alpha * 0.18;
      col[cIdx + 4] = brHi;
      col[cIdx + 5] = bgHi;
      col[cIdx + 6] = bbHi;
      col[cIdx + 7] = alpha * 0.92;
    }

    this.geometry.setDrawRange(0, (this.count - 1) * 6);
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
  }

  dispose() {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.geometry.dispose();
      this.material.dispose();
      this.mesh = null;
    }
  }
}

export class VFXSystem {
  constructor(scene, { isMobile = false } = {}) {
    this.scene = scene;
    this.isMobile = isMobile;
    this.ribbons = [];

    this._tmpObj = new THREE.Object3D();

    this._initRainSystem();
    this._initSparkPool();
    this._initBloodAndInkInstancedPools();
    this._initShockwavePool();
    this._initAfterimagePool();
    this._initLightningPool();
  }

  createSwordRibbon(colorHex = 0xa8ecff) {
    const r = new SwordRibbon(this.scene, this.isMobile ? 20 : 26, colorHex);
    this.ribbons.push(r);
    return r;
  }

  _initRainSystem() {
    this.maxRainCount = this.isMobile ? 850 : 1600;
    this.activeRainCount = this.maxRainCount;
    const positions = new Float32Array(this.maxRainCount * 2 * 3);
    this.rainPosArr = positions;
    this.rainSeeds = new Float32Array(this.maxRainCount * 4);
    for (let i = 0; i < this.maxRainCount; i++) {
      this.rainSeeds[i * 4] = (Math.random() - 0.5) * 44;
      this.rainSeeds[i * 4 + 1] = Math.random() * 20;
      this.rainSeeds[i * 4 + 2] = (Math.random() - 0.5) * 62 - 4;
      this.rainSeeds[i * 4 + 3] = 19 + Math.random() * 9;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setDrawRange(0, this.activeRainCount * 2);
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

  setRainDensity(ratio) {
    this.activeRainCount = Math.max(250, Math.min(this.maxRainCount, Math.floor(this.maxRainCount * ratio)));
    this.rainLines.geometry.setDrawRange(0, this.activeRainCount * 2);
  }

  _initSparkPool() {
    this.maxSparks = this.isMobile ? 120 : 200;
    this.sparkPool = Array.from({ length: this.maxSparks }, () => ({
      active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0,
    }));
    this.sparkCursor = 0;
    this.activeSparkCount = 0;

    const pos = new Float32Array(this.maxSparks * 2 * 3);
    this.sparkPosArr = pos;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setDrawRange(0, 0);
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

  _initBloodAndInkInstancedPools() {
    this.sharedSphereGeo = new THREE.SphereGeometry(0.065, 5, 5);
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

    this.maxBlood = this.isMobile ? 56 : 100;
    this.maxInk = this.isMobile ? 36 : 64;

    this.bloodMesh = new THREE.InstancedMesh(this.sharedSphereGeo, this.bloodMat, this.maxBlood);
    this.bloodMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.bloodMesh.frustumCulled = false;
    this.bloodMesh.count = 0;
    this.scene.add(this.bloodMesh);

    this.inkMesh = new THREE.InstancedMesh(this.sharedSphereGeo, this.inkMat, this.maxInk);
    this.inkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.inkMesh.frustumCulled = false;
    this.inkMesh.count = 0;
    this.scene.add(this.inkMesh);

    this.bloodParticles = Array.from({ length: this.maxBlood }, () => ({
      active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, scale: 1, life: 0,
    }));
    this.inkParticles = Array.from({ length: this.maxInk }, () => ({
      active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, scale: 1, life: 0,
    }));
    this.bloodCursor = 0;
    this.inkCursor = 0;
  }

  _initShockwavePool() {
    this.sharedRingGeo = new THREE.RingGeometry(0.42, 0.49, 28);
    this.shockwavePool = [];
    for (let i = 0; i < 12; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xff3b3b,
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.sharedRingGeo, mat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.shockwavePool.push({ active: false, mesh, mat, age: 0, duration: 0.38, maxRadius: 4.0 });
    }
    this.shockwaveCursor = 0;
  }

  _initAfterimagePool() {
    this.sharedGhostBodyGeo = new THREE.CylinderGeometry(0.22, 0.38, 1.55, 8);
    this.sharedGhostHatGeo = new THREE.ConeGeometry(0.46, 0.2, 10);
    this.afterimagePool = [];
    for (let i = 0; i < 8; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x5ce6dc,
        transparent: true,
        opacity: 0.36,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const group = new THREE.Group();
      const body = new THREE.Mesh(this.sharedGhostBodyGeo, mat);
      body.position.y = 0.85;
      const hat = new THREE.Mesh(this.sharedGhostHatGeo, mat);
      hat.position.y = 1.72;
      group.add(body, hat);
      group.visible = false;
      this.scene.add(group);
      this.afterimagePool.push({ active: false, group, mat, life: 0 });
    }
    this.afterimageCursor = 0;
  }

  _initLightningPool() {
    this.lightningPool = [];
    for (let i = 0; i < 4; i++) {
      const arr = new Float32Array(13 * 3);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      const mat = new THREE.LineBasicMaterial({
        color: 0xff2b37,
        transparent: true,
        opacity: 1.0,
        blending: THREE.AdditiveBlending,
      });
      const line = new THREE.Line(geo, mat);
      line.frustumCulled = false;
      line.visible = false;
      this.scene.add(line);
      this.lightningPool.push({ active: false, line, geo, arr, mat, life: 0 });
    }
    this.lightningCursor = 0;
  }

  spawnSparks(origin, count = 42, colorHex = 0xffcf6e, speedScale = 1.0) {
    this.sparkLines.material.color.setHex(colorHex);
    const n = this.isMobile ? Math.ceil(count * 0.55) : count;
    for (let i = 0; i < n; i++) {
      const s = this.sparkPool[this.sparkCursor];
      this.sparkCursor = (this.sparkCursor + 1) % this.maxSparks;
      const theta = Math.random() * Math.PI * 2;
      const phi = (Math.random() - 0.25) * Math.PI * 0.85;
      const spd = (5.5 + Math.random() * 13.5) * speedScale;
      const cosPhi = Math.cos(phi);
      s.active = true;
      s.x = origin.x; s.y = origin.y; s.z = origin.z;
      s.vx = Math.cos(theta) * cosPhi * spd;
      s.vy = Math.abs(Math.sin(phi)) * spd + 2.2;
      s.vz = Math.sin(theta) * cosPhi * spd;
      s.life = 0.22 + Math.random() * 0.28;
    }
  }

  spawnBloodAndInk(origin, dir, count = 20) {
    const n = this.isMobile ? Math.ceil(count * 0.55) : count;
    const dx = dir ? dir.x : 0;
    const dy = dir ? dir.y : 0;
    const dz = dir ? dir.z : 0;
    for (let i = 0; i < n; i++) {
      const isInk = i % 3 === 0;
      const pool = isInk ? this.inkParticles : this.bloodParticles;
      const cap = isInk ? this.maxInk : this.maxBlood;
      const idx = isInk ? (this.inkCursor = (this.inkCursor + 1) % cap) : (this.bloodCursor = (this.bloodCursor + 1) % cap);
      const p = pool[idx];
      const boost = dir ? (3.5 + Math.random() * 4.0) : 0;
      p.active = true;
      p.x = origin.x; p.y = origin.y; p.z = origin.z;
      p.vx = (Math.random() - 0.5) * 5.5 + dx * boost;
      p.vy = 1.5 + Math.random() * 4.2 + dy * boost;
      p.vz = (Math.random() - 0.5) * 5.5 + dz * boost;
      p.scale = isInk ? 1.4 + Math.random() * 1.8 : 0.7 + Math.random() * 1.3;
      p.life = 0.35 + Math.random() * 0.3;
    }
  }

  spawnShockwave(pos, { color = 0xff3b3b, maxRadius = 4.2, duration = 0.38, vertical = false } = {}) {
    const sw = this.shockwavePool[this.shockwaveCursor];
    this.shockwaveCursor = (this.shockwaveCursor + 1) % this.shockwavePool.length;
    sw.active = true;
    sw.age = 0;
    sw.duration = duration;
    sw.maxRadius = maxRadius;
    sw.mat.color.setHex(color);
    sw.mat.opacity = 0.75;
    sw.mesh.position.copy(pos);
    sw.mesh.scale.setScalar(0.4);
    sw.mesh.rotation.set(0, 0, 0);
    if (!vertical) {
      sw.mesh.rotation.x = -Math.PI * 0.5;
      sw.mesh.position.y += 0.08;
    } else {
      sw.mesh.lookAt(pos.x, pos.y + 0.2, pos.z + 1);
    }
    sw.mesh.visible = true;
  }

  spawnTelegraphFlash(pos, isUnblockableRed = false) {
    const color = isUnblockableRed ? 0xff1e27 : 0xffe28a;
    this.spawnSparks(pos, isUnblockableRed ? 16 : 9, color, 0.65);
    this.spawnShockwave(pos, { color, maxRadius: isUnblockableRed ? 1.15 : 0.75, duration: 0.22, vertical: true });
  }

  spawnDashAfterimage(sourceGroup, tintHex = 0x5ce6dc) {
    const ai = this.afterimagePool[this.afterimageCursor];
    this.afterimageCursor = (this.afterimageCursor + 1) % this.afterimagePool.length;
    ai.active = true;
    ai.life = 0.32;
    ai.mat.color.setHex(tintHex);
    ai.mat.opacity = 0.36;
    ai.group.position.copy(sourceGroup.position);
    ai.group.rotation.copy(sourceGroup.rotation);
    ai.group.scale.copy(sourceGroup.scale);
    ai.group.visible = true;
  }

  spawnCrimsonLightning(targetPos, colorHex = 0xff2b37) {
    const lb = this.lightningPool[this.lightningCursor];
    this.lightningCursor = (this.lightningCursor + 1) % this.lightningPool.length;
    const segs = 12;
    const topY = targetPos.y + 15.0;
    const arr = lb.arr;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const jitter = (i === 0 || i === segs) ? 0 : (Math.random() - 0.5) * 1.4;
      arr[i * 3] = targetPos.x + jitter;
      arr[i * 3 + 1] = topY * (1 - t) + targetPos.y * t;
      arr[i * 3 + 2] = targetPos.z + jitter * 0.8;
    }
    lb.geo.attributes.position.needsUpdate = true;
    lb.mat.color.setHex(colorHex);
    lb.mat.opacity = 1.0;
    lb.life = 0.26;
    lb.active = true;
    lb.line.visible = true;
    this.spawnShockwave(targetPos, { color: colorHex, maxRadius: 5.8, duration: 0.45 });
  }

  _updateInstancedPool(particles, instancedMesh, dt) {
    let activeCount = 0;
    const dummy = this._tmpObj;
    const scaleDecay = Math.pow(0.05, dt * 1.8); // framerate-independent shrink
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      if (!p.active) continue;
      p.life -= dt;
      p.vy -= 18.0 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.scale *= scaleDecay;
      if (p.life <= 0 || p.y < 0 || p.scale < 0.04) {
        p.active = false;
        continue;
      }
      dummy.position.set(p.x, p.y, p.z);
      dummy.scale.setScalar(p.scale);
      dummy.updateMatrix();
      instancedMesh.setMatrixAt(activeCount++, dummy.matrix);
    }
    instancedMesh.count = activeCount;
    if (activeCount > 0) {
      instancedMesh.instanceMatrix.needsUpdate = true;
    }
  }

  update(dt, focusCenter) {
    // 1. Update sword ribbons
    for (let i = 0; i < this.ribbons.length; i++) {
      this.ribbons[i].update(dt);
    }

    // 2. Update storm rain (direct Float32Array write — 3x faster than setXYZ)
    const rArr = this.rainPosArr;
    const seeds = this.rainSeeds;
    const cx = focusCenter ? focusCenter.x : 0;
    const cz = focusCenter ? focusCenter.z : 0;
    const driftX = 2.8 * dt;
    const rainCount = this.activeRainCount;

    for (let i = 0; i < rainCount; i++) {
      const si = i * 4;
      let x = seeds[si] - driftX;
      let y = seeds[si + 1] - seeds[si + 3] * dt;
      let z = seeds[si + 2];

      if (y < 0) {
        y = 18 + Math.random() * 4;
        x = cx + (Math.random() - 0.5) * 42;
        z = cz + (Math.random() - 0.5) * 46;
      }
      seeds[si] = x;
      seeds[si + 1] = y;
      seeds[si + 2] = z;

      const pi = i * 6;
      const underHallRoof = z < -13.6 && z > -29.4 && x > -10.6 && x < 10.6;
      if (underHallRoof && y < 8.5 && !(x > -3.1 && x < 3.1 && z < -17.5 && z > -23.5)) {
        rArr[pi] = 0; rArr[pi + 1] = -50; rArr[pi + 2] = 0;
        rArr[pi + 3] = 0; rArr[pi + 4] = -50; rArr[pi + 5] = 0;
      } else {
        rArr[pi] = x; rArr[pi + 1] = y; rArr[pi + 2] = z;
        rArr[pi + 3] = x + 0.09; rArr[pi + 4] = y + 0.62; rArr[pi + 5] = z;
      }
    }
    this.rainLines.geometry.attributes.position.needsUpdate = true;

    // 3. Update metallic sparks (direct Float32Array write + drawRange culling)
    const sArr = this.sparkPosArr;
    let sparkCount = 0;
    for (let i = 0; i < this.maxSparks; i++) {
      const s = this.sparkPool[i];
      if (!s.active) continue;
      s.life -= dt;
      if (s.life <= 0) {
        s.active = false;
        continue;
      }
      s.vy -= 24.0 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      if (s.y < 0.05) {
        s.y = 0.05;
        s.vy *= -0.45;
        s.vx *= 0.7;
        s.vz *= 0.7;
      }
      const pi = sparkCount * 6;
      sArr[pi] = s.x; sArr[pi + 1] = s.y; sArr[pi + 2] = s.z;
      sArr[pi + 3] = s.x - s.vx * 0.026;
      sArr[pi + 4] = s.y - s.vy * 0.026;
      sArr[pi + 5] = s.z - s.vz * 0.026;
      sparkCount++;
    }
    this.sparkLines.geometry.setDrawRange(0, sparkCount * 2);
    if (sparkCount > 0 || this.activeSparkCount > 0) {
      this.sparkLines.geometry.attributes.position.needsUpdate = true;
    }
    this.activeSparkCount = sparkCount;

    // 4. Update instanced blood & ink droplets (2 draw calls total!)
    this._updateInstancedPool(this.bloodParticles, this.bloodMesh, dt);
    this._updateInstancedPool(this.inkParticles, this.inkMesh, dt);

    // 5. Update pooled shockwaves
    for (let i = 0; i < this.shockwavePool.length; i++) {
      const sw = this.shockwavePool[i];
      if (!sw.active) continue;
      sw.age += dt;
      const u = Math.min(1, sw.age / sw.duration);
      const sc = 0.4 + sw.maxRadius * (1 - Math.pow(1 - u, 3));
      sw.mesh.scale.setScalar(sc);
      sw.mat.opacity = (1 - u) * 0.9;
      if (u >= 1) {
        sw.active = false;
        sw.mesh.visible = false;
      }
    }

    // 6. Update pooled ghost afterimages
    for (let i = 0; i < this.afterimagePool.length; i++) {
      const ai = this.afterimagePool[i];
      if (!ai.active) continue;
      ai.life -= dt;
      ai.mat.opacity = Math.max(0, (ai.life / 0.32) * 0.36);
      if (ai.life <= 0) {
        ai.active = false;
        ai.group.visible = false;
      }
    }

    // 7. Update pooled lightning bolts
    for (let i = 0; i < this.lightningPool.length; i++) {
      const lb = this.lightningPool[i];
      if (!lb.active) continue;
      lb.life -= dt;
      lb.mat.opacity = Math.max(0, lb.life / 0.26);
      if (lb.life <= 0) {
        lb.active = false;
        lb.line.visible = false;
      }
    }
  }
}
