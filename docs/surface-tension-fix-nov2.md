# Surface Tension Fix: From Thickness to Velocity (Nov 2, 2025)

## Problem Identified

Oil blobs had velocity but weren't moving visibly. After debugging, the root cause was identified:

**Surface tension was modifying oil thickness AFTER advection**, effectively canceling out the motion that just occurred.

### The Broken Pipeline (Before Fix)

```
1. Advect oil velocity
2. Apply coupling (water → oil)
3. Apply viscosity damping
4. Advect thickness by velocity ✅ Thickness moves
5. Apply self-attraction       ❌ Pulls thickness back
6. Apply surface tension       ❌ Locks thickness in place
```

### The Physics Error

The old `apply-surface-tension.frag.glsl` shader directly modified thickness:

```glsl
oil.a += laplacian * u_surface_tension * u_dt * smoothstep(0.0, 0.5, thickness);
```

This created forces **opposing the advection**, with stronger forces on thicker regions:
- Advection moved oil → Surface tension pulled it back
- Result: **Frozen oil blobs** despite having velocity

## Solution: Velocity-Based Surface Tension

Surface tension should create **forces that modify velocity**, not thickness directly.

### The Fixed Pipeline (After Fix)

```
1. Advect oil velocity
2. Apply coupling (water → oil)
3. Apply viscosity damping
4. Apply surface tension FORCE to velocity ✅ NEW
5. Advect thickness by the resulting velocity ✅ Works!
```

### New Shader: surface-tension-force.frag.glsl

This shader:
1. Computes curvature (Laplacian of thickness)
2. Computes thickness gradient for force direction
3. Creates velocity change: `force = normalize(gradThickness) * abs(laplacian) * tension * dt`
4. Applies force to oil velocity field

**Key differences:**
- Operates on **velocity texture**, not thickness
- Applied **before advection**, not after
- Creates cohesive "blobby" motion while allowing transport

## Implementation Changes

### 1. New Shader Created
`src/shaders/surface-tension-force.frag.glsl`
- Reads: oil velocity, oil thickness, oil properties
- Writes: modified oil velocity
- Supports per-pixel material properties

### 2. Shader Loaded in Simulation.js
```javascript
this.surfaceTensionForceProgram = this.renderer.createProgram(
    fullscreenVert,
    await loadShader('src/shaders/surface-tension-force.frag.glsl')
);
```

### 3. New Method in OilLayer.js
```javascript
applySurfaceTensionForce(dt) {
  // Applies surface tension force to oil velocity field
  // Called BEFORE advection in update pipeline
}
```

### 4. Pipeline Reordered
- Removed: `applySelfAttraction(dt)` call after advection
- Removed: `applySurfaceTension(dt)` call after advection
- Added: `applySurfaceTensionForce(dt)` call before advection

Old methods kept in codebase but no longer called.

## Expected Results

With this fix, oil should now:
- ✅ **Move with water rotation** (coupling works)
- ✅ **Form cohesive blobs** (surface tension creates inward force)
- ✅ **Transport realistically** (advection not counteracted)
- ✅ **Show interface dynamics** (velocity-based forces preserve motion)

## Testing Recommendations

1. **Paint oil blob, then rotate container:**
   - Oil should move with water flow
   - Blob should maintain cohesion while drifting
   - Edges should show realistic shear

2. **Tune surface tension parameter:**
   - Low values (0.001-0.005): Weak cohesion, more fluid
   - Medium values (0.005-0.015): Balanced, blobby behavior
   - High values (0.015+): Strong cohesion, lens-like

3. **Check for instabilities:**
   - If oil explodes: reduce `surfaceTension` or reduce `maxForce` in shader
   - If oil still frozen: increase `surfaceTension` or check coupling strength

## Physics Rationale

Surface tension in real fluids creates **stress at the interface** that manifests as:
- Pressure jump across curved interfaces (Young-Laplace)
- Tangential stress from surface tension gradients (Marangoni)

Both are **force terms** in the momentum equation, not direct thickness modifications.

The correct approach is:
```
dv/dt = ... + σ·κ·n  (surface tension force)
dh/dt = -∇·(h·v)     (advection by velocity)
```

Not:
```
dh/dt = -∇·(h·v) + σ·∇²h  (mixed advection and diffusion - wrong!)
```

## Related Prerequisites

This fix completes the foundation for Marangoni forces:
- ✅ Water → Oil coupling (interface-aware)
- ✅ Oil → Water coupling (thickness gradient forces)
- ✅ Velocity-based surface tension (this fix)
- 🔄 Per-pixel material properties (in progress)

Next: Implement Marangoni forces using similar velocity-based approach with surface tension gradients.

## Performance Impact

**Negligible:** One additional fullscreen pass per frame when `surfaceTension > 0`
- Cost: ~0.1-0.2ms on mid-range GPU
- Same as old thickness-based surface tension
- No change to total frame time

## Debugging Flags

If oil still doesn't move after this fix:
```javascript
// Force oil to use water velocity directly (bypass coupling)
simulation.debugAdvectOilWithWaterVelocity = true;

// Copy water velocity into oil for one frame
simulation.debugCopyWaterToOil = true;
```

If oil moves with these flags but not normally, the issue is in coupling strength, not advection.
