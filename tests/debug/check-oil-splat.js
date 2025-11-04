// Check if oil splat is even working

console.log("=== Oil Splat Test ===\n");

const sim = window.simulation;
const gl = sim.gl;
const oil = sim.oil;

// Read center before and after splat
function readOilThickness() {
    const pixels = new Float32Array(4);
    const x = Math.floor(gl.canvas.width / 2);
    const y = Math.floor(gl.canvas.height / 2);
    
    gl.bindFramebuffer(gl.FRAMEBUFFER, oil.oilFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, oil.oilTexture1, 0);
    gl.readPixels(x, y, 1, 1, gl.RGBA, gl.FLOAT, pixels);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    
    return pixels[3]; // alpha = thickness
}

console.log("📊 Current state:");
console.log(`  occupancyEveryN: ${sim.occupancyEveryN}`);
console.log(`  oilOverflowUpper: ${sim.oilOverflowUpper}`);
console.log(`  Frame counter: ${sim._frameCounter}`);

const before = readOilThickness();
console.log(`\nBefore splat: thickness = ${before.toFixed(6)}`);

console.log("\n🖌️ Manually splatting oil at center...");

// Manual splat
oil.splatColor(0.5, 0.5, 1.0, 0.5, 0.0, 0.05);

const after = readOilThickness();
console.log(`After splat: thickness = ${after.toFixed(6)}`);

if (after > 0.01) {
    console.log("✅ Splat WORKED!");
    console.log("\nWatching for 3 seconds to see if it disappears...");
    
    setTimeout(() => {
        const later1 = readOilThickness();
        console.log(`After 1 second: ${later1.toFixed(6)} (change: ${(later1-after).toFixed(6)})`);
    }, 1000);
    
    setTimeout(() => {
        const later2 = readOilThickness();
        console.log(`After 2 seconds: ${later2.toFixed(6)} (change: ${(later2-after).toFixed(6)})`);
    }, 2000);
    
    setTimeout(() => {
        const later3 = readOilThickness();
        console.log(`After 3 seconds: ${later3.toFixed(6)} (change: ${(later3-after).toFixed(6)})`);
        
        if (later3 < after * 0.5) {
            console.log("\n❌ OIL IS DISAPPEARING!");
            console.log("Likely causes:");
            console.log("1. Overflow running too frequently");
            console.log("2. Advection spreading it too thin");
            console.log("3. Numerical dissipation");
            
            // Check how often overflow runs
            const framesElapsed = sim._frameCounter % sim.occupancyEveryN;
            console.log(`\nFrames until next overflow check: ${sim.occupancyEveryN - framesElapsed}`);
            console.log(`Checking every ${sim.occupancyEveryN} frames = ${(sim.occupancyEveryN/60).toFixed(2)} seconds at 60fps`);
            
            if (sim.occupancyEveryN < 60) {
                console.log("⚠️ Overflow interval TOO LOW! Should be 120+");
                console.log("Your code may not have reloaded properly.");
                console.log("\nFix: Hard refresh (Cmd+Shift+R)");
            }
        } else {
            console.log("\n✅ Oil persists! Problem is elsewhere.");
        }
    }, 3000);
    
} else {
    console.log("❌ Splat FAILED! Oil thickness still zero.");
    console.log("\nPossible causes:");
    console.log("1. FBO not bound correctly");
    console.log("2. Shader not working");
    console.log("3. Textures not created");
    
    console.log("\nChecking textures:");
    console.log(`  oilTexture1: ${oil.oilTexture1}`);
    console.log(`  oilTexture2: ${oil.oilTexture2}`);
    console.log(`  oilFBO: ${oil.oilFBO}`);
}
