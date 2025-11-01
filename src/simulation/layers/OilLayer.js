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

    gl.uniform1f(gl.getUniformLocation(sim.oilCouplingProgram, 'u_couplingStrength'), 1.0); // full strength
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
      gl.uniform1f(gl.getUniformLocation(sim.diffusionProgram, 'u_diffusion_rate'), Math.min(0.005, sim.oilSmoothingRate));
      gl.uniform2f(gl.getUniformLocation(sim.diffusionProgram, 'u_resolution'), gl.canvas.width, gl.canvas.height);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      this.swapOilTextures();
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

  computeOccupancy() {}
  applyOverflow(strength) {}

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
