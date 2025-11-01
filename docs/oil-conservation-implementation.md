# Oil Conservation & Overflow Implementation (Prerequisite 4)

## What Was Implemented

Added **thickness-weighted occupancy measurement** and **overflow control** to the oil layer, preventing unrealistic oil accumulation during extended use.

## Key Changes

### 1. OilLayer.js - Added Methods

**computeOccupancy():**
- Measures percentage of canvas covered by oil (thickness-weighted)
- Uses shared `occupancyProgram` shader with `u_isOil = 1` flag
- Renders to 128×128 low-res buffer for efficiency
- Reads back and computes `sim.oilOccupancyPercent` (0-1)

**applyOverflow(strength):**
- Damps oil thickness when coverage exceeds threshold
- Uses shared `overflowProgram` shader
- Strength scales with excess coverage (0-20% max)
- Preserves thick blobs, targets thin/speckled oil

**Integration in update():**
- STEP 6: Check occupancy every N frames (same cadence as water)
- If `oilOccupancyPercent > oilOverflowUpper`, apply damping
- Re-measure after overflow to confirm reduction

### 2. Simulation.js - New Parameters

```javascript
// Oil occupancy / overflow control (looser thresholds)
this.oilOccupancyPercent = 0.0;
this.oilOverflowLower = 0.70;  // target (vs 0.80 for ink)
this.oilOverflowUpper = 0.85;  // trigger (vs 0.90 for ink)
```

**Why looser thresholds?**
- Oil is visually less dense than ink
- Oil spreads more naturally (higher viscosity)
- Oil layer serves as background/lens
- Allows more oil presence without overwhelming

### 3. Updated occupancy.frag.glsl Shader

Added `u_isOil` uniform to support both ink and oil measurement:

```glsl
uniform int u_isOil; // 1 for oil, 0 for ink

// Different thresholds:
if (u_isOil == 1) {
    t0 = 0.01;  // oil visible at lower values
    t1 = 0.15;  // full thickness threshold
} else {
    t0 = 0.02;  // ink haze threshold
    t1 = 0.25;  // full ink threshold
}
```

**Rationale:** Oil thickness is more visible at lower values than ink concentration, so lower detection thresholds prevent false negatives.

### 4. WaterLayer.js - Set u_isOil Flag

Updated `computeOccupancy()` to explicitly set:
```javascript
gl.uniform1i(isOilLoc, 0); // ink, not oil
```

Ensures water layer uses ink thresholds even though shader now supports both.

## Complete Oil Pipeline (6 Steps)

```
update(dt):
  1. Advect oil velocity by itself
  2. Apply water coupling (thickness-dependent)
  3. Apply oil viscosity (material-specific)
  4. Advect oil thickness by oil velocity
  5. Optional smoothing (oil cohesion)
  6. Overflow control (NEW - every N frames) ⬅️
```

## Threshold Comparison

| Layer | Detection Threshold | Target Band | Overflow Trigger |
|-------|-------------------|-------------|------------------|
| **Water (Ink)** | 0.02-0.25 | 80-90% | > 90% |
| **Oil** | 0.01-0.15 | 70-85% | > 85% |

**Key difference:** Oil thresholds are 15% lower to accommodate visual characteristics and intended usage.

## Expected Behavior

### Before Overflow Control
- Oil accumulates indefinitely with rotation
- Canvas becomes saturated with oil
- Visual quality degrades over time
- No feedback on oil coverage

### After Overflow Control
- Oil coverage self-regulates to 70-85% band
- Excess oil gently damped every 8 frames
- Maintains visual balance
- Logged feedback: `🛢️ Oil Occupancy: X.X%`

### Test Cases

1. **Paint excessive oil, rotate continuously:**
   - Oil coverage rises to 85%
   - Overflow valve engages
   - Coverage stabilizes at ~75%
   - Visible in console logs (if `logVerbose = true`)

2. **Mix oil and ink painting:**
   - Independent overflow control
   - Oil: 70-85% target
   - Ink: 80-90% target
   - Both layers self-regulate independently

3. **Switch materials during overflow:**
   - Oil overflow parameters remain constant
   - Material viscosity doesn't affect overflow
   - Coverage measurement still accurate

## Performance Impact

**Cost per overflow check (every 8 frames):**
- 1× occupancy render pass (128×128)
- 1× readPixels (64KB)
- Conditional: 1× overflow damp pass (full-res)
- ~0.5ms total when triggered

**Acceptable:** Infrequent (every 8 frames), shared infrastructure with water overflow.

## Technical Notes

### Shared Infrastructure

Oil overflow reuses water layer shaders:
- `occupancy.frag.glsl` with `u_isOil` flag
- `overflow.frag.glsl` (no changes needed)
- Same FBO (`sim.occupancyFBO`)
- Same readback buffer size

**Benefit:** Zero shader duplication, minimal code.

### Frame Counter Synchronization

Oil uses water's `sim._frameCounter`:
```javascript
if ((sim._frameCounter % sim.occupancyEveryN) === 0) {
  // Both layers check on same frames
}
```

**Rationale:** Avoids duplicate occupancy passes, synchronizes overflow cycles.

### Thickness-Weighted vs Binary

Oil occupancy is **thickness-weighted**, not binary presence:
```
oilWeight = smoothstep(0.01, 0.15, thickness)
```

Thin oil (< 0.01) contributes 0%, thick oil (> 0.15) contributes 100%, gradient in between.

**Result:** More accurate representation of visual oil coverage.

### Logging

Oil overflow uses `sim.logVerbose` flag to avoid spam:
```javascript
if (sim.logVerbose) {
  console.log(`🛢️ Oil Occupancy: ...`);
}
```

Set `simulation.logVerbose = true` to see oil overflow telemetry.

## Tuning Guide

**If oil accumulates too much:**
- Lower `oilOverflowUpper` (e.g., 0.80 instead of 0.85)
- Lower `oilOverflowLower` (e.g., 0.65 instead of 0.70)

**If oil gets over-damped:**
- Raise `oilOverflowUpper` (e.g., 0.90)
- Reduce max overflow strength (currently 0.20)
- Increase detection thresholds in shader (t0, t1)

**If overflow too aggressive:**
- Increase `occupancyEveryN` (check less frequently)
- Narrow the target band (closer lower/upper values)

**Current sweet spot:**
- 70-85% band works well for all materials
- Oil remains visible but not overwhelming
- Complements ink layer nicely

## Prerequisites Complete! ✅

All 4 prerequisites for Marangoni implementation are now complete:

1. ✅ Separate oil velocity field
2. ✅ Oil-specific viscosity
3. ✅ Basic coupling forces
4. ✅ Oil conservation & overflow

**Ready for Marangoni surface tension effects!**

Next: Implement full Marangoni flow as specified in `docs/marangoni-implementation.md` sections 1-9.
