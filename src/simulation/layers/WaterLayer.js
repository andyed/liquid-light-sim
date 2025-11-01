import FluidLayer from './FluidLayer.js';

export default class WaterLayer extends FluidLayer {
  constructor(simulation) {
    super(simulation);
    this.colorTexture1 = null;
    this.colorTexture2 = null;
    this.colorFBO = null;
    this.velocityTexture1 = null;
    this.velocityTexture2 = null;
    this.velocityFBO = null;
    this.divergenceTexture = null;
    this.divergenceFBO = null;
    this.pressureTexture1 = null;
    this.pressureTexture2 = null;
    this.pressureFBO = null;
  }

  async init() {
    const gl = this.gl;
    const w = gl.canvas.width;
    const h = gl.canvas.height;

    // Create textures/FBOs using Simulation helpers
    this.colorTexture1 = this.sim.createTexture(w, h, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT);
    this.colorTexture2 = this.sim.createTexture(w, h, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT);
    this.colorFBO = this.sim.createFBO(this.colorTexture1);

    this.velocityTexture1 = this.sim.createTexture(w, h, gl.RG16F, gl.RG, gl.HALF_FLOAT);
    this.velocityTexture2 = this.sim.createTexture(w, h, gl.RG16F, gl.RG, gl.HALF_FLOAT);
    this.velocityFBO = this.sim.createFBO(this.velocityTexture1);

    this.divergenceTexture = this.sim.createTexture(w, h, gl.R16F, gl.RED, gl.HALF_FLOAT);
    this.divergenceFBO = this.sim.createFBO(this.divergenceTexture);

    this.pressureTexture1 = this.sim.createTexture(w, h, gl.R16F, gl.RED, gl.HALF_FLOAT);
    this.pressureTexture2 = this.sim.createTexture(w, h, gl.R16F, gl.RED, gl.HALF_FLOAT);
    this.pressureFBO = this.sim.createFBO(this.pressureTexture1);
    this._syncAliases();
  }

  resize() {
    const gl = this.gl;
    const w = gl.canvas.width;
    const h = gl.canvas.height;

    // Delete previous
    if (this.colorTexture1) gl.deleteTexture(this.colorTexture1);
    if (this.colorTexture2) gl.deleteTexture(this.colorTexture2);
    if (this.colorFBO) gl.deleteFramebuffer(this.colorFBO);

    if (this.velocityTexture1) gl.deleteTexture(this.velocityTexture1);
    if (this.velocityTexture2) gl.deleteTexture(this.velocityTexture2);
    if (this.velocityFBO) gl.deleteFramebuffer(this.velocityFBO);

    if (this.divergenceTexture) gl.deleteTexture(this.divergenceTexture);
    if (this.divergenceFBO) gl.deleteFramebuffer(this.divergenceFBO);

    if (this.pressureTexture1) gl.deleteTexture(this.pressureTexture1);
    if (this.pressureTexture2) gl.deleteTexture(this.pressureTexture2);
    if (this.pressureFBO) gl.deleteFramebuffer(this.pressureFBO);

    // Recreate
    this.colorTexture1 = this.sim.createTexture(w, h, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT);
    this.colorTexture2 = this.sim.createTexture(w, h, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT);
    this.colorFBO = this.sim.createFBO(this.colorTexture1);

    this.velocityTexture1 = this.sim.createTexture(w, h, gl.RG16F, gl.RG, gl.HALF_FLOAT);
    this.velocityTexture2 = this.sim.createTexture(w, h, gl.RG16F, gl.RG, gl.HALF_FLOAT);
    this.velocityFBO = this.sim.createFBO(this.velocityTexture1);

    this.divergenceTexture = this.sim.createTexture(w, h, gl.R16F, gl.RED, gl.HALF_FLOAT);
    this.divergenceFBO = this.sim.createFBO(this.divergenceTexture);

    this.pressureTexture1 = this.sim.createTexture(w, h, gl.R16F, gl.RED, gl.HALF_FLOAT);
    this.pressureTexture2 = this.sim.createTexture(w, h, gl.R16F, gl.RED, gl.HALF_FLOAT);
    this.pressureFBO = this.sim.createFBO(this.pressureTexture1);
  }

