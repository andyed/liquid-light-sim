# SPH "Snail Trail" Bug Fix

**Date**: November 9, 2025  
**Issue**: SPH blobs leave striped trails showing movement history  
**Status**: ✅ FIXED

---

## 🐌 The Problem: "Snail Trails"

### Visual Symptoms:
- **Layered contour patterns** showing particle movement history
- **Striped "topographic map" appearance** instead of clean blobs
- **Accumulation over time** - trails build up as particles move
- **Affects all SPH materials** (Mineral Oil, Syrup, Glycerine)

### What It Looked Like:
```
Instead of:     ●  (clean blob)
We saw:        ≋≋≋≋  (striped trail)
```

---

## 💡 Root Cause: Blending During Clear

### The Problem:

WebGL `gl.clear()` can be affected by enabled blend state!

```javascript
// WRONG (what we had):
gl.clearColor(0, 0, 0, 0);
gl.clear(gl.COLOR_BUFFER_BIT); // ← Blend mode was ENABLED!
// Result: Clear doesn't fully wipe texture, previous frame "ghosts" remain
```

### Why Blending Interfered:

When blend mode is enabled during `gl.clear()`:
1. **Clear operation might blend with existing framebuffer** (implementation-dependent)
2. **Alpha channel doesn't get fully cleared** to 0
3. **Previous frame's data persists** as faint "ghosts"
4. **Each frame adds** on top of previous → trails!

### The Physics Was Fine!

- ✅ Particles were updating correctly
- ✅ Positions were accurate
- ✅ No particle duplication
- ❌ Rendering was showing **history instead of current state**

---

## ✅ The Fix: Disable Blend During Clear

### Solution 1: Clear with Blend Disabled

```javascript
// CORRECT:
gl.disable(gl.BLEND);      // ← CRITICAL!
gl.clearColor(0, 0, 0, 0);
gl.clear(gl.COLOR_BUFFER_BIT);
// Now renders fresh particles
gl.enable(gl.BLEND); // Re-enabled inside renderParticles()
```

**File**: `OilLayer.js` line 203  
**Impact**: Ensures oil texture is completely wiped each frame

### Solution 2: MetaBall Pass (Fullscreen Quad)

```javascript
// MetaBall pass ALSO needs blend disabled!
gl.disable(gl.BLEND); // ← Fullscreen replacement, not accumulation
gl.drawArrays(gl.TRIANGLES, 0, 6);
```

**File**: `OilLayer.js` line 224  
**Impact**: MetaBall result replaces (doesn't blend with) input

---

## 🔬 Technical Deep Dive

### Frame-by-Frame Breakdown:

#### Before Fix (WITH TRAILS):
```
Frame N:
  1. Particles at positions P1
  2. Clear texture (but blend was enabled!)
  3. Alpha channel: ~0.1 remains from Frame N-1
  4. Render P1 → adds to ghosted previous frame
  5. Result: P1 + 10% of P1(N-1)
  
Frame N+1:
  1. Particles move to P2
  2. Clear (with blend)
  3. Alpha: ~0.1 of (P1 + 0.1*P1(N-1)) remains
  4. Render P2 → adds on top
  5. Result: P2 + 0.1*P1 + 0.01*P1(N-1) + ...
  
Result: Exponential decay trail!
```

#### After Fix (NO TRAILS):
```
Frame N:
  1. Disable blend
  2. Clear texture → alpha = 0 everywhere
  3. Enable blend (in renderParticles)
  4. Render P1 at current positions
  5. Result: ONLY P1 visible
  
Frame N+1:
  1. Disable blend
  2. Clear → alpha = 0
  3. Render P2
  4. Result: ONLY P2 visible (P1 completely gone)
  
Result: Clean blobs, no history!
```

---

## 🧪 Why Pre-Multiplied Alpha Exacerbated This

### Pre-Multiplied Alpha Blending:
```glsl
// Particle shader output:
vec3 premultiplied = color * alpha;
fragColor = vec4(premultiplied, alpha);

// Blend mode:
gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

// Result = Src + Dst * (1 - Src.a)
```

### Problem with Incomplete Clear:

If destination alpha isn't 0:
```
Dst = (color, 0.1) from previous frame
Src = (new_color, 0.8) current particles

Result.rgb = new_color + color * (1 - 0.8)
           = new_color + 0.2 * old_color  ← TRAIL!
```

**Pre-multiplied alpha is CORRECT** - but requires proper clearing!

---

## 🎨 Visual Quality Impact

### Before Fix:
- ❌ Striped contour trails
- ❌ Movement history visible
- ❌ "Topographic map" appearance
- ❌ Accumulation over time
- ⚠️ Beautiful but WRONG physics

### After Fix:
- ✅ Clean blob edges
- ✅ Only current frame visible
- ✅ No accumulation
- ✅ Accurate physics representation
- ✅ Professional quality rendering

---

## 📊 Performance Impact

**None!** 

```javascript
gl.disable(gl.BLEND);  // ← 1 GPU state change
gl.clear(...);         // ← Same as before
```

Negligible performance cost, massive visual improvement.

---

## 🐛 How This Bug Survived Testing

### Why We Didn't Catch It Sooner:

1. **Trails looked "artistic"** - contour lines are visually interesting!
2. **No obvious corruption** - just extra patterns
3. **Physics was working** - particles moved correctly
4. **Gradual accumulation** - not immediately obvious
5. **Blend state is "sticky"** - easy to forget it's enabled

### Lesson Learned:

**Always explicitly manage OpenGL state!**

```javascript
// GOOD PRACTICE:
function renderPass() {
  // Set ALL required state explicitly
  gl.disable(gl.BLEND);
  gl.disable(gl.DEPTH_TEST);
  gl.viewport(...);
  
  // ... render ...
  
  // Restore state if needed
}
```

---

## ✅ Verification Tests

### Test 1: Clean Slate After Clear
```javascript
// After fix, read framebuffer after clear:
gl.clear(gl.COLOR_BUFFER_BIT);
const pixels = new Uint8Array(4);
gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
console.assert(pixels[3] === 0, "Alpha should be 0!");
```

### Test 2: No Trails After Movement
1. Paint blob
2. Wait for it to move
3. Check if old positions are still visible
4. **Expected**: Only current position visible

### Test 3: Rapid Movement
1. Enable rotation (A/D keys)
2. Let blobs spin for 10 seconds
3. **Expected**: No spiral trails

---

## 📝 Related Issues Fixed

### Issue 1: MetaBall Accumulation
**Also needed**: `gl.disable(gl.BLEND)` before MetaBall fullscreen quad.

**Why**: MetaBall pass does fullscreen replacement, not additive blending.

### Issue 2: Blend State Leakage
**Potential future issue**: Other render passes inheriting blend state.

**Prevention**: Always set state explicitly at start of each pass.

---

## 🎯 Key Takeaways

1. **`gl.clear()` + enabled blend = BAD** ⚠️
2. **Always disable blend before clear** ✅
3. **Pre-multiplied alpha requires perfect clearing** ⚠️
4. **OpenGL state is sticky** - manage it explicitly ✅
5. **Beautiful bugs can hide real issues** 🐛

---

**Status**: SNAIL TRAILS ELIMINATED ✅  
**Visual Quality**: PROFESSIONAL ✅  
**Physics Accuracy**: CORRECT ✅

Your SPH blobs are now CLEAN! 🧼💧
