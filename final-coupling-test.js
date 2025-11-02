/**
 * Final test: Check coupling with REAL water rotation
 * Instructions:
 * 1. Press 2 for Mineral Oil
 * 2. Paint some oil in the center
 * 3. Press R to enable rotation
 * 4. Wait 1 second for water to start moving
 * 5. Run this script
 */

console.log('🔍 Final coupling test with real water rotation...\n');

const sim = window.simulation;
const oil = sim.oil;
const gl = sim.renderer.gl;

// Check if rotation is enabled
console.log('Rotation enabled:', sim.rotationBase !== 0 || sim.rotationDelta !== 0);
console.log('Rotation amount:', sim.rotationAmount);

// Read water velocity
function readWaterVel() {
  const tempFBO = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, tempFBO);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sim.velocityTexture1, 0);
  
  const w = 20, h = 20;
  const cx = Math.floor(gl.canvas.width / 2);
  const cy = Math.floor(gl.canvas.height / 2);
  
  const pixels = new Float32Array(w * h * 4);
  gl.readPixels(cx - w/2, cy - h/2, w, h, gl.RGBA, gl.FLOAT, pixels);
  
  let maxMag = 0;
  let count = 0;
  
  for (let i = 0; i < pixels.length; i += 4) {
    const vx = pixels[i];
    const vy = pixels[i + 1];
    const mag = Math.sqrt(vx * vx + vy * vy);
    if (mag > 0.001) {
      count++;
      maxMag = Math.max(maxMag, mag);
    }
  }
  
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteFramebuffer(tempFBO);
  
  return { count, maxMag };
}

// Read oil velocity
function readOilVel() {
  const tempFBO = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, tempFBO);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, oil.oilVelocityTexture1, 0);
  
  const w = 20, h = 20;
  const cx = Math.floor(gl.canvas.width / 2);
  const cy = Math.floor(gl.canvas.height / 2);
  
  const pixels = new Float32Array(w * h * 4);
  gl.readPixels(cx - w/2, cy - h/2, w, h, gl.RGBA, gl.FLOAT, pixels);
  
  let maxMag = 0;
  let count = 0;
  
  for (let i = 0; i < pixels.length; i += 4) {
    const vx = pixels[i];
    const vy = pixels[i + 1];
    const mag = Math.sqrt(vx * vx + vy * vy);
    if (mag > 0.001) {
      count++;
      maxMag = Math.max(maxMag, mag);
    }
  }
  
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteFramebuffer(tempFBO);
  
  return { count, maxMag };
}

const waterVel = readWaterVel();
const oilVel = readOilVel();

console.log('\n📊 Results:');
console.log('Water velocity:', waterVel);
console.log('Oil velocity:', oilVel);
console.log('Coupling strength:', sim.couplingStrength);

if (waterVel.count === 0) {
  console.log('\n❌ Water is NOT moving!');
  console.log('   Enable rotation (press R) and wait a moment');
} else if (oilVel.count === 0) {
  console.log('\n❌ Water IS moving but oil velocity is ZERO!');
  console.log('   The coupling is NOT working in the real update loop');
  console.log('   This is the bug we need to fix');
} else {
  console.log('\n✅ Both water and oil have velocity!');
  console.log(`   Oil should be moving (ratio: ${(oilVel.maxMag / waterVel.maxMag * 100).toFixed(1)}% of water)`);
}
