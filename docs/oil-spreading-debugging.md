# Oil Spreading Issues - Debugging Notes

## Problem
Oil blobs "explode" across the entire canvas within seconds, creating a uniform desaturated wash instead of staying as localized droplets.

## Root Causes Discovered

### 1. MacCormack Advection Numerical Diffusion
**Issue:** MacCormack's error correction step inherently spreads values:
- Backward advection samples at slightly different location
- Error term `0.5 * (current - backward)` creates numerical diffusion
- Min/max limiting samples 9 neighbors → further spreading
- Even at 0.1 blend factor, enough to diffuse thin oil everywhere

**Lesson:** MacCormack is excellent for accuracy (ink) but terrible for conservation/localization (oil). Semi-Lagrangian is more stable.

**Fix:** Disabled MacCormack for oil entirely, use pure semi-Lagrangian.

### 2. Water→Oil Coupling Too Aggressive
**Issue:** Oil velocity was copying or closely following water velocity everywhere:
- Original: `if (no oil) vOil = vWater` → creates oil velocity field everywhere
- Coupling range 30-80% meant thin oil followed water very closely
- Water moves everywhere → oil velocity everywhere → oil spreads

**Lesson:** Oil should only have velocity where there's actual oil thickness > threshold. Zero velocity in empty regions prevents "ghost" oil spreading.

**Fix:** Changed to `if (th < 0.01) vOil = 0`, reduced coupling multiplier by 50%.

### 3. Tint Blending Accumulation
**Issue:** Initial splat implementation was additive:
```glsl
rgb = existing.rgb + (u_color * thickness)
```
Multiple splats → accumulation → grey/white centers → desaturation

**Lesson:** Oil tint should be thickness-weighted average, not accumulation.

**Fix:** Implemented proper weighted blending based on thickness contributions.

### 4. Thickness Dissipation Created Spiky Decay
**Issue:** Attempted to fix spreading with per-frame dissipation:
- Threshold 0.05, 5% loss per frame
- Created unnatural "star burst" decay patterns
- Sharp spikes at blob edges as dissipation ate away unevenly

**Lesson:** Artificial dissipation creates unnatural artifacts. Better to fix the root cause (advection/coupling) than add cleanup.

**Fix:** Removed dissipation entirely.

### 5. Aggressive Cohesion Forces
**Issue:** Tried to implement droplet breakup via surface tension:
- Laplacian-based forces pulling toward thick regions
- Too strong → instabilities and bubble pops
- Created more spreading instead of cohesion

**Lesson:** Surface tension effects require the full surfactant/evaporation system from spec section 10. Simple Laplacian forces are too crude and cause instabilities.

**Fix:** Disabled cohesion forces (set strength to 0.0).

## Correct Architecture (Final)

### Oil Advection
- **Pure semi-Lagrangian** (no MacCormack)
- Single backward trace
- No error correction
- No neighborhood sampling
- Minimal numerical diffusion

### Water→Oil Coupling
- **Zero velocity where no oil** (th < 0.01)
- Coupling range: 10-40% (reduced from 30-80%)
- Additional 50% multiplier on force application
- Only affects regions with actual oil

### Tint Management
- **Thickness-weighted blending** in splats
- **Thickness² visibility** in rendering (thin oil nearly invisible)
- Prevents accumulation and desaturation

### Overflow Control
- Thresholds: 60-70% (reasonable, not panicked)
- Detection thresholds: 0.03-0.20 (ignores trace amounts)
- Max damping: 40% strength
- Every 8 frames (same as ink)

## Forces That Should Work (Once Base Is Stable)
- ✅ Oil viscosity (90+ iterations) - slows flow, works well
- ✅ Rim absorption - prevents boundary accumulation
- ❌ Marangoni (disabled temporarily) - was adding to spreading
- ❌ Cohesion (disabled) - requires full surfactant system
- ❌ Smoothing (disabled) - was spreading thickness

## What Works Now
With all effects disabled (Marangoni=0, smoothing=0, minimal coupling):
- Oil blobs should stay localized
- Only spread via actual velocity field transport
- Overflow control handles any gradual accumulation

Once this baseline is stable, can gradually re-enable:
1. First: Increase coupling slightly (test each increment)
2. Second: Re-enable Marangoni at very low strength (0.1)
3. Last: Add minimal smoothing if edges too sharp (0.001)

## Key Insight
**Conservation vs Accuracy Trade-off:**
- Ink: Wants accuracy → MacCormack, higher fidelity
- Oil: Wants conservation → Semi-Lagrangian, maximum stability
- Different physics goals require different numerical methods

## Future Work (V2+)
For proper droplet breakup (spec section 10):
- Add volatile surfactant field `C(x,y)`
- Advection + diffusion + evaporation
- Edge-biased evaporation (higher at rims)
- σ(thickness, surfactant) = σ0 + k_th*th + k_c*C
- Then cohesion forces will work naturally

## Recommended Approach If Reverting
1. Start with oil layer using pure semi-Lagrangian advection
2. Minimal water→oil coupling (< 10%, zero where no oil)
3. No Marangoni initially
4. No smoothing initially
5. Get stable localized blobs first
6. Then add forces incrementally, testing after each

**Test case:** Paint a blob, don't rotate, wait 10 seconds. Blob should barely move. If it spreads, forces are too strong.
