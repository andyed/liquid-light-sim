# SPH Rotation Failure - Post-Mortem

**Date**: November 8, 2025  
**Duration**: 30+ minutes of circular debugging  
**Status**: ❌ FAILED - Critical architecture issue identified

---

## The Problem

**Symptom**: SPH oil blobs don't respond to rotation (A/D keys), while grid-based materials (alcohol) do.

**Root Cause**: SPH code path **exits early** and skips ALL grid-based physics:

```javascript
// OilLayer.js line 208
if (this.useSPH) {
  this.sph.update(dt, sim.rotationAmount);  // Particle physics
  this.sph.renderParticles(...);            // Render to texture
  return; // ← BLOCKS EVERYTHING BELOW
}

// THESE NEVER RUN when SPH is active:
// - Water coupling
// - Oil velocity advection  
// - Rotation/displacement shader
// - Buoyancy forces
```

---

## What We Tried (All Failed)

### Attempt 1: Add rotation to SPH particles
- ✅ Passed `rotationAmount` to SPH
- ✅ Added tangential rotation force
- ❌ **Result**: Force too weak vs pressure (2600 vs 2)

### Attempt 2: Increase rotation force
- Tried multipliers: ×2, ×5, ×10, ×50
- ❌ **Result**: Still no visible motion

### Attempt 3: Reduce damping
- Changed from 0.80 → 0.95
- Increased speed cap 0.1 → 1.0
- ❌ **Result**: No effect

### Attempt 4: Debug force magnitudes
- Added logging to compare forces
- Found pressure forces 100× larger
- ❌ **Result**: Rotation force fundamentally too weak

### Why It Failed
The SPH particles have:
- **Pressure forces**: 100-2600 (incompressibility)
- **Cohesion forces**: 30-100 (holding blobs together)
- **Rotation force**: 0.2 × 0.4 (distance) × 0.02 (mass) × 50 = **0.4**

**Rotation is 1000× weaker than pressure!**

Even at ×50 multiplier, rotation can't overcome the massive forces keeping dense blobs cohesive.

---

## Why Alcohol Works

Alcohol uses **grid-based** fluid dynamics:
- Goes through full OilLayer physics pipeline
- Water coupling applies rotation to velocity field
- Advection propagates motion
- No early return blocking

**Grid-based materials work because they use the EXISTING rotation infrastructure.**

---

## The Real Issue

**Architectural mismatch:**

```
Grid-Based Path:
  Water update (with rotation)
    ↓
  Oil coupling (inherits water motion)
    ↓  
  Oil advection (propagates rotation)
    ↓
  WORKS ✅

SPH Path:
  SPH particle physics
    ↓
  return; ← BLOCKS EVERYTHING
    ↓
  (rotation shader never runs)
    ↓
  BROKEN ❌
```

---

## Correct Solution

**Don't try to force SPH particles to rotate directly.**

Instead, **integrate SPH with the grid-based velocity field:**

### Option A: SPH writes to velocity grid
```javascript
if (this.useSPH) {
  this.sph.update(dt, sim.rotationAmount);
  this.sph.renderParticles(...);
  
  // NEW: Write SPH velocities to oil velocity texture
  this.sph.writeVelocitiesToGrid(this.oilVelocityTexture);
  
  // DON'T return - continue to grid physics
}

// Grid-based passes now see SPH velocities
// Rotation/coupling/advection work normally
```

### Option B: SPH reads from velocity grid
```javascript
// After water updates with rotation
if (this.useSPH) {
  // NEW: Sample velocity grid at particle positions
  const gridVelocities = this.sampleVelocityGrid(this.sph.positions);
  
  // Apply grid velocities as forces on particles
  this.sph.applyGridForces(gridVelocities);
  
  this.sph.update(dt);
}
```

### Option C: Hybrid - both directions
- Water rotation → velocity grid
- Grid velocities → SPH particle forces (drag)
- SPH particles → grid velocities (feedback)

---

## Why We Went in Circles

1. **Assumed SPH particles should rotate independently** ❌
   - Tried to make particles self-rotate
   - Fighting against massive pressure/cohesion forces
   - Wrong approach from the start

2. **Didn't check the grid-based path** ❌
   - Early return was obvious in code
   - Never questioned why alcohol worked
   - Missed the architecture mismatch

3. **Kept tuning force magnitudes** ❌
   - Tried 2×, 5×, 10×, 50× multipliers
   - Never going to work at any multiplier
   - Fundamental approach was wrong

---

## Lessons Learned

### ❌ **What Went Wrong**

1. **Started implementing without understanding the system**
   - Didn't trace how grid-based rotation works
   - Jumped to "add rotation force to SPH"
   - Wrong mental model from the start

2. **Kept trying variants of a broken approach**
   - "Just make it stronger!"
   - Never stepped back to question the approach
   - Circular debugging for 30 minutes

3. **Ignored the working example**
   - Alcohol works → should have asked WHY
   - Clue was right there
   - Didn't compare code paths

### ✅ **What Should Have Happened**

1. **Understand first, code second**
   - Trace how alcohol/grid rotation works
   - Understand water coupling pipeline
   - Design SPH integration to match

2. **Question assumptions when stuck**
   - After 5 minutes of no progress → STOP
   - "Why does alcohol work but not SPH?"
   - Would have found the early return immediately

3. **Test the simple thing**
   - Comment out the early return
   - See if grid physics works with SPH
   - Understand what's actually blocked

---

## Current Status

**SPH blobs:**
- ✅ Spawn correctly
- ✅ Cohesion working
- ✅ Pressure working
- ✅ Merging working
- ✅ MetaBall rendering working
- ❌ **Rotation BLOCKED by architecture**

**Grid-based (alcohol):**
- ✅ Everything works including rotation

---

## Next Steps (If Pursuing)

### Immediate (10 minutes)
1. Remove early return in SPH path
2. Let grid-based rotation/coupling run
3. Test if SPH texture gets rotated

### Short-term (1-2 hours)  
4. Implement proper SPH ↔ Grid coupling
5. SPH particles write velocities to grid
6. Grid forces applied to particles

### Long-term (Optional)
7. Full two-way coupling
8. Vorticity from particles → grid
9. Grid rotation → particle drag

---

## Recommendation

**STOP trying to force SPH particles to rotate.**

**START with proper grid integration:**
- Let the working rotation infrastructure do its job
- SPH just needs to talk to the grid
- Don't reinvent rotation

---

## Apology

This was a failure of:
- **Analysis**: Didn't understand the system before coding
- **Debugging**: Kept trying broken variants
- **Communication**: Didn't recognize stuck in loop

**Should have documented the architecture issue 25 minutes ago.**

The user was right to call it out. 🙏
