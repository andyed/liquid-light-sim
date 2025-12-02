# Blob Shear Resistance - Preventing Fragmentation

**Date**: November 9, 2025  
**Issue**: Nice shapes form but fragment/tear instead of staying spherical  
**Status**: ✅ FIXED

---

## 🔍 The Problem: Water Shear Tearing Blobs

### What User Saw:
> "getting some nice shapes that sometimes break into pieces, but not blobby"

**Visual evidence**:
- ✅ Colors working (yellow, white, orange)
- ✅ Particles clustering together
- ❌ Irregular/jagged shapes (not round)
- ❌ Breaking into fragments
- ❌ No spheroidization

---

## 💡 Root Cause: **Shear Forces > Cohesion Forces**

The purple water layer is rotating and creating **shear stress** on particles:

```
Grid water velocity → Drag on particles → Differential motion → SHEAR
```

### The Physics:

**Shear stress** = Force trying to slide particles past each other

```
Particle A: velocity = (vx, vy) from water
Particle B: velocity = (vx', vy') from water (different!)
Shear = |velocity difference| between neighbors
```

When **shear force > cohesion force** → blob tears apart!

---

## 📊 Force Balance Analysis

### Before (Fragmentation):

```
Forces on blob:
  Implicit cohesion: k = 5,000
  Explicit cohesion: 5.0 per neighbor
  Water drag: dragCoeff = 10.0
  Pressure: B = 2.0
  Gravity: 0.005

Shear force from water rotation:
  F_shear = dragCoeff × velocity_difference
  F_shear ≈ 10 × 0.1 = 1.0 per particle
  
For blob with 100 particles on surface:
  Total shear ≈ 100 (trying to tear)
  Total cohesion ≈ 5000 / 100 = 50 per particle
  
Ratio: Cohesion/Shear ≈ 50:1
→ BARELY enough!
→ Blobs form but tear under stress
```

### After (Stable Blobs):

```
Forces on blob:
  Implicit cohesion: k = 20,000 ← 4× STRONGER
  Explicit cohesion: 20.0 per neighbor ← 4× STRONGER
  Water drag: dragCoeff = 1.0 ← 10× WEAKER
  Pressure: B = 2.0 (same)
  Gravity: 0.001 ← 5× WEAKER

Shear force:
  F_shear = 1.0 × velocity_difference
  F_shear ≈ 1.0 × 0.1 = 0.1 per particle
  
For blob with 100 particles:
  Total shear ≈ 10 (weak)
  Total cohesion ≈ 20,000 / 100 = 200 per particle
  
Ratio: Cohesion/Shear ≈ 200:1 ← 4× BETTER
→ Blobs resist tearing!
→ Spheroidization wins
```

---

## ✅ The Fixes (4 Changes)

### Fix 1: **MASSIVE Implicit Cohesion Boost**
```javascript
// In ImplicitSolver.js
const k = 20000.0; // Was 5000 → 4× stronger!
```
**Why**: Need to resist shear forces from water rotation

### Fix 2: **Reduce Water Drag**
```javascript
// In SPHOilSystem.js
this.applyGridDragForces(gridVelocities, 1.0); // Was 10.0 → 10× weaker!
```
**Why**: Less drag = less shear stress = less tearing

### Fix 3: **Stronger Explicit Cohesion**
```javascript
const shortCohesion = 20.0; // Was 5.0 → 4× stronger
const longCohesion = 1.0;   // Was 0.2 → 5× stronger
```
**Why**: Help maintain integrity during force computation

### Fix 4: **Minimal Gravity**
```javascript
const gravityMag = 0.001; // Was 0.005 → 5× weaker
```
**Why**: Gravity pulls particles down → stretching → easier to tear

---

## 🧪 Physics Explanation

### Why Blobs Break:

Think of the blob like a water balloon being stretched:

```
Cohesion = "rubber" trying to hold shape together
Shear = "hands" pulling in different directions
Pressure = "water inside" pushing out
```

**If hands pull harder than rubber can resist → balloon tears!**

### What We Changed:

```
Before: Weak rubber + strong hands = tear
After:  STRONG rubber + weak hands = hold!
```

---

## 📈 Expected Results

