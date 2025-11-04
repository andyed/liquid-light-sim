// Check if oil is getting velocity from water
(function() {
  const sim = window.simulation;
  if (!sim || !sim.oil) return;

  function readVel(fbo, tex) {
    const gl = sim.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const px = new Float32Array(4);
    const cx = Math.floor(gl.canvas.width / 2);
    const cy = Math.floor(gl.canvas.height / 2);
    gl.readPixels(cx, cy, 1, 1, gl.RGBA, gl.FLOAT, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return {vx: px[0], vy: px[1], mag: Math.sqrt(px[0]*px[0] + px[1]*px[1])};
  }

  const water = readVel(sim.water.velocityFBO, sim.water.velocityTexture1);
  const oil = readVel(sim.oil.oilVelocityFBO, sim.oil.oilVelocityTexture1);

  console.log('VELOCITY CHECK (center pixel):');
  console.log('Water:', water);
  console.log('Oil:', oil);
  console.log('Ratio:', oil.mag / water.mag);
  console.log('\nSettings:');
  console.log('  couplingStrength:', sim.couplingStrength);
  console.log('  rotationBase:', sim.rotationBase);
  
  if (water.mag > 0.01 && oil.mag < 0.001) {
    console.log('\n❌ COUPLING BROKEN! Water moving but oil static.');
  } else if (oil.mag / water.mag < 0.1) {
    console.log('\n⚠️ Oil moving very slowly compared to water');
  } else {
    console.log('\n✓ Oil coupled to water');
  }
})();
