// Sunset Shores — main game: boot, loop, player, driving, wanted system,
// combat, missions, save/load and screenshot staging.
// Palmera Bay: steal cars, outrun the law, run jobs for Mara Sol.
import * as THREE from 'three';
import { WORLD, clamp, dist2d, range } from './config.js';
import { buildCity } from './city.js';
import { AudioEngine } from './audio.js';
import { makeCarMesh, DriveCar, Traffic, Police } from './vehicles.js';
import { makePersonMesh, animateWalk, Pedestrians, Rivals } from './people.js';
import { MissionManager, MISSIONS } from './missions.js';
import { HUD } from './hud.js';
import { collideCircleAABB } from './config.js';

const SAVE_KEY = 'sunset-shores-v6';
const START_POS = { x: 4, z: 8 };

class Game {
  constructor() {
    this.state = 'menu'; // menu | playing | paused | busted
    this.cash = 0;
    this.health = 100;
    this.wanted = 0;
    this.wantedCooldowns = {};
    this.lastCrimeAt = -999;
    this.wantedQuietT = 0;
    this.armed = false;
    this.stoleCar = false;
    this.inCar = null; // DriveCar
    this.player = { x: START_POS.x, z: START_POS.z, angle: 0, vy: 0, onGround: true, speed: 0 };
    this.camYaw = 0.6; this.camPitch = 0.34; this.camDist = 8;
    this.keys = {};
    this.bustT = 0;
    this.shot = new URLSearchParams(location.search).get('shot');
    this.frames = 0;
    this.saveT = 0;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    document.getElementById('game-root').appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xffb36b);
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 900);

    const city = buildCity(this.scene);
    this.colliders = city.colliders;
    this.traffic = new Traffic(this.scene, 14);
    this.peds = new Pedestrians(this.scene, city.pedSpawns, 18);
    this.police = new Police(this.scene);
    this.rivals = new Rivals(this.scene);

    // Parked cars (stealable, no heat for taking one).
    this.parked = [];
    for (const spot of city.parkedSpots) {
      const mesh = makeCarMesh(spot.color);
      mesh.position.set(spot.x, 0, spot.z);
      mesh.rotation.y = spot.angle;
      this.scene.add(mesh);
      this.parked.push(new DriveCar(mesh, spot.x, spot.z, spot.angle));
    }

    // Player character.
    this.playerMesh = makePersonMesh(0x2ed8a0, 0x2a2a33);
    this.scene.add(this.playerMesh);

    // Mission waypoint beacon.
    this.beacon = new THREE.Group();
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(2.2, 2.2, 40, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd94d, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
    );
    beam.position.y = 20;
    this.beacon.add(beam);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(1.1), new THREE.MeshBasicMaterial({ color: 0xffd94d }));
    gem.position.y = 6;
    this.beacon.add(gem);
    this.beacon.visible = false;
    this.scene.add(this.beacon);
    this.beaconGem = gem;

    this.audio = new AudioEngine();
    this.hud = new HUD();
    this.missions = new MissionManager((type, payload) => this.onMissionEvent(type, payload));

    this.raycaster = new THREE.Raycaster();
    this.tracers = [];
    this.loadSave();
    this.bindInput();
    this.bindMenu();
    this.hud.setCash(this.cash);
    this.hud.setHealth(this.health);
    this.hud.setWanted(0);
    this.clock = new THREE.Clock();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
    if (this.shot) this.stageShot(this.shot);
  }

  // ---- save / load ----------------------------------------------------------
  loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      this.saveData = s;
      this.cash = s.cash || 0;
      this.missions.index = s.missionIndex || 0;
      this.missions.done = s.done || 0;
      this.armed = !!s.armed;
      if (s.x !== undefined) { this.player.x = s.x; this.player.z = s.z; }
      this.health = s.health ?? 100;
      document.getElementById('btn-continue').style.display = 'inline-block';
    } catch { /* no save */ }
  }
  saveGame() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        cash: this.cash, missionIndex: this.missions.index, done: this.missions.done,
        armed: this.armed, x: this.player.x, z: this.player.z, health: this.health,
      }));
    } catch { /* storage unavailable */ }
  }

  // ---- input ----------------------------------------------------------------
  bindInput() {
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys[e.code] = true;
      if (this.state !== 'playing') return;
      if (e.code === 'KeyE') this.toggleCar();
      if (e.code === 'KeyT') this.tryStartMission();
      if (e.code === 'KeyF') this.punch();
      if (e.code === 'Digit1') { this.armed = !this.armed; this.hud.showCenter(this.armed ? 'Pistol out — click to shoot' : 'Pistol holstered'); }
      if (e.code === 'KeyM') { this.audio.setMuted(!this.audio.muted); this.hud.showCenter(this.audio.muted ? 'Sound off' : 'Sound on'); }
      if (e.code === 'Escape' || e.code === 'KeyP') this.pauseGame();
      if (e.code === 'Space') e.preventDefault();
    });
    addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    const cv = this.renderer.domElement;
    let dragging = false, lx = 0, ly = 0;
    cv.addEventListener('mousedown', (e) => {
      if (this.state !== 'playing') return;
      dragging = true; lx = e.clientX; ly = e.clientY;
      if (e.button === 0) this.shoot();
      try { cv.requestPointerLock(); } catch { /* no lock */ }
    });
    addEventListener('mouseup', () => { dragging = false; });
    addEventListener('mousemove', (e) => {
      if (this.state !== 'playing') return;
      if (document.pointerLockElement === cv) {
        this.camYaw -= e.movementX * 0.0032;
        this.camPitch = clamp(this.camPitch + e.movementY * 0.0028, 0.06, 1.05);
      } else if (dragging) {
        this.camYaw -= (e.clientX - lx) * 0.005;
        this.camPitch = clamp(this.camPitch + (e.clientY - ly) * 0.004, 0.06, 1.05);
        lx = e.clientX; ly = e.clientY;
      }
    });
    cv.addEventListener('wheel', (e) => {
      this.camDist = clamp(this.camDist + Math.sign(e.deltaY) * 1.2, 5, 16);
    }, { passive: true });
    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pauseGame();
    });
  }

  bindMenu() {
    document.getElementById('btn-start').addEventListener('click', () => {
      this.audio.init();
      this.startFresh();
    });
    document.getElementById('btn-continue').addEventListener('click', () => {
      this.audio.init();
      this.startPlaying();
    });
    document.getElementById('btn-resume').addEventListener('click', () => this.resumeGame());
    document.getElementById('btn-save-quit').addEventListener('click', () => {
      this.saveGame();
      this.state = 'menu';
      document.getElementById('pause').style.display = 'none';
      document.getElementById('menu').style.display = 'flex';
    });
    document.getElementById('btn-respawn').addEventListener('click', () => this.respawn());
    document.getElementById('btn-restart').addEventListener('click', () => {
      localStorage.removeItem(SAVE_KEY);
      location.reload();
    });
  }

  startFresh() {
    this.cash = 0; this.health = 100; this.wanted = 0;
    this.missions.index = 0; this.missions.done = 0; this.missions.active = null;
    this.armed = false;
    this.player.x = START_POS.x; this.player.z = START_POS.z;
    this.startPlaying();
    this.hud.showBanner('SUNSET SHORES', 'Palmera Bay — press T to take your first job');
  }
  startPlaying() {
    document.getElementById('menu').style.display = 'none';
    document.getElementById('busted').style.display = 'none';
    this.state = 'playing';
  }
  pauseGame() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    document.getElementById('pause').style.display = 'flex';
    this.saveGame();
  }
  resumeGame() {
    document.getElementById('pause').style.display = 'none';
    this.state = 'playing';
  }

  // ---- wanted ---------------------------------------------------------------
  addWanted(n, reason) {
    const now = performance.now();
    if (this.wantedCooldowns[reason] && now - this.wantedCooldowns[reason] < 4000) return;
    this.wantedCooldowns[reason] = now;
    this.wanted = clamp(this.wanted + n, 0, 5);
    this.lastCrimeAt = now;
    this.hud.setWanted(this.wanted);
  }
  updateWanted(dt) {
    const now = performance.now();
    if (this.wanted > 0) {
      let nearestCop = 999;
      for (const u of this.police.units) nearestCop = Math.min(nearestCop, dist2d(u.x, u.z, this.player.x, this.player.z));
      if (now - this.lastCrimeAt > 20000 && nearestCop > 45) {
        this.wantedQuietT += dt;
        if (this.wantedQuietT > 8) {
          this.wantedQuietT = 0;
          this.wanted--;
          this.hud.setWanted(this.wanted);
          if (this.wanted === 0) this.hud.showCenter('You lost them. Clean — for now.');
        }
      } else this.wantedQuietT = 0;
    }
    this.police.ensure(this.wanted > 0 ? Math.min(this.wanted + 1, 5) : 0);
    this.audio.setSiren(this.wanted > 0 && this.state === 'playing');
  }

  // ---- cars -----------------------------------------------------------------
  nearestEnterable() {
    let best = null, bd = 4.5, kind = null;
    for (const p of this.parked) {
      const d = dist2d(this.player.x, this.player.z, p.x, p.z);
      if (d < bd) { bd = d; best = p; kind = 'parked'; }
    }
    for (const c of this.traffic.cars) {
      const d = dist2d(this.player.x, this.player.z, c.x, c.z);
      if (d < bd) { bd = d; best = c; kind = 'traffic'; }
    }
    return best ? { car: best, kind } : null;
  }

  toggleCar() {
    if (this.inCar) {
      // Get out beside the car.
      const c = this.inCar;
      this.player.x = c.x - Math.sin(c.angle) * 2.4;
      this.player.z = c.z - Math.cos(c.angle) * 2.4;
      this.playerMesh.visible = true;
      this.inCar = null;
      this.camDist = 8;
      this.hud.setCarHealth(0, false);
      return;
    }
    const found = this.nearestEnterable();
    if (!found) return;
    if (found.kind === 'traffic') {
      const rec = this.traffic.stealNearest(this.player.x, this.player.z, 5);
      if (!rec) return;
      this.inCar = new DriveCar(rec.mesh, rec.x, rec.z, rec.mesh.rotation.y);
      this.addWanted(1, 'steal');
      this.stoleCar = true;
      this.hud.showCenter('Car stolen! The law is coming.');
      this.audio.sirenBlip();
    } else {
      const i = this.parked.indexOf(found.car);
      if (i >= 0) this.parked.splice(i, 1);
      this.inCar = found.car;
      this.stoleCar = true;
    }
    this.playerMesh.visible = false;
    this.camDist = 11;
    this.hud.setCarHealth(this.inCar.health, true);
  }

  // ---- combat ---------------------------------------------------------------
  shoot() {
    if (!this.armed || this.state !== 'playing') return;
    this.audio.shot();
    const from = this.camera.position.clone();
    this.raycaster.setFromCamera({ x: 0, y: 0 }, this.camera);
    this.raycaster.far = 90;
    const targets = [];
    for (const r of this.rivals.list) if (r.health > 0) targets.push(r.mesh);
    for (const p of this.peds.list) if (p.health > 0) targets.push(p.mesh);
    const hits = this.raycaster.intersectObjects(targets, true);
    let end = from.clone().add(this.raycaster.ray.direction.clone().multiplyScalar(90));
    if (hits.length) {
      const h = hits[0];
      end = h.point.clone();
      let obj = h.object;
      while (obj.parent && obj.parent !== this.scene) obj = obj.parent;
      const rival = this.rivals.list.find((r) => r.mesh === obj);
      const ped = this.peds.list.find((p) => p.mesh === obj);
      if (rival) {
        rival.health -= 34;
        if (rival.health <= 0) { rival.mesh.rotation.z = Math.PI / 2; rival.mesh.position.y = 0.4; this.hud.showCenter('Viper down'); }
      } else if (ped) {
        ped.health = 0;
        ped.mesh.rotation.z = Math.PI / 2; ped.mesh.position.y = 0.4;
        this.addWanted(1, 'shoot-ped');
      }
    }
    this.spawnTracer(from, end);
  }

  punch() {
    if (this.inCar || this.state !== 'playing') return;
    this.audio.punch();
    const fx = this.player.x + Math.sin(this.player.angle) * 1.6;
    const fz = this.player.z + Math.cos(this.player.angle) * 1.6;
    const rival = this.rivals.list.find((r) => r.health > 0 && dist2d(fx, fz, r.x, r.z) < 2.2);
    const ped = this.peds.nearest(fx, fz, 2.2);
    if (rival) {
      rival.health -= 25;
      rival.x += Math.sin(this.player.angle) * 1.2; rival.z += Math.cos(this.player.angle) * 1.2;
      rival.mesh.position.set(rival.x, 0, rival.z);
      if (rival.health <= 0) { rival.mesh.rotation.z = Math.PI / 2; rival.mesh.position.y = 0.4; }
    } else if (ped) {
      ped.health = 0;
      ped.mesh.rotation.z = Math.PI / 2; ped.mesh.position.y = 0.4;
      this.addWanted(1, 'punch-ped');
    }
  }

  spawnTracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 }));
    this.scene.add(line);
    this.tracers.push({ line, t: 0.09 });
  }

  // ---- missions ---------------------------------------------------------------
  tryStartMission() {
    if (this.missions.active) return;
    if (this.missions.finished) { this.hud.showCenter('Story complete — Palmera Bay is yours, Rico.'); return; }
    const def = this.missions.currentDef;
    if (this.missions.start()) {
      this.hud.setObjective(def.steps[0].text, true);
      this.audio.chime();
    }
  }

  onMissionEvent(type, payload) {
    if (type === 'start') {
      this.hud.showBanner(`MISSION: ${payload.mission.name}`, payload.mission.brief);
    } else if (type === 'step') {
      const s = payload.step;
      this.hud.setObjective(s.text, true);
      this.hud.showCenter(s.text);
      if (s.type === 'eliminate') this.rivals.spawn(s.x, s.z, s.n);
      if (s.type === 'escape') { this.wanted = Math.max(this.wanted, 3); this.hud.setWanted(this.wanted); this.lastCrimeAt = performance.now(); }
      if (s.type === 'wanted') this.hud.showCenter('Make some noise — steal a car!');
    } else if (type === 'complete') {
      this.cash += payload.reward;
      this.hud.setCash(this.cash);
      this.hud.showBanner('MISSION COMPLETE', `${payload.mission.name} — +$${payload.reward}`);
      this.audio.jingle();
      if (payload.mission.id === 1) { this.armed = true; this.hud.showCenter('Mara gave you a pistol — press 1 to draw it'); }
      if (this.missions.finished) this.hud.showBanner('THE BIG SCORE — DONE', 'Palmera Bay is yours. Story complete!');
      this.hud.setObjective('', false);
      this.rivals.clear();
      this.saveGame();
    } else if (type === 'fail') {
      this.hud.showBanner('MISSION FAILED', payload.reason);
      this.audio.fail();
      this.hud.setObjective('', false);
      this.rivals.clear();
    }
  }

  // ---- busted -----------------------------------------------------------------
  bust(reason) {
    if (this.state !== 'playing') return;
    this.state = 'busted';
    if (this.inCar) { this.inCar = null; this.playerMesh.visible = true; }
    this.missions.abort(reason);
    this.cash = Math.max(0, this.cash - 100);
    this.hud.setCash(this.cash);
    this.audio.setSiren(false);
    this.audio.fail();
    document.getElementById('busted-title').textContent = reason;
    document.getElementById('busted').style.display = 'flex';
    this.saveGame();
  }

  respawn() {
    this.health = 100;
    this.wanted = 0;
    this.hud.setWanted(0);
    this.player.x = START_POS.x; this.player.z = START_POS.z;
    this.player.vy = 0;
    this.bustT = 0;
    this.police.ensure(0);
    document.getElementById('busted').style.display = 'none';
    this.state = 'playing';
    this.hud.setHealth(100);
    this.hud.showCenter('Back on the streets. Stay low.');
  }

  // ---- per-frame updates --------------------------------------------------------
  updatePlayer(dt) {
    const p = this.player;
    if (this.inCar) {
      const input = {
        forward: !!this.keys.KeyW || !!this.keys.ArrowUp,
        back: !!this.keys.KeyS || !!this.keys.ArrowDown,
        left: !!this.keys.KeyA || !!this.keys.ArrowLeft,
        right: !!this.keys.KeyD || !!this.keys.ArrowRight,
      };
      // Staged screenshot scenes keep the car rolling on its own.
      if (this.autoDrive) input.forward = true;
      const prevHealth = this.inCar.health;
      this.inCar.update(dt, input, this.colliders);
      // Staged chase: hold the car at a speed the police can match, so the
      // pack pulls alongside instead of falling behind the camera.
      if (this.autoDrive && this.autoDriveSpeed && this.inCar.speed > this.autoDriveSpeed) {
        this.inCar.speed = this.autoDriveSpeed;
      }
      if (this.inCar.health < prevHealth - 0.5) this.audio.crash();
      this.audio.setEngine(true, Math.abs(this.inCar.speed) / this.inCar.maxSpeed);
      this.hud.setSpeed(Math.abs(this.inCar.speed) * 3.6, true);
      this.hud.setCarHealth(this.inCar.health, true);
      if (this.inCar.health <= 0) {
        this.audio.crash();
        const wx = this.inCar.x, wz = this.inCar.z;
        this.scene.remove(this.inCar.mesh);
        this.inCar = null;
        this.playerMesh.visible = true;
        this.player.x = clamp(wx + 2, -170, 170); this.player.z = clamp(wz, -170, 170);
        this.hud.setCarHealth(0, false);
        this.hud.showCenter('Your car is wrecked!');
      }
      return;
    }
    this.audio.setEngine(false, 0);
    this.hud.setSpeed(0, false);
    const fwdX = -Math.sin(this.camYaw), fwdZ = -Math.cos(this.camYaw);
    const rgtX = Math.cos(this.camYaw), rgtZ = -Math.sin(this.camYaw);
    let mx = 0, mz = 0;
    if (this.keys.KeyW || this.keys.ArrowUp) { mx += fwdX; mz += fwdZ; }
    if (this.keys.KeyS || this.keys.ArrowDown) { mx -= fwdX; mz -= fwdZ; }
    if (this.keys.KeyD || this.keys.ArrowRight) { mx += rgtX; mz += rgtZ; }
    if (this.keys.KeyA || this.keys.ArrowLeft) { mx -= rgtX; mz -= rgtZ; }
    const len = Math.hypot(mx, mz);
    const sprint = this.keys.ShiftLeft || this.keys.ShiftRight;
    const speed = sprint ? 10 : 6;
    if (len > 0) {
      mx /= len; mz /= len;
      p.angle = Math.atan2(mx, mz);
      p.speed = speed;
      let nx = p.x + mx * speed * dt;
      let nz = p.z + mz * speed * dt;
      for (const b of this.colliders) {
        const hit = collideCircleAABB(nx, nz, 0.55, b);
        if (hit) { nx = hit.x; nz = hit.z; }
      }
      p.x = clamp(nx, -WORLD.halfCity, WORLD.oceanX - 4);
      p.z = clamp(nz, -WORLD.halfCity, WORLD.halfCity);
    } else p.speed = 0;
    // Jump + gravity.
    if (this.keys.Space && p.onGround) { p.vy = 7.5; p.onGround = false; }
    if (!p.onGround) {
      p.vy -= 22 * dt;
      const y = (this.playerMesh.position.y || 0) + p.vy * dt;
      if (y <= 0) { this.playerMesh.position.y = 0; p.vy = 0; p.onGround = true; }
      else this.playerMesh.position.y = y;
    }
    this.playerMesh.position.set(p.x, this.playerMesh.position.y, p.z);
    this.playerMesh.rotation.y = p.angle;
    animateWalk(this.playerMesh, len > 0 ? (sprint ? 1 : 0.55) : 0, dt);
    // Bumping a pedestrian at speed is a crime.
    if (len > 0 && speed > 6) {
      const ped = this.peds.nearest(p.x, p.z, 1.4);
      if (ped) {
        ped.health = 0;
        ped.mesh.rotation.z = Math.PI / 2; ped.mesh.position.y = 0.4;
        this.addWanted(1, 'hit-ped');
      }
    }
  }

  updateCamera(dt) {
    const target = this.inCar
      ? { x: this.inCar.x, z: this.inCar.z, y: 1.6 }
      : { x: this.player.x, z: this.player.z, y: 1.6 + this.playerMesh.position.y };
    const dist = this.camDist;
    const cx = target.x + Math.sin(this.camYaw) * Math.cos(this.camPitch) * dist;
    const cz = target.z + Math.cos(this.camYaw) * Math.cos(this.camPitch) * dist;
    const cy = target.y + Math.sin(this.camPitch) * dist + 1.2;
    const k = 1 - Math.pow(0.0001, dt);
    this.camera.position.x += (cx - this.camera.position.x) * k;
    this.camera.position.y += (Math.max(cy, 1.6) - this.camera.position.y) * k;
    this.camera.position.z += (cz - this.camera.position.z) * k;
    this.camera.lookAt(target.x, target.y, target.z);
  }

  updateHud(dt) {
    // Contextual hint.
    let hint = 'WASD move · mouse drag camera · Shift sprint · Space jump';
    if (this.inCar) hint = 'WASD drive · E get out · 1 pistol · M sound · Esc pause';
    else if (this.nearestEnterable()) hint = 'E — get in the car';
    else if (!this.missions.active && !this.missions.finished) hint = `T — start mission: ${this.missions.currentDef.name}`;
    else if (this.armed) hint = 'Click — shoot · F — punch · E — car · Esc pause';
    this.hud.setHint(hint);
    this.hud.setCrosshair(this.armed && this.state === 'playing');
    // Waypoint beacon.
    const wp = this.missions.waypoint();
    if (wp && this.missions.active) {
      this.beacon.visible = true;
      this.beacon.position.set(wp.x, 0, wp.z);
      this.beaconGem.position.y = 6 + Math.sin(performance.now() / 300) * 0.8;
      this.beaconGem.rotation.y += dt * 2;
    } else this.beacon.visible = false;
    // Minimap.
    this.hud.draw({
      px: this.inCar ? this.inCar.x : this.player.x,
      pz: this.inCar ? this.inCar.z : this.player.z,
      heading: Math.PI - (this.inCar ? this.inCar.angle : this.player.angle),
      cars: this.traffic.cars,
      police: this.police.units,
      peds: this.peds.list.filter((p) => p.health > 0),
      waypoint: wp,
      missionMarker: null,
      oceanX: WORLD.oceanX,
    });
  }

  // ---- screenshot staging -------------------------------------------------------
  stageShot(name) {
    // Start straight into the game (no menu) with a staged scene.
    this.state = 'playing';
    document.getElementById('menu').style.display = 'none';
    document.getElementById('hud').style.display = 'block';
    this.audio.init();
    const placePlayer = (x, z, angle) => {
      this.player.x = x; this.player.z = z; this.player.angle = angle;
      this.playerMesh.position.set(x, 0, z);
      this.playerMesh.rotation.y = angle;
    };
    if (name === 'drive') {
      const spot = this.parked[0];
      this.parked.splice(0, 1);
      this.inCar = spot;
      this.inCar.x = 0; this.inCar.z = -40; this.inCar.angle = Math.PI / 2;
      this.inCar.speed = 22;
      this.autoDrive = true;
      this.playerMesh.visible = false;
      this.camYaw = Math.PI / 2 + Math.PI; this.camPitch = 0.55; this.camDist = 13;
      this.hud.setCarHealth(100, true);
    } else if (name === 'chase') {
      const spot = this.parked[1];
      this.parked.splice(1, 1);
      this.inCar = spot;
      this.inCar.x = 40; this.inCar.z = 0; this.inCar.angle = 0;
      this.inCar.speed = 26;
      this.autoDrive = true;
      this.autoDriveSpeed = 14; // slow enough for the pack to catch up
      this.playerMesh.visible = false;
      this.wanted = 3;
      this.hud.setWanted(3);
      this.police.ensure(4);
      // A pack starting just behind, fanning out to pull alongside.
      this.police.units.forEach((u, i) => {
        u.x = 40 + [-6, 6, -6, 6][i];
        u.z = -12 - i * 4;
        u.speed = 22;
      });
      this.camYaw = Math.PI; this.camPitch = 0.42; this.camDist = 13;
      this.hud.setCarHealth(100, true);
      this.hud.showBanner('WANTED ★★★', 'Palmera Bay PD is on you');
    } else if (name === 'mission') {
      placePlayer(-80, -68, Math.PI); // on road x=-80, facing the Vipers at (-80,-80)
      this.armed = true;
      this.missions.index = 3;
      this.missions.start();
      this.missions.active.step = 1;
      this.missions._announceStep(); // 'eliminate' step spawns the 4 Vipers
      this.camYaw = 0; this.camPitch = 0.35; this.camDist = 10;
      this.hud.setObjective('Take down all 4 Vipers', true);
    } else {
      // cover: on foot mid-avenue, camera down the road behind the player.
      placePlayer(0, -20, 0);
      this.camYaw = Math.PI; this.camPitch = 0.38; this.camDist = 10;
      this.hud.showBanner('SUNSET SHORES', 'Palmera Bay — press T to take your first job');
    }
    this.hud.setHealth(this.health);
    this.hud.setCash(this.cash);
  }

  // ---- main loop ------------------------------------------------------------------
  loop() {
    requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.frames++;
    const playing = this.state === 'playing';
    if (playing) {
      this.updatePlayer(dt);
      this.traffic.update(dt, this.inCar);
      this.peds.update(dt, this.player, this.wanted > 0 || this.inCar);
      this.police.update(dt, this.inCar ? this.inCar.x : this.player.x, this.inCar ? this.inCar.z : this.player.z, 0);
      // Police contact: ram the car, or bust the player on foot.
      for (const u of this.police.units) {
        const tx = this.inCar ? this.inCar.x : this.player.x;
        const tz = this.inCar ? this.inCar.z : this.player.z;
        const d = dist2d(u.x, u.z, tx, tz);
        if (this.inCar && d < 3.4) {
          this.inCar.health -= 14 * dt;
          this.inCar.speed *= (1 - dt * 0.18);
          if (Math.random() < dt * 2) { this.audio.crash(); this.hud.flashDamage(); }
          this.hud.setCarHealth(this.inCar.health, true);
        } else if (!this.inCar && d < 2.4) {
          this.bustT += dt;
          if (this.bustT > 1.2) { this.bust('BUSTED'); return; }
        }
      }
      if (!this.inCar) this.bustT = Math.max(0, this.bustT - dt * 2);
      this.rivals.update(dt, this.player, (r, d) => {
        if (Math.random() < clamp(0.75 - d / 60, 0.15, 0.7)) {
          this.health -= range(Math.random, 5, 11);
          this.hud.setHealth(this.health);
          this.hud.flashDamage();
          this.audio.shot();
          if (this.health <= 0) { this.bust('WASTED'); return; }
        }
      });
      this.missions.update(dt, {
        x: this.inCar ? this.inCar.x : this.player.x,
        z: this.inCar ? this.inCar.z : this.player.z,
        inCar: !!this.inCar,
        stoleCar: this.stoleCar,
        wanted: this.wanted,
        rivalsAlive: this.rivals.alive,
      });
      this.updateWanted(dt);
      // Health regen while clean.
      if (this.wanted === 0 && this.health < 100) {
        this.health = Math.min(100, this.health + 3 * dt);
        this.hud.setHealth(this.health);
      }
      // Mission step timer display.
      const step = this.missions.currentStep();
      if (step && step.timer && this.missions.active) {
        const left = Math.max(0, Math.ceil(step.timer - this.missions.active.timer));
        this.hud.setObjective(`${step.text} — ${left}s`, true);
      }
      // Autosave.
      this.saveT += dt;
      if (this.saveT > 30) { this.saveT = 0; this.saveGame(); }
    } else {
      // Menu orbit: slow cinematic pan over the city.
      const t = performance.now() / 1000;
      this.camera.position.set(Math.sin(t * 0.05) * 120, 55, Math.cos(t * 0.05) * 120);
      this.camera.lookAt(0, 10, 0);
      this.traffic.update(dt, null);
      this.peds.update(dt, null, false);
    }
    // Tracers fade.
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i];
      tr.t -= dt;
      tr.line.material.opacity = Math.max(0, tr.t / 0.09) * 0.9;
      if (tr.t <= 0) { this.scene.remove(tr.line); this.tracers.splice(i, 1); }
    }
    this.updateCamera(dt);
    this.updateHud(dt);
    this.renderer.render(this.scene, this.camera);
    // Screenshot readiness: a few settled frames after staging.
    if (this.shot && this.frames > 30 && !window.__shotReady) {
      window.__shotReady = true;
    }
  }
}

try {
  const game = new Game();
  window.__game = game;
} catch (err) {
  document.getElementById('game-root').innerHTML = `<pre style="color:#fff;padding:40px">Failed to start Sunset Shores:\n${err.message}\n${err.stack || ''}</pre>`;
  console.error(err);
}