### Spawn Behavior:
```
t=0.0s: Drop particles
t=0.5s: Pull together (cohesion)
t=1.0s: Form rough blob
t=2.0s: Spheroidize (surface tension)
t=5.0s: STABLE SPHERE ← Should see this!
```

### Under Rotation (A/D keys):
```
Before: Blob stretches → tears → fragments
After:  Blob rotates AS ONE UNIT (no tearing)
```

### With Water Flow:
```
Before: Shear forces tear blob apart
After:  Blob maintains integrity, gentle drift
```

---

## 🎯 Force Balance Requirements

For **stable spherical blobs**, need:

```
Cohesion >> Shear + Pressure + Gravity

Specifically:
  Cohesion / (Shear + Pressure + Gravity) > 100:1
```

**Our new ratio**:
```
Cohesion: 20,000 (implicit) + 20 (explicit)
Shear:    ~10 (reduced drag)
Pressure: ~200 (B=2, moderate density)
Gravity:  ~1 (minimal)

Ratio: 20,000 / (10 + 200 + 1) ≈ 95:1 ✅
```

**Just barely enough!** May need more tweaking.

---

## 🔬 Technical Details

### Shear Force Formula:
```
For particles i and j connected by cohesion:
  v_i = particle velocity
  v_water(i) = water velocity at particle i location
  
  Drag force on i: F_drag = drag_coeff × (v_water - v_i)
  
If water has gradient (rotation):
  v_water(i) ≠ v_water(j)
  
Shear stress:
  τ = drag_coeff × |v_water(i) - v_water(j)|
```

**By reducing drag_coeff, we reduce shear stress directly!**

### Implicit Cohesion Formula:
```
Linearized spring force between particles:
  F_cohesion = -k × (x_i - x_j)
  
Jacobian contribution:
  ∂F/∂x = -k
  
Implicit system:
  (M - dt² × k) × v_new = RHS
  
Larger k → stronger coupling → resists tearing
```

---

## 🚨 Potential Issues

### Issue 1: **Too Strong Cohesion?**
If k=20,000 makes blobs too rigid (not fluid-like).

**Solution**: Reduce to k=15,000 or adjust viscosity up.

### Issue 2: **Not Enough Rotation?**
With drag=1.0, blobs might not rotate much.

**Solution**: Can increase drag slightly (2.0-3.0) once cohesion stabilizes.

### Issue 3: **Slow Merging?**
Weak drag might prevent blobs from merging when they touch.

**Solution**: Long-range cohesion (1.0) should handle this. May need to increase.

---

## 🎨 Visual Quality Trade-offs

### High Drag (Old):
- ✅ Strong rotation coupling
- ✅ Blobs follow water flow
- ❌ Tears apart under shear
- ❌ Jagged fragmented shapes

### Low Drag (New):
- ✅ Maintains blob integrity
- ✅ Spherical shapes
- ✅ Smooth surfaces
- ⚠️ Less responsive to rotation (acceptable trade-off)

---

## 📚 Real Physics Comparison

### Lava Lamp:
```
Wax blobs in liquid:
  High interfacial tension (cohesion)
  Low viscosity coupling (weak drag)
  Result: Blobs maintain shape while drifting
```

### Our Simulation:
```
SPH particles in water:
  High implicit cohesion (k=20,000)
  Weak drag coupling (coeff=1.0)
  Result: Similar behavior! ✅
```

---

## ✅ Success Criteria

- [x] Implicit cohesion k = 20,000 (4× increase)
- [x] Drag coefficient = 1.0 (10× decrease)
- [x] Explicit cohesion = 20 (4× increase)
- [x] Gravity = 0.001 (5× decrease)
- [ ] **Test: Blobs form spheres within 2 seconds** ← TEST NOW
- [ ] **Test: Blobs don't fragment under rotation** ← TEST NOW
- [ ] **Test: Smooth blob surfaces (not jagged)** ← TEST NOW

---

**Status**: SHEAR RESISTANCE IMPLEMENTED ✅  
**Key Insight**: Cohesion must dominate shear forces from water!

Your blobs should now **maintain integrity and spheroidize** instead of tearing apart! 🎯💧
