// Seven Skies Airline — bootstrap, game loop and screens. This file owns the
// screen machine (title → map → flight → debrief → hangar → career) and nothing
// else: the flight sim, the career economy, the rendering and the sound each live
// in their own file.
import { AIRCRAFT, CANVAS_H, CANVAS_W, DAYS_IN_CAREER, UPGRADES } from './config.js';
import { createFlight, stepFlight } from './flight.js';
import { autopilotInput } from './autopilot.js';
import { createAudio } from './audio.js';
import { consumePressed, createInput, endFrame, flightControls } from './input.js';
import { drawGame } from './render.js';
import { stageShot } from './shots.js';
import {
  advanceDay, aircraftOf, buyAircraft, buyUpgrade, captainRank, careerFinished,
  dayGoalMet, dayOffers, newCareer, settleFlight,
} from './state.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const input = createInput(canvas);
const audio = createAudio();
const ui = { buttons: [], mouseX: 0, mouseY: 0 };
const statusEl = document.getElementById('status');

const game = {
  screen: 'title',
  career: newCareer(),
  offers: [],
  flight: null,
  debrief: null,
  rankText: '',
  aircraftName: 'Puffin PT-6',
  aircraftList: AIRCRAFT,
  upgradeList: UPGRADES,
  input,
  audio,
  paused: false,
  frozen: false,
  lastRings: 0,
  lastPhase: '',
};

function refreshOffers() {
  game.offers = dayOffers(game.career);
  game.aircraftName = aircraftOf(game.career).name;
}

refreshOffers();

function startFlight(offerIndex) {
  const offer = game.offers[offerIndex];
  if (!offer) return;
  const career = game.career;
  game.flight = createFlight(offer.route, aircraftOf(career), career.upgrades, offer.manifest, 1000 + career.day * 137 + offerIndex * 61);
  game.lastRings = 0;
  game.lastPhase = 'checklist';
  game.screen = 'flight';
  game.paused = false;
  audio.ensure();
  audio.click();
  statusEl.textContent = 'Flying ' + offer.route.from + ' to ' + offer.route.to + '. Complete the checklist, then take off.';
}

function clickButton(id) {
  const career = game.career;
  if (id === 'start-fly' || id === 'to-title') {
    if (id === 'start-fly') {
      refreshOffers();
      game.screen = 'map';
    } else game.screen = 'title';
  } else if (id === 'to-hangar') {
    game.screen = 'hangar';
  } else if (id === 'back-map') {
    game.screen = 'map';
  } else if (id.indexOf('offer-') === 0) {
    startFlight(parseInt(id.slice(6), 10));
  } else if (id.indexOf('buy-aircraft-') === 0) {
    buyAircraft(career, id.slice(13));
    refreshOffers();
  } else if (id.indexOf('select-aircraft-') === 0) {
    career.aircraftId = id.slice(16);
    refreshOffers();
  } else if (id.indexOf('buy-upgrade-') === 0) {
    buyUpgrade(career, id.slice(12));
  } else if (id === 'next-flight') {
    refreshOffers();
    game.screen = 'map';
  } else if (id === 'next-day') {
    if (career.day >= DAYS_IN_CAREER) {
      game.rankText = captainRank(career);
      game.screen = 'career';
    } else {
      advanceDay(career);
      refreshOffers();
      game.screen = 'map';
    }
  } else if (id === 'restart') {
    game.career = newCareer();
    refreshOffers();
    game.screen = 'title';
  }
  audio.click();
}

function handleClick() {
  if (!input.clicked) return;
  const { x, y } = input.clicked;
  // The pre-flight checklist is clicked by its lines, not by a button.
  if (game.screen === 'flight' && game.flight && game.flight.phase === 'checklist') {
    for (let i = 0; i < 5; i += 1) {
      if (x >= 380 && x <= 940 && y >= 222 + i * 36 && y <= 258 + i * 36) {
        game.flight.checks[i] = !game.flight.checks[i];
        if (game.flight.checks.every(Boolean)) {
          game.flight.phase = 'takeoff';
          game.flight.message = 'Checklist complete. Throttle up (W) and hold the centreline.';
        }
        audio.click();
        return;
      }
    }
  }
  for (const b of ui.buttons) {
    if (!b.disabled && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
      clickButton(b.id);
      return;
    }
  }
}

