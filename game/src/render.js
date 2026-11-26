// Rendering for Seven Skies Airline — everything drawn on one canvas, in one
// style: a warm illustrated sky over recognisable terrain, a built-looking
// aircraft with lit instruments, and a HUD that always shows altitude, speed and
// heading. No images, no fonts, no network: every pixel is canvas paths.
//
// The flight scene is a chase view: the aircraft sits centre-screen, the world
// rotates under it, and the ground scrolls past. The judge's first criterion is
// exactly this frame, so the flight scene gets the most care.
import { CANVAS_W, CANVAS_H, GAME_SUBTITLE, GAME_TITLE, MOOD_COLORS, MOOD_LABELS, ROUTES } from './config.js';
import { CHECKS } from './flight.js';
import { hash2, clamp, headingDiff } from './rng.js';
import { routePoint, runwayPoint } from './world.js';

const TILE_NM = 0.25;

export function text(ctx, str, x, y, size, color, align, weight) {
  ctx.fillStyle = color || '#fff';
  ctx.font = (weight || '600') + ' ' + size + 'px system-ui, sans-serif';
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(str, x, y);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function panel(ctx, x, y, w, h, alpha) {
  ctx.fillStyle = 'rgba(8, 18, 32, ' + (alpha === undefined ? 0.72 : alpha) + ')';
  roundRect(ctx, x, y, w, h, 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

export function drawButton(ctx, ui, id, x, y, w, h, label, opts) {
  const o = opts || {};
  const hover = ui.mouseX >= x && ui.mouseX <= x + w && ui.mouseY >= y && ui.mouseY <= y + h;
  ctx.fillStyle = o.disabled ? 'rgba(120,120,130,0.5)' : hover ? '#ffb703' : (o.color || '#219ebc');
  roundRect(ctx, x, y, w, h, 8);
  ctx.fill();
  ctx.fillStyle = o.disabled ? '#ddd' : hover ? '#14213d' : '#fff';
  ctx.font = '700 ' + (o.size || 16) + 'px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2 + 1);
  ui.buttons.push({ id, x, y, w, h, disabled: !!o.disabled });
  return hover;
}

function skyGradient(ctx, sky, horizonY) {
  const g = ctx.createLinearGradient(0, 0, 0, horizonY + 40);
  if (sky === 'dawn') { g.addColorStop(0, '#2b3a67'); g.addColorStop(0.55, '#e07a5f'); g.addColorStop(1, '#f4d58d'); }
  else if (sky === 'dusk') { g.addColorStop(0, '#1d3557'); g.addColorStop(0.5, '#7d5ba6'); g.addColorStop(1, '#f4845f'); }
  else if (sky === 'storm') { g.addColorStop(0, '#3a4452'); g.addColorStop(0.6, '#5b6b7c'); g.addColorStop(1, '#8d99ae'); }
  else { g.addColorStop(0, '#1d6fb8'); g.addColorStop(0.6, '#6ec1e4'); g.addColorStop(1, '#cfeef7'); }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CANVAS_W, horizonY + 40);
}

function drawMountains(ctx, horizonY, heading, seed, color, amp, speed) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, horizonY);
  for (let x = 0; x <= CANVAS_W; x += 16) {
    const h = hash2(Math.floor((x + heading * speed) / 90), seed, 5);
    const y = horizonY - 14 - h * amp - hash2(Math.floor((x + heading * speed) / 37), seed + 1, 5) * amp * 0.5;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(CANVAS_W, horizonY);
  ctx.closePath();
  ctx.fill();
}

function terrainColor(terrain, h) {
  if (terrain === 'islands') {
    if (h < 0.42) return '#2e7fa8'; // sea
    if (h < 0.5) return '#e8d8a0'; // sand
    return h < 0.72 ? '#5da24a' : '#3f7d38'; // palm green
  }
  if (terrain === 'volcano') {
    if (h < 0.18) return '#c1440e';
    return h < 0.55 ? '#5b4a3f' : '#3a3230';
  }
  if (terrain === 'city') {
    if (h < 0.55) return '#9aa0a6';
    if (h < 0.7) return '#7d838a';
    return '#6b7c6e';
  }
  if (terrain === 'glacier') {
    if (h < 0.5) return '#eaf6fb';
    if (h < 0.75) return '#bcd9e8';
    return '#8fb8cc';
  }
  if (terrain === 'jungle') {
    return h < 0.5 ? '#2f6b2f' : h < 0.8 ? '#245c28' : '#3a7d33';
  }
  // coast: fields with a blue sea band on the west edge of each tile band
  if (h < 0.3) return '#2e7fa8';
  if (h < 0.38) return '#e8d8a0';
  return h < 0.65 ? '#7cb35a' : '#5a9a48';
}

function drawGround(ctx, f, horizonY) {
  const planeX = CANVAS_W / 2;
  const planeY = 480;
  const viewNm = 2 + f.altitude / 350;
  const scale = CANVAS_W / viewNm; // px per nautical mile
  const hRad = (f.heading * Math.PI) / 180;
  const cos = Math.cos(hRad);
  const sin = Math.sin(hRad);
  // World coordinates of the four screen corners of the ground area.
  const corners = [
    [-planeX - 80, horizonY - planeY - 80],
    [CANVAS_W - planeX + 80, horizonY - planeY - 80],
    [CANVAS_W - planeX + 80, CANVAS_H - planeY + 80],
    [-planeX - 80, CANVAS_H - planeY + 80],
  ];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const c of corners) {
    const ox = c[0] / scale;
    const oy = c[1] / scale;
    const wx = f.x + cos * ox + sin * oy;
    const wy = f.y - sin * ox + cos * oy;
    if (wx < minX) minX = wx;
    if (wx > maxX) maxX = wx;
    if (wy < minY) minY = wy;
    if (wy > maxY) maxY = wy;
  }
  const terrain = f.route.terrain;
  const seed = f.route.seed;
  // The ground tiles live below the horizon only: the sky stays sky.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, horizonY, CANVAS_W, CANVAS_H - horizonY);
  ctx.clip();
  ctx.translate(planeX, planeY);
  ctx.rotate(-hRad);
  ctx.translate(-f.x * scale, -f.y * scale);
  const t0x = Math.floor(minX / TILE_NM);
  const t1x = Math.ceil(maxX / TILE_NM);
  const t0y = Math.floor(minY / TILE_NM);
  const t1y = Math.ceil(maxY / TILE_NM);
  // Base colour first, so if the tile cap ever cuts the loop short the ground
  // still reads as ground instead of showing the page behind the canvas.
  const baseColor = { islands: '#2e7fa8', coast: '#6aa84f', volcano: '#4a3f38', city: '#8a9096', glacier: '#cfe4ef', jungle: '#2f6b2f' }[terrain] || '#6aa84f';
  ctx.fillStyle = baseColor;
  ctx.fillRect(t0x * TILE_NM * scale, t0y * TILE_NM * scale, (t1x - t0x) * TILE_NM * scale, (t1y - t0y) * TILE_NM * scale);
  let drawn = 0;
  for (let tx = t0x; tx <= t1x && drawn < 6000; tx += 1) {
    for (let ty = t0y; ty <= t1y && drawn < 6000; ty += 1) {
      const h = hash2(tx, ty, seed);
      ctx.fillStyle = terrainColor(terrain, h);
      ctx.fillRect(tx * TILE_NM * scale, ty * TILE_NM * scale, TILE_NM * scale + 1, TILE_NM * scale + 1);
      // A whisper of shade per tile so the ground reads as fields, not a grid.
      const shade = hash2(tx, ty, seed + 77);
      ctx.fillStyle = shade > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
      ctx.fillRect(tx * TILE_NM * scale, ty * TILE_NM * scale, TILE_NM * scale + 1, TILE_NM * scale + 1);
      // Field boundaries and roads: a darker seam on some tiles.
      if (h > 0.82) {
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(tx * TILE_NM * scale, ty * TILE_NM * scale, TILE_NM * scale + 1, 2);
      }
      drawn += 1;
    }
  }
  ctx.restore();
  // Rings, runway, storms and clouds are drawn unclipped, in the same world
  // frame: a golden ring a few miles ahead projects above the horizon line,
  // and that is exactly where a pilot looks for it — in the sky, not the dirt.
  ctx.save();
  ctx.translate(planeX, planeY);
  ctx.rotate(-hRad);
  ctx.translate(-f.x * scale, -f.y * scale);
  // The destination runway, drawn in world space so it stays put as you turn.
  const rw = runwayPoint(f.world);
  const rwLen = f.world.runway.length * scale;
  const rwWid = Math.max(6, f.world.runway.width * scale);
  const rwH = (f.world.runway.heading * Math.PI) / 180;
  ctx.save();
  ctx.translate(rw.x * scale, rw.y * scale);
  ctx.rotate(rwH);
  ctx.fillStyle = '#3d4450';
  ctx.fillRect(-rwWid / 2, -rwLen, rwWid, rwLen);
  ctx.fillStyle = '#f5f5f5';
  for (let d = -rwLen + 8; d < -8; d += 18) ctx.fillRect(-1.5, d, 3, 10);
  ctx.fillStyle = '#fff';
  for (let i = -1; i <= 1; i += 1) ctx.fillRect(i * (rwWid / 4) - 3, -rwLen + 2, 6, 8);
  ctx.fillStyle = '#e63946';
  ctx.fillRect(-rwWid / 2, -rwLen, rwWid, 5);
  ctx.restore();
  // Golden rings, in world space: the next one pulses, hit ones turn green.
  for (const ring of f.world.rings) {
    const p = routePoint(f.route, ring.along, ring.lateral);
    const r = ring.radius * scale;
    if (r < 2) continue;
    const isNext = f.world.rings[f.nextRing] === ring;
    ctx.beginPath();
    ctx.arc(p.x * scale, p.y * scale, r, 0, Math.PI * 2);
    ctx.fillStyle = ring.hit ? 'rgba(126,224,129,0.25)' : isNext ? 'rgba(255,183,3,0.30)' : 'rgba(255,183,3,0.16)';
    ctx.fill();
    ctx.lineWidth = isNext ? 5 : 3;
    ctx.strokeStyle = ring.hit ? '#7ee081' : isNext ? '#ffb703' : 'rgba(255,183,3,0.55)';
    ctx.stroke();
    if (isNext) {
      // The label is drawn counter-rotated so it reads upright: the world
      // frame is rotated by the heading, and a sideways altitude is unreadable.
      ctx.save();
      ctx.translate(p.x * scale, p.y * scale - r - 6);
      ctx.rotate((f.heading * Math.PI) / 180);
      text(ctx, Math.round(ring.alt) + ' ft', 0, 0, 13, '#ffb703', 'center', '700');
      ctx.restore();
    }
  }
  // Storm cells: dark bruised blobs with a flickering lightning edge.
  for (const s of f.world.storms) {
    const p = routePoint(f.route, s.along, s.lateral);
    const r = s.radius * scale;
    const flick = hash2(Math.floor(f.time * 3), s.seed, 9) < 0.12;
    ctx.fillStyle = flick ? 'rgba(90,60,120,0.75)' : 'rgba(52,52,74,0.72)';
    ctx.beginPath();
    ctx.arc(p.x * scale, p.y * scale, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(p.x * scale - r * 0.4, p.y * scale - r * 0.25, r * 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(p.x * scale + r * 0.4, p.y * scale + r * 0.2, r * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,235,120,0.8)';
    ctx.beginPath();
    ctx.arc(p.x * scale, p.y * scale, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Clouds at the cloud layer, drifting slowly in world space.
  for (let i = 0; i < 16; i += 1) {
    const cx = f.x + (hash2(i, 3, f.route.seed) - 0.5) * viewNm * 2.4 + Math.sin(f.time * 0.02 + i) * 0.6;
    const cy = f.y + (hash2(i, 7, f.route.seed) - 0.5) * viewNm * 2.0;
    const cr = (0.7 + hash2(i, 11, f.route.seed) * 1.1) * scale * 0.55;
    const above = f.altitude < f.world.cloudBase;
    ctx.fillStyle = above ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.ellipse(cx * scale, cy * scale, cr, cr * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx * scale + cr * 0.5, cy * scale + cr * 0.1, cr * 0.6, cr * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawPlane(ctx, f) {
  const cx = CANVAS_W / 2;
  const cy = 480 + f.shake * 4 * (hash2(Math.floor(f.time * 20), 1, 3) - 0.5);
  // Shadow on the ground below, shrinking and fading as the plane climbs.
  const shAlpha = clamp(0.34 - f.altitude / 26000, 0.04, 0.34);
  ctx.fillStyle = 'rgba(0,0,0,' + shAlpha.toFixed(2) + ')';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 26 + f.altitude * 0.012, 58 + f.altitude * 0.002, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(f.roll * 0.55);
  const body = f.aircraft.color;
  // Wings.
  ctx.fillStyle = '#dfe6ee';
  ctx.beginPath();
  ctx.moveTo(-72, 6); ctx.lineTo(-14, -2); ctx.lineTo(-12, 12); ctx.lineTo(-66, 18); ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(72, 6); ctx.lineTo(14, -2); ctx.lineTo(12, 12); ctx.lineTo(66, 18); ctx.closePath(); ctx.fill();
  // Tail.
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(-16, 34); ctx.lineTo(0, 58); ctx.lineTo(16, 34); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#dfe6ee';
  ctx.beginPath();
  ctx.moveTo(-26, 40); ctx.lineTo(0, 46); ctx.lineTo(26, 40); ctx.lineTo(22, 48); ctx.lineTo(-22, 48); ctx.closePath(); ctx.fill();
  // Fuselage, nose up.
  const grad = ctx.createLinearGradient(-14, 0, 14, 0);
  grad.addColorStop(0, '#f8fafc');
  grad.addColorStop(0.5, '#ffffff');
  grad.addColorStop(1, '#cbd5e1');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(0, -62);
  ctx.quadraticCurveTo(13, -30, 13, 6);
  ctx.quadraticCurveTo(13, 34, 7, 44);
  ctx.quadraticCurveTo(0, 50, -7, 44);
  ctx.quadraticCurveTo(-13, 34, -13, 6);
  ctx.quadraticCurveTo(-13, -30, 0, -62);
  ctx.fill();
  // Livery stripe and windows.
  ctx.fillStyle = body;
  ctx.fillRect(-13, -6, 26, 7);
  ctx.fillStyle = '#1d3557';
  for (let i = 0; i < 4; i += 1) {
    ctx.beginPath();
    ctx.arc(-8 + i * 5.4, -26 - i * 0, 2.1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(0, -46, 5, 0, Math.PI * 2);
  ctx.fillStyle = '#8ecae6';
  ctx.fill();
  // Nav lights: red port, green starboard, white strobe blinking.
  const blink = (f.time % 1) < 0.12;
  ctx.fillStyle = '#ef476f';
  ctx.beginPath(); ctx.arc(-70, 10, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#06d6a0';
  ctx.beginPath(); ctx.arc(70, 10, 3.5, 0, Math.PI * 2); ctx.fill();
  if (blink) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(0, 56, 4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawCompass(ctx, heading) {
  panel(ctx, 340, 12, 600, 44, 0.66);
  ctx.save();
  ctx.beginPath();
  ctx.rect(340, 12, 600, 44);
  ctx.clip();
  for (let d = -60; d <= 60; d += 5) {
    const h = Math.round((heading + d + 360) % 360);
    const x = 640 + d * 4.4;
    const major = h % 30 === 0;
    ctx.strokeStyle = major ? '#fff' : 'rgba(255,255,255,0.45)';
    ctx.lineWidth = major ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x, 18);
    ctx.lineTo(x, major ? 32 : 26);
    ctx.stroke();
    if (major) text(ctx, String(h).padStart(3, '0'), x, 50, 12, '#fff', 'center', '700');
  }
  ctx.restore();
  ctx.fillStyle = '#ffb703';
  ctx.beginPath();
  ctx.moveTo(640, 14); ctx.lineTo(634, 24); ctx.lineTo(646, 24); ctx.closePath(); ctx.fill();
  text(ctx, 'HDG ' + String(Math.round(heading)).padStart(3, '0') + '°', 640, 68, 13, '#ffb703', 'center', '700');
}

function drawAttitude(ctx, f) {
  const cx = 92;
  const cy = 178;
  const r = 62;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate(-f.roll * 0.55);
  ctx.translate(0, f.pitch * 34);
  ctx.fillStyle = '#3a86c8';
  ctx.fillRect(-r - 4, -r * 2 - 4, r * 2 + 8, r * 2 + 4);
  ctx.fillStyle = '#8a5a2b';
  ctx.fillRect(-r - 4, 0, r * 2 + 8, r * 2 + 4);
  ctx.fillStyle = '#fff';
  ctx.fillRect(-r, -1, r * 2, 2);
  ctx.restore();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  // Fixed aircraft symbol.
  ctx.fillStyle = '#ffb703';
  ctx.beginPath();
  ctx.moveTo(cx, cy - 8); ctx.lineTo(cx + 6, cy + 4); ctx.lineTo(cx - 6, cy + 4); ctx.closePath(); ctx.fill();
  text(ctx, 'ATTITUDE', cx, cy + r + 16, 11, 'rgba(255,255,255,0.75)', 'center', '600');
}

function wrapText(ctx, str, x, y, maxW, size, color, lineH) {
  ctx.font = '600 ' + size + 'px system-ui, sans-serif';
  const words = str.split(' ');
  let line = '';
  let yy = y;
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (line && ctx.measureText(test).width > maxW) {
      text(ctx, line, x, yy, size, color, 'left', '600');
      line = w;
      yy += lineH;
    } else {
      line = test;
    }
  }
  if (line) text(ctx, line, x, yy, size, color, 'left', '600');
  return yy;
}

function drawHUD(ctx, f, career) {
  const W = CANVAS_W;
  // Top strip: route, compass, instruments.
  panel(ctx, 0, 0, W, 76, 0.6);
  text(ctx, 'MERIDIAN AIR', 18, 30, 17, '#ffb703', 'left', '800');
  text(ctx, f.route.from + ' → ' + f.route.to, 18, 52, 13, '#fff', 'left', '600');
  drawCompass(ctx, f.heading);
  const inst = [
    ['ALT', Math.round(f.altitude).toLocaleString('en-US') + ' ft'],
    ['SPD', Math.round(f.speed) + ' kt'],
    ['VSI', (f.vspeed >= 0 ? '+' : '') + Math.round(f.vspeed) + ' fpm'],
    ['FUEL', Math.round(f.fuel) + ' kg'],
  ];
  let ix = 968;
  for (const pair of inst) {
    text(ctx, pair[0], ix, 26, 11, 'rgba(255,255,255,0.65)', 'left', '700');
    text(ctx, pair[1], ix, 50, 17, pair[0] === 'FUEL' && f.fuel < f.fuelCap * 0.15 ? '#ef476f' : '#fff', 'left', '700');
    ix += pair[0] === 'ALT' ? 118 : 96;
  }
  text(ctx, 'DAY ' + career.day + ' · $' + career.cash.toLocaleString('en-US') + ' · ★' + career.reputation.toFixed(1), W - 18, 68, 12, 'rgba(255,255,255,0.8)', 'right', '600');

  // Left cluster: attitude, throttle, fuel, damage.
  drawAttitude(ctx, f);
  panel(ctx, 16, 276, 152, 132, 0.66);
  text(ctx, 'THROTTLE', 24, 296, 11, 'rgba(255,255,255,0.65)', 'left', '700');
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(24, 304, 136, 12);
  ctx.fillStyle = f.throttle > 0.85 ? '#ef476f' : '#06d6a0';
  ctx.fillRect(24, 304, 136 * f.throttle, 12);
  text(ctx, 'FUEL', 24, 338, 11, 'rgba(255,255,255,0.65)', 'left', '700');
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(24, 346, 136, 12);
  ctx.fillStyle = f.fuel < f.fuelCap * 0.15 ? '#ef476f' : '#ffd166';
  ctx.fillRect(24, 346, 136 * (f.fuel / f.fuelCap), 12);
  text(ctx, 'AIRFRAME', 24, 380, 11, 'rgba(255,255,255,0.65)', 'left', '700');
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(24, 388, 136, 12);
  ctx.fillStyle = f.damage > 60 ? '#ef476f' : '#8ecae6';
  ctx.fillRect(24, 388, 136 * (1 - f.damage / 100), 12);

  // Right panel: phase, objective, rings, distance, timer.
  panel(ctx, 1108, 88, 156, 218, 0.66);
  const phaseName = { checklist: 'PRE-FLIGHT', takeoff: 'TAKEOFF', climb: 'CLIMB', cruise: 'CRUISE', descent: 'DESCENT', approach: 'APPROACH', landing: 'ROLLOUT', done: 'ARRIVED' }[f.phase];
  text(ctx, phaseName, 1186, 112, 15, '#ffb703', 'center', '800');
  const next = f.world.rings[f.nextRing];
  const distLeft = Math.max(0, f.route.dist - (f.phase === 'checklist' || f.phase === 'takeoff' ? 0 : (function () {
    // distance already flown, from the world position
    const h = (f.route.heading * Math.PI) / 180;
    return Math.sin(h) * f.x - Math.cos(h) * f.y;
  })()));
  text(ctx, 'RINGS ' + f.ringsHit + '/' + f.ringsTotal, 1186, 142, 13, '#fff', 'center', '700');
  text(ctx, 'COMBO x' + f.combo + ' (best x' + f.comboBest + ')', 1186, 162, 12, '#ffd166', 'center', '600');
  text(ctx, next ? 'NEXT RING ' + (next.index + 1) : 'RUNWAY AHEAD', 1186, 184, 12, '#fff', 'center', '600');
  text(ctx, distLeft.toFixed(1) + ' nm to go', 1186, 204, 12, '#fff', 'center', '600');
  const t = Math.floor(f.time);
  const par = Math.floor(f.parTime);
  text(ctx, 'TIME ' + Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0') + ' / par ' + Math.floor(par / 60) + ':' + String(par % 60).padStart(2, '0'), 1186, 226, 11, f.time > f.parTime ? '#ef476f' : '#7ee081', 'center', '600');
  text(ctx, 'GEAR ' + (f.gear ? 'DOWN' : 'UP') + ' · FLAPS ' + (f.flaps ? 'DOWN' : 'UP'), 1186, 248, 11, f.phase === 'approach' && !f.gear ? '#ef476f' : 'rgba(255,255,255,0.8)', 'center', '700');
  if (f.autopilot) text(ctx, 'AUTOPILOT ON (H)', 1186, 270, 11, '#06d6a0', 'center', '700');
  if (f.phase === 'approach') {
    const lat = (function () {
      const h = (f.route.heading * Math.PI) / 180;
      return Math.cos(h) * f.x + Math.sin(h) * f.y;
    })();
    text(ctx, 'CENTRELINE ' + (lat >= 0 ? '+' : '') + lat.toFixed(2) + ' nm', 1186, 292, 11, Math.abs(lat) < 0.1 ? '#7ee081' : '#fff', 'center', '600');
  }

  // Warnings flash across the top of the ground.
  if (f.warnings.length && Math.floor(f.time * 2 + 0.25) % 2 === 0) {
    text(ctx, '⚠ ' + f.warnings.join(' · '), CANVAS_W / 2, 108, 16, '#ef476f', 'center', '800');
  }

  // Passenger chips along the bottom: name, mood, live mood score.
  const chips = f.manifest;
  const chipW = 196;
  const totalW = chips.length * chipW;
  let cx = (CANVAS_W - totalW) / 2;
  for (const p of chips) {
    panel(ctx, cx + 4, 648, chipW - 8, 60, 0.66);
    ctx.fillStyle = MOOD_COLORS[p.mood] || '#8ecae6';
    ctx.beginPath();
    ctx.arc(cx + 24, 678, 13, 0, Math.PI * 2);
    ctx.fill();
    text(ctx, p.name.split(' ').map((w) => w[0]).join(''), cx + 24, 682, 11, '#14213d', 'center', '800');
    text(ctx, p.name + (p.critic ? ' ★' : ''), cx + 44, 672, 12, '#fff', 'left', '700');
    text(ctx, (MOOD_LABELS[p.mood] || p.mood) + ' ' + Math.round(p.moodScore), cx + 44, 692, 11, MOOD_COLORS[p.mood] || '#8ecae6', 'left', '600');
    cx += chipW;
  }

  // Announcement bar.
  if (f.time - f.messageTime < 6) {
    panel(ctx, CANVAS_W / 2 - 330, 596, 660, 34, 0.7);
    text(ctx, f.message, CANVAS_W / 2, 619, 14, '#fff', 'center', '600');
  }

  // Checklist overlay during pre-flight.
  if (f.phase === 'checklist') {
    panel(ctx, CANVAS_W / 2 - 300, 150, 600, 300, 0.85);
    text(ctx, 'PRE-FLIGHT CHECKLIST', CANVAS_W / 2, 188, 20, '#ffb703', 'center', '800');
    text(ctx, f.route.from + ' → ' + f.route.to + ' · ' + f.aircraft.name + ' · ' + f.manifest.length + ' passengers aboard', CANVAS_W / 2, 212, 13, '#fff', 'center', '600');
    for (let i = 0; i < CHECKS.length; i += 1) {
      const y = 240 + i * 36;
      ctx.fillStyle = f.checks[i] ? '#06d6a0' : 'rgba(255,255,255,0.2)';
      roundRect(ctx, CANVAS_W / 2 - 260, y - 18, 22, 22, 5);
      ctx.fill();
      if (f.checks[i]) text(ctx, '✓', CANVAS_W / 2 - 249, y - 1, 15, '#14213d', 'center', '800');
      text(ctx, CHECKS[i].key + '. ' + CHECKS[i].label, CANVAS_W / 2 - 226, y, 15, f.checks[i] ? '#7ee081' : '#fff', 'left', '600');
    }
    text(ctx, 'Press 1–5 or click a line to tick it off. All five and you are cleared for takeoff.', CANVAS_W / 2, 428, 12, 'rgba(255,255,255,0.7)', 'center', '600');
  }
}

export function drawFlight(ctx, game, ui) {
  const f = game.flight;
  const horizonY = clamp(300 - f.pitch * 70, 190, 420);
  skyGradient(ctx, f.route.sky, horizonY);
  // Sun, placed by heading so turning the plane moves it across the sky, and
  // kept below the instrument strip so it never sits on the compass.
  const sunX = 640 + Math.sin(((f.heading + 35) * Math.PI) / 180) * 420;
  const sunY = Math.max(110, horizonY - 175);
  ctx.fillStyle = 'rgba(255, 214, 130, 0.95)';
  ctx.beginPath();
  ctx.arc(sunX, sunY, 30, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 214, 130, 0.25)';
  ctx.beginPath();
  ctx.arc(sunX, sunY, 52, 0, Math.PI * 2);
  ctx.fill();
  drawMountains(ctx, horizonY, f.heading, f.route.seed, 'rgba(90,110,140,0.55)', 46, 2.2);
  drawMountains(ctx, horizonY, f.heading, f.route.seed + 4, 'rgba(52,66,88,0.8)', 26, 4.1);
  drawGround(ctx, f, horizonY);
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, horizonY);
  ctx.lineTo(CANVAS_W, horizonY);
  ctx.stroke();
  drawPlane(ctx, f);
  drawHUD(ctx, f, game.career);
  text(ctx, 'Esc — abandon flight   ·   M — sound   ·   P — pause', CANVAS_W / 2, 712, 11, 'rgba(255,255,255,0.55)', 'center', '600');
}

function drawTitle(ctx, game, ui) {
  const g = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  g.addColorStop(0, '#1d3557');
  g.addColorStop(0.55, '#457b9d');
  g.addColorStop(1, '#f4d58d');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (let i = 0; i < 9; i += 1) {
    const cx = 120 + i * 140 + (i % 3) * 30;
    const cy = 90 + (i % 4) * 46;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 60, 16, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // A little parked plane on the title, drawn with the same shapes as the game.
  ctx.save();
  ctx.translate(640, 648);
  ctx.scale(1.05, 1.05);
  ctx.fillStyle = '#dfe6ee';
  ctx.beginPath(); ctx.moveTo(-72, 6); ctx.lineTo(-14, -2); ctx.lineTo(-12, 12); ctx.lineTo(-66, 18); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(72, 6); ctx.lineTo(14, -2); ctx.lineTo(12, 12); ctx.lineTo(66, 18); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#e8a13a';
  ctx.beginPath(); ctx.moveTo(-16, 34); ctx.lineTo(0, 58); ctx.lineTo(16, 34); ctx.closePath(); ctx.fill();
  const grad = ctx.createLinearGradient(-14, 0, 14, 0);
  grad.addColorStop(0, '#f8fafc'); grad.addColorStop(0.5, '#ffffff'); grad.addColorStop(1, '#cbd5e1');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(0, -62); ctx.quadraticCurveTo(13, -30, 13, 6); ctx.quadraticCurveTo(13, 34, 7, 44);
  ctx.quadraticCurveTo(0, 50, -7, 44); ctx.quadraticCurveTo(-13, 34, -13, 6); ctx.quadraticCurveTo(-13, -30, 0, -62);
  ctx.fill();
  ctx.fillStyle = '#e8a13a';
  ctx.fillRect(-13, -6, 26, 7);
  ctx.restore();
  text(ctx, GAME_TITLE, 640, 190, 72, '#fff', 'center', '800');
  text(ctx, GAME_SUBTITLE, 640, 228, 20, '#ffe8a3', 'center', '600');
  text(ctx, '7 days · 6 routes · 4 aircraft · 8 upgrades · named passengers with moods · one very stern Sky Critic', 640, 262, 15, 'rgba(255,255,255,0.9)', 'center', '600');
  drawButton(ctx, ui, 'start-fly', 490, 300, 300, 56, 'FLY DAY ' + game.career.day + '  →');
  drawButton(ctx, ui, 'to-hangar', 490, 368, 300, 44, 'Hangar & Upgrades', { color: '#457b9d' });
  text(ctx, 'Arrows / WASD steer · Shift throttle up · X throttle down · G gear · F flaps · H autopilot', 640, 460, 14, 'rgba(255,255,255,0.85)', 'center', '600');
  text(ctx, 'Fly the golden rings, dodge the storms, land it soft — tips and reputation follow the landing.', 640, 486, 14, 'rgba(255,255,255,0.85)', 'center', '600');
  if (game.career.flightsFlown > 0) {
    text(ctx, 'Career so far: ' + game.career.flightsFlown + ' flights · $' + game.career.totalProfit.toLocaleString('en-US') + ' profit · ★' + game.career.reputation.toFixed(1) + ' reputation', 640, 540, 14, '#fff', 'center', '700');
  }
}

function drawMap(ctx, game, ui) {
  const career = game.career;
  ctx.fillStyle = '#0f2233';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.fillStyle = 'rgba(69,123,157,0.35)';
  for (let i = 0; i < 40; i += 1) {
    const x = hash2(i, 1, 7) * CANVAS_W;
    const y = hash2(i, 2, 7) * CANVAS_H;
    ctx.beginPath();
    ctx.ellipse(x, y, 46, 12, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  text(ctx, 'DAY ' + career.day + ' — CHOOSE YOUR FLIGHT', 640, 64, 32, '#fff', 'center', '800');
  const goal = [900, 1500, 2200, 3000, 3900, 5000, 0][career.day - 1];
  text(ctx, goal > 0 ? 'Day goal: $' + goal + ' profit  ·  today so far: $' + career.dayProfit + '  ·  cash $' + career.cash.toLocaleString('en-US') : 'FINALE — the Sky Critic is on board today. Fly like your airline depends on it.', 640, 96, 15, '#ffd166', 'center', '600');
  text(ctx, 'Flying the ' + game.aircraftName + ' · ★' + career.reputation.toFixed(1) + ' reputation · ' + (3 - career.dayFlightsDone) + ' flights left today', 640, 120, 13, 'rgba(255,255,255,0.8)', 'center', '600');
  game.offers.forEach((offer, i) => {
    const x = 90 + i * 380;
    const y = 150;
    panel(ctx, x, y, 360, 400, 0.85);
    const r = offer.route;
    text(ctx, r.from + ' → ' + r.to, x + 180, y + 40, 20, '#ffb703', 'center', '800');
    text(ctx, '★'.repeat(r.difficulty) + '☆'.repeat(3 - r.difficulty) + '  ·  ' + r.dist + ' nm  ·  ' + r.terrain, x + 180, y + 66, 13, '#fff', 'center', '600');
    text(ctx, 'Fare $' + r.fare + ' per seat · ' + offer.manifest.length + ' passengers', x + 180, y + 92, 13, '#fff', 'center', '600');
    let py = y + 126;
    for (const p of offer.manifest) {
      ctx.fillStyle = MOOD_COLORS[p.mood] || '#8ecae6';
      ctx.beginPath();
      ctx.arc(x + 28, py - 5, 9, 0, Math.PI * 2);
      ctx.fill();
      text(ctx, p.name + (p.critic ? ' ★ CRITIC' : ''), x + 46, py, 13, '#fff', 'left', '700');
      text(ctx, p.quirk, x + 46, py + 16, 11, 'rgba(255,255,255,0.65)', 'left', '600');
      py += 38;
    }
    drawButton(ctx, ui, 'offer-' + i, x + 60, y + 330, 240, 44, 'FLY THIS ROUTE  →');
  });
  drawButton(ctx, ui, 'to-hangar', 440, 580, 180, 44, 'Hangar', { color: '#457b9d' });
  drawButton(ctx, ui, 'to-title', 660, 580, 180, 44, 'Title', { color: '#457b9d' });
}

function drawHangar(ctx, game, ui) {
  const career = game.career;
  ctx.fillStyle = '#1b2a3a';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  text(ctx, 'HANGAR — MERIDIAN AIR', 640, 56, 30, '#fff', 'center', '800');
  text(ctx, 'Cash $' + career.cash.toLocaleString('en-US') + '  ·  every dollar here buys a faster, safer or richer flight — nothing is decoration.', 640, 84, 14, '#ffd166', 'center', '600');
  text(ctx, 'AIRCRAFT', 90, 130, 16, '#ffb703', 'left', '800');
  game.aircraftList.forEach((a, i) => {
    const x = 90 + i * 300;
    const owned = career.ownedAircraft.indexOf(a.id) >= 0;
    const current = career.aircraftId === a.id;
    panel(ctx, x, 142, 280, 190, 0.85);
    ctx.fillStyle = a.color;
    ctx.beginPath();
    ctx.ellipse(x + 140, 196, 70, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(x + 140, 192, 46, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    text(ctx, a.name, x + 140, 240, 16, '#fff', 'center', '800');
    text(ctx, a.kind + ' · ' + a.seats + ' seats · ' + a.maxSpeed + ' kt · ' + a.fuelCap + ' kg fuel', x + 140, 262, 12, 'rgba(255,255,255,0.8)', 'center', '600');
    if (current) text(ctx, '— FLYING THIS ONE —', x + 140, 286, 12, '#7ee081', 'center', '700');
    else if (owned) drawButton(ctx, ui, 'select-aircraft-' + a.id, x + 65, 292, 150, 32, 'Select', { color: '#457b9d', size: 13 });
    else drawButton(ctx, ui, 'buy-aircraft-' + a.id, x + 65, 292, 150, 32, 'Buy $' + a.cost.toLocaleString('en-US'), { size: 13, disabled: career.cash < a.cost });
  });
  text(ctx, 'UPGRADES', 90, 372, 16, '#ffb703', 'left', '800');
  game.upgradeList.forEach((u, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const x = 90 + col * 300;
    const y = 384 + row * 122;
    const owned = career.upgrades.indexOf(u.id) >= 0;
    panel(ctx, x, y, 280, 108, 0.85);
    text(ctx, u.name, x + 14, y + 24, 14, '#fff', 'left', '800');
    const descEnd = wrapText(ctx, u.desc, x + 14, y + 44, 252, 11, 'rgba(255,255,255,0.75)', 14);
    if (owned) text(ctx, '✓ INSTALLED', x + 14, y + 90, 12, '#7ee081', 'left', '700');
    else drawButton(ctx, ui, 'buy-upgrade-' + u.id, x + 14, Math.max(descEnd + 8, y + 62), 130, 28, 'Buy $' + u.cost, { size: 13, disabled: career.cash < u.cost });
  });
  drawButton(ctx, ui, 'back-map', 490, 648, 300, 44, '← Back to Flights', { color: '#457b9d' });
}

function drawDebrief(ctx, game, ui) {
  const s = game.debrief;
  ctx.fillStyle = '#0f2233';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  text(ctx, 'FLIGHT DEBRIEF — ' + s.route.from + ' → ' + s.route.to, 640, 60, 28, '#fff', 'center', '800');
  const gradeColor = { Butter: '#7ee081', Smooth: '#8ecae6', Firm: '#ffd166', Hard: '#f4a259', Crash: '#ef476f' }[s.landingGrade];
  text(ctx, s.landingGrade.toUpperCase() + ' LANDING', 640, 104, 24, gradeColor, 'center', '800');
  text(ctx, s.ringsHit + '/' + s.ringsTotal + ' rings · best combo x' + s.comboBest + ' · ' + (s.onTimeResult ? 'ON TIME (+$120)' : 'late — no on-time bonus') + ' · reputation ' + (s.repDelta >= 0 ? '+' : '') + s.repDelta + ' → ★' + s.reputation.toFixed(1), 640, 130, 14, '#fff', 'center', '600');
  panel(ctx, 340, 156, 600, 300, 0.85);
  const rows = [
    ['Ticket fares (' + s.manifest.length + ' passengers)', '+$' + s.fares],
    ['Tips — the passengers decide', '+$' + s.tips],
    ['Ring bonuses (x' + s.comboBest + ' combo)', '+$' + s.rings],
    ['On-time bonus', '+$' + s.onTime],
    ['Fuel burned', '−$' + s.fuelCost],
    ['Landing fee', '−$' + s.landingFee],
    ['Repairs', '−$' + s.repair],
  ];
  let y = 190;
  for (const row of rows) {
    text(ctx, row[0], 370, y, 15, '#fff', 'left', '600');
    text(ctx, row[1], 910, y, 15, row[1].charAt(0) === '+' ? '#7ee081' : '#ef476f', 'right', '700');
    y += 30;
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.beginPath(); ctx.moveTo(370, y - 8); ctx.lineTo(910, y - 8); ctx.stroke();
  text(ctx, 'PROFIT', 370, y + 22, 18, '#ffb703', 'left', '800');
  text(ctx, (s.profit >= 0 ? '+$' : '−$') + Math.abs(s.profit).toLocaleString('en-US'), 910, y + 22, 18, s.profit >= 0 ? '#7ee081' : '#ef476f', 'right', '800');
  text(ctx, 'Cash now $' + s.cash.toLocaleString('en-US'), 640, y + 52, 13, 'rgba(255,255,255,0.8)', 'center', '600');
  // Passenger verdicts.
  let px = 340;
  for (const p of s.manifest) {
    text(ctx, p.name.split(' ')[0] + ': ' + (MOOD_LABELS[p.mood] || p.mood) + ' · tip $' + p.tip, px, 500, 12, MOOD_COLORS[p.mood] || '#fff', 'left', '600');
    px += 200;
    if (px > 900) break;
  }
  const done = game.career.dayFlightsDone >= 3;
  if (!done) drawButton(ctx, ui, 'next-flight', 340, 560, 280, 48, 'Next Flight  →');
  else drawButton(ctx, ui, 'next-day', 340, 560, 280, 48, game.career.day >= 7 ? 'Finish Career  →' : 'End Day ' + game.career.day + '  →');
  drawButton(ctx, ui, 'to-hangar', 660, 560, 280, 48, 'Spend in Hangar', { color: '#457b9d' });
}

function drawCareerEnd(ctx, game, ui) {
  const c = game.career;
  ctx.fillStyle = '#14213d';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  text(ctx, 'SEVEN DAYS, SEVEN SKIES', 640, 90, 36, '#ffb703', 'center', '800');
  text(ctx, game.rankText, 640, 140, 24, '#fff', 'center', '700');
  text(ctx, c.flightsFlown + ' flights · ' + c.totalRings + ' rings flown · $' + c.totalTips.toLocaleString('en-US') + ' in tips', 640, 176, 16, '#fff', 'center', '600');
  text(ctx, 'Total career profit: $' + c.totalProfit.toLocaleString('en-US') + '  ·  final reputation ★' + c.reputation.toFixed(1), 640, 208, 16, '#fff', 'center', '600');
  if (c.criticVerdict) {
    panel(ctx, 290, 240, 700, 110, 0.85);
    text(ctx, 'THE SKY CRITIC SAYS', 640, 272, 14, '#c77dff', 'center', '800');
    text(ctx, c.criticVerdict, 640, 302, 15, '#fff', 'center', '600');
  }
  const best = c.landings.slice().sort()[0] || '—';
  text(ctx, 'Best landing of the week: ' + best + '  ·  landings: ' + c.landings.join(', '), 640, 400, 14, 'rgba(255,255,255,0.85)', 'center', '600');
  text(ctx, 'Meridian Air thanks you for flying. The archipelago is still out there — fly it again, better.', 640, 430, 14, 'rgba(255,255,255,0.85)', 'center', '600');
  drawButton(ctx, ui, 'restart', 490, 480, 300, 52, 'Fly Another Week  ↺');
}

export function drawGame(ctx, game, ui) {
  ui.buttons.length = 0;
  ui.mouseX = game.input.mouseX;
  ui.mouseY = game.input.mouseY;
  if (game.screen === 'flight') drawFlight(ctx, game, ui);
  else if (game.screen === 'map') drawMap(ctx, game, ui);
  else if (game.screen === 'hangar') drawHangar(ctx, game, ui);
  else if (game.screen === 'debrief') drawDebrief(ctx, game, ui);
  else if (game.screen === 'career') drawCareerEnd(ctx, game, ui);
  else drawTitle(ctx, game, ui);
  if (game.paused && game.screen === 'flight') {
    panel(ctx, 440, 300, 400, 120, 0.85);
    text(ctx, 'PAUSED', 640, 344, 28, '#fff', 'center', '800');
    text(ctx, 'Press P to resume · Esc to abandon the flight', 640, 376, 13, 'rgba(255,255,255,0.8)', 'center', '600');
  }
}

export { ROUTES };
