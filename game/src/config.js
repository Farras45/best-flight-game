// Seven Skies Airline — the world: routes, aircraft, upgrades, passengers, career.
// Everything a flight, a day or the hangar needs to know lives here, in one place,
// so the flight sim, the map screen and the shop can never disagree about a number.

export const GAME_TITLE = 'Seven Skies Airline';
export const GAME_SUBTITLE = 'Meridian Air — fly the archipelago, keep the passengers smiling';
export const CANVAS_W = 1280;
export const CANVAS_H = 720;
export const DAYS_IN_CAREER = 7;
export const FLIGHTS_PER_DAY = 3;
export const START_CASH = 1500;

// Profit a day must clear to unlock the next one. Day 7 has no target: it is the
// finale, judged on the critic's verdict and the career total instead.
export const DAY_GOALS = [900, 1500, 2200, 3000, 3900, 5000, 0];

// Six routes across the Meridian archipelago. dist is nautical miles, fare is the
// base ticket price per seat, storms is how many storm cells the leg usually grows.
export const ROUTES = [
  { id: 'coral-turtle', from: 'Coral Bay', to: 'Turtle Island', dist: 42, fare: 95, difficulty: 1, terrain: 'islands', seed: 11, heading: 48, sky: 'dawn' },
  { id: 'coral-palm', from: 'Coral Bay', to: 'Palm Ridge', dist: 68, fare: 140, difficulty: 1, terrain: 'coast', seed: 23, heading: 118, sky: 'noon' },
  { id: 'palm-volcano', from: 'Palm Ridge', to: 'Volcano Peak', dist: 96, fare: 190, difficulty: 2, terrain: 'volcano', seed: 37, heading: 205, sky: 'dusk' },
  { id: 'turtle-harbor', from: 'Turtle Island', to: 'Harbor City', dist: 124, fare: 240, difficulty: 2, terrain: 'city', seed: 51, heading: 292, sky: 'noon' },
  { id: 'harbor-glacier', from: 'Harbor City', to: 'Glacier Bay', dist: 168, fare: 320, difficulty: 3, terrain: 'glacier', seed: 67, heading: 18, sky: 'dawn' },
  { id: 'glacier-coral', from: 'Glacier Bay', to: 'Coral Bay', dist: 210, fare: 410, difficulty: 3, terrain: 'jungle', seed: 83, heading: 152, sky: 'storm' },
];

// Routes open as the career goes on: day 1 flies the two island hops, the long
// hauls unlock once the airline has proven it can land a plane on time.
export const ROUTE_UNLOCK_DAY = { 'coral-turtle': 1, 'coral-palm': 1, 'palm-volcano': 2, 'turtle-harbor': 3, 'harbor-glacier': 5, 'glacier-coral': 6 };

// Four aircraft. seats is how many passengers a manifest can hold, vr is the
// rotate speed in knots, burn is kg of fuel per minute at full throttle.
export const AIRCRAFT = [
  { id: 'puffin', name: 'Puffin PT-6', kind: 'prop', cost: 0, seats: 4, maxSpeed: 210, climb: 1400, fuelCap: 420, vr: 78, handling: 1.0, burn: 4.5, color: '#e8a13a', unlockDay: 1 },
  { id: 'kestrel', name: 'Kestrel K-200', kind: 'turboprop', cost: 2600, seats: 6, maxSpeed: 290, climb: 2100, fuelCap: 640, vr: 96, handling: 1.15, burn: 6.5, color: '#3a9be8', unlockDay: 2 },
  { id: 'meridian', name: 'Meridian MJ-9', kind: 'regional jet', cost: 7200, seats: 9, maxSpeed: 430, climb: 3400, fuelCap: 980, vr: 128, handling: 1.3, burn: 10, color: '#c94f6d', unlockDay: 4 },
  { id: 'albatross', name: 'Albatross AB-1', kind: 'widebody', cost: 16000, seats: 14, maxSpeed: 510, climb: 4200, fuelCap: 1500, vr: 148, handling: 1.45, burn: 15, color: '#7a5fd0', unlockDay: 6 },
];

