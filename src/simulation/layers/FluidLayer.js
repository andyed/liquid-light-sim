export default class FluidLayer {
  constructor(simulation) {
    this.sim = simulation; // reference to Simulation orchestrator (gl, renderer, programs, params)
    this.gl = simulation.gl;
    this.renderer = simulation.renderer;
  }

  // Lifecycle
  async init() {}
  resize() {}
  destroy() {}

  // Frame update (override in subclasses)
  update(dt) {
    throw new Error('FluidLayer.update(dt) must be implemented by subclass');
  }

  // Inputs
  splatColor(x, y, color, radius) {
    throw new Error('FluidLayer.splatColor(...) must be implemented by subclass');
  }
  splatVelocity(x, y, vx, vy, radius) {
    throw new Error('FluidLayer.splatVelocity(...) must be implemented by subclass');
  }

  // Diagnostics / control
  computeOccupancy() {
    throw new Error('FluidLayer.computeOccupancy() must be implemented by subclass');
  }
  applyOverflow(strength) {
    throw new Error('FluidLayer.applyOverflow(strength) must be implemented by subclass');
  }
}
