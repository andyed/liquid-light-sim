import FluidLayer from './FluidLayer.js';

export default class OilLayer extends FluidLayer {
  constructor(simulation) {
    super(simulation);
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
  }

  async init() {
    const gl = this.gl;
    const w = gl.canvas.width;
    const h = gl.canvas.height;

    // Oil thickness/tint field (RGBA16F)
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

    // Ensure oil passes render at full canvas size (avoid stale viewport from other stages)
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

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

    // STEP 3: Apply oil viscosity (high viscosity = slow, smooth flow)
    // TEMPORARILY DISABLED - viscosity was killing all velocity
    // if (sim.oilViscosity > 0.0 && sim.oilViscosityIterations > 0) {
    //   gl.useProgram(sim.viscosityProgram);
    //   
    //   for (let i = 0; i < sim.oilViscosityIterations; i++) {
    //     gl.bindFramebuffer(gl.FRAMEBUFFER, this.oilVelocityFBO);
    //     gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.oilVelocityTexture2, 0);
    //
    //     gl.bindBuffer(gl.ARRAY_BUFFER, sim.renderer.quadBuffer);
    //     const posVisc = gl.getAttribLocation(sim.viscosityProgram, 'a_position');
    //     gl.enableVertexAttribArray(posVisc);
    //     gl.vertexAttribPointer(posVisc, 2, gl.FLOAT, false, 0, 0);
    //
    //     gl.activeTexture(gl.TEXTURE0);
    //     gl.bindTexture(gl.TEXTURE_2D, this.oilVelocityTexture1);
    //     gl.uniform1i(gl.getUniformLocation(sim.viscosityProgram, 'u_velocity_texture'), 0);
    //     gl.uniform1f(gl.getUniformLocation(sim.viscosityProgram, 'u_viscosity'), sim.oilViscosity);
    //     gl.uniform1f(gl.getUniformLocation(sim.viscosityProgram, 'u_dt'), dt);
    //     gl.uniform2f(gl.getUniformLocation(sim.viscosityProgram, 'u_resolution'), gl.canvas.width, gl.canvas.height);
    //
    //     gl.drawArrays(gl.TRIANGLES, 0, 6);
    //     this.swapOilVelocityTextures();
    //   }
    // }

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
    // Use oil velocity (which should have water's velocity from coupling)
    const velocityTexture = sim.debugAdvectOilWithWaterVelocity ? sim.velocityTexture1 : this.oilVelocityTexture1;
    gl.bindTexture(gl.TEXTURE_2D, velocityTexture);
    gl.uniform1i(gl.getUniformLocation(sim.advectionProgram, 'u_velocity_texture'), 1);

    gl.uniform1f(gl.getUniformLocation(sim.advectionProgram, 'u_dt'), dt);
    gl.uniform2f(gl.getUniformLocation(sim.advectionProgram, 'u_resolution'), gl.canvas.width, gl.canvas.height);
    gl.uniform1i(gl.getUniformLocation(sim.advectionProgram, 'u_isVelocity'), 0);
    // Mark advection as oil so shader preserves alpha
    const isOilAdvLoc = gl.getUniformLocation(sim.advectionProgram, 'u_isOil');
    if (isOilAdvLoc) gl.uniform1i(isOilAdvLoc, 1);
    // Disable rim absorption fade for oil (prevents gradual disappearing during tests)
    const oilRimAbsLoc = gl.getUniformLocation(sim.advectionProgram, 'u_oilRimAbsorptionScale');
    if (oilRimAbsLoc) gl.uniform1f(oilRimAbsLoc, 0.0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    this.swapOilTextures();

    // STEP 5: Optional smoothing for lens-like cohesion (oil-only smoothing)
    if (sim.oilSmoothingRate > 0.0) {
      gl.useProgram(sim.diffusionProgram);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.oilFBO);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.oilTexture2, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, sim.renderer.quadBuffer);
      const pos2 = gl.getAttribLocation(sim.diffusionProgram, 'a_position');
      gl.enableVertexAttribArray(pos2);
      gl.vertexAttribPointer(pos2, 2, gl.FLOAT, false, 0, 0);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.oilTexture1);
      gl.uniform1i(gl.getUniformLocation(sim.diffusionProgram, 'u_color_texture'), 0);
      gl.uniform1f(gl.getUniformLocation(sim.diffusionProgram, 'u_diffusion_rate'), sim.oilSmoothingRate);
      gl.uniform2f(gl.getUniformLocation(sim.diffusionProgram, 'u_resolution'), gl.canvas.width, gl.canvas.height);
      // Preserve alpha (thickness) when smoothing oil - only diffuse RGB tint
      const preserveAlphaLoc = gl.getUniformLocation(sim.diffusionProgram, 'u_preserveAlpha');
      if (preserveAlphaLoc) gl.uniform1i(preserveAlphaLoc, 1);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      this.swapOilTextures();
    }

    // DEBUG (final): One-frame offset copy of oil texture to validate FBO write/swap
    if (sim.debugOffsetOilOnce && sim.offsetCopyProgram) {
      gl.useProgram(sim.offsetCopyProgram);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.oilFBO);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.oilTexture2, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, sim.renderer.quadBuffer);
      const posOff = gl.getAttribLocation(sim.offsetCopyProgram, 'a_position');
      gl.enableVertexAttribArray(posOff);
      gl.vertexAttribPointer(posOff, 2, gl.FLOAT, false, 0, 0);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.oilTexture1);
      gl.uniform1i(gl.getUniformLocation(sim.offsetCopyProgram, 'u_src'), 0);
      gl.uniform2f(gl.getUniformLocation(sim.offsetCopyProgram, 'u_offset'), sim.debugOffsetOilDX, sim.debugOffsetOilDY);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
      this.swapOilTextures();
      sim.debugOffsetOilOnce = false; // consume
    }

    // STEP 6: Oil overflow control (same cadence as water, independent thresholds)
    // Use same frame counter as water (already incremented in WaterLayer.update)
    if ((sim._frameCounter % sim.occupancyEveryN) === 0) {
      const prevViewport = gl.getParameter(gl.VIEWPORT);
      this.computeOccupancy();
      if (sim.oilOccupancyPercent > sim.oilOverflowUpper) {
        const excess = sim.oilOccupancyPercent - sim.oilOverflowLower;
        const range = Math.max(0.01, sim.oilOverflowUpper - sim.oilOverflowLower);
        const strength = Math.min(0.20, Math.max(0.0, excess / range));
        this.applyOverflow(strength);
        this.computeOccupancy(); // Re-measure after overflow
      }
      gl.viewport(prevViewport[0], prevViewport[1], prevViewport[2], prevViewport[3]);
    }
  }

  splatColor(x, y, color, radius) {
    const gl = this.gl;
    const sim = this.sim;
    
    console.log('🛢️ OilLayer.splatColor called:', {x: x.toFixed(2), y: y.toFixed(2), radius, color});

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
    if (oilStrengthLoc) gl.uniform1f(oilStrengthLoc, 2.5); // Increased from 1.0 for more visible oil

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
