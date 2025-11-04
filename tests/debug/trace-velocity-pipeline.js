/**
 * Trace oil velocity through the update pipeline
 * This will show where velocity is being lost
 */

console.log('🔍 Tracing oil velocity through update pipeline...\n');

const sim = window.simulation;
const oil = sim.oil;
const gl = sim.renderer.gl;

// Helper to read velocity
function readVelocity() {
  const tempFBO = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, tempFBO);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, oil.oilVelocityTexture1, 0);
  
  const w = 5, h = 5;
  const cx = Math.floor(gl.canvas.width / 2);
  const cy = Math.floor(gl.canvas.height / 2);
  
  const pixels = new Float32Array(w * h * 4);
  gl.readPixels(cx - w/2, cy - h/2, w, h, gl.RGBA, gl.FLOAT, pixels);
  
  let maxMag = 0;
  let totalMag = 0;
  let count = 0;
  
  for (let i = 0; i < pixels.length; i += 4) {
    const vx = pixels[i];
    const vy = pixels[i + 1];
    const mag = Math.sqrt(vx * vx + vy * vy);
    if (mag > 0.0001) {
      count++;
      totalMag += mag;
      maxMag = Math.max(maxMag, mag);
    }
  }
  
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteFramebuffer(tempFBO);
  
  return { count, maxMag, avgMag: totalMag / (w * h) };
}

// Paint oil and set water velocity
console.log('Setting up...');
oil.splatColor(0.5, 0.5, {r: 1, g: 0, b: 0}, 0.1);

// Manually set water velocity
const waterVelData = new Float32Array(gl.canvas.width * gl.canvas.height * 4);
for (let i = 0; i < waterVelData.length; i += 4) {
  waterVelData[i] = 0.2;
  waterVelData[i + 1] = 0.1;
}
gl.bindTexture(gl.TEXTURE_2D, sim.velocityTexture1);
gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.canvas.width, gl.canvas.height, gl.RGBA, gl.FLOAT, waterVelData);

console.log('Initial oil velocity:', readVelocity());

// Manually run just the coupling step
console.log('\nRunning coupling step...');
gl.useProgram(sim.oilCouplingProgram);
gl.bindFramebuffer(gl.FRAMEBUFFER, oil.oilVelocityFBO);
gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, oil.oilVelocityTexture2, 0);

gl.bindBuffer(gl.ARRAY_BUFFER, sim.renderer.quadBuffer);
const pos = gl.getAttribLocation(sim.oilCouplingProgram, 'a_position');
gl.enableVertexAttribArray(pos);
gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

gl.activeTexture(gl.TEXTURE0);
gl.bindTexture(gl.TEXTURE_2D, oil.oilVelocityTexture1);
gl.uniform1i(gl.getUniformLocation(sim.oilCouplingProgram, 'u_oilVelocity'), 0);

gl.activeTexture(gl.TEXTURE1);
gl.bindTexture(gl.TEXTURE_2D, sim.velocityTexture1);
gl.uniform1i(gl.getUniformLocation(sim.oilCouplingProgram, 'u_waterVelocity'), 1);

gl.activeTexture(gl.TEXTURE2);
gl.bindTexture(gl.TEXTURE_2D, oil.oilTexture1);
gl.uniform1i(gl.getUniformLocation(sim.oilCouplingProgram, 'u_oil'), 2);

gl.uniform1f(gl.getUniformLocation(sim.oilCouplingProgram, 'u_couplingStrength'), 0.5);
gl.uniform1f(gl.getUniformLocation(sim.oilCouplingProgram, 'u_dt'), 0.016);

gl.drawArrays(gl.TRIANGLES, 0, 6);
oil.swapOilVelocityTextures();

console.log('After coupling:', readVelocity());

// Now let ONE real update cycle run
console.log('\nLetting one update cycle run...');
sim.paused = false;
setTimeout(() => {
  sim.paused = true;
  console.log('After one update cycle:', readVelocity());
  
  console.log('\n📊 Analysis:');
  console.log('If velocity is zero after update cycle, something in the');
  console.log('update pipeline is clearing it. Check:');
  console.log('- Advection step');
  console.log('- Viscosity step');  
  console.log('- Surface tension');
  console.log('- Self-attraction');
}, 50);
