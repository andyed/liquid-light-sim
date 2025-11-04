/**
 * Check for WebGL errors in the simulation
 * Paste this into browser console
 */

console.log('🔍 Checking for WebGL errors...\n');

const gl = window.simulation?.renderer?.gl;
if (!gl) {
  console.error('❌ WebGL context not found');
} else {
  const error = gl.getError();
  const errorNames = {
    [gl.NO_ERROR]: 'NO_ERROR',
    [gl.INVALID_ENUM]: 'INVALID_ENUM',
    [gl.INVALID_VALUE]: 'INVALID_VALUE',
    [gl.INVALID_OPERATION]: 'INVALID_OPERATION',
    [gl.INVALID_FRAMEBUFFER_OPERATION]: 'INVALID_FRAMEBUFFER_OPERATION',
    [gl.OUT_OF_MEMORY]: 'OUT_OF_MEMORY',
    [gl.CONTEXT_LOST_WEBGL]: 'CONTEXT_LOST_WEBGL'
  };
  
  if (error === gl.NO_ERROR) {
    console.log('✅ No WebGL errors detected');
  } else {
    console.error(`❌ WebGL Error: ${errorNames[error] || error}`);
  }
  
  // Check framebuffer status
  const sim = window.simulation;
  if (sim && sim.oil) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, sim.oil.oilVelocityFBO);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    const statusNames = {
      [gl.FRAMEBUFFER_COMPLETE]: 'COMPLETE',
      [gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT]: 'INCOMPLETE_ATTACHMENT',
      [gl.FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT]: 'INCOMPLETE_MISSING_ATTACHMENT',
      [gl.FRAMEBUFFER_INCOMPLETE_DIMENSIONS]: 'INCOMPLETE_DIMENSIONS',
      [gl.FRAMEBUFFER_UNSUPPORTED]: 'UNSUPPORTED'
    };
    
    if (status === gl.FRAMEBUFFER_COMPLETE) {
      console.log('✅ Oil velocity framebuffer is complete');
    } else {
      console.error(`❌ Oil velocity framebuffer status: ${statusNames[status] || status}`);
    }
  }
  
  // Check if coupling shader exists and is valid
  if (sim && sim.oilCouplingProgram) {
    const isValid = gl.isProgram(sim.oilCouplingProgram);
    const linkStatus = gl.getProgramParameter(sim.oilCouplingProgram, gl.LINK_STATUS);
    console.log('Oil coupling shader valid:', isValid);
    console.log('Oil coupling shader linked:', linkStatus);
    
    if (!linkStatus) {
      const log = gl.getProgramInfoLog(sim.oilCouplingProgram);
      console.error('Shader link error:', log);
    }
  }
}

console.log('\n💡 If no errors, the issue is likely in shader logic or parameters');
