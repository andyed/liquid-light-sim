// Check if advection shader has u_isOil uniform
const gl = window.simulation.renderer.gl;
const prog = window.simulation.advectionProgram;

gl.useProgram(prog);
const loc = gl.getUniformLocation(prog, 'u_isOil');

console.log('u_isOil in advection shader:', loc);

if (loc === null) {
  console.error('❌ u_isOil NOT FOUND in advection shader!');
  console.error('   Oil will be advected using wrong code path');
  console.error('   This could cause oil to disappear');
} else {
  console.log('✅ u_isOil found in advection shader');
}
