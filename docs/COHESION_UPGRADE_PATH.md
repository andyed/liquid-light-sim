# Cohesion Implementation: Simple → Implicit Upgrade Path

**Date**: November 8, 2025  
**Current**: Option C - Simple explicit cohesion  
**Future**: Option A - Implicit cohesion solver (if needed)

---

## Option C: Simple Cohesion (CURRENT)

### What We Just Implemented

```javascript
// Simple linear attraction force
const cohesionStrength = 5.0;
const cohesionRadius = h * 1.5;

for each particle i:
  for each neighbor j within cohesionRadius:
    direction = (j.pos - i.pos)  // Attractive
    distance = length(direction)
    strength = cohesionStrength * (distance / cohesionRadius)
    force = normalize(direction) * strength * mass
```

### Characteristics
- ✅ **Simple**: Single loop, explicit force
- ✅ **Fast**: O(N * neighbors) like pressure/viscosity
- ✅ **Tunable**: Single parameter (cohesionStrength)
- ❌ **Limited**: Can't go super high without instability
- ❌ **Explicit**: Time step dependent (CFL limit applies)

### Expected Behavior
- Particles attract each other
- Counteracts pressure spreading
- Blobs should stay more cohesive
- **Stable up to σ ~= 50-100** (not 1000+ like implicit)

### Tuning Guide
```javascript
cohesionStrength: 5.0   // Start conservative
  - Too low (< 2):   Blobs still spread apart
  - Good (5-10):     Balanced, gentle cohesion
  - Too high (> 20): Clumping, instability
  - MAX (< 50):      Explicit stability limit
```

---

## Option A: Implicit Cohesion (FUTURE)

### When to Upgrade

**Upgrade if you observe:**
- ❌ Blobs still spread too much (cohesionStrength maxed out)
- ❌ Instability when increasing strength
- ❌ Want very high surface tension (σ = 1000+)
- ❌ Need stable, bouncing droplets

**Stay with Option C if:**
- ✅ Blobs are cohesive enough at low strength
- ✅ No instability
- ✅ Good visual result
- ✅ Don't want 3-4 weeks of work

---

## Upgrade Implementation Plan

### Phase 2.1: Implicit Infrastructure (Week 1)

**Build linear solver**:
```javascript
// Conjugate Gradient solver
class ConjugateGradient {
  solve(A, b, x0, tolerance, maxIterations) {
    // Iterative linear system solver
    // Ax = b
  }
}
```

**Files to create**:
- `src/simulation/sph/ImplicitSolver.js`
- `src/simulation/sph/SparseMatrix.js`

---

### Phase 2.2: Jacobian Assembly (Week 2)

**Compute force derivatives**:
```javascript
// Jacobian of cohesion force: ∂F/∂x
buildCohesionJacobian(i, j, dx, dy, dist) {
  // Derivative of cohesion force w.r.t. position
  // Returns 2x2 matrix block
}
```

**System matrix**:
```
A = M - dt² * (J_pressure + J_viscosity + J_cohesion)
```

---

### Phase 2.3: Coupled Solve (Week 3)

**Implicit integration**:
```javascript
// Instead of: v_new = v + (F/m) * dt
// Solve:      (M - dt*J) * v_new = M*v + dt*F
```

**Enables**:
- ✅ σ = 1000+ (arbitrarily high)
- ✅ Large time steps
- ✅ Stable bouncing blobs

---

### Phase 2.4: Optimization (Week 4)

**GPU acceleration**:
- Move Jacobian assembly to GPU
- Sparse matrix operations on GPU
- Parallel CG solver

**Performance target**:
- 5000+ particles at 60fps
- Full implicit solve < 10ms

---

## Decision Matrix

| Feature | Simple (C) | Implicit (A) |
|---------|------------|--------------|
| **Implementation time** | ✅ Done! | ❌ 3-4 weeks |
| **Code complexity** | ✅ Low | ❌ Very high |
| **Max cohesion** | ⚠️ ~50 | ✅ 1000+ |
| **Stability** | ⚠️ CFL limited | ✅ Unconditional |
| **Performance** | ✅ Fast | ⚠️ Slower (solver) |
| **Blob quality** | ⚠️ Good | ✅ Excellent |

---

## Recommendation

### Try Simple First (NOW)
1. ✅ Test with cohesionStrength = 5
2. Tune up slowly (10, 20, 30...)
3. Find max stable value
4. Evaluate visual result

### Decide After Testing
- **Good enough?** → Done! Keep simple cohesion
- **Need more?** → Proceed to Phase 2

### Signs You Need Phase 2
- Blobs still spread even at max strength
- Instability when tuning up
- Want bouncing, merging droplets
- High surface tension is critical

---

## Current Parameters (Simple)

```javascript
// In computeForces():
cohesionStrength: 5.0      // START HERE
cohesionRadius: h * 1.5    // 1.5× smoothing radius

// Can tune up to ~50 before instability
// If need > 50, upgrade to implicit
```

---

## Next Steps

1. **Test simple cohesion** (now)
2. **Tune strength** (5 → 10 → 20)
3. **Evaluate result** (good enough?)
4. **Decide**: Keep simple OR upgrade to Phase 2

**Don't overbuild!** If simple works, save yourself 3-4 weeks. 🚀
