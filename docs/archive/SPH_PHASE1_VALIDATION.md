# SPH Phase 1: Incremental Validation Log

**Start Date**: Nov 8, 2025, 4:10pm  
**Approach**: Test each piece incrementally, validate before proceeding

---

## Milestone 1.1: Single Particle Position Validation

**Goal**: Click anywhere, see ONE dot appear exactly where clicked

### Test Cases

#### Test 1: Center Click
```
Input: Click dead center (0.5, 0.5)
Expected World: (0.0, 0.0)
Expected Visual: Dot at screen center
Status: [ ] PENDING
```

#### Test 2: Top-Left Click
```
Input: Click top-left (0.2, 0.2)
Expected World: (-0.288, 0.288)  // Left and UP from center
Expected Visual: Dot top-left quadrant
Status: [ ] PENDING
```

#### Test 3: Bottom-Right Click
```
Input: Click bottom-right (0.8, 0.8)
Expected World: (0.288, -0.288)  // Right and DOWN from center
Expected Visual: Dot bottom-right quadrant
Status: [ ] PENDING
```

#### Test 4: Edge Click (Near Boundary)
```
Input: Click near edge (0.9, 0.5)
Expected World: (0.384, 0.0)  // Near containerRadius (0.48)
Expected Visual: Dot near right edge
Status: [ ] PENDING
```

### Validation Checklist

- [ ] Particles spawn (see console log "🎯 PHASE 1.1 SPAWN")
- [ ] Screen coords match click position
- [ ] World coords use correct transform: `(x-0.5)*2*r`, `(0.5-y)*2*r`
- [ ] Visual position matches click (particle appears where clicked)
- [ ] No crashes or errors
- [ ] Particles are visible (20px dots)
- [ ] No motion blur or streaking
- [ ] MetaBall disabled (seeing raw particles)

### Expected Console Output

```
🎯 PHASE 1.1 SPAWN:
  Screen: (0.500, 0.500)
  World:  (0.000, 0.000)
  Spawned: 1, Total: 1

🔍 Particle 0 at (0.000, 0.000)
```

### Success Criteria

1. ✅ Click center → particle at center
2. ✅ Click top → particle above center
3. ✅ Click bottom → particle below center
4. ✅ Click left → particle left of center
5. ✅ Click right → particle right of center
6. ✅ World coords match expected transform
7. ✅ No NaN or Inf in coordinates
8. ✅ Particles visible as small colored dots

### Common Issues to Watch For

- ❌ Y-axis inverted (particles opposite of click)
- ❌ Particles all spawn at (0,0) regardless of click
- ❌ Particles spawn outside container
- ❌ NaN coordinates in console
- ❌ Particles invisible or too large
- ❌ Motion blur (particles should be STATIC)

---

## Milestone 1.2: Multiple Particles (PENDING)

**Prerequisites**: Milestone 1.1 must pass all tests

**Goal**: Click multiple times, see 10+ dots in correct positions

### Changes Required
```javascript
// In OilLayer.js splatColor()
const particlesPerSplat = 10; // Increase from 1 to 10
```

### Test Cases
- [ ] Click 10 times in different spots → 10 visible dots
- [ ] Each dot in correct position
- [ ] Total particle count increments correctly
- [ ] No performance degradation

---

## Milestone 1.3: Spatial Hash (PENDING)

**Prerequisites**: Milestone 1.2 must pass

**Goal**: Verify neighbor queries return correct particles

---

## Milestone 1.4: Radial Gravity (PENDING)

**Prerequisites**: Milestone 1.3 must pass

**Goal**: Particles drift slowly toward center, NOT shooting/bolting

### Critical Parameters
```javascript
gravity: 0.05  // GENTLE! Not -9.8
viscosity: 5.0  // HIGH damping to prevent runaway
```

---

## Notes

- **NO RUSHING**: Each milestone must be validated before proceeding
- **LOG EVERYTHING**: Console output is our ground truth
- **STATIC FIRST**: Phase 1.1-1.3 have NO motion
- **ONE CHANGE AT A TIME**: Never add multiple features simultaneously
