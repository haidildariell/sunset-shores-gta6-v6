// Sunset Shores — people: the player character, pedestrians and mission
// rivals. Low-poly figures with swinging limbs; pedestrians wander the
// sidewalks and flee from danger, rivals stand and fight.
import * as THREE from 'three';
import { WORLD, PALETTE, clamp, dist2d, pick, range } from './config.js';

export function makePersonMesh(shirtColor, pantsColor = 0x2a2a33, skin = 0xc98d64) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: shirtColor });
  const pants = new THREE.MeshLambertMaterial({ color: pantsColor });
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), shirt);
  torso.position.y = 1.18; torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), skinMat);
  head.position.y = 1.78; head.castShadow = true;
  g.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), new THREE.MeshLambertMaterial({ color: 0x1c1c22 }));
  hair.position.y = 1.82;
  g.add(hair);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.78, 0.26), pants);
  legL.geometry.translate(0, -0.39, 0);
  legL.position.set(-0.16, 0.82, 0);
  g.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.16;
  g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.68, 0.22), shirt);
  armL.geometry.translate(0, -0.34, 0);
  armL.position.set(-0.42, 1.5, 0);
  g.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.42;
  g.add(armR);
  g.userData = { legL, legR, armL, armR, walkPhase: Math.random() * 6 };
  return g;
}

export function animateWalk(mesh, speed01, dt) {
  const u = mesh.userData;
  u.walkPhase += dt * (4 + speed01 * 8);
  const s = Math.sin(u.walkPhase) * (0.25 + speed01 * 0.55);
  u.legL.rotation.x = s;
  u.legR.rotation.x = -s;
  u.armL.rotation.x = -s * 0.8;
  u.armR.rotation.x = s * 0.8;
}

export class Pedestrians {
  constructor(scene, spawns, count = 18) {
    this.scene = scene;
    this.list = [];
    for (let i = 0; i < count; i++) {
      const s = spawns[i % spawns.length];
      const mesh = makePersonMesh(pick(Math.random, PALETTE.shirt));
      mesh.position.set(s.x + range(Math.random, -4, 4), 0, s.z + range(Math.random, -4, 4));
      scene.add(mesh);
      this.list.push({
        mesh, x: mesh.position.x, z: mesh.position.z,
        tx: mesh.position.x, tz: mesh.position.z,
        speed: range(Math.random, 1.2, 2.2), fleeing: false, health: 100,
      });
    }
  }
  _newTarget(p) {
    const road = WORLD.roads[Math.floor(Math.random() * WORLD.roads.length)];
    const side = Math.random() < 0.5 ? 6.5 : -6.5;
    if (Math.random() < 0.5) { p.tx = road + side; p.tz = range(Math.random, -165, 165); }
    else { p.tx = range(Math.random, -165, 165); p.tz = road + side; }
  }
  update(dt, playerPos, danger) {
    for (const p of this.list) {
      if (p.health <= 0) continue;
      const dPlayer = playerPos ? dist2d(p.x, p.z, playerPos.x, playerPos.z) : 999;
      if (danger && dPlayer < 14) {
        // Flee away from the player.
        const a = Math.atan2(p.x - playerPos.x, p.z - playerPos.z);
        p.tx = p.x + Math.sin(a) * 30;
        p.tz = p.z + Math.cos(a) * 30;
        p.fleeing = true;
      } else if (p.fleeing && dPlayer > 26) {
        p.fleeing = false;
        this._newTarget(p);
      }
      const dx = p.tx - p.x, dz = p.tz - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.5) { this._newTarget(p); continue; }
      const sp = p.speed * (p.fleeing ? 2.4 : 1);
      p.x += (dx / d) * sp * dt;
      p.z += (dz / d) * sp * dt;
      p.mesh.position.set(p.x, 0, p.z);
      p.mesh.rotation.y = Math.atan2(dx, dz);
      animateWalk(p.mesh, p.fleeing ? 1 : 0.4, dt);
    }
  }
  // Nearest living pedestrian within range (for punch / shooting).
  nearest(x, z, maxDist) {
    let best = null, bd = maxDist;
    for (const p of this.list) {
      if (p.health <= 0) continue;
      const d = dist2d(x, z, p.x, p.z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
}

// Rivals: armed gang members used by combat missions. They hold ground and
// shoot at the player with limited accuracy.
export class Rivals {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
  }
  spawn(x, z, n) {
    for (let i = 0; i < n; i++) {
      const mesh = makePersonMesh(0x8e1f2e, 0x1c1c22, 0xb07a52);
      mesh.position.set(x + range(Math.random, -6, 6), 0, z + range(Math.random, -6, 6));
      this.scene.add(mesh);
      this.list.push({ mesh, x: mesh.position.x, z: mesh.position.z, health: 50, shootT: range(Math.random, 0.5, 2) });
    }
  }
  clear() {
    for (const r of this.list) this.scene.remove(r.mesh);
    this.list = [];
  }
  get alive() { return this.list.filter((r) => r.health > 0).length; }
  update(dt, playerPos, onShoot) {
    for (const r of this.list) {
      if (r.health <= 0) continue;
      const d = dist2d(r.x, r.z, playerPos.x, playerPos.z);
      r.mesh.rotation.y = Math.atan2(playerPos.x - r.x, playerPos.z - r.z);
      r.shootT -= dt;
      if (r.shootT <= 0 && d < 45) {
        r.shootT = range(Math.random, 1.1, 2.2);
        onShoot(r, d);
      }
      animateWalk(r.mesh, 0, dt);
    }
  }
}
