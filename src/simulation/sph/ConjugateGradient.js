/**
 * ConjugateGradient.js
 * 
 * Conjugate Gradient solver for symmetric positive definite systems
 * Used to solve implicit SPH system: (M - dt*J) * v = rhs
 * 
 * Preconditioned version with Jacobi preconditioner for faster convergence
 * 
 * Algorithm:
 * 1. r = b - A*x0
 * 2. Apply preconditioner: z = M^-1 * r
 * 3. p = z
 * 4. For k iterations:
 *    - alpha = (r'*z) / (p'*A*p)
 *    - x = x + alpha*p
 *    - r_new = r - alpha*A*p
 *    - beta = (r_new'*z_new) / (r'*z)
 *    - p = z_new + beta*p
 */

export default class ConjugateGradient {
  /**
   * Solve A*x = b using preconditioned CG
   * @param {SparseMatrix} A - System matrix (must be SPD)
   * @param {Float32Array} b - Right-hand side
   * @param {Float32Array} x0 - Initial guess (modified in-place)
   * @param {number} maxIterations - Maximum iterations
   * @param {number} tolerance - Convergence tolerance (relative residual)
   * @returns {Object} - {x, iterations, residual, converged}
   */
  static solve(A, b, x0, maxIterations = 50, tolerance = 1e-4) {
    const n = A.size;
    
    // Working vectors
    const r = new Float32Array(n);  // Residual
    const z = new Float32Array(n);  // Preconditioned residual
    const p = new Float32Array(n);  // Search direction
    const Ap = new Float32Array(n); // A * p
    
    // Build 2x2 block-Jacobi preconditioner per particle: [a b; c d]^{-1}
    // Store as four arrays for cache-friendly apply
    const blockCount = Math.floor(n / 2);
    const Minv00 = new Float32Array(blockCount);
    const Minv01 = new Float32Array(blockCount);
    const Minv10 = new Float32Array(blockCount);
    const Minv11 = new Float32Array(blockCount);
    for (let bi = 0; bi < blockCount; bi++) {
      const r0 = 2 * bi;
      const r1 = r0 + 1;
      const a = A.get(r0, r0);
      const b = A.get(r0, r1);
      const c = A.get(r1, r0);
      const d = A.get(r1, r1);
      const det = a * d - b * c;
      if (Math.abs(det) > 1e-12) {
        const invDet = 1.0 / det;
        Minv00[bi] =  d * invDet;
        Minv01[bi] = -b * invDet;
        Minv10[bi] = -c * invDet;
        Minv11[bi] =  a * invDet;
      } else {
        // Fallback to scalar Jacobi if block is near-singular
        Minv00[bi] = Math.abs(a) > 1e-12 ? 1.0 / a : 1.0;
        Minv01[bi] = 0.0;
        Minv10[bi] = 0.0;
        Minv11[bi] = Math.abs(d) > 1e-12 ? 1.0 / d : 1.0;
      }
    }
    
    // Initial residual: r = b - A*x0
    A.multiply(x0, Ap); // Reuse Ap as temp
    for (let i = 0; i < n; i++) {
      r[i] = b[i] - Ap[i];
    }
    
    // Initial residual norm
    let residual0 = this.dot(r, r);
    if (residual0 < 1e-20) {
      // Already converged
      return {
        x: x0,
        iterations: 0,
        residual: 0,
        converged: true
      };
    }
    residual0 = Math.sqrt(residual0);
    
    // Apply preconditioner: z = M^-1 * r (block-wise)
    for (let bi = 0; bi < blockCount; bi++) {
      const r0 = r[2 * bi];
      const r1 = r[2 * bi + 1];
      z[2 * bi]     = Minv00[bi] * r0 + Minv01[bi] * r1;
      z[2 * bi + 1] = Minv10[bi] * r0 + Minv11[bi] * r1;
    }
    
    // Initial search direction: p = z
    for (let i = 0; i < n; i++) {
      p[i] = z[i];
    }
    
    let rz = this.dot(r, z);
    
    // CG iterations
    let iteration = 0;
    let residual = residual0;
    
    for (iteration = 0; iteration < maxIterations; iteration++) {
      // Ap = A * p
      A.multiply(p, Ap);
      
      // alpha = (r'*z) / (p'*A*p)
      const pAp = this.dot(p, Ap);
      if (Math.abs(pAp) < 1e-20) {
        console.warn('⚠️ CG: pAp near zero, stopping');
        break;
      }
      const alpha = rz / pAp;
      
      // x = x + alpha*p
      for (let i = 0; i < n; i++) {
        x0[i] += alpha * p[i];
      }
      
      // r = r - alpha*A*p
      for (let i = 0; i < n; i++) {
        r[i] -= alpha * Ap[i];
      }
      
      // Check convergence
      residual = Math.sqrt(this.dot(r, r));
      const relativeResidual = residual / residual0;
      
      if (relativeResidual < tolerance) {
        // Converged!
        return {
          x: x0,
          iterations: iteration + 1,
          residual: relativeResidual,
          converged: true
        };
      }
      
      // Apply preconditioner: z = M^-1 * r (block-wise)
      for (let bi = 0; bi < blockCount; bi++) {
        const r0b = r[2 * bi];
        const r1b = r[2 * bi + 1];
        z[2 * bi]     = Minv00[bi] * r0b + Minv01[bi] * r1b;
        z[2 * bi + 1] = Minv10[bi] * r0b + Minv11[bi] * r1b;
      }
      
      // beta = (r_new'*z_new) / (r_old'*z_old)
      const rz_new = this.dot(r, z);
      const beta = rz_new / rz;
      rz = rz_new;
      
      // p = z + beta*p
      for (let i = 0; i < n; i++) {
        p[i] = z[i] + beta * p[i];
      }
    }
    
    // Max iterations reached
    return {
      x: x0,
      iterations: iteration,
      residual: residual / residual0,
      converged: false
    };
  }
  
