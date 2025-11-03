# Commit Summary: Oil Dissipation Fixes

## Changes Made

### 1. Disabled Oil Smoothing (Primary Fix)
**File:** `src/simulation.js` line 28
```javascript
this.oilSmoothingRate = 0.0; // Was 0.0015 - DISABLED to prevent per-frame dissipation
```
**Impact:** Stops continuous thickness loss every frame via Laplacian diffusion

### 2. Fixed Overflow Shader to Preserve Alpha
**Files:** 
- `src/shaders/overflow.frag.glsl` - Added `u_isOil` uniform
- `src/simulation/layers/OilLayer.js` - Sets `u_isOil = 1`
- `src/simulation/layers/WaterLayer.js` - Sets `u_isOil = 0`

**Impact:** When overflow DOES trigger (at 85-95% occupancy), oil thickness is preserved instead of reset to 1.0

### 3. Fixed Diffusion Shader to Preserve Alpha
**Files:**
- `src/shaders/diffusion.frag.glsl` - Added `u_preserveAlpha` uniform
- `src/simulation/layers/OilLayer.js` - Sets `u_preserveAlpha = 1`
- `src/simulation/kernels/diffusion.js` - Sets `u_preserveAlpha = 0` for ink

**Impact:** If oil smoothing is re-enabled in future, it won't dissipate thickness

### 4. Raised Oil Overflow Thresholds
**Files:**
- `src/simulation.js` lines 47-48 - Default: 0.85 → 0.95
- `src/controller.js` - Updated all material presets

**Material Thresholds (vs Water's 0.90):**
- Syrup: 0.95 (persists longest)
- Glycerine: 0.92
- Mineral Oil: 0.93
- Alcohol: 0.91 (dissipates fastest, but still >= water)

**Impact:** At high occupancy (>85%), oil now triggers overflow LATER than water

### 5. Added Material-Specific Overflow Settings
**File:** `src/controller.js`
- Each material now has custom `oilOverflowUpper`, `oilOverflowLower`, `occupancyEveryN`
- High-viscosity materials get higher thresholds and less frequent checks

## What Was Actually Fixed

### ✅ Definitely Fixed:
1. **Oil smoothing dissipation** - No longer loses thickness every frame
2. **Overflow shader bug** - Alpha preserved when overflow runs
3. **Material-specific persistence** - Viscosity now affects overflow behavior

### ❓ Partially Fixed / Situational:
4. **Overflow threshold** - Only matters at HIGH occupancy (>85%)
   - If container is mostly empty, overflow never runs anyway
   - This explains why you might not see improvement at low occupancy

## What Might Still Be Issues

### If Oil Still Dissipates at LOW Occupancy:
1. **Rendering issue?** - Oil may actually be persisting but looks faded
2. **Advection bug?** - Oil moving off-screen or to edges
3. **Boundary absorption?** - Check if rim fade is truly disabled
4. **Another shader we missed?**

### If Oil Still Doesn't Move:
1. **Water has no velocity** - If water is still, oil won't move (coupling works but nothing to couple to)
2. **Coupling strength too low** - Check `simulation.couplingStrength` (should be 0.6-0.8)
3. **Oil thickness too low** - Coupling shader returns zero if `thickness < 0.00001`

## How to Test

### Test 1: Persistence (Static - No Movement)
```javascript
// Paint oil, don't rotate, wait 30 seconds
// If oil fades significantly = still a dissipation bug
// If oil stays visible = fixed!
```

### Test 2: Persistence (High Occupancy)
```javascript
// Paint a LOT of oil (fill container to 90%+)
// Overflow should trigger
// Oil should maintain thickness better than before
```

### Test 3: Movement
```javascript
// Paint oil, then hold 'R' to rotate
// Oil should move with the water
// If it doesn't move = coupling issue (not dissipation)
```

### Test 4: Diagnostic
```javascript
fetch('diagnose-oil-motion.js').then(r => r.text()).then(eval)
// Shows all settings + actual velocity values
```

## Files Modified (Total: 7)

### Core Changes:
1. `src/simulation.js` - Disabled smoothing, raised default overflow
2. `src/shaders/overflow.frag.glsl` - Added u_isOil uniform
3. `src/shaders/diffusion.frag.glsl` - Added u_preserveAlpha uniform
4. `src/controller.js` - Material-specific overflow settings

### Layer Updates:
5. `src/simulation/layers/OilLayer.js` - Set uniforms for oil
6. `src/simulation/layers/WaterLayer.js` - Set u_isOil for ink  
7. `src/simulation/kernels/diffusion.js` - Set u_preserveAlpha for ink

### Test/Diagnostic Scripts (New):
- `diagnose-oil-motion.js` - Check all settings and velocity values
- `test-oil-vs-water.js` - Compare oil vs water dissipation over time
- `test-oil-dissipation-quick.js` - Quick parameter adjustment test

### Documentation (New):
- `OIL_DISSIPATION_COMPLETE_FIX.md` - Detailed analysis
- `OIL_OVERFLOW_FIX.md` - Overflow shader fix
- `MATERIAL_PERSISTENCE_FIX.md` - Material-specific thresholds
- `OIL_FASTER_DISSIPATION_FIX.md` - Threshold comparison
- `COMMIT_SUMMARY.md` - This file

## Recommended Commit Message

```
Fix oil dissipation: disable smoothing, preserve alpha, tune thresholds

- Disabled oil smoothing (0.0015 → 0.0) to stop per-frame dissipation
- Fixed overflow shader to preserve oil alpha (thickness) 
- Fixed diffusion shader to optionally preserve alpha
- Raised oil overflow thresholds above water (0.95 vs 0.90)
- Added material-specific overflow settings (syrup 0.95, alcohol 0.91)

Oil should now persist comparable to or longer than water/ink.
High-viscosity materials (syrup) persist longest as expected.

Fixes apply at both low occupancy (smoothing) and high occupancy (overflow).
```

## Next Steps If Still Not Working

1. **Run diagnostics** to see actual velocity/thickness values
2. **Check if water is actually moving** (coupling works if water moves)
3. **Increase coupling strength** if needed: `simulation.couplingStrength = 0.8`
4. **Check occupancy levels** to see if overflow is even running
5. **Add temporary logging** to see which shader passes are running

---

**Bottom Line:** We fixed definite bugs (smoothing, alpha preservation). The overflow threshold fix only helps at high occupancy, so if you're testing with small amounts of oil, that fix won't be visible yet.
