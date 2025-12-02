# Next Session Ideas

**Last Updated**: December 1, 2025

---

## 🎯 Potential Next Steps

### 1. WebGPU Compute Shaders (Performance)
Move SPH physics from CPU to GPU for massive particle count increase.
- Current limit: ~5000 particles at 60fps
- Target: 50,000+ particles
- Files to modify: `webgpu-sph.js`, new compute shaders

### 2. Material-Specific Tuning
Each oil type could have unique physics feel:
- **Mineral Oil**: Current defaults (balanced)
- **Syrup**: Higher viscosity, slower movement
- **Glycerine**: Smoother, more cohesive

### 3. Visual Polish
- Better blob merging transitions
- Thickness-based color saturation
- Core glow effects for thick blobs

### 4. Inter-Material Interactions
- Oil blobs push/displace ink
- Alcohol spreads/thins oil
- Heat transfer between materials

### 5. UI/UX
- Expose physics parameters to UI for live tuning
- Layer visibility toggles
- Particle count display

---

## 📊 Current Architecture

```
Water Layer (Grid) → velocity field
       ↓
Oil Layer (SPH particles) → samples water velocity
       ↓
Rendering: Splat → Metaball → Blur → Composite
```

---

## 🔧 Key Files

- `SPHOilSystem.js` - Particle physics
- `oil-metaball.frag.glsl` - Blob shape generation
- `sph-particle-splat.frag.glsl` - Particle rendering
- `oil-blur.frag.glsl` - Edge smoothing
- `oil-composite.frag.glsl` - Final compositing