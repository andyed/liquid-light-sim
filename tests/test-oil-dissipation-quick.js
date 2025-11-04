// Quick test: disable all dissipation sources for oil
// Run in browser console after opening index.html

if (!window.simulation) {
  console.error('❌ window.simulation not found');
} else {
  const sim = window.simulation;
  
  console.log('🔧 Current settings:');
  console.log('  oilSmoothingRate:', sim.oilSmoothingRate);
  console.log('  oilOverflowUpper:', sim.oilOverflowUpper);
  console.log('  occupancyEveryN:', sim.occupancyEveryN);
  console.log('  useMacCormack:', sim.useMacCormack);
  
  console.log('\n🛑 Disabling oil smoothing (likely culprit)...');
  sim.oilSmoothingRate = 0.0;
  
  console.log('🛑 Relaxing oil overflow threshold...');
  sim.oilOverflowUpper = 0.95; // Much higher threshold
  
  console.log('🛑 Reducing overflow frequency...');
  sim.occupancyEveryN = 240; // Half as often
  
  console.log('\n✅ Test configuration applied!');
  console.log('Now paint oil and observe if it persists better.');
  console.log('\nTo revert:');
  console.log('  sim.oilSmoothingRate = 0.0015');
  console.log('  sim.oilOverflowUpper = 0.85');
  console.log('  sim.occupancyEveryN = 120');
}
