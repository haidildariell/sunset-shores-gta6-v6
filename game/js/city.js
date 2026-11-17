// Sunset Shores — city builder for Palmera Bay.
// A deterministic grid city: asphalt roads, pastel towers, palm-lined
// sidewalks, a sand strip and ocean on the east edge, all generated from
// one seeded RNG so every load (and every screenshot) shows the same city.
import * as THREE from 'three';
import { WORLD, PALETTE, mulberry32, range, pick } from './config.js';

function canvasTexture(w, h, draw, rx = 1, ry = 1) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(rx, ry);
  tex.anisotropy = 4;
  return tex;
}

// Asphalt with a dashed centre line, tiled along the road length.
// Canvas x runs along the road (u), canvas y across it (v).
function roadTexture() {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#33333d'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#3d3d48';
    for (let i = 0; i < 400; i++) g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    g.fillStyle = '#d8d8c8'; g.fillRect(8, h / 2 - 3, 44, 6);
    g.fillStyle = '#8a8a7a'; g.fillRect(0, 4, w, 3); g.fillRect(0, h - 7, w, 3);
  }, 24, 1);
}

// Lit-window grid; tinted per building by the material colour.
function windowTexture() {
  return canvasTexture(128, 256, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    for (let y = 10; y < h - 10; y += 22) {
      for (let x = 10; x < w - 10; x += 18) {
        const lit = Math.random() < 0.45;
        g.fillStyle = lit ? '#ffd98a' : '#2c3550';
        g.fillRect(x, y, 11, 14);
      }
    }
  });
}

