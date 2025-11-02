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
  }

  async init() {
    const gl = this.gl;
    const w = gl.canvas.width;
    const h = gl.canvas.height;

    // Oil thickness/tint field (RGBA16F)
    this.oilTexture1 = this.sim.createTexture(w, h, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT);
    this.oilTexture2 = this.sim.createTexture(w, h, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT);
    this.oilFBO = this.sim.createFBO(this.oilTexture1);

    // Oil velocity field (RG16F)
    this.oilVelocityTexture1 = this.sim.createTexture(w, h, gl.RG16F, gl.RG, gl.HALF_FLOAT);
    this.oilVelocityTexture2 = this.sim.createTexture(w, h, gl.RG16F, gl.RG, gl.HALF_FLOAT);
    this.oilVelocityFBO = this.sim.createFBO(this.oilVelocityTexture1);
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

    this.oilVelocityTexture1 = this.sim.createTexture(w, h, gl.RG16F, gl.RG, gl.HALF_FLOAT);
    this.oilVelocityTexture2 = this.sim.createTexture(w, h, gl.RG16F, gl.RG, gl.HALF_FLOAT);
    this.oilVelocityFBO = this.sim.createFBO(this.oilVelocityTexture1);
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
    gl.bindFramebuffer(gl.FRAMEBUFFER, prevFbo2);
  }

  update(dt) {
    const gl = this.gl;
    const sim = this.sim;
    if (!sim.ready || !sim.renderer.ready || sim.paused) return;

    // STEP 1: Advect oil velocity by itself (semi-Lagrangian)
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

    // STEP 2: Apply coupling from water velocity
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

    gl.uniform1f(gl.getUniformLocation(sim.oilCouplingProgram, 'u_couplingStrength'), sim.couplingStrength);
    gl.uniform1f(gl.getUniformLocation(sim.oilCouplingProgram, 'u_dt'), dt);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    this.swapOilVelocityTextures();

    // STEP 3: Apply oil viscosity (high viscosity = slow, smooth flow)
    if (sim.oilViscosity > 0.0 && sim.oilViscosityIterations > 0) {
      gl.useProgram(sim.viscosityProgram);
      
      for (let i = 0; i < sim.oilViscosityIterations; i++) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.oilVelocityFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.oilVelocityTexture2, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, sim.renderer.quadBuffer);
        const posVisc = gl.getAttribLocation(sim.viscosityProgram, 'a_position');
        gl.enableVertexAttribArray(posVisc);
        gl.vertexAttribPointer(posVisc, 2, gl.FLOAT, false, 0, 0);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.oilVelocityTexture1);
        gl.uniform1i(gl.getUniformLocation(sim.viscosityProgram, 'u_velocity_texture'), 0);
        gl.uniform1f(gl.getUniformLocation(sim.viscosityProgram, 'u_viscosity'), sim.oilViscosity);
        gl.uniform1f(gl.getUniformLocation(sim.viscosityProgram, 'u_dt'), dt);
        gl.uniform2f(gl.getUniformLocation(sim.viscosityProgram, 'u_resolution'), gl.canvas.width, gl.canvas.height);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
        this.swapOilVelocityTextures();
      }
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
    gl.bindTexture(gl.TEXTURE_2D, this.oilVelocityTexture1); // advect by oil velocity
    gl.uniform1i(gl.getUniformLocation(sim.advectionProgram, 'u_velocity_texture'), 1);

    gl.uniform1f(gl.getUniformLocation(sim.advectionProgram, 'u_dt'), dt);
    gl.uniform2f(gl.getUniformLocation(sim.advectionProgram, 'u_resolution'), gl.canvas.width, gl.canvas.height);
    gl.uniform1i(gl.getUniformLocation(sim.advectionProgram, 'u_isVelocity'), 0);
    // Mark advection as oil so shader preserves alpha
    const isOilAdvLoc = gl.getUniformLocation(sim.advectionProgram, 'u_isOil');
    if (isOilAdvLoc) gl.uniform1i(isOilAdvLoc, 1);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    this.swapOilTextures();

    // STEP 5: Apply self-attraction for cohesion
    this.applySelfAttraction(dt);

    // STEP 6: Apply surface tension
    this.applySurfaceTension(dt);

    // STEP 7: Optional smoothing for lens-like cohesion (oil-only smoothing)
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
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      this.swapOilTextures();
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

    gl.useProgram(sim.splatProgram);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.oilFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.oilTexture2, 0);

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
    if (oilStrengthLoc) gl.uniform1f(oilStrengthLoc, 1.0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    this.swapOilTextures();
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

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    this.swapOilTextures();

    if (sim.logVerbose) {
      console.log(`🛢️ Oil overflow valve: strength=${strength.toFixed(2)} → target ${(sim.oilOverflowLower*100)|0}-${(sim.oilOverflowUpper*100)|0}%`);
    }
    gl.viewport(prevViewport[0], prevViewport[1], prevViewport[2], prevViewport[3]);
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
    this.swapOilTextures();
  }

  applySurfaceTension(dt) {
    const sim = this.sim;
    const gl = this.gl;
    if (!sim.surfaceTensionProgram || sim.surfaceTension <= 0.0) return;

    gl.useProgram(sim.surfaceTensionProgram);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.oilFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.oilTexture2, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, sim.renderer.quadBuffer);
    const positionAttrib = gl.getAttribLocation(sim.surfaceTensionProgram, 'a_position');
    gl.enableVertexAttribArray(positionAttrib);
    gl.vertexAttribPointer(positionAttrib, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.oilTexture1);
    gl.uniform1i(gl.getUniformLocation(sim.surfaceTensionProgram, 'u_oil_texture'), 0);

    gl.uniform2f(gl.getUniformLocation(sim.surfaceTensionProgram, 'u_resolution'), gl.canvas.width, gl.canvas.height);
    gl.uniform1f(gl.getUniformLocation(sim.surfaceTensionProgram, 'u_surface_tension'), sim.surfaceTension);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    this.swapOilTextures();
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
  }
}
