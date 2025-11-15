import FluidLayer from './FluidLayer.js';
import OilParticle from '../OilParticle.js';
import SPHOilSystem from '../sph/SPHOilSystem.js';
import WebGPUSPH from '../sph/webgpu-sph.js';
import WebGPUSPHUpdate from '../sph/webgpu-sph-update.js';
import { loadShader } from '../../utils.js';

export default class OilLayer extends FluidLayer {
  constructor(simulation, sphParticleSplatVertWGSL, sphParticleSplatFragWGSL) {
    super(simulation);
    
    // SPH PARTICLE SYSTEM (PHASE 1: INCREMENTAL REBUILD)
    this.useSPH = true; // RE-ENABLED: Starting from scratch, testing each piece
    this.sph = new SPHOilSystem(5000, 0.48, sphParticleSplatVertWGSL, sphParticleSplatFragWGSL); // REDUCED: 5k max for Phase 1 testing
    this.webgpuSPH = null;
    this.webgpuSPHUpdate = null;
    // Feature flags: keep WebGPU SPH compute and direct canvas draw disabled by default
    // to favor the more battle-tested CPU SPH + WebGL rendering path on macOS.
    this.enableWebgpuSphCompute = false;
    this.enableWebgpuDrawToCanvas = false;
    // NOTE: Physics disabled until validated step-by-step
    
    // === MULTI-LAYER ARCHITECTURE ===
    // SPH LAYER (Mineral Oil, Syrup, Glycerine) - particle-based
    this.sphTexture1 = null;
    this.sphTexture2 = null;
    this.sphFBO = null;
    
    // GRID LAYER (Alcohol) - texture-based advection-diffusion
    this.gridTexture1 = null;
    this.gridTexture2 = null;
    this.gridFBO = null;
    this.gridVelocityTexture1 = null;
    this.gridVelocityTexture2 = null;
    this.gridVelocityFBO = null;
    
    // COMPOSITE LAYER (final blended result)
    this.compositedTexture = null;
    this.compositeFBO = null;
    // Half-res density buffers for separable blur (composite v2)
    this.densityHalfTex1 = null;
    this.densityHalfTex2 = null;
    this.densityHalfFBO = null;
    // Short post-splat boost to help immediate congealing
    this.postSplatBoostFrames = 0;
    this.postSplatBoostTotal = 180; // frames for boost ramp (~3s at 60fps)
    // Use multi-cluster spawning for SPH materials (promotes fast congeal)
    this.useClusterSpawn = true;
    // Allow continuous accumulation during painting (no cooldown)
    // Longer painting = bigger blob
    this.splatCooldownMs = 0; // No cooldown - particles accumulate continuously
    this.lastSplatAtMs = 0;
    
    // Track if layers have content (for optimization and proper rendering)
    this.hasGridContent = false; // True if Alcohol has been painted
    this.useDensityComposite = true; // Enable smoothing-based continuous sheet rendering
    // Throttled CPU grid sampling cache (to avoid per-frame readback stalls)
    this.gridSampleInterval = 10; // frames between samples (higher for better perf)
    this.gridSampleFrame = 0;
    this.cachedGridVelocities = null;
    
    // LEGACY - being migrated to layer system
    this.oilTexture1 = null;  // Currently used for rendering (will become compositedTexture)
    this.oilTexture2 = null;  // Swap buffer
    this.oilFBO = null;
    this.oilVelocityTexture1 = null;
    this.oilVelocityTexture2 = null;
    this.oilVelocityFBO = null;
    this.curvatureTexture = null;
    this.curvatureFBO = null;
    // Per-pixel material properties for oil: R=coupling, G=viscosity, B=surfaceTension, A=drag
    this.oilPropsTexture1 = null;
    this.oilPropsTexture2 = null;
    this.oilPropsFBO = null;
    
    // Old hybrid particle system (DISABLED)
    this.particles = [];
    this.maxParticles = 500;
    this.particleConversionThreshold = 0.35;
    this.particleMergeDistance = 0.03;
    this.particleConversionInterval = 30;
    this.framesSinceConversion = 0;
  }

  async init() {
    const gl = this.gl;
    // Derive canvas size from available sources (gl, renderer, or DOM),
    // and guard if the canvas is not yet ready.
    const canvas = (gl && gl.canvas) || this.sim.renderer.canvas || document.getElementById('gl-canvas');
    if (!canvas) {
      console.warn('⚠️ OilLayer.init: canvas not available yet, skipping texture init');
      return;
    }
    const w = canvas.width;
    const h = canvas.height;

    // Verify Alcohol fix is loaded
    console.log('✨ OilLayer.js: Alcohol fix LOADED (Nov 9, 3:33pm)');
    
    if (gl) {
        // Initialize SPH system
        console.log('🚀 Initializing SPH Oil System...');
        this.sph.initGPU(gl, this.sim.sphParticleSplatProgram);
        console.log(`✅ SPH initialized: max ${this.sph.maxParticles} particles`);
    }

    if (this.sim.webgpu) {
        this.webgpuSPH = new WebGPUSPH(this.sim.webgpu.device, this.sph.maxParticles);
        console.log('🚀 Initializing WebGPU SPH System...');
        this.webgpuSPHUpdate = new WebGPUSPHUpdate(this.sim.webgpu.device, this.webgpuSPH);
        this.webgpuSPHUpdate.init();
        this.sph.initWebGPU(this.sim.webgpu.device); // Initialize WebGPU rendering for SPH

        // Create WebGPU texture for SPH rendering
        this.webgpuSphTexture = this.sim.webgpu.device.createTexture({
            size: [w, h],
            format: 'rgba16float',
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
            label: 'WebGPU SPH Render Texture',
        });
        this.webgpuSphTextureView = this.webgpuSphTexture.createView();
        console.log('✅ WebGPU SPH render texture created');
        this.initWebGPUDrawToCanvasPipeline(); // Initialize pipeline to draw WebGPU texture to canvas
    }

    if (gl) {
        // === INITIALIZE MULTI-LAYER TEXTURES ===
        console.log('🎨 Initializing multi-layer architecture...');
        
        // SPH LAYER (particle-based blobs)
        this.sphTexture1 = this.sim.createTexture(w, h, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT);
        this.sphTexture2 = this.sim.createTexture(w, h, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT);
        this.sphFBO = this.sim.createFBO(this.sphTexture1);
        
        // GRID LAYER (texture-based advection-diffusion)
        this.gridTexture1 = this.sim.createTexture(w, h, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT);
        this.gridTexture2 = this.sim.createTexture(w, h, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT);
        this.gridFBO = this.sim.createFBO(this.gridTexture1);
        this.gridVelocityTexture1 = this.sim.createTexture(w, h, gl.RG32F, gl.RG, gl.FLOAT);
        this.gridVelocityTexture2 = this.sim.createTexture(w, h, gl.RG32F, gl.RG, gl.FLOAT);
        this.gridVelocityFBO = this.sim.createFBO(this.gridVelocityTexture1);
        
        // COMPOSITE LAYER (final blend)
        this.compositedTexture = this.sim.createTexture(w, h, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT);
        this.compositeFBO = this.sim.createFBO(this.compositedTexture);
        // Half-res density buffers for separable blur (composite v2)
        const hw = Math.max(1, Math.floor(w * 0.5));
        const hh = Math.max(1, Math.floor(h * 0.5));
        this.densityHalfTex1 = this.sim.createTexture(hw, hh, gl.R16F, gl.RED, gl.HALF_FLOAT);
        this.densityHalfTex2 = this.sim.createTexture(hw, hh, gl.R16F, gl.RED, gl.HALF_FLOAT);
        this.densityHalfFBO = this.sim.createFBO(this.densityHalfTex1);
        
        console.log('✅ Multi-layer textures created: SPH + Grid + Composite');

        // LEGACY textures (will be phased out) - keeping for now during migration
        this.oilTexture1 = this.sim.createTexture(w, h, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT);
        this.oilTexture2 = this.sim.createTexture(w, h, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT);
        this.oilFBO = this.sim.createFBO(this.oilTexture1);

        // Oil velocity field (RG32F for velocity vectors - more robust than RG16F)
        this.oilVelocityTexture1 = this.sim.createTexture(w, h, gl.RG32F, gl.RG, gl.FLOAT);
        this.oilVelocityTexture2 = this.sim.createTexture(w, h, gl.RG32F, gl.RG, gl.FLOAT);
        this.oilVelocityFBO = this.sim.createFBO(this.oilVelocityTexture1);

        this.curvatureTexture = this.sim.createTexture(w, h, gl.R16F, gl.RED, gl.HALF_FLOAT);
        this.curvatureFBO = this.sim.createFBO(this.curvatureTexture);

        // Per-pixel material properties texture (RGBA16F) - ping-pong for feedback loop prevention
        this.oilPropsTexture1 = this.sim.createTexture(w, h, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT);
        this.oilPropsTexture2 = this.sim.createTexture(w, h, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT);
        this.oilPropsFBO = this.sim.createFBO(this.oilPropsTexture1);
        // Initialize ALL textures to zero to avoid garbage-driven spreading
        const prevFbo = gl.getParameter(gl.FRAMEBUFFER_BINDING);
        gl.clearColor(0, 0, 0, 0);
        
        // Clear SPH layer
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.sphFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.sphTexture1, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.sphTexture2, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        
        // Clear Grid layer
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.gridFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.gridTexture1, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.gridTexture2, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.gridVelocityFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.gridVelocityTexture1, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.gridVelocityTexture2, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        
        // Clear Composite layer
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.compositeFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.compositedTexture, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        
        // Clear LEGACY textures
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.oilFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.oilTexture1, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.oilTexture2, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.oilVelocityFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.oilVelocityTexture1, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.oilVelocityTexture2, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        
        // Zero-init props textures
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.oilPropsFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.oilPropsTexture1, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.oilPropsTexture2, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        
        gl.bindFramebuffer(gl.FRAMEBUFFER, prevFbo);
        console.log('✅ All oil layer textures cleared');
    }
  }

