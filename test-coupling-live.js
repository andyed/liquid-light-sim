// Test coupling in real-time

console.log("=== Live Coupling Test ===\n");

const sim = window.simulation;
const gl = sim.gl;
const oil = sim.oil;

function readPixel(fbo, texture, format = 'rgba') {
    const pixels = new Float32Array(4);
    const x = Math.floor(gl.canvas.width / 2);
    const y = Math.floor(gl.canvas.height / 2);
    
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.readPixels(x, y, 1, 1, gl.RGBA, gl.FLOAT, pixels);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    
    if (format === 'rg') return [pixels[0], pixels[1]];
    if (format === 'a') return pixels[3];
    return pixels;
}

console.log("📊 Parameters:");
console.log(`  coupling: ${sim.couplingStrength}`);
console.log(`  viscosity: ${sim.oilViscosity}, iters: ${sim.oilViscosityIterations}`);
console.log(`  surface tension: ${sim.surfaceTension}`);
console.log(`  debugAdvect with water: ${sim.debugAdvectOilWithWaterVelocity}`);

console.log("\n🎯 Paint oil and rotate, watching coupling...\n");

let count = 0;
const interval = setInterval(() => {
    const waterVel = readPixel(sim.water.velocityFBO, sim.velocityTexture1, 'rg');
    const waterMag = Math.sqrt(waterVel[0]**2 + waterVel[1]**2);
    
    const oilVelBefore = readPixel(oil.oilVelocityFBO, oil.oilVelocityTexture1, 'rg');
    const oilMagBefore = Math.sqrt(oilVelBefore[0]**2 + oilVelBefore[1]**2);
    
    const oilThick = readPixel(oil.oilFBO, oil.oilTexture1, 'a');
    
    if (oilThick > 0.01 || waterMag > 0.01) {
        console.log(`Water: ${waterMag.toFixed(4)} | Oil vel: ${oilMagBefore.toFixed(4)} | Thick: ${oilThick.toFixed(3)} | Ratio: ${waterMag > 0.001 ? (oilMagBefore/waterMag).toFixed(2) : 'N/A'}`);
    }
    
    count++;
    if (count > 30) {
        clearInterval(interval);
        console.log("\n=== Summary ===");
        console.log("Expected: Oil velocity should be 30-90% of water velocity");
        console.log("If oil vel is zero: Coupling not working");
        console.log("If ratio is very low (<10%): Coupling too weak or viscosity too high");
        console.log("\n🔧 Fixes to try:");
        console.log("simulation.couplingStrength = 2.0;  // Nuclear option");
        console.log("simulation.oilViscosity = 0.0;      // Disable viscosity");
        console.log("simulation.oilViscosityIterations = 0;");
    }
}, 200);

console.log("Monitoring for 6 seconds...");
