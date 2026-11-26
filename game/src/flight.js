// Flight simulation for Seven Skies Airline — the part the player actually flies.
// Pure logic: no DOM, no canvas, no audio. A flight is a state object plus a
// step function, so the game loop, the autopilot and the headless tests all fly
// the same physics, and a screenshot can stage any moment of any flight.
//
// Phases: checklist → takeoff → climb → cruise → descent → approach → landing → done.
// The checklist is five real checks; the cruise is a ring run through weather;
// the landing is graded on descent rate, centreline and configuration.
import { FUEL_PRICE, LANDING_FEE, TIP_BASE } from './config.js';
import { buildWorld, routePoint, distTo, alongRoute, lateralOf, bearingTo } from './world.js';
import { clamp, headingDiff, mulberry32 } from './rng.js';

export const CHECKS = [
  { key: '1', label: 'Fuel — tanks dipped, reserves checked' },
  { key: '2', label: 'Flaps — full travel, no binding' },
  { key: '3', label: 'Lights — nav, beacon, landing' },
  { key: '4', label: 'Passengers — seated, belts on, snacks stowed' },
  { key: '5', label: 'Weather — storm cells briefed, route filed' },
];

export function createFlight(route, aircraft, upgradeIds, manifest, seed) {
  const has = (id) => upgradeIds.indexOf(id) >= 0;
  const world = buildWorld(route, seed);
  const fuelCap = aircraft.fuelCap * (has('tank') ? 1.4 : 1);
  return {
    route,
    aircraft,
    upgrades: upgradeIds.slice(),
    manifest: manifest.map((p) => ({ ...p })),
    world,
    seed,
    rand: mulberry32(seed * 2654435761 + route.seed),
    phase: 'checklist',
    checks: CHECKS.map(() => false),
    x: 0,
    y: 0,
    heading: route.heading,
    speed: 0, // knots
    altitude: 0, // feet
    vspeed: 0, // feet per minute
    throttle: 0,
    pitch: 0, // -1..1, smoothed
    roll: 0, // -1..1, smoothed
    gear: true,
    flaps: 0,
    fuel: fuelCap,
    fuelCap,
    fuelUsed: 0,
    damage: 0,
    time: 0,
    ringsHit: 0,
    ringsTotal: world.rings.length,
    combo: 0,
    comboBest: 0,
    nextRing: 0,
    inStorm: false,
    shake: 0,
    autopilot: false,
    warnings: [],
    cruiseAlt: 6500,
    // Par time: cruise at half of max speed plus ten minutes for takeoff,
    // landing and the ring detours — a decent flight makes it, a sloppy one doesn't.
    parTime: (route.dist / (aircraft.maxSpeed * 0.5)) * 3600 + 600,
    landingGrade: null,
    touchdown: null,
    result: null,
    message: 'Complete the pre-flight checklist — press 1–5 or click each item.',
    messageTime: 0,
  };
}

function effectiveStats(f) {
  const has = (id) => f.upgrades.indexOf(id) >= 0;
  return {
    maxSpeed: f.aircraft.maxSpeed * (has('engines') ? 1.25 : 1),
    climb: f.aircraft.climb * (has('engines') ? 1.25 : 1),
    burn: f.aircraft.burn * (has('winglets') ? 0.8 : 1),
    handling: f.aircraft.handling,
  };
}

function announce(f, text) {
  f.message = text;
  f.messageTime = f.time;
}

function stormAt(f) {
  for (let i = 0; i < f.world.storms.length; i += 1) {
    const s = f.world.storms[i];
    const p = routePoint(f.route, s.along, s.lateral);
    const d = distTo(p, f.x, f.y);
    if (d < s.radius) return s;
  }
  return null;
}

function gradeLanding(f, vspeedFpm, lateral, onRunway) {
  const has = (id) => f.upgrades.indexOf(id) >= 0;
  let grade;
  const absVs = Math.abs(vspeedFpm);
  if (!f.gear || !onRunway) grade = 'Crash';
  else if (absVs <= 160 && Math.abs(lateral) <= 0.05) grade = 'Butter';
  else if (absVs <= 320 && Math.abs(lateral) <= 0.1) grade = 'Smooth';
  else if (absVs <= 600 && Math.abs(lateral) <= 0.2) grade = 'Firm';
  else if (absVs <= 950) grade = 'Hard';
  else grade = 'Crash';
  // Smooth Flaps forgives one grade of flare error.
  if (has('flaps') && grade === 'Hard') grade = 'Firm';
  if (has('flaps') && grade === 'Firm') grade = 'Smooth';
  if (grade === 'Hard' && !has('gear')) f.damage = Math.min(100, f.damage + 12);
  if (grade === 'Crash') f.damage = Math.min(100, f.damage + 30);
  return grade;
}