  /**
   * Update SPH particle layer (Mineral Oil, Syrup, Glycerine)
   * Handles physics simulation and rendering to sphTexture
   */
  async updateSPHLayer(dt, useSPHForMaterial) {
    const gl = this.gl;
    const sim = this.sim;
    const controller = window.controller || this.sim.controller;
    const currentMaterial = controller?.materials[controller?.currentMaterialIndex]?.name || '';
    
    // STEP 1: Throttled sample of grid velocity from water layer (rotation + coupling)
    // NOTE: CPU-side sampling (readPixels) is expensive; disable for Syrup and
    // only keep it for other materials when rotation is actually active.
    let gridVelocities = null;
    if (this.sph.particleCount > 0) {
      const hasRotation = Math.abs(sim.rotationAmount) > 0.001;
      const enableCpuSampling = hasRotation && currentMaterial !== 'Syrup';

      if (enableCpuSampling) {
        this.gridSampleFrame = (this.gridSampleFrame + 1) | 0;
        const shouldSample = (this.gridSampleFrame % this.gridSampleInterval) === 1;
        if (shouldSample) {
          gridVelocities = this.sph.sampleVelocityGrid(
            sim.velocityTexture1,
            this.sim.renderer.canvas.width,
            this.sim.renderer.canvas.height
          );
          this.cachedGridVelocities = gridVelocities;
        } else {
          // Reuse cached velocities if particle count matches; otherwise skip drag this frame
          if (this.cachedGridVelocities && this.cachedGridVelocities.length === this.sph.particleCount * 2) {
            gridVelocities = this.cachedGridVelocities;
          } else {
            gridVelocities = null;
          }
        }
      } else {
        // No CPU sampling for Syrup or when rotation is off
        gridVelocities = null;
      }

      // Apply post-splat boost ramp (non-accumulating): only ramp grid drag coupling
      if (this.postSplatBoostFrames > 0 && this.sph) {
        const t = 1.0 - (this.postSplatBoostFrames / Math.max(1, this.postSplatBoostTotal));
        // Ramp from very low coupling (0.3) to normal (1.0) over boost period
        const ramped = 0.3 + 0.7 * t;
        this.sph.gridDragCoeff = ramped;
        this.postSplatBoostFrames--;
        if (this.postSplatBoostFrames === 0) {
          // After ramp, set to stronger rotation coupling
          this.sph.gridDragCoeff = 1.3;
        }
      }
    }
    
    // Apply per-material SPH tuning (kept lightweight; no change to smoothingRadius)
    if (this.sph) {
      switch (currentMaterial) {
        case 'Syrup':
          // Syrup: slow, overdamped, highly cohesive "hero" blob
          this.sph.viscosity = 0.38;              // higher internal resistance
          this.sph.shortCohesion = 4.0;           // even softer pull to reduce rapid blob merging
          this.sph.shortRadiusScale = 1.4;        // tighter radius so cohesion is very local
          this.sph.minDistScale = 0.22;           // slightly larger core spacing to avoid hard overlaps
          this.sph.longCohesion = 0.0;            // disable long-range cohesion to prevent distant pull-in
          this.sph.longRadiusScale = 3.0;         // keep influence fairly local
          this.sph.splitDistance = 1.4;           // lower maxCohesionDist: different blobs don't see each other as much
          this.sph.spawnSpeedScale = 0.04;        // almost no initial kick
          this.sph.gridDragCoeff = 3.0;           // stronger coupling to water (oil follows flow more)
          this.sph.maxSpeedCap = 0.24;            // slightly lower cap for dense cores
          this.sph.xsphCoeff = 0.25;              // weaker velocity equalization (less condensation)
          this.sph.dampingFactor = 0.96;          // even stronger per-step damping on dense cores
          this.sph.maxPressureDensityRatio = 1.2; // saturate pressure even earlier so density maps to size
          // Positional cohesion: local-only to avoid cross-blob averaging
          this.sph.enablePositionalCohesion = true;
          this.sph.posCohesionCoeff = 0.02;       // softer centroid pull (slower condensation)
          this.sph.maxPosNudge = 0.0012;          // smaller centroid nudge per frame
          this.sph.posCohesionBoostCoeff = 0.09;  // weaker extra pull for fresh splats
          this.sph.posCohesionRadiusScale = 1.2;  // ~1.2h neighborhood: stays inside blob thickness
          this.sph.particleSpriteRadius = 118.0;  // smaller sprite; rely on more particles per splat
          // Thinning & splitting: Syrup should very rarely auto-split
          this.sph.thinningThreshold = 0.42;      // lower threshold = harder to mark regions as thin
          this.sph.cohesionReductionInThin = 0.7; // reduce cohesion less in thin regions
          this.sph.splitDistance = 3.5;           // clusters must separate further before splitting
          break;
        case 'Glycerine':
          this.sph.viscosity = 0.14;
          this.sph.shortCohesion = 8.5;
          this.sph.shortRadiusScale = 1.6; // REDUCED from 2.2 to prevent cross-blob attraction
          this.sph.minDistScale = 0.45;
          this.sph.longCohesion = 0.0; // disabled - prevents distant blob merging
          this.sph.longRadiusScale = 3.2;
          this.sph.spawnSpeedScale = 0.5;
          this.sph.gridDragCoeff = 1.1;
          this.sph.maxSpeedCap = 0.55;
          this.sph.xsphCoeff = 0.25;
          this.sph.particleSpriteRadius = 130.0;
          // Thinning & splitting: Glycerine is medium - can thin and split
          this.sph.thinningThreshold = 0.6;
          this.sph.cohesionReductionInThin = 0.3;
          this.sph.splitDistance = 2.5;
          break;
        case 'Mineral Oil':
        default:
          this.sph.viscosity = 0.08;
          // Softer, more local cohesion so blobs don’t over-condense
          this.sph.shortCohesion = 4.4;     // even softer cohesion to reduce bubble collapse
          this.sph.shortRadiusScale = 1.35; // slightly tighter radius
          this.sph.minDistScale = 0.35;
          this.sph.longCohesion = 0.0; // disabled - prevents distant blob merging
          this.sph.longRadiusScale = 4.0;
          this.sph.spawnSpeedScale = 1.0;
          this.sph.gridDragCoeff = 1.3;
          this.sph.maxSpeedCap = 0.5;         // lower cap: dense cores move more slowly
          this.sph.xsphCoeff = 0.18;          // weaker velocity equalization
          this.sph.dampingFactor = 0.955;     // stronger damping per step
          this.sph.particleSpriteRadius = 100.0;
          // Thinning & splitting: Mineral Oil is fluid - easy to thin and split
          this.sph.thinningThreshold = 0.7;   // Higher threshold = easier to thin
          this.sph.cohesionReductionInThin = 0.25; // slightly more reduction in thin regions
          this.sph.splitDistance = 2.2;       // blobs separate a bit more before splitting
          // Positional cohesion: keep but softer to avoid minimum-size collapse
          this.sph.enablePositionalCohesion = true;
          this.sph.posCohesionCoeff = 0.035;  // softer centroid pull so bubbles stay chunky
          this.sph.maxPosNudge = 0.0018;
          this.sph.posCohesionBoostCoeff = 0.14;
          this.sph.maxPressureDensityRatio = 1.3; // Mineral Oil: saturate pressure earlier in dense cores
          break;
      }
    }

    // STEP 2: Update SPH particle physics (always if particles exist!)
    // Particles should continue moving even when user switches to Ink/Alcohol
    if (this.sph.particleCount > 0) {
      // Frame skip if too many particles (CPU bottleneck mitigation)
      if (!this.sphFrameSkip) this.sphFrameSkip = 0;
      this.sphFrameSkip++;
      
      // Skip physics every other frame if > 3000 particles
      const shouldSkipPhysics = this.sph.particleCount > 3000 && this.sphFrameSkip % 2 === 0;
      
      if (!shouldSkipPhysics) {
        if (this.webgpuSPHUpdate && this.enableWebgpuSphCompute) {
          await this.webgpuSPHUpdate.update(this.sph, dt);
        } else {
          this.sph.update(dt, sim.rotationAmount, gridVelocities);
        }
      }
    }
    
    // STEP 3: Render particles to SPH texture
    if (this.sph.particleCount > 0) {
      if (gl) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, this.sphFBO);
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.sphTexture2, 0);
          gl.disable(gl.BLEND); // MUST disable blend for proper clear
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
      }
      
      // Rasterize SPH particles to texture (blend will be re-enabled inside)
      if (this.sim.webgpu && this.webgpuSphTextureView && this.enableWebgpuDrawToCanvas) {
        // Optional: direct WebGPU draw to canvas/texture when explicitly enabled
        this.sph.renderParticles(this.webgpuSphTextureView, this.sim.renderer.canvas.width, this.sim.renderer.canvas.height);
      } else if (gl) {
        this.sph.renderParticles(this.sphFBO, this.sim.renderer.canvas.width, this.sim.renderer.canvas.height);
      }
      
      if (gl) {
          this.swapSPHTextures();
          
          // STEP 4: Density Composite v2 (half-res separable Gaussian on alpha)
          if (this.useDensityComposite) {
            // Lazy-create programs
            if (!sim.gaussBlurHProgram) sim.gaussBlurHProgram = this.createGaussBlurProgram(true);
            if (!sim.gaussBlurVProgram) sim.gaussBlurVProgram = this.createGaussBlurProgram(false);
            if (!sim.composeAlphaProgram) sim.composeAlphaProgram = this.createComposeAlphaProgram();

            // Downsample alpha to half-res density buffer
            const hw = Math.max(1, Math.floor(gl.canvas.width * 0.5));
            const hh = Math.max(1, Math.floor(gl.canvas.height * 0.5));
            gl.viewport(0, 0, hw, hh);
            gl.useProgram(sim.composeAlphaProgram);
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.densityHalfFBO);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.densityHalfTex2, 0);
            gl.disable(gl.BLEND);
            gl.bindBuffer(gl.ARRAY_BUFFER, sim.renderer.quadBuffer);
            const pos0 = gl.getAttribLocation(sim.composeAlphaProgram, 'a_position');
            gl.enableVertexAttribArray(pos0);
            gl.vertexAttribPointer(pos0, 2, gl.FLOAT, false, 0, 0);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.sphTexture1);
            gl.uniform1i(gl.getUniformLocation(sim.composeAlphaProgram, 'u_colorTex'), 0);
            gl.uniform1i(gl.getUniformLocation(sim.composeAlphaProgram, 'u_mode'), 0); // 0=extract alpha only
            gl.drawArrays(gl.TRIANGLES, 0, 6);
            this.swapDensityHalfTextures();

            // Horizontal blur
            gl.useProgram(sim.gaussBlurHProgram);
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.densityHalfFBO);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.densityHalfTex2, 0);
            const posH = gl.getAttribLocation(sim.gaussBlurHProgram, 'a_position');
            gl.enableVertexAttribArray(posH);
            gl.vertexAttribPointer(posH, 2, gl.FLOAT, false, 0, 0);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.densityHalfTex1);
            gl.uniform1i(gl.getUniformLocation(sim.gaussBlurHProgram, 'u_tex'), 0);
            gl.uniform2f(gl.getUniformLocation(sim.gaussBlurHProgram, 'u_texelSize'), 1.0 / hw, 1.0 / hh);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
            this.swapDensityHalfTextures();

            // Vertical blur
            gl.useProgram(sim.gaussBlurVProgram);
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.densityHalfFBO);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.densityHalfTex2, 0);
            const posV = gl.getAttribLocation(sim.gaussBlurVProgram, 'a_position');
            gl.enableVertexAttribArray(posV);
            gl.vertexAttribPointer(posV, 2, gl.FLOAT, false, 0, 0);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.densityHalfTex1);
            gl.uniform1i(gl.getUniformLocation(sim.gaussBlurVProgram, 'u_tex'), 0);
            gl.uniform2f(gl.getUniformLocation(sim.gaussBlurVProgram, 'u_texelSize'), 1.0 / hw, 1.0 / hh);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
            this.swapDensityHalfTextures();

            // Recompose: replace SPH alpha with blurred density (upsampled)
            gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
            gl.useProgram(sim.composeAlphaProgram);
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.sphFBO);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.sphTexture2, 0);
            const pos1 = gl.getAttribLocation(sim.composeAlphaProgram, 'a_position');
            gl.enableVertexAttribArray(pos1);
            gl.vertexAttribPointer(pos1, 2, gl.FLOAT, false, 0, 0);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.sphTexture1); // original color
            gl.uniform1i(gl.getUniformLocation(sim.composeAlphaProgram, 'u_colorTex'), 0);
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, this.densityHalfTex1); // blurred alpha
            gl.uniform1i(gl.getUniformLocation(sim.composeAlphaProgram, 'u_densityTex'), 1);
            gl.uniform1i(gl.getUniformLocation(sim.composeAlphaProgram, 'u_mode'), 1); // 1=compose
            gl.drawArrays(gl.TRIANGLES, 0, 6);
            this.swapSPHTextures();
          }

          // STEP 4 (alternative): MetaBall rendering (keep as optional fallback)
          if (!this.useDensityComposite && sim.metaballEnabled && sim.oilMetaballProgram) {
            gl.useProgram(sim.oilMetaballProgram);
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.sphFBO);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.sphTexture2, 0);
            
            gl.disable(gl.BLEND); // MetaBall is fullscreen replacement, not blending
            
            gl.bindBuffer(gl.ARRAY_BUFFER, sim.renderer.quadBuffer);
            const posMetaball = gl.getAttribLocation(sim.oilMetaballProgram, 'a_position');
            gl.enableVertexAttribArray(posMetaball);
            gl.vertexAttribPointer(posMetaball, 2, gl.FLOAT, false, 0, 0);
            
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.sphTexture1);
            gl.uniform1i(gl.getUniformLocation(sim.oilMetaballProgram, 'u_oil_texture'), 0);
            gl.uniform2f(gl.getUniformLocation(sim.oilMetaballProgram, 'u_resolution'), gl.canvas.width, gl.canvas.height);
            gl.uniform1f(gl.getUniformLocation(sim.oilMetaballProgram, 'u_blobThreshold'), sim.metaballBlobThreshold);
            gl.uniform1f(gl.getUniformLocation(sim.oilMetaballProgram, 'u_metaballRadius'), sim.metaballRadius);
            gl.uniform1f(gl.getUniformLocation(sim.oilMetaballProgram, 'u_bulginess'), sim.metaballBulginess);
            
            gl.drawArrays(gl.TRIANGLES, 0, 6);
            this.swapSPHTextures();
          }
      }
    } else if (gl) {
      // No particles - clear SPH texture
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.sphFBO);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.sphTexture2, 0);
      gl.disable(gl.BLEND);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      this.swapSPHTextures();
    }
  }
  
  /**
   * Update Grid layer (Alcohol)
   * Handles texture-based advection-diffusion on gridTexture
   */
  updateGridLayer(dt) {
    const gl = this.gl;
    const sim = this.sim;
    
    if (gl) {
        // Ensure grid passes render at full canvas size
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        
        // STEP 1: Apply coupling from water velocity
        gl.useProgram(sim.oilCouplingProgram);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.gridVelocityFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.gridVelocityTexture2, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, sim.renderer.quadBuffer);
        const posCoupling = gl.getAttribLocation(sim.oilCouplingProgram, 'a_position');
        gl.enableVertexAttribArray(posCoupling);
        gl.vertexAttribPointer(posCoupling, 2, gl.FLOAT, false, 0, 0);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.gridVelocityTexture1);
        gl.uniform1i(gl.getUniformLocation(sim.oilCouplingProgram, 'u_oilVelocity'), 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, sim.velocityTexture1);
        gl.uniform1i(gl.getUniformLocation(sim.oilCouplingProgram, 'u_waterVelocity'), 1);

        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, this.gridTexture1);
        gl.uniform1i(gl.getUniformLocation(sim.oilCouplingProgram, 'u_oil'), 2);

        gl.uniform1f(gl.getUniformLocation(sim.oilCouplingProgram, 'u_couplingStrength'), sim.couplingStrength);
        gl.uniform1f(gl.getUniformLocation(sim.oilCouplingProgram, 'u_dt'), dt);
        gl.uniform2f(gl.getUniformLocation(sim.oilCouplingProgram, 'u_resolution'), gl.canvas.width, gl.canvas.height);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
        this.swapGridVelocityTextures();

        // STEP 2: Advect grid velocity
        gl.useProgram(sim.advectionProgram);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.gridVelocityFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.gridVelocityTexture2, 0);

        const posAdvVel = gl.getAttribLocation(sim.advectionProgram, 'a_position');
        gl.enableVertexAttribArray(posAdvVel);
        gl.vertexAttribPointer(posAdvVel, 2, gl.FLOAT, false, 0, 0);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.gridVelocityTexture1);
        gl.uniform1i(gl.getUniformLocation(sim.advectionProgram, 'u_velocity'), 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.gridVelocityTexture1);
        gl.uniform1i(gl.getUniformLocation(sim.advectionProgram, 'u_source'), 1);

        gl.uniform2f(gl.getUniformLocation(sim.advectionProgram, 'u_resolution'), gl.canvas.width, gl.canvas.height);
        gl.uniform1f(gl.getUniformLocation(sim.advectionProgram, 'u_dt'), dt);
        gl.uniform1f(gl.getUniformLocation(sim.advectionProgram, 'u_dissipation'), 1.0);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
        this.swapGridVelocityTextures();

        // STEP 3: Advect grid color/thickness
        gl.useProgram(sim.advectionProgram);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.gridFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.gridTexture2, 0);

        const posAdvColor = gl.getAttribLocation(sim.advectionProgram, 'a_position');
        gl.enableVertexAttribArray(posAdvColor);
        gl.vertexAttribPointer(posAdvColor, 2, gl.FLOAT, false, 0, 0);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.gridVelocityTexture1);
        gl.uniform1i(gl.getUniformLocation(sim.advectionProgram, 'u_velocity'), 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.gridTexture1);
        gl.uniform1i(gl.getUniformLocation(sim.advectionProgram, 'u_source'), 1);

        gl.uniform2f(gl.getUniformLocation(sim.advectionProgram, 'u_resolution'), gl.canvas.width, gl.canvas.height);
        gl.uniform1f(gl.getUniformLocation(sim.advectionProgram, 'u_dt'), dt);
        // High dissipation for Alcohol - it spreads and fades (surfactant effect)
        gl.uniform1f(gl.getUniformLocation(sim.advectionProgram, 'u_dissipation'), 0.97); // Fades relatively quickly after application

        gl.drawArrays(gl.TRIANGLES, 0, 6);
        this.swapGridTextures();
        
        // STEP 4: Apply diffusion (Alcohol spreads and fades)
        // Apply if grid has content AND diffusion is enabled
        if (this.hasGridContent && sim.oilDiffusion > 0.0) {
          gl.useProgram(sim.diffusionProgram);
          gl.bindFramebuffer(gl.FRAMEBUFFER, this.gridFBO);
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.gridTexture2, 0);

          const posDiff = gl.getAttribLocation(sim.diffusionProgram, 'a_position');
          gl.enableVertexAttribArray(posDiff);
          gl.vertexAttribPointer(posDiff, 2, gl.FLOAT, false, 0, 0);

          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, this.gridTexture1);
          gl.uniform1i(gl.getUniformLocation(sim.diffusionProgram, 'u_texture'), 0);

          gl.uniform2f(gl.getUniformLocation(sim.diffusionProgram, 'u_resolution'), gl.canvas.width, gl.canvas.height);
          gl.uniform1f(gl.getUniformLocation(sim.diffusionProgram, 'u_diffusion'), sim.oilDiffusion);
          gl.uniform1f(gl.getUniformLocation(sim.diffusionProgram, 'u_dt'), dt);

          gl.drawArrays(gl.TRIANGLES, 0, 6);
          this.swapGridTextures();
        }
    }
  }

  resize() {
    const gl = this.gl;
    const w = this.sim.renderer.canvas.width;
    const h = this.sim.renderer.canvas.height;

    if (gl) {
        if (this.oilTexture1) gl.deleteTexture(this.oilTexture1);
        if (this.oilTexture2) gl.deleteTexture(this.oilTexture2);
        if (this.oilFBO) gl.deleteFramebuffer(this.oilFBO);

        this.oilTexture1 = this.sim.createTexture(w, h, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT);
        this.oilTexture2 = this.sim.createTexture(w, h, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT);
        this.oilFBO = this.sim.createFBO(this.oilTexture1);

        if (this.oilVelocityTexture1) gl.deleteTexture(this.oilVelocityTexture1);
        if (this.oilVelocityTexture2) gl.deleteTexture(this.oilVelocityTexture2);
        if (this.oilVelocityFBO) gl.deleteFramebuffer(this.oilVelocityFBO);

        if (this.curvatureTexture) gl.deleteTexture(this.curvatureTexture);
        if (this.curvatureFBO) gl.deleteFramebuffer(this.curvatureFBO);
        if (this.oilPropsTexture1) gl.deleteTexture(this.oilPropsTexture1);
        if (this.oilPropsTexture2) gl.deleteTexture(this.oilPropsTexture2);
        if (this.oilPropsFBO) gl.deleteFramebuffer(this.oilPropsFBO);

        // Recreate oil velocity field (RG32F for better hardware compatibility)
        this.oilVelocityTexture1 = this.sim.createTexture(w, h, gl.RG32F, gl.RG, gl.FLOAT);
        this.oilVelocityTexture2 = this.sim.createTexture(w, h, gl.RG32F, gl.RG, gl.FLOAT);
        this.oilVelocityFBO = this.sim.createFBO(this.oilVelocityTexture1);

        this.curvatureTexture = this.sim.createTexture(w, h, gl.R16F, gl.RED, gl.HALF_FLOAT);
        this.curvatureFBO = this.sim.createFBO(this.curvatureTexture);
        
        // Recreate oil properties textures
        this.oilPropsTexture1 = this.sim.createTexture(w, h, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT);
        this.oilPropsTexture2 = this.sim.createTexture(w, h, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT);
        this.oilPropsFBO = this.sim.createFBO(this.oilPropsTexture1);
    }

    // Resize WebGPU SPH texture if it exists
    if (this.webgpuSphTexture) {
      this.webgpuSphTexture.destroy(); // Release old texture
      this.webgpuSphTexture = this.sim.webgpu.device.createTexture({
        size: [w, h],
        format: 'rgba16float',
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        label: 'WebGPU SPH Render Texture',
      });
      this.webgpuSphTextureView = this.webgpuSphTexture.createView();
    }
    
    if (gl) {
        // Zero initialize after resize to prevent residuals
        const prevFbo2 = gl.getParameter(gl.FRAMEBUFFER_BINDING);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.oilFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.oilTexture1, 0);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.oilTexture2, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.oilVelocityFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.oilVelocityTexture1, 0);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.oilVelocityTexture2, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        // Zero initialize oil props
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.oilPropsFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.oilPropsTexture1, 0);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.oilPropsTexture2, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.bindFramebuffer(gl.FRAMEBUFFER, prevFbo2);
    }
  }

  /**
   * MULTI-LAYER UPDATE (Phase 2)
   * Routes materials to appropriate layers and composites result
   */
  async update(dt) {
    const gl = this.gl;
    const sim = this.sim;
    if (!sim.ready || !sim.renderer.ready || sim.paused) return;

    // Determine which materials are active
    const controller = window.controller || sim.controller;
    const currentMaterial = controller?.materials[controller?.currentMaterialIndex]?.name || '';
    const useSPHForMaterial = ['Mineral Oil', 'Syrup', 'Glycerine', 'Ink'].includes(currentMaterial);
    const useGridForMaterial = ['Alcohol'].includes(currentMaterial);
    const hasSPHParticles = this.useSPH && this.sph.particleCount > 0;
    
    // LAYER 1: Update SPH layer (if particles exist OR currently painting SPH)
    if (this.useSPH && (hasSPHParticles || useSPHForMaterial)) {
      await this.updateSPHLayer(dt, useSPHForMaterial);
    }
    
    // LAYER 2: Update Grid layer (ONLY if it has actual content)
    // Don't update just because user selected Alcohol - wait until they paint
    if (this.hasGridContent) {
      this.updateGridLayer(dt);
    }
    
    // LAYER 3: Composite both layers into final texture (skip if both empty)
    const hasAnyOilContent = hasSPHParticles || this.hasGridContent;
    if (hasAnyOilContent) {
      if (this.sim.webgpu && this.enableWebgpuDrawToCanvas) {
        // For WebGPU, optionally draw the SPH texture to canvas for validation
        this.drawWebGPUSPHToCanvas();
      } else {
        // Default: use the existing WebGL composite path (SPH + Grid)
        this.compositeOilLayers();
      }
    }
    
    if (gl) {
        // LEGACY: Copy to oilTexture1 ONLY if there are SPH particles
        // Alcohol (Grid layer only) should NOT be copied to oilTexture1
        // This prevents Alcohol from darkening ink via the oil-composite shader
        if (hasSPHParticles && this.compositedTexture) {
          const prevFbo = gl.getParameter(gl.FRAMEBUFFER_BINDING);
          gl.bindFramebuffer(gl.FRAMEBUFFER, this.oilFBO);
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.oilTexture1, 0);
          
          gl.useProgram(sim.renderer.copyProgram || this.createCopyProgram());
          gl.bindBuffer(gl.ARRAY_BUFFER, sim.renderer.quadBuffer);
          const posLoc = gl.getAttribLocation(sim.renderer.copyProgram, 'a_position');
          gl.enableVertexAttribArray(posLoc);
          gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
          
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, this.compositedTexture);
          gl.uniform1i(gl.getUniformLocation(sim.renderer.copyProgram, 'u_texture'), 0);
          
          gl.disable(gl.BLEND);
          gl.drawArrays(gl.TRIANGLES, 0, 6);
          gl.bindFramebuffer(gl.FRAMEBUFFER, prevFbo);
        } else {
          // No SPH particles - clear legacy oil texture so it doesn't block water/ink
          // This includes Alcohol-only state (Grid layer)
          const prevFbo = gl.getParameter(gl.FRAMEBUFFER_BINDING);
          gl.bindFramebuffer(gl.FRAMEBUFFER, this.oilFBO);
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.oilTexture1, 0);
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.bindFramebuffer(gl.FRAMEBUFFER, prevFbo);
          
          // Debug: Confirm Alcohol isn't blocking ink
          if (this.hasGridContent && Math.random() < 0.01) {
            console.log('🍸 Alcohol active: oilTexture1 cleared to prevent ink blocking');
          }
        }
    }
  }
  
  /**
   * Create simple copy shader for legacy compatibility (if needed)
   */
  createCopyProgram() {
    const gl = this.gl;
    if (gl) {
        const vertSrc = `#version 300 es
      in vec2 a_position;
      out vec2 v_texCoord;
      void main() {
        v_texCoord = a_position * 0.5 + 0.5;
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;
        const fragSrc = `#version 300 es
      precision highp float;
      in vec2 v_texCoord;
      out vec4 fragColor;
      uniform sampler2D u_texture;
      void main() {
        fragColor = texture(u_texture, v_texCoord);
      }
    `;
        
        if (!this.sim.renderer.copyProgram) {
          this.sim.renderer.copyProgram = this.sim.renderer.createProgram(vertSrc, fragSrc);
        }
        return this.sim.renderer.copyProgram;
    }
    return null;
  }
  
  // === UTILITY METHODS ===
  
  /**
   * Clear all oil content (called when user clears canvas)
   */
  clear() {
    const gl = this.gl;
    
    if (gl) {
        // Reset content flags
        this.hasGridContent = false;
        
        // Clear SPH particles
        if (this.sph) {
          this.sph.particleCount = 0;
        }
        
        // Clear all textures
        const prevFbo = gl.getParameter(gl.FRAMEBUFFER_BINDING);
        gl.clearColor(0, 0, 0, 0);
        
        // Clear SPH layer
        if (this.sphFBO && this.sphTexture1) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, this.sphFBO);
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.sphTexture1, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.sphTexture2, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
        }
        
        // Clear Grid layer
        if (this.gridFBO && this.gridTexture1) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, this.gridFBO);
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.gridTexture1, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.gridTexture2, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
        }
        
        // Clear Grid velocity
        if (this.gridVelocityFBO && this.gridVelocityTexture1) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, this.gridVelocityFBO);
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.gridVelocityTexture1, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.gridVelocityTexture2, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
        }
        
        // Clear legacy oil texture
        if (this.oilFBO && this.oilTexture1) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, this.oilFBO);
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.oilTexture1, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.oilTexture2, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
        }
        
        gl.bindFramebuffer(gl.FRAMEBUFFER, prevFbo);
        console.log('🧹 Oil layers cleared');
    }
  }
  
  // === LEGACY METHODS (kept for splat operations) ===
  
  clearRegion(x, y, radius) {
    const gl = this.gl;
    const sim = this.sim;
    
    if (gl) {
        gl.useProgram(sim.clearRegionProgram);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.oilFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.oilTexture2, 0);
        
        gl.bindBuffer(gl.ARRAY_BUFFER, sim.renderer.quadBuffer);
        const posLoc = gl.getAttribLocation(sim.clearRegionProgram, 'a_position');
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
        
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.oilTexture1);
        gl.uniform1i(gl.getUniformLocation(sim.clearRegionProgram, 'u_texture'), 0);
        
        gl.uniform2f(gl.getUniformLocation(sim.clearRegionProgram, 'u_resolution'), gl.canvas.width, gl.canvas.height);
        gl.uniform2f(gl.getUniformLocation(sim.clearRegionProgram, 'u_center'), x, y);
        gl.uniform1f(gl.getUniformLocation(sim.clearRegionProgram, 'u_radius'), radius);
        
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        this.swapOilTextures();
    }
  }

  splatColor(x, y, color, radius) {
    const gl = this.gl;
    const sim = this.sim;
    
    console.log(`🔍 splatColor called: x=${x.toFixed(2)}, y=${y.toFixed(2)}, radius=${radius}`);
    
    // === MULTI-LAYER SPLAT ROUTING ===
    const controller = window.controller || this.sim.controller;
    const currentMaterial = controller?.materials[controller?.currentMaterialIndex]?.name || '';
    const useSPHForMaterial = ['Mineral Oil', 'Syrup', 'Glycerine', 'Ink'].includes(currentMaterial);
    const useGridForMaterial = ['Alcohol'].includes(currentMaterial);
    
    console.log(`🔍 Material: ${currentMaterial}, useSPH=${this.useSPH}, useSPHForMaterial=${useSPHForMaterial}`);
    
    // Route to SPH layer
    if (this.useSPH && useSPHForMaterial && this.sph) {
      // Convert normalized coords to world coords (centered at origin)
      const worldX = (x - 0.5) * 2 * this.sph.containerRadius;
      const worldY = (0.5 - y) * 2 * this.sph.containerRadius;
      
      // Allow continuous accumulation - no throttling
      // Particles will accumulate as user paints, creating larger blobs
      const nowMs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      // Only update timestamp, don't block spawning

      // Base spawn counts per material (kept modest for perf and variety)
      let baseCount = 10;
      let baseRadius = 14.0;
      switch (currentMaterial) {
        case 'Mineral Oil':
          baseCount = 10;        // medium-weight, more numerous small droplets
          baseRadius = 14.0;     // compact cluster
          break;
        case 'Syrup':
          baseCount = 14;        // hero blobs but still modest particle count
          baseRadius = 15.0;     // moderate cluster size
          break;
        case 'Glycerine':
          baseCount = 10;        // light per splat
          baseRadius = 16.0;     // medium cluster
          break;
        default:
          break;
      }

      // particles in a looser/smaller cluster. Keep counts modest so we get
      // a range of blob sizes and many small droplets that are easy to absorb.
      let particleCount = baseCount;
      let spawnRadius = baseRadius;

      if (this.sph && this.sph.particleCount > 0) {
        // Use a local neighborhood radius tied to the SPH smoothing radius
        const localRadius = this.sph.smoothingRadius * 1.0;
        const nearby = this.sph.countParticlesNear(worldX, worldY, localRadius);

        if (nearby >= 12) {
          // Deep inside an existing blob: add some mass but do NOT explode
          // particle count. Slightly increase radius so new mass spreads.
          particleCount = Math.round(baseCount * 1.3);
          spawnRadius = baseRadius * 1.1;
        } else if (nearby >= 3) {
          // Near a blob edge: light feeding
          particleCount = Math.round(baseCount * 1.0);
        } else if (nearby <= 1) {
          // New/isolated splat: small droplet, easy to absorb later
          particleCount = Math.max(4, Math.round(baseCount * 0.5));
          spawnRadius = baseRadius * 0.85;
        }
      }

      // Add a small random variation so we get a spread of sizes even under
      // similar input; keep within a narrow band so behavior is stable.
      const sizeJitter = 0.85 + Math.random() * 0.4; // [0.85, 1.25]
      particleCount = Math.max(3, Math.round(particleCount * sizeJitter));
      
      // DISABLED: Cluster spawning creates multiple separate blobs
      // Always spawn as single dense blob for immediate congealing
      const spawned = this.sph.spawnParticles(worldX, worldY, particleCount, color, spawnRadius);
      if (this.webgpuSPH) {
        this.webgpuSPH.uploadInitialData(this.sph);
      }
      // Start a brief congeal boost window
      this.postSplatBoostFrames = this.postSplatBoostTotal; // start ramp
      this.lastSplatAtMs = nowMs;
      console.log(`🎨 Spawned ${spawned} ${currentMaterial} particles as single blob (radius=${spawnRadius})`);
      return;
    }
    
    // Route to Grid layer
    if (useGridForMaterial) {
      this.splatToGridLayer(x, y, color, radius);
      return;
    }
    
    // Fallback: legacy oil texture (shouldn't happen)
    console.warn('⚠️ splatColor called with unknown material:', currentMaterial);
  }
  
  /**
   * Splat color to grid layer (Alcohol)
   */
  splatToGridLayer(x, y, color, radius) {
    const gl = this.gl;
    const sim = this.sim;
    
    if (gl) {
        // Mark that grid layer now has content
        this.hasGridContent = true;
        
        gl.useProgram(sim.splatProgram);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.gridFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.gridTexture2, 0);
        
        gl.bindBuffer(gl.ARRAY_BUFFER, sim.renderer.quadBuffer);
        const posLoc = gl.getAttribLocation(sim.splatProgram, 'a_position');
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
        
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.gridTexture1);
        gl.uniform1i(gl.getUniformLocation(sim.splatProgram, 'u_texture'), 0);
        
        gl.uniform3f(gl.getUniformLocation(sim.splatProgram, 'u_color'), color.r, color.g, color.b);
        gl.uniform2f(gl.getUniformLocation(sim.splatProgram, 'u_point'), x, y);
        gl.uniform1f(gl.getUniformLocation(sim.splatProgram, 'u_radius'), radius);
        gl.uniform1i(gl.getUniformLocation(sim.splatProgram, 'u_isOil'), 1);
        gl.uniform2f(gl.getUniformLocation(sim.splatProgram, 'u_resolution'), gl.canvas.width, gl.canvas.height);
        
        // Set oil strength - Alcohol should be nearly invisible (surfactant effect, not visual)
        const alcoholStrength = 0.15; // Very subtle - mainly affects physics, not visuals
        gl.uniform1f(gl.getUniformLocation(sim.splatProgram, 'u_oilStrength'), alcoholStrength);
        
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        this.swapGridTextures();
    }
  }
  
  // === UTILITY METHODS ===

  swapOilTextures() {
    [this.oilTexture1, this.oilTexture2] = [this.oilTexture2, this.oilTexture1];
  }
  
  // === MULTI-LAYER SWAP HELPERS ===
  swapSPHTextures() {
    [this.sphTexture1, this.sphTexture2] = [this.sphTexture2, this.sphTexture1];
  }
  
  swapGridTextures() {
    [this.gridTexture1, this.gridTexture2] = [this.gridTexture2, this.gridTexture1];
  }
  
  swapGridVelocityTextures() {
    [this.gridVelocityTexture1, this.gridVelocityTexture2] = [this.gridVelocityTexture2, this.gridVelocityTexture1];
  }

  swapDensityHalfTextures() {
    [this.densityHalfTex1, this.densityHalfTex2] = [this.densityHalfTex2, this.densityHalfTex1];
  }
  
  /**
   * Composite SPH and Grid layers into final oil texture
   * Uses pre-multiplied alpha compositing (SPH over Grid)
   */
  compositeOilLayers() {
    const gl = this.gl;
    const sim = this.sim;
    
    if (gl) {
        if (!sim.oilLayerCompositeProgram) {
          console.warn('⚠️ Oil layer composite shader not loaded yet');
          return;
        }
        
        gl.useProgram(sim.oilLayerCompositeProgram);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.compositeFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.compositedTexture, 0);
        
        // Disable blending for fullscreen replacement
        gl.disable(gl.BLEND);
        
        gl.bindBuffer(gl.ARRAY_BUFFER, sim.renderer.quadBuffer);
        const posLoc = gl.getAttribLocation(sim.oilLayerCompositeProgram, 'a_position');
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
        
        // Bind SPH layer
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.sphTexture1);
        gl.uniform1i(gl.getUniformLocation(sim.oilLayerCompositeProgram, 'u_sphTexture'), 0);
        
        // Bind Grid layer
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.gridTexture1);
        gl.uniform1i(gl.getUniformLocation(sim.oilLayerCompositeProgram, 'u_gridTexture'), 1);
        
        // Resolution uniform
        gl.uniform2f(gl.getUniformLocation(sim.oilLayerCompositeProgram, 'u_resolution'), 
                     gl.canvas.width, gl.canvas.height);
        
        // Composite
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        
        // Log occasionally for debugging
        if (Math.random() < 0.01) {
          console.log(`🎨 Composite: SPH particles=${this.sph.particleCount}`);
        }
    }
  }
  
  /**
   * Get the final composited oil texture for rendering
   * This is the public API for other systems to access the oil layer
   */
  getOilTexture() {
    // Return composited texture if available, otherwise legacy texture
    return this.compositedTexture || this.oilTexture1;
  }
  
  /**
   * Check if there's visible oil content that should go through oil-composite shader
   * Returns true only if there are SPH particles (Mineral Oil, Syrup, Glycerine)
   * Alcohol in Grid layer should NOT trigger oil compositing
   */
  hasVisibleOilContent() {
    const hasParticles = this.useSPH && this.sph.particleCount > 0;
    // Debug: Log when called during critical moments
    if (this.hasGridContent && !hasParticles && Math.random() < 0.02) {
      console.log('🔍 hasVisibleOilContent() = false (Alcohol-only, no SPH particles)');
    }
    return hasParticles;
  }
  
  swapOilVelocityTextures() {
    [this.oilVelocityTexture1, this.oilVelocityTexture2] = [this.oilVelocityTexture2, this.oilVelocityTexture1];
  }

  swapOilPropsTextures() {
    [this.oilPropsTexture1, this.oilPropsTexture2] = [this.oilPropsTexture2, this.oilPropsTexture1];
  }

  destroy() {
    const gl = this.gl;
    // Delete all textures and framebuffers
    if (this.sphTexture1) gl.deleteTexture(this.sphTexture1);
    if (this.sphTexture2) gl.deleteTexture(this.sphTexture2);
    if (this.sphFBO) gl.deleteFramebuffer(this.sphFBO);
    
    if (this.gridTexture1) gl.deleteTexture(this.gridTexture1);
    if (this.gridTexture2) gl.deleteTexture(this.gridTexture2);
    if (this.gridFBO) gl.deleteFramebuffer(this.gridFBO);
    if (this.gridVelocityTexture1) gl.deleteTexture(this.gridVelocityTexture1);
    if (this.gridVelocityTexture2) gl.deleteTexture(this.gridVelocityTexture2);
    if (this.gridVelocityFBO) gl.deleteFramebuffer(this.gridVelocityFBO);
    
    if (this.compositedTexture) gl.deleteTexture(this.compositedTexture);
    if (this.compositeFBO) gl.deleteFramebuffer(this.compositeFBO);
    
    // Legacy textures
    if (this.oilTexture1) gl.deleteTexture(this.oilTexture1);
    if (this.oilTexture2) gl.deleteTexture(this.oilTexture2);
    if (this.oilFBO) gl.deleteFramebuffer(this.oilFBO);
    if (this.oilVelocityTexture1) gl.deleteTexture(this.oilVelocityTexture1);
    if (this.oilVelocityTexture2) gl.deleteTexture(this.oilVelocityTexture2);
    if (this.oilVelocityFBO) gl.deleteFramebuffer(this.oilVelocityFBO);
    if (this.curvatureTexture) gl.deleteTexture(this.curvatureTexture);
    if (this.curvatureFBO) gl.deleteFramebuffer(this.curvatureFBO);
    if (this.oilPropsTexture1) gl.deleteTexture(this.oilPropsTexture1);
    if (this.oilPropsTexture2) gl.deleteTexture(this.oilPropsTexture2);
    if (this.oilPropsFBO) gl.deleteFramebuffer(this.oilPropsFBO);
  }

  // === PROGRAM CREATORS ===
  createGaussBlurProgram(horizontal) {
    const gl = this.gl;
    const vertSrc = `#version 300 es\n
      in vec2 a_position;\n
      out vec2 v_uv;\n
      void main(){\n
        v_uv = a_position * 0.5 + 0.5;\n
        gl_Position = vec4(a_position, 0.0, 1.0);\n
      }`;
    const dir = horizontal ? 'vec2(u_texelSize.x, 0.0)' : 'vec2(0.0, u_texelSize.y)';
    const fragSrc = `#version 300 es\n
      precision highp float;\n
      in vec2 v_uv;\n
      out vec4 fragColor;\n
      uniform sampler2D u_tex;\n
      uniform vec2 u_texelSize;\n
      void main(){\n
        float w0 = 0.227027;\n
        float w1 = 0.1945946;\n
        float w2 = 0.1216216;\n
        float w3 = 0.054054;\n
        float w4 = 0.016216;\n
        float a = texture(u_tex, v_uv).r * w0;\n
        vec2 d = ${dir};\n
        a += texture(u_tex, v_uv + d*1.0).r * w1;\n
        a += texture(u_tex, v_uv - d*1.0).r * w1;\n
        a += texture(u_tex, v_uv + d*2.0).r * w2;\n
        a += texture(u_tex, v_uv - d*2.0).r * w2;\n
        a += texture(u_tex, v_uv + d*3.0).r * w3;\n
        a += texture(u_tex, v_uv - d*3.0).r * w3;\n
        a += texture(u_tex, v_uv + d*4.0).r * w4;\n
        a += texture(u_tex, v_uv - d*4.0).r * w4;\n
        fragColor = vec4(a, 0.0, 0.0, 1.0);\n
      }`;
    return this.sim.renderer.createProgram(vertSrc, fragSrc);
  }

  createComposeAlphaProgram() {
    const vertSrc = `#version 300 es\n
      in vec2 a_position;\n
      out vec2 v_uv;\n
      void main(){\n
        v_uv = a_position * 0.5 + 0.5;\n
        gl_Position = vec4(a_position, 0.0, 1.0);\n
      }`;
    const fragSrc = `#version 300 es\n
      precision highp float;\n
      in vec2 v_uv;\n
      out vec4 fragColor;\n
      uniform sampler2D u_colorTex;\n
      uniform sampler2D u_densityTex;\n
      uniform int u_mode;\n
      void main(){\n
        if (u_mode == 0) {\n
          float a = texture(u_colorTex, v_uv).a;\n
          fragColor = vec4(a, 0.0, 0.0, 1.0);\n
        } else {\n
          vec4 c = texture(u_colorTex, v_uv);\n
          float a = texture(u_densityTex, v_uv).r;\n
          fragColor = vec4(c.rgb, a);\n
        }\n
      }`;
    return this.sim.renderer.createProgram(vertSrc, fragSrc);
  }

  async initWebGPUDrawToCanvasPipeline() {
    if (!this.sim.webgpu) return;
    const device = this.sim.webgpu.device;

    const fullscreenVertWGSL = await loadShader('src/shaders/webgpu/fullscreen.vert.wgsl');
    const textureDisplayFragWGSL = await loadShader('src/shaders/webgpu/texture-display.frag.wgsl');

    this.webgpuDrawToCanvasPipeline = device.createRenderPipeline({
      label: 'WebGPU Draw to Canvas Pipeline',
      layout: 'auto',
      vertex: {
        module: device.createShaderModule({
          code: fullscreenVertWGSL,
          label: 'Fullscreen Vertex Shader',
        }),
        entryPoint: 'main',
      },
      fragment: {
        module: device.createShaderModule({
          code: textureDisplayFragWGSL,
          label: 'Texture Display Fragment Shader',
        }),
        entryPoint: 'main',
        targets: [{
          format: navigator.gpu.getPreferredCanvasFormat(),
        }],
      },
      primitive: {
        topology: 'triangle-list',
      },
    });

    this.webgpuDisplaySampler = device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
    });

    // Bind group will be created dynamically in drawWebGPUSPHToCanvas
  }

  drawWebGPUSPHToCanvas() {
    if (!this.sim.webgpu || !this.webgpuDrawToCanvasPipeline || !this.webgpuSphTextureView) return;

    const device = this.sim.webgpu.device;
    const context = this.sim.renderer.webgpuCanvasContext; // Assuming renderer has WebGPU canvas context

    const commandEncoder = device.createCommandEncoder();
    const textureView = context.getCurrentTexture().createView();

    const renderPassEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: textureView,
        loadOp: 'clear',
        clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
        storeOp: 'store',
      }],
    });

    const bindGroup = device.createBindGroup({
      layout: this.webgpuDrawToCanvasPipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: this.webgpuDisplaySampler,
        },
        {
          binding: 1,
          resource: this.webgpuSphTextureView,
        },
      ],
    });

    renderPassEncoder.setPipeline(this.webgpuDrawToCanvasPipeline);
    renderPassEncoder.setBindGroup(0, bindGroup);
    renderPassEncoder.draw(6); // 6 vertices for a fullscreen quad (triangle list)
    renderPassEncoder.end();

    device.queue.submit([commandEncoder.finish()]);
  }
}
