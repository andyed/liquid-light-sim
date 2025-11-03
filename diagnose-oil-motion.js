// Diagnose why oil isn't moving
// Run in browser console: fetch('diagnose-oil-motion.js').then(r => r.text()).then(eval)

(function() {
  const sim = window.simulation;
  if (!sim) {
    console.error('❌ window.simulation not found');
    return;
  }

  console.log('🔍 OIL MOTION DIAGNOSTIC\n');
  
  // 1. Check if oil is enabled
  console.log('1️⃣ OIL LAYER STATUS');
  console.log('  useOil:', sim.useOil);
  console.log('  oil layer exists:', !!sim.oil);
  console.log('  oil ready:', sim.oil?.ready || 'N/A');
  
  // 2. Check coupling strength
  console.log('\n2️⃣ COUPLING SETTINGS');
  console.log('  couplingStrength:', sim.couplingStrength);
  console.log('  (should be 0.6-0.8 for oil materials)');
  
  // 3. Check overflow settings
  console.log('\n3️⃣ OVERFLOW SETTINGS');
  console.log('  oilOverflowUpper:', sim.oilOverflowUpper);
  console.log('  oilOverflowLower:', sim.oilOverflowLower);
  console.log('  occupancyEveryN:', sim.occupancyEveryN);
  console.log('  oilOccupancyPercent:', (sim.oilOccupancyPercent * 100).toFixed(1) + '%');
  
  // 4. Check smoothing (should be 0)
  console.log('\n4️⃣ SMOOTHING (should be 0)');
  console.log('  oilSmoothingRate:', sim.oilSmoothingRate);
  
  // 5. Read actual oil velocity values
  console.log('\n5️⃣ CHECKING OIL VELOCITY');
  const gl = sim.gl;
  if (sim.oil && sim.oil.oilVelocityFBO && sim.oil.oilVelocityTexture1) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, sim.oil.oilVelocityFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sim.oil.oilVelocityTexture1, 0);
    
    const w = 20, h = 20;
    const cx = Math.floor(gl.canvas.width / 2) - 10;
    const cy = Math.floor(gl.canvas.height / 2) - 10;
    const pixels = new Float32Array(w * h * 4);
    gl.readPixels(cx, cy, w, h, gl.RGBA, gl.FLOAT, pixels);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    
    let sumVx = 0, sumVy = 0, maxMag = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const vx = pixels[i];
      const vy = pixels[i + 1];
      sumVx += vx;
      sumVy += vy;
      const mag = Math.sqrt(vx*vx + vy*vy);
      if (mag > maxMag) maxMag = mag;
    }
    const avgVx = sumVx / (w * h);
    const avgVy = sumVy / (w * h);
    const avgMag = Math.sqrt(avgVx*avgVx + avgVy*avgVy);
    
    console.log('  Center 20x20 oil velocity:');
    console.log('    Average: (', avgVx.toFixed(4), ',', avgVy.toFixed(4), ')');
    console.log('    Avg magnitude:', avgMag.toFixed(4));
    console.log('    Max magnitude:', maxMag.toFixed(4));
    if (maxMag < 0.001) {
      console.log('  ⚠️ OIL VELOCITY NEAR ZERO - OIL NOT MOVING!');
    } else {
      console.log('  ✓ Oil has velocity');
    }
  }
  
  // 6. Check water velocity for comparison
  console.log('\n6️⃣ CHECKING WATER VELOCITY (for comparison)');
  if (sim.velocityTexture1 && sim.water?.velocityFBO) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, sim.water.velocityFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sim.velocityTexture1, 0);
    
    const w = 20, h = 20;
    const cx = Math.floor(gl.canvas.width / 2) - 10;
    const cy = Math.floor(gl.canvas.height / 2) - 10;
    const pixels = new Float32Array(w * h * 4);
    gl.readPixels(cx, cy, w, h, gl.RGBA, gl.FLOAT, pixels);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    
    let sumVx = 0, sumVy = 0, maxMag = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const vx = pixels[i];
      const vy = pixels[i + 1];
      sumVx += vx;
      sumVy += vy;
      const mag = Math.sqrt(vx*vx + vy*vy);
      if (mag > maxMag) maxMag = mag;
    }
    const avgVx = sumVx / (w * h);
    const avgVy = sumVy / (w * h);
    const avgMag = Math.sqrt(avgVx*avgVx + avgVy*avgVy);
    
    console.log('  Center 20x20 water velocity:');
    console.log('    Average: (', avgVx.toFixed(4), ',', avgVy.toFixed(4), ')');
    console.log('    Avg magnitude:', avgMag.toFixed(4));
    console.log('    Max magnitude:', maxMag.toFixed(4));
    if (maxMag < 0.001) {
      console.log('  ⚠️ Water also has no velocity - need to add rotation/paint');
    }
  }
  
  // 7. Check oil thickness
  console.log('\n7️⃣ CHECKING OIL THICKNESS');
  if (sim.oil && sim.oil.oilFBO && sim.oil.oilTexture1) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, sim.oil.oilFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sim.oil.oilTexture1, 0);
    
    const w = 20, h = 20;
    const cx = Math.floor(gl.canvas.width / 2) - 10;
    const cy = Math.floor(gl.canvas.height / 2) - 10;
    const pixels = new Float32Array(w * h * 4);
    gl.readPixels(cx, cy, w, h, gl.RGBA, gl.FLOAT, pixels);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    
    let sumThickness = 0, maxThickness = 0;
    for (let i = 3; i < pixels.length; i += 4) {
      const thickness = pixels[i];
      sumThickness += thickness;
      if (thickness > maxThickness) maxThickness = thickness;
    }
    const avgThickness = sumThickness / (w * h);
    
    console.log('  Center 20x20 oil thickness (alpha):');
    console.log('    Average:', avgThickness.toFixed(4));
    console.log('    Max:', maxThickness.toFixed(4));
    if (maxThickness < 0.001) {
      console.log('  ⚠️ NO OIL PAINTED - paint some oil first!');
    }
  }
  
  console.log('\n📋 RECOMMENDATIONS:');
  if (sim.couplingStrength < 0.1) {
    console.log('  ⚠️ Coupling strength is very low:', sim.couplingStrength);
    console.log('     Try: simulation.couplingStrength = 0.7');
  }
  if (!sim.useOil || !sim.oil) {
    console.log('  ⚠️ Oil layer not enabled!');
    console.log('     Try pressing keys 2-5 to select an oil material');
  }
  if (sim.oilSmoothingRate > 0.0001) {
    console.log('  ⚠️ Oil smoothing is enabled, will dissipate thickness');
    console.log('     Try: simulation.oilSmoothingRate = 0.0');
  }
  
  console.log('\n🧪 QUICK FIX TEST:');
  console.log('  1. Press key "2" (Mineral Oil)');
  console.log('  2. Paint some oil (left click)');
  console.log('  3. Hold "R" to rotate - watch if oil moves with water');
  console.log('  4. Re-run this diagnostic to see velocity values');
  
})();
