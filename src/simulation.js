import { loadShader } from './utils.js';

/**
 * Simulation class - Pure Model (no rendering logic)
 * Implements water layer fluid dynamics with:
 * - Advection (transport of color and velocity)
 * - Viscosity (thickness/drag - NEW)
 * - Pressure projection (incompressibility)
 * - Diffusion (color spreading)
 * - External forces (rotation, jets)
 */
export default class Simulation {
    constructor(renderer) {
        this.renderer = renderer;
        this.gl = renderer.gl;
        
        // Physics parameters - v0 lessons: document safe ranges
        this.viscosity = 0.1;  // Valid: 0.01-10.0, Safe: 0.1-2.0, Default: 0.1 (lowered for responsive jets)
        this.diffusionRate = 0.05;  // Color diffusion (lowered to preserve details)
        this.spreadStrength = 2.0;  // Concentration-driven pressure spreading (NEW)
        this.rotationAmount = 0.0;  // Current rotation force
        this.jetForce = {x: 0, y: 0, strength: 0};  // Jet impulse tool
        
        // Iteration counts
        this.viscosityIterations = 20;  // Jacobi iterations for viscosity
        this.pressureIterations = 50;  // Jacobi iterations for pressure
        this.diffusionIterations = 20;  // Jacobi iterations for color diffusion
        
        // Testing/debugging
        this.paused = false;  // F004 requirement: pause/freeze state
        
        this.ready = false;
    }

    async init() {
        const gl = this.gl;

        // Load all shaders
        const fullscreenVert = await loadShader('src/shaders/fullscreen.vert.glsl');
        
        this.advectionProgram = this.renderer.createProgram(
            fullscreenVert,
            await loadShader('src/shaders/advection.frag.glsl')
        );
        
        this.viscosityProgram = this.renderer.createProgram(
            fullscreenVert,
            await loadShader('src/shaders/viscosity.frag.glsl')
        );
        
        this.diffusionProgram = this.renderer.createProgram(
            fullscreenVert,
            await loadShader('src/shaders/diffusion.frag.glsl')
        );
        
        this.divergenceProgram = this.renderer.createProgram(
            fullscreenVert,
            await loadShader('src/shaders/divergence.frag.glsl')
        );
        
        this.pressureProgram = this.renderer.createProgram(
            fullscreenVert,
            await loadShader('src/shaders/pressure.frag.glsl')
        );
        
        this.gradientProgram = this.renderer.createProgram(
            fullscreenVert,
            await loadShader('src/shaders/gradient.frag.glsl')
        );
        
        this.forcesProgram = this.renderer.createProgram(
            fullscreenVert,
            await loadShader('src/shaders/forces.frag.glsl')
        );
        
        this.splatProgram = this.renderer.createProgram(
            fullscreenVert,
            await loadShader('src/shaders/splat.frag.glsl')
        );
        
        this.concentrationPressureProgram = this.renderer.createProgram(
            fullscreenVert,
            await loadShader('src/shaders/concentration-pressure.frag.glsl')
        );

        const width = gl.canvas.width;
        const height = gl.canvas.height;

        // Create texture pairs for ping-pong rendering
        this.colorTexture1 = this.createTexture(width, height);
        this.colorTexture2 = this.createTexture(width, height);
        this.colorFBO = this.createFBO(this.colorTexture1);

        this.velocityTexture1 = this.createTexture(width, height);
        this.velocityTexture2 = this.createTexture(width, height);
        this.velocityFBO = this.createFBO(this.velocityTexture1);

        this.divergenceTexture = this.createTexture(width, height);
        this.divergenceFBO = this.createFBO(this.divergenceTexture);

        this.pressureTexture1 = this.createTexture(width, height);
        this.pressureTexture2 = this.createTexture(width, height);
        this.pressureFBO = this.createFBO(this.pressureTexture1);

        this.ready = true;
        console.log('✓ Simulation initialized');
    }

