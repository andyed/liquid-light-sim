/**
 * Test if oil appears immediately after painting
 * This bypasses the update loop to see if splatting works
 */

console.log('🧪 Testing immediate oil painting...\n');

const sim = window.simulation;
const oil = sim.oil;
const gl = sim.renderer.gl;

// Pause simulation to prevent update loop from interfering
const wasPaused = sim.paused;
sim.paused = true;

// Paint oil in center
const centerX = 0.5;
const centerY = 0.5;
const color = { r: 1.0, g: 0.5, b: 0.0 }; // Bright orange
const radius = 0.1;

console.log('Painting oil at center...');
oil.splatColor(centerX, centerY, color, radius);

// Wait a tiny bit for GPU
setTimeout(() => {
  // Read oil texture immediately
  const tempFBO = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, tempFBO);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, oil.oilTexture1, 0);
  
  const w = 10, h = 10;
  const cx = Math.floor(gl.canvas.width / 2);
  const cy = Math.floor(gl.canvas.height / 2);
  
  const pixels = new Float32Array(w * h * 4);
  gl.readPixels(cx - w/2, cy - h/2, w, h, gl.RGBA, gl.FLOAT, pixels);
  
  let maxThickness = 0;
  let oilPixels = 0;
  
  for (let i = 0; i < pixels.length; i += 4) {
    const thickness = pixels[i + 3];
    if (thickness > 0.0001) {
      oilPixels++;
      maxThickness = Math.max(maxThickness, thickness);
    }
  }
  
  console.log(`\nResult after immediate paint:`);
  console.log(`  Pixels with oil: ${oilPixels} / ${w*h}`);
  console.log(`  Max thickness: ${maxThickness.toFixed(6)}`);
  
  if (oilPixels > 0) {
    console.log('\n✅ Oil WAS painted successfully!');
    console.log('   The problem is in the update loop');
    console.log('   Oil is being cleared/advected away');
  } else {
    console.log('\n❌ Oil was NOT painted!');
    console.log('   The splat shader is not writing to the texture');
    console.log('   Possible issues:');
    console.log('   1. FBO not properly configured');
    console.log('   2. Shader not writing to output');
    console.log('   3. Texture format incompatibility');
  }
  
  // Cleanup
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteFramebuffer(tempFBO);
  
  // Restore pause state
  sim.paused = wasPaused;
  
  console.log('\n💡 Simulation pause state restored');
}, 100);
