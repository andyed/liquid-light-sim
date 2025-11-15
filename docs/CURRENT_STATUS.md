# Liquid Light Sim - Current Status

**Date**: November 9, 2025  
**Version**: SPH Phase 2.2 (Blob Thinning & Splitting)  
**Status**: Blob thinning/splitting implemented, spawn behavior fixed

---

## ⚡ Session Summary (Nov 9)

This session implemented blob thinning and splitting behavior, allowing blobs to stretch, thin, and naturally divide into smaller blobs. We also fixed initial spawn behavior to create single dense blobs instead of multiple scattered particles.

- ✅ **Blob Thinning Detection**: Implemented density-based and neighbor-count-based detection to identify thin/stretched regions in blobs.
- ✅ **Reduced Cohesion in Thin Regions**: Cohesion forces are reduced (30% default) in thin regions, allowing natural stretching and necking.
- ✅ **Blob Splitting Detection**: Graph connectivity analysis detects when blobs naturally separate into disconnected clusters.
- ✅ **Zero Initial Velocity**: Particles spawn with zero velocity for immediate congealing into single dense blobs.
- ✅ **Continuous Accumulation**: Removed spawn cooldown - longer painting creates larger blobs.
- ✅ **Prevented Distant Merging**: Disabled long-range cohesion so blobs placed far apart stay separate.

---

## ✅ What's Working

### Grid-Based Materials (Ink, Alcohol)
- Full Eulerian fluid dynamics
- Rotation and forces working perfectly
- Persistent, no decay issues
- 60fps performance

### SPH Materials (Mineral Oil, Syrup, Glycerine)
- **Phase 1 Complete**: Basic SPH physics (density, pressure, viscosity, gravity)
- **Grid Coupling Complete**: Rotation support via water velocity sampling
- **Phase 2.1 Complete**: Implicit solver for cohesion/pressure/viscosity is STABLE and WORKING.
- **Phase 2.2 Complete**: Blob thinning and splitting system implemented.
- **Thermal Model**: Heat diffusion and Marangoni surface forces are active.
- **Blob Behavior**: 
  - Particles spawn as single dense blobs (zero initial velocity)
  - Continuous painting accumulates particles (bigger blobs with longer painting)
  - Blobs thin when stretched (reduced cohesion in thin regions)
  - Blobs split into smaller blobs when clusters disconnect
  - Distant blobs stay separate (long-range cohesion disabled)
- No crashes or NaN issues.
- Rotation works (blobs swirl with A/D keys).

---

## ⚠️ Known Issues

### SPH Blob Rendering & Decay
**Issue**: While the underlying physics is much improved, the visual representation is not yet perfect.
- **Pixelated Edges**: Blobs "get pixel eaten on all edges" as they decay instead of smoothly shrinking.
- **Rapid Dissolution**: Blobs still dissolve faster than desired.
- **Organic Shape**: The blobs lose their "cellular style circularish shapes" during decay.

**Root Cause**: The issue is now in the **visualization pipeline**, not the physics. The `oil-metaball.frag.glsl` shader, which converts the raw particle data into a smooth surface, is too aggressive in culling pixels at the edges, leading to a noisy, pixelated appearance.

**Next Steps**:
1. **Refine the Metaball Shader**: Replace the sharp thresholding with a smoother falloff function to create clean, anti-aliased edges.
2. **Tune Particle Rendering**: Adjust the particle splat size and shape in `sph-particle-splat.frag.glsl` to provide a better input for the metaball shader.
3. **Balance Physics vs. Rendering**: The cohesion force holds the blob together, while the metaball shader gives it its final shape. These two need to be tuned in tandem for the best effect.

### Blob Thinning & Splitting Tuning
**Status**: System is functional but may need parameter tuning.
- Thinning detection thresholds may need adjustment per material
- Split distance (2.0h) may need tuning for different blob sizes
- Cohesion reduction in thin regions (30%) may need material-specific values

---

## 📊 Architecture Summary

### Hybrid System: SPH + Grid

