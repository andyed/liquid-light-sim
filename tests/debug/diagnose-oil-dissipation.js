// Diagnose: Why is oil dissipating instead of moving?

console.log("=== Oil Dissipation Diagnostic ===\n");

if (!window.simulation) {
    console.error("Simulation not found!");
} else {
    const sim = simulation;
    const oil = sim.oil;
    const gl = sim.gl;
    
    console.log("📊 Current Parameters:");
    console.log(`  Surface tension: ${sim.surfaceTension}`);
    console.log(`  Coupling strength: ${sim.couplingStrength}`);
    console.log(`  Oil viscosity: ${sim.oilViscosity}`);
    console.log(`  Oil overflow upper: ${sim.oilOverflowUpper}`);
    console.log(`  Oil overflow lower: ${sim.oilOverflowLower}`);
    console.log(`  Occupancy check interval: ${sim.occupancyEveryN} frames`);
    
    // Helper to read texture
    function readTexture(fbo, texture, channel = 'all') {
        const pixels = new Float32Array(4);
        const centerX = Math.floor(gl.canvas.width / 2);
        const centerY = Math.floor(gl.canvas.height / 2);
        
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
        gl.readPixels(centerX, centerY, 1, 1, gl.RGBA, gl.FLOAT, pixels);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        
        if (channel === 'rg') return [pixels[0], pixels[1]];
        if (channel === 'a') return pixels[3];
        return pixels;
    }
    
    console.log("\n🔬 Taking measurements in 2 seconds...");
    console.log("   (Paint oil in center NOW)");
    
    setTimeout(() => {
        console.log("\n📸 Snapshot at center:");
        
        // Oil thickness
        const oilThickness = readTexture(oil.oilFBO, oil.oilTexture1, 'a');
        console.log(`  Oil thickness: ${oilThickness.toFixed(6)}`);
        
        // Oil velocity
        const oilVel = readTexture(oil.oilVelocityFBO, oil.oilVelocityTexture1, 'rg');
        const oilVelMag = Math.sqrt(oilVel[0]**2 + oilVel[1]**2);
        console.log(`  Oil velocity: (${oilVel[0].toFixed(4)}, ${oilVel[1].toFixed(4)}) mag=${oilVelMag.toFixed(4)}`);
        
        // Water velocity
        const waterVel = readTexture(sim.water.velocityFBO, sim.velocityTexture1, 'rg');
        const waterVelMag = Math.sqrt(waterVel[0]**2 + waterVel[1]**2);
        console.log(`  Water velocity: (${waterVel[0].toFixed(4)}, ${waterVel[1].toFixed(4)}) mag=${waterVelMag.toFixed(4)}`);
        
        // Oil properties
        if (oil.oilPropsTexture1) {
            const props = readTexture(oil.oilPropsFBO, oil.oilPropsTexture1);
            console.log(`  Oil props: coupling=${props[0].toFixed(3)}, visc=${props[1].toFixed(3)}, tension=${props[2].toFixed(6)}`);
        }
        
        console.log("\n🎬 Taking second measurement in 3 seconds...");
        console.log("   (Start rotating NOW)");
        
        setTimeout(() => {
            console.log("\n📸 After 3 seconds:");
            
            const oilThickness2 = readTexture(oil.oilFBO, oil.oilTexture1, 'a');
            console.log(`  Oil thickness: ${oilThickness2.toFixed(6)} (was ${oilThickness.toFixed(6)})`);
            
            const oilVel2 = readTexture(oil.oilVelocityFBO, oil.oilVelocityTexture1, 'rg');
            const oilVelMag2 = Math.sqrt(oilVel2[0]**2 + oilVel2[1]**2);
            console.log(`  Oil velocity: (${oilVel2[0].toFixed(4)}, ${oilVel2[1].toFixed(4)}) mag=${oilVelMag2.toFixed(4)}`);
            
            const waterVel2 = readTexture(sim.water.velocityFBO, sim.velocityTexture1, 'rg');
            const waterVelMag2 = Math.sqrt(waterVel2[0]**2 + waterVel2[1]**2);
            console.log(`  Water velocity: (${waterVel2[0].toFixed(4)}, ${waterVel2[1].toFixed(4)}) mag=${waterVelMag2.toFixed(4)}`);
            
            console.log("\n📊 Analysis:");
            
            const thicknessDelta = oilThickness2 - oilThickness;
            console.log(`  Thickness change: ${thicknessDelta >= 0 ? '+' : ''}${thicknessDelta.toFixed(6)}`);
            if (thicknessDelta < -0.01) {
                console.log("  ⚠️  DISSIPATING: Oil is losing thickness!");
                console.log("     Possible causes:");
                console.log("     - Oil overflow too aggressive");
                console.log("     - Advection spreading it thin");
                console.log("     - Numerical diffusion");
            }
            
            if (oilVelMag2 < 0.001) {
                console.log("  ❌ NO VELOCITY: Oil has no velocity!");
                console.log("     Possible causes:");
                console.log("     - Coupling not working");
                console.log("     - Viscosity too high");
                console.log("     - Surface tension locking it");
            } else if (oilThickness2 > 0.01 && oilVelMag2 > 0.01) {
                console.log("  ✅ HAS VELOCITY: Oil velocity looks good");
                if (thicknessDelta < -0.001) {
                    console.log("     But thickness is decreasing - oil is moving away or fading");
                }
            }
            
            if (waterVelMag2 < 0.001) {
                console.log("  ⚠️  Water not moving - try rotating!");
            }
            
            console.log("\n🔧 Quick Fixes to Try:");
            console.log("  // Disable surface tension completely:");
            console.log("  simulation.surfaceTension = 0.0;");
            console.log("");
            console.log("  // Increase coupling:");
            console.log("  simulation.couplingStrength = 1.0;");
            console.log("");
            console.log("  // Reduce viscosity:");
            console.log("  simulation.oilViscosity = 0.05;");
            console.log("  simulation.oilViscosityIterations = 20;");
            console.log("");
            console.log("  // Disable oil overflow:");
            console.log("  simulation.oilOverflowUpper = 0.99;");
            
        }, 3000);
        
    }, 2000);
}
