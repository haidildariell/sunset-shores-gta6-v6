// Sunset Shores — story missions in Palmera Bay.
// Rico Vale, new in town, runs jobs for Mara Sol. Five missions, each a
// small state machine over objectives: go somewhere, steal a car, deliver,
// lose the cops, fight rivals, escape. Rewards are cash; finishing all five
// closes the story arc.
import { dist2d } from './config.js';

export const MISSIONS = [
  {
    id: 1, name: 'Wheels',
    brief: 'Mara needs wheels. Steal any car on the street and bring it to the hideout.',
    steps: [
      { type: 'steal', text: 'Steal a car — walk up to one and press E' },
      { type: 'goto', x: -40, z: 120, r: 6, text: 'Drive it to the hideout marker' },
    ],
    reward: 200,
  },
  {
    id: 2, name: 'Sunset Courier',
    brief: 'Three drops, one sunset. Deliver the package to each marker before the timer runs out.',
    steps: [
      { type: 'goto', x: 80, z: -80, r: 6, text: 'Drop 1/3 — Pier 9, north side', timer: 150 },
      { type: 'goto', x: -120, z: -40, r: 6, text: 'Drop 2/3 — Coral Court' },
      { type: 'goto', x: 40, z: 120, r: 6, text: 'Drop 3/3 — Marina gate' },
    ],
    reward: 300,
  },
  {
    id: 3, name: 'Heat',
    brief: 'The cops are onto you. Lose the heat — get your wanted level back to zero.',
    steps: [
      { type: 'wanted', min: 2, text: 'Get the cops on you — steal a car or start trouble' },
      { type: 'lose', text: 'Now lose them — stay out of sight until the stars clear' },
    ],
    reward: 250,
  },
  {
    id: 4, name: 'Rooftop Rumble',
    brief: 'The Vipers took Mara\'s corner. Clear them out — all four of them.',
    steps: [
      { type: 'goto', x: -80, z: -80, r: 8, text: 'Get to Coral Court — the Vipers are waiting' },
      { type: 'eliminate', x: -80, z: -80, n: 4, text: 'Take down all 4 Vipers' },
    ],
    reward: 400,
  },
  {
    id: 5, name: 'The Big Score',
    brief: 'One last job: lift the cash from the Bay Bank and lose the whole department getting home.',
    steps: [
      { type: 'goto', x: 120, z: 40, r: 7, text: 'Reach the Bay Bank on Ocean Drive' },
      { type: 'grab', x: 120, z: 40, r: 7, text: 'Grab the cash — hold still by the vault door', hold: 3 },
      { type: 'escape', x: -40, z: 120, r: 7, text: 'Escape to the hideout — wanted level 3 is on you' },
    ],
    reward: 800,
  },
];

export class MissionManager {
  constructor(onEvent) {
    this.onEvent = onEvent; // (type, payload) — 'start' | 'step' | 'complete' | 'fail'
    this.index = 0; // next mission to play
    this.active = null; // {def, step, timer, holdT}
    this.done = 0;
  }

  get currentDef() { return MISSIONS[this.index] || null; }
  get finished() { return this.index >= MISSIONS.length; }

  start() {
    const def = this.currentDef;
    if (!def) return false;
    this.active = { def, step: 0, timer: 0, holdT: 0 };
    this.onEvent('start', { mission: def });
    this._announceStep();
    return true;
  }

  _announceStep() {
    const s = this.active.def.steps[this.active.step];
    this.onEvent('step', { mission: this.active.def, step: s, index: this.active.step });
  }

  currentStep() {
    return this.active ? this.active.def.steps[this.active.step] : null;
  }

  // Waypoint for the HUD/minimap: null when the step has none.
  waypoint() {
    const s = this.currentStep();
    if (!s || s.x === undefined) return null;
    return { x: s.x, z: s.z, r: s.r || 6 };
  }

  abort(reason) {
    if (!this.active) return;
    this.active = null;
    this.onEvent('fail', { reason });
  }

  complete() {
    const def = this.active.def;
    this.active = null;
    this.done++;
    this.index++;
    this.onEvent('complete', { mission: def, reward: def.reward });
  }

  // Called every frame with the live game state.
  // ctx: {x, z, inCar, stoleCar, wanted, rivalsAlive}
  update(dt, ctx) {
    if (!this.active) return;
    const m = this.active;
    const s = m.def.steps[m.step];
    if (s.timer) {
      m.timer += dt;
      if (m.timer > s.timer) { this.abort('Out of time'); return; }
    }
    const advance = () => {
      m.step++;
      m.timer = 0; m.holdT = 0;
      if (m.step >= m.def.steps.length) this.complete();
      else this._announceStep();
    };
    switch (s.type) {
      case 'steal':
        if (ctx.stoleCar) advance();
        break;
      case 'goto':
        if (dist2d(ctx.x, ctx.z, s.x, s.z) < s.r) advance();
        break;
      case 'wanted':
        if (ctx.wanted >= (s.min || 1)) advance();
        break;
      case 'lose':
        if (ctx.wanted <= 0) advance();
        break;
      case 'eliminate':
        if (ctx.rivalsAlive <= 0) advance();
        break;
      case 'grab':
        if (dist2d(ctx.x, ctx.z, s.x, s.z) < s.r) {
          m.holdT += dt;
          if (m.holdT >= (s.hold || 3)) advance();
        } else m.holdT = 0;
        break;
      case 'escape':
        if (ctx.wanted >= 3 && dist2d(ctx.x, ctx.z, s.x, s.z) >= s.r) {
          // still escaping; nothing to do until arrival
        }
        if (dist2d(ctx.x, ctx.z, s.x, s.z) < s.r) advance();
        break;
      default: break;
    }
  }

  // Mission 5's escape step raises the heat the moment the cash is grabbed.
  heatForStep() {
    const s = this.currentStep();
    if (this.active && this.active.def.id === 5 && s && s.type === 'escape') return 3;
    if (this.active && this.active.def.id === 3) return 2;
    return 0;
  }
}
