// Check force balance

console.log("=== Force Balance Check ===\n");

const sim = window.simulation;

console.log("Current parameters:");
console.log(`  surfaceTension: ${sim.surfaceTension}`);
console.log(`  couplingStrength: ${sim.couplingStrength}`);
console.log(`  oilViscosity: ${sim.oilViscosity}`);
console.log(`  oilViscosityIterations: ${sim.oilViscosityIterations}`);

console.log("\n🔧 Recommended balance for MOTION:");
console.log("simulation.surfaceTension = 0.0002;      // Weak - allows motion");
console.log("simulation.couplingStrength = 1.0;       // Strong - follows water");
console.log("simulation.oilViscosity = 0.05;          // Low - less resistance");
console.log("simulation.oilViscosityIterations = 20;  // Fewer passes");

console.log("\n🎨 Apply now:");
console.log("sim = window.simulation;");
console.log("sim.surfaceTension = 0.0002;");
console.log("sim.couplingStrength = 1.0;");
console.log("sim.oilViscosity = 0.05;");
console.log("sim.oilViscosityIterations = 20;");

console.log("\nThen paint + rotate to test!");
