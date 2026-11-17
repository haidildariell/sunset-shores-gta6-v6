// Sunset Shores — vehicles: car meshes, city traffic AI and police pursuit.
// Cars are low-poly boxes with cabins, wheels and lights; traffic follows the
// road grid and turns at intersections, police chase the player when wanted.
import * as THREE from 'three';
import { WORLD, clamp, dist2d, range } from './config.js';

export function makeCarMesh(color, opts = {}) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x1a2028 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.3), bodyMat);
  body.position.y = 0.55; body.castShadow = true;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.6, 2.1), darkMat);
  cabin.position.set(0, 1.12, -0.25); cabin.castShadow = true;
  g.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
  const wheels = [];
  for (const [x, z] of [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.36, z);
    g.add(w); wheels.push(w);
  }
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const x of [-0.6, 0.6]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.08), lightMat);
    h.position.set(x, 0.62, 2.16);
    g.add(h);
  }
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xd21f1f });
  for (const x of [-0.6, 0.6]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.08), tailMat);
    t.position.set(x, 0.62, -2.16);
    g.add(t);
  }
  if (opts.police) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.22, 0.5), new THREE.MeshBasicMaterial({ color: 0x2244ff }));
    bar.position.set(0, 1.52, -0.25);
    g.add(bar);
    const bar2 = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.24, 0.52), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    bar2.position.set(-0.62, 1.52, -0.25);
    g.add(bar2);
    const decal = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.3, 1.6), new THREE.MeshBasicMaterial({ color: 0xf2f2f2 }));
    decal.position.set(0, 0.62, 0.4);
    g.add(decal);
  }
  g.userData.wheels = wheels;
  return g;
}

// A drivable car: arcade physics (accel, brake, steering, building push-out).
export class DriveCar {
  constructor(mesh, x, z, angle) {
    this.mesh = mesh;
    this.x = x; this.z = z; this.angle = angle;
    this.speed = 0;
    this.health = 100;
    this.maxSpeed = 34;
  }
  update(dt, input, colliders) {
    const accel = input.forward ? 16 : 0;
    const brake = input.back ? 26 : 0;
    if (input.forward) this.speed += accel * dt;
    if (input.back) this.speed -= (this.speed > 0.5 ? brake : 10) * dt;
    if (!input.forward && !input.back) this.speed -= Math.sign(this.speed) * 8 * dt;
    if (Math.abs(this.speed) < 0.15 && !input.forward && !input.back) this.speed = 0;
    this.speed = clamp(this.speed, -10, this.maxSpeed);
    const steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    const spd = clamp(Math.abs(this.speed) / 12, 0, 1);
    this.angle += steer * 1.9 * spd * Math.sign(this.speed || 1) * dt;
    const nx = this.x + Math.sin(this.angle) * this.speed * dt;
    const nz = this.z + Math.cos(this.angle) * this.speed * dt;
    let px = nx, pz = nz;
    for (const b of colliders) {
      const hit = collide(px, pz, 1.6, b);
      if (hit) {
        px = hit.x; pz = hit.z;
        if (Math.abs(this.speed) > 6) this.health -= Math.abs(this.speed) * 0.4;
        this.speed *= 0.35;
      }
    }
    this.x = clamp(px, -WORLD.halfCity, WORLD.oceanX - 6);
    this.z = clamp(pz, -WORLD.halfCity, WORLD.halfCity);
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.angle;
    const spin = this.speed * dt * 2.8;
    for (const w of this.mesh.userData.wheels) w.rotation.x += spin;
  }
}

function collide(x, z, r, box) {
  const cx = clamp(x, box.minX, box.maxX);
  const cz = clamp(z, box.minZ, box.maxZ);
  const dx = x - cx, dz = z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return null;
  if (d2 > 0.0001) {
    const d = Math.sqrt(d2);
    return { x: cx + (dx / d) * r, z: cz + (dz / d) * r };
  }
  return { x, z };
}

