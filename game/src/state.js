// Career state for Seven Skies Airline: cash, reputation, fleet, upgrades, days.
// Pure data and pure functions — no DOM, no canvas — so the economy can be tested
// headless and the render layer can never corrupt a number.
import {
  AIRCRAFT, CRITIC, DAYS_IN_CAREER, DAY_GOALS, FLIGHTS_PER_DAY, LANDING_FEE,
  ON_TIME_BONUS, PASSENGERS, RING_BONUS, ROUTES, ROUTE_UNLOCK_DAY, START_CASH,
  TIP_BASE, UPGRADES, FUEL_PRICE,
} from './config.js';
import { mulberry32, pick, shuffle } from './rng.js';

export function newCareer() {
  return {
    day: 1,
    cash: START_CASH,
    reputation: 3, // stars, 0..5, in half-star steps
    aircraftId: 'puffin',
    ownedAircraft: ['puffin'],
    upgrades: [],
    flightsFlown: 0,
    totalProfit: 0,
    totalTips: 0,
    totalRings: 0,
    landings: [], // landing grades, best to worst, for the career summary
    dayProfit: 0,
    dayFlightsDone: 0,
    criticVerdict: null,
    log: [],
  };
}

export function aircraftOf(career) {
  return AIRCRAFT.find((a) => a.id === career.aircraftId);
}

export function hasUpgrade(career, id) {
  return career.upgrades.indexOf(id) >= 0;
}

export function unlockedRoutes(career) {
  return ROUTES.filter((r) => ROUTE_UNLOCK_DAY[r.id] <= career.day);
}

export function buyableAircraft(career) {
  return AIRCRAFT.filter((a) => a.unlockDay <= career.day && career.ownedAircraft.indexOf(a.id) < 0);
}

export function upgradeById(id) {
  return UPGRADES.find((u) => u.id === id);
}

export function buyUpgrade(career, id) {
  const up = upgradeById(id);
  if (!up || hasUpgrade(career, id) || career.cash < up.cost) return false;
  career.cash -= up.cost;
  career.upgrades.push(id);
  career.log.push(`Bought ${up.name} for $${up.cost}.`);
  return true;
}

export function buyAircraft(career, id) {
  const plane = AIRCRAFT.find((a) => a.id === id);
  if (!plane || career.ownedAircraft.indexOf(id) >= 0 || career.cash < plane.cost) return false;
  career.cash -= plane.cost;
  career.ownedAircraft.push(id);
  career.aircraftId = id;
  career.log.push(`Bought the ${plane.name} for $${plane.cost}.`);
  return true;
}

// Build a manifest: as many named passengers as the aircraft has seats, each with
// a mood and a fare. The day-7 finale always seats the Sky Critic as well.
export function buildManifest(route, aircraft, day, seed) {
  const rand = mulberry32(seed * 7919 + day * 131 + route.seed);
  const pool = shuffle(rand, PASSENGERS);
  // Bigger aircraft carry more passengers: 3 up to the full seat count.
  const count = Math.min(aircraft.seats, 3 + Math.floor(rand() * Math.max(1, aircraft.seats - 2)));
  const manifest = [];
  for (let i = 0; i < count; i += 1) {
    const p = pool[i];
    manifest.push({
      name: p.name,
      quirk: p.quirk,
      mood: p.mood,
      fare: route.fare,
      tip: 0,
      moodScore: p.mood === 'calm' || p.mood === 'excited' ? 70 : 55,
    });
  }
  if (day >= DAYS_IN_CAREER) {
    manifest.push({ name: CRITIC.name, quirk: CRITIC.quirk, mood: 'stern', fare: route.fare * 2, tip: 0, moodScore: 45, critic: true });
  }
  return manifest;
}

// Three flight offers for a day: routes that are unlocked, shuffled by seed.
export function dayOffers(career) {
  const rand = mulberry32(4000 + career.day * 977);
  const routes = shuffle(rand, unlockedRoutes(career));
  const offers = [];
  for (let i = 0; i < FLIGHTS_PER_DAY; i += 1) {
    const route = routes[i % routes.length];
    offers.push({
      route,
      manifest: buildManifest(route, aircraftOf(career), career.day, 900 + career.day * 17 + i * 31),
    });
  }
  return offers;
}

