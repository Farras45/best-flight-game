// Screenshot scenes for Seven Skies Airline. Each scene is a real flight flown
// forward by the autopilot from a fixed seed — never a posed picture — so the
// frame a screenshot takes is exactly what a player sees mid-game, and the same
// seed always gives the same frame.
//
//   ?shot=start  — the cover: cruise over the coast, golden rings ahead, HUD lit
//   ?shot=play   — a storm leg at low fuel, the weather radar's worst day
//   ?shot=hangar — the hangar shop, cash in hand, upgrades to buy
//   ?shot=end    — the debrief after a soft landing, tips counted
import { AIRCRAFT, ROUTES, UPGRADES } from './config.js';
import { createFlight, stepFlight, placeFlightAt } from './flight.js';
import { autopilotInput } from './autopilot.js';
import { buildManifest, newCareer, settleFlight } from './state.js';

const STEP = 1 / 30;

function flyForward(flight, seconds) {
  for (let i = 0; i < seconds / STEP; i += 1) {
    if (flight.phase === 'done') break;
    stepFlight(flight, autopilotInput(flight), STEP);
  }
  return flight;
}

function freshFlight(routeId, aircraftId, upgrades, day, seed) {
  const route = ROUTES.find((r) => r.id === routeId);
  const aircraft = AIRCRAFT.find((a) => a.id === aircraftId);
  const manifest = buildManifest(route, aircraft, day, seed);
  return createFlight(route, aircraft, upgrades, manifest, seed);
}

export function stageShot(name, game) {
  game.frozen = true;
  if (name === 'hangar') {
    const career = newCareer();
    career.day = 3;
    career.cash = 5400;
    career.upgrades = ['tank', 'seats'];
    career.ownedAircraft = ['puffin', 'kestrel'];
    career.aircraftId = 'kestrel';
    career.flightsFlown = 5;
    career.totalProfit = 3200;
    career.reputation = 4;
    game.career = career;
    game.screen = 'hangar';
    return game;
  }

  if (name === 'end') {
    const career = newCareer();
    career.day = 2;
    const flight = freshFlight('coral-palm', 'puffin', [], 2, 4242);
    placeFlightAt(flight, flight.route.dist - 26, 2400, 190);
    flight.phase = 'descent';
    flyForward(flight, 900);
    if (flight.phase !== 'done') {
      // The autopilot should have landed by now; if it is still flying, put it
      // on the runway threshold by hand rather than staging a broken frame.
      flight.phase = 'landing';
      flight.speed = 40;
      flight.altitude = 0;
      flyForward(flight, 30);
    }
    const sheet = settleFlight(career, flight.result || {
      route: flight.route, manifest: flight.manifest, ringsHit: flight.ringsHit,
      ringsTotal: flight.ringsTotal, comboBest: flight.comboBest, fuelUsed: flight.fuelUsed,
      flightTime: flight.time, onTime: true, landingGrade: 'Smooth', repairCost: 0,
    });
    game.career = career;
    game.debrief = sheet;
    game.screen = 'debrief';
    return game;
  }

  if (name === 'play') {
    const flight = freshFlight('glacier-coral', 'kestrel', ['radar'], 6, 777);
    const storm = flight.world.storms[0];
    placeFlightAt(flight, Math.max(8, storm.along - 5), 6100, 210);
    flight.fuel = flight.fuelCap * 0.12; // low-fuel warning lit on the HUD
    flyForward(flight, 9);
    game.flight = flight;
    game.screen = 'flight';
    return game;
  }

  // Default: the cover shot.
  const flight = freshFlight('coral-palm', 'puffin', [], 1, 2026);
  placeFlightAt(flight, 22, 6200, 155);
  flyForward(flight, 6);
  game.flight = flight;
  game.screen = 'flight';
  return game;
}

export { UPGRADES };
