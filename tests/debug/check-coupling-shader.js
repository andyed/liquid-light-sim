/**
 * Check if oil coupling shader is valid and running
 * Paste into browser console
 */

console.log('🔍 Checking oil coupling shader...\n');

const sim = window.simulation;
const gl = sim.renderer.gl;

if (!sim.oilCouplingProgram) {
  console.error('❌ oilCouplingProgram does not exist!');
} else {
  console.log('✅ oilCouplingProgram exists');
  
  const isValid = gl.isProgram(sim.oilCouplingProgram);
  console.log('   Valid program:', isValid);
  
  const linkStatus = gl.getProgramParameter(sim.oilCouplingProgram, gl.LINK_STATUS);
  console.log('   Link status:', linkStatus);
  
  if (!linkStatus) {
    const log = gl.getProgramInfoLog(sim.oilCouplingProgram);
    console.error('   Link error:', log);
  }
  
  // Check uniform locations
  const uniforms = [
    'u_oilVelocity',
    'u_waterVelocity', 
    'u_oil',
    'u_couplingStrength',
    'u_dt'
  ];
  
  console.log('\n   Uniform locations:');
  uniforms.forEach(name => {
    const loc = gl.getUniformLocation(sim.oilCouplingProgram, name);
    console.log(`   ${name}:`, loc !== null ? 'found' : '❌ NOT FOUND');
  });
  
  // Check if shader is actually being used
  gl.useProgram(sim.oilCouplingProgram);
  const currentProgram = gl.getParameter(gl.CURRENT_PROGRAM);
  console.log('\n   Can be activated:', currentProgram === sim.oilCouplingProgram);
  
  // Check for any GL errors
  const error = gl.getError();
  if (error !== gl.NO_ERROR) {
    console.error('   GL Error:', error);
  } else {
    console.log('   No GL errors');
  }
}

console.log('\n💡 Next: Check if water velocity exists where oil is');
