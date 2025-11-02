/**
 * Read oil thickness to see if oil actually exists where we're checking
 * Paste into browser console
 */

console.log('🔍 Reading oil thickness texture...\n');

const sim = window.simulation;
const gl = sim.renderer.gl;
const oil = sim.oil;

if (!oil.oilTexture1) {
  console.error('❌ oilTexture1 not found!');
} else {
  // Create a temporary framebuffer to read the texture
  const tempFBO = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, tempFBO);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, oil.oilTexture1, 0);
  
  // Read center area
  const w = 20, h = 20;
  const cx = Math.floor(gl.canvas.width / 2);
  const cy = Math.floor(gl.canvas.height / 2);
  
  const pixels = new Float32Array(w * h * 4); // RGBA16F
  gl.readPixels(cx - w/2, cy - h/2, w, h, gl.RGBA, gl.FLOAT, pixels);
  
  // Analyze the data
  let oilPixels = 0;
  let maxThickness = 0;
  let totalThickness = 0;
  let aboveThreshold = 0;
  
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const thickness = pixels[i + 3]; // Alpha channel = thickness
    
    if (thickness > 0.0001) {
      oilPixels++;
      totalThickness += thickness;
      maxThickness = Math.max(maxThickness, thickness);
      
      if (thickness >= 0.001) {
        aboveThreshold++;
      }
    }
  }
  
  console.log(`Sampled ${w}x${h} = ${w*h} pixels from center`);
  console.log(`Pixels with oil: ${oilPixels}`);
  console.log(`Pixels above threshold (0.001): ${aboveThreshold}`);
  console.log(`Max oil thickness: ${maxThickness.toFixed(6)}`);
  console.log(`Average oil thickness: ${(totalThickness / (w*h)).toFixed(6)}`);
  
  if (oilPixels === 0) {
    console.log('\n❌ NO OIL in sampled area!');
    console.log('   Oil may be elsewhere on canvas');
    console.log('   Try creating oil in the center of the screen');
  } else if (aboveThreshold === 0) {
    console.log('\n⚠️  Oil exists but ALL below threshold (0.001)!');
    console.log('   Coupling shader will output zero for these pixels');
    console.log('   Oil is too thin - try painting more oil');
  } else {
    console.log('\n✅ Oil exists and is above threshold');
    console.log(`   ${(aboveThreshold / (w*h) * 100).toFixed(1)}% of pixels should couple`);
    console.log('\n❌ BUT oil velocity is still zero!');
    console.log('   This means the coupling shader is NOT actually running');
    console.log('   or there is a bug in the update pipeline');
  }
  
  // Cleanup
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteFramebuffer(tempFBO);
}