function finishFlight(f) {
  const stats = effectiveStats(f);
  const avgMood = f.manifest.reduce((s, p) => s + p.moodScore, 0) / Math.max(1, f.manifest.length);
  const landingMult = { Butter: 2, Smooth: 1.5, Firm: 1, Hard: 0.3, Crash: 0 }[f.landingGrade] || 0;
  const seatsMult = f.upgrades.indexOf('seats') >= 0 ? 1.25 : 1;
  for (const p of f.manifest) {
    const base = p.critic ? 420 : TIP_BASE;
    p.tip = Math.round(base * (p.moodScore / 100) * landingMult * seatsMult);
    p.mood = p.moodScore >= 75 ? 'happy' : p.moodScore >= 55 ? 'calm' : p.moodScore >= 35 ? 'nervous' : 'angry';
  }
  const repairCost = Math.min(800, Math.round(f.damage * 8));
  f.result = {
    route: f.route,
    manifest: f.manifest,
    ringsHit: f.ringsHit,
    ringsTotal: f.ringsTotal,
    comboBest: f.comboBest,
    fuelUsed: f.fuelUsed,
    flightTime: f.time,
    onTime: f.time <= f.parTime,
    landingGrade: f.landingGrade,
    repairCost,
    damage: f.damage,
    avgMood,
    parTime: f.parTime,
  };
  f.phase = 'done';
}

