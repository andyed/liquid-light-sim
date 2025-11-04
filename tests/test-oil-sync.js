// Synchronous oil test - paste into console
const sim = window.simulation;
const oil = sim.oil;
const gl = sim.renderer.gl;

// Pause simulation
sim.paused = true;

// Paint oil
console.log('Painting oil...');
oil.splatColor(0.5, 0.5, {r: 1, g: 0.5, b: 0}, 0.1);

// Read immediately
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

console.log('Pixels with oil:', oilPixels, '/', w*h);
console.log('Max thickness:', maxThickness);

if (oilPixels > 0) {
  console.log('✅ OIL WAS PAINTED!');
} else {
  console.log('❌ OIL NOT PAINTED - splat shader not working');
}

gl.bindFramebuffer(gl.FRAMEBUFFER, null);
gl.deleteFramebuffer(tempFBO);
