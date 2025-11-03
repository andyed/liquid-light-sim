# Priority Sequence to v1.0 (Nov 2, 2025)

## Current Status

✅ **Working**:
- Oil moves with water (coupling fixed)
- Multi-material support enabled
- Per-pixel properties functional
- Oil→water coupling working
- No WebGL errors

❌ **Issues**:
1. **Oil shears into lines** - surface tension too weak to create cohesive blobs
2. **Ink overflow disabled** - code has `&& 1==0` check, never runs
3. Visual polish needed

---

## SEQUENCE 1: Fix Ink Overflow (Quick Win - 5 min)

**Problem**: Line 249 in `WaterLayer.js` has `&& 1==0` which disables overflow completely
```javascript
if ((sim._frameCounter % sim.occupancyEveryN) === 0 && 1==0) {  // ← Never runs!
```

**Fix**: Remove the `&& 1==0`:
```javascript
if ((sim._frameCounter % sim.occupancyEveryN) === 0) {
```

**Impact**: Ink will stop accumulating infinitely, maintaining visual clarity

**Priority**: **HIGH** - Simple fix, immediate improvement

---

## SEQUENCE 2: Strengthen Surface Tension for Blobs (30-60 min)

**Problem**: Current surface tension is too weak and uses wrong physics approach
- Values: `surfaceTension: 0.000001` (tiny!)
- Force clamped to `maxForce: 0.05` (low)
- Uses gradient direction (pulls toward thick) instead of minimizing perimeter

**Root Issue**: Real surface tension minimizes interface area (perimeter), not just pulls toward thick regions

### Option A: Increase Current Implementation Strength
**Quick fix** - just turn up the gain:
```glsl
// In surface-tension-force.frag.glsl:
float forceMag = abs(laplacian) * tension * smoothstep(0.0, 0.3, thickness) * 100.0; // Add multiplier
float maxForce = 0.5; // Increase from 0.05
```

And increase material values:
```javascript
surfaceTension: 0.0001  // 100x larger (was 0.000001)
```

**Pros**: Fast, might work well enough
**Cons**: Still not physically correct, may be unstable

### Option B: Implement Proper Interface Minimization (RECOMMENDED)
**Better physics** - pull perpendicular to gradient to shrink perimeter:

```glsl
// New approach in surface-tension-force.frag.glsl:
vec2 force = vec2(0.0);

if (gradMag > 1e-6 && thickness > 0.01) {
    // Surface tension acts perpendicular to gradient to minimize perimeter
    // Think: rubber band trying to shrink
    vec2 normalDir = normalize(gradThickness);
    vec2 tangentDir = vec2(-normalDir.y, normalDir.x); // Perpendicular
    
    // Curvature determines how much to pull inward
    // Positive laplacian (convex) = pull inward
    // Negative laplacian (concave) = already inward
    float curvature = laplacian / (gradMag + 1e-6);
    
    // Force magnitude: proportional to curvature and tension
    float forceMag = curvature * tension * thickness * 1000.0;
    
    // Pull inward along normal (shrink the blob)
    force = -normalDir * forceMag * u_dt;
    
    // Clamp for stability
    float maxForce = 1.0;
    if (length(force) > maxForce) {
        force = normalize(force) * maxForce;
    }
}
```

**Pros**: Physically correct, creates true blobby behavior
**Cons**: Takes more time to implement and tune

### Option C: Use Old Two-Pass Method (From v1.0 doc)
**Fallback** - revert to thickness-modifying approach but weaker:
- Keep old `apply-surface-tension.frag.glsl`
- Apply it BEFORE advection (not after)
- Use very low strength to avoid fighting advection

**Pros**: Known to work somewhat
**Cons**: Still fights advection, not ideal

**My Recommendation**: **Option B** - proper interface minimization. It's worth the extra hour.

**Priority**: **HIGH** - Core visual goal of v1.0

---

## SEQUENCE 3: Tune Multi-Material Parameters (15 min)

Now that motion works, balance the materials for visual variety:

```javascript
// In controller.js materials array:
{ name: 'Mineral Oil', 
  surfaceTension: 0.0001,     // Medium cohesion
  oilViscosity: 0.1,          // Very fluid
  couplingStrength: 0.5       // Responsive
},
{ name: 'Alcohol',
  surfaceTension: 0.00005,    // Weak cohesion (more shear)
  oilViscosity: 0.15,         // Light
  couplingStrength: 0.3       // Moderate
},
{ name: 'Syrup',
  surfaceTension: 0.0003,     // Strong cohesion (blobby)
  oilViscosity: 1.5,          // Thick
  couplingStrength: 0.4       // Good response
},
{ name: 'Glycerine',
  surfaceTension: 0.0004,     // Strongest cohesion
  oilViscosity: 1.8,          // Thickest
  couplingStrength: 0.45      // Very responsive
}
```

**Priority**: **MEDIUM** - Polish after core blob behavior works

---

## SEQUENCE 4: Visual Polish (30 min)

Based on v1.0 doc "Next Steps":

### 4a. Expose Thin-Film Controls
Add controller UI for:
- `thinFilmMin` (currently hardcoded 0.001)
- `thinFilmMax` (currently hardcoded 0.01)
- `thicknessGain` (pre-gamma multiplier)

### 4b. Add Oil Velocity Debug View
- Copy water velocity visualization (HSV hue = direction)
- Toggle with keyboard shortcut
- Shows coupling and rim shear visually

### 4c. Renderer Presets
Add to each material preset:
```javascript
{ name: 'Mineral Oil',
  // ... physics params ...
  // Rendering:
  oilAlphaGamma: 1.8,
  oilOcclusion: 0.15,
  refractStrength: 0.0075,
  fresnelPower: 3.0
}
```

**Priority**: **LOW** - After core behavior works

---

## SEQUENCE 5: Advanced Features (Future)

From v1.0 doc - defer these:

- Marangoni forces (surface tension gradients)
- Slip conditions at water-oil interface
- Material color-coded debug view
- Immiscible mode (materials don't blend)
- Unit tests for coupling and advection

---

## RECOMMENDED EXECUTION ORDER

### Week 1 (This Session):
1. ✅ **5 min**: Fix ink overflow (`&& 1==0` removal)
2. ✅ **60 min**: Implement proper surface tension (Option B)
3. ✅ **15 min**: Tune material parameters
4. ✅ **Test**: Paint multiple materials, rotate, verify blobby behavior

### Week 2:
5. **30 min**: Visual polish (thin-film controls, debug view)
6. **30 min**: Documentation and examples
7. **Ship v1.0**

---

## Why This Sequence?

1. **Ink overflow first**: Quick win, immediate visual improvement
2. **Surface tension next**: Core v1.0 goal, hardest problem
3. **Parameter tuning**: Requires working surface tension to evaluate
4. **Polish last**: Only worth doing once physics works

---

## Quick Diagnostic Before Starting

Run this to see current state:
```javascript
console.log("Surface tension:", simulation.surfaceTension);
console.log("Ink overflow enabled:", 
  simulation.water.applyOverflow.toString().includes('1==0') ? "NO ❌" : "YES ✅");
console.log("Frame counter:", simulation._frameCounter);
console.log("Occupancy check interval:", simulation.occupancyEveryN);
```

---

## Success Criteria (v1.0 Met)

After this sequence:
- ✅ Oil forms cohesive round blobs (not lines)
- ✅ Blobs maintain shape while drifting
- ✅ Ink doesn't accumulate infinitely
- ✅ Multiple materials coexist with different behaviors
- ✅ Stable, no crashes or artifacts
- ✅ Visually appealing and clear

That's v1.0 shipped! 🎉
