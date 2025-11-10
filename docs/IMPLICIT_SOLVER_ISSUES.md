# Implicit Solver Issues - Handoff Document

**Date**: Nov 9, 2025, 4:24pm
**Status**: NOT CONVERGING - Needs expert attention

## Current Problem

The implicit SPH solver is not converging:
- Residual explodes to 9M+ (should be <0.001)
- Matrix becomes ~34% dense (should be <1%)
- 16 million non-zero entries
- Particles exhibit "dancing" behavior instead of smooth flow

## What Was Attempted

### Fix 1: Disabled Cohesion Jacobian
**Commit**: `ad38845`
**Rationale**: Cohesion is position-based, not velocity-based. Should not be in velocity Jacobian.
**Result**: Unknown (not tested yet)

### Fix 2: Improved Matrix Conditioning
**Commit**: `ad38845`
- Added 10% damping to diagonal: `diagonal = m * 1.1`
- Increased max iterations: 50 → 100
- Relaxed tolerance: 1e-4 → 1e-3
**Result**: Unknown (not tested yet)

### Fix 3: NaN Guards
**Commit**: `f6a5c0e`
- Added NaN checks in solver input/output
- Prevents NaN cascade
**Status**: Working

## Root Cause Analysis

### Theory 1: Cohesion in Implicit Solver (MOST LIKELY)
The original implementation included cohesion forces in the implicit Jacobian:
```javascript
// Line 264-292 in ImplicitSolver.js
const k = 20000.0; // Extreme stiffness
const offDiag = -dt2 * k;
```

**Problem**: 
- Cohesion force is F = -k(xi - xj), which depends on POSITION
- Implicit solver computes Jacobian ∂F/∂v (force w.r.t VELOCITY)
- This is mathematically incorrect!
- Creates massive matrix entries that don't represent the actual physics

**Solution**: Cohesion should be handled explicitly in the force computation, NOT in the implicit Jacobian.

### Theory 2: Matrix Size Explosion
With N particles and ~50 neighbors each:
- DOF = 2N (x,y per particle)
- Expected non-zeros: 2N × 50 × 4 = 400N
- Actual non-zeros: 9,180,761 for N=2600 → 3531 per particle!

This suggests the Jacobian computation is adding far more entries than necessary.

### Theory 3: Poor Preconditioner
The current preconditioner is simple diagonal (Jacobi):
```javascript
M_inv[i] = 1.0 / diag[i];
```

For stiff systems, this may be insufficient. Consider:
- Incomplete Cholesky (IC)
- Algebraic Multigrid (AMG)
- Block preconditioners

## Recommended Next Steps

### Immediate (High Priority)
1. **Verify cohesion is disabled** in implicit solver
   - Check `this.implicitCohesion = false` is actually working
   - Add debug log to confirm skipping cohesion Jacobian block

2. **Add matrix statistics logging**
   ```javascript
   console.log('Matrix stats:', {
     size: DOF,
     nnz: actualNonZeros,
     density: (actualNonZeros / (DOF * DOF)) * 100,
     avgEntriesPerRow: actualNonZeros / DOF
   });
   ```

3. **Test with very few particles** (10-20)
   - Check if solver converges with small system
   - If yes, problem is scaling
   - If no, problem is fundamental

### Medium Term
1. **Implement better preconditioner**
   - Start with incomplete LU (ILU)
   - Profile to confirm it helps

2. **Reduce Jacobian entries**
   - Only add entries above threshold (e.g., |J_ij| > 1e-6)
   - Limit neighbor radius for Jacobian (smaller than force radius)

3. **Consider alternative formulation**
   - Pressure projection method (like Stable Fluids)
   - Position-based dynamics (PBD) for cohesion
   - Hybrid explicit/implicit (implicit for viscosity only)

### Long Term (Alternative Approaches)
If implicit solver remains unstable:

1. **Explicit Timestepping with Substeps**
   - Multiple small timesteps per frame
   - Simpler, more stable
   - Cost: 2-4x slower

2. **GPU Acceleration**
   - Move SPH to compute shaders
   - Can handle 10,000+ particles at 60fps
   - Complexity: High

3. **Simplified Physics Model**
   - Use larger damping
   - Reduce cohesion strength
   - Accept weaker blobs

## Current Code State

### Working
- ✅ Painting (ink and oil)
- ✅ Material selection
- ✅ SPH particle spawning
- ✅ NaN guards prevent crashes
- ✅ Explicit integration (fallback)

### Broken
- ❌ Implicit solver convergence
- ❌ Strong cohesion (blobs may be weak)
- ❌ Smooth blob motion at high particle counts

### Files Modified (Last Session)
```
src/simulation/sph/ImplicitSolver.js  - Solver fixes attempted
src/simulation/sph/SPHOilSystem.js    - Force tuning
src/controller.js                      - Modulo bug fix
src/simulation.js                      - Debug logging
src/simulation/layers/WaterLayer.js   - Debug logging
src/simulation/layers/OilLayer.js     - Material routing
```

## Testing Procedure

After making changes:

1. **Hard refresh** (Cmd+Shift+R)
2. Paint 5-10 mineral oil splats (key 2)
3. Check console for:
   ```
   🔧 Implicit solve: [iterations] iters, residual=[value]
   ✅ Sparse matrix built: [size]×[size], [nnz] non-zeros
   ```
4. Expected good values:
   - Iterations: <20
   - Residual: <0.01
   - Matrix density: <5%
   - Particles: smooth, cohesive motion

## References

### Papers
- "Implicit Surface Tension for SPH" (Jeske et al. 2023)
- "Stable Fluids" (Stam 1999)
- "Position Based Dynamics" (Müller et al. 2007)

### Code
- `/src/simulation/sph/ImplicitSolver.js` - Jacobian construction
- `/src/simulation/sph/SPHOilSystem.js` - Physics parameters
- `/src/simulation/sph/ConjugateGradient.js` - Linear solver

## Apology

I made several mistakes during this session:
1. Added bad property check breaking all painting
2. Made modulo arithmetic error (% 1 always equals 0)
3. Initially tried to disable solver instead of fixing it

The implicit solver issue is complex and may require deeper linear algebra expertise than I have. Good luck to the next engineer.

---
**Status**: Ready for handoff
**Next Engineer**: Please start by verifying matrix statistics with cohesion disabled.