export function buildCity(scene) {
  const rng = mulberry32(20261118);
  const colliders = [];
  const parkedSpots = [];
  const pedSpawns = [];
  const group = new THREE.Group();
  group.name = 'city';

  // ---- lights & sky -------------------------------------------------------
  const hemi = new THREE.HemisphereLight(0xffd9a0, 0x4a6b8a, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffc27a, 1.6);
  sun.position.set(-140, 190, -90);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -220; sun.shadow.camera.right = 220;
  sun.shadow.camera.top = 220; sun.shadow.camera.bottom = -220;
  sun.shadow.camera.far = 600;
  scene.add(sun);
  scene.fog = new THREE.Fog(0xff9e66, 150, 520);

  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(26, 32),
    new THREE.MeshBasicMaterial({ color: 0xffe9a8, fog: false }),
  );
  sunDisc.position.set(-260, 120, -330);
  sunDisc.lookAt(0, 40, 0);
  scene.add(sunDisc);

  // ---- ground, sand, ocean ----------------------------------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(700, 700),
    new THREE.MeshLambertMaterial({ color: PALETTE.ground }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.05, 0);
  ground.receiveShadow = true;
  scene.add(ground);

  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 700),
    new THREE.MeshLambertMaterial({ color: PALETTE.sand }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(WORLD.beachX + 12, 0.02, 0);
  sand.receiveShadow = true;
  scene.add(sand);

  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(300, 700),
    new THREE.MeshLambertMaterial({ color: PALETTE.ocean }),
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(WORLD.oceanX + 150, 0.0, 0);
  scene.add(ocean);

  // Boardwalk strip between city and sand.
  const boardwalk = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 700),
    new THREE.MeshLambertMaterial({ color: 0xb08a5a }),
  );
  boardwalk.rotation.x = -Math.PI / 2;
  boardwalk.position.set(WORLD.beachX - 2, 0.06, 0);
  boardwalk.receiveShadow = true;
  scene.add(boardwalk);

  // ---- roads --------------------------------------------------------------
  const roadTex = roadTexture();
  const roadMat = new THREE.MeshLambertMaterial({ map: roadTex });
  const sideMat = new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk });
  const span = 360;
  for (const r of WORLD.roads) {
    for (const horizontal of [true, false]) {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(span, WORLD.roadWidth), roadMat);
      road.rotation.x = -Math.PI / 2;
      if (!horizontal) road.rotation.z = Math.PI / 2;
      road.position.set(horizontal ? 0 : r, 0.1, horizontal ? r : 0);
      road.receiveShadow = true;
      scene.add(road);
      const walk = new THREE.Mesh(new THREE.PlaneGeometry(span, WORLD.roadWidth + 5), sideMat);
      walk.rotation.x = -Math.PI / 2;
      if (!horizontal) walk.rotation.z = Math.PI / 2;
      walk.position.set(horizontal ? 0 : r, 0.05, horizontal ? r : 0);
      walk.receiveShadow = true;
      scene.add(walk);
    }
  }

  // ---- buildings ----------------------------------------------------------
  const winTex = windowTexture();
  const buildMats = PALETTE.building.map((c) => new THREE.MeshLambertMaterial({ color: c, map: winTex }));
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x5a5a62 });
  const neonMat = new THREE.MeshBasicMaterial({ color: 0xff4fd8 });
  const neonMat2 = new THREE.MeshBasicMaterial({ color: 0x39d5ff });
  const blockMin = -160, blockMax = 160;
  for (let bx = blockMin; bx < blockMax; bx += 40) {
    for (let bz = blockMin; bz < blockMax; bz += 40) {
      const n = 1 + Math.floor(rng() * 3);
      for (let i = 0; i < n; i++) {
        const w = range(rng, 12, 22), d = range(rng, 12, 22);
        const h = range(rng, 9, 46);
        // Keep the whole footprint inside the block, clear of the road
        // (road edge at 4.5) and the sidewalk palms (at 6.0).
        const cx = bx + w / 2 + 6.5 + rng() * Math.max(1, 27 - w);
        const cz = bz + d / 2 + 6.5 + rng() * Math.max(1, 27 - d);
        const mat = pick(rng, buildMats);
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        mesh.position.set(cx, h / 2, cz);
        mesh.castShadow = true; mesh.receiveShadow = true;
        mesh.material = mat.clone();
        mesh.material.map = winTex.clone();
        mesh.material.map.repeat.set(Math.max(1, Math.round(w / 10)), Math.max(1, Math.round(h / 12)));
        mesh.material.map.needsUpdate = true;
        group.add(mesh);
        // Rooftop unit.
        const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.3, 1.6, d * 0.3), roofMat);
        roof.position.set(cx + w * 0.2, h + 0.8, cz);
        group.add(roof);
        // Neon sign on some towers.
        if (rng() < 0.3) {
          const sign = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 1.1, 0.4), rng() < 0.5 ? neonMat : neonMat2);
          sign.position.set(cx, h * 0.82, cz + d / 2 + 0.3);
          group.add(sign);
        }
        colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, h });
      }
    }
  }

  // ---- palms --------------------------------------------------------------
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5230 });
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x2f9e5f, side: THREE.DoubleSide });
  function palm(x, z, s = 1) {
    const p = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * s, 0.34 * s, 5.4 * s, 6), trunkMat);
    trunk.position.y = 2.7 * s; trunk.castShadow = true;
    p.add(trunk);
    for (let i = 0; i < 6; i++) {
      const frond = new THREE.Mesh(new THREE.ConeGeometry(0.7 * s, 2.6 * s, 4), frondMat);
      const a = (i / 6) * Math.PI * 2;
      frond.position.set(Math.cos(a) * 0.95 * s, 5.1 * s, Math.sin(a) * 0.95 * s);
      frond.rotation.z = Math.cos(a) * 1.1;
      frond.rotation.x = -Math.sin(a) * 1.1;
      p.add(frond);
    }
    const nut = new THREE.Mesh(new THREE.SphereGeometry(0.32 * s, 8, 6), new THREE.MeshLambertMaterial({ color: 0x6b4a1f }));
    nut.position.y = 4.9 * s;
    p.add(nut);
    p.position.set(x, 0, z);
    return p;
  }
  for (const r of WORLD.roads) {
    for (let t = -160; t <= 160; t += 40) {
      // Mid-block along the road: never on a crossing road's centre line.
      const along = t + 20 + range(rng, -6, 6);
      if (rng() < 0.75) group.add(palm(r + 6, along, range(rng, 0.85, 1.25)));
      if (rng() < 0.75) group.add(palm(along, r + 6, range(rng, 0.85, 1.25)));
    }
  }
  // Beach palms row.
  for (let z = -160; z <= 160; z += 26) group.add(palm(WORLD.beachX + 6, z + range(rng, -6, 6), 1.3));

  // ---- streetlights ---------------------------------------------------------
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2a2a30 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (const r of WORLD.roads) {
    for (const s of [-160, -80, 0, 80, 160]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 6, 6), poleMat);
      pole.position.set(r + 5.6, 3, s + 5.6);
      group.add(pole);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), lampMat);
      lamp.position.set(r + 5.6, 6.2, s + 5.6);
      group.add(lamp);
    }
  }

  // ---- clouds ---------------------------------------------------------------
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffe3c2, transparent: true, opacity: 0.85 });
  for (let i = 0; i < 9; i++) {
    const c = new THREE.Group();
    const puffs = 3 + Math.floor(rng() * 3);
    for (let j = 0; j < puffs; j++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(range(rng, 6, 13), 8, 6), cloudMat);
      s.position.set(j * 9 - puffs * 4, range(rng, -1, 2), range(rng, -4, 4));
      s.scale.y = 0.45;
      c.add(s);
    }
    c.position.set(range(rng, -260, 260), range(rng, 95, 150), range(rng, -260, 260));
    scene.add(c);
  }

  // ---- parked cars + pedestrian spawns --------------------------------------
  for (let i = 0; i < 10; i++) {
    const road = pick(rng, WORLD.roads);
    const along = pick(rng, WORLD.roads);
    const side = rng() < 0.5 ? 1 : -1;
    parkedSpots.push({
      x: road + side * 3.1, z: along + range(rng, -14, 14),
      angle: side > 0 ? Math.PI / 2 : -Math.PI / 2,
      color: pick(rng, PALETTE.car),
    });
  }
  for (let i = 0; i < 24; i++) {
    pedSpawns.push({
      x: pick(rng, WORLD.roads) + (rng() < 0.5 ? 6.5 : -6.5),
      z: range(rng, -165, 165),
    });
  }

  scene.add(group);
  return { colliders, parkedSpots, pedSpawns, group };
}
