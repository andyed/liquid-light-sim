export function applyViscosity(gl, renderer, viscosityProgram, simulation, dt) {
    gl.useProgram(viscosityProgram);
    gl.uniform1f(gl.getUniformLocation(viscosityProgram, 'u_viscosity'), simulation.viscosity);
    gl.uniform1f(gl.getUniformLocation(viscosityProgram, 'u_dt'), dt);
    gl.uniform2f(gl.getUniformLocation(viscosityProgram, 'u_resolution'), gl.canvas.width, gl.canvas.height);

    for (let i = 0; i < simulation.viscosityIterations; i++) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, simulation.velocityFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, simulation.velocityTexture2, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, renderer.quadBuffer);
        const positionAttrib = gl.getAttribLocation(viscosityProgram, 'a_position');
        gl.enableVertexAttribArray(positionAttrib);
        gl.vertexAttribPointer(positionAttrib, 2, gl.FLOAT, false, 0, 0);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, simulation.velocityTexture1);
        gl.uniform1i(gl.getUniformLocation(viscosityProgram, 'u_velocity_texture'), 0);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
        simulation.swapVelocityTextures();
    }
}
