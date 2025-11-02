// Simple uniform check - paste into console
const gl = window.simulation.renderer.gl;
const prog = window.simulation.splatProgram;

gl.useProgram(prog);

console.log('u_isOil:', gl.getUniformLocation(prog, 'u_isOil'));
console.log('u_oilStrength:', gl.getUniformLocation(prog, 'u_oilStrength'));
console.log('u_texture:', gl.getUniformLocation(prog, 'u_texture'));
console.log('u_isVelocity:', gl.getUniformLocation(prog, 'u_isVelocity'));
