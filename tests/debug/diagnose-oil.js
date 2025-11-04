/**
 * Diagnostic script to check oil simulation state
 * Run in browser console after loading the simulation
 */

console.log('🔍 Oil Simulation Diagnostic\n');

// Check if simulation is loaded
if (!window.simulation) {
  console.error('❌ Simulation not found. Make sure page is loaded.');
} else {
  const sim = window.simulation;
  const oil = sim.oil;
  
  console.log('1. Oil Layer Textures:');
  console.log('   oilTexture1:', !!oil.oilTexture1);
  console.log('   oilTexture2:', !!oil.oilTexture2);
  console.log('   oilVelocityTexture1:', !!oil.oilVelocityTexture1);
  console.log('   oilVelocityTexture2:', !!oil.oilVelocityTexture2);
  console.log('   oilVelocityFBO:', !!oil.oilVelocityFBO);
  
  console.log('\n2. Coupling Parameters:');
  console.log('   couplingStrength:', sim.couplingStrength);
  console.log('   oilViscosity:', sim.oilViscosity);
  console.log('   oilViscosityIterations:', sim.oilViscosityIterations);
  
  console.log('\n3. Shader Programs:');
  console.log('   advectionProgram:', !!sim.advectionProgram);
  console.log('   oilCouplingProgram:', !!sim.oilCouplingProgram);
  console.log('   viscosityProgram:', !!sim.viscosityProgram);
  
  console.log('\n4. Material Info:');
  if (window.controller) {
    const mat = window.controller.materials[window.controller.currentMaterialIndex];
    console.log('   Current material:', mat.name);
    console.log('   Material preset:', mat.preset);
  }
  
  console.log('\n5. Simulation State:');
  console.log('   ready:', sim.ready);
  console.log('   paused:', sim.paused);
  console.log('   dt (last frame):', sim._lastDt || 'N/A');
  
  console.log('\n✅ Diagnostic complete. If oil is frozen:');
  console.log('   - Check that oilVelocityTexture1 exists');
  console.log('   - Check that couplingStrength > 0');
  console.log('   - Try creating water movement near oil');
  console.log('   - Check browser console for WebGL errors');
}
