# SPH + Implicit Surface Tension: Implementation Plan for True Blob Formation

**Date**: Nov 8, 2025  
**Status**: POST-EXPERIMENT - Grid-based limits confirmed  
**Goal**: Achieve stable, cohesive liquid-liquid blobs via SPH + Implicit Cohesion Force

---

## Executive Summary

### What We Learned (The Hard Way)

Our radical blob formation experiment **empirically confirmed** the technical analysis in `Analyzing Liquid Blobbing Simulation Project.md`:

**Grid-Based Eulerian (Current System):**
- ❌ Explicit time integration → CFL stability constraint
- ❌ High surface tension (800-1500) → horizontal banding/tearing
- ❌ Oil tears into sheets faster than surface tension consolidates
- ❌ Sub-stepping creates artifacts without solving fundamental problem
- ✅ Great for thin films, smoke, ink diffusion
- ❌ **CANNOT** do cohesive blobs with high surface tension

**The Analysis Was Right:**
> "High interfacial tension forces are computationally stiff. In explicit time integration schemes, high σ necessitates extremely small timesteps to maintain stability (CFL condition). The user is likely forced to choose a low, unrealistically small σ value to maintain real-time performance, effectively killing the cohesive, blobby aesthetic."

This is **exactly** what happened. We're at the grid-based ceiling.

---

## Alignment with External Analysis

### Key Recommendations We Agree With:

1. **SPH is the Right Architecture** ✅
   - Lagrangian (mesh-free) → natural topology changes
   - O(N log N) with spatial hashing → GPU-friendly
   - Handles merging/splitting natively
   - Synergizes perfectly with MetaBalls (we already have this!)

2. **Implicit Surface Tension is Mandatory** ✅
   - Explicit CSF (Continuum Surface Force) fails at high σ
   - Implicit Cohesion Force (IPF) = molecular-like pairwise attraction
   - Linearized backward Euler → bypasses CFL constraints
   - Allows arbitrarily high σ without instability

3. **Temperature-Dependent Dynamics** ✅
   - ρ(T): Hot oil rises (less dense), cool oil sinks (more dense)
   - Creates chaotic convection cycle (lava lamp effect)
   - We already have heat lamp system - just needs to affect density!

4. **MetaBall Visualization (Already Working!)** ✅
   - We have the shader infrastructure
   - Need to tune blending parameter (P < 1.0 for bulgy joining)
   - SPH density field → MetaBall implicit field (mathematical consistency)

---

## Complexity Assessment

### Complexity Level: **MAJOR** (8-12 weeks full-time)

This is not a tweak - it's an **architectural rewrite** of the oil simulation layer.

**What Stays:**
- ✅ Water layer (grid-based Eulerian is fine for water)
- ✅ MetaBall rendering shader (already perfect!)
- ✅ Heat lamp system (expand for ρ(T))
- ✅ UI, controls, materials
- ✅ Marangoni effect
- ✅ Dynamic lighting

**What Gets Replaced:**
- ❌ Grid-based oil advection
- ❌ Grid-based surface tension
- ❌ Oil velocity field
- ❌ Grid smoothing/cohesion hacks

**What Gets Built (New):**
- 🔨 SPH particle system (GPU compute shaders)
- 🔨 Spatial hashing (O(N log N) neighbor search)
- 🔨 Implicit surface tension solver
- 🔨 Pressure projection (incompressibility)
- 🔨 Multiphase coupling (oil ↔ water buoyancy)
- 🔨 Temperature field + ρ(T) mapping

---

## Three-Phase Implementation Plan

### **PHASE 1: SPH Foundation** (3-4 weeks)
**Goal**: Replace grid oil with particle oil, basic physics working

#### Step 1.1: Core SPH Infrastructure
```javascript
// New file: src/simulation/sph/SPHOilSystem.js
class SPHOilSystem {
  constructor(maxParticles = 50000) {
    this.particles = new Float32Array(maxParticles * 8); // [x, y, vx, vy, density, pressure, temperature, phase]
    this.spatialHash = new SpatialHashGrid();
    this.computeShader = null; // WebGL2 compute or transform feedback
  }
}
```

**Tasks:**
- [ ] Particle data structure (position, velocity, density, pressure, temp, phase)
- [ ] Spatial hash grid for O(N log N) neighbor queries
- [ ] GPU compute shader setup (WebGL2 compute or transform feedback)
- [ ] Basic SPH density calculation (smoothing kernel: Poly6 or Cubic Spline)
- [ ] Particle spawning from paint/splat events

