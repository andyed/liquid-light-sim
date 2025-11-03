// Test oil thickness immediately after painting vs after 1 second
// Run in console: paste this entire script

(function() {
  const sim = window.simulation;
  if (!sim || !sim.oil) {
    console.error('❌ No simulation/oil');
    return;
  }

  function readOilThickness() {
    const gl = sim.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, sim.oil.oilFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sim.oil.oilTexture1, 0);
    
    const w = 50, h = 50;
    const cx = Math.floor(gl.canvas.width / 2) - 25;
    const cy = Math.floor(gl.canvas.height / 2) - 25;
    const pixels = new Float32Array(w * h * 4);
    gl.readPixels(cx, cy, w, h, gl.RGBA, gl.FLOAT, pixels);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    
    let max = 0, avg = 0;
    for (let i = 3; i < pixels.length; i += 4) {
      avg += pixels[i];
      if (pixels[i] > max) max = pixels[i];
    }
    avg /= (w * h);
    
    return {max, avg};
  }

  // Paint oil NOW
  console.log('🎨 Painting oil at center...');
  sim.oil.splatColor(0.5, 0.5, {r: 1, g: 0.5, b: 0}, 0.1);
  
  // Read immediately (next frame)
  setTimeout(() => {
    const t0 = readOilThickness();
    console.log('📊 Immediately after paint:', t0);
    
    if (t0.max < 0.01) {
      console.log('❌ Oil didn\'t paint at all!');
      return;
    }
    
    // Read after 500ms
    setTimeout(() => {
      const t1 = readOilThickness();
      console.log('📊 After 500ms:', t1);
      console.log('📉 Loss:', {
        max: ((t0.max - t1.max) / t0.max * 100).toFixed(1) + '%',
        avg: ((t0.avg - t1.avg) / t0.avg * 100).toFixed(1) + '%'
      });
      
      // Read after 1000ms
      setTimeout(() => {
        const t2 = readOilThickness();
        console.log('📊 After 1000ms:', t2);
        console.log('📉 Total loss:', {
          max: ((t0.max - t2.max) / t0.max * 100).toFixed(1) + '%',
          avg: ((t0.avg - t2.avg) / t0.avg * 100).toFixed(1) + '%'
        });
        
        if (t2.max / t0.max < 0.1) {
          console.log('❌ 90%+ loss in 1 second - something is CLEARING oil!');
          console.log('\nCheck these update steps in OilLayer.js:');
          console.log('  - Coupling (copies water velocity)');
          console.log('  - Advection (moves thickness)');
          console.log('  - Smoothing (should be disabled)');
          console.log('  - Overflow (should not trigger at low occupancy)');
        }
      }, 500);
    }, 500);
  }, 100);
  
})();