```
┌─────────────────────────────────────────────┐
│         WATER LAYER (Grid-Based)            │
│  - Navier-Stokes solver                     │
│  - Rotation forces                          │
│  - Velocity texture                         │
└─────────────┬───────────────────────────────┘
              │ Sample velocity
              ↓
┌─────────────────────────────────────────────┐
│         OIL LAYER (Material-Dependent)      │
│                                             │
│  SPH Path (Mineral Oil, Syrup, Glycerine): │
│    1. Sample water velocity                 │
│    2. Update SPH physics:                   │
│       - Spatial hash (O(N log N))          │
│       - Density, Pressure, Temperature      │
│       - Compute Forces (Cohesion, Marangoni)│
│       - Implicit solver:                    │
│         (M - dt*J) * v = M*v_old + dt*F    │
│    3. Render particles to texture           │
│    4. MetaBall pass (shape generation)      │
│                                             │
│  Grid Path (Ink, Alcohol):                  │
│    - Coupling → Advection → Diffusion      │
└─────────────────────────────────────────────┘
```

---

## 🎯 Success Metrics

### Phase 2.1 (Implicit Solver Fix)
- [x] Sparse matrix builds successfully
- [x] CG solver converges
- [x] Implicit integration replaces explicit
- [x] **σ = 3000 runs without instability**
- [x] **Blobs are significantly more cohesive**
- [ ] **Blobs resist tearing during rotation** ← BETTER, BUT NEEDS VISUAL POLISH
- [ ] **~60fps with 500 particles** ← PERFORMANCE IS GOOD

---

## 🔧 Tuning Parameters

### Current Settings
```javascript
// SPHOilSystem.js
smoothingRadius: 0.14
surfaceTension: 50.0
viscosity: 0.08 (material-dependent)
marangoniStrength: 5.0

// Blob Thinning & Splitting
enableThinning: true
enableSplitting: true
thinningThreshold: 0.6 (density ratio)
minNeighborsForThick: 8
cohesionReductionInThin: 0.3 (30% of normal)
splitDistance: 2.0h (connection distance for clusters)
minClusterSize: 3 particles

// Cohesion (material-dependent)
shortCohesion: 6.5 (Mineral Oil), 13.0 (Syrup), 8.5 (Glycerine)
longCohesion: 0.0 (DISABLED - prevents distant merging)
shortRadiusScale: 2.0 (short-range = 2h)
longRadiusScale: 4.0 (not used when longCohesion=0)

// Spawn Behavior
splatCooldownMs: 0 (no cooldown - continuous accumulation)
initialVelocity: 0 (zero - immediate congealing)
posCohesionBoostFrames: 120 (~2 seconds)
posCohesionBoostCoeff: 0.35
```

### Material-Specific Thinning/Splitting
- **Mineral Oil**: Easiest to thin/split (threshold: 0.7, reduction: 0.2, split: 2.0h)
- **Glycerine**: Medium (threshold: 0.6, reduction: 0.3, split: 2.5h)
- **Syrup**: Resists splitting (threshold: 0.5, reduction: 0.5, split: 3.0h)

### Recommended Experiments
1. **Tune thinning thresholds** per material for desired blob behavior
2. **Adjust split distance** if blobs split too easily or not easily enough
3. **Tune Metaball Shader**: Adjust `u_blobThreshold` in `oil-metaball.frag.glsl`.
4. **Softer Metaball Edge**: Replace sharp `smoothstep` with a power function for alpha.

---

## 🚀 Next Steps

### Immediate (Polish & Tuning)
1. **Tune Thinning/Splitting Parameters**: Fine-tune thresholds per material for desired blob behavior.
2. **Fix Metaball Shader**: Implement a smoother falloff for the alpha channel to eliminate "pixel eaten" edges.
3. **Tune Particle Splat**: Adjust particle render size/shape to create a better density field for the metaball shader.
4. **Balance Cohesion & Rendering**: Fine-tune the physics parameters and the visual `u_blobThreshold` together.

### Short-term (1-2 days)
5. Add debug visualization for blob clusters and thinning regions.
6. Expose thinning/splitting parameters to the UI for real-time tuning.
7. Add visual feedback for when blobs split (color change, particle count, etc.).

### Long-term (Phase 3)
8. GPU acceleration (WebGPU compute shaders) for all SPH steps.
9. Temperature-dependent viscosity (hotter = thinner).
10. Advanced neck detection for more realistic blob splitting.
---

**Status**: Blob thinning and splitting system is functional. Blobs now behave more organically - they can stretch, thin, and split into smaller blobs. Initial spawn creates single dense blobs, and continuous painting accumulates particles. The remaining work is primarily in the visualization pipeline and parameter tuning.  
**Recommendation**: Test blob behavior with different materials and rotation speeds. Tune thinning/splitting parameters based on desired visual effect.
