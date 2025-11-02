/**
 * Check oil thickness after letting the simulation run
 * This will tell us if oil is disappearing during update
 */

console.log('🧪 Checking oil persistence through update loop...\n');

const sim = window.simulation;
const oil = sim.oil;
const gl = sim.renderer.gl;

// Paint oil
console.log('Painting oil...');
oil.splatColor(0.5, 0.5, {r: 1, g: 0, b: 0}, 0.1);

// Read immediately
function readOilThickness() {
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
  let totalThickness = 0;
  
  for (let i = 0; i < pixels.length; i += 4) {
    const thickness = pixels[i + 3];
    if (thickness > 0.0001) {
      oilPixels++;
      totalThickness += thickness;
      maxThickness = Math.max(maxThickness, thickness);
    }
  }
  
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteFramebuffer(tempFBO);
  
  return { oilPixels, maxThickness, avgThickness: totalThickness / (w * h) };
}

// Check immediately
const before = readOilThickness();
console.log('Immediately after paint:', before);

// Wait for a few frames
setTimeout(() => {
  const after = readOilThickness();
  console.log('After ~100ms of simulation:', after);
  
  const pixelLoss = before.oilPixels - after.oilPixels;
  const thicknessLoss = before.maxThickness - after.maxThickness;
  
  console.log('\n📊 Analysis:');
  console.log(`  Pixel loss: ${pixelLoss} (${(pixelLoss / before.oilPixels * 100).toFixed(1)}%)`);
  console.log(`  Thickness loss: ${thicknessLoss.toFixed(6)} (${(thicknessLoss / before.maxThickness * 100).toFixed(1)}%)`);
  
  if (after.oilPixels === 0) {
    console.log('\n❌ ALL OIL DISAPPEARED!');
    console.log('   Oil is being cleared by the update loop');
    console.log('   Possible causes:');
    console.log('   - Overflow control is too aggressive');
    console.log('   - Surface tension is collapsing oil');
    console.log('   - Advection is moving oil out of bounds');
  } else if (thicknessLoss > 0.5) {
    console.log('\n⚠️  Oil is thinning rapidly');
    console.log('   Check overflow thresholds and surface tension');
  } else {
    console.log('\n✅ Oil is persisting');
    console.log('   The issue must be in rendering/visibility');
  }
}, 100);