function handleKeys() {
  if (consumePressed(input, 'm')) {
    audio.ensure();
    audio.setMuted(!audio.muted);
  }
  if (game.screen === 'title') {
    if (consumePressed(input, 'Enter') || consumePressed(input, 'Space')) {
      refreshOffers();
      game.screen = 'map';
      audio.ensure();
    }
    return;
  }
  if (game.screen === 'map') {
    for (let i = 0; i < 3; i += 1) {
      if (consumePressed(input, String(i + 1))) startFlight(i);
    }
    if (consumePressed(input, 'h')) game.screen = 'hangar';
    return;
  }
  if (game.screen === 'hangar') {
    if (consumePressed(input, 'Escape') || consumePressed(input, 'Enter')) game.screen = 'map';
    return;
  }
  if (game.screen === 'debrief') {
    if (consumePressed(input, 'Enter')) clickButton(game.career.dayFlightsDone >= 3 ? 'next-day' : 'next-flight');
    return;
  }
  if (game.screen === 'career') {
    if (consumePressed(input, 'r') || consumePressed(input, 'Enter')) clickButton('restart');
    return;
  }
  if (game.screen === 'flight') {
    if (consumePressed(input, 'p')) game.paused = !game.paused;
    if (consumePressed(input, 'Escape')) {
      // Abandoning a flight wastes the slot: the passengers rebook elsewhere.
      game.career.dayFlightsDone += 1;
      game.career.log.push('Day ' + game.career.day + ': flight abandoned on the ground.');
      game.flight = null;
      refreshOffers();
      game.screen = 'map';
    }
  }
}

function stepGame(dt) {
  handleKeys();
  handleClick();
  if (game.screen === 'flight' && game.flight && !game.paused) {
    const f = game.flight;
    // H turns the autopilot off directly: while it is on, flightControls is
    // never read, so this is the only place the key can be caught.
    if (f.autopilot && consumePressed(input, 'h')) {
      f.autopilot = false;
      f.message = 'Autopilot off — you have the controls.';
    }
    const controls = f.autopilot ? autopilotInput(f) : flightControls(input);
    const ringsBefore = f.ringsHit;
    const phaseBefore = f.phase;
    stepFlight(f, controls, dt);
    audio.setFlight(f.throttle, f.speed, f.inStorm);
    if (f.ringsHit > ringsBefore) audio.ring();
    if (phaseBefore !== 'landing' && f.phase === 'landing') audio.thud();
    if (phaseBefore !== 'done' && f.phase === 'done') {
      audio.chime();
      game.debrief = settleFlight(game.career, f.result);
      game.flight = null;
      game.screen = 'debrief';
      statusEl.textContent = 'Landed: ' + game.debrief.landingGrade + ' landing, profit $' + game.debrief.profit + '.';
    }
    if (f.warnings.length && Math.floor(f.time) % 5 === 0 && Math.floor(f.time * 10) % 10 === 0) audio.warn();
  }
  endFrame(input);
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!game.frozen) stepGame(dt);
  else {
    handleClick();
    endFrame(input);
  }
  drawGame(ctx, game, ui);
  requestAnimationFrame(loop);
}

// Screenshot mode: ?shot=start|play|hangar|end stages a frozen, deterministic
// frame of the real game. The loop still draws, but the sim never advances.
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
if (shot) {
  stageShot(shot, game);
  game.aircraftName = aircraftOf(game.career).name;
} else {
  statusEl.textContent = 'Seven Skies Airline. Press Enter or click to fly.';
}
requestAnimationFrame(loop);
