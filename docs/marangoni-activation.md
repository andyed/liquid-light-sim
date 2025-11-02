# Marangoni Effects Activation

## Implementation Complete

All Marangoni prerequisites were completed and the effect is now active in the simulation.

### Final Activation Steps

1. **Fixed shader bug:**
   - Changed `v_uv` → `v_texCoord` in marangoni.frag.glsl to match fullscreen vertex shader
   
2. **Loaded shader program:**
   - Added `marangoniProgram` loading in Simulation.init()
   - Shader was already being called in WaterLayer.update() (lines 161-162)

3. **Enhanced Marangoni forces (dramatic tuning):**
   - Gradient-dependent amplification: `Ft *= (1.0 + gradMag * 5.0)`
   - Sharper interfaces get 5× stronger forces
   - Increased clamp from 0.05 → 0.15 for more dramatic velocity changes

4. **Material parameter tuning for controlled effects:**
   - **Mineral Oil:**
     - `marangoniStrength`: **0.3** (balanced, adjustable with `]` key)
     - `marangoniKth`: **0.5** (moderate thickness→tension conversion)
     - `marangoniEdgeBand`: **2.0** (interface detection width)
     - `couplingStrength`: **0.002** (oil→water gradient forces)
   
5. **Reduced rendering artifacts:**
   - `oilOcclusion`: 0.45 → **0.25** (less ink darkening under oil)
   - `refractStrength`: 0.010 → **0.008** (less color distortion)

6. **Increased coupling for better interaction:**
   - `couplingStrength`: 0.003 → **0.005**

7. **Oil Advection Upgraded to MacCormack (2nd-order):**
   - Enabled MacCormack error correction for oil thickness field
   - Added automatic thin-oil dissipation (thickness < 0.05 loses 5% per frame)
   - Rim absorption (10% thickness, 15% tint at boundaries)
   - Result: Sharp features, no numerical diffusion, localized blobs
   
8. **Oil Conservation & Spreading Control:**
   - Water→Oil coupling reduced: 30-80% → **10-40%** range, removed 2× multiplier
   - Tint visibility gated by thickness² (thin oil nearly invisible)
   - Thickness-weighted splat blending prevents color accumulation
   - Smoothing disabled by default (MacCormack sufficient)
   - Result: Oil stays localized, no canvas-wide color wash

## Expected Visual Effects

### Marangoni Peacock Feathering
At oil-water interfaces with sharp thickness gradients:
- **Dendritic spreading patterns** - oil fingers extend into water
- **Interfacial instabilities** - wavy, unstable boundaries
- **Peacock eye patterns** - circular features at gradient peaks
- **Beading and fingering** - oil breaks into detailed structures

### Material-Specific Behavior
- **Ink (1):** No Marangoni, pure ink flow
- **Alcohol (3):** Weak Marangoni (0.25), subtle feathering
- **Mineral Oil (2):** **Strong Marangoni (1.2)**, dramatic peacock patterns ⬅️ main effect
- **Syrup (4):** Moderate Marangoni (0.60), slow dramatic spreading
- **Glycerine (5):** High Marangoni (0.70), persistent beautiful patterns

## Current Marangoni Parameters

| Parameter | Mineral Oil | Purpose |
|-----------|-------------|---------|
| `marangoniStrength` | 1.2 | Overall effect magnitude |
| `marangoniKth` | 1.5 | Thickness → surface tension conversion |
| `marangoniEdgeBand` | 3.0 pixels | Interface detection width |
| Gradient amplification | 5× | Sharper gradients = stronger forces |
| Force clamp | 0.15 | Max velocity change per frame |

## Physics Behind the Magic

**Marangoni Effect:**
```
Surface tension gradient: ∇σ ∝ ∇(oil thickness)
Tangential force at interface: F_t = ∇σ
Creates outward spreading from thick → thin regions
```

**Why it creates peacock patterns:**
1. Small thickness variations → surface tension gradients
2. Gradients drive fluid motion tangential to interface
3. Motion amplifies original perturbations (positive feedback)
4. System is **unstable** → beautiful chaotic patterns emerge
5. Viscosity damps chaos → organic, controlled feathering

**Gradient amplification:**
```glsl
Ft *= (1.0 + gradMag * 5.0)
```
Sharp interfaces (high gradMag) get explosive forces → fingering instabilities.

## Live Tuning

Press these keys while running:
- **`[`** - Decrease Marangoni strength
- **`]`** - Increase Marangoni strength
- **`;`** - Decrease k_th (thickness gain)
- **`'`** - Increase k_th (thickness gain)
- **`,`** - Decrease edge band (narrower interface)
- **`.`** - Increase edge band (wider interface)

HUD shows current values in real-time.

## Troubleshooting

### Not seeing peacock patterns?
- Increase `marangoniStrength` with `]` key (try 1.5-2.0)
- Increase `marangoniKth` with `'` key (try 2.0+)
- Paint thicker oil blobs (hold mouse longer)
- Rotate gently - too fast overwhelms fine details

### Patterns too chaotic/unstable?
- Decrease `marangoniStrength` with `[` key
- Increase oil viscosity iterations (in presets)
- Increase oil smoothing rate (smoother edges)

### Ink looks oversaturated?
- Reduce `oilOcclusion` in material preset
- Reduce `refractStrength` in material preset
- Use lighter oil colors when painting

### Still seeing horizontal bands?
- Increase `oilSmoothingRate` further (0.030+)
- Check that cap was removed from OilLayer.js line 178
- Try switching materials to reload presets

## Future Enhancements

Potential additions for even more dramatic effects:

1. **Controlled noise injection**
   - Add subtle perturbations at interfaces
   - Seeds instabilities more reliably
   
2. **Interface sharpening**
   - Detect and amplify sharp oil-water boundaries
   - Enhances peacock eye formation

3. **Vorticity injection at interfaces**
   - Create swirls at gradient peaks
   - Mimics real turbulent mixing

4. **Temperature simulation**
   - True thermocapillary Marangoni
   - Heat sources create dramatic spreading

5. **Surfactant effects**
   - Vary surface tension chemically
   - More complex pattern formation

## Documentation Links

- `marangoni-implementation.md` - Full physics spec
- `oil-velocity-implementation.md` - Prerequisite 1
- `oil-viscosity-implementation.md` - Prerequisite 2  
- `coupling-forces-implementation.md` - Prerequisite 3
- `oil-conservation-implementation.md` - Prerequisite 4
- `simulation.md` - Complete system architecture
