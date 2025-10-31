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
        
        // Physics parameters - based on real fluid properties
        this.viscosity = 0.03;  // Lower viscosity so momentum lingers longer
        this.diffusionRate = 0.0;  // Disable diffusion (was causing fading)
        this.spreadStrength = 0.0;  // Concentration pressure (removed - not real physics)
        this.rotationAmount = 0.0;  // Current rotation force
        this.jetForce = {x: 0, y: 0, strength: 0};  // Jet impulse tool
        this.useMacCormack = true;  // High-fidelity advection (eliminates numerical diffusion)
        this.vorticityStrength = 0.8;  // Stronger confinement for visible swirling at higher viscosity
        this.boundaryMode = 1;  // 0=bounce, 1=viscous drag, 2=repulsive force
        // Occupancy / overflow control
        this.occupancyPercent = 0.0; // 0..1 fraction of inked pixels inside plate
        this.pixelSoupPercent = 0.0; // 0..1 fraction of inked pixels that are mixed/speckled
        this.occupancyEveryN = 8; // compute occupancy every N frames
        this._frameCounter = 0;
        this.overflowLower = 0.88; // target lower bound (was 0.85)
        this.overflowUpper = 0.93; // trigger threshold (was 0.90)
        
        // Central spiral force accumulation
        this.centralSpiralPower = 0.0; // 0..1, builds up with sustained rotation
        this.centralSpiralBuildRate = 0.015; // how fast it builds per frame (~1 second to full)
        this.centralSpiralDecayRate = 0.05; // how fast it decays when not rotating
        this.centralSpiralAngle = 0.0; // rotation angle of the force emitter
        
        // Iteration counts
        this.viscosityIterations = 20;  // Jacobi iterations for viscosity
        this.pressureIterations = 50;  // Jacobi iterations for pressure
        this.diffusionIterations = 20;  // Jacobi iterations for color diffusion
        
        // Testing/debugging
        this.paused = false;  // F004 requirement: pause/freeze state
        
        this.ready = false;
    }

    computeOccupancy() {
        const gl = this.gl;
        // Render occupancy mask (R=inked, G=inside) at low resolution
        gl.useProgram(this.occupancyProgram);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.occupancyFBO);
        gl.viewport(0, 0, this.occupancyWidth, this.occupancyHeight);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.renderer.quadBuffer);
        const positionAttrib = gl.getAttribLocation(this.occupancyProgram, 'a_position');
        gl.enableVertexAttribArray(positionAttrib);
        gl.vertexAttribPointer(positionAttrib, 2, gl.FLOAT, false, 0, 0);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.colorTexture1);
        gl.uniform1i(gl.getUniformLocation(this.occupancyProgram, 'u_color_texture'), 0);
        gl.uniform2f(gl.getUniformLocation(this.occupancyProgram, 'u_resolution'), gl.canvas.width, gl.canvas.height);

        gl.drawArrays(gl.TRIANGLES, 0, 6);

        // Read back occupancy buffer (UNSIGNED_BYTE RGBA)
        const w = this.occupancyWidth, h = this.occupancyHeight;
        const pixels = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

        // Sum R (inked), G (inside), and B (pixel soup) components
        let sumInked = 0, sumInside = 0, sumSoup = 0;
        for (let i = 0; i < pixels.length; i += 4) {
            sumInked += pixels[i];      // R
            sumInside += pixels[i + 1]; // G
            sumSoup += pixels[i + 2];   // B
        }
        // Normalize (bytes 0..255)
        const inkedNorm = sumInked / 255.0;
        const insideNorm = Math.max(1e-6, sumInside / 255.0);
        const soupNorm = sumSoup / 255.0;
        this.occupancyPercent = Math.max(0.0, Math.min(1.0, inkedNorm / insideNorm));
        this.pixelSoupPercent = inkedNorm > 1e-6 ? Math.max(0.0, Math.min(1.0, soupNorm / inkedNorm)) : 0.0;
        // Debug every check (more verbose to diagnose issue)
        console.log(`🧪 Occupancy: ${(this.occupancyPercent * 100).toFixed(1)}% | Pixel Soup: ${(this.pixelSoupPercent * 100).toFixed(1)}% (threshold: ${this.overflowUpper * 100}%)`);
        // Unbind
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    applyOverflow(strength) {
        const gl = this.gl;
        if (strength <= 0.0) return;
        // Fullscreen pass: read colorTexture1, write damped result to colorTexture2
        gl.useProgram(this.overflowProgram);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.colorFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.colorTexture2, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.renderer.quadBuffer);
        const positionAttrib = gl.getAttribLocation(this.overflowProgram, 'a_position');
        gl.enableVertexAttribArray(positionAttrib);
        gl.vertexAttribPointer(positionAttrib, 2, gl.FLOAT, false, 0, 0);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.colorTexture1);
        gl.uniform1i(gl.getUniformLocation(this.overflowProgram, 'u_color_texture'), 0);
        gl.uniform2f(gl.getUniformLocation(this.overflowProgram, 'u_resolution'), gl.canvas.width, gl.canvas.height);
        // Scale strength gentler on smaller screens and when rotating
        const resMin = Math.min(gl.canvas.width, gl.canvas.height);
        const resScale = Math.max(0.6, Math.min(1.0, resMin / 1080.0));
        const rotationScale = Math.max(0.7, 1.0 - 0.35 * Math.min(1.0, Math.abs(this.rotationAmount))); // 0.7..1.0
        const scaledStrength = strength * 0.6 * resScale * rotationScale; // global 0.6 multiplier to ease overall damping
        gl.uniform1f(gl.getUniformLocation(this.overflowProgram, 'u_strength'), scaledStrength);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
        this.swapColorTextures();

        // Optional: log one-shot
        console.log(`🚰 Overflow valve engaged: strength=${scaledStrength.toFixed(2)} (raw ${strength.toFixed(2)}) → target ${(this.overflowLower*100)|0}-${(this.overflowUpper*100)|0}%`);
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
        
        try {
            this.concentrationPressureProgram = this.renderer.createProgram(
                fullscreenVert,
                await loadShader('src/shaders/concentration-pressure.frag.glsl')
            );
            console.log('✓ Concentration pressure shader loaded');
        } catch (e) {
            console.error('❌ Failed to load concentration pressure shader:', e);
            this.concentrationPressureProgram = null;
        }
        
        this.vorticityConfinementProgram = this.renderer.createProgram(
            fullscreenVert,
            await loadShader('src/shaders/vorticity-confinement.frag.glsl')
        );

        // Occupancy (percent pixels inked) program
        this.occupancyProgram = this.renderer.createProgram(
            fullscreenVert,
            await loadShader('src/shaders/occupancy.frag.glsl')
        );

        // Overflow valve program (gently damps color when overfilled)
        this.overflowProgram = this.renderer.createProgram(
            fullscreenVert,
            await loadShader('src/shaders/overflow.frag.glsl')
        );

        const width = gl.canvas.width;
        const height = gl.canvas.height;

        // Create texture pairs for ping-pong rendering (WebGL2 half-float)
        // Color: RGBA16F
        this.colorTexture1 = this.createTexture(width, height, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT);
        this.colorTexture2 = this.createTexture(width, height, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT);
        this.colorFBO = this.createFBO(this.colorTexture1);

        // Velocity: RG16F
        this.velocityTexture1 = this.createTexture(width, height, gl.RG16F, gl.RG, gl.HALF_FLOAT);
        this.velocityTexture2 = this.createTexture(width, height, gl.RG16F, gl.RG, gl.HALF_FLOAT);
        this.velocityFBO = this.createFBO(this.velocityTexture1);

        // Divergence: R16F
        this.divergenceTexture = this.createTexture(width, height, gl.R16F, gl.RED, gl.HALF_FLOAT);
        this.divergenceFBO = this.createFBO(this.divergenceTexture);

        // Pressure: R16F
        this.pressureTexture1 = this.createTexture(width, height, gl.R16F, gl.RED, gl.HALF_FLOAT);
        this.pressureTexture2 = this.createTexture(width, height, gl.R16F, gl.RED, gl.HALF_FLOAT);
        this.pressureFBO = this.createFBO(this.pressureTexture1);

        // Occupancy texture/FBO at low resolution (UNSIGNED_BYTE for easy readback)
        this.occupancyWidth = 128;
        this.occupancyHeight = 128;
        this.occupancyTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.occupancyTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.occupancyWidth, this.occupancyHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        this.occupancyFBO = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.occupancyFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.occupancyTexture, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        this.ready = true;
        console.log('✓ Simulation initialized');
    }

    createTexture(width, height, internalFormat, format, type) {
        const gl = this.gl;
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, format, type, null);
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
        gl.uniform1i(gl.getUniformLocation(this.splatProgram, 'u_isVelocity'), 1);
        gl.uniform2f(gl.getUniformLocation(this.splatProgram, 'u_resolution'), gl.canvas.width, gl.canvas.height);
        
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        this.swapVelocityTextures();
        
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    clearColor() {
        if (!this.ready) return;
        
        const gl = this.gl;
        
        // Clear both color textures
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.colorFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.colorTexture1, 0);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.colorTexture2, 0);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    splat(x, y, color, radius = 0.01) {
        if (!this.ready || !this.renderer.ready) {
            console.warn('⚠️ Splat called but not ready:', {ready: this.ready, rendererReady: this.renderer.ready});
            return;
        }

        const gl = this.gl;

        // Splat color - use proper ping-pong to avoid feedback loop
        // Read from texture1, write to texture2, then swap
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
        gl.uniform1i(gl.getUniformLocation(this.splatProgram, 'u_isVelocity'), 0);
        gl.uniform2f(gl.getUniformLocation(this.splatProgram, 'u_resolution'), gl.canvas.width, gl.canvas.height);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
        this.swapColorTextures(); // Swap so texture2 becomes the current state

        // Also inject velocity for stirring effect
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.velocityFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.velocityTexture2, 0);
        
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.velocityTexture1);
        gl.uniform1i(gl.getUniformLocation(this.splatProgram, 'u_texture'), 0);
        gl.uniform2f(gl.getUniformLocation(this.splatProgram, 'u_point'), x, y);
        // Small velocity splat
        gl.uniform3f(gl.getUniformLocation(this.splatProgram, 'u_color'), 
            (Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.06, 0);
        gl.uniform1f(gl.getUniformLocation(this.splatProgram, 'u_radius'), radius * 2);
        gl.uniform1i(gl.getUniformLocation(this.splatProgram, 'u_isVelocity'), 1);
        gl.uniform2f(gl.getUniformLocation(this.splatProgram, 'u_resolution'), gl.canvas.width, gl.canvas.height);
        
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        this.swapVelocityTextures();

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    // Recreate simulation textures/FBOs after canvas resize
    resize() {
        if (!this.renderer || !this.gl) return;
        const gl = this.gl;
        const width = gl.canvas.width;
        const height = gl.canvas.height;

        // Recreate textures
        this.colorTexture1 = this.createTexture(width, height, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT);
        this.colorTexture2 = this.createTexture(width, height, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT);
        this.velocityTexture1 = this.createTexture(width, height, gl.RG16F, gl.RG, gl.HALF_FLOAT);
        this.velocityTexture2 = this.createTexture(width, height, gl.RG16F, gl.RG, gl.HALF_FLOAT);
        this.divergenceTexture = this.createTexture(width, height, gl.R16F, gl.RED, gl.HALF_FLOAT);
        this.pressureTexture1 = this.createTexture(width, height, gl.R16F, gl.RED, gl.HALF_FLOAT);
        this.pressureTexture2 = this.createTexture(width, height, gl.R16F, gl.RED, gl.HALF_FLOAT);

        // Recreate FBOs bound to the new textures
        this.colorFBO = this.createFBO(this.colorTexture1);
        this.velocityFBO = this.createFBO(this.velocityTexture1);
        this.divergenceFBO = this.createFBO(this.divergenceTexture);
        this.pressureFBO = this.createFBO(this.pressureTexture1);

        // Clear new targets
        this.clearColor();
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    update(deltaTime) {
        if (!this.ready || !this.renderer.ready || this.paused) return;

        const gl = this.gl;
        const dt = Math.min(deltaTime, 0.016);  // Cap dt for stability

        // 1. Apply external forces (rotation, jet)
        this.applyForces(dt);

        // 2. Apply vorticity confinement (adds small-scale turbulence)
        if (this.vorticityStrength > 0) {
            this.applyVorticityConfinement();
        }

        // 3. Advect velocity (self-advection)
        this.advectVelocity(dt);

        // 4. Apply viscosity (adds thickness)
        this.applyViscosity(dt);

        // 5. Make velocity field incompressible (pressure projection)
        this.projectVelocity();

        // 6. Advect color by velocity field
        this.advectColor(dt);

        // 7. Diffuse color (only if diffusion rate > 0)
        if (this.diffusionRate > 0) {
            this.applyDiffusion(dt);
        }

        // 8. Overflow control: compute occupancy every N frames, damp if above threshold
        this._frameCounter = (this._frameCounter + 1) | 0;
        if ((this._frameCounter % this.occupancyEveryN) === 0) {
            const prevViewport = gl.getParameter(gl.VIEWPORT);
            this.computeOccupancy();
            // If above upper threshold, apply overflow damping toward lower target
            if (this.occupancyPercent > this.overflowUpper) {
                const excess = this.occupancyPercent - this.overflowLower; // e.g., 0.92 - 0.85 = 0.07
                const range = Math.max(0.01, this.overflowUpper - this.overflowLower); // avoid div0
                // Strength scaled with excess (clamped)
                const strength = Math.min(1.0, Math.max(0.0, excess / range)) * 0.35; // gentle overall cap
                this.applyOverflow(strength);
                // After damping, recompute quickly (optional)
                this.computeOccupancy();
            }
            // Restore viewport
            gl.viewport(prevViewport[0], prevViewport[1], prevViewport[2], prevViewport[3]);
        }
        
        // 8. Check for corruption (NaN/Inf detection)
        if (this.checkForCorruption()) {
            console.error('❌ Simulation paused due to corruption');
        }
        
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    
    /**
     * Check velocity field for NaN or Inf values
     * Auto-pauses simulation if corruption detected
     */
    checkForCorruption() {
        if (!this._corruptionCheckInterval) {
            this._corruptionCheckInterval = 0;
        }
        
        // Check every 10 frames for performance
        if (++this._corruptionCheckInterval % 10 !== 0) {
            return false;
        }
        
        const gl = this.gl;
        // Match velocity texture format (RG16F) for readback: use HALF_FLOAT and Uint16Array
        const pixels = new Uint16Array(2 * 10); // 10 pixels * 2 channels (RG)
        
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.velocityFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.velocityTexture1, 0);
        gl.readPixels(0, 0, 10, 1, gl.RG, gl.HALF_FLOAT, pixels);
        
        // Check for NaN or Inf (allow up to 10k velocity)
        let maxVal = 0;
        const halfToFloat = (h) => {
            const s = (h & 0x8000) >> 15;
            const e = (h & 0x7C00) >> 10;
            const f = h & 0x03FF;
            if (e === 0) {
                if (f === 0) return s ? -0 : 0;
                return (s ? -1 : 1) * Math.pow(2, -14) * (f / 1024);
            }
            if (e === 31) {
                return f ? NaN : (s ? -Infinity : Infinity);
            }
            return (s ? -1 : 1) * Math.pow(2, e - 15) * (1 + f / 1024);
        };

        for (let i = 0; i < pixels.length; i++) {
            const v = halfToFloat(pixels[i]);
            maxVal = Math.max(maxVal, Math.abs(v));
            if (!isFinite(v)) {
                this.paused = true;
                console.error('❌ NaN/Inf detected in velocity field');
                console.error('Corrupted (half) values:', Array.from(pixels.slice(0, 8)));
                return true;
            }
        }
        
        // Warn if velocity is getting very high
        if (maxVal > 10000) {
            console.warn(`⚠️ High velocity detected: ${maxVal.toFixed(0)} (may cause instability)`);
        }
        
        return false;
    }

    applyForces(dt) {
        const gl = this.gl;
        
        // Update central spiral power accumulation
        if (Math.abs(this.rotationAmount) > 0.01) {
            // Build up power when rotating
            this.centralSpiralPower = Math.min(1.0, this.centralSpiralPower + this.centralSpiralBuildRate);
            // Rotate the force emitter (faster than plate rotation for variety)
            this.centralSpiralAngle += this.rotationAmount * 3.0; // 3x plate rotation speed
        } else {
            // Decay when not rotating
            this.centralSpiralPower = Math.max(0.0, this.centralSpiralPower - this.centralSpiralDecayRate);
        }
        
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
        
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.colorTexture1);
        gl.uniform1i(gl.getUniformLocation(this.forcesProgram, 'u_color_texture'), 1);
        
        gl.uniform1f(gl.getUniformLocation(this.forcesProgram, 'u_rotation_amount'), this.rotationAmount);
        gl.uniform2f(gl.getUniformLocation(this.forcesProgram, 'u_resolution'), gl.canvas.width, gl.canvas.height);
        gl.uniform1f(gl.getUniformLocation(this.forcesProgram, 'u_dt'), dt);
        gl.uniform1f(gl.getUniformLocation(this.forcesProgram, 'u_boundary_mode'), this.boundaryMode);
        gl.uniform1f(gl.getUniformLocation(this.forcesProgram, 'u_central_spiral_power'), this.centralSpiralPower);
        gl.uniform1f(gl.getUniformLocation(this.forcesProgram, 'u_central_spiral_angle'), this.centralSpiralAngle);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
        this.swapVelocityTextures();
    }

    applyVorticityConfinement() {
        const gl = this.gl;
        
        gl.useProgram(this.vorticityConfinementProgram);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.velocityFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.velocityTexture2, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.renderer.quadBuffer);
        const positionAttrib = gl.getAttribLocation(this.vorticityConfinementProgram, 'a_position');
        gl.enableVertexAttribArray(positionAttrib);
        gl.vertexAttribPointer(positionAttrib, 2, gl.FLOAT, false, 0, 0);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.velocityTexture1);
        gl.uniform1i(gl.getUniformLocation(this.vorticityConfinementProgram, 'u_velocity_texture'), 0);
        gl.uniform1f(gl.getUniformLocation(this.vorticityConfinementProgram, 'u_confinement_strength'), this.vorticityStrength);
        gl.uniform2f(gl.getUniformLocation(this.vorticityConfinementProgram, 'u_resolution'), gl.canvas.width, gl.canvas.height);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
        this.swapVelocityTextures();
    }

    applyConcentrationPressure() {
        const gl = this.gl;
        
        if (!this._concentrationFrameCount) {
            this._concentrationFrameCount = 0;
        }
        this._concentrationFrameCount++;
        
        // Log every 60 frames to confirm it's running
        if (this._concentrationFrameCount % 60 === 1) {
            console.log(`🌊 Concentration pressure: ${this._concentrationFrameCount} frames, strength: ${this.spreadStrength}`);
        }
        
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
        gl.uniform1i(gl.getUniformLocation(this.advectionProgram, 'u_isVelocity'), 1);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
        this.swapVelocityTextures();
    }

    applyViscosity(dt) {
        const gl = this.gl;
        
        gl.useProgram(this.viscosityProgram);
        gl.uniform1f(gl.getUniformLocation(this.viscosityProgram, 'u_viscosity'), this.viscosity);
        gl.uniform1f(gl.getUniformLocation(this.viscosityProgram, 'u_dt'), dt);
        gl.uniform2f(gl.getUniformLocation(this.viscosityProgram, 'u_resolution'), gl.canvas.width, gl.canvas.height);

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
        gl.uniform2f(gl.getUniformLocation(this.divergenceProgram, 'u_resolution'), gl.canvas.width, gl.canvas.height);

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
            gl.uniform2f(gl.getUniformLocation(this.pressureProgram, 'u_resolution'), gl.canvas.width, gl.canvas.height);

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
        gl.uniform2f(gl.getUniformLocation(this.gradientProgram, 'u_resolution'), gl.canvas.width, gl.canvas.height);

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
        gl.uniform1i(gl.getUniformLocation(this.advectionProgram, 'u_isVelocity'), 0);

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