**Validation**: Paint creates particles, they fall with gravity

---

#### Step 1.2: Pressure Solver (Incompressibility)
```glsl
// Weakly Compressible SPH (WCSPH) - simpler than full implicit
// Tait equation of state: p = B * ((ρ / ρ₀)^γ - 1)
float computePressure(float density, float restDensity) {
    const float B = 1000.0; // Stiffness
    const float gamma = 7.0;
    return B * (pow(density / restDensity, gamma) - 1.0);
}
```

**Tasks:**
- [ ] Density-to-pressure conversion (Tait equation or PCISPH)
- [ ] Pressure force calculation (symmetric formulation)
- [ ] Incompressibility constraint enforcement

**Validation**: Oil particles maintain constant density, don't compress

---

#### Step 1.3: Basic Forces
```glsl
// SPH force accumulation per particle
vec2 totalForce = vec2(0.0);
totalForce += computePressureForce(particle, neighbors);
totalForce += computeViscosityForce(particle, neighbors);
totalForce += gravity;
// Integrate: v += (F/m) * dt, x += v * dt
```

**Tasks:**
- [ ] Gravity
- [ ] Viscosity (symmetric formulation)
- [ ] Boundary conditions (container)
- [ ] Time integration (symplectic Euler or Verlet)

**Validation**: Oil particles flow smoothly, respect container bounds

---

### **PHASE 2: Implicit Surface Tension** (3-4 weeks)
**Goal**: HIGH σ cohesion without instability - THE CRITICAL STEP

#### Step 2.1: Implicit Cohesion Force (IPF)

Based on: *"Implicit Surface Tension for SPH Fluid Simulation"* (2023)

```glsl
// Inter-Particle Force: pairwise attraction between same-phase particles
vec2 cohesionForce = vec2(0.0);
for (neighbor in samePhaseNeighbors) {
    float dist = distance(particle.pos, neighbor.pos);
    if (dist < cohesionRadius) {
        vec2 dir = normalize(neighbor.pos - particle.pos);
        float magnitude = sigma * cohesionKernel(dist);
        cohesionForce += dir * magnitude;
    }
}

// IMPLICIT: Solve (I - dt * J) * Δv = dt * F_cohesion
// Where J = Jacobian of cohesion force
// This couples with pressure/viscosity in linear system
```

**Key Implementation Details:**
1. **Cohesion Kernel**: C(r) = 32 / (πh^9) * (h - r)^3 * r^3  (for r < h)
2. **Implicit Matrix**: Build sparse matrix A = M - dt * (J_pressure + J_viscosity + J_cohesion)
3. **Linear Solve**: Conjugate Gradient or Jacobi iteration (GPU-friendly)
4. **Coupling**: All forces solved together in single system

**Tasks:**
- [ ] Implement cohesion kernel function
- [ ] Build Jacobian matrix for cohesion force
- [ ] Sparse matrix data structure (CSR format)
- [ ] GPU-based linear solver (Conjugate Gradient)
- [ ] Couple with pressure projection

**Validation**: Can use σ = 1000+ without instability, particles form spheres

---

#### Step 2.2: High Surface Tension Tuning
```javascript
// Now we can finally use realistic values!
const materialProperties = {
  ink: { sigma: 800, mu: 0.4 },
  mineralOil: { sigma: 1200, mu: 0.6 },
  syrup: { sigma: 2000, mu: 1.2 }
};
```

**Tasks:**
- [ ] Tune σ per material (high values now stable!)
- [ ] Adjust cohesion radius for blob size control
- [ ] Balance σ vs. viscosity for aesthetic

**Validation**: Thick oil forms stable, cohesive spheres, resists tearing

---

### **PHASE 3: Multiphase + Temperature** (2-3 weeks)
**Goal**: Oil-water coupling + chaotic convection

#### Step 3.1: Buoyancy & Phase Interaction
```glsl
// Buoyancy force between oil (light) and water (heavy)
vec2 buoyancyForce = vec2(0.0);
for (neighbor in differentPhaseNeighbors) {
    float densityDiff = neighbor.density - particle.density;
    vec2 dir = vec2(0.0, 1.0); // Up
    buoyancyForce += dir * densityDiff * buoyancyStrength;
}
```

