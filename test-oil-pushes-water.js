// Test: Does oil push water/ink away?
// This tests the Oil → Water coupling force

console.log("=== Testing Oil → Water Coupling ===");

if (window.simulation && window.controller) {
    console.log("\n📋 Test Instructions:");
    console.log("1. Select 'Mineral Oil'");
    console.log("2. Paint a large oil blob in the center");
    console.log("3. Switch to 'Ink' material");
    console.log("4. Paint ink NEAR the oil (not on it)");
    console.log("5. Start rotating");
    console.log("6. Watch if ink gets pushed around by the oil blob");
    console.log("");
    console.log("✅ Expected: Ink should flow around oil, avoiding it");
    console.log("✅ Expected: Oil blob should create a 'wake' in the ink");
    console.log("✅ Expected: Stronger effect at oil edges (gradient regions)");
    console.log("");
    console.log("Parameters:");
    console.log(`  Coupling strength: ${simulation.couplingStrength}`);
    console.log(`  Oil drag strength: ${simulation.oilDragStrength}`);
    console.log("");
    console.log("🔧 If effect too weak, try:");
    console.log("  simulation.couplingStrength = 1.0;");
    console.log("  simulation.oilDragStrength = 20.0;");
} else {
    console.error("Simulation or controller not found!");
}
