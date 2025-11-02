// Check if oil velocity has actual values

console.log("=== Oil Velocity Check ===\n");

const sim = window.simulation;
const gl = sim.gl;
const oil = sim.oil;

function readVelocity(fbo, texture) {
    const pixels = new Float32Array(4);
    const x = Math.floor(gl.canvas.width / 2);
    const y = Math.floor(gl.canvas.height / 2);
    
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.readPixels(x, y, 1, 1, gl.RGBA, gl.FLOAT, pixels);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    
    return [pixels[0], pixels[1]];
}

console.log("🔍 Debug flags:");
console.log(`  debugAdvectOilWithWaterVelocity: ${sim.debugAdvectOilWithWaterVelocity}`);
console.log(`  debugCopyWaterToOil: ${sim.debugCopyWaterToOil}`);

console.log("\n📊 Current parameters:");
console.log(`  couplingStrength: ${sim.couplingStrength}`);
console.log(`  surfaceTension: ${sim.surfaceTension}`);

console.log("\n🎬 Paint oil and rotate, then watching velocity...\n");

let count = 0;
const interval = setInterval(() => {
    const waterVel = readVelocity(sim.water.velocityFBO, sim.velocityTexture1);
    const waterMag = Math.sqrt(waterVel[0]**2 + waterVel[1]**2);
    
    const oilVel = readVelocity(oil.oilVelocityFBO, oil.oilVelocityTexture1);
    const oilMag = Math.sqrt(oilVel[0]**2 + oilVel[1]**2);
    
    if (waterMag > 0.01 || oilMag > 0.001) {
        console.log(`Water: (${waterVel[0].toFixed(4)}, ${waterVel[1].toFixed(4)}) mag=${waterMag.toFixed(4)}`);
        console.log(`Oil:   (${oilVel[0].toFixed(4)}, ${oilVel[1].toFixed(4)}) mag=${oilMag.toFixed(4)}`);
        console.log(`Ratio: ${waterMag > 0.001 ? (oilMag/waterMag*100).toFixed(1) : '0'}%\n`);
    }
    
    count++;
    if (count > 20) {
        clearInterval(interval);
        
        console.log("\n=== Diagnosis ===");
        if (oilMag < 0.0001) {
            console.log("❌ OIL HAS NO VELOCITY AT ALL");
            console.log("\nPossible causes:");
            console.log("1. Coupling shader not working");
            console.log("2. Oil velocity textures not initialized");
            console.log("3. Coupling strength effectively zero");
            console.log("\nTry:");
            console.log("simulation.couplingStrength = 1.5;");
        } else if (oilMag < waterMag * 0.1) {
            console.log("⚠️ Oil velocity too weak (< 10% of water)");
            console.log("simulation.couplingStrength = 1.5;");
        } else {
            console.log("✅ Oil has velocity!");
            console.log("Problem must be in advection or rendering");
            console.log("\nCheck:");
            console.log("console.log(simulation.debugAdvectOilWithWaterVelocity);");
        }
    }
}, 300);

console.log("Monitoring for 6 seconds...");