    createTexture(width, height) {
        const gl = this.gl;
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, null);
        // Use NEAREST filtering for FBO attachments (LINEAR can cause issues)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.bindTexture(gl.TEXTURE_2D, null);
        return texture;
    }

    createFBO(texture) {
        const gl = this.gl;
        const fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        if (status !== gl.FRAMEBUFFER_COMPLETE) {
            console.error('Framebuffer not complete:', status);
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return fbo;
    }

    swapColorTextures() {
        [this.colorTexture1, this.colorTexture2] = [this.colorTexture2, this.colorTexture1];
    }

    swapVelocityTextures() {
        [this.velocityTexture1, this.velocityTexture2] = [this.velocityTexture2, this.velocityTexture1];
    }

    swapPressureTextures() {
        [this.pressureTexture1, this.pressureTexture2] = [this.pressureTexture2, this.pressureTexture1];
    }

    setRotation(amount) {
        this.rotationAmount = amount;
    }

    setJetForce(x, y, strength) {
        this.jetForce = {x, y, strength};
    }

    /**
     * Inject velocity ONLY (no color) - for jet impulse tool
     */
    splatVelocity(x, y, vx, vy, radius = 0.05) {
        if (!this.ready || !this.renderer.ready) return;

        const gl = this.gl;
        
        gl.useProgram(this.splatProgram);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.velocityFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.velocityTexture2, 0);
        
        gl.bindBuffer(gl.ARRAY_BUFFER, this.renderer.quadBuffer);
        const positionAttrib = gl.getAttribLocation(this.splatProgram, 'a_position');
        gl.enableVertexAttribArray(positionAttrib);
        gl.vertexAttribPointer(positionAttrib, 2, gl.FLOAT, false, 0, 0);
        
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.velocityTexture1);
        gl.uniform1i(gl.getUniformLocation(this.splatProgram, 'u_texture'), 0);
        gl.uniform2f(gl.getUniformLocation(this.splatProgram, 'u_point'), x, y);
        gl.uniform3f(gl.getUniformLocation(this.splatProgram, 'u_color'), vx, vy, 0);
        gl.uniform1f(gl.getUniformLocation(this.splatProgram, 'u_radius'), radius);
        
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        this.swapVelocityTextures();
        
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    splat(x, y, color, radius = 0.01) {
        if (!this.ready || !this.renderer.ready) return;

        const gl = this.gl;

        // Splat color
        gl.useProgram(this.splatProgram);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.colorFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.colorTexture2, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.renderer.quadBuffer);
        const positionAttrib = gl.getAttribLocation(this.splatProgram, 'a_position');
        gl.enableVertexAttribArray(positionAttrib);
        gl.vertexAttribPointer(positionAttrib, 2, gl.FLOAT, false, 0, 0);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.colorTexture1);
        gl.uniform1i(gl.getUniformLocation(this.splatProgram, 'u_texture'), 0);
        gl.uniform2f(gl.getUniformLocation(this.splatProgram, 'u_point'), x, y);
        gl.uniform3f(gl.getUniformLocation(this.splatProgram, 'u_color'), color.r, color.g, color.b);
        gl.uniform1f(gl.getUniformLocation(this.splatProgram, 'u_radius'), radius);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
        this.swapColorTextures();

        // Also inject velocity for stirring effect
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.velocityFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.velocityTexture2, 0);
        
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.velocityTexture1);
        gl.uniform1i(gl.getUniformLocation(this.splatProgram, 'u_texture'), 0);
        // Small velocity splat
        gl.uniform3f(gl.getUniformLocation(this.splatProgram, 'u_color'), 
            (Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.1, 0);
        gl.uniform1f(gl.getUniformLocation(this.splatProgram, 'u_radius'), radius * 2);
        
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        this.swapVelocityTextures();

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    update(deltaTime) {
        if (!this.ready || !this.renderer.ready || this.paused) return;

        const gl = this.gl;
        const dt = Math.min(deltaTime, 0.016);  // Cap dt for stability

        // 1. Apply external forces (rotation, jet)
        this.applyForces(dt);

        // 2. Apply concentration pressure (NEW - makes accumulated ink spread)
        this.applyConcentrationPressure();

        // 3. Advect velocity (self-advection)
        this.advectVelocity(dt);

        // 4. Apply viscosity (adds thickness)
        this.applyViscosity(dt);

        // 5. Make velocity field incompressible (pressure projection)
        this.projectVelocity();

        // 6. Advect color by velocity field
        this.advectColor(dt);

        // 7. Diffuse color
        this.diffuseColor(dt);

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    applyForces(dt) {
        const gl = this.gl;
        
        gl.useProgram(this.forcesProgram);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.velocityFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.velocityTexture2, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.renderer.quadBuffer);
        const positionAttrib = gl.getAttribLocation(this.forcesProgram, 'a_position');
        gl.enableVertexAttribArray(positionAttrib);
        gl.vertexAttribPointer(positionAttrib, 2, gl.FLOAT, false, 0, 0);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.velocityTexture1);
        gl.uniform1i(gl.getUniformLocation(this.forcesProgram, 'u_velocity_texture'), 0);
        gl.uniform1f(gl.getUniformLocation(this.forcesProgram, 'u_rotation_amount'), this.rotationAmount);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
        this.swapVelocityTextures();
    }

    applyConcentrationPressure() {
        const gl = this.gl;
        
        gl.useProgram(this.concentrationPressureProgram);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.velocityFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.velocityTexture2, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.renderer.quadBuffer);
        const positionAttrib = gl.getAttribLocation(this.concentrationPressureProgram, 'a_position');
        gl.enableVertexAttribArray(positionAttrib);
        gl.vertexAttribPointer(positionAttrib, 2, gl.FLOAT, false, 0, 0);

        // Bind color texture (to measure concentration)
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.colorTexture1);
        gl.uniform1i(gl.getUniformLocation(this.concentrationPressureProgram, 'u_color_texture'), 0);

        // Bind velocity texture
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.velocityTexture1);
        gl.uniform1i(gl.getUniformLocation(this.concentrationPressureProgram, 'u_velocity_texture'), 1);

        // Set spreading strength parameter
        gl.uniform1f(gl.getUniformLocation(this.concentrationPressureProgram, 'u_spread_strength'), this.spreadStrength);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
        this.swapVelocityTextures();
    }

    advectVelocity(dt) {
        const gl = this.gl;
        
        gl.useProgram(this.advectionProgram);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.velocityFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.velocityTexture2, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.renderer.quadBuffer);
        const positionAttrib = gl.getAttribLocation(this.advectionProgram, 'a_position');
        gl.enableVertexAttribArray(positionAttrib);
        gl.vertexAttribPointer(positionAttrib, 2, gl.FLOAT, false, 0, 0);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.velocityTexture1);
        gl.uniform1i(gl.getUniformLocation(this.advectionProgram, 'u_color_texture'), 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.velocityTexture1);
        gl.uniform1i(gl.getUniformLocation(this.advectionProgram, 'u_velocity_texture'), 1);

        gl.uniform1f(gl.getUniformLocation(this.advectionProgram, 'u_dt'), dt);
        gl.uniform2f(gl.getUniformLocation(this.advectionProgram, 'u_resolution'), 
            gl.canvas.width, gl.canvas.height);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
        this.swapVelocityTextures();
    }

    applyViscosity(dt) {
        const gl = this.gl;
        
        gl.useProgram(this.viscosityProgram);
        gl.uniform1f(gl.getUniformLocation(this.viscosityProgram, 'u_viscosity'), this.viscosity);
        gl.uniform1f(gl.getUniformLocation(this.viscosityProgram, 'u_dt'), dt);

        for (let i = 0; i < this.viscosityIterations; i++) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.velocityFBO);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.velocityTexture2, 0);

            gl.bindBuffer(gl.ARRAY_BUFFER, this.renderer.quadBuffer);
            const positionAttrib = gl.getAttribLocation(this.viscosityProgram, 'a_position');
            gl.enableVertexAttribArray(positionAttrib);
            gl.vertexAttribPointer(positionAttrib, 2, gl.FLOAT, false, 0, 0);

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.velocityTexture1);
            gl.uniform1i(gl.getUniformLocation(this.viscosityProgram, 'u_velocity_texture'), 0);

            gl.drawArrays(gl.TRIANGLES, 0, 6);
            this.swapVelocityTextures();
        }
    }

    projectVelocity() {
        const gl = this.gl;

        // 1. Compute divergence of velocity field
        gl.useProgram(this.divergenceProgram);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.divergenceFBO);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.renderer.quadBuffer);
        const divergencePositionAttrib = gl.getAttribLocation(this.divergenceProgram, 'a_position');
        gl.enableVertexAttribArray(divergencePositionAttrib);
        gl.vertexAttribPointer(divergencePositionAttrib, 2, gl.FLOAT, false, 0, 0);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.velocityTexture1);
        gl.uniform1i(gl.getUniformLocation(this.divergenceProgram, 'u_velocity_texture'), 0);

        gl.drawArrays(gl.TRIANGLES, 0, 6);

        // 2. Solve for pressure (Jacobi iteration)
        gl.useProgram(this.pressureProgram);
        for (let i = 0; i < this.pressureIterations; i++) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.pressureFBO);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.pressureTexture2, 0);

            gl.bindBuffer(gl.ARRAY_BUFFER, this.renderer.quadBuffer);
            const pressurePositionAttrib = gl.getAttribLocation(this.pressureProgram, 'a_position');
            gl.enableVertexAttribArray(pressurePositionAttrib);
            gl.vertexAttribPointer(pressurePositionAttrib, 2, gl.FLOAT, false, 0, 0);

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.pressureTexture1);
            gl.uniform1i(gl.getUniformLocation(this.pressureProgram, 'u_pressure_texture'), 0);

            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, this.divergenceTexture);
            gl.uniform1i(gl.getUniformLocation(this.pressureProgram, 'u_divergence_texture'), 1);

            gl.drawArrays(gl.TRIANGLES, 0, 6);
            this.swapPressureTextures();
        }

        // 3. Subtract pressure gradient from velocity
        gl.useProgram(this.gradientProgram);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.velocityFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.velocityTexture2, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.renderer.quadBuffer);
        const gradientPositionAttrib = gl.getAttribLocation(this.gradientProgram, 'a_position');
        gl.enableVertexAttribArray(gradientPositionAttrib);
        gl.vertexAttribPointer(gradientPositionAttrib, 2, gl.FLOAT, false, 0, 0);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.pressureTexture1);
        gl.uniform1i(gl.getUniformLocation(this.gradientProgram, 'u_pressure_texture'), 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.velocityTexture1);
        gl.uniform1i(gl.getUniformLocation(this.gradientProgram, 'u_velocity_texture'), 1);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
        this.swapVelocityTextures();
    }

    advectColor(dt) {
        const gl = this.gl;
        
        gl.useProgram(this.advectionProgram);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.colorFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.colorTexture2, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.renderer.quadBuffer);
        const positionAttrib = gl.getAttribLocation(this.advectionProgram, 'a_position');
        gl.enableVertexAttribArray(positionAttrib);
        gl.vertexAttribPointer(positionAttrib, 2, gl.FLOAT, false, 0, 0);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.colorTexture1);
        gl.uniform1i(gl.getUniformLocation(this.advectionProgram, 'u_color_texture'), 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.velocityTexture1);
        gl.uniform1i(gl.getUniformLocation(this.advectionProgram, 'u_velocity_texture'), 1);

        gl.uniform1f(gl.getUniformLocation(this.advectionProgram, 'u_dt'), dt);
        gl.uniform2f(gl.getUniformLocation(this.advectionProgram, 'u_resolution'), 
            gl.canvas.width, gl.canvas.height);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
        this.swapColorTextures();
    }

    diffuseColor(dt) {
        const gl = this.gl;
        
        gl.useProgram(this.diffusionProgram);
        gl.uniform1f(gl.getUniformLocation(this.diffusionProgram, 'u_dt'), dt);
        gl.uniform1f(gl.getUniformLocation(this.diffusionProgram, 'u_diffusion_rate'), this.diffusionRate);

        for (let i = 0; i < this.diffusionIterations; i++) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.colorFBO);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.colorTexture2, 0);

            gl.bindBuffer(gl.ARRAY_BUFFER, this.renderer.quadBuffer);
            const positionAttrib = gl.getAttribLocation(this.diffusionProgram, 'a_position');
            gl.enableVertexAttribArray(positionAttrib);
            gl.vertexAttribPointer(positionAttrib, 2, gl.FLOAT, false, 0, 0);

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.colorTexture1);
            gl.uniform1i(gl.getUniformLocation(this.diffusionProgram, 'u_texture'), 0);

            gl.drawArrays(gl.TRIANGLES, 0, 6);
            this.swapColorTextures();
        }
    }
}
