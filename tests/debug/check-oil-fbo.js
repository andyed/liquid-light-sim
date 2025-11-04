/**
 * Check if oil FBO is properly configured
 * Paste into browser console
 */

console.log('🔍 Checking oil FBO configuration...\n');

const sim = window.simulation;
const gl = sim.renderer.gl;
const oil = sim.oil;

if (!oil.oilFBO) {
  console.error('❌ oilFBO does not exist!');
} else {
  gl.bindFramebuffer(gl.FRAMEBUFFER, oil.oilFBO);
  
  // Check framebuffer status
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  const statusNames = {
    [gl.FRAMEBUFFER_COMPLETE]: 'COMPLETE',
    [gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT]: 'INCOMPLETE_ATTACHMENT',
    [gl.FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT]: 'INCOMPLETE_MISSING_ATTACHMENT',
    [gl.FRAMEBUFFER_INCOMPLETE_DIMENSIONS]: 'INCOMPLETE_DIMENSIONS',
    [gl.FRAMEBUFFER_UNSUPPORTED]: 'UNSUPPORTED'
  };
  
  console.log('Oil FBO status:', statusNames[status] || status);
  
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    console.error('❌ Oil FBO is not complete!');
  } else {
    console.log('✅ Oil FBO is complete');
  }
  
  // Check what's attached
  const attachment = gl.getFramebufferAttachmentParameter(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE
  );
  
  if (attachment === gl.TEXTURE) {
    const attachedTex = gl.getFramebufferAttachmentParameter(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.FRAMEBUFFER_ATTACHMENT_OBJECT_NAME
    );
    console.log('Attached texture:', attachedTex);
    console.log('oilTexture1:', oil.oilTexture1);
    console.log('oilTexture2:', oil.oilTexture2);
    console.log('Match texture1:', attachedTex === oil.oilTexture1);
    console.log('Match texture2:', attachedTex === oil.oilTexture2);
  } else {
    console.error('No texture attached!');
  }
  
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

console.log('\n💡 If FBO is complete but oil still not appearing:');
console.log('   The splat shader may not be writing to the texture');
console.log('   Check if u_isOil uniform is being set correctly');
