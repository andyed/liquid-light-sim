# Testing Checklist - After Reload

## Before Testing: RELOAD PAGE
**⚠️ CRITICAL:** Changes won't take effect until you reload!
- Press **Cmd+Shift+R** (Mac) or **Ctrl+Shift+R** (Windows/Linux)
- This recompiles all shaders with fixes

## Quick Tests (2 minutes)

### 1. Oil Movement Test
```
1. Select Mineral Oil (press 2)
2. Paint a blob (left click + drag)
3. Watch for 5 seconds
Expected: Oil should start swirling immediately (ambient flow)
```

### 2. Oil Persistence Test  
```
1. Paint oil blob
2. Let sit for 30 seconds without touching
Expected: Oil stays visible, doesn't fade to nothing
```

### 3. Ink Persistence Test
```
1. Select Ink (press 1)
2. Paint ink blob
3. Click rotation button (↻)
4. Count rotations until ink significantly fades
Expected: 10+ rotations (was <3 before fix)
```

### 4. Color Vibrancy Test
```
1. Select Ink (press 1)
2. Paint cyan ink (default color)
3. Look at center of blob
Expected: Center stays cyan, not gray/washed out
```

## Console Checks

```javascript
// Verify settings applied
console.log('Ambient:', simulation.rotationBase);  // Should be 0.12
console.log('Oil smoothing:', simulation.oilSmoothingRate);  // Should be 0.0
console.log('Vorticity:', simulation.vorticityStrength);  // Should be 0.25
console.log('Absorption:', renderer.absorptionCoefficient);  // Should be 1.5
console.log('Oil threshold:', simulation.oilOverflowUpper);  // Should be 0.95
console.log('Water threshold:', simulation.overflowUpper);  // Should be 0.90
```

## Diagnostic Scripts

### Full Oil Diagnostic
```javascript
fetch('diagnose-oil-motion.js').then(r => r.text()).then(eval)
```
Shows:
- All settings
- Oil velocity values
- Water velocity values
- Oil thickness values
- Recommendations

### Compare Oil vs Water
```javascript
fetch('test-oil-vs-water.js').then(r => r.text()).then(eval)
```
Paints both, measures dissipation over 30 seconds

## What Good Looks Like

✅ **Oil moves immediately** - gentle swirl without user input
✅ **Oil persists 30+ seconds** - stays visible when idle
✅ **Ink persists 10+ rotations** - doesn't disappear quickly
✅ **Colors vibrant** - centers bright, not gray
✅ **Gentler motion** - swirls not chaotic

## What Bad Looks Like

❌ **Oil frozen** - doesn't move at all
❌ **Oil fades quickly** - gone in <10 seconds
❌ **Ink disappears fast** - gone in <3 rotations  
❌ **Gray centers** - only edges show color
❌ **Chaotic shredding** - ink turns to pixel soup

## If Problems Persist

### Oil Still Not Moving:
1. Check console: `simulation.rotationBase` should be 0.12
2. Check coupling: `simulation.couplingStrength` should be 0.6-0.8
3. Run diagnostic: `fetch('diagnose-oil-motion.js').then(r => r.text()).then(eval)`

### Oil Still Dissipating:
1. Check: `simulation.oilSmoothingRate` should be 0.0
2. Paint MORE oil (hold mouse down longer)
3. Check oil strength was increased to 2.5

### Ink Still Fading Fast:
1. Try lower rotation: `simulation.rotationBase = 0.08`
2. Try lower vorticity: `simulation.vorticityStrength = 0.15`
3. Check overflow isn't triggering: monitor occupancy %

### Colors Still Washing Out:
1. Try lower absorption: `renderer.absorptionCoefficient = 1.0`
2. Or use K key to cycle absorption levels
3. Check you're on latest code (absorption default is 1.5)

## Manual Parameter Tweaks

If you want to experiment:

```javascript
// Even gentler motion
simulation.rotationBase = 0.08;
simulation.vorticityStrength = 0.15;

// More oil per splat
// (need to modify code - oilStrength in OilLayer.js line 376)

// More vibrant colors
renderer.absorptionCoefficient = 1.0;

// More persistent materials
simulation.oilOverflowUpper = 0.98;  // Almost never overflow
```

---

**Most Common Issue:** Forgetting to reload page after code changes!
