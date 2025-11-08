# Oil Layer Improvements - Realistic Behavior

## What Changed

The oil simulation has been completely overhauled to behave like real oil with dramatic visual effects.

## Key Improvements

### 1. **Viscosity Re-enabled** ✅
Previously disabled due to over-damping, now properly tuned:
- Oil flows slowly and smoothly (thick, sluggish movement)
- Viscosity factor: `0.15x` to prevent velocity kill
- 30 iterations maximum for performance
- Creates realistic resistance to flow

### 2. **Surface Tension - 4x Stronger** 💧
Dramatically increased for visible pooling and breakup:
- Force multiplier: `2000.0` (was `500.0`)
- Max force: `1.5` (was `0.5`) - allows dramatic cohesion
- Thickness-dependent: thick regions pull together harder
- **Result**: Oil breaks into droplets when thin, pools into blobs when thick

### 3. **Realistic Light Interaction** 🌈
Complete rewrite of oil rendering shader:

#### Thin-Film Interference (Iridescence)
- Real physics: wavelength-dependent constructive/destructive interference
- Creates rainbow patterns on oil surface (like soap bubbles)
- Thickness-based coloration

#### Fresnel Reflection
- Schlick's approximation for accurate specular highlights
- Viewing-angle dependent reflection
- Oil-water interface (IOR 1.1)

#### Chromatic Aberration
- Separate refraction for R/G/B channels
- Red bends less, blue bends more (realistic dispersion)
- 3x stronger refraction: `0.025` (was `0.010`)

#### Edge Highlighting
- Bright rims where oil pools
- Gradient-based detection
- Enhances blob visibility

#### Variable Density Visualization
- Thicker oil = darker (occlusion up to 25%)
- Density-based darkening
- Shows accumulation clearly

### 4. **Updated Material Presets**
All oil materials now have realistic parameters:

| Material | Viscosity | Surface Tension | Refraction | Behavior |
|----------|-----------|-----------------|------------|----------|
| **Mineral Oil** | 0.25 | 15.0 | 0.025 | Medium viscosity, strong pooling |
| **Alcohol** | 0.15 | 8.0 | 0.018 | Low viscosity, moderate pooling |
| **Syrup** | 0.6 | 25.0 | 0.030 | High viscosity, dramatic pooling |
| **Glycerine** | 0.4 | 18.0 | 0.028 | Medium-high viscosity, strong pooling |

## Visual Effects You'll See

### Droplet Formation & Breakup
- Thin stretched oil **breaks apart** into separate droplets
- Droplets **pull together** into round blobs (surface tension)
- Clear **separation** between oil regions

### Pooling Behavior
- Oil **accumulates** in thick blobs
- **Variable density** visible as darker pools
- Realistic **flow-around** water ink

### Light Effects
- **Rainbow iridescence** on thin oil films
- **Specular highlights** on thick oil pools
- **Chromatic distortion** of background
- **Bright edges** where oil meets water

## How to Use

### Switch to Oil Material
1. Press `2` key or click "Mineral Oil" in menu
2. Paint with mouse/touch - oil layer automatically active
3. Watch it pool, break apart, and reflect light!

### Adjust Parameters (Menu)
- **Surface Tension**: Higher = more dramatic pooling
- **Viscosity**: Higher = slower, thicker flow
- **Refraction**: Higher = more distortion
- **Occlusion**: Higher = darker under thick oil

### Debug Views
Press `D` to cycle through debug modes:
- **Oil Thickness**: See thickness field directly
- **Oil Gradient**: See surface curvature
- **Occupancy Split**: Compare water ink vs oil coverage

## Technical Details

### Physics Changes
- **Viscosity**: Re-enabled with 0.15x scaling factor
- **Surface Tension Force**: 4x multiplier increase
- **Thickness Boost**: Amplifies cohesion in thick regions
- **Breakup Threshold**: Thin areas (<0.01) naturally separate

### Rendering Pipeline
1. Compute thickness gradient (surface normal)
2. Apply chromatic refraction (R/G/B split)
3. Calculate thin-film interference (iridescence)
4. Apply Fresnel reflection (specular)
5. Add edge highlights and occlusion
6. Composite over scene

### Shader Uniforms
New oil composite shader uses:
- `u_refract_strength`: Chromatic refraction amount
- `u_fresnel_power`: Specular highlight falloff
- `u_occlusion`: Thickness-based darkening
- `u_oil_gamma`: Opacity curve shape
- `u_tint_strength`: Material color influence

## Performance Notes

- Viscosity iterations capped at 30 for stability
- Surface tension computed per-frame (optimized)
- Thin-film math uses fast sin approximations
- No performance impact on water layer

## Comparison: Before vs After

### Before ❌
- Oil viscosity disabled (too strong)
- Weak surface tension (no pooling)
- Simple tinting (no light effects)
- No droplet formation
- No density variation visible

### After ✅
- Properly tuned viscosity (thick, slow flow)
- Strong surface tension (dramatic pooling & breakup)
- Full optical effects (iridescence, Fresnel, refraction)
- Clear droplet formation and separation
- Variable density clearly visible

## Tips for Best Results

1. **Paint slowly** - let oil pool naturally
2. **Use rotation** to spread oil around
3. **Try different materials** - each has unique behavior
4. **Watch edges** - brightest where oil is thickest
5. **Observe breakup** - thin streaks naturally separate

## Known Issues & Future Work

- Very thin oil (<0.001) may flicker due to numerical precision
- Extreme surface tension (>30) can cause instability
- Iridescence colors are approximated (not spectral rendering)

## Credits

Based on real fluid dynamics:
- Navier-Stokes equations for viscosity
- Young-Laplace equation for surface tension
- Fresnel equations for reflection
- Thin-film interference optics
