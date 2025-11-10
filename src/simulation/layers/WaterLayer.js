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

  applyCouplingForce(dt) {
    const sim = this.sim;
    const gl = this.gl;
    gl.useProgram(sim.couplingForceProgram);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.velocityFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.velocityTexture2, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, sim.renderer.quadBuffer);
    const positionAttrib = gl.getAttribLocation(sim.couplingForceProgram, 'a_position');
    gl.enableVertexAttribArray(positionAttrib);
    gl.vertexAttribPointer(positionAttrib, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.velocityTexture1);
    gl.uniform1i(gl.getUniformLocation(sim.couplingForceProgram, 'u_velocity'), 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, sim.oil.oilTexture1);
    gl.uniform1i(gl.getUniformLocation(sim.couplingForceProgram, 'u_oil'), 1);

    gl.uniform2f(gl.getUniformLocation(sim.couplingForceProgram, 'u_resolution'), gl.canvas.width, gl.canvas.height);
    gl.uniform1f(gl.getUniformLocation(sim.couplingForceProgram, 'u_dt'), dt);
    gl.uniform1f(gl.getUniformLocation(sim.couplingForceProgram, 'u_couplingStrength'), sim.couplingStrength);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    this.swapVelocityTextures();
  }

  applyMarangoni(dt) {
    const sim = this.sim;
    const gl = this.gl;
    gl.useProgram(sim.marangoniProgram);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.velocityFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.velocityTexture2, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, sim.renderer.quadBuffer);
    const positionAttrib = gl.getAttribLocation(sim.marangoniProgram, 'a_position');
    gl.enableVertexAttribArray(positionAttrib);
    gl.vertexAttribPointer(positionAttrib, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.velocityTexture1);
    gl.uniform1i(gl.getUniformLocation(sim.marangoniProgram, 'u_velocity'), 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, sim.oil.oilTexture1);
    gl.uniform1i(gl.getUniformLocation(sim.marangoniProgram, 'u_oil'), 1);

    gl.uniform2f(gl.getUniformLocation(sim.marangoniProgram, 'u_texel'), 1.0 / gl.canvas.width, 1.0 / gl.canvas.height);
    gl.uniform1f(gl.getUniformLocation(sim.marangoniProgram, 'u_dt'), dt);
    gl.uniform1f(gl.getUniformLocation(sim.marangoniProgram, 'u_strength'), sim.marangoniStrength);
    gl.uniform1f(gl.getUniformLocation(sim.marangoniProgram, 'u_edgeBand'), sim.marangoniEdgeBand);
    gl.uniform1f(gl.getUniformLocation(sim.marangoniProgram, 'u_k_th'), sim.marangoniKth);
    // New safety/tuning uniforms
    const thMinLoc = gl.getUniformLocation(sim.marangoniProgram, 'u_thMin');
    if (thMinLoc) gl.uniform1f(thMinLoc, sim.marangoniThMin);
    const clampLoc = gl.getUniformLocation(sim.marangoniProgram, 'u_forceClamp');
    if (clampLoc) gl.uniform1f(clampLoc, sim.marangoniForceClamp);
    const ampLoc = gl.getUniformLocation(sim.marangoniProgram, 'u_amp');
    if (ampLoc) gl.uniform1f(ampLoc, sim.marangoniAmp);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    this.swapVelocityTextures();
  }

  applyAgitation(dt) {
    const sim = this.sim;
    const gl = this.gl;
    gl.useProgram(sim.agitationProgram);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.velocityFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.velocityTexture2, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, sim.renderer.quadBuffer);
    const positionAttrib = gl.getAttribLocation(sim.agitationProgram, 'a_position');
    gl.enableVertexAttribArray(positionAttrib);
    gl.vertexAttribPointer(positionAttrib, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.velocityTexture1);
    gl.uniform1i(gl.getUniformLocation(sim.agitationProgram, 'u_velocity_texture'), 0);

    gl.uniform1f(gl.getUniformLocation(sim.agitationProgram, 'u_agitation'), sim.agitation);
    gl.uniform1f(gl.getUniformLocation(sim.agitationProgram, 'u_time'), performance.now() / 1000.0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    this.swapVelocityTextures();
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
    // Keep Simulation aliases in sync after recreating resources
    this._syncAliases();
  }

  update(dt) {
    const sim = this.sim;
    const gl = this.gl;

    // Match existing order from Simulation.update
    if (sim.paused || !sim.ready || !sim.renderer.ready) return;

    // Ensure full-canvas viewport
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    sim.applyForces(dt);
    sim.applyCouplingForce(dt);

    if (sim.agitation > 0.0) {
      this.applyAgitation(dt);
    }

    // Apply coupling force from oil thickness gradients (if oil layer present)
    if (sim.useOil && sim.oil && sim.couplingForceProgram && sim.couplingStrength > 0.0) {
      this.applyCouplingForce(dt);
    }

    // Apply oil drag inside oil regions to encourage flow-around behavior
    if (sim.useOil && sim.oil && sim.waterOilDragProgram && sim.oilDragStrength > 0.0) {
      gl.useProgram(sim.waterOilDragProgram);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.velocityFBO);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.velocityTexture2, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, sim.renderer.quadBuffer);
      const positionAttrib = gl.getAttribLocation(sim.waterOilDragProgram, 'a_position');
      gl.enableVertexAttribArray(positionAttrib);
      gl.vertexAttribPointer(positionAttrib, 2, gl.FLOAT, false, 0, 0);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.velocityTexture1);
      gl.uniform1i(gl.getUniformLocation(sim.waterOilDragProgram, 'u_velocity'), 0);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, sim.oil.oilTexture1);
      gl.uniform1i(gl.getUniformLocation(sim.waterOilDragProgram, 'u_oil'), 1);

      // Optional per-pixel drag from oil properties
      if (sim.oil && sim.oil.oilPropsTexture) {
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, sim.oil.oilPropsTexture);
        const propsLoc = gl.getUniformLocation(sim.waterOilDragProgram, 'u_oilProps');
        if (propsLoc) gl.uniform1i(propsLoc, 2);
        const usePropsLoc = gl.getUniformLocation(sim.waterOilDragProgram, 'u_useProps');
        if (usePropsLoc) gl.uniform1f(usePropsLoc, 1.0);
      } else {
        const usePropsLoc = gl.getUniformLocation(sim.waterOilDragProgram, 'u_useProps');
        if (usePropsLoc) gl.uniform1f(usePropsLoc, 0.0);
      }

      gl.uniform1f(gl.getUniformLocation(sim.waterOilDragProgram, 'u_drag'), sim.oilDragStrength);
      gl.uniform1f(gl.getUniformLocation(sim.waterOilDragProgram, 'u_dt'), dt);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
      this.swapVelocityTextures();
    }

    if (sim.vorticityStrength > 0) {
      sim.applyVorticityConfinement();
    }

    sim.advectVelocity(dt);
    // Marangoni: add interface-driven force from oil thickness gradient
    if (sim.useOil && sim.oil && sim.marangoniProgram && sim.marangoniStrength > 0.0) {
      this.applyMarangoni(dt);
    }
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
      this.computeOccupancy();
      if (sim.occupancyPercent > sim.overflowUpper) {
        const excess = sim.occupancyPercent - sim.overflowLower;
        const range = Math.max(0.01, sim.overflowUpper - sim.overflowLower);
        const strength = Math.min(0.20, Math.max(0.0, excess / range));
        this.applyOverflow(strength);
        this.computeOccupancy();
      }
      gl.viewport(prevViewport[0], prevViewport[1], prevViewport[2], prevViewport[3]);
    }
  }

  splatColor(x, y, color, radius) {
    const sim = this.sim;
    const gl = this.gl;
    
    console.log(`🔍 WaterLayer.splatColor: x=${x.toFixed(2)}, y=${y.toFixed(2)}, color=${color.r.toFixed(2)},${color.g.toFixed(2)},${color.b.toFixed(2)}, radius=${radius}`);

    if (!this.colorTexture1 || !sim.splatProgram) {
      console.error('❌ Water layer not initialized - colorTexture1:', !!this.colorTexture1, 'splatProgram:', !!sim.splatProgram);
      return;
    }
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
    // Force ink path (not oil) to prevent stale uniform from previous oil splats
    const isOilLoc = gl.getUniformLocation(sim.splatProgram, 'u_isOil');
    if (isOilLoc) gl.uniform1i(isOilLoc, 0);

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

  computeOccupancy() {
    const sim = this.sim;
    const gl = this.gl;
    // Render occupancy mask (R=inked, G=inside) at low resolution
    gl.useProgram(sim.occupancyProgram);
    gl.bindFramebuffer(gl.FRAMEBUFFER, sim.occupancyFBO);
    gl.viewport(0, 0, sim.occupancyWidth, sim.occupancyHeight);

    gl.bindBuffer(gl.ARRAY_BUFFER, sim.renderer.quadBuffer);
    const positionAttrib = gl.getAttribLocation(sim.occupancyProgram, 'a_position');
    gl.enableVertexAttribArray(positionAttrib);
    gl.vertexAttribPointer(positionAttrib, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.colorTexture1);
    gl.uniform1i(gl.getUniformLocation(sim.occupancyProgram, 'u_color_texture'), 0);
    gl.uniform2f(gl.getUniformLocation(sim.occupancyProgram, 'u_resolution'), gl.canvas.width, gl.canvas.height);
    // Flag for ink (not oil)
    const isOilLoc = gl.getUniformLocation(sim.occupancyProgram, 'u_isOil');
    if (isOilLoc) gl.uniform1i(isOilLoc, 0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // Read back occupancy buffer (UNSIGNED_BYTE RGBA)
    const w = sim.occupancyWidth, h = sim.occupancyHeight;
    const pixels = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    // Sum R (inked), G (inside), and B (pixel soup) components
    let sumInked = 0, sumInside = 0, sumSoup = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      sumInked += pixels[i];
      sumInside += pixels[i + 1];
      sumSoup += pixels[i + 2];
    }
    // Normalize (bytes 0..255)
    const inkedNorm = sumInked / 255.0;
    const insideNorm = Math.max(1e-6, sumInside / 255.0);
    const soupNorm = sumSoup / 255.0;
    sim.occupancyPercent = Math.max(0.0, Math.min(1.0, inkedNorm / insideNorm));
    sim.pixelSoupPercent = inkedNorm > 1e-6 ? Math.max(0.0, Math.min(1.0, soupNorm / inkedNorm)) : 0.0;
    console.log(`🧪 Occupancy: ${(sim.occupancyPercent * 100).toFixed(1)}% | Pixel Soup: ${(sim.pixelSoupPercent * 100).toFixed(1)}% (threshold: ${sim.overflowUpper * 100}%)`);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  applyOverflow(strength) {
    const sim = this.sim;
    const gl = this.gl;
    if (strength <= 0.0) return;
    // Fullscreen pass: read colorTexture1, write damped result to colorTexture2
    const prevViewport = gl.getParameter(gl.VIEWPORT);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.useProgram(sim.overflowProgram);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.colorFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.colorTexture2, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, sim.renderer.quadBuffer);
    const positionAttrib = gl.getAttribLocation(sim.overflowProgram, 'a_position');
    gl.enableVertexAttribArray(positionAttrib);
    gl.vertexAttribPointer(positionAttrib, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.colorTexture1);
    gl.uniform1i(gl.getUniformLocation(sim.overflowProgram, 'u_color_texture'), 0);
    gl.uniform2f(gl.getUniformLocation(sim.overflowProgram, 'u_resolution'), gl.canvas.width, gl.canvas.height);
    gl.uniform1f(gl.getUniformLocation(sim.overflowProgram, 'u_strength'), strength);
    gl.uniform1i(gl.getUniformLocation(sim.overflowProgram, 'u_isOil'), 0); // Ink: hardcode alpha to 1.0

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    this.swapColorTextures();

    console.log(`🚰 Overflow valve engaged: strength=${strength.toFixed(2)} → target ${(sim.overflowLower*100)|0}-${(sim.overflowUpper*100)|0}%`);
    gl.viewport(prevViewport[0], prevViewport[1], prevViewport[2], prevViewport[3]);
  }

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
