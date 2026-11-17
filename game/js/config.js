// Sunset Shores — shared constants and small helpers.
// Palmera Bay: a sun-soaked grid city with a beach on its east edge.
export const WORLD = {
  // Road centre-lines (both axes), 40 units apart.
  roads: [-160, -120, -80, -40, 0, 40, 80, 120, 160],
  roadWidth: 9,
  halfCity: 175, // playable bounds (x/z clamp)
  beachX: 178, // sand starts here
  oceanX: 198, // water starts here
  blockGap: 40,
};

export const PALETTE = {
  sky: 0xffb36b,
  fog: 0xff9e66,
  sun: 0xffd27a,
  ground: 0x8fae6b,
  sand: 0xe8c98f,
  ocean: 0x2e7f9e,
  asphalt: 0x33333d,
  sidewalk: 0x9a938a,
  building: [0xf2d8a7, 0xe8a87c, 0x7fb5a3, 0xc98bb0, 0xf5e6c8, 0x9fc3d8, 0xe07856, 0xd8c9a3],
  car: [0xd8402e, 0x2e6fd8, 0xf2b705, 0x2ed8a0, 0xf2f2f2, 0x222226, 0x8e44ad, 0xff7f2e],
  shirt: [0x2e6fd8, 0xd8402e, 0x2ed8a0, 0xf2b705, 0x8e44ad, 0xff7f2e, 0xe8e8e8, 0x222226],
};

// Deterministic RNG so the city layout is identical on every load.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function range(rng, min, max) { return min + rng() * (max - min); }
export function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function dist2d(ax, az, bx, bz) { return Math.hypot(ax - bx, az - bz); }

// Circle (x,z,r) vs AABB push-out. Returns corrected {x,z} or null when clear.
export function collideCircleAABB(x, z, r, box) {
  const cx = clamp(x, box.minX, box.maxX);
  const cz = clamp(z, box.minZ, box.maxZ);
  const dx = x - cx, dz = z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return null;
  if (d2 > 0.0001) {
    const d = Math.sqrt(d2);
    return { x: cx + (dx / d) * r, z: cz + (dz / d) * r, nx: dx / d, nz: dz / d };
  }
  // Centre inside the box: push out along the smallest penetration axis.
  const pl = x - box.minX, pr = box.maxX - x, pt = z - box.minZ, pb = box.maxZ - z;
  const m = Math.min(pl, pr, pt, pb);
  if (m === pl) return { x: box.minX - r, z, nx: -1, nz: 0 };
  if (m === pr) return { x: box.maxX + r, z, nx: 1, nz: 0 };
  if (m === pt) return { x, z: box.minZ - r, nx: 0, nz: -1 };
  return { x, z: box.maxZ + r, nx: 0, nz: 1 };
}

export function pointInBox(x, z, box, pad = 0) {
  return x > box.minX - pad && x < box.maxX + pad && z > box.minZ - pad && z < box.maxZ + pad;
}

// Nearest road centre-line coordinate to a value (for snapping / lane math).
export function nearestRoad(v) {
  let best = WORLD.roads[0], bd = Infinity;
  for (const r of WORLD.roads) {
    const d = Math.abs(v - r);
    if (d < bd) { bd = d; best = r; }
  }
  return best;
}
