# Oil Boundary Dissipation and Tint Fix (Nov 3, 2025)

## Problems Identified

### 1. Oil Dissipating at Container Edges
**Pattern Observed:**
```
Frame 0-540:   ✓ Stable (10000 thickness)
Frame 600:     ❌ Loss 0.1% per update
Frame 720:     ❌ Loss 0.9% per update  
Frame 840:     ❌ Loss 4.6% per update (accelerating!)
Frame 900:     Oil nearly gone
```

Oil was stable when first painted, but accelerated dissipation as it reached edges during rotation.

**Root Cause:** Soft boundary blending in `advection.frag.glsl`
```glsl
// Old code - lines 25-37
float softEdge = 0.015;
if (d > containerRadius - softEdge) {
    float blend = smoothstep(0.0, softEdge, overshoot);
    return mix(coord, target, blend); // MIXING with out-of-bounds coords
}
```

The `smoothstep` blend was **mixing oil with black background** at edges, diluting thickness.

### 2. Projection Artifacts at Edges
When painting oil near container boundary, diagonal light beams/projections appeared extending outside the circle.

**Root Cause:** Refraction sampling outside boundary
```glsl
// Old code - line 37
vec2 offset = -normalize(grad) * (u_refract_strength * th);
vec3 refracted = texture(u_scene, v_texCoord + offset); // Could sample outside!
```

Near edges, `v_texCoord + offset` went outside the circular container, sampling background.

### 3. Gray/Desaturated Oil Centers
Oil showed color at edges but appeared gray or white in thick centers. Fast painting worked, slow painting turned gray.

**Root Cause:** Quadratic tint suppression
```glsl
// Old code - line 75
float tintVisibility = (a * a) * (thinGate * thinGate);
```

With `a = 0.7` (70% thickness):
- Quadratic: `0.49 × 1.0 = 0.49` visibility
- Then `0.49 × 0.4 (tintStrength) = 0.196` → only 20% final color!

## Solutions Applied

### Fix 1: Hard Boundary Clamp
**File:** `src/shaders/advection.frag.glsl` lines 19-33

**Changed:**
```glsl
vec2 clampToCircle(vec2 coord) {
    float aspect = u_resolution.x / max(u_resolution.y, 1.0);
    vec2 r = coord - center;
    vec2 r_as = vec2(r.x * aspect, r.y);
    float d = length(r_as);
    
    // Hard clamp at boundary - no blending to prevent oil loss at edges
    if (d > containerRadius) {
        // Clamp to exact boundary position
        vec2 r_as_clamped = (r_as / max(d, 1e-6)) * containerRadius;
        vec2 r_uv_clamped = vec2(r_as_clamped.x / max(aspect, 1e-6), r_as_clamped.y);
        return center + r_uv_clamped;
    }
    return coord;
}
```

**Impact:**
- No more blending with out-of-bounds coordinates
- Oil at edges stays at boundary instead of dissipating
- Prevents the accelerating loss pattern

### Fix 2: Refraction Boundary Clamp
**File:** `src/shaders/oil-composite.frag.glsl` lines 20-37, 56-57

**Added:**
```glsl
// Circular container boundary
const vec2 center = vec2(0.5, 0.5);
const float containerRadius = 0.48;

// Clamp coordinate to circular boundary
vec2 clampToCircle(vec2 coord, vec2 resolution) {
    float aspect = resolution.x / max(resolution.y, 1.0);
    vec2 r = coord - center;
    vec2 r_as = vec2(r.x * aspect, r.y);
    float d = length(r_as);
    
    if (d > containerRadius) {
        vec2 r_as_clamped = (r_as / max(d, 1e-6)) * containerRadius;
        vec2 r_uv_clamped = vec2(r_as_clamped.x / max(aspect, 1e-6), r_as_clamped.y);
        return center + r_uv_clamped;
    }
    return coord;
}
```

**Changed:**
```glsl
// Refraction offset: bend toward normal (negative gradient)
vec2 offset = -normalize(grad + 1e-6) * (u_refract_strength * th);
vec2 refractCoord = clampToCircle(v_texCoord + offset, u_resolution);
vec3 refracted = texture(u_scene, refractCoord).rgb;
```

