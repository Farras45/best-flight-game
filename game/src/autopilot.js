// Autopilot for Seven Skies Airline. It flies the same physics the player flies,
// steering toward the next ring, the cruise altitude and finally the runway, and
// it is what stages the screenshot scenes: a shot is a real flight flown by this
// pilot, not a posed picture.
import { bearingToNext, nextRingTarget } from './flight.js';
import { alongRoute, alongRouteRaw, bearingTo, lateralOf, routePoint, distTo } from './world.js';
import { clamp, headingDiff } from './rng.js';

// Returns the input object stepFlight wants for this frame.
export function autopilotInput(f) {
  const input = { pitch: 0, roll: 0, throttle: 0, gear: false, flaps: false, check: null, autopilot: false };

  if (f.phase === 'checklist') {
    for (let i = 0; i < f.checks.length; i += 1) {
      if (!f.checks[i]) {
        input.check = i;
        return input;
      }
    }
    return input;
  }

  if (f.phase === 'takeoff') {
    input.throttle = 1;
    input.pitch = f.speed >= f.aircraft.vr ? 0.55 : 0;
    return input;
  }

  if (f.phase === 'landing') {
    input.throttle = -1;
    return input;
  }

  // Where are we trying to go?
  let targetBearing;
  let targetAlt;
  if (f.phase === 'descent') {
    // The cruise is over: stop chasing rings and fly the centreline home.
    // Pure pursuit on a point 6 nm ahead on the centreline straightens the
    // descent instead of snaking after the threshold.
    const alongNow = alongRouteRaw(f.route, f.x, f.y);
    targetBearing = bearingTo(f.route, f.x, f.y, alongNow + 6, 0);
    targetAlt = 1600;
    input.throttle = f.speed > 180 ? -0.6 : f.speed < 150 ? 0.5 : 0;
  } else if (f.phase === 'approach') {
    // Pure pursuit on a point 3 nm ahead on the centreline: steering at the
    // threshold itself goes unstable the moment you fly over it, and aiming
    // at a fixed far point corrects a lateral error far too slowly.
    const lat = lateralOf(f.route, f.x, f.y);
    const alongNow = alongRouteRaw(f.route, f.x, f.y);
    targetBearing = bearingTo(f.route, f.x, f.y, alongNow + 3, 0);
    // Aim the glidepath at a point just short of the threshold, so the flare
    // puts the wheels in the touchdown zone instead of floating past it.
    targetAlt = Math.max(0, (f.route.dist - alongRoute(f.route, f.x, f.y) - 0.3) * 200);
    if (f.altitude < 1200 && f.gear === false) input.gear = true;
    if (f.altitude < 900 && f.flaps < 0.5) input.flaps = true;
    input.throttle = f.speed > 150 ? -0.6 : f.speed < 110 ? 0.5 : 0;
  } else {
    targetBearing = bearingToNext(f);
    const ring = nextRingTarget(f);
    if (f.phase === 'climb') targetAlt = f.cruiseAlt;
    else if (f.phase === 'descent') targetAlt = 1600;
    else targetAlt = ring ? ring.alt : f.cruiseAlt;
    const wantSpeed = f.phase === 'descent' ? 180 : f.aircraft.maxSpeed * 0.72;
    input.throttle = f.speed < wantSpeed - 8 ? 0.7 : f.speed > wantSpeed + 8 ? -0.7 : 0;
  }

  // Steer: bank toward the bearing error, capped so the passengers stay calm.
  const err = headingDiff(f.heading, targetBearing);
  input.roll = clamp(err / 28, -0.6, 0.6);
  // Pitch: climb or descend toward the target altitude, gently near the ground.
  const altErr = targetAlt - f.altitude;
  let pitchWant = clamp(altErr / 1400, -0.7, 0.7);
  if (f.phase === 'approach') {
    pitchWant = clamp(altErr / 500, -0.45, 0.3);
  }
  input.pitch = pitchWant;

  // Dodge storms: if the next ring's line crosses a cell, sidestep around it,
  // and if already inside one, turn away from its centre.
  for (const s of f.world.storms) {
    const p = routePoint(f.route, s.along, s.lateral);
    const d = distTo(p, f.x, f.y);
    if (d < s.radius + 4 && f.altitude > 800) {
      const side = lateralOf(f.route, f.x, f.y) > s.lateral ? 1 : -1;
      input.roll = clamp(input.roll + side * 0.7, -0.9, 0.9);
    }
  }
  return input;
}