// ---- traffic ----------------------------------------------------------------
export class Traffic {
  constructor(scene, count = 14) {
    this.scene = scene;
    this.cars = [];
    const colors = [0xd8402e, 0x2e6fd8, 0xf2b705, 0x2ed8a0, 0xf2f2f2, 0x8e44ad, 0xff7f2e, 0x9fc3d8];
    for (let i = 0; i < count; i++) {
      const mesh = makeCarMesh(colors[i % colors.length]);
      scene.add(mesh);
      const axis = Math.random() < 0.5 ? 'x' : 'z';
      this.cars.push({
        mesh, axis,
        coord: WORLD.roads[Math.floor(Math.random() * WORLD.roads.length)],
        along: range(Math.random, -160, 160),
        dir: Math.random() < 0.5 ? 1 : -1,
        speed: range(Math.random, 7, 12),
        baseSpeed: 0, kind: 'traffic',
      });
      this.cars[i].baseSpeed = this.cars[i].speed;
    }
  }
  update(dt, playerCar) {
    for (const c of this.cars) {
      // Position from last frame's lane state (set below on the first pass).
      if (c.axis === 'x') { c.x = c.along; c.z = c.coord; }
      else { c.x = c.coord; c.z = c.along; }
      // Slow down for the car ahead on the same lane.
      let target = c.baseSpeed;
      for (const o of this.cars) {
        if (o === c || o.axis !== c.axis || Math.abs(o.coord - c.coord) > 1) continue;
        const gap = (o.along - c.along) * c.dir;
        if (gap > 0 && gap < 9) { target = Math.min(target, o.speed * 0.6); break; }
      }
      if (playerCar) {
        const d = dist2d(c.x, c.z, playerCar.x, playerCar.z);
        if (d < 8) target = Math.min(target, 3);
      }
      c.speed += (target - c.speed) * Math.min(1, dt * 2);
      c.along += c.speed * c.dir * dt;
      // Turn at intersections, or U-turn at the city edge.
      const nearLine = WORLD.roads.find((r) => Math.abs(c.along - r) < c.speed * dt + 0.4);
      if (nearLine !== undefined && Math.random() < 0.35) {
        const oldAlong = c.along;
        c.axis = c.axis === 'x' ? 'z' : 'x';
        c.coord = nearLine;
        c.along = c.axis === 'x' ? c.z : c.x;
        if (Math.abs(c.along - oldAlong) > 200) c.along = oldAlong; // sanity
        c.dir = Math.random() < 0.5 ? 1 : -1;
      }
      if (c.along > 168) { c.along = 168; c.dir = -1; }
      if (c.along < -168) { c.along = -168; c.dir = 1; }
      if (c.axis === 'x') { c.x = c.along; c.z = c.coord; }
      else { c.x = c.coord; c.z = c.along; }
      c.mesh.position.set(c.x, 0, c.z);
      const targetAngle = c.axis === 'x' ? (c.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (c.dir > 0 ? 0 : Math.PI);
      let da = targetAngle - c.mesh.rotation.y;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      c.mesh.rotation.y += da * Math.min(1, dt * 3);
      const spin = c.speed * dt * 2.8;
      for (const w of c.mesh.userData.wheels) w.rotation.x += spin;
    }
  }
  // Remove a car from traffic (stolen) and return its record.
  stealNearest(x, z, maxDist = 4.5) {
    let best = null, bd = maxDist;
    for (const c of this.cars) {
      const d = dist2d(x, z, c.x ?? 0, c.z ?? 0);
      if (d < bd) { bd = d; best = c; }
    }
    if (!best) return null;
    this.cars.splice(this.cars.indexOf(best), 1);
    return best;
  }
  addCar(mesh, x, z, angle) {
    const c = { mesh, axis: 'x', coord: z, along: x, dir: 1, speed: 0, baseSpeed: 9, kind: 'traffic' };
    c.x = x; c.z = z;
    this.cars.push(c);
    return c;
  }
}

// ---- police -------------------------------------------------------------------
export class Police {
  constructor(scene) {
    this.scene = scene;
    this.units = [];
    this.flashT = 0;
  }
  get count() { return this.units.length; }
  ensure(n) {
    while (this.units.length < n) {
      const mesh = makeCarMesh(0x1a1a22, { police: true });
      this.scene.add(mesh);
      const edge = WORLD.roads[Math.floor(Math.random() * WORLD.roads.length)];
      const unit = { mesh, x: edge, z: Math.random() < 0.5 ? -165 : 165, angle: 0, speed: 0, off: ((this.units.length % 3) - 1) * 4 };
      this.units.push(unit);
    }
    while (this.units.length > n) {
      const u = this.units.pop();
      this.scene.remove(u.mesh);
    }
  }
  update(dt, tx, tz, playerSpeed) {
    this.flashT += dt;
    for (const u of this.units) {
      // Chase a point offset sideways per unit, so the pack fans out
      // instead of piling onto one spot.
      const dx0 = tx - u.x, dz0 = tz - u.z;
      const d0 = Math.hypot(dx0, dz0) || 1;
      const want0 = Math.atan2(dx0, dz0);
      const px = tx + Math.cos(want0) * (u.off || 0);
      const pz = tz - Math.sin(want0) * (u.off || 0);
      const dx = px - u.x, dz = pz - u.z;
      const d = Math.hypot(dx, dz) || 1;
      const want = Math.atan2(dx, dz);
      let da = want - u.angle;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      u.angle += clamp(da, -2.2 * dt, 2.2 * dt);
      const targetSpeed = d > 12 ? 30 : 20;
      u.speed += (targetSpeed - u.speed) * Math.min(1, dt * 1.2);
      u.x += Math.sin(u.angle) * u.speed * dt;
      u.z += Math.cos(u.angle) * u.speed * dt;
      u.mesh.position.set(u.x, 0, u.z);
      u.mesh.rotation.y = u.angle;
      const spin = u.speed * dt * 2.8;
      for (const w of u.mesh.userData.wheels) w.rotation.x += spin;
      // Flashing light bar.
      const bar = u.mesh.children.find((c) => c.geometry && c.geometry.parameters && c.geometry.parameters.width === 1.2);
      if (bar) bar.material.color.setHex(Math.floor(this.flashT * 3) % 2 === 0 ? 0xff2222 : 0x2244ff);
    }
  }
}
