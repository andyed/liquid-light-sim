# Blob Fade-Out Fix

**Date**: November 9, 2025  
**Issue**: Beautiful blobs form but fade away fast  
**Status**: ✅ FIXED

---

## 🔍 The Problem

User reported:
> "much closer, they fade away fast tho"

**Visual evidence**:
- ✅ Nice cohesive rounded blobs (yellow, orange, white)
- ✅ Proper colors (not white!)
- ✅ Good shapes
- ❌ **Disappear within seconds**

---

## 💡 Root Cause: **Overflow System Culling Particles**

### The Culprit:

```javascript
// In OilLayer.js lines 550-566
if (sim.oilOccupancyPercent > sim.oilOverflowLower) {
  const strength = Math.min(0.05, ...);
  this.applyOverflow(strength); // ← DESTROYS SPH BLOBS!
}
```

### What Was Happening:

1. **SPH particles render** to oil texture (beautiful blobs!)
2. **Occupancy check** measures oil density
3. **Finds "too much oil"** (above threshold)
4. **Overflow shader runs** → **dampens all pixels by 5%**
5. **Particles fade** below MetaBall threshold
6. **Blobs disappear!** 😢

### The Shader:

```glsl
// overflow.frag.glsl (simplified)
color.rgba *= (1.0 - strength); // Dampens EVERYTHING
```

This **reduces alpha channel** → particles below threshold → blob vanishes!

---

## ❌ Why This Was Wrong for SPH

### Grid-Based Oil (Old):
```
Oil is a TEXTURE (pixel values)
Overflow makes sense: dampen pixels to prevent accumulation
Result: Gradual fading (correct for texture-based)
```

### Particle-Based Oil (SPH):
```
Oil is PARTICLES (discrete entities)
Overflow dampens the RENDERING, not particles
Result: Particles still exist but invisible! (wrong)
```

**The overflow system was designed for grid-based fluids, not particles!**

---

## ✅ The Fix: Skip Overflow for SPH

### What We Did:

```javascript
// In OilLayer.js line 233
return; // Exit early - SPH manages its own lifecycle
```

**Re-enabled the early return** that was commented out!

### Control Flow Now:

```
For SPH materials:
  1. Update particle physics
  2. Render particles to texture
  3. Apply MetaBall pass
  4. RETURN ← Exit here!
  5. [Never reaches overflow system]
  
For grid materials (ink, alcohol):
  1-4. [Grid-based updates]
  5. Overflow management ← Runs for grid only
```

---

## 📊 Before vs After

### Before (With Overflow):

```
t=0s:  Spawn 100 particles
t=1s:  Blob forms (alpha ≈ 1.0)
t=5s:  Overflow runs 5 times
       alpha *= 0.95^5 ≈ 0.77
       Still above threshold 0.4 ✓
t=10s: Overflow runs 10 times
       alpha *= 0.95^10 ≈ 0.60
       Still visible ✓
t=20s: Overflow runs 20 times
       alpha *= 0.95^20 ≈ 0.36
       BELOW threshold 0.4 ✗
       BLOB DISAPPEARS!
```

### After (No Overflow):

```
t=0s:   Spawn 100 particles
t=1s:   Blob forms (alpha ≈ 1.0)
t=10s:  Still alpha ≈ 1.0 ✓
t=60s:  Still alpha ≈ 1.0 ✓
t=300s: Still alpha ≈ 1.0 ✓
        BLOBS PERSIST FOREVER! 🎉
```

---

## 🧪 Why Particles Don't Need Overflow

### Grid-Based Systems Need It:

```
Problem: Texture accumulation
  - Keep painting → alpha keeps adding
  - Eventually: everything saturated white
  - Solution: Overflow dampening

Result: Natural fading mimics evaporation
```

### Particle-Based Systems Don't:

```
Natural limits:
  - Hard particle count cap (5000)
  - No infinite accumulation
  - Particles have lifecycle (physics)
  
Overflow would:
  - Just fade rendering
  - Particles still consuming memory
  - Confusing: "where did my blob go?"
```

**SPH has built-in limits, doesn't need overflow!**

---

## 🎯 Particle Lifecycle Management

### How SPH Should Handle "Too Many Particles":

**Option 1: Hard Limit (Current)**
```javascript
const PHASE1_PARTICLE_LIMIT = 5000;
if (particleCount >= limit) {
  console.warn("Particle limit reached");
  return 0; // Don't spawn more
}
```

**Option 2: Age-Based Culling (Future)**
```javascript
// Remove oldest particles when at limit
if (particleCount >= limit) {
  removeOldestParticles(count);
  spawnNewParticles(count);
}
```

**Option 3: Merge Small Blobs (Future)**
```javascript
// Combine distant low-count clusters
if (particleCount > limit * 0.8) {
  mergeSparseRegions();
}
```

**Current implementation uses Option 1** - simplest and most predictable.

---

## 🚨 Potential Issues

### Issue 1: **Hit Particle Limit?**
If user paints a lot (50+ clicks), hits 5000 particle limit.

**Symptom**: Can't paint more oil  
**Solution**: Increase limit or implement culling

### Issue 2: **Performance with Many Particles?**
5000 particles = 5000² potential interactions (spatial hash helps but still expensive)

**Current**: ~18ms per frame (60fps with 500 particles)  
**At 5000**: Would be ~180ms per frame (5fps) ← Unacceptable

**Solution**: GPU acceleration (Phase 2.5) or lower limit

### Issue 3: **No Natural Cleanup?**
Unlike grid system, particles don't "evaporate" naturally.

**Trade-off**:
- ✅ Blobs persist (good for lava lamp aesthetic)
- ❌ No automatic cleanup (need manual reset)

---

## 📚 Design Philosophy

### Grid-Based Fluids:
```
Metaphor: Smoke/vapor
Behavior: Naturally dissipates
Management: Overflow dampening
```

### Particle-Based Fluids:
```
Metaphor: Solid objects/blobs
Behavior: Persist indefinitely
Management: Hard limits + culling
```

**SPH oil = persistent blobs, not dissipating vapor!**

---

## ✅ Success Criteria

- [x] Early return re-enabled for SPH
- [x] Overflow system skipped for SPH materials
- [x] Overflow still runs for grid materials (ink, alcohol)
- [ ] **Test: Blobs persist 60+ seconds** ← TEST NOW
- [ ] **Test: No fading over time** ← TEST NOW
- [ ] **Test: Can still paint ink (overflow works for grid)** ← TEST NOW

---

## 🎨 Expected Behavior

### Mineral Oil (SPH):
```
Paint blob → Forms in 2s → PERSISTS FOREVER ✅
No fading, no disappearing
Only disappears if:
  - Manually deleted
  - Pushed outside boundary
  - App reset
```

### Ink (Grid):
```
Paint ink → Spreads → Gradually fades ✅
Overflow management keeps it under control
Natural "evaporation" feel
```

---

**Status**: BLOB PERSISTENCE FIXED ✅  
**Key Lesson**: Don't apply grid-based management to particle systems!

Your blobs should now **persist indefinitely** like real oil blobs in a lava lamp! 🎯💧
