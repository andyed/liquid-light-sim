# Liquid Light Sim - Current Status

**Date**: November 8, 2025  
**Version**: SPH Phase 2.1 (Implicit Solver + Thermal)  
**Status**: Implicit Solver FIXED, needs rendering polish

---

## ⚡ Session Summary (Nov 8)

This session successfully addressed the root cause of the simulation's instability and lack of blob cohesion by repairing the SPH implicit solver. We also introduced a new thermal layer to add richer visual dynamics.

- ✅ **Implicit Solver Repaired**: Identified and fixed the fundamental mathematical error in the implicit solver's Jacobian and RHS calculations. The system is now numerically stable with high cohesion forces.
- ✅ **Implicit Cohesion Tuned**: Increased the implicit cohesion stiffness (`k=500`) and re-enabled the pressure Jacobian, resulting in much stronger "pull together" force for blobs.
- ✅ **Thermal Layer Activated**: Implemented a heat diffusion model for SPH particles.
- ✅ **Marangoni Effect Implemented**: Added a Marangoni force based on temperature gradients to create realistic surface swirling on blobs.
- ✅ **Thermal Visualization**: Encoded particle temperature into the rendering to create a "thermal glow" effect, adding visual detail and addressing color oversaturation issues.

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
- **Thermal Model**: Heat diffusion and Marangoni surface forces are active.
- Particles spawn and render with thermal glow.
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
smoothingRadius: 0.05
surfaceTension: 3000.0 // This is now effectively controlled by implicit 'k'
viscosity: 0.1
marangoniStrength: 5.0

// ImplicitSolver.js
implicitPressure: true
implicitViscosity: true
implicitCohesion: true
k: 500.0 // Stiffness coefficient for implicit cohesion
maxIterations: 50
tolerance: 1e-4
```

### Recommended Experiments
1. **Increase cohesion**: `k = 750.0`
2. **Tune Metaball Shader**: Adjust `u_blobThreshold` in `oil-metaball.frag.glsl`.
3. **Softer Metaball Edge**: Replace sharp `smoothstep` with a power function for alpha.

---

## 🚀 Next Steps

### Immediate (Rendering Polish)
1. **Fix Metaball Shader**: Implement a smoother falloff for the alpha channel to eliminate "pixel eaten" edges.
2. **Tune Particle Splat**: Adjust particle render size/shape to create a better density field for the metaball shader.
3. **Balance Cohesion & Rendering**: Fine-tune the physics `k` value and the visual `u_blobThreshold` together.

### Short-term (1-2 days)
4. Add debug visualization for particle temperature.
5. Expose `marangoniStrength` and `k` to the UI for real-time tuning.

### Long-term (Phase 3)
6. GPU acceleration (WebGPU compute shaders) for all SPH steps.
7. Temperature-dependent viscosity (hotter = thinner).
---

**Status**: Implicit physics are now functional. The remaining work is primarily in the visualization pipeline to correctly render the results.  
**Recommendation**: Commit current work, then focus entirely on fixing the `oil-metaball.frag.glsl` shader.
