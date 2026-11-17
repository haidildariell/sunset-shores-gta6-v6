// Sunset Shores — HUD: health, cash, wanted stars, speed, mission banner,
// damage flash, crosshair, and a live top-down minimap on a 2D canvas.
import { WORLD, clamp } from './config.js';

export class HUD {
  constructor() {
    this.el = {
      health: document.getElementById('health-fill'),
      healthText: document.getElementById('health-text'),
      cash: document.getElementById('cash'),
      stars: document.getElementById('stars'),
      speed: document.getElementById('speed'),
      speedLabel: document.getElementById('speed-label'),
      objective: document.getElementById('objective'),
      objectiveText: document.getElementById('objective-text'),
      banner: document.getElementById('banner'),
      center: document.getElementById('center-text'),
      hint: document.getElementById('hint'),
      flash: document.getElementById('damage-flash'),
      crosshair: document.getElementById('crosshair'),
      carHealth: document.getElementById('car-health'),
      carHealthFill: document.getElementById('car-health-fill'),
    };
    this.map = document.getElementById('minimap');
    this.mapCtx = this.map.getContext('2d');
    this.bannerTimer = null;
    this.waypoint = null;
    this.missionActive = false;
  }

  setHealth(h) {
    const v = clamp(Math.round(h), 0, 100);
    this.el.health.style.width = `${v}%`;
    this.el.health.style.background = v > 50 ? '#37d67a' : v > 25 ? '#f2b705' : '#e8402e';
    this.el.healthText.textContent = `${v}`;
  }

  setCash(c) { this.el.cash.textContent = `$${c.toLocaleString('en-US')}`; }

  setWanted(n) {
    let s = '';
    for (let i = 0; i < 5; i++) s += i < n ? '★' : '☆';
    this.el.stars.textContent = s;
    this.el.stars.style.color = n > 0 ? '#ffd94d' : '#ffffff88';
  }

  setSpeed(kmh, inCar) {
    this.el.speed.textContent = inCar ? `${Math.round(kmh)}` : '';
    this.el.speedLabel.textContent = inCar ? 'km/h' : '';
  }

  setCarHealth(h, show) {
    this.el.carHealth.style.display = show ? 'block' : 'none';
    if (show) this.el.carHealthFill.style.width = `${clamp(Math.round(h), 0, 100)}%`;
  }

  setObjective(text, show) {
    this.el.objective.style.display = show ? 'block' : 'none';
    if (text) this.el.objectiveText.textContent = text;
  }

  setHint(text) { this.el.hint.textContent = text; }

  showBanner(text, sub = '') {
    this.el.banner.innerHTML = `<div class="banner-title">${text}</div>${sub ? `<div class="banner-sub">${sub}</div>` : ''}`;
    this.el.banner.style.opacity = '1';
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => { this.el.banner.style.opacity = '0'; }, 3400);
  }

  showCenter(text, ms = 1800) {
    this.el.center.textContent = text;
    this.el.center.style.opacity = '1';
    setTimeout(() => { this.el.center.style.opacity = '0'; }, ms);
  }

  flashDamage() {
    this.el.flash.style.opacity = '0.45';
    setTimeout(() => { this.el.flash.style.opacity = '0'; }, 130);
  }

  setCrosshair(on) { this.el.crosshair.style.display = on ? 'block' : 'none'; }

  // Minimap: north-up, player-centred, 200x200 canvas covering ~360 units.
  draw(state) {
    const ctx = this.mapCtx;
    const S = 200, scale = S / 380;
    const { px, pz, cars, police, peds, waypoint, missionMarker, oceanX } = state;
    ctx.clearRect(0, 0, S, S);
    // Ocean strip on the right edge.
    ctx.fillStyle = '#12303e';
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#2e7f9e';
    const ox = S / 2 + (oceanX - px) * scale;
    ctx.fillRect(ox, 0, S - ox, S);
    ctx.fillStyle = '#e8c98f';
    ctx.fillRect(ox - 14 * scale, 0, 14 * scale, S);
    // City ground + roads.
    ctx.fillStyle = '#5d7a45';
    ctx.fillRect(0, 0, Math.min(S, ox), S);
    ctx.strokeStyle = '#33333d';
    ctx.lineWidth = 9 * scale;
    for (const r of WORLD.roads) {
      const x = S / 2 + (r - px) * scale;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, S); ctx.stroke();
      const z = S / 2 + (r - pz) * scale;
      ctx.beginPath(); ctx.moveTo(0, z); ctx.lineTo(S, z); ctx.stroke();
    }
    const dot = (x, z, color, r = 2.5) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(S / 2 + (x - px) * scale, S / 2 + (z - pz) * scale, r, 0, Math.PI * 2);
      ctx.fill();
    };
    for (const c of cars) dot(c.x, c.z, '#f2f2f2', 2);
    for (const p of peds) dot(p.x, p.z, '#ffd94d', 1.4);
    for (const u of police) dot(u.x, u.z, Math.floor(performance.now() / 300) % 2 ? '#ff2222' : '#2244ff', 3);
    if (waypoint) {
      ctx.strokeStyle = '#ffd94d'; ctx.lineWidth = 2;
      const wx = S / 2 + (waypoint.x - px) * scale, wz = S / 2 + (waypoint.z - pz) * scale;
      ctx.beginPath(); ctx.arc(wx, wz, 8, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#ffd94d';
      ctx.beginPath(); ctx.arc(wx, wz, 3, 0, Math.PI * 2); ctx.fill();
    }
    if (missionMarker) dot(missionMarker.x, missionMarker.z, '#ff4fd8', 3.5);
    // Player arrow (centre).
    ctx.save();
    ctx.translate(S / 2, S / 2);
    ctx.rotate(state.heading);
    ctx.fillStyle = '#37d67a';
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}