// Settle a finished flight into the career: fares, tips, bonuses, fuel, fees and
// repairs, then reputation. Returns the debrief sheet the summary screen shows.
export function settleFlight(career, result) {
  const route = result.route;
  const fares = result.manifest.reduce((sum, p) => sum + p.fare, 0);
  const tips = result.manifest.reduce((sum, p) => sum + p.tip, 0);
  const rings = result.ringsHit * RING_BONUS * result.comboBest;
  const onTime = result.onTime ? ON_TIME_BONUS : 0;
  const fuelCost = Math.round(result.fuelUsed * FUEL_PRICE);
  const landingFee = LANDING_FEE[route.difficulty];
  const repair = result.repairCost;
  const revenue = fares + tips + rings + onTime;
  const costs = fuelCost + landingFee + repair;
  const profit = revenue - costs;

  career.cash += profit;
  career.dayProfit += profit;
  career.totalProfit += profit;
  career.totalTips += tips;
  career.totalRings += result.ringsHit;
  career.flightsFlown += 1;
  career.dayFlightsDone += 1;
  career.landings.push(result.landingGrade);

  // Reputation moves on the landing and the passengers' mood at touchdown.
  const avgMood = result.manifest.reduce((s, p) => s + p.moodScore, 0) / Math.max(1, result.manifest.length);
  let repDelta = 0;
  if (result.landingGrade === 'Butter') repDelta = 0.5;
  else if (result.landingGrade === 'Smooth') repDelta = 0.25;
  else if (result.landingGrade === 'Firm') repDelta = 0;
  else if (result.landingGrade === 'Hard') repDelta = -0.25;
  else repDelta = -0.5;
  if (avgMood >= 75) repDelta += 0.25;
  if (avgMood < 45) repDelta -= 0.25;
  career.reputation = Math.max(0, Math.min(5, career.reputation + repDelta));

  const critic = result.manifest.find((p) => p.critic);
  if (critic) {
    career.criticVerdict = avgMood >= 70 ? 'FIVE STARS — the critic will write about Meridian Air for a year.' : avgMood >= 55 ? 'Three stars — "a solid little airline, if it keeps its landings soft."' : 'ONE STAR — the critic\'s column calls the landing "a controlled collision".';
  }

  const sheet = {
    route, fares, tips, rings, onTime, fuelCost, landingFee, repair,
    revenue, costs, profit, landingGrade: result.landingGrade, repDelta,
    reputation: career.reputation, cash: career.cash, manifest: result.manifest,
    ringsHit: result.ringsHit, ringsTotal: result.ringsTotal, comboBest: result.comboBest,
    flightTime: result.flightTime, onTimeResult: result.onTime,
  };
  career.log.push(`Day ${career.day}: ${route.from} → ${route.to}, ${result.landingGrade} landing, profit $${profit}.`);
  return sheet;
}

export function dayGoalMet(career) {
  return DAY_GOALS[career.day - 1] === 0 || career.dayProfit >= DAY_GOALS[career.day - 1];
}

export function advanceDay(career) {
  career.day += 1;
  career.dayProfit = 0;
  career.dayFlightsDone = 0;
}

export function careerFinished(career) {
  return career.day > DAYS_IN_CAREER;
}

// Captain rank from the career total: the summary screen's verdict.
export function captainRank(career) {
  const p = career.totalProfit;
  if (p >= 12000 && career.reputation >= 4.5) return 'Sky Captain — the archipelago\'s finest';
  if (p >= 8000) return 'Senior Captain';
  if (p >= 4500) return 'First Officer, rising fast';
  if (p >= 1500) return 'Licensed Pilot';
  if (p >= 0) return 'Probationary Pilot';
  return 'Grounded — the accountants have questions';
}

export { pick };
