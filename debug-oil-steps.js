// Track oil thickness loss through update steps
// Run: window.DEBUG_OIL_STEPS = true; then paint oil and watch console

(function() {
  const sim = window.simulation;
  if (!sim || !sim.oil) {
    console.error('❌ No simulation/oil');
    return;
  }

  function measureOilThickness(label) {
    const gl = sim.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, sim.oil.oilFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sim.oil.oilTexture1, 0);
    
    const w = 100, h = 100;
    const cx = Math.floor(gl.canvas.width / 2) - 50;
    const cy = Math.floor(gl.canvas.height / 2) - 50;
    const pixels = new Float32Array(w * h * 4);
    gl.readPixels(cx, cy, w, h, gl.RGBA, gl.FLOAT, pixels);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    
    let total = 0, max = 0;
    for (let i = 3; i < pixels.length; i += 4) {
      total += pixels[i];
      if (pixels[i] > max) max = pixels[i];
    }
    
    return {label, total: total.toFixed(1), max: max.toFixed(3)};
  }

  // Intercept OilLayer.update
  const originalUpdate = sim.oil.update.bind(sim.oil);
  let frameCount = 0;
  
  sim.oil.update = function(dt) {
    if (!window.DEBUG_OIL_STEPS) {
      return originalUpdate(dt);
    }
    
    frameCount++;
    if (frameCount % 60 !== 0) {
      return originalUpdate(dt);  
    }
    
    console.log('\n🔍 OIL UPDATE TRACKING (frame ' + frameCount + '):');
    
    const before = measureOilThickness('START');
    console.log(`  ${before.label}: total=${before.total}, max=${before.max}`);
    
    // Run original update
    originalUpdate(dt);
    
    const after = measureOilThickness('END');
    console.log(`  ${after.label}: total=${after.total}, max=${after.max}`);
    
    const loss = parseFloat(before.total) - parseFloat(after.total);
    const lossPercent = (loss / parseFloat(before.total) * 100).toFixed(1);
    
    if (loss > 0.1) {
      console.log(`  ❌ LOSS: ${loss.toFixed(1)} (${lossPercent}% per update)`);
    } else {
      console.log(`  ✓ Stable`);
    }
  };
  
  console.log('✅ Oil step debugging enabled');
  console.log('Now paint oil and watch for per-frame loss');
  console.log('To disable: window.DEBUG_OIL_STEPS = false');
  
  window.DEBUG_OIL_STEPS = true;
})();
