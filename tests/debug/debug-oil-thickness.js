// Check if oil thickness is actually there
// Run: copy paste into console

(function() {
  const sim = window.simulation;
  if (!sim || !sim.oil) {
    console.error('❌ No oil layer');
    return;
  }

  const gl = sim.gl;
  gl.bindFramebuffer(gl.FRAMEBUFFER, sim.oil.oilFBO);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sim.oil.oilTexture1, 0);
  
  // Read center 100x100 region
  const w = 100, h = 100;
  const cx = Math.floor(gl.canvas.width / 2) - 50;
  const cy = Math.floor(gl.canvas.height / 2) - 50;
  const pixels = new Float32Array(w * h * 4);
  gl.readPixels(cx, cy, w, h, gl.RGBA, gl.FLOAT, pixels);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  
  let maxThickness = 0;
  let avgThickness = 0;
  let nonZeroCount = 0;
  let sumR = 0, sumG = 0, sumB = 0;
  
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const a = pixels[i + 3]; // thickness
    
    if (a > 0.001) {
      nonZeroCount++;
      sumR += r;
      sumG += g;
      sumB += b;
    }
    
    avgThickness += a;
    if (a > maxThickness) maxThickness = a;
  }
  
  avgThickness /= (w * h);
  
  console.log('🛢️ OIL THICKNESS CHECK (center 100x100):');
  console.log('  Max thickness:', maxThickness.toFixed(4));
  console.log('  Avg thickness:', avgThickness.toFixed(4));
  console.log('  Pixels with oil:', nonZeroCount, '/', w*h);
  
  if (nonZeroCount > 0) {
    const avgR = sumR / nonZeroCount;
    const avgG = sumG / nonZeroCount;
    const avgB = sumB / nonZeroCount;
    console.log('  Avg tint (RGB):', avgR.toFixed(3), avgG.toFixed(3), avgB.toFixed(3));
  }
  
  if (maxThickness < 0.001) {
    console.log('  ❌ NO OIL DETECTED - either not painted or dissipated completely');
  } else if (maxThickness < 0.1) {
    console.log('  ⚠️ Very thin oil - either small splat or rapid dissipation');
  } else {
    console.log('  ✓ Oil present');
  }
  
  // Check settings
  console.log('\n📊 DISSIPATION SETTINGS:');
  console.log('  oilSmoothingRate:', sim.oilSmoothingRate, '(should be 0.0)');
  console.log('  oilOverflowUpper:', sim.oilOverflowUpper);
  console.log('  oilOccupancyPercent:', (sim.oilOccupancyPercent * 100).toFixed(1) + '%');
  console.log('  occupancyEveryN:', sim.occupancyEveryN);
  
  if (sim.oilSmoothingRate > 0) {
    console.log('  ❌ Oil smoothing is ENABLED - will dissipate!');
  }
  
  if (sim.oilOccupancyPercent > sim.oilOverflowUpper) {
    console.log('  ⚠️ Overflow threshold exceeded - damping active');
  }
})();
