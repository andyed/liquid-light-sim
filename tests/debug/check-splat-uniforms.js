/**
 * Check if splat shader has the required uniforms
 * Paste into browser console
 */

console.log('🔍 Checking splat shader uniforms...\n');

const sim = window.simulation;
const gl = sim.renderer.gl;

if (!sim.splatProgram) {
  console.error('❌ splatProgram does not exist!');
} else {
  gl.useProgram(sim.splatProgram);
  
  const uniforms = [
    'u_texture',
    'u_point',
    'u_color',
    'u_radius',
    'u_resolution',
    'u_isVelocity',
    'u_isOil',
    'u_oilStrength'
  ];
  
  console.log('Uniform locations:');
  uniforms.forEach(name => {
    const loc = gl.getUniformLocation(sim.splatProgram, name);
    if (loc !== null) {
      console.log(`  ✅ ${name}: found`);
    } else {
      console.error(`  ❌ ${name}: NOT FOUND (may be optimized out)`);
    }
  });
  
  // Check shader link status
  const linkStatus = gl.getProgramParameter(sim.splatProgram, gl.LINK_STATUS);
  console.log('\nShader link status:', linkStatus);
  
  if (!linkStatus) {
    const log = gl.getProgramInfoLog(sim.splatProgram);
    console.error('Shader link error:', log);
  }
}

console.log('\n💡 If u_isOil or u_oilStrength are missing:');
console.log('   They may be optimized out if not used in shader');
console.log('   Check splat.frag.glsl to ensure they are used');
