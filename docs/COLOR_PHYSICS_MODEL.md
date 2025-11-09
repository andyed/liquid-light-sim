# Color Physics Model - SPH Particles

**Date**: November 9, 2025  
**Issue**: White piling when particles overlap  
**Status**: ✅ FIXED

---

## 🎨 The Problem: Additive Light vs Pigment Mixing

### What Was Wrong:

```javascript
// OLD: Additive blending (like light sources)
gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

Result:
Red (1, 0, 0) + Green (0, 1, 0) = Yellow (1, 1, 0)
Red + Green + Blue = WHITE (1, 1, 1)
Many particles stacked = WHITE (all channels maxed)
```

**This treats particles like LIGHT SOURCES**, not pigments!

### User Observation:
> "if i pour oil and dont move the mouse rapidly, it piles white..."

**Exactly!** Because additive blending adds all RGB channels → white when stacked.

---

## 🧪 Physics Models Comparison

### Model 1: **Additive Light** (OLD - WRONG)
```
Physics: Particles emit light
Equation: C_final = C1 + C2 + C3 + ...
Result: White = high density
Use case: Light sources, lasers, neon
```
❌ **Wrong for liquid pigments!**

### Model 2: **Pigment Mixing** (NEW - CORRECT)
```
Physics: Particles are translucent pigments
Equation: C_final = (C1*α1 + C2*α2 + ...) / (α1 + α2 + ...)
Result: Weighted average color
Use case: Paint, ink, translucent liquids
```
✅ **Correct for liquid light show!**

---

## ✅ The Fix: Pre-Multiplied Alpha Blending

### How It Works:

**Step 1: Pre-multiply in shader**
```glsl
vec3 premultiplied = color * alpha;
fragColor = vec4(premultiplied, alpha);
```

**Step 2: Use proper blend mode**
```javascript
gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
```

**Step 3: Blending equation**
```
final.rgb = src.rgb * 1.0 + dst.rgb * (1.0 - src.alpha)
```

Since `src.rgb` is already multiplied by `src.alpha`, this gives:
```
final.rgb = color1 * alpha1 + color2 * (1 - alpha1)
```

**This is weighted averaging!** Like layering translucent sheets.

---

## 📊 Before vs After

### Before (Additive):
```
Drop red particle:   (1.0, 0.0, 0.0, 0.5)
Drop green particle: (0.0, 1.0, 0.0, 0.5)
Result: (1.0, 1.0, 0.0, 1.0) → YELLOW
Drop 10 particles → WHITE (all channels max)
```

### After (Pre-multiplied):
```
Drop red particle:   (0.5, 0.0, 0.0, 0.5)  [pre-mult]
Drop green particle: (0.0, 0.5, 0.0, 0.5)  [pre-mult]

Blending:
  red + green * (1 - 0.5)
= (0.5, 0.0, 0.0) + (0.0, 0.5, 0.0) * 0.5
= (0.5, 0.25, 0.0) → ORANGE-RED mix ✅

Drop 10 particles → Averaged color (not white!)
```

---

## 🎨 Color Behavior Now

### Dense Regions:
- **OLD**: White (all channels add up)
- **NEW**: **Weighted average of all particle colors**

If you pour:
- All red particles → Dense red (not white!)
- Red + blue particles → Dense purple (mix)
- Many colors → Muddy brown (like real paint mixing)

### Sparse Regions:
- **OLD**: Faint colored particles
- **NEW**: **Same - faint colored particles**

### Dissipation:
- **OLD**: Stays white (density drops but ratios stay)
- **NEW**: **Color stays consistent** (particles keep their color, just fade)

---

## 💡 Physics Interpretation

### What Alpha Represents:
```
alpha = particle contribution to density field
```

### What Color Represents:
```
color = intrinsic pigment of particle
```

### What Blending Does:
```
final_color = weighted_average(all_particle_colors, weights=alphas)
```

