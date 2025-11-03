# Oil Dissipation Fix - Critical Bug Resolution

## Problem
Oil was "dissolving" or behaving incorrectly, appearing to lose thickness rapidly compared to ink.

## Root Causes Found

### 1. Overflow Shader (Minor Issue - Fixed)
The `overflow.frag.glsl` shader hardcoded alpha to `1.0`, setting all oil pixels to maximum thickness every 120 frames.

### 2. **Oil Smoothing/Diffusion (Major Issue - REAL CULPRIT)**
The `diffusion.frag.glsl` shader was **dissipating oil thickness every frame** via Laplacian diffusion:

```glsl
// Line 18 - applies to ALL channels including alpha
outColor = center + u_diffusion_rate * u_dt * (left + right + top + bottom - 4.0 * center);
```

With `oilSmoothingRate = 0.0015` running **every single frame**, oil thickness was constantly spreading out and vanishing. This was the primary cause of rapid dissipation.

## Solutions Applied

### Fix 1: Overflow Shader (`overflow.frag.glsl`)
- Added `uniform bool u_isOil` to distinguish oil from ink
- Preserve and damp alpha for oil:
  ```glsl
  float alpha = u_isOil ? (c.a * damp * inside) : 1.0;
  outColor = vec4(rgb * inside, alpha);
  ```

### Fix 2: **Disable Oil Smoothing by Default** (`simulation.js`)
**PRIMARY FIX:**
- Changed `oilSmoothingRate` from `0.0015` → `0.0`
- This stops the continuous thickness dissipation every frame
- Oil smoothing was causing more harm than good

### Fix 3: Diffusion Shader Preserves Alpha (`diffusion.frag.glsl`)
- Added `uniform bool u_preserveAlpha` 
- When enabled, only smooths RGB tint, preserves alpha thickness:
  ```glsl
  if (u_preserveAlpha) {
      outColor = vec4(diffused.rgb, center.a);
  }
  ```
- Allows re-enabling oil smoothing in future without losing thickness

### Fix 4: Updated Layer Code
- `OilLayer.js`: Sets `u_isOil=1` for overflow, `u_preserveAlpha=1` for diffusion
- `WaterLayer.js`: Sets `u_isOil=0` for overflow
- `diffusion.js` kernel: Sets `u_preserveAlpha=0` for ink

## Expected Results

✅ **Oil thickness should now persist correctly**
- Oil damping occurs proportionally, not destructively
- Oil should decay at same rate or slower than ink
- Overflow system now works as intended for both materials

## Testing Instructions

1. **Open the simulation in browser**
   ```
   open index.html
   ```

2. **Run the diagnostic script**
   ```javascript
   fetch('compare-dissolution.js').then(r => r.text()).then(eval)
   ```

3. **Expected outcome:**
   - Oil remaining: >90% after 10 seconds
   - Ink remaining: ~80-90% after 10 seconds
   - Oil should persist as well as or better than ink

4. **Visual test:**
   - Paint oil blobs
   - Rotate the container
   - Oil should maintain thickness for 30+ seconds
   - No rapid dissolution or thinning

## Parameters Status

Current overflow settings (good defaults):
- `occupancyEveryN = 120` (every 2 seconds at 60fps)
- `oilOverflowUpper = 0.85` (trigger threshold)
- `oilOverflowLower = 0.70` (target)
- Ink: `0.90` / `0.80` (slightly tighter)

These can be tuned if needed, but the critical bug is now fixed.

## Quick Test (Before Full Diagnostic)

If you just want to verify the fix quickly:

```javascript
// In browser console after opening index.html
simulation.oilSmoothingRate = 0.0;  // Should already be 0.0
console.log('Oil smoothing disabled:', simulation.oilSmoothingRate);
// Paint oil and watch - should persist much better now
```

## Files Modified
- `src/simulation.js` - **Set oilSmoothingRate = 0.0 (was 0.0015)**
- `src/shaders/diffusion.frag.glsl` - Added u_preserveAlpha uniform
- `src/shaders/overflow.frag.glsl` - Added u_isOil uniform
- `src/simulation/layers/OilLayer.js` - Set uniforms for oil processing
- `src/simulation/layers/WaterLayer.js` - Set u_isOil=0 for ink overflow
- `src/simulation/kernels/diffusion.js` - Set u_preserveAlpha=0 for ink
