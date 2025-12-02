# Alcohol Physics Implementation - TODO

## Current State (Nov 9, 2025)
Alcohol is painted to Grid layer but **does NOT yet affect SPH particle physics**.

### What Works Now:
- ✅ Alcohol doesn't blank the screen (rendering fix)
- ✅ Alcohol paints to gridTexture with low strength (0.15)
- ✅ Alcohol dissipates over time (0.97 dissipation rate)
- ✅ Preset changes parameters (surfaceTension, agitation, etc.)

### What Doesn't Work Yet:
- ❌ **SPH particles don't read Alcohol presence**
- ❌ Oil blobs don't slide more where Alcohol is painted
- ❌ No local surface tension reduction
- ❌ No interaction between Grid layer and SPH layer

## Physics Implementation Plan

### Goal
When you paint Alcohol on SPH blobs (Mineral Oil, Syrup, Glycerine), they should:
1. **Reduce cohesion** locally (blob breaks apart more easily)
2. **Reduce surface tension** (spreads out, becomes more fluid)
3. **Increase mobility** (slides around more easily)
4. **Create "slippery zones"** that persist for a few seconds

### Implementation Steps

#### 1. Sample Grid Layer in SPH Physics
**File**: `src/simulation/sph/SPHOilSystem.js`

In the SPH update loop, sample the Alcohol grid texture:
```javascript
// For each particle
const alcoholStrength = sampleGridTexture(particle.x, particle.y);

// Modify forces based on Alcohol presence
if (alcoholStrength > 0.01) {
  // Reduce cohesion locally
  const cohesionMultiplier = 1.0 - (alcoholStrength * 0.7); // 70% reduction at max
  particle.cohesionForce *= cohesionMultiplier;
  
  // Increase drag (makes it slide on water)
  const dragMultiplier = 1.0 + (alcoholStrength * 2.0); // 3x drag at max
  particle.waterDrag *= dragMultiplier;
}
```

#### 2. Add Grid Texture Sampling to SPH
**File**: `src/simulation/sph/SPHOilSystem.js`

```javascript
// In update() method, pass Grid texture to SPH
update(dt, gridTexture) {
  // ... existing code ...
  
  // Sample grid texture to get Alcohol concentration
  this.applyAlcoholEffects(gridTexture);
}

applyAlcoholEffects(gridTexture) {
  for (let i = 0; i < this.particleCount; i++) {
    const p = this.particles[i];
    
    // Convert world coords to UV coords
    const u = (p.x / (this.containerRadius * 2)) + 0.5;
    const v = (p.y / (this.containerRadius * 2)) + 0.5;
    
    // Sample grid texture (need GPU readback or shader-based approach)
    const alcoholLevel = this.sampleTexture(gridTexture, u, v);
    
    // Modify particle properties
    p.cohesionScale = 1.0 - (alcoholLevel.a * 0.7);
    p.frictionScale = 1.0 + (alcoholLevel.a * 2.0);
  }
}
```

#### 3. Update OilLayer to Pass Grid Texture
**File**: `src/simulation/layers/OilLayer.js`

In `updateSPHLayer()`:
```javascript
// Pass grid texture to SPH system
if (this.hasGridContent) {
  this.sph.update(dt, waterVelocityTexture, this.gridTexture1);
} else {
  this.sph.update(dt, waterVelocityTexture, null);
}
```

#### 4. GPU-Based Sampling (Preferred)
Instead of CPU readback, do this in the SPH shader:
```glsl
uniform sampler2D u_alcoholTexture;

void main() {
  // ... existing SPH code ...
  
  // Sample Alcohol concentration at particle position
  vec2 uv = (particlePos.xy / containerRadius) * 0.5 + 0.5;
  float alcoholLevel = texture(u_alcoholTexture, uv).a;
  
  // Reduce cohesion where Alcohol is present
  float cohesionMult = 1.0 - (alcoholLevel * 0.7);
  cohesionForce *= cohesionMult;
  
  // Increase water coupling (makes it slide)
  float couplingMult = 1.0 + (alcoholLevel * 1.5);
  waterCouplingForce *= couplingMult;
}
```

## Visual Feedback (Optional)

If you want to see Alcohol effect visually:
1. Render Grid layer with very subtle color (current: invisible)
2. Show shimmer/distortion where Alcohol is
3. Fade out over time (already implemented via dissipation)

## Testing Plan

1. Paint Mineral Oil blob
2. Paint Alcohol on/near blob
3. **Expected**: Blob should spread out, become more fluid, slide around
4. **Expected**: Effect fades as Alcohol dissipates

## Effort Estimate
- **Shader-based (GPU)**: ~2 hours
  - Add uniform to SPH shaders
  - Sample grid texture
  - Modify forces
  - Test and tune
  
- **CPU-based**: ~4 hours
  - Implement texture readback
  - Sample per-particle
  - Performance optimization
  - Test and tune

## Recommendation
Use **GPU-based approach** - faster, cleaner, more scalable.