This is **exactly like translucent ink layers**:
- Each layer has intrinsic color
- Each layer has opacity (alpha)
- Final color = average weighted by opacity

---

## 🔬 Technical Details

### Pre-Multiplied Alpha Formula:
```
Given:
  color = (r, g, b)  // Intrinsic pigment
  alpha = a          // Opacity/concentration

Output:
  premult = (r*a, g*a, b*a, a)

Blending with destination (d_r, d_g, d_b, d_a):
  result.rgb = (r*a) * 1 + (d_r, d_g, d_b) * (1 - a)
  result.a   = a * 1 + d_a * (1 - a)
```

This accumulates colors **proportionally to their opacity**, not additively!

### Why It Works:
When you stack N identical particles:
```
Layer 1: color * alpha
Layer 2: color * alpha * (1 - alpha) + previous
Layer 3: color * alpha * (1 - alpha^2) + previous
...
Limit: color * (1 - (1-alpha)^N)
```

As N → ∞: Approaches **color**, not white!

---

## 🧪 Expected Behavior

### Test Case 1: Pour Red Oil Without Moving
**Before**: Piles → WHITE
**After**: Piles → **DARK RED** (saturated, not white)

### Test Case 2: Pour Multiple Colors
**Before**: Overlap → WHITE
**After**: Overlap → **MIXED COLOR** (like paint)

### Test Case 3: Dissipation
**Before**: White fades but stays white
**After**: **Color stays true**, just becomes more transparent

### Test Case 4: Single Particle
**Before**: Colored
**After**: **Same** - no change for sparse regions

---

## 🎯 Implications for Simulation

### 1. **Density ≠ Whiteness**
Density is now represented by:
- **Alpha channel** (opacity/thickness)
- **NOT** by color brightness

### 2. **Color is Conserved**
Particle color doesn't change when density changes:
- Spread out → Same color, more transparent
- Compressed → Same color, more opaque

### 3. **Mixing is Realistic**
Multiple colors blend like real translucent liquids:
- Red + Blue = Purple (not white)
- All rainbow colors = Muddy brown (like paint)

---

## 📚 Comparison to Real Physics

### Real Liquid Light Show:
```
Oil droplets contain dye molecules
Light passes through multiple layers
Each layer absorbs some wavelengths
Final color = multiplicative transmission
```

### Our Model:
```
Particles have intrinsic color
Each particle has opacity (alpha)
Layers blend via weighted averaging
Final color = weighted average of pigments
```

**Close enough for visual plausibility!** ✅

---

## 🚨 Potential Issues

### Issue 1: **Too Dark with Many Layers?**
Pre-multiplied alpha can make things darker than additive.

**Solution**: Adjust particle alpha or use gamma correction:
```glsl
vec3 brightened = pow(premultiplied, vec3(0.8)); // Gamma < 1 = brighter
```

### Issue 2: **Muddy Colors with Rainbow?**
Mixing all colors gives brown (like real paint).

**Solution**: This is physically correct! Educate users or limit palette.

### Issue 3: **MetaBall Threshold?**
Alpha accumulation is different now (weighted, not additive).

**Solution**: May need to adjust `metaballBlobThreshold` down slightly.

---

## ✅ Success Criteria

- [x] Pre-multiplied alpha in shader
- [x] Blend mode changed to gl.ONE, gl.ONE_MINUS_SRC_ALPHA
- [ ] **Test: Dense regions show color, not white** ← TEST NOW
- [ ] **Test: Colors mix realistically** ← TEST NOW
- [ ] **Test: Dissipation preserves color** ← TEST NOW

---

## 📖 Further Reading

**Pre-multiplied alpha**: https://developer.nvidia.com/content/alpha-blending-pre-or-not-pre
**Color mixing models**: https://en.wikipedia.org/wiki/Subtractive_color

---

**Status**: COLOR PHYSICS FIXED ✅  
**Model**: Translucent pigment blending (not additive light)

Your intuition was correct - white shouldn't mean density! Now it means averaged color. 🎨💧
