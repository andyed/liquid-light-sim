import FluidLayer from './FluidLayer.js';
import OilParticle from '../OilParticle.js';
import SPHOilSystem from '../sph/SPHOilSystem.js';

export default class OilLayer extends FluidLayer {
  constructor(simulation) {
    super(simulation);
    
    // SPH PARTICLE SYSTEM (PHASE 1: INCREMENTAL REBUILD)
    this.useSPH = true; // RE-ENABLED: Starting from scratch, testing each piece
    this.sph = new SPHOilSystem(5000, 0.48); // REDUCED: 5k max for Phase 1 testing
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
    
    // Track if layers have content (for optimization and proper rendering)
    this.hasGridContent = false; // True if Alcohol has been painted
    
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
    const w = gl.canvas.width;
    const h = gl.canvas.height;

    // Initialize SPH system
    console.log('🚀 Initializing SPH Oil System...');
    this.sph.initGPU(gl, this.sim.sphParticleSplatProgram);
    console.log(`✅ SPH initialized: max ${this.sph.maxParticles} particles`);

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

  /**
   * Update SPH particle layer (Mineral Oil, Syrup, Glycerine)
   * Handles physics simulation and rendering to sphTexture
   */
  updateSPHLayer(dt, useSPHForMaterial) {
    const gl = this.gl;
    const sim = this.sim;
    
    // STEP 1: Sample grid velocity from water layer (for rotation + water coupling)
    let gridVelocities = null;
    if (this.sph.particleCount > 0) {
      gridVelocities = this.sph.sampleVelocityGrid(
        sim.velocityTexture1, 
        gl.canvas.width, 
        gl.canvas.height
      );
    }
    
    // STEP 2: Update SPH particle physics (only if painting SPH material)
    // If user switched to Alcohol, particles freeze but stay visible
    if (useSPHForMaterial && this.sph.particleCount > 0) {
      // Frame skip if too many particles (CPU bottleneck mitigation)
      if (!this.sphFrameSkip) this.sphFrameSkip = 0;
      this.sphFrameSkip++;
      
      // Skip physics every other frame if > 3000 particles
      const shouldSkipPhysics = this.sph.particleCount > 3000 && this.sphFrameSkip % 2 === 0;
      
      if (!shouldSkipPhysics) {
        this.sph.update(dt, sim.rotationAmount, gridVelocities);
      }
    }
    
    // STEP 3: Render particles to SPH texture
    if (this.sph.particleCount > 0) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.sphFBO);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.sphTexture2, 0);
      gl.disable(gl.BLEND); // MUST disable blend for proper clear
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      
      // Rasterize SPH particles to texture (blend will be re-enabled inside)
      this.sph.renderParticles(this.sphFBO, gl.canvas.width, gl.canvas.height);
      this.swapSPHTextures();
      
      // STEP 4: Apply MetaBall rendering for smooth blending (optional)
      if (sim.metaballEnabled && sim.oilMetaballProgram) {
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
    } else {
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
    // Higher dissipation for Alcohol so it fades and doesn't become opaque
    gl.uniform1f(gl.getUniformLocation(sim.advectionProgram, 'u_dissipation'), 0.985); // Was 0.99

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

  resize() {
    const gl = this.gl;
    const w = gl.canvas.width;
    const h = gl.canvas.height;

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

  /**
   * MULTI-LAYER UPDATE (Phase 2)
   * Routes materials to appropriate layers and composites result
   */
  update(dt) {
    const gl = this.gl;
    const sim = this.sim;
    if (!sim.ready || !sim.renderer.ready || sim.paused) return;

    // Determine which materials are active
    const controller = window.controller || sim.controller;
    const currentMaterial = controller?.materials[controller?.currentMaterialIndex]?.name || '';
    const useSPHForMaterial = ['Mineral Oil', 'Syrup', 'Glycerine'].includes(currentMaterial);
    const useGridForMaterial = ['Alcohol'].includes(currentMaterial);
    const hasSPHParticles = this.useSPH && this.sph.particleCount > 0;
    
    // LAYER 1: Update SPH layer (if particles exist OR currently painting SPH)
    if (this.useSPH && (hasSPHParticles || useSPHForMaterial)) {
      this.updateSPHLayer(dt, useSPHForMaterial);
    }
    
    // LAYER 2: Update Grid layer (ONLY if it has actual content)
    // Don't update just because user selected Alcohol - wait until they paint
    if (this.hasGridContent) {
      this.updateGridLayer(dt);
    }
    
    // LAYER 3: Composite both layers into final texture (skip if both empty)
    const hasAnyOilContent = hasSPHParticles || this.hasGridContent;
    if (hasAnyOilContent) {
      this.compositeOilLayers();
      
      // LEGACY: Copy composited result to oilTexture1 for backwards compatibility
      // This allows existing rendering code to work without changes
      if (this.compositedTexture) {
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
      }
    } else {
      // No oil content - clear legacy oil texture so it doesn't block water/ink
      const prevFbo = gl.getParameter(gl.FRAMEBUFFER_BINDING);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.oilFBO);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.oilTexture1, 0);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindFramebuffer(gl.FRAMEBUFFER, prevFbo);
    }
  }
  
  /**
   * Create simple copy shader for legacy compatibility (if needed)
   */
  createCopyProgram() {
    const gl = this.gl;
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
  
  // === UTILITY METHODS ===
  
  /**
   * Clear all oil content (called when user clears canvas)
   */
  clear() {
    const gl = this.gl;
    
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
  
  // === LEGACY METHODS (kept for splat operations) ===
  
  clearRegion(x, y, radius) {
    const gl = this.gl;
    const sim = this.sim;
    
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

  splatColor(x, y, color, radius) {
    const gl = this.gl;
    const sim = this.sim;
    
    // === MULTI-LAYER SPLAT ROUTING ===
    const controller = window.controller || this.sim.controller;
    const currentMaterial = controller?.materials[controller?.currentMaterialIndex]?.name || '';
    const useSPHForMaterial = ['Mineral Oil', 'Syrup', 'Glycerine'].includes(currentMaterial);
    const useGridForMaterial = ['Alcohol'].includes(currentMaterial);
    
    // Route to SPH layer
    if (this.useSPH && useSPHForMaterial) {
      // Convert normalized coords to world coords (centered at origin)
      const worldX = (x - 0.5) * 2 * this.sph.containerRadius;
      const worldY = (0.5 - y) * 2 * this.sph.containerRadius;
      
      this.sph.spawnParticles(worldX, worldY, 50, color, 20.0);
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
    
    // Set oil strength - lower value means more transparent (Alcohol should be subtle)
    const alcoholStrength = 0.25; // Moderate thickness - visible but allows ink to show through
    gl.uniform1f(gl.getUniformLocation(sim.splatProgram, 'u_oilStrength'), alcoholStrength);
    
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    this.swapGridTextures();
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
  
  /**
   * Composite SPH and Grid layers into final oil texture
   * Uses pre-multiplied alpha compositing (SPH over Grid)
   */
  compositeOilLayers() {
    const gl = this.gl;
    const sim = this.sim;
    
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
  
  /**
   * Get the final composited oil texture for rendering
   * This is the public API for other systems to access the oil layer
   */
  getOilTexture() {
    // Return composited texture if available, otherwise legacy texture
    return this.compositedTexture || this.oilTexture1;
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
}
