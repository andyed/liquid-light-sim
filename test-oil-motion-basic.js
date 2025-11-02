// Test: Does oil move with just coupling (no surface tension)?
// This tests if the core advection pipeline works without surface tension force

console.log("=== Testing Basic Oil Motion (No Surface Tension) ===");

// Temporarily disable surface tension
if (window.simulation) {
    const oldTension = simulation.surfaceTension;
    simulation.surfaceTension = 0.0;
    console.log(`Surface tension disabled (was ${oldTension})`);
    
    // Check coupling strength
    console.log(`Coupling strength: ${simulation.couplingStrength}`);
    console.log(`Oil viscosity: ${simulation.oilViscosity}, iterations: ${simulation.oilViscosityIterations}`);
    
    // Check if water is moving
    setTimeout(() => {
        const gl = simulation.gl;
        const pixels = new Float32Array(4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, simulation.waterLayer.velocityFBO);
        gl.readPixels(gl.canvas.width / 2, gl.canvas.height / 2, 1, 1, gl.RGBA, gl.FLOAT, pixels);
        const waterVel = Math.sqrt(pixels[0] * pixels[0] + pixels[1] * pixels[1]);
        console.log(`Water velocity at center: ${waterVel.toFixed(4)}`);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }, 1000);
    
    console.log("\n📋 Test Instructions:");
    console.log("1. Select a material with oil (Mineral Oil, Glycerine, etc.)");
    console.log("2. Paint some oil in the center");
    console.log("3. Click 'Rotate' button");
    console.log("4. Wait 5-10 seconds");
    console.log("5. Check if oil moves");
    console.log("\n✅ If oil moves: Coupling works, surface tension was the issue");
    console.log("❌ If oil doesn't move: Problem is in coupling or advection");
}
