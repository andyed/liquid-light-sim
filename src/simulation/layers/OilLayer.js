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
    
    // GRID TEXTURES (Legacy - kept for hybrid testing)
    this.oilTexture1 = null;
    this.oilTexture2 = null;
    this.oilFBO = null;
    // Separate oil velocity field
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

    // Oil thickness/tint field (RGBA16F) - still needed for MetaBall rendering
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
    // Initialize textures to zero to avoid garbage-driven spreading
    const prevFbo = gl.getParameter(gl.FRAMEBUFFER_BINDING);
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
    // Zero-init props textures
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.oilPropsFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.oilPropsTexture1, 0);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.oilPropsTexture2, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, prevFbo);
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

  update(dt) {
    const gl = this.gl;
    const sim = this.sim;
    if (!sim.ready || !sim.renderer.ready || sim.paused) return;

    // === SPH PATH (NEW!) ===
    // Only use SPH for thick, viscous materials (not ink or alcohol)
    const currentMaterial = sim.controller?.materials[sim.controller?.currentMaterialIndex]?.name || '';
    const useSPHForMaterial = ['Mineral Oil', 'Syrup', 'Glycerine'].includes(currentMaterial);
    
    if (this.useSPH && useSPHForMaterial) {
      // STEP 1: Sample grid velocity from water layer (rotation + water coupling)
      let gridVelocities = null;
      if (this.sph.particleCount > 0) {
        gridVelocities = this.sph.sampleVelocityGrid(
          sim.velocityTexture1, 
          gl.canvas.width, 
          gl.canvas.height
        );
      }
      
      // STEP 2: Update SPH particle physics with grid coupling
      // Frame skip if too many particles (CPU bottleneck mitigation)
      if (!this.sphFrameSkip) this.sphFrameSkip = 0;
      this.sphFrameSkip++;
      
      // Skip physics every other frame if > 3000 particles
      const shouldSkipPhysics = this.sph.particleCount > 3000 && this.sphFrameSkip % 2 === 0;
      
      if (!shouldSkipPhysics) {
        this.sph.update(dt, sim.rotationAmount, gridVelocities); // Pass grid velocities for rotation
      }
      
      // STEP 3: Write SPH velocities back to grid (for texture rotation/displacement)
      if (this.sph.particleCount > 0) {
        this.sph.writeVelocitiesToGrid(
          this.oilVelocityTexture1,
          gl.canvas.width,
          gl.canvas.height
        );
      }
      
      // STEP 2: Render particles to oil texture
      // Clear oil texture first
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.oilFBO);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.oilTexture2, 0);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      
      // Rasterize SPH particles to texture
      this.sph.renderParticles(this.oilFBO, gl.canvas.width, gl.canvas.height);
      this.swapOilTextures();
      
      // STEP 3: Apply MetaBall rendering for smooth blending (optional)
      if (sim.metaballEnabled && sim.oilMetaballProgram) {
        // Debug: log once to confirm MetaBall is running
        if (!this._metaballLogged) {
          console.log('🎱 MetaBall pass running on SPH particles');
          this._metaballLogged = true;
        }
        
        gl.useProgram(sim.oilMetaballProgram);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.oilFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.oilTexture2, 0);
        
        gl.bindBuffer(gl.ARRAY_BUFFER, sim.renderer.quadBuffer);
        const posMetaball = gl.getAttribLocation(sim.oilMetaballProgram, 'a_position');
        gl.enableVertexAttribArray(posMetaball);
        gl.vertexAttribPointer(posMetaball, 2, gl.FLOAT, false, 0, 0);
        
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.oilTexture1);
        gl.uniform1i(gl.getUniformLocation(sim.oilMetaballProgram, 'u_oil_texture'), 0);
        gl.uniform2f(gl.getUniformLocation(sim.oilMetaballProgram, 'u_resolution'), gl.canvas.width, gl.canvas.height);
        gl.uniform1f(gl.getUniformLocation(sim.oilMetaballProgram, 'u_blobThreshold'), sim.metaballBlobThreshold);
        gl.uniform1f(gl.getUniformLocation(sim.oilMetaballProgram, 'u_metaballRadius'), sim.metaballRadius);
        gl.uniform1f(gl.getUniformLocation(sim.oilMetaballProgram, 'u_bulginess'), sim.metaballBulginess);
        
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        this.swapOilTextures();
      }
      
      // Skip grid-based advection (particles handle their own motion)
      // IMPORTANT: Skip ALL grid-based cleanup for SPH (including overflow)
      // return; // Exit early - SPH manages its own lifecycle - DISABLED to allow overflow checks etc.
    }
    
    // === GRID-BASED PATH (Legacy) ===
    // Ensure oil passes render at full canvas size (avoid stale viewport from other stages)
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    
    // Skip coupling/advection if SPH is active (particles move themselves)
    if (!useSPHForMaterial) {
      // STEP 1: Apply coupling from water velocity
    gl.useProgram(sim.oilCouplingProgram);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.oilVelocityFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.oilVelocityTexture2, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, sim.renderer.quadBuffer);
    const posCoupling = gl.getAttribLocation(sim.oilCouplingProgram, 'a_position');
    gl.enableVertexAttribArray(posCoupling);
    gl.vertexAttribPointer(posCoupling, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.oilVelocityTexture1);
    gl.uniform1i(gl.getUniformLocation(sim.oilCouplingProgram, 'u_oilVelocity'), 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, sim.velocityTexture1);
    gl.uniform1i(gl.getUniformLocation(sim.oilCouplingProgram, 'u_waterVelocity'), 1);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.oilTexture1);
    gl.uniform1i(gl.getUniformLocation(sim.oilCouplingProgram, 'u_oil'), 2);

    // Per-pixel properties disabled for coupling to avoid double-scaling to near-zero
    // Bind for API completeness but force u_useProps = 0.0
    if (this.oilPropsTexture1) {
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, this.oilPropsTexture1);
      const locProps = gl.getUniformLocation(sim.oilCouplingProgram, 'u_oilProps');
      if (locProps) gl.uniform1i(locProps, 3);
    }
    {
      const usePropsLoc = gl.getUniformLocation(sim.oilCouplingProgram, 'u_useProps');
      if (usePropsLoc) gl.uniform1f(usePropsLoc, 0.0);
    }

    gl.uniform1f(gl.getUniformLocation(sim.oilCouplingProgram, 'u_couplingStrength'), sim.couplingStrength);
    gl.uniform1f(gl.getUniformLocation(sim.oilCouplingProgram, 'u_dt'), dt);
    const resLoc = gl.getUniformLocation(sim.oilCouplingProgram, 'u_resolution');
    if (resLoc) gl.uniform2f(resLoc, gl.canvas.width, gl.canvas.height);
    const ndLoc = gl.getUniformLocation(sim.oilCouplingProgram, 'u_normalDamp');
    if (ndLoc) gl.uniform1f(ndLoc, sim.oilNormalDamp);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    this.swapOilVelocityTextures();

    // STEP 2: Advect oil velocity by itself (self-advection for momentum)
    gl.useProgram(sim.advectionProgram);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.oilVelocityFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.oilVelocityTexture2, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, sim.renderer.quadBuffer);
    const posVel = gl.getAttribLocation(sim.advectionProgram, 'a_position');
    gl.enableVertexAttribArray(posVel);
    gl.vertexAttribPointer(posVel, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.oilVelocityTexture1);
    gl.uniform1i(gl.getUniformLocation(sim.advectionProgram, 'u_color_texture'), 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.oilVelocityTexture1); // advect by itself
    gl.uniform1i(gl.getUniformLocation(sim.advectionProgram, 'u_velocity_texture'), 1);

    gl.uniform1f(gl.getUniformLocation(sim.advectionProgram, 'u_dt'), dt);
    gl.uniform2f(gl.getUniformLocation(sim.advectionProgram, 'u_resolution'), gl.canvas.width, gl.canvas.height);
    gl.uniform1i(gl.getUniformLocation(sim.advectionProgram, 'u_isVelocity'), 1); // velocity advection (semi-Lagrangian only)
    
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    this.swapOilVelocityTextures();

    // STEP 2.5: Apply buoyancy force (density-based vertical motion)
    if (sim.buoyancyStrength && sim.buoyancyStrength !== 0.0 && sim.buoyancyProgram) {
        gl.useProgram(sim.buoyancyProgram);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.oilVelocityFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.oilVelocityTexture2, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, sim.renderer.quadBuffer);
        const posBuoy = gl.getAttribLocation(sim.buoyancyProgram, 'a_position');
        gl.enableVertexAttribArray(posBuoy);
        gl.vertexAttribPointer(posBuoy, 2, gl.FLOAT, false, 0, 0);

        // Oil velocity texture
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.oilVelocityTexture1);
        gl.uniform1i(gl.getUniformLocation(sim.buoyancyProgram, 'u_velocity_texture'), 0);

        // Oil thickness texture
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.oilTexture1);
        gl.uniform1i(gl.getUniformLocation(sim.buoyancyProgram, 'u_oil_texture'), 1);

        gl.uniform1f(gl.getUniformLocation(sim.buoyancyProgram, 'u_dt'), dt);
        gl.uniform1f(gl.getUniformLocation(sim.buoyancyProgram, 'u_buoyancy_strength'), sim.buoyancyStrength);
        gl.uniform2f(gl.getUniformLocation(sim.buoyancyProgram, 'u_gravity'), 0.0, 1.0); // Downward gravity

        gl.drawArrays(gl.TRIANGLES, 0, 6);
        this.swapOilVelocityTextures();
    }

    // STEP 3: Apply oil viscosity (high viscosity = slow, smooth flow)
    // Re-enabled with proper tuning - oil should be thick and sluggish
    if (sim.oilViscosity > 0.0 && sim.oilViscosityIterations > 0) {
      gl.useProgram(sim.viscosityProgram);
      
      // Use fewer iterations but stronger effect per iteration
      const effectiveIterations = Math.min(sim.oilViscosityIterations, 30);
      
      for (let i = 0; i < effectiveIterations; i++) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.oilVelocityFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.oilVelocityTexture2, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, sim.renderer.quadBuffer);
        const posVisc = gl.getAttribLocation(sim.viscosityProgram, 'a_position');
        gl.enableVertexAttribArray(posVisc);
        gl.vertexAttribPointer(posVisc, 2, gl.FLOAT, false, 0, 0);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.oilVelocityTexture1);
        gl.uniform1i(gl.getUniformLocation(sim.viscosityProgram, 'u_velocity_texture'), 0);
        
        // Scale viscosity effect - oil should resist flow
        gl.uniform1f(gl.getUniformLocation(sim.viscosityProgram, 'u_viscosity'), sim.oilViscosity * 0.15);
        gl.uniform1f(gl.getUniformLocation(sim.viscosityProgram, 'u_dt'), dt);
        gl.uniform2f(gl.getUniformLocation(sim.viscosityProgram, 'u_resolution'), gl.canvas.width, gl.canvas.height);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
        this.swapOilVelocityTextures();
      }
    }

    // STEP 3.5: Apply surface tension force to velocity (creates blobby cohesion)
    if (sim.surfaceTension > 0.0) {
        this.applySurfaceTensionForce(dt);
    }

    // STEP 4: Advect oil thickness by oil velocity
    gl.useProgram(sim.advectionProgram);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.oilFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.oilTexture2, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, sim.renderer.quadBuffer);
    const posOil = gl.getAttribLocation(sim.advectionProgram, 'a_position');
    gl.enableVertexAttribArray(posOil);
    gl.vertexAttribPointer(posOil, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.oilTexture1);
    gl.uniform1i(gl.getUniformLocation(sim.advectionProgram, 'u_color_texture'), 0);

    gl.activeTexture(gl.TEXTURE1);
    const velocityTexture = sim.debugAdvectOilWithWaterVelocity ? sim.velocityTexture1 : this.oilVelocityTexture1;
    gl.bindTexture(gl.TEXTURE_2D, velocityTexture);
    gl.uniform1i(gl.getUniformLocation(sim.advectionProgram, 'u_velocity_texture'), 1);

    gl.uniform1f(gl.getUniformLocation(sim.advectionProgram, 'u_dt'), dt);
    gl.uniform2f(gl.getUniformLocation(sim.advectionProgram, 'u_resolution'), gl.canvas.width, gl.canvas.height);
    gl.uniform1i(gl.getUniformLocation(sim.advectionProgram, 'u_isVelocity'), 0);
    const isOilAdvLoc = gl.getUniformLocation(sim.advectionProgram, 'u_isOil');
    if (isOilAdvLoc) gl.uniform1i(isOilAdvLoc, 1);
    const oilRimAbsLoc = gl.getUniformLocation(sim.advectionProgram, 'u_oilRimAbsorptionScale');
    if (oilRimAbsLoc) gl.uniform1f(oilRimAbsLoc, 0.0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    this.swapOilTextures();

    // STEP 4.2: Apply diffusion to oil thickness to allow it to thin out
    const oilDiffusion = sim.oilDiffusion === undefined ? 0.02 : sim.oilDiffusion;
    const oilDiffusionIterations = sim.oilDiffusionIterations === undefined ? 2 : sim.oilDiffusionIterations;

    if (oilDiffusion > 0.0 && sim.diffusionProgram) {
        gl.useProgram(sim.diffusionProgram);
        
        for (let i = 0; i < oilDiffusionIterations; i++) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.oilFBO);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.oilTexture2, 0);

            gl.bindBuffer(gl.ARRAY_BUFFER, sim.renderer.quadBuffer);
            const pos = gl.getAttribLocation(sim.diffusionProgram, 'a_position');
            gl.enableVertexAttribArray(pos);
            gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.oilTexture1);
            gl.uniform1i(gl.getUniformLocation(sim.diffusionProgram, 'u_texture'), 0);
            
            gl.uniform1f(gl.getUniformLocation(sim.diffusionProgram, 'u_diffusion_rate'), oilDiffusion);
            gl.uniform1f(gl.getUniformLocation(sim.diffusionProgram, 'u_dt'), dt);
            gl.uniform1i(gl.getUniformLocation(sim.diffusionProgram, 'u_preserveAlpha'), 0); // 0 = false, diffuse thickness

            gl.drawArrays(gl.TRIANGLES, 0, 6);
            this.swapOilTextures();
        }
    }

    // STEP 4.5: Apply thickness smoothing TWICE (removes pixel dust, promotes droplets)
    if (sim.oilSmoothingRate > 0.0 && sim.oilSmoothProgram) {
        gl.useProgram(sim.oilSmoothProgram);
        gl.bindBuffer(gl.ARRAY_BUFFER, sim.renderer.quadBuffer);
        const posSmooth = gl.getAttribLocation(sim.oilSmoothProgram, 'a_position');
        gl.enableVertexAttribArray(posSmooth);
        gl.vertexAttribPointer(posSmooth, 2, gl.FLOAT, false, 0, 0);
        
        gl.uniform2f(gl.getUniformLocation(sim.oilSmoothProgram, 'u_resolution'), gl.canvas.width, gl.canvas.height);
        gl.uniform1f(gl.getUniformLocation(sim.oilSmoothProgram, 'u_smoothingRate'), sim.oilSmoothingRate);
        gl.uniform1f(gl.getUniformLocation(sim.oilSmoothProgram, 'u_thicknessThreshold'), 0.06); // Dust removal
        
        // FIRST PASS
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.oilFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.oilTexture2, 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.oilTexture1);
        gl.uniform1i(gl.getUniformLocation(sim.oilSmoothProgram, 'u_oil_texture'), 0);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        this.swapOilTextures();
        
        // SECOND PASS (aggressive consolidation - snap particles together into blobs)
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.oilFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.oilTexture2, 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.oilTexture1);
        gl.uniform1i(gl.getUniformLocation(sim.oilSmoothProgram, 'u_oil_texture'), 0);
        
        // Much more aggressive: higher threshold and stronger pull
        gl.uniform1f(gl.getUniformLocation(sim.oilSmoothProgram, 'u_smoothingRate'), sim.oilSmoothingRate * 1.5);
        gl.uniform1f(gl.getUniformLocation(sim.oilSmoothProgram, 'u_thicknessThreshold'), 0.10); // Kill even more dust
        
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        this.swapOilTextures();
    }

    // STEP 5: Apply cohesion force (snap thin particles to thick blobs, prevent dust)
    if (sim.oilCohesionStrength > 0.0 && sim.oilCohesionProgram) {
        gl.useProgram(sim.oilCohesionProgram);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.oilFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.oilTexture2, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, sim.renderer.quadBuffer);
        const posCohesion = gl.getAttribLocation(sim.oilCohesionProgram, 'a_position');
        gl.enableVertexAttribArray(posCohesion);
        gl.vertexAttribPointer(posCohesion, 2, gl.FLOAT, false, 0, 0);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.oilTexture1);
        gl.uniform1i(gl.getUniformLocation(sim.oilCohesionProgram, 'u_oil_texture'), 0);

        gl.uniform2f(gl.getUniformLocation(sim.oilCohesionProgram, 'u_resolution'), gl.canvas.width, gl.canvas.height);
        gl.uniform1f(gl.getUniformLocation(sim.oilCohesionProgram, 'u_cohesionStrength'), sim.oilCohesionStrength);
        gl.uniform1f(gl.getUniformLocation(sim.oilCohesionProgram, 'u_absorptionThreshold'), sim.oilAbsorptionThreshold);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
        this.swapOilTextures();
    }
    } // End if (!this.useSPH) - grid-based physics complete

    // STEP 5.5: Apply MetaBall rendering (implicit surface blending for organic appearance)
    // Note: SPH already applied MetaBall above, this is for grid-based oil only
    if (!useSPHForMaterial && sim.metaballEnabled && sim.oilMetaballProgram) {
        gl.useProgram(sim.oilMetaballProgram);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.oilFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.oilTexture2, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, sim.renderer.quadBuffer);
        const posMetaball = gl.getAttribLocation(sim.oilMetaballProgram, 'a_position');
        gl.enableVertexAttribArray(posMetaball);
        gl.vertexAttribPointer(posMetaball, 2, gl.FLOAT, false, 0, 0);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.oilTexture1);
        gl.uniform1i(gl.getUniformLocation(sim.oilMetaballProgram, 'u_oil_texture'), 0);

        gl.uniform2f(gl.getUniformLocation(sim.oilMetaballProgram, 'u_resolution'), gl.canvas.width, gl.canvas.height);
        gl.uniform1f(gl.getUniformLocation(sim.oilMetaballProgram, 'u_blobThreshold'), sim.metaballBlobThreshold);
        gl.uniform1f(gl.getUniformLocation(sim.oilMetaballProgram, 'u_metaballRadius'), sim.metaballRadius);
        gl.uniform1f(gl.getUniformLocation(sim.oilMetaballProgram, 'u_bulginess'), sim.metaballBulginess);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
        this.swapOilTextures();
    }

    // STEP 5.75: Apply edge sharpening (creates border layer for blobs) - DISABLED
    if (sim.oilEdgeSharpness > 0.0 && sim.oilSharpenProgram) {
        gl.useProgram(sim.oilSharpenProgram);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.oilFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.oilTexture2, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, sim.renderer.quadBuffer);
        const posSharpen = gl.getAttribLocation(sim.oilSharpenProgram, 'a_position');
        gl.enableVertexAttribArray(posSharpen);
        gl.vertexAttribPointer(posSharpen, 2, gl.FLOAT, false, 0, 0);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.oilTexture1);
        gl.uniform1i(gl.getUniformLocation(sim.oilSharpenProgram, 'u_oil_texture'), 0);

        gl.uniform2f(gl.getUniformLocation(sim.oilSharpenProgram, 'u_resolution'), gl.canvas.width, gl.canvas.height);
        gl.uniform1f(gl.getUniformLocation(sim.oilSharpenProgram, 'u_edgeSharpness'), sim.oilEdgeSharpness);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
        this.swapOilTextures();
    }

    // STEP 5.5: Apply self-attraction
    if (sim.oilAttractionStrength > 0.0) {
        sim.applyOilAttraction(dt);
    }

    // STEP 6: Check for overflow and drain excess (prevents infinite accumulation)
    if (gl.canvas.width === sim.renderer.simWidth) {
      this.framesSinceOccupancy++;
      if (this.framesSinceOccupancy >= this.occupancyCheckInterval) {
        this.computeOccupancy();
        this.framesSinceOccupancy = 0;
      }
      
      // Aggressive overflow management if over threshold
      if (sim.oilOccupancyPercent > sim.oilOverflowLower) {
        const excess = sim.oilOccupancyPercent - sim.oilOverflowLower;
        const range = Math.max(0.01, sim.oilOverflowUpper - sim.oilOverflowLower);
        // Much gentler overflow for oil conservation (0.05 vs water's 0.20)
        const strength = Math.min(0.05, Math.max(0.0, excess / range));
        this.applyOverflow(strength);
        this.computeOccupancy(); // Re-measure after overflow
      }
      gl.viewport(prevViewport[0], prevViewport[1], prevViewport[2], prevViewport[3]);
    }
    
    // STEP 7: HYBRID PARTICLE SYSTEM - DISABLED
    // Problem: Particle→grid splatting creates conversion loop (exponential growth)
    // Solution needed: Separate texture for particles OR instanced rendering
    // this.updateParticleSystem(dt);
  }
  
  updateParticleSystem(dt) {
    const sim = this.sim;
    
    // Update existing particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i];
      
      // Sample water velocity at particle position (simplified - use center for now)
      const waterVel = { x: 0, y: 0 }; // TODO: Sample from water velocity texture
      
      // Update particle (advection, buoyancy, damping)
      const buoyancy = sim.buoyancyStrength || 0;
      particle.update(dt, waterVel, buoyancy, 0.98);
      
      // Constrain to circular boundary
      particle.constrainToCircle(0.5, 0.5, 0.47);
      
      // Remove old particles
      if (particle.age > 60.0 || particle.thickness < 0.01) {
        this.particles.splice(i, 1);
      }
    }
    
    // Merge nearby particles (blob coalescence!)
    this.mergeParticles();
    
    // TODO: Particle→grid splatting creates conversion loop
    // Grid oil → particles → splat to grid → convert to particles again → exponential growth
    // Need separate particle rendering layer OR mark converted regions
    // this.splatParticlesToGrid();
    
    // Periodically convert thick grid regions to particles
    this.framesSinceConversion++;
    if (this.framesSinceConversion >= this.particleConversionInterval) {
      this.convertGridToParticles();
      this.framesSinceConversion = 0;
    }
  }
  
  mergeParticles() {
    // Simple N^2 merge (optimize later if needed)
    for (let i = this.particles.length - 1; i >= 0; i--) {
      for (let j = i - 1; j >= 0; j--) {
        if (this.particles[i].shouldMerge(this.particles[j], this.particleMergeDistance)) {
          // Merge j into i
          this.particles[i].absorb(this.particles[j]);
          this.particles.splice(j, 1);
          i--; // Adjust index after removal
          break;
        }
      }
    }
  }
  
  splatParticlesToGrid() {
    const gl = this.gl;
    const sim = this.sim;
    
    // Render each particle as a soft circle onto the oil texture
    for (let particle of this.particles) {
      const radius = Math.max(0.02, particle.thickness * 0.1); // Radius based on mass
      this.splatColor(particle.x, particle.y, particle.color, radius);
    }
  }
  
  convertGridToParticles() {
    const gl = this.gl;
    const sim = this.sim;
    const w = gl.canvas.width;
    const h = gl.canvas.height;
    
    // Read oil texture (expensive, so we sample sparsely)
    const pixels = new Float32Array(w * h * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.oilFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.oilTexture1, 0);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, pixels);
    
    // Sample every N pixels for performance (lower resolution search)
    const sampleStep = 8; // Sample every 8 pixels
    let particlesSpawned = 0;
    
    for (let y = 0; y < h; y += sampleStep) {
      for (let x = 0; x < w; x += sampleStep) {
        const idx = (y * w + x) * 4;
        const r = pixels[idx];
        const g = pixels[idx + 1];
        const b = pixels[idx + 2];
        const thickness = pixels[idx + 3];
        
        // Found thick oil - convert to particle
        if (thickness > this.particleConversionThreshold && 
            this.particles.length < this.maxParticles) {
          
          // Normalized coordinates [0,1]
          const px = x / w;
          const py = y / h;
          
          // Create particle
          const particle = new OilParticle(
            px, py, 
            0, 0, // Zero velocity initially
            thickness * 0.5, // Radius proportional to thickness
            { r, g, b }
          );
          this.particles.push(particle);
          particlesSpawned++;
          
          // Clear this region from grid (prevent double-counting)
          this.clearGridRegion(px, py, sampleStep / w);
          
          // Limit spawns per frame to prevent lag
          if (particlesSpawned >= 10) break;
        }
      }
      if (particlesSpawned >= 10) break;
    }
    
    if (particlesSpawned > 0) {
      console.log(`🔄 Converted ${particlesSpawned} grid regions → particles (total: ${this.particles.length})`);
    }
  }
  
  clearGridRegion(centerX, centerY, radius) {
    const gl = this.gl;
    const sim = this.sim;
    
    if (!sim.clearRegionProgram) return;
    
    gl.useProgram(sim.clearRegionProgram);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.oilFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.oilTexture2, 0);
    
    gl.bindBuffer(gl.ARRAY_BUFFER, sim.renderer.quadBuffer);
    const pos = gl.getAttribLocation(sim.clearRegionProgram, 'a_position');
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
    
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.oilTexture1);
    gl.uniform1i(gl.getUniformLocation(sim.clearRegionProgram, 'u_oil_texture'), 0);
    
    gl.uniform2f(gl.getUniformLocation(sim.clearRegionProgram, 'u_center'), centerX, centerY);
    gl.uniform1f(gl.getUniformLocation(sim.clearRegionProgram, 'u_radius'), radius);
    
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    this.swapOilTextures();
  }

  splatColor(x, y, color, radius) {
    const gl = this.gl;
    const sim = this.sim;
    
    // === SPH PATH (PHASE 1: INCREMENTAL TESTING) ===
    // Only use SPH for thick, viscous materials (not ink or alcohol)
    const currentMaterial = this.sim.controller?.materials[this.sim.controller?.currentMaterialIndex]?.name || '';
    const useSPHForMaterial = ['Mineral Oil', 'Syrup', 'Glycerine'].includes(currentMaterial);
    
    if (this.useSPH && useSPHForMaterial) {
      // Convert normalized coords to world coords (centered at origin)
      // NOTE: Y is INVERTED! Screen Y=0 is top, but world Y=0 is center with +Y = up
      const worldX = (x - 0.5) * 2 * this.sph.containerRadius;
      const worldY = (0.5 - y) * 2 * this.sph.containerRadius; // FLIPPED: top of screen = +Y (up)
      
      // Moderate spawn rate - balanced between density and preventing oversaturation
      const particlesPerSplat = 50; // INCREASED: More particles = denser blobs (was 15)
      const temperature = 20.0; // Room temp for now
      
      const spawned = this.sph.spawnParticles(worldX, worldY, particlesPerSplat, color, temperature);
      
      // Log occasionally
      if (Math.random() < 0.2) {
        console.log(`✅ 1.2: Spawned ${spawned} at (${worldX.toFixed(2)}, ${worldY.toFixed(2)}), Total: ${this.sph.particleCount}`);
      }
      
      return; // Skip grid splatting
    }
    
    // === GRID-BASED SPLATTING (Legacy) ===
    gl.useProgram(sim.splatProgram);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.oilFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.oilTexture2, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, sim.renderer.quadBuffer);
    const pos = gl.getAttribLocation(sim.splatProgram, 'a_position');
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.oilTexture1);
    gl.uniform1i(gl.getUniformLocation(sim.splatProgram, 'u_texture'), 0);
    gl.uniform2f(gl.getUniformLocation(sim.splatProgram, 'u_point'), x, y);
    gl.uniform3f(gl.getUniformLocation(sim.splatProgram, 'u_color'), color.r, color.g, color.b);
    gl.uniform1f(gl.getUniformLocation(sim.splatProgram, 'u_radius'), radius);
    gl.uniform2f(gl.getUniformLocation(sim.splatProgram, 'u_resolution'), gl.canvas.width, gl.canvas.height);
    gl.uniform1i(gl.getUniformLocation(sim.splatProgram, 'u_isVelocity'), 0);
    
    // Oil-specific flags
    const isOilLoc = gl.getUniformLocation(sim.splatProgram, 'u_isOil');
    if (isOilLoc) gl.uniform1i(isOilLoc, 1);
    const oilStrengthLoc = gl.getUniformLocation(sim.splatProgram, 'u_oilStrength');
    if (oilStrengthLoc) gl.uniform1f(oilStrengthLoc, 1.0); // Increased from 1.0 for more visible oil

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    this.swapOilTextures();
    
    console.log('  ✓ Oil splat drawn, textures swapped');

    // Also splat per-pixel material properties based on current simulation params
    if (this.sim.splatOilPropsProgram && this.oilPropsFBO) {
      gl.useProgram(this.sim.splatOilPropsProgram);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.oilPropsFBO);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.oilPropsTexture2, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.sim.renderer.quadBuffer);
      const posP = gl.getAttribLocation(this.sim.splatOilPropsProgram, 'a_position');
      gl.enableVertexAttribArray(posP);
      gl.vertexAttribPointer(posP, 2, gl.FLOAT, false, 0, 0);

      // Current props from simulation
      const props = [
        this.sim.couplingStrength || 0.0,        // R
        this.sim.oilViscosity || 0.0,            // G
        this.sim.surfaceTension || 0.0,          // B
        this.sim.oilDragStrength || 0.0          // A
      ];

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.oilPropsTexture1);
      gl.uniform1i(gl.getUniformLocation(this.sim.splatOilPropsProgram, 'u_propsTex'), 0);
      gl.uniform2f(gl.getUniformLocation(this.sim.splatOilPropsProgram, 'u_point'), x, y);
      gl.uniform1f(gl.getUniformLocation(this.sim.splatOilPropsProgram, 'u_radius'), radius);
      gl.uniform2f(gl.getUniformLocation(this.sim.splatOilPropsProgram, 'u_resolution'), gl.canvas.width, gl.canvas.height);
      gl.uniform4f(gl.getUniformLocation(this.sim.splatOilPropsProgram, 'u_props'), props[0], props[1], props[2], props[3]);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
      this.swapOilPropsTextures();
    }
  }

  splatVelocity(x, y, vx, vy, radius) {
    const gl = this.gl;
    const sim = this.sim;

    gl.useProgram(sim.splatProgram);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.oilVelocityFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.oilVelocityTexture2, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.oilVelocityTexture1);
    gl.uniform1i(gl.getUniformLocation(sim.splatProgram, 'u_texture'), 0);
    gl.uniform2f(gl.getUniformLocation(sim.splatProgram, 'u_point'), x, y);
    gl.uniform3f(gl.getUniformLocation(sim.splatProgram, 'u_color'), vx, vy, 0.0);
    gl.uniform1f(gl.getUniformLocation(sim.splatProgram, 'u_radius'), radius);
    gl.uniform2f(gl.getUniformLocation(sim.splatProgram, 'u_resolution'), gl.canvas.width, gl.canvas.height);
    gl.uniform1i(gl.getUniformLocation(sim.splatProgram, 'u_isVelocity'), 1);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    this.swapOilVelocityTextures();
  }

  computeOccupancy() {
    const sim = this.sim;
    const gl = this.gl;
    // Render occupancy mask (R=oil thickness, G=inside) at low resolution
    gl.useProgram(sim.occupancyProgram);
    gl.bindFramebuffer(gl.FRAMEBUFFER, sim.occupancyFBO);
    gl.viewport(0, 0, sim.occupancyWidth, sim.occupancyHeight);

    gl.bindBuffer(gl.ARRAY_BUFFER, sim.renderer.quadBuffer);
    const positionAttrib = gl.getAttribLocation(sim.occupancyProgram, 'a_position');
    gl.enableVertexAttribArray(positionAttrib);
    gl.vertexAttribPointer(positionAttrib, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.oilTexture1);
    gl.uniform1i(gl.getUniformLocation(sim.occupancyProgram, 'u_color_texture'), 0);
    gl.uniform2f(gl.getUniformLocation(sim.occupancyProgram, 'u_resolution'), gl.canvas.width, gl.canvas.height);
    // Flag to use different threshold for oil (thickness-based)
    const isOilLoc = gl.getUniformLocation(sim.occupancyProgram, 'u_isOil');
    if (isOilLoc) gl.uniform1i(isOilLoc, 1);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // Read back occupancy buffer (UNSIGNED_BYTE RGBA)
    const w = sim.occupancyWidth, h = sim.occupancyHeight;
    const pixels = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    // Sum R (oil thickness), G (inside) components
    let sumOil = 0, sumInside = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      sumOil += pixels[i];
      sumInside += pixels[i + 1];
    }
    // Normalize (bytes 0..255)
    const oilNorm = sumOil / 255.0;
    const insideNorm = Math.max(1e-6, sumInside / 255.0);
    sim.oilOccupancyPercent = Math.max(0.0, Math.min(1.0, oilNorm / insideNorm));
    
    if (sim.logVerbose) {
      console.log(`🛢️ Oil Occupancy: ${(sim.oilOccupancyPercent * 100).toFixed(1)}% (threshold: ${sim.oilOverflowUpper * 100}%)`);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  applyOverflow(strength) {
    const sim = this.sim;
    const gl = this.gl;
    if (strength <= 0.0) return;
    // Fullscreen pass: read oilTexture1, write damped result to oilTexture2
    const prevViewport = gl.getParameter(gl.VIEWPORT);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.useProgram(sim.overflowProgram);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.oilFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.oilTexture2, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, sim.renderer.quadBuffer);
    const positionAttrib = gl.getAttribLocation(sim.overflowProgram, 'a_position');
    gl.enableVertexAttribArray(positionAttrib);
    gl.vertexAttribPointer(positionAttrib, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.oilTexture1);
    gl.uniform1i(gl.getUniformLocation(sim.overflowProgram, 'u_color_texture'), 0);
    gl.uniform2f(gl.getUniformLocation(sim.overflowProgram, 'u_resolution'), gl.canvas.width, gl.canvas.height);
    gl.uniform1f(gl.getUniformLocation(sim.overflowProgram, 'u_strength'), strength);
    gl.uniform1i(gl.getUniformLocation(sim.overflowProgram, 'u_isOil'), 1); // Preserve alpha thickness

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    this.swapOilTextures();

    if (sim.logVerbose) {
      console.log(`🛢️ Oil overflow valve: strength=${strength.toFixed(2)} → target ${(sim.oilOverflowLower*100)|0}-${(sim.oilOverflowUpper*100)|0}%`);
    }
    gl.viewport(prevViewport[0], prevViewport[1], prevViewport[2], prevViewport[3]);
  }

  applySurfaceTensionForce(dt) {
    const sim = this.sim;
    const gl = this.gl;
    // Skip if shader not loaded or surface tension disabled
    if (!sim.surfaceTensionForceProgram || sim.surfaceTension <= 0.0) {
      return;
    }

    gl.useProgram(sim.surfaceTensionForceProgram);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.oilVelocityFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.oilVelocityTexture2, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, sim.renderer.quadBuffer);
    const positionAttrib = gl.getAttribLocation(sim.surfaceTensionForceProgram, 'a_position');
    gl.enableVertexAttribArray(positionAttrib);
    gl.vertexAttribPointer(positionAttrib, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.oilVelocityTexture1);
    gl.uniform1i(gl.getUniformLocation(sim.surfaceTensionForceProgram, 'u_oilVelocity'), 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.oilTexture1);
    gl.uniform1i(gl.getUniformLocation(sim.surfaceTensionForceProgram, 'u_oilThickness'), 1);

    // Per-pixel properties (optional)
    if (this.oilPropsTexture1) {
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this.oilPropsTexture1);
      const locProps = gl.getUniformLocation(sim.surfaceTensionForceProgram, 'u_oilProps');
      if (locProps) gl.uniform1i(locProps, 2);
      const usePropsLoc = gl.getUniformLocation(sim.surfaceTensionForceProgram, 'u_useProps');
      if (usePropsLoc) gl.uniform1f(usePropsLoc, 1.0);
    } else {
      const usePropsLoc = gl.getUniformLocation(sim.surfaceTensionForceProgram, 'u_useProps');
      if (usePropsLoc) gl.uniform1f(usePropsLoc, 0.0);
    }

    gl.uniform1f(gl.getUniformLocation(sim.surfaceTensionForceProgram, 'u_surfaceTension'), sim.surfaceTension);
    gl.uniform1f(gl.getUniformLocation(sim.surfaceTensionForceProgram, 'u_dt'), dt);
    gl.uniform2f(gl.getUniformLocation(sim.surfaceTensionForceProgram, 'u_resolution'), gl.canvas.width, gl.canvas.height);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    this.swapOilVelocityTextures();
  }

  applySelfAttraction(dt) {
    const sim = this.sim;
    const gl = this.gl;
    if (!sim.oilAttractionProgram || sim.oilAttractionStrength <= 0.0) return;

    gl.useProgram(sim.oilAttractionProgram);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.oilFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.oilTexture2, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, sim.renderer.quadBuffer);
    const positionAttrib = gl.getAttribLocation(sim.oilAttractionProgram, 'a_position');
    gl.enableVertexAttribArray(positionAttrib);
    gl.vertexAttribPointer(positionAttrib, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.oilTexture1);
    gl.uniform1i(gl.getUniformLocation(sim.oilAttractionProgram, 'u_oil_texture'), 0);

    gl.uniform2f(gl.getUniformLocation(sim.oilAttractionProgram, 'u_resolution'), gl.canvas.width, gl.canvas.height);
    gl.uniform1f(gl.getUniformLocation(sim.oilAttractionProgram, 'u_attraction_strength'), sim.oilAttractionStrength);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    this.swapOilTextures();
  }

  applySurfaceTension(dt) {
    const sim = this.sim;
    const gl = this.gl;
    if (!sim.curvatureProgram || !sim.applySurfaceTensionProgram || sim.surfaceTension <= 0.0 || !this.curvatureFBO) return;

    const iters = Math.max(1, sim.surfaceTensionIterations | 0);
    for (let i = 0; i < iters; i++) {
      // Pass 1: Calculate curvature of current oil thickness
      gl.useProgram(sim.curvatureProgram);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.curvatureFBO);

      gl.bindBuffer(gl.ARRAY_BUFFER, sim.renderer.quadBuffer);
      const posCurv = gl.getAttribLocation(sim.curvatureProgram, 'a_position');
      gl.enableVertexAttribArray(posCurv);
      gl.vertexAttribPointer(posCurv, 2, gl.FLOAT, false, 0, 0);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.oilTexture1);
      gl.uniform1i(gl.getUniformLocation(sim.curvatureProgram, 'u_oil_texture'), 0);

      gl.uniform2f(gl.getUniformLocation(sim.curvatureProgram, 'u_resolution'), gl.canvas.width, gl.canvas.height);

      gl.drawArrays(gl.TRIANGLES, 0, 6);

      // Pass 2: Apply surface tension to oil thickness
      gl.useProgram(sim.applySurfaceTensionProgram);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.oilFBO);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.oilTexture2, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, sim.renderer.quadBuffer);
      const posApply = gl.getAttribLocation(sim.applySurfaceTensionProgram, 'a_position');
      gl.enableVertexAttribArray(posApply);
      gl.vertexAttribPointer(posApply, 2, gl.FLOAT, false, 0, 0);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.oilTexture1);
      gl.uniform1i(gl.getUniformLocation(sim.applySurfaceTensionProgram, 'u_oil_texture'), 0);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.curvatureTexture);
      gl.uniform1i(gl.getUniformLocation(sim.applySurfaceTensionProgram, 'u_curvature_texture'), 1);

      gl.uniform1f(gl.getUniformLocation(sim.applySurfaceTensionProgram, 'u_surface_tension'), sim.surfaceTension);
      const dtLoc = gl.getUniformLocation(sim.applySurfaceTensionProgram, 'u_dt');
      if (dtLoc) gl.uniform1f(dtLoc, dt);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
      this.swapOilTextures();
    }
  }

  clearOil() {
    const gl = this.gl;
    const prevFbo = gl.getParameter(gl.FRAMEBUFFER_BINDING);

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

    gl.bindFramebuffer(gl.FRAMEBUFFER, prevFbo);
  }

  swapOilTextures() {
    [this.oilTexture1, this.oilTexture2] = [this.oilTexture2, this.oilTexture1];
  }

  swapOilVelocityTextures() {
    [this.oilVelocityTexture1, this.oilVelocityTexture2] = [this.oilVelocityTexture2, this.oilVelocityTexture1];
  }

  swapOilPropsTextures() {
    [this.oilPropsTexture1, this.oilPropsTexture2] = [this.oilPropsTexture2, this.oilPropsTexture1];
  }

  destroy() {
    const gl = this.gl;
    if (this.oilTexture1) gl.deleteTexture(this.oilTexture1);
    if (this.oilTexture2) gl.deleteTexture(this.oilTexture2);
    if (this.oilFBO) gl.deleteFramebuffer(this.oilFBO);
    this.oilTexture1 = this.oilTexture2 = this.oilFBO = null;

    if (this.oilVelocityTexture1) gl.deleteTexture(this.oilVelocityTexture1);
    if (this.oilVelocityTexture2) gl.deleteTexture(this.oilVelocityTexture2);
    if (this.oilVelocityFBO) gl.deleteFramebuffer(this.oilVelocityFBO);
    this.oilVelocityTexture1 = this.oilVelocityTexture2 = this.oilVelocityFBO = null;
    if (this.oilPropsTexture1) gl.deleteTexture(this.oilPropsTexture1);
    if (this.oilPropsTexture2) gl.deleteTexture(this.oilPropsTexture2);
    if (this.oilPropsFBO) gl.deleteFramebuffer(this.oilPropsFBO);
  }
}
