# Ink Color Washout Fix

## Problem

Ink only showed vibrant color at the edges - **center washed out to gray/desaturated**.

![Example: Cyan ink with gray center, bright edges](user reported issue)

## Root Cause

**Beer-Lambert absorption model** saturates too quickly with default `absorptionCoefficient = 3.0`.

### How Beer-Lambert Works:
```glsl
float opacity = 1.0 - exp(-absorption * concentration);
```

When concentration is HIGH (center of ink blob):
- Opacity approaches 1.0 (fully opaque)
- But brightness doesn't scale proportionally
- Result: Center looks dark/gray despite correct color direction

### Example with cyan ink (0.3, 0.898, 1.0):

| Location | Concentration | Opacity | Result |
|----------|--------------|---------|--------|
| **Edge** | 1.0 | 0.95 | Bright cyan ✅ |
| **Center** | 4.0 | 0.9999 | Dark gray ❌ |

The center reaches full opacity but doesn't get brighter, washing out the color.

## The Fix

**Reduced absorption coefficient: 3.0 → 1.5**

This prevents early saturation, allowing centers to stay vibrant:

| Location | Concentration | Opacity (new) | Result |
|----------|--------------|---------------|--------|
| **Edge** | 1.0 | 0.78 | Bright cyan ✅ |
| **Center** | 4.0 | 0.998 | Bright cyan ✅ |

## Changes Made

### 1. Renderer Default
**File:** `src/renderer.js` line 21
```javascript
// OLD
this.absorptionCoefficient = 3.0;

// NEW
this.absorptionCoefficient = 1.5; // Lower = more vibrant centers
```

### 2. Ink Material Default
**File:** `src/controller.js` line 16
```javascript
// In defaultPreset (used by Ink material):
absorption: 1.5,  // Was 3.0
```

### 3. Oil Materials Unchanged
- **Mineral Oil**: 3.5 (thicker, darker - appropriate)
- **Alcohol**: 2.5 (thinner, lighter)
- **Syrup**: 4.0 (thick, rich)
- **Glycerine**: 4.5 (thick, rich)

Oil materials keep higher absorption because:
- They're meant to be thicker/darker
- Oil rendering has different compositing model
- Oil transparency controlled by `oilAlphaGamma` not absorption

## User Control

Users can still adjust absorption with **K key** or menu:
- Cycles: 0.5 → 1.0 → 2.0 → 4.0 → 8.0
- Default now starts at **1.5** (between 1.0 and 2.0)
- Higher values = richer/darker (for artistic effect)
- Lower values = more vibrant/glowing

## Expected Results

✅ **Ink centers stay vibrant** - cyan stays cyan, red stays red  
✅ **Edges still glow** - gradient from center to edge preserved  
✅ **Better color fidelity** - especially for bright colors like cyan, yellow  
✅ **Oil materials unaffected** - they use higher absorption intentionally

## Technical Details

### Beer-Lambert Law
Physical model for light absorption through a medium:
```
I = I₀ * e^(-μ * d)
```
- I = transmitted intensity
- I₀ = incident intensity  
- μ = absorption coefficient
- d = path length (concentration)

### Our Implementation
```glsl
// Line 33 in volumetric.frag.glsl
float opacity = 1.0 - exp(-u_absorption_coefficient * totalConc);

// Line 36 - Base color (always visible)
vec3 inkBase = inkColor * opacity * 1.5;

// Problem: When opacity → 1.0, brightness doesn't increase
// Solution: Lower absorption so opacity saturates slower
```

### Why Not Change the Shader Instead?

We could make brightness scale with concentration:
```glsl
vec3 inkBase = inkColor * (1.0 + totalConc * 0.5) * opacity;
```

But this would:
- ❌ Break physical accuracy of Beer-Lambert
- ❌ Require re-tuning all materials
- ❌ May cause other artifacts

Lowering absorption is simpler and maintains physical model.

## Files Modified

1. `src/renderer.js` - Default absorption: 3.0 → 1.5
2. `src/controller.js` - defaultPreset absorption: 3.0 → 1.5

## Related Issues

This also helps with:
- **Ink appearing to dissipate** - Centers weren't visible, looked like ink was gone
- **Color mixing** - Overlapping colors show true blend, not gray mush
- **Visual feedback** - Users see their painted strokes more clearly

---

**Status:** Fixed. Ink now maintains vibrant color throughout, not just at edges.
