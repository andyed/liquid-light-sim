/**
 * ImplicitSolver.js
 * 
 * Implicit time integration for SPH with high surface tension
 * 
 * Solves: (M - dt*J) * v_new = M*v_old + dt*F_explicit
 * 
 * Where:
 * - M = mass matrix (diagonal)
 * - J = Jacobian of implicit forces (pressure, viscosity, cohesion)
 * - F_explicit = explicit forces (gravity, buoyancy, grid drag)
 * 
 * This allows arbitrarily high surface tension (σ = 1000+) without instability!
 * 
 * References:
 * - "Implicit Surface Tension for SPH" (Jeske et al. 2023)
 * - "Stable Fluids" (Stam 1999)
 */

import SparseMatrix from './SparseMatrix.js';
import ConjugateGradient from './ConjugateGradient.js';

export default class ImplicitSolver {
  constructor(sphSystem) {
    this.sph = sphSystem;
    
    // Solver parameters
    this.maxIterations = 50;
    this.tolerance = 1e-4;
    
    // Implicit forces configuration
    this.implicitPressure = true;
    this.implicitViscosity = true;
    this.implicitCohesion = true;
    
    // Working arrays
    this.rhs = null;
    this.v_new = null;
    this.systemMatrix = null;
    
    // Performance stats
    this.stats = {
      buildTime: 0,
      solveTime: 0,
      iterations: 0,
      residual: 0
    };
  }
  
  /**
   * Implicit integration step
   * @param {number} dt - Timestep
   * @param {Float32Array} gridVelocities - External grid forces (optional)
   * @returns {boolean} - Success
   */
  solve(dt) {
    const startTime = performance.now();
    const N = this.sph.particleCount;
    const DOF = N * 2; // Degrees of freedom (2D: x, y per particle)
    
    if (N === 0) return true;
    
    // 1. Build RHS: M*v + dt*F_all
    this.buildRHS(dt);
    
    // 2. Build system matrix: A = M - dt*J
    const buildStart = performance.now();
    this.buildSystemMatrix(dt);
    this.stats.buildTime = performance.now() - buildStart;
    
    // 3. Solve: A * v_new = rhs
    const solveStart = performance.now();
    
    // Initial guess: current velocities
    if (!this.v_new || this.v_new.length !== DOF) {
      this.v_new = new Float32Array(DOF);
    }
    for (let i = 0; i < N; i++) {
      this.v_new[i * 2] = this.sph.velocities[i * 2];
      this.v_new[i * 2 + 1] = this.sph.velocities[i * 2 + 1];
    }
    
    const result = ConjugateGradient.solve(
      this.systemMatrix,
      this.rhs,
      this.v_new,
      this.maxIterations,
      this.tolerance
    );
    
    this.stats.solveTime = performance.now() - solveStart;
    this.stats.iterations = result.iterations;
    this.stats.residual = result.residual;
    
    if (!result.converged) {
      console.warn(`⚠️ Implicit solver did not converge: ${result.iterations} iters, residual=${result.residual.toFixed(6)}`);
    }
    
    // 4. Update velocities
    for (let i = 0; i < N; i++) {
      this.sph.velocities[i * 2] = result.x[i * 2];
      this.sph.velocities[i * 2 + 1] = result.x[i * 2 + 1];
    }
    
    // Debug logging (occasional)
    if (Math.random() < 0.02) {
      const totalTime = performance.now() - startTime;
      console.log(`🔧 Implicit solve: ${result.iterations} iters, ` +
                  `residual=${result.residual.toFixed(6)}, ` +
                  `time=${totalTime.toFixed(2)}ms (build=${this.stats.buildTime.toFixed(1)}ms, solve=${this.stats.solveTime.toFixed(1)}ms)`);
    }
    
    return result.converged;
  }
  
  /**
   * Build right-hand side: M*v_old + dt*F_all
   */
  buildRHS(dt) {
    const N = this.sph.particleCount;
    const m = this.sph.particleMass;
    const DOF = N * 2;
    
    if (!this.rhs || this.rhs.length !== DOF) {
      this.rhs = new Float32Array(DOF);
    }
    
    // RHS = M*v_old + dt*F_all
    // F_all is pre-computed in SPHOilSystem.js and includes all forces
    for (let i = 0; i < N; i++) {
      const forceX = this.sph.forces[i * 2];
      const forceY = this.sph.forces[i * 2 + 1];

      // M*v (mass matrix is diagonal) + dt*F
      this.rhs[i * 2] = m * this.sph.velocities[i * 2] + dt * forceX;
      this.rhs[i * 2 + 1] = m * this.sph.velocities[i * 2 + 1] + dt * forceY;
    }
  }
  
  /**
   * Build system matrix: A = M - dt*J
   * J = Jacobian of implicit forces
   */
  buildSystemMatrix(dt) {
    const N = this.sph.particleCount;
    const DOF = N * 2;
    
    // Estimate non-zeros: ~50 neighbors × 2 DOF × 2 DOF = 200 per particle
    const estimatedNNZ = N * 200;
    
    this.systemMatrix = new SparseMatrix(DOF, estimatedNNZ);
    
    // Build row-by-row
    for (let i = 0; i < N; i++) {
      // Build 2×2 block for particle i
      // Row for x-component
      this.buildRow(i, 0, dt);
      // Row for y-component
      this.buildRow(i, 1, dt);
    }
    
    this.systemMatrix.finalize();
  }
  
