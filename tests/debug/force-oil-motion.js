// Force oil to move by using water velocity directly

console.log("=== Forcing Oil Motion ===\n");

if (window.simulation) {
    const sim = simulation;
    
    console.log("🔧 Applying aggressive fixes...");
    
    // Bypass coupling - use water velocity directly
    sim.debugAdvectOilWithWaterVelocity = true;
    console.log("✅ Oil now advects with water velocity (bypass coupling)");
    
    // Disable MacCormack (even though oil shouldn't use it)
    sim.useMacCormack = false;
    console.log("✅ MacCormack disabled");
    
    // Disable surface tension
    sim.surfaceTension = 0.0;
    console.log("✅ Surface tension disabled");
    
    // Minimal viscosity
    sim.oilViscosity = 0.0;
    sim.oilViscosityIterations = 0;
    console.log("✅ Viscosity disabled");
    
    // Disable overflow
    sim.oilOverflowUpper = 0.99;
    console.log("✅ Overflow threshold raised to 99%");
    
    console.log("\n📋 Instructions:");
    console.log("1. Paint oil blob");
    console.log("2. Rotate container");
    console.log("3. Oil should move EXACTLY like water");
    console.log("");
    console.log("If oil NOW moves:");
    console.log("  → Problem was in coupling, viscosity, or surface tension");
    console.log("If oil STILL doesn't move:");
    console.log("  → Problem is in advection or rendering");
    
} else {
    console.error("Simulation not found!");
}
