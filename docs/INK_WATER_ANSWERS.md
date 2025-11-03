# Ink/Water Questions Answered

## Q: Is ink the same as water?

**Yes.** Ink IS the water layer's color field.

```javascript
// When painting "Ink" material:
simulation.splat(x, y, color, radius);
  → water.splatColor(x, y, color, radius);  // Paints into water's color texture
  → water.splatVelocity(x, y, vx, vy, radius);  // Adds velocity to water
```

### Architecture:
- **Water layer** = velocity field + color field
  - Velocity: forces, rotation, viscosity, pressure
  - Color: ink dye (RGB) transported by velocity
- **Oil layer** = separate velocity + thickness field
  - Couples to water velocity
  - Advects independently

### So "Ink" means:
- ✅ Colored water (dye in water)
- ✅ Shares water's velocity field
- ✅ Subject to water's overflow control
- ❌ Not a separate layer

## Q: Is the issue motion or water volume?

**Both, but primarily MOTION.**

### Before fixes:
1. **No ambient flow** → Nothing moved without user input
2. **Rotation too strong** (1.2) → Overflow triggered immediately
3. **Vorticity too high** (0.4) → Shredded ink into pixel soup

### After fixes:
1. ✅ Ambient flow (0.12) → Gentle constant motion
2. ✅ Reduced rotation button (1.2 → 0.3) → 75% gentler
3. ✅ Reduced vorticity (0.4 → 0.25) → Less shredding

## Container Fill Level

Real liquid light shows:
- Container **full** of water/carrier fluid
- Ink/oil drops **on top** of existing water
- Water already moving (projector spin, heat)

Current simulation:
- Container **conceptually full** of water
- But water velocity/color = 0 until painted
- This is abstract - no "empty space"

### Should we visualize water volume?
**No need.** The simulation treats the entire container as "filled with water" - you just can't see it until you add colored ink.

Think of it like:
- Empty = clear water (invisible)
- Painted = colored water (visible ink)

## Why Ink Was Disappearing

### Old behavior (rotation = 1.2):
1. Paint ink
2. Hit rotation button → 1.2 force
3. Strong rotation → rapid occupancy increase
4. Overflow triggers at 90% occupancy
5. Vorticity (0.4) shreds ink into tiny pixels
6. Overflow damps those pixels → "pixel soup" disappears
7. **Under 3 rotations: ink gone**

### New behavior (rotation = 0.3):
1. Paint ink
2. Ambient flow (0.12) keeps it moving
3. Hit rotation button → 0.3 force (4x gentler)
4. Slower occupancy increase
5. Vorticity (0.25) creates swirls but less shredding
6. Overflow triggers less often, less aggressive
7. **Ink should persist 10+ rotations**

## Default Rotation

### Current settings:
- **Ambient**: 0.12 (always on, gentle)
- **Button boost**: 0.3 (75% reduction from 1.2)
- **Could go lower?** Yes, try 0.15 or 0.2

### Recommendations:

**Keep ambient at 0.12:**
- Matches real liquid light show behavior
- Oil/ink moves immediately when painted
- Gentle enough to not cause overflow

**Button could be even gentler:**
- 0.3 might still be strong for some uses
- Could reduce to 0.2 (5/6 reduction from 1.2)
- Or make it a slider: 0.15 - 0.5 range

**Or remove button entirely:**
- Use 'R' key hold for boost (already works)
- Button just adds +0.18 to ambient = 0.3 total
- Simpler UX

## Parameters Summary

| Setting | Old | New | Purpose |
|---------|-----|-----|---------|
| **Ambient rotation** | 0.0 | 0.12 | Always-on gentle flow |
| **Button rotation** | 1.2 | 0.3 | Boost rotation when clicked |
| **Vorticity** | 0.4 | 0.25 | Turbulence (less shredding) |
| **Water overflow** | 0.90 | 0.90 | Unchanged (ink limit) |
| **Oil overflow** | 0.85 | 0.95 | Higher (persists longer) |

## Testing

```javascript
// In browser console:
console.log('Ambient:', simulation.rotationBase);  // 0.12
console.log('Vorticity:', simulation.vorticityStrength);  // 0.25
console.log('Water overflow:', simulation.overflowUpper);  // 0.90

// Test ink persistence:
// 1. Paint ink
// 2. Click rotation button
// 3. Count rotations until ink significantly fades
// Expected: 10+ rotations (was <3)
```

---

**Bottom Line:** Ink is water's color. Motion (not volume) was the issue. Rotation was 4x too strong. Now gentle ambient + reduced boost = persistent ink.
