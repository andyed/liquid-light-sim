# Multi-Material Limitation (Current)

**Date**: November 9, 2025  
**Status**: Known Limitation (Not a Bug)

---

## 🎨 Current Behavior

### SPH Materials (Mineral Oil, Syrup, Glycerine):
- ✅ Render as particles with physics
- ✅ **Persist when switching to other materials**
- ✅ Blobs stay visible but **freeze** (no physics updates)

### Grid Materials (Ink, Alcohol):
- ✅ Render as texture-based fluid
- ❌ **Cannot paint while SPH particles exist**

---

## 📋 User Experience

### Scenario 1: Paint Mineral Oil, then switch to Alcohol
```
1. Select Mineral Oil (material 2)
2. Paint blob → SPH particles created
3. Switch to Alcohol (material 3)
4. Mineral oil blob stays visible (frozen)
5. Try to paint Alcohol → NOTHING HAPPENS
```

**Why**: Grid-based rendering is disabled to protect SPH particles.

### Scenario 2: Clear and Start Fresh
```
1. Have Mineral Oil blobs on screen
2. Press "Clear" or "C" key
3. SPH particles removed
4. Switch to Alcohol
5. Now can paint Alcohol normally ✅
```

---

## 🔧 Technical Reason

### The Problem:

SPH and grid-based oil share the **same texture** (`oilTexture1/2`):

```
SPH Path:
  1. Clear texture
  2. Render particles → oilTexture
  3. Apply MetaBall → smooth blobs
  
Grid Path:
  1. Read oilTexture (has SPH blobs!)
  2. Apply advection → moves/distorts SPH blobs ❌
  3. Apply diffusion → spreads SPH blobs ❌
  4. Result: SPH blobs get corrupted!
```

### Current Solution:

**Early return** - Skip grid path entirely if SPH particles exist:

```javascript
if (this.useSPH && (hasSPHParticles || useSPHForMaterial)) {
  // Render SPH particles
  return; // ← Prevents grid operations
}
// Grid path never reached if particles exist
```

---

## ✨ Future Enhancement: True Multi-Material

### Proper Solution (Phase 3+):

Separate texture layers for each material type:

```javascript
// Separate textures:
this.sphOilTexture    // SPH particles only
this.gridOilTexture   // Alcohol/grid-based only

// Final composite:
compose(sphOilTexture, gridOilTexture) → finalOilTexture
```

### Implementation Plan:

1. **Add second oil texture** for grid-based materials
2. **SPH path** renders to `sphOilTexture`
3. **Grid path** renders to `gridOilTexture`
4. **Composite shader** blends both in final render
5. **Interaction**: SPH particles can collide with grid oil

### Benefits:

- ✅ Paint Mineral Oil + Alcohol simultaneously
- ✅ Each material maintains independent physics
- ✅ Visual blending at render time
- ✅ No corruption or interference

### Complexity:

- 🔶 Additional texture memory (2× oil textures)
- 🔶 Composite shader needed
- 🔶 Per-material property tracking
- 🔶 Collision/interaction logic

**Estimated effort**: 2-4 hours

---

## 🎯 Workaround (Current)

### For Users:

**To switch between material types:**

1. **Clear canvas** (press `C` or clear button)
2. Select new material
3. Paint

**To keep blobs visible:**
- Don't switch to Ink/Alcohol
- Stay with SPH materials (Mineral Oil, Syrup, Glycerine)
- These can be painted together

### Material Compatibility:

| From → To | Result |
|-----------|--------|
| Mineral Oil → Syrup | ✅ Both SPH - works! |
| Mineral Oil → Glycerine | ✅ Both SPH - works! |
| Mineral Oil → Alcohol | ⚠️ Oil freezes, can't paint Alcohol |
| Mineral Oil → Ink | ⚠️ Oil freezes, can't paint Ink |
| Ink → Mineral Oil | ✅ Can paint oil (ink cleared) |
| Alcohol → Syrup | ✅ Can paint syrup (alcohol cleared) |

---

## 🐛 Not a Bug!

This is **intentional behavior** to prevent corruption.

### What we DON'T want:

```
User paints beautiful Mineral Oil blob
Switches to Alcohol
Alcohol advection distorts the blob
User: "Why did my blob get destroyed?!" ❌
```

### What we DO want:

```
User paints Mineral Oil blob
Switches to Alcohol
Blob stays perfect (frozen)
User: "Cool, it persists!" ✅
Can't paint Alcohol (clear canvas first)
User: "OK, makes sense"
```

---

## 📊 Priority

**Current Priority**: LOW

**Reasoning**:
- SPH materials work together (Mineral Oil + Syrup ✅)
- Grid materials work together (Ink + Alcohol ✅)
- Mixing SPH + Grid is edge case
- User can clear canvas to switch

**Future Priority**: MEDIUM
- Nice-to-have for advanced users
- Enables complex multi-material art
- Requires careful architecture

---

## ✅ Summary

**Current Limitation**:
- SPH particles persist when switching materials
- Grid-based painting disabled while SPH exists
- Prevents corruption, not a bug

**Workaround**:
- Clear canvas to switch between SPH and grid materials
- Or stay within one material type

**Future Fix**:
- Separate texture layers
- True multi-material composition
- Estimated 2-4 hours

---

**Status**: DOCUMENTED & EXPECTED BEHAVIOR ✅
