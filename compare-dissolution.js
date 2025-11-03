// Compare dissolution/persistence of Oil vs Ink at the canvas center
// Usage (in browser console):
//   fetch('compare-dissolution.js').then(r => r.text()).then(eval)

(function() {
  if (!window.simulation) {
    console.error('❌ window.simulation not found. Open index.html and ensure the sim is running.');
    return;
  }
  const sim = window.simulation;
  const gl = sim.gl || sim.renderer?.gl;
  if (!gl) {
    console.error('❌ WebGL context not found on simulation.');
    return;
  }

  const seconds = 10;         // duration to sample
  const sampleEveryMs = 1000; // cadence
  const win = 20;             // sample window in pixels (square)
  const centerX = Math.floor(gl.canvas.width / 2);
  const centerY = Math.floor(gl.canvas.height / 2);

  // Helpers to read average over a small window
  function readAvgOilThickness() {
    const fbo = sim.oil?.oilFBO;
    const tex = sim.oil?.oilTexture1;
    if (!fbo || !tex) return 0;
    const px = new Float32Array(win * win * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.readPixels(centerX - (win >> 1), centerY - (win >> 1), win, win, gl.RGBA, gl.FLOAT, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    let sum = 0;
    for (let i = 3; i < px.length; i += 4) sum += px[i]; // alpha channel = thickness
    return sum / (win * win);
  }

  function readAvgInkLuma() {
    const fbo = sim.water?.colorFBO || sim.colorFBO;
    const tex = sim.water?.colorTexture1 || sim.colorTexture1;
    if (!fbo || !tex) return 0;
    const px = new Float32Array(win * win * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.readPixels(centerX - (win >> 1), centerY - (win >> 1), win, win, gl.RGBA, gl.FLOAT, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    let sum = 0;
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i], g = px[i+1], b = px[i+2];
      // Perceptual luminance as proxy for ink "amount"
      sum += 0.2126*r + 0.7152*g + 0.0722*b;
    }
    return sum / (win * win);
  }

  function logParams() {
    console.log('📋 Params:', {
      useMacCormack: sim.useMacCormack,
      occupancyEveryN: sim.occupancyEveryN,
      inkOverflowUpper: sim.overflowUpper,
      oilOverflowUpper: sim.oilOverflowUpper,
      oilOverflowLower: sim.oilOverflowLower,
      oilRimAbsorptionInShader: 'u_oilRimAbsorptionScale=0 set in advection step',
    });
  }

  // Prepare baseline scene: clear, then paint both ink and oil in the center
  function prepareAndPaint() {
    if (!sim.ready || !sim.renderer?.ready) {
      console.warn('⚠️ Simulation not ready yet. Retrying in 500ms...');
      setTimeout(prepareAndPaint, 500);
      return;
    }

    // Ensure oil layer exists
    if (!sim.useOil || !sim.oil) {
      console.log('🛢️ Enabling oil layer...');
      if (typeof sim.enableOil === 'function') {
        sim.enableOil().then(() => setTimeout(prepareAndPaint, 0));
        return;
      }
    }

    // Clear both layers for a clean test
    try { sim.clearColor(); } catch (_) {}
    try { sim.oil?.clearOil(); } catch (_) {}

    const cx = 0.5, cy = 0.5;
    const radius = 0.08; // paint size

    // Paint INK
    sim.splat(cx, cy, { r: 0.5, g: 0.2, b: 0.9 }, radius);
    // Paint OIL (white thickness tint)
    sim.oil?.splatColor(cx, cy, { r: 1.0, g: 1.0, b: 1.0 }, radius);

    console.log('🎨 Painted equal ink and oil at center. Starting measurement in 500ms...');
    setTimeout(run, 500);
  }

  function run() {
    const oilVals = [];
    const inkVals = [];
    const t0Oil = readAvgOilThickness();
    const t0Ink = readAvgInkLuma();

    console.log('📸 Baseline:', { oil: t0Oil, ink: t0Ink });
    logParams();

    let samples = 0;
    const maxSamples = Math.max(1, Math.round((seconds * 1000) / sampleEveryMs));

    const timer = setInterval(() => {
      const oil = readAvgOilThickness();
      const ink = readAvgInkLuma();
      oilVals.push(oil);
      inkVals.push(ink);
      samples++;

      const oilPct = t0Oil > 0 ? (oil / t0Oil) * 100 : 0;
      const inkPct = t0Ink > 0 ? (ink / t0Ink) * 100 : 0;
      console.log(`${samples}s: Oil=${oil.toFixed(6)} (${oilPct.toFixed(1)}%) | Ink=${ink.toFixed(6)} (${inkPct.toFixed(1)}%)`);

      if (samples >= maxSamples) {
        clearInterval(timer);
        summarize(t0Oil, t0Ink, oilVals, inkVals);
      }
    }, sampleEveryMs);
  }

  function summarize(t0Oil, t0Ink, oilVals, inkVals) {
    const tSec = oilVals.length; // ~seconds
    const lastOil = oilVals[oilVals.length - 1] || 0;
    const lastInk = inkVals[inkVals.length - 1] || 0;

    // Exponential per-second decay rate estimate: r = -ln(v_t / v_0) / t
    const oilRate = (t0Oil > 0 && lastOil > 0) ? Math.max(0, -Math.log(lastOil / t0Oil) / tSec) : Infinity;
    const inkRate = (t0Ink > 0 && lastInk > 0) ? Math.max(0, -Math.log(lastInk / t0Ink) / tSec) : Infinity;

    const oilPct10s = t0Oil > 0 ? (lastOil / t0Oil) * 100 : 0;
    const inkPct10s = t0Ink > 0 ? (lastInk / t0Ink) * 100 : 0;

    console.log('\n=== Dissolution Summary ===');
    console.log(`Oil remaining: ${oilPct10s.toFixed(1)}% after ~${tSec}s (rate ~${(oilRate*100).toFixed(2)}%/s)`);
    console.log(`Ink remaining: ${inkPct10s.toFixed(1)}% after ~${tSec}s (rate ~${(inkRate*100).toFixed(2)}%/s)`);

    if (isFinite(oilRate) && isFinite(inkRate)) {
      if (oilRate > inkRate + 0.001) {
        console.log(`⚠️ Oil dissipates faster than ink by ~${((oilRate-inkRate)*100).toFixed(2)}%/s`);
      } else if (inkRate > oilRate + 0.001) {
        console.log(`✅ Oil persists better than ink by ~${((inkRate-oilRate)*100).toFixed(2)}%/s`);
      } else {
        console.log('ℹ️ Oil and ink decay at similar rates');
      }
    }

    // Quick tips based on result
    console.log('\n🔧 Quick Levers:');
    console.log(`• Overflow cadence N: simulation.occupancyEveryN = ${sim.occupancyEveryN} (try 240)`);
    console.log(`• Oil overflow: simulation.oilOverflowUpper = ${sim.oilOverflowUpper} (try 0.95..1.0)`);
    console.log(`• MacCormack: simulation.useMacCormack = ${sim.useMacCormack} (try false)`);
    console.log('• Visual alpha: renderer.oilAlphaGamma (try 1.4..2.0)');
  }

  console.log('🧪 Compare Dissolution: preparing scene...');
  prepareAndPaint();
})();
