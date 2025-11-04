// Check what parameters are actually active

console.log("=== Current Active Parameters ===\n");

const sim = window.simulation;
const ctrl = window.controller;

console.log("🎨 Material:", ctrl.materials[ctrl.currentMaterialIndex].name);
console.log("");

console.log("📊 Active Simulation Values:");
console.log(`  couplingStrength: ${sim.couplingStrength}`);
console.log(`  oilViscosity: ${sim.oilViscosity}`);
console.log(`  oilViscosityIterations: ${sim.oilViscosityIterations}`);
console.log(`  surfaceTension: ${sim.surfaceTension}`);
console.log(`  oilDragStrength: ${sim.oilDragStrength}`);
console.log(`  useMacCormack: ${sim.useMacCormack}`);
console.log("");

console.log("🎯 Material Preset Values:");
const preset = ctrl.materials[ctrl.currentMaterialIndex].preset;
if (preset && Object.keys(preset).length > 0) {
    console.log(`  couplingStrength: ${preset.couplingStrength || 'not set'}`);
    console.log(`  oilViscosity: ${preset.oilViscosity || 'not set'}`);
    console.log(`  surfaceTension: ${preset.surfaceTension || 'not set'}`);
} else {
    console.log("  (No preset - using Ink)");
}

console.log("");
console.log("⚠️ PROBLEMS:");
if (sim.couplingStrength < 0.1) {
    console.log(`  ❌ Coupling too weak: ${sim.couplingStrength} (should be 0.3-0.5)`);
}
if (sim.oilViscosity > 0.5) {
    console.log(`  ❌ Viscosity too high: ${sim.oilViscosity} (should be 0.1-0.3)`);
}
if (sim.oilViscosityIterations > 100) {
    console.log(`  ❌ Too many viscosity iterations: ${sim.oilViscosityIterations}`);
}

console.log("");
console.log("🔧 Quick fix:");
console.log("ctrl.setMaterial(1);  // Switch to Mineral Oil");
console.log("// OR manually:");
console.log("simulation.couplingStrength = 0.5;");
console.log("simulation.oilViscosity = 0.1;");
console.log("simulation.oilViscosityIterations = 60;");