**Tasks:**
- [ ] Phase identifier (0 = water, 1 = oil)
- [ ] Buoyancy force based on density difference
- [ ] Coupling with grid-based water velocity (sample at particle positions)
- [ ] Drag force for velocity exchange

**Validation**: Oil rises through water when heated

---

#### Step 3.2: Temperature-Dependent Density
```glsl
// Temperature affects density: ρ(T) = ρ₀ * (1 - α * (T - T₀))
// α = thermal expansion coefficient
float computeDensity(float baseRho, float temp, float alpha) {
    return baseRho * (1.0 - alpha * (temp - roomTemp));
}

// Heat diffusion (simple!)
float heatDiffusion = 0.0;
for (neighbor in neighbors) {
    heatDiffusion += (neighbor.temp - particle.temp) * thermalConductivity;
}
particle.temp += heatDiffusion * dt;
```

**Tasks:**
- [ ] Temperature field per particle
- [ ] Heat source at bottom (from existing heat lamp)
- [ ] Heat diffusion between particles
- [ ] ρ(T) mapping: hot → less dense → rises
- [ ] Cooling at top (heat sink)

**Validation**: Convection cycle: hot oil rises → cools → sinks → reheats → rises

---

#### Step 3.3: MetaBall Visualization Tuning
```glsl
// Already have this! Just need to tune parameters
uniform float metaballP; // < 1.0 for bulgy joining (Ricci '73 method)

// Generalized distance function
float metaballField = 0.0;
for (particle in nearbyParticles) {
    float dist = distance(pos, particle.pos);
    float contribution = pow(particle.radius / dist, metaballP);
    metaballField += contribution;
}
```

**Tasks:**
- [ ] Add P parameter (blending exponent) to shader
- [ ] Tune P < 1.0 for exaggerated merging
- [ ] Map SPH density → MetaBall field strength
- [ ] Ensure consistency (high particle density = strong surface)

**Validation**: Blobs merge smoothly from distance, bulgy joining appearance

---

## Technical Architecture

### Data Flow: Paint → Particles → Physics → Rendering

```
USER PAINT
    ↓
SPAWN OIL PARTICLES (SPH)
    ↓
GPU COMPUTE LOOP:
  1. Spatial Hash Update (neighbor finding)
  2. Density Calculation (kernel sum)
  3. Pressure Solve (incompressibility)
  4. Force Accumulation:
     - Pressure gradient
     - Viscosity
     - IMPLICIT Cohesion (high σ!)
     - Buoyancy (vs water)
     - Gravity
  5. Linear System Solve (implicit forces)
  6. Velocity + Position Update
  7. Temperature Diffusion
  8. Boundary Handling
    ↓
METABALL FIELD GENERATION
    ↓
FRAGMENT SHADER (MetaBall rendering)
    ↓
FINAL COMPOSITE
```

---

## File Structure (New + Modified)

```
src/simulation/sph/
  ├── SPHOilSystem.js          // Main SPH controller
  ├── SPHParticle.js           // Particle data structure
  ├── SpatialHashGrid.js       // O(N log N) neighbor search
  ├── ImplicitSolver.js        // Linear system solver (CG)
  └── shaders/
      ├── sph-density.comp     // Density calculation
      ├── sph-forces.comp      // Force accumulation
      ├── sph-integrate.comp   // Position/velocity update
      └── sph-implicit.comp    // Implicit cohesion solve

src/simulation/layers/
  ├── OilLayer.js              // MODIFIED: Switch to SPH backend
  └── WaterLayer.js            // UNCHANGED: Keep grid-based

src/shaders/
  └── oil-metaball.frag.glsl   // MODIFIED: Add P parameter tuning
```

---

## Dependencies & Prerequisites

### WebGL2 Features Required:
- ✅ Transform feedback (for GPU particle updates)
- ✅ Floating-point textures (for particle data)
- ✅ Multiple render targets (MRT)
- ⚠️ Compute shaders (WebGPU would be better, but WebGL2 can work)

### External Libraries:
- Consider: **regl** for cleaner GPU compute management
- Consider: **gl-matrix** for vector math (if not already using)

### Learning Resources:
- Paper: "Implicit Surface Tension for SPH Fluid Simulation" (2023) - THE KEY PAPER
- NVIDIA GPU Gems 3: Chapter 7 (MetaBalls)
- "SPH Fluids in Computer Graphics" - Ihmsen et al. (2014)

---

## Risk Assessment

