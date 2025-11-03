# Critical Fix: Oil Dissipating Faster Than Water

## The Real Problem

**Oil overflow threshold was LOWER than water's**, causing oil to dissipate faster:
- Water overflow: **0.90** (90% occupancy)
- Oil overflow: **0.85** (85% occupancy) ❌

This meant:
- Oil hit overflow limit at 85% and got damped
- Water didn't hit overflow until 90%
- Result: Oil dissipated 5% earlier = faster dissipation

## The Fix

**Raised ALL oil overflow thresholds to be HIGHER than water's 0.90:**

| Material | Old Threshold | New Threshold | Status |
|----------|--------------|---------------|--------|
| **Default** | 0.85 ❌ | **0.95** ✅ | Higher than water |
| **Mineral Oil** | 0.88 ❌ | **0.93** ✅ | Higher than water |
| **Alcohol** | 0.80 ❌ | **0.91** ✅ | Just above water |
| **Syrup** | 0.95 ✅ | **0.95** ✅ | Already correct |
| **Glycerine** | 0.92 ✅ | **0.92** ✅ | Already correct |

### Key Principle

**For oil to persist AS LONG OR LONGER than water:**
```
oilOverflowUpper >= waterOverflowUpper (0.90)
```

**For material-specific persistence (viscosity-based):**
- High viscosity (Syrup): 0.95 - persists longest
- Medium viscosity (Mineral Oil): 0.93 - medium persistence  
- Low viscosity (Alcohol): 0.91 - dissipates faster BUT still >= water

## Files Modified

### `src/simulation.js` (lines 45-48)
```javascript
// OLD - Oil dissipated FASTER
this.oilOverflowLower = 0.70;
this.oilOverflowUpper = 0.85; // ❌ Lower than water's 0.90!

// NEW - Oil persists LONGER
this.oilOverflowLower = 0.80;
this.oilOverflowUpper = 0.95; // ✅ Higher than water's 0.90
```

### `src/controller.js` (lines 30-32, 41-42)
Updated defaultPreset and material-specific thresholds:
- Default: 0.95
- Mineral Oil: 0.93
- Alcohol: 0.91
- Syrup: 0.95 (unchanged)
- Glycerine: 0.92 (unchanged)

## Why This Matters

### Before Fix
1. Paint oil at t=0s
2. Oil occupancy reaches 85% at t=10s
3. Overflow triggers, damping oil thickness by 10-20%
4. Oil visibly thins and fades
5. Water still at 87% - NO overflow yet
6. User sees: "Oil dissipates faster than water" ❌

### After Fix
1. Paint oil at t=0s
2. Oil occupancy reaches 90% at t=15s
3. Water overflow triggers, damping water
4. Oil occupancy reaches 95% at t=20s
5. Oil overflow triggers (5 seconds LATER than water)
6. User sees: "Oil persists as long or longer than water" ✅

## Testing

### Quick Console Test
```javascript
// After loading page
console.log('Water overflow:', simulation.overflowUpper);  // Should be 0.90
console.log('Oil overflow:', simulation.oilOverflowUpper);  // Should be 0.95
console.log('Oil >', simulation.oilOverflowUpper > simulation.overflowUpper); // Should be true
```

### Visual Test
```javascript
// Run the automated test
fetch('test-oil-vs-water.js').then(r => r.text()).then(eval)
// Paints both, measures dissipation over 30 seconds
// Expected: Oil remaining % >= Water remaining %
```

### Diagnostic
```javascript
// Check all settings
fetch('diagnose-oil-motion.js').then(r => r.text()).then(eval)
```

## Related Fixes

This works together with previous fixes:
1. ✅ Disabled oil smoothing (stopped per-frame dissipation)
2. ✅ Fixed overflow shader to preserve alpha
3. ✅ Fixed diffusion shader to preserve alpha
4. ✅ **Raised oil overflow threshold above water** ← THIS FIX

All four fixes are necessary for oil to persist properly.

## Expected Behavior Now

**Without rotation (static test):**
- Oil should persist 30+ seconds without visible fading
- Oil should fade SLOWER than or equal to water
- No rapid thinning

**With rotation:**
- Oil should move WITH the water (coupling working)
- Thick materials (Syrup) persist longest
- Thin materials (Alcohol) dissipate fastest
- BUT all materials should dissipate SLOWER than or equal to water

---

**Status:** Critical fix applied. Oil overflow now >= water overflow for all materials.
