// Test: Paint oil and water, compare dissipation
// Run: fetch('test-oil-vs-water.js').then(r => r.text()).then(eval)

(function() {
  const sim = window.simulation;
  if (!sim) {
    console.error('❌ simulation not found');
    return;
  }

  console.log('🧪 OIL VS WATER DISSIPATION TEST\n');
  
  // Check current settings
  console.log('📊 CURRENT SETTINGS:');
  console.log('  Water overflow: upper =', sim.overflowUpper, 'lower =', sim.overflowLower);
  console.log('  Oil overflow: upper =', sim.oilOverflowUpper, 'lower =', sim.oilOverflowLower);
  console.log('  Coupling strength:', sim.couplingStrength);
  console.log('  Oil smoothing:', sim.oilSmoothingRate);
  console.log('  Overflow check frequency:', sim.occupancyEveryN, 'frames');
  
  if (sim.oilOverflowUpper < sim.overflowUpper) {
    console.log('\n⚠️  OIL OVERFLOW TRIGGERS EARLIER THAN WATER!');
    console.log('   Oil triggers at', (sim.oilOverflowUpper * 100).toFixed(0) + '%');
    console.log('   Water triggers at', (sim.overflowUpper * 100).toFixed(0) + '%');
    console.log('   This means oil will dissipate FASTER than water!');
  }
  
  console.log('\n🔧 APPLYING FIX...');
  // Make oil overflow threshold HIGHER than water
  const oldOilUpper = sim.oilOverflowUpper;
  const oldOilLower = sim.oilOverflowLower;
  
  sim.oilOverflowUpper = 0.95;  // Much higher than water's 0.90
  sim.oilOverflowLower = 0.80;
  sim.occupancyEveryN = 180;    // Check less frequently
  
  console.log('  ✓ Oil overflow: upper =', sim.oilOverflowUpper, 'lower =', sim.oilOverflowLower);
  console.log('  ✓ Check frequency:', sim.occupancyEveryN, 'frames');
  console.log('\n  NOW OIL SHOULD PERSIST LONGER THAN WATER!\n');
  
  // Test painting
  console.log('📝 VISUAL TEST:');
  console.log('  1. Clear the scene (reload if needed)');
  console.log('  2. Paint water (press 1, then paint with left click)');
  console.log('  3. Paint oil (press 2, then paint with left click)');
  console.log('  4. Wait 30 seconds WITHOUT rotation');
  console.log('  5. Observe which dissipates faster');
  console.log('\n  Expected: Oil should persist LONGER than water');
  
  console.log('\n🎯 AUTOMATED TEST:');
  console.log('  Painting both materials now...');
  
  // Clear first
  try { sim.clearColor(); } catch (e) {}
  try { sim.oil?.clearOil(); } catch (e) {}
  
  // Paint water
  sim.splat(0.5, 0.4, {r: 0.3, g: 0.898, b: 1.0}, 0.08);
  
  // Enable oil if needed and paint
  if (!sim.useOil || !sim.oil) {
    console.log('  Enabling oil layer...');
    if (typeof sim.enableOil === 'function') {
      sim.enableOil().then(() => {
        setTimeout(() => {
          sim.oil.splatColor(0.5, 0.6, {r: 1.0, g: 0.9, b: 0.3}, 0.08);
          console.log('  ✓ Water painted at y=0.4 (cyan)');
          console.log('  ✓ Oil painted at y=0.6 (yellow)');
          console.log('\n  Watch both for 30 seconds. Oil should fade SLOWER.');
        }, 100);
      });
    }
  } else {
    sim.oil.splatColor(0.5, 0.6, {r: 1.0, g: 0.9, b: 0.3}, 0.08);
    console.log('  ✓ Water painted at y=0.4 (cyan)');
    console.log('  ✓ Oil painted at y=0.6 (yellow)');
    console.log('\n  Watch both for 30 seconds. Oil should fade SLOWER.');
  }
  
  // Track over time
  let measurements = [];
  let startTime = Date.now();
  
  function measure() {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    
    // Read water color
    const gl = sim.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, sim.colorFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sim.colorTexture1, 0);
    const waterPx = new Float32Array(100 * 4);
    const wx = Math.floor(gl.canvas.width / 2) - 5;
    const wy = Math.floor(gl.canvas.height * 0.4) - 5;
    gl.readPixels(wx, wy, 10, 10, gl.RGBA, gl.FLOAT, waterPx);
    
    // Read oil thickness
    let oilPx = new Float32Array(100 * 4);
    if (sim.oil) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, sim.oil.oilFBO);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sim.oil.oilTexture1, 0);
      const ox = Math.floor(gl.canvas.width / 2) - 5;
      const oy = Math.floor(gl.canvas.height * 0.6) - 5;
      gl.readPixels(ox, oy, 10, 10, gl.RGBA, gl.FLOAT, oilPx);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    
    // Compute averages
    let waterSum = 0, oilSum = 0;
    for (let i = 0; i < waterPx.length; i += 4) {
      waterSum += waterPx[i] + waterPx[i+1] + waterPx[i+2];
    }
    for (let i = 3; i < oilPx.length; i += 4) {
      oilSum += oilPx[i];
    }
    const waterAvg = waterSum / 100 / 3;
    const oilAvg = oilSum / 100;
    
    measurements.push({ time: elapsed, water: waterAvg, oil: oilAvg });
    
    if (measurements.length === 1) {
      console.log(`\n⏱️  t=${elapsed}s - BASELINE`);
      console.log(`   Water: ${waterAvg.toFixed(4)}`);
      console.log(`   Oil:   ${oilAvg.toFixed(4)}`);
    } else if (measurements.length <= 10) {
      const water0 = measurements[0].water;
      const oil0 = measurements[0].oil;
      const waterPct = water0 > 0 ? (waterAvg / water0 * 100) : 0;
      const oilPct = oil0 > 0 ? (oilAvg / oil0 * 100) : 0;
      console.log(`   t=${elapsed}s - Water: ${waterPct.toFixed(1)}%  Oil: ${oilPct.toFixed(1)}%`);
      
      if (measurements.length === 10) {
        console.log('\n📊 RESULT:');
        if (oilPct > waterPct + 5) {
          console.log(`   ✅ Oil persisting better! (${oilPct.toFixed(0)}% vs ${waterPct.toFixed(0)}%)`);
        } else if (waterPct > oilPct + 5) {
          console.log(`   ❌ Water persisting better! (${waterPct.toFixed(0)}% vs ${oilPct.toFixed(0)}%)`);
          console.log(`   Oil still dissipating too fast - check for bugs`);
        } else {
          console.log(`   Similar rates (${oilPct.toFixed(0)}% vs ${waterPct.toFixed(0)}%)`);
        }
        return; // Stop measuring
      }
    }
    
    setTimeout(measure, 3000); // Measure every 3 seconds
  }
  
  setTimeout(measure, 1000); // Start after 1 second
  
})();
