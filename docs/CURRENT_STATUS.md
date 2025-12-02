# Liquid Light Sim - Current Status

**Date**: December 1, 2025  
**Version**: SPH Phase 2.3 (Rendering Improvements)  
**Status**: Smoother blob rendering, reduced jitter

---

## ⚡ Latest Session (Dec 1, 2025)

Focused on improving oil blob visual quality and reducing physics jitter.

### Rendering Improvements
- ✅ **Metaball Shader Rewrite**: Quintic falloff function, 12×3 sampling pattern, power-curve alpha for soft organic edges
- ✅ **Particle Splat Upgrade**: Organic gaussian+polynomial falloff, density-based spread adjustment
- ✅ **New Blur Pass**: Edge-adaptive 9-tap Gaussian post-blur (`oil-blur.frag.glsl`)
- ✅ **Reduced Pixelation**: Wider transition zones and smoother thresholds

### Physics Stability
- ✅ **Reduced Jitter**: Lowered cohesion (0.25) and repulsion (0.8) forces
- ✅ **Heavy Damping**: Inter-particle viscosity 2.0, friction 0.95, quadratic damping 6.0
- ✅ **Speed Limits**: Max speed cap 0.3, force clamp 2.0

---

## ✅ What's Working

### Grid-Based Materials (Ink, Alcohol)
- Full Eulerian fluid dynamics
- Rotation and forces working perfectly
- Persistent, no decay issues
- 60fps performance

### SPH Materials (Mineral Oil, Syrup, Glycerine)
- **Blob Physics**: Lennard-Jones style cohesion/repulsion with heavy damping
- **Grid Coupling**: Rotation support via water velocity sampling
- **Rendering Pipeline**: Particle splat → Metaball → Blur → Composite
- **Blob Behavior**: 
  - Particles spawn as single dense blobs
  - Blobs can thin and split when stretched
  - Distant blobs stay separate
  - Calm, stable motion (minimal jitter)
- No crashes or NaN issues
- Rotation works (blobs swirl with A/D keys)

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

## 🔧 Current Parameters

### Blob Physics (SPHOilSystem.js)
```javascript
blobCohesion: 0.25        // Gentle attraction
blobRepulsion: 0.8        // Soft repulsion  
blobInteractionRadius: 0.16
blobFriction: 0.95        // Heavy damping
interParticleViscosity: 2.0
quadraticDampingK: 6.0
maxSpeedCap: 0.3
forceClampMax: 2.0
particleSpriteRadius: 100.0
```

### Rendering (simulation.js)
```javascript
metaballBlobThreshold: 0.4
metaballRadius: 25.0
metaballBulginess: 2.5
oilBlurRadius: 2.0
oilBlurStrength: 0.4
```

---

## 🚀 Next Steps

### Potential Improvements
1. **WebGPU Compute**: Move SPH physics to GPU for 10x+ particle counts
2. **Material-specific tuning**: Different cohesion/damping per material
3. **Better blob merging**: Smoother visual transitions when blobs combine
4. **Performance profiling**: Identify bottlenecks at high particle counts

### Known Limitations
- CPU-bound SPH limits particle count (~5000 max for 60fps)
- Blob edges can still appear slightly pixelated at low particle density
- No inter-material interactions (oil doesn't push ink)

---

**Status**: Oil blob rendering significantly improved with softer edges and reduced jitter. Physics is stable and calm. Ready for further visual polish or WebGPU acceleration.
