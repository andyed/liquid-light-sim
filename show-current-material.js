/**
 * Show current material and coupling settings
 * Paste this into browser console
 */

console.log('🎨 Current Material Status\n');

if (!window.controller || !window.simulation) {
  console.error('❌ Controller or simulation not found');
} else {
  const ctrl = window.controller;
  const sim = window.simulation;
  const mat = ctrl.materials[ctrl.currentMaterialIndex];
  
  console.log(`Material: ${mat.name} (index ${ctrl.currentMaterialIndex})`);
  console.log(`Coupling Strength: ${sim.couplingStrength}`);
  console.log(`Oil Viscosity: ${sim.oilViscosity}`);
  console.log(`Viscosity Iterations: ${sim.oilViscosityIterations}`);
  console.log('\nMaterial Preset:');
  console.log(mat.preset);
  
  if (mat.name === 'Ink') {
    console.log('\n⚠️  WARNING: You are on INK mode!');
    console.log('   Ink has couplingStrength = 0 (no oil coupling)');
    console.log('   Press "2" to switch to Mineral Oil');
  } else if (sim.couplingStrength < 0.01) {
    console.log('\n⚠️  WARNING: Coupling strength is very low!');
    console.log(`   Current: ${sim.couplingStrength}`);
    console.log('   Expected for Mineral Oil: 0.5');
  } else {
    console.log('\n✅ Material and coupling look correct');
  }
}
