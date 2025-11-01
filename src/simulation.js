import { loadShader } from './utils.js';
import WaterLayer from './simulation/layers/WaterLayer.js';
import { applyForces } from './simulation/kernels/forces.js';
import { applyVorticityConfinement } from './simulation/kernels/vorticity.js';
import { advectVelocity, advectColor } from './simulation/kernels/advection.js';
import { applyViscosity } from './simulation/kernels/viscosity.js';
import { projectVelocity } from './simulation/kernels/pressure.js';
import { diffuseColor } from './simulation/kernels/diffusion.js';

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
        this.rotationAmount = 0.0;  // Effective rotation force (base + delta)
        this.rotationBase = 0.0;    // Button/toggle driven rotation
        this.rotationDelta = 0.0;   // Transient input (keys/gestures)
        this.jetForce = {x: 0, y: 0, strength: 0};  // Jet impulse tool
        this.useMacCormack = true;  // High-fidelity advection (eliminates numerical diffusion)
        this.vorticityStrength = 0.4;  // Reduced to slow shredding/dilution for better conservation
        this.boundaryMode = 1;  // 0=bounce, 1=viscous drag, 2=repulsive force
        // Occupancy / overflow control
        this.occupancyPercent = 0.0; // 0..1 fraction of inked pixels inside plate
        this.pixelSoupPercent = 0.0; // 0..1 fraction of inked pixels that are mixed/speckled
        this.occupancyEveryN = 8; // compute occupancy every N frames
        this._frameCounter = 0;
        this.overflowLower = 0.80; // target lower bound
        this.overflowUpper = 0.95; // trigger threshold
        
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

        this.water = new WaterLayer(this);
        await this.water.init();
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
        this.rotationBase = amount;
    }

    setRotationDelta(amount) {
        this.rotationDelta = amount;
    }

    setJetForce(x, y, strength) {
        this.jetForce = {x, y, strength};
    }

    splatVelocity(x, y, vx, vy, radius = 0.05) {
        if (!this.ready || !this.renderer.ready) return;
        if (this.water) this.water.splatVelocity(x, y, vx, vy, radius);
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
        if (this.water) {
            this.water.splatColor(x, y, color, radius);
            // small stirring impulse to match previous behavior
            const cx = 0.5, cy = 0.5;
            const dx = x - cx;
            const dy = y - cy;
            const len = Math.max(1e-4, Math.hypot(dx, dy));
            const tx = -dy / len;
            const ty = dx / len;
            const dir = this.rotationAmount >= 0 ? 1 : -1;
            const strength = 0.04 * (0.5 + Math.min(1.0, Math.abs(this.rotationAmount)));
            const vx = tx * strength * dir;
            const vy = ty * strength * dir;
            this.water.splatVelocity(x, y, vx, vy, radius * 2);
        }
    }

    // Kernel wrappers (used by WaterLayer)
    applyForces(dt) {
        applyForces(this.gl, this.renderer, this.forcesProgram, this, dt);
    }
    applyVorticityConfinement() {
        applyVorticityConfinement(this.gl, this.renderer, this.vorticityConfinementProgram, this);
    }
    advectVelocity(dt) {
        advectVelocity(this.gl, this.renderer, this.advectionProgram, this, dt);
    }
    applyViscosity(dt) {
        applyViscosity(this.gl, this.renderer, this.viscosityProgram, this, dt);
    }
    projectVelocity() {
        projectVelocity(this.gl, this.renderer, this.divergenceProgram, this.pressureProgram, this.gradientProgram, this);
    }
    advectColor(dt) {
        advectColor(this.gl, this.renderer, this.advectionProgram, this, dt);
    }
    applyDiffusion(dt) {
        diffuseColor(this.gl, this.renderer, this.diffusionProgram, this, dt);
    }

    update(deltaTime) {
        if (!this.ready || !this.renderer.ready || this.paused) return;
        const gl = this.gl;
        const dt = Math.min(deltaTime, 0.016);
        // Defensive viewport for all passes this frame
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        // Combine rotation sources
        this.rotationAmount = this.rotationBase + this.rotationDelta;
        if (this.water) this.water.update(dt);
        // Keep corruption check centralized here
        if (this.checkForCorruption()) {
            console.error('❌ Simulation paused due to corruption');
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    recreateTextures() {
        const gl = this.gl;
        const width = gl.canvas.width;
        const height = gl.canvas.height;
        // Scale solver iterations based on resolution (reference min-dim = 1080)
        const _minDimInit = Math.max(1, Math.min(width, height));
        const _iterScaleInit = Math.min(1.75, Math.max(0.75, 1080.0 / _minDimInit));
        this.viscosityIterations = Math.max(10, Math.round(20 * _iterScaleInit));
        this.pressureIterations = Math.max(30, Math.round(50 * _iterScaleInit));
        // Scale solver iterations based on resolution (reference min-dim = 1080)
        const minDim = Math.max(1, Math.min(width, height));
        const iterScale = Math.min(1.75, Math.max(0.75, 1080.0 / minDim));
        this.viscosityIterations = Math.max(10, Math.round(20 * iterScale));
        this.pressureIterations = Math.max(30, Math.round(50 * iterScale));

        // Delegate buffer recreation to layer
        if (this.water) this.water.resize();
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
        // Make sure viewport covers full canvas (computeOccupancy sets a 128x128 viewport)
        const prevViewport = gl.getParameter(gl.VIEWPORT);
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
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
        gl.uniform1f(gl.getUniformLocation(this.overflowProgram, 'u_strength'), strength);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
        this.swapColorTextures();

        // Optional: log one-shot
        console.log(`🚰 Overflow valve engaged: strength=${strength.toFixed(2)} → target ${(this.overflowLower*100)|0}-${(this.overflowUpper*100)|0}%`);
        // Restore previous viewport
        gl.viewport(prevViewport[0], prevViewport[1], prevViewport[2], prevViewport[3]);
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
    
    /**
     * Check velocity field for NaN or Inf values
     * Auto-pauses simulation if corruption detected
     */
    checkForCorruption() {
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
}
