// Sound for Seven Skies Airline — everything synthesized with WebAudio, no
// audio files. The engine is an oscillator whose pitch follows the throttle, the
// wind is filtered noise, and the events are short beeps and chimes. Nothing
// plays until the player presses a key or clicks, so the first gesture starts it.
export function createAudio() {
  const audio = {
    ctx: null,
    master: null,
    engineOsc: null,
    engineGain: null,
    windSrc: null,
    windGain: null,
    muted: false,
    started: false,
  };

  audio.ensure = function ensure() {
    if (audio.started) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      audio.ctx = new AC();
      audio.master = audio.ctx.createGain();
      audio.master.gain.value = 0.5;
      audio.master.connect(audio.ctx.destination);
      audio.engineOsc = audio.ctx.createOscillator();
      audio.engineOsc.type = 'sawtooth';
      audio.engineOsc.frequency.value = 55;
      audio.engineGain = audio.ctx.createGain();
      audio.engineGain.gain.value = 0;
      const filter = audio.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 320;
      audio.engineOsc.connect(filter);
      filter.connect(audio.engineGain);
      audio.engineGain.connect(audio.master);
      audio.engineOsc.start();
      // Wind: a looped noise buffer through a band-pass filter.
      const len = audio.ctx.sampleRate * 2;
      const buffer = audio.ctx.createBuffer(1, len, audio.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
      audio.windSrc = audio.ctx.createBufferSource();
      audio.windSrc.buffer = buffer;
      audio.windSrc.loop = true;
      const windFilter = audio.ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 480;
      windFilter.Q.value = 0.6;
      audio.windGain = audio.ctx.createGain();
      audio.windGain.gain.value = 0;
      audio.windSrc.connect(windFilter);
      windFilter.connect(audio.windGain);
      audio.windGain.connect(audio.master);
      audio.windSrc.start();
      audio.started = true;
    } catch (e) {
      audio.started = false;
    }
  };

  audio.setFlight = function setFlight(throttle, speed, inStorm) {
    if (!audio.started || audio.muted) return;
    try {
      const t = audio.ctx.currentTime;
      audio.engineOsc.frequency.setTargetAtTime(48 + throttle * 90, t, 0.1);
      audio.engineGain.gain.setTargetAtTime(throttle > 0.02 ? 0.05 + throttle * 0.05 : 0, t, 0.2);
      audio.windGain.gain.setTargetAtTime(Math.min(0.12, speed / 4000) + (inStorm ? 0.08 : 0), t, 0.2);
    } catch (e) { /* audio is decoration; a failure never stops the game */ }
  };

  audio.setMuted = function setMuted(muted) {
    audio.muted = muted;
    if (audio.master) audio.master.gain.value = muted ? 0 : 0.5;
  };

  function tone(freq, dur, type, vol, when) {
    if (!audio.started || audio.muted) return;
    try {
      const t = audio.ctx.currentTime + (when || 0);
      const osc = audio.ctx.createOscillator();
      osc.type = type || 'sine';
      osc.frequency.value = freq;
      const g = audio.ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol || 0.16, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(g);
      g.connect(audio.master);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    } catch (e) { /* decoration */ }
  }

  audio.ring = function ring() {
    tone(880, 0.18, 'sine', 0.2);
    tone(1318, 0.25, 'sine', 0.16, 0.07);
  };
  audio.chime = function chime() {
    tone(523, 0.3, 'sine', 0.18);
    tone(659, 0.3, 'sine', 0.18, 0.12);
    tone(784, 0.45, 'sine', 0.18, 0.24);
  };
  audio.thud = function thud() {
    tone(90, 0.25, 'triangle', 0.3);
  };
  audio.warn = function warn() {
    tone(440, 0.12, 'square', 0.08);
    tone(440, 0.12, 'square', 0.08, 0.18);
  };
  audio.click = function click() {
    tone(660, 0.06, 'sine', 0.1);
  };
  return audio;
}
