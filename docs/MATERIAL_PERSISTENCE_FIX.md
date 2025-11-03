# Material-Specific Persistence Fix

## Problem
Material dissipation rates were BACKWARDS:
- ❌ Syrup dissipated faster than mineral oil
- ❌ Mineral oil dissipated faster than alcohol
- Should be opposite: syrup (high viscosity) should persist longest

## Root Cause
All materials shared the same overflow thresholds (`0.85`/`0.70`) regardless of viscosity. High-viscosity materials should be allowed to accumulate MORE before overflow dampens them.

## Solution

Added material-specific overflow parameters to each preset:

### Material Overflow Settings (Ordered by Persistence)

| Material | Viscosity | Overflow Upper | Overflow Lower | Check Frequency | Expected Behavior |
|----------|-----------|----------------|----------------|-----------------|-------------------|
| **Syrup** | 0.5 (highest) | **0.95** | 0.80 | 180 frames | Persists longest, minimal overflow |
| **Glycerine** | 0.3 | **0.92** | 0.77 | 150 frames | High persistence |
| **Mineral Oil** | 0.08 | **0.88** | 0.73 | 120 frames (default) | Medium persistence |
| **Alcohol** | 0.1 (lowest) | **0.80** | 0.65 | 120 frames | Dissipates fastest |

### Key Changes

1. **Syrup** - Highest threshold (95%), less frequent checks
   - Allows maximum accumulation before overflow
   - Checks only every 3 seconds at 60fps
   - Will form thick, persistent blobs

2. **Glycerine** - High threshold (92%)
   - Similar to syrup but slightly more controlled
   - Checks every 2.5 seconds

3. **Mineral Oil** - Medium threshold (88%)
   - Moderate persistence
   - Default check frequency (2 seconds)

4. **Alcohol** - Lowest threshold (80%)
   - Most aggressive overflow control
   - Dissipates quickest, spreads thinnest

## Implementation

**File:** `src/controller.js`

### Added to defaultPreset (lines 30-32):
```javascript
oilOverflowUpper: 0.85,   // Default overflow thresholds
oilOverflowLower: 0.70,
occupancyEveryN: 120      // Default overflow check frequency
```

### Added to material presets:
- **Mineral Oil**: `oilOverflowUpper: 0.88, oilOverflowLower: 0.73`
- **Alcohol**: `oilOverflowUpper: 0.80, oilOverflowLower: 0.65`
- **Syrup**: `oilOverflowUpper: 0.95, oilOverflowLower: 0.80, occupancyEveryN: 180`
- **Glycerine**: `oilOverflowUpper: 0.92, oilOverflowLower: 0.77, occupancyEveryN: 150`

The `applyMaterialPreset()` function automatically applies these when materials are switched (keys 1-5).

## Testing

### Visual Test
1. Open in browser
2. Select each material and paint equal amounts
3. Let sit without rotation
4. **Expected order of persistence (longest to shortest):**
   - Syrup > Glycerine > Mineral Oil > Alcohol

### With Rotation
1. Paint each material
2. Rotate container continuously
3. Syrup should maintain visible blobs for 60+ seconds
4. Alcohol should thin out and dissipate within 30 seconds

### Console Check
```javascript
// After selecting each material, verify settings
console.log('Material:', simulation.renderer.materialName);
console.log('Overflow threshold:', simulation.oilOverflowUpper);
console.log('Check frequency:', simulation.occupancyEveryN);
```

## Expected Results

✅ **Syrup** (high viscosity)
- Persists longest
- Forms thick, stable blobs
- Minimal thinning even with movement

✅ **Glycerine** (medium-high viscosity)  
- Good persistence
- Smooth, flowing behavior

✅ **Mineral Oil** (medium viscosity)
- Moderate persistence
- Balanced between stability and flow

✅ **Alcohol** (low viscosity)
- Dissipates fastest
- Thins out quickly
- More reactive to overflow control

## Physics Accuracy

This now matches real-world behavior:
- **High viscosity fluids** (syrup, honey) resist flow and persist longer
- **Low viscosity fluids** (alcohol, water) flow easily and spread thin
- Overflow system mimics real container limits without artificial dissipation

## Files Modified
- `src/controller.js` - Added overflow parameters to defaultPreset and all material presets

---

**Status:** Ready for testing. Material dissipation rates should now match physical intuition.