  /**
   * Build one row of system matrix
   * @param {number} particleIdx - Particle index
   * @param {number} component - 0=x, 1=y
   * @param {number} dt - Timestep
   */
  buildRow(particleIdx, component, dt) {
    const rowIdx = particleIdx * 2 + component;
    this.systemMatrix.beginRow(rowIdx);
    
    const m = this.sph.particleMass;
    const h = this.sph.smoothingRadius;
    
    // Diagonal: mass matrix
    let diagonal = m;
    
    // Get neighbors
    const xi = this.sph.positions[particleIdx * 2];
    const yi = this.sph.positions[particleIdx * 2 + 1];
    const neighbors = this.sph.spatialHash.query(xi, yi, h);
    
    // === PRESSURE JACOBIAN ===
    if (this.implicitPressure) {
      for (const j of neighbors) {
        if (j === particleIdx) continue;
        
        const xj = this.sph.positions[j * 2];
        const yj = this.sph.positions[j * 2 + 1];
        const dx = xi - xj;
        const dy = yi - yj;
        const distSq = dx * dx + dy * dy;
        if (distSq >= h * h) continue;
        const dist = Math.sqrt(distSq);
        
        // ∂F_pressure/∂v (simplified: assume pressure depends on velocity divergence)
        // This is a linearization - full derivation is complex
        const pressureJac = -dt * 0.5 * m * m / (this.sph.densities[j] + 1e-6);
        
        if (component === 0) { // x-component
          this.systemMatrix.addEntry(j * 2, pressureJac * dx / dist);
        } else { // y-component
          this.systemMatrix.addEntry(j * 2 + 1, pressureJac * dy / dist);
        }
        
        diagonal -= pressureJac * (component === 0 ? dx : dy) / dist;
      }
    }
    
    // === VISCOSITY JACOBIAN ===
    if (this.implicitViscosity) {
      const mu = this.sph.viscosity;
      for (const j of neighbors) {
        if (j === particleIdx) continue;
        
        const xj = this.sph.positions[j * 2];
        const yj = this.sph.positions[j * 2 + 1];
        const dx = xi - xj;
        const dy = yi - yj;
        const distSq = dx * dx + dy * dy;
        if (distSq >= h * h) continue;
        const dist = Math.sqrt(distSq);
        
        // Viscosity Jacobian: ∂F_visc/∂v
        const laplacian = this.sph.viscosityLaplacianKernel(dist, h);
        const viscJac = dt * mu * m * m / (this.sph.densities[j] + 1e-6) * laplacian;
        
        // Off-diagonal: coupling to neighbor
        this.systemMatrix.addEntry(j * 2 + component, viscJac);
        
        // Diagonal: coupling to self
        diagonal -= viscJac;
      }
    }
    
    // === COHESION JACOBIAN (POSITION-BASED) ===
    if (this.implicitCohesion) {
      // Based on the formula (M - dt^2 * J_pos), where J_pos = ∂F_c/∂x
      // We approximate the cohesion force as a simple spring F = -k(xi - xj)
      // The Jacobian ∂F_i/∂x_j = k*I, and ∂F_i/∂x_i = -k*I for each neighbor.
      // CRITICAL: k must be MUCH larger than ALL forces (pressure + shear) for blobs!
      const k = 20000.0; // EXTREME stiffness (was 5000) - must resist water shear
      const dt2 = dt * dt;

      for (const j of neighbors) {
        if (j === particleIdx) continue;
        
        const xj = this.sph.positions[j * 2];
        const yj = this.sph.positions[j * 2 + 1];
        const dx = xi - xj;
        const dy = yi - yj;
        const distSq = dx * dx + dy * dy;
        
        // Only apply to close neighbors, consistent with cohesion force kernels
        if (distSq < h * h) {
            // Contribution to A_ij from ∂F_i/∂x_j is k.
            // The term added to the system matrix is -dt^2 * k.
            const offDiag = -dt2 * k;
            this.systemMatrix.addEntry(j * 2 + component, offDiag);

            // Contribution to A_ii from ∂F_i/∂x_i is -k for this neighbor.
            // The term added to the diagonal is -dt^2 * (-k) = dt^2 * k.
            diagonal -= offDiag; // i.e., diagonal += dt^2 * k
        }
      }
    }
    
    // Add diagonal entry
    this.systemMatrix.addEntry(rowIdx, diagonal);
  }
  
  /**
   * Get solver statistics
   */
  getStats() {
    return {
      buildTime: this.stats.buildTime.toFixed(2) + 'ms',
      solveTime: this.stats.solveTime.toFixed(2) + 'ms',
      iterations: this.stats.iterations,
      residual: this.stats.residual.toFixed(6),
      matrixStats: this.systemMatrix ? this.systemMatrix.getStats() : null
    };
  }
}