  /**
   * Dot product: a'*b
   */
  static dot(a, b) {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += a[i] * b[i];
    }
    return sum;
  }
  
  /**
   * Test CG solver with simple system
   */
  static test() {
    console.log('🧪 Testing Conjugate Gradient solver...');
    
    // Import sparse matrix
    const SparseMatrix = window.SparseMatrix || require('./SparseMatrix.js').default;
    
    // Build test system: 3×3 SPD matrix
    // A = [4 1 0]
    //     [1 4 1]
    //     [0 1 4]
    const A = new SparseMatrix(3, 10);
    
    A.beginRow(0);
    A.addEntry(0, 4.0);
    A.addEntry(1, 1.0);
    
    A.beginRow(1);
    A.addEntry(0, 1.0);
    A.addEntry(1, 4.0);
    A.addEntry(2, 1.0);
    
    A.beginRow(2);
    A.addEntry(1, 1.0);
    A.addEntry(2, 4.0);
    
    A.finalize();
    
    // b = [1, 2, 3]
    const b = new Float32Array([1, 2, 3]);
    const x0 = new Float32Array(3); // Start at zero
    
    const result = this.solve(A, b, x0, 50, 1e-6);
    
    console.log('✅ CG Test Results:');
    console.log(`  Solution: [${result.x[0].toFixed(4)}, ${result.x[1].toFixed(4)}, ${result.x[2].toFixed(4)}]`);
    console.log(`  Iterations: ${result.iterations}`);
    console.log(`  Residual: ${result.residual.toFixed(8)}`);
    console.log(`  Converged: ${result.converged}`);
    
    // Expected solution: x ≈ [0.1429, 0.4286, 0.6429]
    const expected = [0.1429, 0.4286, 0.6429];
    const error = Math.sqrt(
      (result.x[0] - expected[0]) ** 2 +
      (result.x[1] - expected[1]) ** 2 +
      (result.x[2] - expected[2]) ** 2
    );
    
    if (error < 1e-3 && result.converged) {
      console.log('✅ CG test PASSED');
      return true;
    } else {
      console.error('❌ CG test FAILED: error =', error);
      return false;
    }
  }
}
