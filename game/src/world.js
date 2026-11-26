// The world a flight flies through: the route's rings, storm cells, runway and
// weather. Everything is derived from the route seed, so the same route always
// flies the same sky and a staged screenshot is reproducible.
import { clamp, headingDiff, mulberry32 } from './rng.js';

export const NM_TO_FT = 6076;

// A ring sits a few miles off the direct line so the pilot has to steer, not just
// hold the throttle. Rings are the cruise phase's whole job: hit them in order.
function buildRings(route, rand) {
  const count = 5 + route.difficulty * 2; // 7, 9 or 11 rings
  const rings = [];
  for (let i = 0; i < count; i += 1) {
    const along = (route.dist * (i + 1)) / (count + 1);
    const lateral = (rand() - 0.5) * 6 * route.difficulty;
    const alt = 2500 + rand() * 6500;
    rings.push({
      index: i,
      along,
      lateral,
      alt,
      radius: 0.9, // nautical miles — generous at low speed, tight at jet speed
      hit: false,
    });
  }
  return rings;
}

function buildStorms(route, rand) {
  const count = route.difficulty + 1; // 2..4 cells
  const storms = [];
  for (let i = 0; i < count; i += 1) {
    storms.push({
      along: route.dist * (0.25 + rand() * 0.6),
      lateral: (rand() - 0.5) * 20,
      radius: 2.5 + rand() * 2.5,
      severity: 0.5 + rand() * 0.5,
      seed: Math.floor(rand() * 100000),
    });
  }
  return storms;
}

export function buildWorld(route, seed) {
  const rand = mulberry32(seed * 104729 + route.seed * 31 + 7);
  const rings = buildRings(route, rand);
  const storms = buildStorms(route, rand);
  // The destination runway sits at the end of the route, on the route heading.
  const runway = { along: route.dist, lateral: 0, heading: route.heading, length: 1.1, width: 0.06 };
  return {
    route,
    rings,
    storms,
    runway,
    // Cloud base and ceiling for this leg's sky.
    cloudBase: 3500 + rand() * 2500,
    cloudTop: 9000 + rand() * 3000,
    wind: (rand() - 0.5) * 24, // knots of crosswind on the landing
    turbulence: 0.2 + rand() * 0.5,
  };
}

// World position of a point given how far along the route it is and how far off
// the centreline, in nautical miles. The route is a straight great-circle-ish line
// on the route heading; lateral is measured 90 degrees to the right of it.
export function routePoint(route, along, lateral) {
  const h = (route.heading * Math.PI) / 180;
  return {
    x: Math.sin(h) * along + Math.cos(h) * lateral,
    y: -Math.cos(h) * along + Math.sin(h) * lateral,
  };
}

export function ringPoint(world, ring) {
  return routePoint(world.route, ring.along, ring.lateral);
}

export function runwayPoint(world) {
  return routePoint(world.route, world.runway.along, world.runway.lateral);
}

// Distance in nautical miles from a world position to a route point.
export function distTo(point, x, y) {
  const dx = point.x - x;
  const dy = point.y - y;
  return Math.sqrt(dx * dx + dy * dy);
}

// How far along the route the nearest point to (x, y) is, for progress display.
export function alongRoute(route, x, y) {
  const h = (route.heading * Math.PI) / 180;
  return clamp(Math.sin(h) * x - Math.cos(h) * y, 0, route.dist);
}

// The same distance, unclamped: steering lookaheads must use this, because a
// clamped value freezes at the runway and the aim point then falls behind the
// plane, flipping the bearing and turning it at 60 feet.
export function alongRouteRaw(route, x, y) {
  const h = (route.heading * Math.PI) / 180;
  return Math.sin(h) * x - Math.cos(h) * y;
}

export function lateralOf(route, x, y) {
  const h = (route.heading * Math.PI) / 180;
  return Math.cos(h) * x + Math.sin(h) * y;
}

// The bearing the pilot should fly to reach a route point from where they are.
export function bearingTo(route, x, y, along, lateral) {
  const target = routePoint(route, along, lateral);
  const dx = target.x - x;
  const dy = target.y - y;
  const angle = (Math.atan2(dx, -dy) * 180) / Math.PI;
  return (angle + 360) % 360;
}

export { headingDiff };