### HIGH RISK:
1. **Implicit Solver Convergence**: May need iteration tuning for stability
2. **GPU Memory**: 50k particles × 8 floats = 1.6MB (manageable, but watch it)
3. **Performance**: Need 60fps with 50k particles (requires optimization)

### MEDIUM RISK:
1. **Multiphase Coupling**: Oil-water interaction can be tricky
2. **Boundary Conditions**: Container walls need careful handling
3. **Temperature Field**: Heat diffusion can cause numerical instability

### LOW RISK:
1. **MetaBall Rendering**: We already have this working!
2. **UI Integration**: Just swap backend, keep interface
3. **Material Presets**: Same parameters, different backend

---

## Success Metrics

### Phase 1 Complete:
- [ ] 50k oil particles render at 60fps
- [ ] Particles maintain constant density
- [ ] Particles flow smoothly with viscosity
- [ ] Container boundaries work

### Phase 2 Complete:
- [ ] σ = 1000+ runs stably (no explosion)
- [ ] Oil forms spherical blobs
- [ ] Blobs resist tearing during rotation
- [ ] No horizontal banding artifacts

### Phase 3 Complete:
- [ ] Hot oil rises, cool oil sinks (ρ(T) working)
- [ ] Chaotic convection cycle (lava lamp!)
- [ ] Blobs merge smoothly with bulgy joining
- [ ] Natural split/coalescence behavior

---

## Timeline Estimate

**Total: 8-12 weeks** (assuming full-time equivalent)

| Phase | Duration | Complexity |
|-------|----------|------------|
| Phase 1: SPH Foundation | 3-4 weeks | High |
| Phase 2: Implicit Surface Tension | 3-4 weeks | **VERY HIGH** |
| Phase 3: Multiphase + Temperature | 2-3 weeks | Medium-High |
| Polish & Tuning | 1-2 weeks | Medium |

---

## Alternative: Hybrid Approach (Lower Complexity)

If full SPH is too ambitious, consider:

### Hybrid Grid-SPH System
- **Grid**: Keep for thin oil films (< 20% thickness)
- **SPH**: Use only for thick "hero" blobs (> 50% thickness)
- **Conversion**: Grid → SPH when oil consolidates
- **Rendering**: MetaBalls for SPH, grid composite for thin films

**Pros:**
- Leverages existing grid system
- Only SPH where blobs actually form
- Fewer particles needed

**Cons:**
- More complex architecture (two systems)
- Conversion layer adds complexity
- Still need implicit solver for SPH part

**Complexity: 5-7 weeks** (vs 8-12 for full SPH)

---

## Recommendation

**I recommend FULL SPH**, not hybrid, because:

1. **Clean Architecture**: One physics system, simpler to maintain
2. **Better Performance**: SPH is GPU-native, grid-based has lots of texture swaps
3. **The Paper Works**: "Implicit Surface Tension for SPH" (2023) proves this is doable
4. **We Have MetaBalls**: The hardest visualization part is done!
5. **Learning Investment**: You'll understand SPH deeply, applicable to many projects

The hybrid approach seems "safer" but actually creates more complexity in the conversion layer and still requires solving the hard implicit tension problem.

---

## Next Steps

### Immediate Actions:
1. **Read the key paper**: "Implicit Surface Tension for SPH Fluid Simulation" (2023)
2. **Prototype SPH basics**: Get 10k particles rendering with gravity
3. **Test spatial hashing**: Verify O(N log N) performance
4. **Decide**: Full SPH vs Hybrid (I vote Full)

### Questions to Answer:
- What particle count target? (50k? 100k?)
- WebGL2 transform feedback or WebGPU compute? (WebGPU is better but newer)
- Keep grid water or switch that too? (Keep grid for water)

---

## Conclusion

**The external analysis nailed it.** Our experiment confirmed every prediction:
- Grid-based explicit = CFL limit
- High σ with explicit = instability
- Need implicit solver for true blobs

**SPH + Implicit Cohesion Force is the ONLY path forward** for real blob physics.

Yes, it's a major rewrite. Yes, it's 8-12 weeks. But:
- ✅ It's the correct solution (not a hack)
- ✅ The math is proven (2023 paper)
- ✅ We have MetaBalls already (huge head start)
- ✅ It enables the TRUE lava lamp aesthetic

**This is the complexity++ needed for blobbiness.** No shortcuts exist.

Ready to commit to this? 🚀