  update(dt) {
    const sim = this.sim;
    const gl = this.gl;

    // Match existing order from Simulation.update
    if (sim.paused || !sim.ready || !sim.renderer.ready) return;

    // Ensure full-canvas viewport
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    sim.applyForces(dt);

    if (sim.vorticityStrength > 0) {
      sim.applyVorticityConfinement();
    }

    sim.advectVelocity(dt);
    sim.applyViscosity(dt);
    sim.projectVelocity();
    sim.advectColor(dt);

    if (sim.diffusionRate > 0) {
      sim.applyDiffusion(dt);
    }

    // Overflow control cadence mirrors Simulation.update
    sim._frameCounter = (sim._frameCounter + 1) | 0;
    if ((sim._frameCounter % sim.occupancyEveryN) === 0) {
      const prevViewport = gl.getParameter(gl.VIEWPORT);
      sim.computeOccupancy();
      if (sim.occupancyPercent > sim.overflowUpper) {
        const excess = sim.occupancyPercent - sim.overflowLower;
        const range = Math.max(0.01, sim.overflowUpper - sim.overflowLower);
        const strength = Math.min(0.20, Math.max(0.0, excess / range));
        sim.applyOverflow(strength);
        sim.computeOccupancy();
      }
      gl.viewport(prevViewport[0], prevViewport[1], prevViewport[2], prevViewport[3]);
    }
  }

  splatColor(x, y, color, radius) {
    const sim = this.sim;
    const gl = this.gl;

    gl.useProgram(sim.splatProgram);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.colorFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.colorTexture2, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, sim.renderer.quadBuffer);
    const positionAttrib = gl.getAttribLocation(sim.splatProgram, 'a_position');
    gl.enableVertexAttribArray(positionAttrib);
    gl.vertexAttribPointer(positionAttrib, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.colorTexture1);
    gl.uniform1i(gl.getUniformLocation(sim.splatProgram, 'u_texture'), 0);
    gl.uniform2f(gl.getUniformLocation(sim.splatProgram, 'u_point'), x, y);
    gl.uniform3f(gl.getUniformLocation(sim.splatProgram, 'u_color'), color.r, color.g, color.b);
    gl.uniform1f(gl.getUniformLocation(sim.splatProgram, 'u_radius'), radius);
    gl.uniform2f(gl.getUniformLocation(sim.splatProgram, 'u_resolution'), gl.canvas.width, gl.canvas.height);
    gl.uniform1i(gl.getUniformLocation(sim.splatProgram, 'u_isVelocity'), 0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    this.swapColorTextures();
  }

  splatVelocity(x, y, vx, vy, radius) {
    const sim = this.sim;
    const gl = this.gl;

    gl.useProgram(sim.splatProgram);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.velocityFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.velocityTexture2, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.velocityTexture1);
    gl.uniform1i(gl.getUniformLocation(sim.splatProgram, 'u_texture'), 0);
    gl.uniform2f(gl.getUniformLocation(sim.splatProgram, 'u_point'), x, y);
    gl.uniform3f(gl.getUniformLocation(sim.splatProgram, 'u_color'), vx, vy, 0);
    gl.uniform1f(gl.getUniformLocation(sim.splatProgram, 'u_radius'), radius);
    gl.uniform2f(gl.getUniformLocation(sim.splatProgram, 'u_resolution'), gl.canvas.width, gl.canvas.height);
    gl.uniform1i(gl.getUniformLocation(sim.splatProgram, 'u_isVelocity'), 1);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    this.swapVelocityTextures();
  }

  computeOccupancy() { this.sim.computeOccupancy(); }
  applyOverflow(strength) { this.sim.applyOverflow(strength); }

  // Swaps owned textures
  swapColorTextures() {
    [this.colorTexture1, this.colorTexture2] = [this.colorTexture2, this.colorTexture1];
    // Keep Simulation aliases in sync if set
    this._syncAliases();
  }
  swapVelocityTextures() {
    [this.velocityTexture1, this.velocityTexture2] = [this.velocityTexture2, this.velocityTexture1];
    this._syncAliases();
  }
  swapPressureTextures() {
    [this.pressureTexture1, this.pressureTexture2] = [this.pressureTexture2, this.pressureTexture1];
    this._syncAliases();
  }
  _syncAliases() {
    // Update Simulation-facing aliases if present
    const sim = this.sim;
    sim.colorTexture1 = this.colorTexture1;
    sim.colorTexture2 = this.colorTexture2;
    sim.colorFBO = this.colorFBO;
    sim.velocityTexture1 = this.velocityTexture1;
    sim.velocityTexture2 = this.velocityTexture2;
    sim.velocityFBO = this.velocityFBO;
    sim.divergenceTexture = this.divergenceTexture;
    sim.divergenceFBO = this.divergenceFBO;
    sim.pressureTexture1 = this.pressureTexture1;
    sim.pressureTexture2 = this.pressureTexture2;
    sim.pressureFBO = this.pressureFBO;
  }
}
