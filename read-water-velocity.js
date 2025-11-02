/**
 * Read water velocity texture to see if water is actually moving
 * Paste into browser console
 */

console.log('🔍 Reading water velocity texture...\n');

const sim = window.simulation;
const gl = sim.renderer.gl;

if (!sim.velocityTexture1) {
  console.error('❌ velocityTexture1 not found!');
} else {
  // Create a temporary framebuffer to read the texture
  const tempFBO = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, tempFBO);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sim.velocityTexture1, 0);
  
  // Read a larger sample to see overall water movement
  const w = 20, h = 20;
  const cx = Math.floor(gl.canvas.width / 2);
  const cy = Math.floor(gl.canvas.height / 2);
  
  const pixels = new Float32Array(w * h * 4);
  gl.readPixels(cx - w/2, cy - h/2, w, h, gl.RGBA, gl.FLOAT, pixels);
  
  // Analyze the data
  let nonZeroCount = 0;
  let maxMag = 0;
  let totalMag = 0;
  let maxVx = 0, maxVy = 0;
  
  for (let i = 0; i < pixels.length; i += 4) {
    const vx = pixels[i];
    const vy = pixels[i + 1];
    const mag = Math.sqrt(vx * vx + vy * vy);
    
    if (mag > 0.0001) {
      nonZeroCount++;
      totalMag += mag;
      if (mag > maxMag) {
        maxMag = mag;
        maxVx = vx;
        maxVy = vy;
      }
    }
  }
  
  console.log(`Sampled ${w}x${h} = ${w*h} pixels from center`);
  console.log(`Non-zero velocity pixels: ${nonZeroCount}`);
  console.log(`Max velocity magnitude: ${maxMag.toFixed(6)}`);
  console.log(`Max velocity vector: (${maxVx.toFixed(6)}, ${maxVy.toFixed(6)})`);
  console.log(`Average velocity magnitude: ${(totalMag / (w*h)).toFixed(6)}`);
  
  if (nonZeroCount === 0) {
    console.log('\n❌ Water velocity is ALL ZERO!');
    console.log('   Water is not moving at all');
    console.log('   Try:');
    console.log('   1. Enable rotation (press R)');
    console.log('   2. Click and drag to create water movement');
  } else {
    console.log('\n✅ Water IS moving');
    console.log(`   ${(nonZeroCount / (w*h) * 100).toFixed(1)}% of sampled pixels have velocity`);
    
    if (maxMag < 0.01) {
      console.log('   ⚠️  But velocity is very small');
    }
  }
  
  // Cleanup
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteFramebuffer(tempFBO);
}
