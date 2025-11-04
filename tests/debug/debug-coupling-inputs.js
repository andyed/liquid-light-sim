/**
 * Debug what the coupling shader is actually seeing
 */

console.log('🔍 Debugging coupling shader inputs...\n');

const sim = window.simulation;
const oil = sim.oil;
const gl = sim.renderer.gl;

// Paint oil
oil.splatColor(0.5, 0.5, {r: 1, g: 0, b: 0}, 0.1);
console.log('✅ Oil painted');

// Set water velocity
const waterVelData = new Float32Array(gl.canvas.width * gl.canvas.height * 4);
for (let i = 0; i < waterVelData.length; i += 4) {
  waterVelData[i] = 0.2;
  waterVelData[i + 1] = 0.1;
}
gl.bindTexture(gl.TEXTURE_2D, sim.velocityTexture1);
gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.canvas.width, gl.canvas.height, gl.RGBA, gl.FLOAT, waterVelData);
console.log('✅ Water velocity set');

// Read what's in each texture at center
const w = 5, h = 5;
const cx = Math.floor(gl.canvas.width / 2);
const cy = Math.floor(gl.canvas.height / 2);

function readTexture(texture, name) {
  const tempFBO = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, tempFBO);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  
  const pixels = new Float32Array(w * h * 4);
  gl.readPixels(cx - w/2, cy - h/2, w, h, gl.RGBA, gl.FLOAT, pixels);
  
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteFramebuffer(tempFBO);
  
  // Sample center pixel
  const centerIdx = Math.floor(w * h / 2) * 4;
  console.log(`${name}:`, {
    r: pixels[centerIdx].toFixed(4),
    g: pixels[centerIdx + 1].toFixed(4),
    b: pixels[centerIdx + 2].toFixed(4),
    a: pixels[centerIdx + 3].toFixed(4)
  });
}

console.log('\n📊 Texture contents at center:');
readTexture(oil.oilTexture1, 'oilTexture1 (thickness in alpha)');
readTexture(oil.oilVelocityTexture1, 'oilVelocityTexture1');
readTexture(sim.velocityTexture1, 'waterVelocityTexture1');

console.log('\n💡 The coupling shader reads from these three textures.');
console.log('   If oil thickness alpha is > 0.001 and water velocity is non-zero,');
console.log('   coupling should produce non-zero oil velocity.');
