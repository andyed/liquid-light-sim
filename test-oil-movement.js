// Test if oil is moving or static
// Run in console after painting oil

(function() {
  const sim = window.simulation;
  if (!sim || !sim.oil) {
    console.error('❌ No simulation/oil');
    return;
  }

  function readOilVelocity() {
    const gl = sim.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, sim.oil.oilVelocityFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sim.oil.oilVelocityTexture1, 0);
    
    const w = 50, h = 50;
    const cx = Math.floor(gl.canvas.width / 2) - 25;
    const cy = Math.floor(gl.canvas.height / 2) - 25;
    const pixels = new Float32Array(w * h * 4);
    gl.readPixels(cx, cy, w, h, gl.RGBA, gl.FLOAT, pixels);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    
    let maxVel = 0, avgVel = 0, count = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const vx = pixels[i];
      const vy = pixels[i + 1];
      const vel = Math.sqrt(vx * vx + vy * vy);
      if (vel > 0.001) {
        avgVel += vel;
        count++;
      }
      if (vel > maxVel) maxVel = vel;
    }
    avgVel = count > 0 ? avgVel / count : 0;
    
    return {max: maxVel, avg: avgVel, count};
  }

  function readWaterVelocity() {
    const gl = sim.gl;
    const water = sim.water;
    gl.bindFramebuffer(gl.FRAMEBUFFER, water.velocityFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, water.velocityTexture1, 0);
    
    const w = 50, h = 50;
    const cx = Math.floor(gl.canvas.width / 2) - 25;
    const cy = Math.floor(gl.canvas.height / 2) - 25;
    const pixels = new Float32Array(w * h * 4);
    gl.readPixels(cx, cy, w, h, gl.RGBA, gl.FLOAT, pixels);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    
    let maxVel = 0, avgVel = 0, count = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const vx = pixels[i];
      const vy = pixels[i + 1];
      const vel = Math.sqrt(vx * vx + vy * vy);
      if (vel > 0.001) {
        avgVel += vel;
        count++;
      }
      if (vel > maxVel) maxVel = vel;
    }
    avgVel = count > 0 ? avgVel / count : 0;
    
    return {max: maxVel, avg: avgVel, count};
  }

  console.log('🌊 VELOCITY CHECK (center 50x50):');
  
  const water = readWaterVelocity();
  console.log('Water velocity:', water);
  
  const oil = readOilVelocity();
  console.log('Oil velocity:', oil);
  
  console.log('\n⚙️ SETTINGS:');
  console.log('  rotationBase:', sim.rotationBase);
  console.log('  rotationAmount:', sim.rotationAmount);
  console.log('  couplingStrength:', sim.couplingStrength);
  console.log('  oilViscosity:', sim.oilViscosity);
  
  if (water.max < 0.01) {
    console.log('\n❌ Water velocity ZERO - no ambient flow!');
    console.log('   Check rotationBase should be 0.12');
  }
  
  if (oil.max < 0.001 && water.max > 0.01) {
    console.log('\n❌ Oil velocity ZERO but water moving - coupling broken!');
    console.log('   Check coupling shader');
  }
  
  if (oil.max > 0 && water.max > 0) {
    const ratio = oil.avg / water.avg;
    console.log('\n✓ Both moving. Oil/Water ratio:', ratio.toFixed(2));
    if (ratio < 0.3) {
      console.log('  ⚠️ Oil moving much slower than water - weak coupling?');
    }
  }
  
})();
