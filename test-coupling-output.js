/**
 * Test if coupling shader actually outputs non-zero velocity
 * This manually runs the coupling shader and checks the output
 */

console.log('🧪 Testing coupling shader output...\n');

const sim = window.simulation;
const oil = sim.oil;
const gl = sim.renderer.gl;

// Pause simulation
sim.paused = true;

// First, ensure we have oil and water velocity
console.log('Setting up test conditions...');

// Paint oil in center
oil.splatColor(0.5, 0.5, {r: 1, g: 0, b: 0}, 0.1);
console.log('✅ Oil painted');

// Manually set some water velocity (simulate rotation)
const waterVelData = new Float32Array(gl.canvas.width * gl.canvas.height * 4);
for (let i = 0; i < waterVelData.length; i += 4) {
  waterVelData[i] = 0.1;     // vx = 0.1
  waterVelData[i + 1] = 0.05; // vy = 0.05
}
gl.bindTexture(gl.TEXTURE_2D, sim.velocityTexture1);
gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.canvas.width, gl.canvas.height, gl.RGBA, gl.FLOAT, waterVelData);
console.log('✅ Water velocity set to (0.1, 0.05)');

// Now manually run the coupling shader
console.log('\nRunning coupling shader...');
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
console.log('✅ Coupling shader executed');

// Swap textures
oil.swapOilVelocityTextures();

// Now read the oil velocity texture
const tempFBO = gl.createFramebuffer();
gl.bindFramebuffer(gl.FRAMEBUFFER, tempFBO);
gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, oil.oilVelocityTexture1, 0);

const w = 10, h = 10;
const cx = Math.floor(gl.canvas.width / 2);
const cy = Math.floor(gl.canvas.height / 2);

const pixels = new Float32Array(w * h * 4);
gl.readPixels(cx - w/2, cy - h/2, w, h, gl.RGBA, gl.FLOAT, pixels);

let nonZeroCount = 0;
let maxMag = 0;
let totalMag = 0;

for (let i = 0; i < pixels.length; i += 4) {
  const vx = pixels[i];
  const vy = pixels[i + 1];
  const mag = Math.sqrt(vx * vx + vy * vy);
  
  if (mag > 0.0001) {
    nonZeroCount++;
    totalMag += mag;
    maxMag = Math.max(maxMag, mag);
  }
}

console.log('\n📊 Results:');
console.log(`  Non-zero velocity pixels: ${nonZeroCount} / ${w*h}`);
console.log(`  Max velocity magnitude: ${maxMag.toFixed(6)}`);
console.log(`  Average velocity: ${(totalMag / (w*h)).toFixed(6)}`);

if (nonZeroCount > 0) {
  console.log('\n✅ COUPLING WORKS! Oil velocity is non-zero');
  console.log('   The problem must be elsewhere in the pipeline');
} else {
  console.log('\n❌ COUPLING FAILED! Oil velocity is still zero');
  console.log('   The coupling shader is not producing output');
  console.log('   Possible causes:');
  console.log('   1. Shader logic error');
  console.log('   2. Texture binding issue');
  console.log('   3. FBO configuration problem');
}

gl.bindFramebuffer(gl.FRAMEBUFFER, null);
gl.deleteFramebuffer(tempFBO);
