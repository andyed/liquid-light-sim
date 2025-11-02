# Oil Update Pipeline: Before vs After Fix

## ❌ BEFORE (Frozen Oil)

```
┌─────────────────────────────────────────────────────────────┐
│ OilLayer.update(dt)                                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Advect velocity by itself                              │
│     oilVelocity[t+1] = advect(oilVelocity[t])             │
│                                                             │
│  2. Apply water→oil coupling                               │
│     oilVelocity += waterVelocity * coupling * gradient     │
│                                                             │
│  3. Apply viscosity damping                                │
│     oilVelocity = diffuse(oilVelocity, viscosity)         │
│                                                             │
│  4. Advect thickness ✅ Motion happens                     │
│     oilThickness[t+1] = advect(oilThickness[t], velocity)  │
│                                                             │
│  5. Self-attraction ❌ Pulls back                          │
│     oilThickness += -∇thickness * attraction               │
│                                                             │
│  6. Surface tension ❌ Locks in place                      │
│     oilThickness += ∇²thickness * tension                  │
│     └─> Stronger on thick regions! (smoothstep weighting)  │
│                                                             │
│  Result: Oil velocity exists but thickness stays frozen    │
│          because forces counteract the advection           │
└─────────────────────────────────────────────────────────────┘
```

### Why This Failed
- Surface tension modified **thickness directly** after advection
- Each frame: advection moved oil → surface tension pulled it back
- Net result: ~zero displacement despite having velocity

---

## ✅ AFTER (Moving Oil)

```
┌─────────────────────────────────────────────────────────────┐
│ OilLayer.update(dt)                                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Advect velocity by itself                              │
│     oilVelocity[t+1] = advect(oilVelocity[t])             │
│                                                             │
│  2. Apply water→oil coupling                               │
│     oilVelocity += waterVelocity * coupling * gradient     │
│                                                             │
│  3. Apply viscosity damping                                │
│     oilVelocity = diffuse(oilVelocity, viscosity)         │
│                                                             │
│  4. Surface tension FORCE ✅ Creates cohesion              │
│     gradTh = ∇thickness                                    │
│     curvature = ∇²thickness                                │
│     force = normalize(gradTh) * |curvature| * tension      │
│     oilVelocity += force * dt                              │
│                                                             │
│  5. Advect thickness ✅ Motion happens                     │
│     oilThickness[t+1] = advect(oilThickness[t], velocity)  │
│                                                             │
│  6. Optional smoothing (minimal)                           │
│                                                             │
│  Result: Oil moves with cohesive "blobby" behavior         │
│          Surface tension guides velocity, not thickness     │
└─────────────────────────────────────────────────────────────┘
```

### Why This Works
- Surface tension creates **force on velocity** before advection
- Velocity carries information about both coupling and cohesion
- Advection transports thickness by this combined velocity field
- Result: Realistic motion with cohesive blob formation

---

## Key Insight

### Wrong Approach (Direct Thickness Modification)
```
thickness[t+1] = advect(thickness[t]) + σ·∇²thickness
                 ↑ moves it         ↑ pulls it back
                 = net zero motion
```

### Correct Approach (Force on Velocity)
```
velocity[t+1] = velocity[t] + coupling + σ·force(∇thickness)
                              ↑ motion   ↑ cohesion
thickness[t+1] = advect(thickness[t], velocity[t+1])
                 ↑ transports by combined velocity
                 = visible motion with cohesion
```

---

## Physical Correctness

Real fluid dynamics equations:

```
Momentum:  ρ(∂v/∂t + v·∇v) = -∇p + μ∇²v + σκn     ← Surface tension is a FORCE
                                            ↑
Mass:      ∂ρ/∂t + ∇·(ρv) = 0                     ← Advection by velocity
```

Not:
```
Mass: ∂ρ/∂t + ∇·(ρv) = D∇²ρ  ← This would be diffusion, not surface tension
```

Surface tension appears in the **momentum equation** (forces on velocity), not the continuity equation (thickness/density transport).

---

## Visual Comparison

### Before Fix
```
Frame 0:  ●●●●  (oil blob at rest)
          velocity = 0.5 →

Frame 1:  ●●●●  (advection moves it right →)
           →→→  (but surface tension pulls thickness ← left)
          ●●●●  (back to original position!)
```

### After Fix  
```
Frame 0:  ●●●●  (oil blob at rest)
          velocity = 0.5 →

Frame 1:  ●●●●  (surface tension adds cohesive force to velocity)
           →→→  (velocity now includes both motion and cohesion)
            ●●●● (advection transports by combined velocity →)
```

---

## Implementation Files

| File | Purpose | Change |
|------|---------|--------|
| `surface-tension-force.frag.glsl` | New shader | Computes force from curvature, applies to velocity |
| `OilLayer.js` | Pipeline order | Moved surface tension before advection |
| `simulation.js` | Shader loading | Added `surfaceTensionForceProgram` |

---

## Tuning Parameters

After this fix, adjust these for desired behavior:

- `surfaceTension` (0.001 - 0.02): Controls blob cohesion strength
- `couplingStrength` (0.001 - 0.01): Controls oil response to water
- `oilViscosity` (0.1 - 0.5): Controls oil flow resistance
- `oilDragStrength` (5 - 20): Controls water routing around oil

Start with medium values and tune based on visual results.
