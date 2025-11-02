/**
 * Read oil velocity texture to see if it contains any non-zero values
 * Paste into browser console
 */

console.log('🔍 Reading oil velocity texture...\n');

const sim = window.simulation;
const gl = sim.renderer.gl;
const oil = sim.oil;

if (!oil.oilVelocityTexture1) {
  console.error('❌ oilVelocityTexture1 not found!');
} else {
  // Create a temporary framebuffer to read the texture
  const tempFBO = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, tempFBO);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, oil.oilVelocityTexture1, 0);
  
  // Read a small sample (center 10x10 pixels)
  const w = 10, h = 10;
  const cx = Math.floor(gl.canvas.width / 2);
  const cy = Math.floor(gl.canvas.height / 2);
  
  const pixels = new Float32Array(w * h * 4); // RG32F has 4 components
  gl.readPixels(cx - w/2, cy - h/2, w, h, gl.RGBA, gl.FLOAT, pixels);
  
  // Analyze the data
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
  
  console.log(`Sampled ${w}x${h} = ${w*h} pixels from center`);
  console.log(`Non-zero velocity pixels: ${nonZeroCount}`);
  console.log(`Max velocity magnitude: ${maxMag.toFixed(6)}`);
  console.log(`Average velocity magnitude: ${(totalMag / (w*h)).toFixed(6)}`);
  
  if (nonZeroCount === 0) {
    console.log('\n❌ Oil velocity is ALL ZERO!');
    console.log('   This means either:');
    console.log('   1. Coupling shader is not running');
    console.log('   2. Coupling shader is outputting zero');
    console.log('   3. Viscosity is damping everything to zero');
  } else {
    console.log('\n✅ Oil velocity contains non-zero values');
    console.log('   The coupling IS working, but oil may not be moving for another reason');
  }
  
  // Cleanup
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteFramebuffer(tempFBO);
}
