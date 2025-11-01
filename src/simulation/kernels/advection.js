export function advectVelocity(gl, renderer, advectionProgram, simulation, dt) {
    gl.useProgram(advectionProgram);
    gl.bindFramebuffer(gl.FRAMEBUFFER, simulation.velocityFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, simulation.velocityTexture2, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, renderer.quadBuffer);
    const positionAttrib = gl.getAttribLocation(advectionProgram, 'a_position');
    gl.enableVertexAttribArray(positionAttrib);
    gl.vertexAttribPointer(positionAttrib, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, simulation.velocityTexture1);
    gl.uniform1i(gl.getUniformLocation(advectionProgram, 'u_color_texture'), 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, simulation.velocityTexture1);
    gl.uniform1i(gl.getUniformLocation(advectionProgram, 'u_velocity_texture'), 1);

    gl.uniform1f(gl.getUniformLocation(advectionProgram, 'u_dt'), dt);
    gl.uniform2f(gl.getUniformLocation(advectionProgram, 'u_resolution'), 
        gl.canvas.width, gl.canvas.height);
    gl.uniform1i(gl.getUniformLocation(advectionProgram, 'u_isVelocity'), 1);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    simulation.swapVelocityTextures();
}

export function advectColor(gl, renderer, advectionProgram, simulation, dt) {
    gl.useProgram(advectionProgram);
    gl.bindFramebuffer(gl.FRAMEBUFFER, simulation.colorFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, simulation.colorTexture2, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, renderer.quadBuffer);
    const positionAttrib = gl.getAttribLocation(advectionProgram, 'a_position');
    gl.enableVertexAttribArray(positionAttrib);
    gl.vertexAttribPointer(positionAttrib, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, simulation.colorTexture1);
    gl.uniform1i(gl.getUniformLocation(advectionProgram, 'u_color_texture'), 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, simulation.velocityTexture1);
    gl.uniform1i(gl.getUniformLocation(advectionProgram, 'u_velocity_texture'), 1);

    gl.uniform1f(gl.getUniformLocation(advectionProgram, 'u_dt'), dt);
    gl.uniform2f(gl.getUniformLocation(advectionProgram, 'u_resolution'), 
        gl.canvas.width, gl.canvas.height);
    gl.uniform1i(gl.getUniformLocation(advectionProgram, 'u_isVelocity'), 0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    simulation.swapColorTextures();
}
