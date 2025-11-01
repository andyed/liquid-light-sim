export function applyForces(gl, renderer, forcesProgram, simulation, dt) {
    // Update central spiral power accumulation
    if (Math.abs(simulation.rotationAmount) > 0.01) {
        // Build up power when rotating
        simulation.centralSpiralPower = Math.min(1.0, simulation.centralSpiralPower + simulation.centralSpiralBuildRate);
        // Rotate the force emitter (faster than plate rotation for variety)
        simulation.centralSpiralAngle += simulation.rotationAmount * 3.0; // 3x plate rotation speed
    } else {
        // Decay when not rotating
        simulation.centralSpiralPower = Math.max(0.0, simulation.centralSpiralPower - simulation.centralSpiralDecayRate);
    }
    
    gl.useProgram(forcesProgram);
    gl.bindFramebuffer(gl.FRAMEBUFFER, simulation.velocityFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, simulation.velocityTexture2, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, renderer.quadBuffer);
    const positionAttrib = gl.getAttribLocation(forcesProgram, 'a_position');
    gl.enableVertexAttribArray(positionAttrib);
    gl.vertexAttribPointer(positionAttrib, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, simulation.velocityTexture1);
    gl.uniform1i(gl.getUniformLocation(forcesProgram, 'u_velocity_texture'), 0);
    
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, simulation.colorTexture1);
    gl.uniform1i(gl.getUniformLocation(forcesProgram, 'u_color_texture'), 1);
    
    gl.uniform1f(gl.getUniformLocation(forcesProgram, 'u_rotation_amount'), simulation.rotationAmount);
    gl.uniform2f(gl.getUniformLocation(forcesProgram, 'u_resolution'), gl.canvas.width, gl.canvas.height);
    gl.uniform1f(gl.getUniformLocation(forcesProgram, 'u_dt'), dt);
    gl.uniform1f(gl.getUniformLocation(forcesProgram, 'u_boundary_mode'), simulation.boundaryMode);
    gl.uniform1f(gl.getUniformLocation(forcesProgram, 'u_central_spiral_power'), simulation.centralSpiralPower);
    gl.uniform1f(gl.getUniformLocation(forcesProgram, 'u_central_spiral_angle'), simulation.centralSpiralAngle);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    simulation.swapVelocityTextures();
}