// Eight hangar upgrades. Every one changes how a flight actually flies or pays;
// none of them is a decoration, and cash always has something to buy.
export const UPGRADES = [
  { id: 'tank', name: 'Aux Fuel Tank', cost: 900, desc: '+40% fuel capacity — long hauls stop being a gamble.' },
  { id: 'engines', name: 'Turbo Engines', cost: 1400, desc: '+25% climb and top speed — shorter legs, earlier arrivals.' },
  { id: 'radar', name: 'Weather Radar', cost: 1100, desc: 'Storm cells show on the map and ring in early — dodge them, don\'t eat them.' },
  { id: 'autopilot', name: 'Autopilot', cost: 1800, desc: 'Hold H to lock heading and altitude hands-free while you plan the next leg.' },
  { id: 'seats', name: 'Comfy Seats', cost: 800, desc: '+25% tips — passengers remember a soft seat more than a fast one.' },
  { id: 'winglets', name: 'Winglets', cost: 1000, desc: '-20% fuel burn — every litre saved is a litre of profit.' },
  { id: 'gear', name: 'Reinforced Gear', cost: 1200, desc: 'Firm landings stop costing repairs — the gear forgives what the runway doesn\'t.' },
  { id: 'flaps', name: 'Smooth Flaps', cost: 700, desc: '+1 landing grade — the flare feels like the plane is helping you.' },
];

// Named passengers. Each one boards with a mood and a quirk; the mood moves with
// how the flight is flown, and the tip at the end is the mood, priced.
export const PASSENGERS = [
  { name: 'Mira Chen', quirk: 'honeymoon, first flight together', mood: 'excited' },
  { name: 'Pak Dedi', quirk: 'durian merchant, hates delays', mood: 'impatient' },
  { name: 'Grandma Lin', quirk: 'first flight at 81, window seat', mood: 'calm' },
  { name: 'Rafi Anwar', quirk: 'surfboards in the hold, always late', mood: 'excited' },
  { name: 'Sofia Marek', quirk: 'cellist, her instrument flies cabin', mood: 'nervous' },
  { name: 'Capt. Budi', quirk: 'retired pilot, grades your landings', mood: 'calm' },
  { name: 'Lena Ortiz', quirk: 'travel writer, notebook always open', mood: 'curious' },
  { name: 'Tommy Wu', quirk: 'eight years old, wants the cockpit', mood: 'excited' },
  { name: 'Dr. Amara', quirk: 'flying to a clinic, on call', mood: 'impatient' },
  { name: 'Yuki Tanaka', quirk: 'photographer, chases the sunset', mood: 'curious' },
  { name: 'Omar Haddad', quirk: 'spice trader, 40kg of cardamom', mood: 'calm' },
  { name: 'Nina Petrova', quirk: 'aerial acrobat, unimpressed by turbulence', mood: 'calm' },
  { name: 'Felix Grant', quirk: 'wedding in two hours, suit in a bag', mood: 'nervous' },
  { name: 'Ayu Lestari', quirk: 'island nurse, knows every regular', mood: 'calm' },
  { name: 'Marco Silva', quirk: 'chef, judges the cabin snacks', mood: 'impatient' },
  { name: 'Hana Sato', quirk: 'astronomy student, counts stars', mood: 'curious' },
  { name: 'Igor Volkov', quirk: 'mountaineer, carries his own oxygen', mood: 'calm' },
  { name: 'Priya Nair', quirk: 'honeymoon planner, 200 guests waiting', mood: 'nervous' },
  { name: 'Jonas Berg', quirk: 'glacier guide, never cold', mood: 'calm' },
  { name: 'Clara Dubois', quirk: 'perfumer, can smell a storm coming', mood: 'curious' },
  { name: 'Sam Okafor', quirk: 'drummer, taps the armrest in 7/8', mood: 'excited' },
  { name: 'Elif Demir', quirk: 'cartographer, redraws the coast', mood: 'curious' },
  { name: 'Leo Fontaine', quirk: 'kite maker, tests wind on board', mood: 'excited' },
  { name: 'Rosa Mendes', quirk: 'beekeepers\' daughter, 12 hives at home', mood: 'calm' },
];

// The Sky Critic rides the day-7 finale. Her verdict is worth more than any fare.
export const CRITIC = { name: 'Inspector Wulandari', quirk: 'the Sky Critic — one star can ground an airline', mood: 'stern' };

export const MOOD_COLORS = { excited: '#ffd166', calm: '#7ee081', nervous: '#f4a259', impatient: '#ef476f', curious: '#8ecae6', stern: '#c77dff', happy: '#7ee081', angry: '#ef476f' };
export const MOOD_LABELS = { excited: 'Excited', calm: 'Calm', nervous: 'Nervous', impatient: 'Impatient', curious: 'Curious', stern: 'Stern', happy: 'Happy', angry: 'Angry' };

export const FUEL_PRICE = 2; // cash per kg of fuel burned
export const LANDING_FEE = { 1: 60, 2: 90, 3: 140 };
export const TIP_BASE = 30;
export const RING_BONUS = 25;
export const ON_TIME_BONUS = 120;
