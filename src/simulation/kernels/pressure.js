export function projectVelocity(gl, renderer, divergenceProgram, pressureProgram, gradientProgram, simulation) {
    // 1. Compute divergence of velocity field
    gl.useProgram(divergenceProgram);
    gl.bindFramebuffer(gl.FRAMEBUFFER, simulation.divergenceFBO);

    gl.bindBuffer(gl.ARRAY_BUFFER, renderer.quadBuffer);
    const divergencePositionAttrib = gl.getAttribLocation(divergenceProgram, 'a_position');
    gl.enableVertexAttribArray(divergencePositionAttrib);
    gl.vertexAttribPointer(divergencePositionAttrib, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, simulation.velocityTexture1);
    gl.uniform1i(gl.getUniformLocation(divergenceProgram, 'u_velocity_texture'), 0);
    gl.uniform2f(gl.getUniformLocation(divergenceProgram, 'u_resolution'), gl.canvas.width, gl.canvas.height);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // 2. Solve for pressure (Jacobi iteration)
    gl.useProgram(pressureProgram);
    for (let i = 0; i < simulation.pressureIterations; i++) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, simulation.pressureFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, simulation.pressureTexture2, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, renderer.quadBuffer);
        const pressurePositionAttrib = gl.getAttribLocation(pressureProgram, 'a_position');
        gl.enableVertexAttribArray(pressurePositionAttrib);
        gl.vertexAttribPointer(pressurePositionAttrib, 2, gl.FLOAT, false, 0, 0);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, simulation.pressureTexture1);
        gl.uniform1i(gl.getUniformLocation(pressureProgram, 'u_pressure_texture'), 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, simulation.divergenceTexture);
        gl.uniform1i(gl.getUniformLocation(pressureProgram, 'u_divergence_texture'), 1);
        gl.uniform2f(gl.getUniformLocation(pressureProgram, 'u_resolution'), gl.canvas.width, gl.canvas.height);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
        simulation.swapPressureTextures();
    }

    // 3. Subtract pressure gradient from velocity
    gl.useProgram(gradientProgram);
    gl.bindFramebuffer(gl.FRAMEBUFFER, simulation.velocityFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, simulation.velocityTexture2, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, renderer.quadBuffer);
    const gradientPositionAttrib = gl.getAttribLocation(gradientProgram, 'a_position');
    gl.enableVertexAttribArray(gradientPositionAttrib);
    gl.vertexAttribPointer(gradientPositionAttrib, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, simulation.pressureTexture1);
    gl.uniform1i(gl.getUniformLocation(gradientProgram, 'u_pressure_texture'), 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, simulation.velocityTexture1);
    gl.uniform1i(gl.getUniformLocation(gradientProgram, 'u_velocity_texture'), 1);
    gl.uniform2f(gl.getUniformLocation(gradientProgram, 'u_resolution'), gl.canvas.width, gl.canvas.height);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    simulation.swapVelocityTextures();
}
