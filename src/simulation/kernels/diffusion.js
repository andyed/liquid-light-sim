export function diffuseColor(gl, renderer, diffusionProgram, simulation, dt) {
    gl.useProgram(diffusionProgram);
    gl.uniform1f(gl.getUniformLocation(diffusionProgram, 'u_dt'), dt);
    gl.uniform1f(gl.getUniformLocation(diffusionProgram, 'u_diffusion_rate'), simulation.diffusionRate);

    for (let i = 0; i < simulation.diffusionIterations; i++) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, simulation.colorFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, simulation.colorTexture2, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, renderer.quadBuffer);
        const positionAttrib = gl.getAttribLocation(diffusionProgram, 'a_position');
        gl.enableVertexAttribArray(positionAttrib);
        gl.vertexAttribPointer(positionAttrib, 2, gl.FLOAT, false, 0, 0);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, simulation.colorTexture1);
        gl.uniform1i(gl.getUniformLocation(diffusionProgram, 'u_texture'), 0);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
        simulation.swapColorTextures();
    }
}
