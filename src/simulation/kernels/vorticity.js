export function applyVorticityConfinement(gl, renderer, vorticityConfinementProgram, simulation) {
    gl.useProgram(vorticityConfinementProgram);
    gl.bindFramebuffer(gl.FRAMEBUFFER, simulation.velocityFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, simulation.velocityTexture2, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, renderer.quadBuffer);
    const positionAttrib = gl.getAttribLocation(vorticityConfinementProgram, 'a_position');
    gl.enableVertexAttribArray(positionAttrib);
    gl.vertexAttribPointer(positionAttrib, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, simulation.velocityTexture1);
    gl.uniform1i(gl.getUniformLocation(vorticityConfinementProgram, 'u_velocity_texture'), 0);
    gl.uniform1f(gl.getUniformLocation(vorticityConfinementProgram, 'u_confinement_strength'), simulation.vorticityStrength);
    gl.uniform2f(gl.getUniformLocation(vorticityConfinementProgram, 'u_resolution'), gl.canvas.width, gl.canvas.height);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    simulation.swapVelocityTextures();
}