// One fixed step of the flight. input: { pitch, roll, throttle, gear, flaps,
// check, autopilot } — pitch/roll are -1..1, throttle is a -1..1 delta, the rest
// are one-shot booleans. dt is seconds.
export function stepFlight(f, input, dt) {
  const stats = effectiveStats(f);
  const has = (id) => f.upgrades.indexOf(id) >= 0;
  f.time += dt;

  if (input.autopilot && has('autopilot')) {
    f.autopilot = !f.autopilot;
    announce(f, f.autopilot ? 'Autopilot engaged — hands off, captain.' : 'Autopilot off — you have the controls.');
  }
  if (input.gear) {
    f.gear = !f.gear;
    announce(f, f.gear ? 'Gear down.' : 'Gear up.');
  }
  if (input.flaps) {
    f.flaps = f.flaps >= 0.5 ? 0 : 1;
    announce(f, f.flaps ? 'Flaps down.' : 'Flaps up.');
  }

  if (f.phase === 'checklist') {
    if (typeof input.check === 'number' && input.check >= 0 && input.check < CHECKS.length) {
      f.checks[input.check] = !f.checks[input.check];
    }
    if (f.checks.every(Boolean)) {
      f.phase = 'takeoff';
      announce(f, 'Checklist complete. Throttle up (W) and hold the centreline — rotate at ' + f.aircraft.vr + ' kt.');
    }
    return f;
  }

  // Smooth the controls toward what the pilot is asking for.
  const targetPitch = clamp(input.pitch || 0, -1, 1);
  const targetRoll = clamp(input.roll || 0, -1, 1);
  f.pitch += (targetPitch - f.pitch) * Math.min(1, dt * 3);
  f.roll += (targetRoll - f.roll) * Math.min(1, dt * 3);

  // Throttle: W/S nudge it; autopilot holds a cruise setting.
  if (f.autopilot) {
    const want = f.phase === 'approach' || f.phase === 'landing' ? 0.25 : 0.72;
    f.throttle += (want - f.throttle) * Math.min(1, dt);
  } else {
    f.throttle = clamp(f.throttle + (input.throttle || 0) * dt * 0.6, 0, 1);
  }

  const onGround = f.altitude <= 0.5 && (f.phase === 'takeoff' || f.phase === 'landing');
  const targetSpeed = f.throttle * stats.maxSpeed * (f.flaps ? 0.82 : 1);
  const accel = onGround ? 9 : 5;
  f.speed += clamp(targetSpeed - f.speed, -accel * dt * 2, accel * dt);

  // Turning: bank rolls the heading; faster flight turns wider.
  const turnRate = f.roll * 14 * stats.handling * clamp(f.speed / 150, 0.35, 1.4);
  f.heading = (f.heading + turnRate * dt + 360) % 360;

  // Vertical speed follows pitch once there is airspeed; on the runway the
  // plane only leaves the ground past rotate speed with the nose up.
  let targetVs = 0;
  if (f.phase === 'takeoff') {
    targetVs = f.speed >= f.aircraft.vr && f.pitch > 0.15 ? f.pitch * stats.climb * 0.8 : 0;
  } else if (f.phase === 'climb' || f.phase === 'cruise' || f.phase === 'descent' || f.phase === 'approach') {
    targetVs = f.pitch * stats.climb * clamp(f.speed / f.aircraft.vr, 0.4, 1);
    if (f.phase === 'cruise') targetVs = clamp(targetVs, -600, 600);
    // Descent and approach always sink a little even hands-off, so a flight can
    // never float forever: the plane lands, well or badly, but it lands.
    if (f.phase === 'descent') targetVs = Math.min(targetVs - 100, 300);
    if (f.phase === 'approach') {
      targetVs = Math.min(targetVs - 200, 300);
      if (f.altitude < 150) targetVs = Math.max(targetVs, -260); // ground effect: the flare arrests the sink, but never floats the plane past the runway
    }
  }
  // Fuel starvation: the engines quit, the plane glides down at -800 fpm.
  if (f.fuel <= 0) {
    targetVs = Math.min(targetVs, -800);
    f.throttle = 0;
  }
  f.vspeed += (targetVs - f.vspeed) * Math.min(1, dt * 1.5);
  f.altitude = Math.max(0, f.altitude + (f.vspeed * dt) / 60);

  // Move over the ground.
  const hRad = (f.heading * Math.PI) / 180;
  const nmPerSec = f.speed / 3600;
  f.x += Math.sin(hRad) * nmPerSec * dt;
  f.y += -Math.cos(hRad) * nmPerSec * dt;

  // Fuel burn grows with the square of the throttle.
  const burn = (stats.burn * f.throttle * f.throttle) / 60;
  f.fuel = Math.max(0, f.fuel - burn * dt);
  f.fuelUsed += burn * dt;

  // Storms: turbulence shakes the plane, hurts it and worries the passengers.
  const storm = stormAt(f);
  f.inStorm = storm !== null;
  if (storm) {
    const jolt = storm.severity * f.world.turbulence;
    f.heading = (f.heading + (f.rand() - 0.5) * jolt * 6 * dt + 360) % 360;
    // Turbulence never slams the plane into the ground: the jolt fades out
    // below 500 ft, where the approach is flown.
    const lowAlt = clamp((f.altitude - 200) / 1000, 0, 1);
    f.altitude = Math.max(0, f.altitude + (f.rand() - 0.5) * jolt * 220 * dt * lowAlt);
    f.shake = Math.min(1, f.shake + jolt * dt * 2);
    f.damage = Math.min(100, f.damage + storm.severity * dt * 0.12);
    for (const p of f.manifest) p.moodScore = Math.max(0, p.moodScore - storm.severity * dt * 1.6);
  } else {
    f.shake = Math.max(0, f.shake - dt * 0.8);
  }
  // Steep banks worry people; smooth level cruise wins them back.
  if (Math.abs(f.roll) > 0.7) {
    for (const p of f.manifest) p.moodScore = Math.max(0, p.moodScore - 0.25 * dt);
  } else if (f.phase === 'cruise' && !storm) {
    for (const p of f.manifest) p.moodScore = Math.min(100, p.moodScore + 0.12 * dt);
  }

  // Rings: the next ring in order, hit inside its radius and altitude band.
  if (f.phase === 'cruise' || f.phase === 'descent') {
    const ring = f.world.rings[f.nextRing];
    if (ring) {
      const p = routePoint(f.route, ring.along, ring.lateral);
      const d = distTo(p, f.x, f.y);
      const alongNow = alongRoute(f.route, f.x, f.y);
      if (d < ring.radius && Math.abs(f.altitude - ring.alt) < 1800) {
        ring.hit = true;
        f.ringsHit += 1;
        f.combo += 1;
        f.comboBest = Math.max(f.comboBest, f.combo);
        f.nextRing += 1;
        for (const pax of f.manifest) pax.moodScore = Math.min(100, pax.moodScore + 2);
        announce(f, `Ring ${ring.index + 1} of ${f.ringsTotal} — combo x${f.combo}!`);
      } else if (alongNow > ring.along + 3) {
        // Flew past it: the combo breaks and the ring is gone.
        f.combo = 0;
        f.nextRing += 1;
        announce(f, `Missed ring ${ring.index + 1} — combo lost.`);
      }
    }
  }

  // Phase transitions.
  if (f.phase === 'takeoff' && f.altitude > 60) {
    f.phase = 'climb';
    announce(f, 'Airborne! Climb to ' + f.cruiseAlt + ' ft and settle into cruise.');
  } else if (f.phase === 'climb' && f.altitude >= f.cruiseAlt - 200) {
    f.phase = 'cruise';
    announce(f, 'Cruise. Fly the golden rings in order — and mind the storms.');
  } else if (f.phase === 'cruise' && alongRoute(f.route, f.x, f.y) >= f.route.dist - 18) {
    f.phase = 'descent';
    announce(f, 'Destination ahead. Descend toward 1,500 ft and set up the approach.');
  } else if (f.phase === 'descent' && f.altitude <= 1800 && alongRoute(f.route, f.x, f.y) >= f.route.dist - 10) {
    f.phase = 'approach';
    announce(f, 'Approach. Gear down (G), flaps (F), line up with the runway and flare gently.');
  }

  // Warnings, fresh each step.
  f.warnings = [];
  if (f.fuel < f.fuelCap * 0.15) f.warnings.push('LOW FUEL');
  if (f.damage >= 60) f.warnings.push('AIRFRAME DAMAGE');
  if (storm) f.warnings.push('IN STORM');
  if (f.phase === 'approach' && !f.gear) f.warnings.push('GEAR UP');
  if (f.phase === 'approach' && f.altitude < 800 && f.flaps < 0.5) f.warnings.push('FLAPS UP');

  // Touchdown: altitude back to zero while airborne phases are running.
  if ((f.phase === 'climb' || f.phase === 'cruise' || f.phase === 'descent' || f.phase === 'approach') && f.altitude <= 0) {
    const alongNow = alongRoute(f.route, f.x, f.y);
    const lateral = lateralOf(f.route, f.x, f.y);
    const nearRunway = Math.abs(alongNow - f.route.dist) < 1.2 && Math.abs(lateral) < 0.35;
    f.touchdown = { vspeed: f.vspeed, lateral, along: alongNow, onRunway: nearRunway };
    f.landingGrade = gradeLanding(f, f.vspeed, lateral, nearRunway);
    f.altitude = 0;
    f.phase = 'landing';
    announce(f, f.landingGrade + ' landing! Rolling out — the passengers are deciding your tip.');
  }

  if (f.phase === 'landing') {
    f.speed = Math.max(0, f.speed - 14 * dt);
    f.vspeed = 0;
    if (f.speed <= 2) {
      finishFlight(f);
    }
  }
  return f;
}