**Impact:**
- Refraction stays within circular boundary
- No more projection artifacts when painting at edges
- Cleaner visual appearance

### Fix 3: Linear Tint Visibility
**File:** `src/shaders/oil-composite.frag.glsl` lines 74-76

**Changed:**
```glsl
// Apply color tint from the oil itself - linear visibility for better color saturation
float tintVisibility = a * thinGate; // was (a*a)*(thinGate*thinGate), too weak
color = mix(color, oilRGB, tintVisibility * clamp(u_tint_strength, 0.0, 1.0));
```

**Impact:**
With `a = 0.7`, `thinGate = 1.0`, `tintStrength = 0.4`:
- Old: `0.49 × 1.0 × 0.4 = 0.196` → 20% oil color
- New: `0.7 × 1.0 × 0.4 = 0.28` → 28% oil color

With `a = 1.0` (full thickness):
- Old: `1.0 × 1.0 × 0.4 = 0.4` → 40% oil color
- New: `1.0 × 1.0 × 0.4 = 0.4` → 40% oil color (same)

The fix helps **partial thickness** oil show more color, addressing slow painting desaturation.

## Testing Results

### Boundary Dissipation
**Before:** Oil lasted ~15 seconds with accelerating loss  
**After:** Oil persists significantly longer, no edge acceleration

### Projection Artifacts  
**Before:** Painting at edges created diagonal light beams outside container  
**After:** Clean rendering, no projections

### Oil Color Saturation
**Before:** Slow painting = gray centers, fast painting = brief color  
**After:** All painting shows color, centers stay saturated

## Known Limitations

### 1. Oil Still Dissipates Over Time
Even with boundary fixes, oil gradually dissipates. This is likely from:
- Advection numerical diffusion (despite MacCormack)
- Other smoothing/damping in pipeline
- Needs further investigation

### 2. Tint Strength May Need Tuning
With linear visibility, `tintVisibility` maxes out at `1.0 × 0.4 = 0.4` (40%).

**To increase color saturation globally:**
```javascript
// src/renderer.js line 32
this.oilTintStrength = 0.6; // or 0.7, was 0.4
```

**Or per-material in controller.js:**
```javascript
materials: {
    syrup: {
        // ... other props
        oilTintStrength: 0.7 // override for this material
    }
}
```

### 3. Quadratic Was Intentional for Thin Oil
The original quadratic formula was designed to make **very thin oil** nearly invisible:
- Thin oil (a=0.2): Old `0.04`, New `0.2` → 5x more visible
- This might show unwanted thin oil "halos"

If thin oil becomes too visible, can adjust `thinGate` thresholds:
```glsl
// Stricter gating (higher minimum)
float thinGate = smoothstep(0.002, 0.015, th); // was (0.001, 0.01)
```

## Files Modified

1. `src/shaders/advection.frag.glsl`
   - Removed soft edge blending
   - Hard clamp at boundary

2. `src/shaders/oil-composite.frag.glsl`  
   - Added `clampToCircle()` helper
   - Clamp refraction sampling
   - Linear tint visibility

## Future Work

### Short Term
- Monitor oil dissipation with boundary fix
- Tune `oilTintStrength` if colors too weak
- Adjust `thinGate` if thin oil halos appear

### Medium Term
- Investigate remaining dissipation sources
- Consider per-material tint strength
- Add debug view for oil thickness to diagnose loss

### Long Term
- Perfect conservation (zero numerical diffusion)
- Material-specific boundary behavior
- Edge collision/bounce physics

## Commit
```
Fix oil boundary dissipation and rendering issues

- Hard clamp at boundary prevents edge dissipation
- Refraction clamp fixes projection artifacts  
- Linear tint visibility improves color saturation
```

---

**Session:** Nov 3, 2025 early morning  
**Status:** ✅ Committed  
**Next:** Monitor oil persistence and color saturation in user testing
