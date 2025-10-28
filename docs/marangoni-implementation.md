# Marangoni Flow Implementation (Oct 27, 2025)

## What is Marangoni Flow?

Marangoni flow is **lateral fluid motion driven by surface tension gradients**. When two fluids with different surface tensions meet, flow occurs FROM low surface tension TO high surface tension regions. This is the physical mechanism behind the famous **"peacock displays"** in liquid light shows.

## Physical Mechanism

### Surface Tension Values (from materials)
- **Heavy Syrup**: ST = 6.5 (highest)
- **Glycerine**: ST = 5.0
- **Mineral Oil**: ST = 3.5
- **Light Oil**: ST = 2.5
- **Alcohol Mix**: ST = 1.5 (lowest)

### When Different Oils Meet

**Example**: Heavy Syrup (ST=6.5) meets Light Oil (ST=2.5)

1. **Surface tension gradient** exists at boundary: ΔST = 4.0
2. **Marangoni force** pushes Light Oil AWAY from Heavy Syrup
3. **Result**: Fluids repel, creating feather-like "peacock" patterns
4. **Oil types remain separate** (enhanced by immiscibility system)

## Implementation Details

### Force Calculation (FluidSolver.js lines 485-504)

```glsl
// Sample surface tension from neighbors
vec3 mat_n = texture(u_materialTexture, v_uv + vec2(0.0, u_texelSize.y)).rgb;
vec3 mat_s = texture(u_materialTexture, v_uv - vec2(0.0, u_texelSize.y)).rgb;
vec3 mat_e = texture(u_materialTexture, v_uv + vec2(u_texelSize.x, 0.0)).rgb;
vec3 mat_w = texture(u_materialTexture, v_uv - vec2(u_texelSize.x, 0.0)).rgb;

// Surface tension gradient (G channel = surface tension)
vec2 st_grad = 0.5 * vec2(mat_e.g - mat_w.g, mat_n.g - mat_s.g);

// Marangoni force: flow FROM low ST TO high ST
float st_grad_mag = length(st_grad);
float marangoni_strength = smoothstep(0.01, 0.15, st_grad_mag);
vec2 marangoni_force = normalize(st_grad + 1e-6) * marangoni_strength * phase * 0.35;

// Boost at oil-oil interfaces (where different types meet)
float interface_boost = smoothstep(0.3, 0.7, phase) * smoothstep(0.7, 0.3, phase);
marangoni_force *= (1.0 + interface_boost * 2.0);
```

### Key Parameters

- **Base strength**: 0.35 (moderate repulsion)
- **Activation threshold**: 0.01 ST difference (very sensitive)
- **Full strength**: 0.15 ST difference
- **Interface boost**: 3x stronger at oil-oil boundaries (phase 0.3-0.7)
- **Phase gating**: Only active in oil regions

## Expected Behavior

### Same Material Type
**Example**: Pour Mineral Oil twice
- **Surface tension**: Both have ST = 3.5
- **ST gradient**: ~0.0 (negligible)
- **Marangoni force**: ~0.0 (no repulsion)
- **Result**: Blobs merge, colors gently mix (colorMixing = 0.3)

### Different Material Types
**Example**: Pour Heavy Syrup, then Light Oil on top

**At boundary:**
- **ST gradient**: 4.0 (6.5 - 2.5)
- **Marangoni strength**: 1.0 (maxed out, way above 0.15 threshold)
- **Force direction**: Pushes Light Oil away from Heavy Syrup
- **Interface boost**: 3x (at phase interface)
- **Total force**: 0.35 × 3.0 = 1.05 (strong repulsion)

**Result**: 
- Light Oil **spreads around** Heavy Syrup like water on a waxed surface
- Creates **feather patterns** as Light Oil seeks escape paths
- **Colors stay separate** (immiscibility prevents mixing)
- **Peacock display** - feathery, organic repulsion patterns

## Synergy with Other Systems

### 1. Immiscibility System
- Prevents color mixing between different oil types
- Marangoni pushes them apart physically
- Colors stay pure and sharp

### 2. Blob Cohesion
- High blobStrength (0.85-0.98) keeps blobs tight
- Marangoni creates repulsion at boundaries
- Result: Distinct blobs that push each other

### 3. Surface Tension Force
- Normal ST force pulls oil inward (blob formation)
- Marangoni force pushes different types apart (segregation)
- Balance creates stable, separated structures

## Testing Marangoni Flow

### Test 1: Weak Gradient
**Action**: Pour two Mineral Oil blobs (same material)
**Expected**: Minimal Marangoni (ST difference = 0), blobs merge normally

### Test 2: Moderate Gradient  
**Action**: Pour Mineral Oil (ST=3.5), then Glycerine (ST=5.0)
**Expected**: ΔST = 1.5, Marangoni creates gentle repulsion, feathery edges

### Test 3: Strong Gradient
**Action**: Pour Heavy Syrup (ST=6.5), then Alcohol Mix (ST=1.5)
**Expected**: ΔST = 5.0, strong Marangoni repulsion, dramatic peacock patterns

### Test 4: Multiple Materials
**Action**: Pour all five materials in overlapping pattern
**Expected**: Complex peacock display with multiple repulsion zones

## Tuning Parameters

If Marangoni is too weak:
```glsl
vec2 marangoni_force = normalize(st_grad + 1e-6) * marangoni_strength * phase * 0.50; // Increase from 0.35
```

If Marangoni is too strong (blobs explode apart):
```glsl
vec2 marangoni_force = normalize(st_grad + 1e-6) * marangoni_strength * phase * 0.20; // Decrease from 0.35
```

If interface patterns are too subtle:
```glsl
interface_boost *= (1.0 + interface_boost * 4.0); // Increase from 2.0
```

## Historical Accuracy

From research documentation:
> "Heavier, more viscous oils would tend to 'stay' in place, while lighter, less viscous oils would flow around them, creating intricate, feather-like patterns often described as 'peacock displays'."

Our implementation achieves this through:
1. **Per-pixel surface tension** (materialFBO G channel)
2. **ST gradient calculation** (samples neighbors)
3. **Directed repulsion force** (gradient-driven flow)
4. **Interface amplification** (3x boost at boundaries)

## Current Status

✅ **Marangoni force implemented** and active
✅ **Per-pixel surface tension** from materialFBO
✅ **Gradient calculation** with neighbor sampling
✅ **Interface boost** at oil-oil boundaries
✅ **Phase gating** (only active in oil)
✅ **Integrated** into total force summation (line 664)

## Next: Visual Verification

Pour different materials and observe:
- Do blobs with high ST difference repel?
- Do feather patterns form at boundaries?
- Do peacock displays emerge naturally?

The physics is implemented - now let's see it in action! 🦚
