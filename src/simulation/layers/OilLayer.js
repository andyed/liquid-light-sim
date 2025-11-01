import FluidLayer from './FluidLayer.js';

export default class OilLayer extends FluidLayer {
  constructor(simulation) {
    super(simulation);
    this.oilTexture1 = null;
    this.oilTexture2 = null;
    this.oilFBO = null;
  }

  async init() {
    const gl = this.gl;
    const w = gl.canvas.width;
    const h = gl.canvas.height;

    // Oil thickness/tint field (RGBA16F)
    this.oilTexture1 = this.sim.createTexture(w, h, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT);
    this.oilTexture2 = this.sim.createTexture(w, h, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT);
    this.oilFBO = this.sim.createFBO(this.oilTexture1);
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
  }

  update(dt) {
    const gl = this.gl;
    const sim = this.sim;
    if (!sim.ready || !sim.renderer.ready || sim.paused) return;

    // 1) Advect oil by water velocity (mixed velocity TBD)
    gl.useProgram(sim.advectionProgram);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.oilFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.oilTexture2, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, sim.renderer.quadBuffer);
    const positionAttrib = gl.getAttribLocation(sim.advectionProgram, 'a_position');
    gl.enableVertexAttribArray(positionAttrib);
    gl.vertexAttribPointer(positionAttrib, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.oilTexture1);
    gl.uniform1i(gl.getUniformLocation(sim.advectionProgram, 'u_color_texture'), 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, sim.velocityTexture1);
    gl.uniform1i(gl.getUniformLocation(sim.advectionProgram, 'u_velocity_texture'), 1);

    gl.uniform1f(gl.getUniformLocation(sim.advectionProgram, 'u_dt'), dt);
    gl.uniform2f(gl.getUniformLocation(sim.advectionProgram, 'u_resolution'), gl.canvas.width, gl.canvas.height);
    gl.uniform1i(gl.getUniformLocation(sim.advectionProgram, 'u_isVelocity'), 0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    this.swapOilTextures();

    // 2) Optional smoothing for lens-like cohesion (oil-only smoothing)
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

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    this.swapOilTextures();
  }

  splatVelocity(x, y, vx, vy, radius) {
    // Oil layer velocity not yet implemented; no-op
  }

  computeOccupancy() {}
  applyOverflow(strength) {}

  swapOilTextures() {
    [this.oilTexture1, this.oilTexture2] = [this.oilTexture2, this.oilTexture1];
  }

  destroy() {
    const gl = this.gl;
    if (this.oilTexture1) gl.deleteTexture(this.oilTexture1);
    if (this.oilTexture2) gl.deleteTexture(this.oilTexture2);
    if (this.oilFBO) gl.deleteFramebuffer(this.oilFBO);
    this.oilTexture1 = this.oilTexture2 = this.oilFBO = null;
  }
}
