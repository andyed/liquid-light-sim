# Frozen Oil Fix - Summary (Nov 3, 2025)

## Problem
Oil blobs had velocity in the simulation but were not visibly moving.

## Root Cause
The oil velocity pipeline was in the wrong order. The self-advection step was running *before* the water-oil coupling step. This caused the oil's velocity to be zeroed out at the beginning of each frame, as it was advecting a zero-velocity field.

## Solution
Reorder the oil velocity pipeline to run the coupling step *before* the self-advection step. This ensures that the oil has some velocity from the water before it's advected, preserving its momentum.

## Changes Made

### 1. Pipeline Reorder
**File**: `src/simulation/layers/OilLayer.js`
- **Moved**: The water-oil coupling step now runs before the self-advection step.

## New Pipeline Order

```
OilLayer.update(dt):
  1. Apply water→oil coupling
  2. Advect oil velocity by itself
  3. Apply viscosity damping
  4. Apply surface tension FORCE to velocity
  5. Advect oil thickness by velocity
  6. Oil smoothing (optional)
  7. Overflow control
```

## Testing Instructions

1. **Start the application**: Open `index.html` in browser
2. **Select material**: Choose "Mineral Oil" or "Glycerine"
3. **Paint oil blob**: Click and drag to create oil
4. **Rotate container**: Click "Rotate" button or use mouse
5. **Observe**: Oil should now move with water while maintaining cohesion

### Expected Behaviors
- ✅ Oil moves when container rotates
- ✅ Blobs maintain cohesive shapes
- ✅ Interface shows realistic shear
- ✅ No frozen edges or locked regions

### If Oil Still Doesn't Move
Try debug flags in browser console:
```javascript
// Force oil to use water velocity directly
simulation.debugAdvectOilWithWaterVelocity = true;

// If this makes it move, coupling strength is too low
// Increase: simulation.couplingStrength = 0.01;
```

## Technical Details

### Why This Works
In real fluids, surface tension creates **stress at interfaces** that appears as a **force term in the momentum equation**:

```
dv/dt = ... + σ·κ·n  ← Surface tension force
dh/dt = -∇·(h·v)     ← Advection
```

The old approach mixed these incorrectly:
```
dh/dt = -∇·(h·v) + σ·∇²h  ← WRONG: advection + diffusion
```

### Performance
No performance change - same number of shader passes, just reordered.

## Next Steps

With this foundation working:
1. **Test and tune**: Adjust `surfaceTension` values per material
2. **Add debug view**: Oil velocity visualization (HSV like water)
3. **Implement Marangoni**: Surface tension gradient forces (uses same approach)
4. **Per-pixel materials**: Enable multiple oil types simultaneously

## Files Modified
- ✅ `src/shaders/surface-tension-force.frag.glsl` (created)
- ✅ `src/simulation.js` (1 addition)
- ✅ `src/simulation/layers/OilLayer.js` (method added, pipeline reordered)
- ✅ `docs/surface-tension-fix-nov2.md` (created)
- ✅ `docs/v1.0-end-game.md` (updated status)

## Rollback Instructions
If this causes issues, revert by:
1. Remove line 237 in OilLayer.js: `this.applySurfaceTensionForce(dt);`
2. Add back after advection: `this.applySelfAttraction(dt);` and `this.applySurfaceTension(dt);`
3. Comment out shader loading in simulation.js lines 215-219

But the new approach is physically correct, so issues likely indicate parameter tuning needed, not a fundamental problem.
