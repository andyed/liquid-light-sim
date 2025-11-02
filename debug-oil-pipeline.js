// Debug entire oil pipeline step by step

console.log("=== Oil Pipeline Debug ===\n");

const sim = window.simulation;
const gl = sim.gl;
const oil = sim.oil;

// Helper to read center pixel
function readCenter(fbo, texture, format = 'rgba') {
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

console.log("Paint oil blob in center, then rotate...");
console.log("");

let measureCount = 0;
const measurements = [];

const interval = setInterval(() => {
    measureCount++;
    
    const waterVel = readCenter(sim.water.velocityFBO, sim.velocityTexture1, 'rg');
    const waterMag = Math.sqrt(waterVel[0]**2 + waterVel[1]**2);
    
    const oilVel = readCenter(oil.oilVelocityFBO, oil.oilVelocityTexture1, 'rg');
    const oilVelMag = Math.sqrt(oilVel[0]**2 + oilVel[1]**2);
    
    const oilThick = readCenter(oil.oilFBO, oil.oilTexture1, 'a');
    
    measurements.push({
        frame: sim._frameCounter,
        waterMag,
        oilVelMag,
        oilThick
    });
    
    console.log(`Frame ${sim._frameCounter}: water=${waterMag.toFixed(4)}, oilVel=${oilVelMag.toFixed(4)}, thick=${oilThick.toFixed(4)}`);
    
    if (measureCount >= 20) {
        clearInterval(interval);
        console.log("\n=== ANALYSIS ===");
        
        const hasWaterMotion = measurements.some(m => m.waterMag > 0.01);
        const hasOilVelocity = measurements.some(m => m.oilVelMag > 0.001);
        const hasOilThickness = measurements.some(m => m.oilThick > 0.01);
        
        console.log(`Water moving: ${hasWaterMotion ? '✅ YES' : '❌ NO'}`);
        console.log(`Oil has velocity: ${hasOilVelocity ? '✅ YES' : '❌ NO'}`);
        console.log(`Oil present: ${hasOilThickness ? '✅ YES' : '❌ NO'}`);
        
        if (hasWaterMotion && !hasOilVelocity && hasOilThickness) {
            console.log("\n❌ PROBLEM: Water moving but oil has NO velocity");
            console.log("   This means coupling is NOT working");
            console.log("\nTry these fixes:");
            console.log("1. simulation.couplingStrength = 2.0;  // Very high");
            console.log("2. simulation.oilViscosity = 0.01;    // Very low");
            console.log("3. simulation.oilViscosityIterations = 5;");
            console.log("4. simulation.debugAdvectOilWithWaterVelocity = true;  // Force water velocity");
        }
        
        if (!hasWaterMotion) {
            console.log("\n⚠️ Water not moving - start rotation!");
        }
        
        if (hasOilVelocity && hasOilThickness) {
            console.log("\n✅ Oil HAS velocity!");
            console.log("   If it's not moving visually, problem is in:");
            console.log("   - Advection shader");
            console.log("   - Rendering");
            console.log("   - MacCormack instability");
            console.log("\nTry: simulation.useMacCormack = false;");
        }
    }
}, 200);

console.log("Measuring for 4 seconds...");