// Jump a fresh flight straight into cruise at a point along the route, with the
// earlier rings already counted. Used by the screenshot stager and by nobody else.
export function placeFlightAt(f, along, altitude, speed) {
  const p = routePoint(f.route, along, 0);
  f.x = p.x;
  f.y = p.y;
  f.heading = f.route.heading;
  f.altitude = altitude;
  f.speed = speed;
  f.throttle = 0.7;
  f.phase = 'cruise';
  f.vspeed = 0;
  for (let i = 0; i < f.world.rings.length; i += 1) {
    if (f.world.rings[i].along < along) {
      f.world.rings[i].hit = true;
      f.ringsHit += 1;
      f.nextRing = i + 1;
    }
  }
  f.combo = 2;
  f.comboBest = 2;
  f.message = 'Cruise. Fly the golden rings in order — and mind the storms.';
  f.messageTime = f.time;
  return f;
}

export function nextRingTarget(f) {
  return f.world.rings[f.nextRing] || null;
}

export function bearingToNext(f) {
  const ring = nextRingTarget(f);
  if (ring) return bearingTo(f.route, f.x, f.y, ring.along, ring.lateral);
  return bearingTo(f.route, f.x, f.y, f.route.dist, 0);
}

export { FUEL_PRICE, LANDING_FEE };
