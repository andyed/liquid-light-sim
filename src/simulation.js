import { loadShader } from './utils.js';
import WaterLayer from './simulation/layers/WaterLayer.js';
import OilLayer from './simulation/layers/OilLayer.js';
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
        
        // Physics parameters - back to working values after radical experiment
        this.viscosity = 0.03;  // Lower viscosity so momentum lingers longer
        this.diffusionRate = 0.0;  // Disable diffusion (was causing fading)
        this.oilSmoothingRate = 0.0; // Set per-material
        this.spreadStrength = 0.0;  
        this.oilCohesionStrength = 3.0;  // Cohesion force for dust cleanup
        this.oilAbsorptionThreshold = 0.12;  // Absorb thin dust
        this.oilEdgeSharpness = 0.0;  // DISABLED - was creating banding artifacts
        
        // MetaBall rendering parameters (implicit surface blending)
        this.metaballEnabled = true;       // PHASE 1.9: ENABLED - Turn particles into blobs!
        this.metaballBlobThreshold = 0.4;  // LOWERED to include more particles (was 0.70)
        this.metaballRadius = 25.0;        // WIDER for better merging (was 20)
        this.metaballBulginess = 2.5;      // SOFTER merging (was 3.0)
        this.rotationAmount = 0.0;   // Start at 0, controlled by user (A/D keys or buttons)
        this.rotationBase = 0.0;     // No baseline rotation - user controls via rotationDelta
        this.rotationDelta = 0.0;   // Transient input (keys/gestures)
        this.jetForce = {x: 0, y: 0, strength: 0};  // Jet impulse tool
        
        // Dynamic lighting - plate tilt and wobble
        this.lightTiltX = 0.0;  // -1 to 1 (left/right tilt)
        this.lightTiltY = 0.0;  // -1 to 1 (up/down tilt)
        this.lightVelX = 0.0;   // Wobble velocity
        this.lightVelY = 0.0;
        this.lightDamping = 0.92;  // Wobble damping (lower = settles faster)
        this.lightSpring = 0.15;   // Return to neutral strength
        this.useMacCormack = true;  // High-fidelity advection (eliminates numerical diffusion)
        this.vorticityStrength = 0.25;  // Reduced further to prevent ink shredding into pixel soup
        this.boundaryMode = 1;  // 0=bounce, 1=viscous drag, 2=repulsive force
        // Occupancy / overflow control (water)
        this.occupancyPercent = 0.0; // 0..1 fraction of inked pixels inside plate
        this.pixelSoupPercent = 0.0; // 0..1 fraction of inked pixels that are mixed/speckled
        this.occupancyEveryN = 120; // compute occupancy every N frames (~2 seconds at 60fps)
        this._frameCounter = 0;
        this.overflowLower = 0.80; // target lower bound
        this.overflowUpper = 0.90; // trigger threshold
        
        // Oil occupancy / overflow control (MUST be higher than water to persist longer)
        this.oilOccupancyPercent = 0.0; // 0..1 fraction of oil-covered pixels
        this.oilOverflowLower = 0.80; // target lower bound
        this.oilOverflowUpper = 0.95; // trigger threshold (HIGHER than water's 0.90 so oil persists longer)
        
        // Central spiral force accumulation
        this.centralSpiralPower = 0.0; // 0..1, builds up with sustained rotation
        this.centralSpiralBuildRate = 0.015; // how fast it builds per frame (~1 second to full)
        this.centralSpiralDecayRate = 0.05; // how fast it decays when not rotating
        this.centralSpiralAngle = 0.0; // rotation angle of the force emitter
        
        // Iteration counts (water)
        this.viscosityIterations = 20;  // Jacobi iterations for viscosity
        this.pressureIterations = 50;  // Jacobi iterations for pressure
        this.diffusionIterations = 20;  // Jacobi iterations for color diffusion
        
        // Oil-specific viscosity parameters
        this.oilViscosity = 0.8;  // Much higher than water (will be material-specific)
        this.oilViscosityIterations = 100;  // Higher iterations for thicker oil
        this.oilVorticityStrength = 0.0;  // Disable vorticity for oil (high viscosity damps swirls)
        
        // Oil → Water coupling (thickness gradient → force)
        this.couplingStrength = 0.1;  // Strength of oil pushing water (material-specific)
        
        // Testing/debugging
        this.paused = false;  // F004 requirement: pause/freeze state
        
        // Layers
        this.water = null;
        this.oil = null;      // optional, off by default
        this.useOil = false;

        // Marangoni (V1 thickness-driven)
        this.marangoniStrength = 0.0; // per-material; 0 disables
        this.marangoniEdgeBand = 2.0; // pixels
        this.marangoniKth = 0.8;      // thickness→sigma gain
        // Safety/tuning for Marangoni
        this.marangoniThMin = 0.01;       // minimum thickness to engage
        this.marangoniForceClamp = 0.08;   // per-component clamp for dv
        this.marangoniAmp = 3.0;           // gradient amplification factor

        this.agitation = 0.01; // Heat lamp agitation
        this.oilDragStrength = 15.0; // Water damping inside oil (flow-around behavior)
        this.oilNormalDamp = 0.6;    // Damping of normal component at oil rim in coupling
        this.surfaceTension = 0.1; // Surface tension for oil
        this.surfaceTensionIterations = 0; // Iterations for two-pass surface tension
        this.oilAttractionStrength = 0.4; // Strength of oil self-attraction
        this.dissipationStrength = 0.02; // Strength of thickness-based dissipation
        this.debugCopyWaterToOil = false; // Debug: force oil velocity = water velocity
        this.debugAdvectOilWithWaterVelocity = true; // Debug: advect oil using water velocity in advection step
        this.debugOffsetOilOnce = false; // Debug: perform a one-frame offset copy of oil texture
        this.debugOffsetOilDX = 0.0; // UV offset X for debug
        this.debugOffsetOilDY = 0.0; // UV offset Y for debug

        // Logging verbosity (set true to see detailed telemetry)
        this.logVerbose = false;

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

        // Oil-coupling program (blends water velocity into oil velocity)
        this.oilCouplingProgram = this.renderer.createProgram(
            fullscreenVert,
            await loadShader('src/shaders/oil-coupling.frag.glsl')
        );

        // Coupling-force program (oil thickness gradient pushes water)
        this.couplingForceProgram = this.renderer.createProgram(
            fullscreenVert,
            await loadShader('src/shaders/coupling-force.frag.glsl')
        );

        this.couplingForceProgram = this.renderer.createProgram(
            fullscreenVert,
            await loadShader('src/shaders/coupling-force.frag.glsl')
        );

        // Marangoni program (surface tension gradient forces at oil-water interface)
        this.marangoniProgram = this.renderer.createProgram(
            fullscreenVert,
            await loadShader('src/shaders/marangoni.frag.glsl')
        );

        this.oilAttractionProgram = this.renderer.createProgram(
            fullscreenVert,
            await loadShader('src/shaders/oil-attraction.frag.glsl')
        );

        this.oilAttractionProgram = this.renderer.createProgram(
            fullscreenVert,
            await loadShader('src/shaders/oil-attraction.frag.glsl')
        );

        this.agitationProgram = this.renderer.createProgram(
            fullscreenVert,
            await loadShader('src/shaders/agitation.frag.glsl')
        );

        this.curvatureProgram = this.renderer.createProgram(
            fullscreenVert,
            await loadShader('src/shaders/curvature.frag.glsl')
        );

        this.applySurfaceTensionProgram = this.renderer.createProgram(
            fullscreenVert,
            await loadShader('src/shaders/apply-surface-tension.frag.glsl')
        );

        // Surface tension force (applied to velocity, not thickness)
        this.surfaceTensionForceProgram = this.renderer.createProgram(
            fullscreenVert,
            await loadShader('src/shaders/surface-tension-force.frag.glsl')
        );

        // Water-side oil drag (Brinkman penalization lite)
        this.waterOilDragProgram = this.renderer.createProgram(
            fullscreenVert,
            await loadShader('src/shaders/oil-drag.frag.glsl')
        );

        // Debug: copy water velocity into oil velocity
        this.copyVelocityProgram = this.renderer.createProgram(
            fullscreenVert,
            await loadShader('src/shaders/copy-velocity.frag.glsl')
        );

        // Oil thickness smoothing (removes pixel dust, promotes droplet formation)
        this.oilSmoothProgram = this.renderer.createProgram(
            fullscreenVert,
            await loadShader('src/shaders/oil-smooth.frag.glsl')
        );

        // Buoyancy force (density-based vertical motion for oil)
        this.buoyancyProgram = this.renderer.createProgram(
            fullscreenVert,
            await loadShader('src/shaders/buoyancy.frag.glsl')
        );

        // Oil cohesion force (particles snap together, prevents dusting)
        this.oilCohesionProgram = this.renderer.createProgram(
            fullscreenVert,
            await loadShader('src/shaders/oil-cohesion.frag.glsl')
        );

        // Oil edge sharpening (creates distinct border layer for blobs)
        this.oilSharpenProgram = this.renderer.createProgram(
            fullscreenVert,
            await loadShader('src/shaders/oil-sharpen.frag.glsl')
        );

        // Clear region shader (for hybrid particle conversion)
        this.clearRegionProgram = this.renderer.createProgram(
            fullscreenVert,
            await loadShader('src/shaders/clear-region.frag.glsl')
        );

        // MetaBall rendering (implicit surface blending for organic blob appearance)
        this.oilMetaballProgram = this.renderer.createProgram(
            fullscreenVert,
            await loadShader('src/shaders/oil-metaball.frag.glsl')
        );
        
        // Oil Layer Compositor (blends SPH + Grid layers) - MULTI-LAYER ARCHITECTURE
        this.oilLayerCompositeProgram = this.renderer.createProgram(
            await loadShader('src/shaders/oil-layer-composite.vert.glsl'),
            await loadShader('src/shaders/oil-layer-composite.frag.glsl')
        );
        console.log('✅ Oil layer composite shader loaded');

        // SPH particle rendering (NEW!)
        this.sphParticleSplatProgram = this.renderer.createProgram(
            await loadShader('src/shaders/sph-particle-splat.vert.glsl'),
            await loadShader('src/shaders/sph-particle-splat.frag.glsl')
        );

        // Splat per-pixel oil material properties
        this.splatOilPropsProgram = this.renderer.createProgram(
            fullscreenVert,
            await loadShader('src/shaders/splat-oil-props.frag.glsl')
        );

        // Offset-copy program for debug texture translation
        this.offsetCopyProgram = this.renderer.createProgram(
            fullscreenVert,
            await loadShader('src/shaders/offset-copy.frag.glsl')
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
        
        // Initialize oil layer (always enabled now since all materials use it)
        this.oil = new OilLayer(this);
        await this.oil.init();
        this.useOil = true;
        
        this.ready = true;
        console.log('✓ Simulation initialized (water + oil layers)');
    }

    async enableOil() {
        if (this.oil) return; // already enabled
        this.oil = new OilLayer(this);
        await this.oil.init();
        this.useOil = true;
        console.log('🛢️ Oil layer enabled (scaffold)');
    }

    async disableOil() {
        this.useOil = false;
        if (this.oil && typeof this.oil.destroy === 'function') {
            try { this.oil.destroy(); } catch (_) {}
        }
        this.oil = null;
        console.log('🛢️ Oil layer disabled');
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
        if (this.water && this.water.swapColorTextures) {
            this.water.swapColorTextures();
        } else {
            [this.colorTexture1, this.colorTexture2] = [this.colorTexture2, this.colorTexture1];
        }
    }

    swapVelocityTextures() {
        if (this.water && this.water.swapVelocityTextures) {
            this.water.swapVelocityTextures();
        } else {
            [this.velocityTexture1, this.velocityTexture2] = [this.velocityTexture2, this.velocityTexture1];
        }
    }

    swapPressureTextures() {
        if (this.water && this.water.swapPressureTextures) {
            this.water.swapPressureTextures();
        } else {
            [this.pressureTexture1, this.pressureTexture2] = [this.pressureTexture2, this.pressureTexture1];
        }
    }

    setRotation(amount) {
        this.rotationBase = amount;
    }

    setRotationDelta(amount) {
        console.log(`🎚️ setRotationDelta called: ${amount.toFixed(3)} (was ${this.rotationDelta.toFixed(3)})`);
        this.rotationDelta = amount;
    }

    setJetForce(x, y, strength) {
        this.jetForce = {x, y, strength};
    }

    updateLightTilt(dt) {
        // Target tilt from rotation (stronger rotation = more tilt)
        const rotationTilt = Math.sign(this.rotationAmount) * Math.min(0.3, Math.abs(this.rotationAmount) * 5.0);
        
        // Spring force toward rotation-driven tilt
        const targetX = rotationTilt;
        const targetY = 0.0;
        
        // Spring physics
        this.lightVelX += (targetX - this.lightTiltX) * this.lightSpring;
        this.lightVelY += (targetY - this.lightTiltY) * this.lightSpring;
        
        // Damping
        this.lightVelX *= this.lightDamping;
        this.lightVelY *= this.lightDamping;
        
        // Update position
        this.lightTiltX += this.lightVelX * dt * 60;
        this.lightTiltY += this.lightVelY * dt * 60;
        
        // Clamp to prevent extreme tilts
        this.lightTiltX = Math.max(-0.5, Math.min(0.5, this.lightTiltX));
        this.lightTiltY = Math.max(-0.5, Math.min(0.5, this.lightTiltY));
    }

    addWobble(forceX, forceY) {
        // Paint/jet impacts add velocity to wobble
        this.lightVelX += forceX * 0.05;
        this.lightVelY += forceY * 0.05;
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
        console.log(`🔍 simulation.splat called: x=${x.toFixed(2)}, y=${y.toFixed(2)}, ready=${this.ready}, water=${!!this.water}`);
        if (!this.ready || !this.renderer.ready) {
            console.warn('⚠️ Splat called but not ready:', {ready: this.ready, rendererReady: this.renderer.ready});
            return;
        }
        if (this.water) {
            console.log(`🔍 Calling water.splatColor...`);
            this.water.splatColor(x, y, color, radius);
            // small stirring impulse to match previous behavior
            const cx = 0.5, cy = 0.5;
            const dx = x - cx;
            const dy = y - cy;
            const len = Math.max(1e-4, Math.hypot(dx, dy));
            const tx = -dy / len;
            const ty = dx / len;
            const dir = this.rotationAmount >= 0 ? 1 : -1;
            const strength = 0.02 * (0.5 + Math.min(1.0, Math.abs(this.rotationAmount)));
            const vx = tx * strength * dir;
            const vy = ty * strength * dir;
            this.water.splatVelocity(x, y, vx, vy, radius * 1.25);
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
        const gl = this.gl;
        gl.uniform1f(gl.getUniformLocation(this.advectionProgram, 'u_dissipation_strength'), this.dissipationStrength);
    }
    applyViscosity(dt) {
        applyViscosity(this.gl, this.renderer, this.viscosityProgram, this, dt);
    }
    projectVelocity() {
        projectVelocity(this.gl, this.renderer, this.divergenceProgram, this.pressureProgram, this.gradientProgram, this);
    }
    advectColor(dt) {
        advectColor(this.gl, this.renderer, this.advectionProgram, this, dt);
        const gl = this.gl;
        gl.uniform1f(gl.getUniformLocation(this.advectionProgram, 'u_dissipation_strength'), this.dissipationStrength);
    }
    applyDiffusion(dt) {
        diffuseColor(this.gl, this.renderer, this.diffusionProgram, this, dt);
    }
    applyCouplingForce(dt) {
        const gl = this.gl;
        gl.useProgram(this.couplingForceProgram);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.water.velocityFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.water.velocityTexture2, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.renderer.quadBuffer);
        const positionAttrib = gl.getAttribLocation(this.couplingForceProgram, 'a_position');
        gl.enableVertexAttribArray(positionAttrib);
        gl.vertexAttribPointer(positionAttrib, 2, gl.FLOAT, false, 0, 0);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.water.velocityTexture1);
        gl.uniform1i(gl.getUniformLocation(this.couplingForceProgram, 'u_waterVelocity'), 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.oil.oilTexture1);
        gl.uniform1i(gl.getUniformLocation(this.couplingForceProgram, 'u_oilThickness'), 1);

        gl.uniform1f(gl.getUniformLocation(this.couplingForceProgram, 'u_couplingStrength'), this.couplingStrength);
        gl.uniform2f(gl.getUniformLocation(this.couplingForceProgram, 'u_resolution'), gl.canvas.width, gl.canvas.height);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
        this.water.swapVelocityTextures();
    }

    applyOilAttraction(dt) {
        const gl = this.gl;
        gl.useProgram(this.oilAttractionProgram);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.oil.oilFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.oil.oilTexture2, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.renderer.quadBuffer);
        const positionAttrib = gl.getAttribLocation(this.oilAttractionProgram, 'a_position');
        gl.enableVertexAttribArray(positionAttrib);
        gl.vertexAttribPointer(positionAttrib, 2, gl.FLOAT, false, 0, 0);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.oil.oilTexture1);
        gl.uniform1i(gl.getUniformLocation(this.oilAttractionProgram, 'u_oilTexture'), 0);

        gl.uniform1f(gl.getUniformLocation(this.oilAttractionProgram, 'u_attractionStrength'), this.oilAttractionStrength);
        gl.uniform2f(gl.getUniformLocation(this.oilAttractionProgram, 'u_resolution'), gl.canvas.width, gl.canvas.height);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
        this.oil.swapOilTextures();
    }

    update(deltaTime) {
        if (!this.ready || !this.renderer.ready || this.paused) return;
        const gl = this.gl;
        const dt = Math.min(deltaTime, 0.016);
        // Defensive viewport for all passes this frame
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        // Combine rotation sources
        this.rotationAmount = this.rotationBase + this.rotationDelta;
        
        // Debug: Log when rotation is active
        if (Math.abs(this.rotationAmount) > 0.01 && Math.random() < 0.01) {
            console.log(`🎯 Main loop: rotationAmount=${this.rotationAmount.toFixed(3)}, base=${this.rotationBase}, delta=${this.rotationDelta.toFixed(3)}`);
        }
        
        // Update dynamic lighting (plate tilt from rotation + wobble)
        this.updateLightTilt(dt);
        
        if (this.water) this.water.update(dt);
        // Run oil after water velocity update (no coupling yet)
        if (this.useOil && this.oil) this.oil.update(dt);
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

        // Delegate buffer recreation to layers
        if (this.water) this.water.resize();
        if (this.useOil && this.oil) this.oil.resize();
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
