/**
 * Check if useOil flag is set correctly
 * Paste into browser console
 */

console.log('🔍 Checking useOil flag...\n');

const sim = window.simulation;
const ctrl = window.controller;

console.log('simulation.useOil:', sim.useOil);
console.log('simulation.oil exists:', !!sim.oil);
console.log('Current material:', ctrl.materials[ctrl.currentMaterialIndex].name);

if (!sim.useOil) {
  console.log('\n❌ useOil is FALSE!');
  console.log('   This prevents oil from being painted');
  console.log('   Setting it to true...');
  sim.useOil = true;
  console.log('   ✅ useOil is now:', sim.useOil);
  console.log('\n   Try painting oil again');
} else {
  console.log('\n✅ useOil is TRUE');
  console.log('   Oil should be paintable');
  console.log('\n   If oil still not appearing, check:');
  console.log('   1. Are you clicking and dragging?');
  console.log('   2. Check console for errors during painting');
}
