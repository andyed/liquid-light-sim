# Liquid Light Simulator

Try it: https://andyed.github.io/liquid-light-sim/

![Screenshot](https://raw.githubusercontent.com/andyed/liquid-light-sim/main/images/v01.png)

**Status:** Milestone 3 - Layered core + Oil (alpha) ✅

A GPU-accelerated fluid simulation for VJ performance and digital art, built with WebGL2. The core now uses a layered architecture (FluidLayer interface) with a WaterLayer and an alpha OilLayer (visual refraction, smoothing, presets).

![Circular Container](https://img.shields.io/badge/Container-Circular_Boundary-blue)
![Physics](https://img.shields.io/badge/Physics-Navier--Stokes-green)
![Performance](https://img.shields.io/badge/FPS-60-brightgreen)
![Testing](https://img.shields.io/badge/Tests-Automated-yellow)

---

## What's New (Milestone 3)

- Layered architecture with `FluidLayer` interface.
- `WaterLayer` owns its buffers, occupancy/overflow logic.
- `OilLayer` (alpha): advects by water, applies smoothing, and renders with soft refraction + Fresnel.
- Materials UI: 1–5 to switch materials, auto color pick, Oil auto-on for non‑Ink, hamburger menu toggle.
- Color wheel toned to prevent washout; hamburger becomes scrollable on small screens.

## Features Implemented (Milestone 2)

### ✅ Core Physics
- **Navier-Stokes Fluid Dynamics** - Incompressible flow with pressure projection
- **Viscosity** - 20 Jacobi iterations for realistic thickness/drag
- **Advection** - MacCormack scheme for sharp, artifact-free transport
- **Vorticity Confinement** - Preserves small-scale turbulence
- **Circular Container** - Visible boundary with physics constraints (radius 0.48)

### ✅ Volumetric Rendering
- **Beer-Lambert Absorption** - Realistic light absorption through ink
- **RGB Light Projection** - Automated color wheel rotation (0-5°/frame)
- **Clickable Light Indicator** - Visual feedback in bottom-right corner
- **Absorption Control** - K key cycles intensity (0.5-4.0)

### ✅ User Interaction
- **Color Painting** - Left-click to inject dye (no color mixing)
- **Jet Impulse** - Right-click for strong turbulent forces (50k multiplier)
- **Container Rotation** - Arrow keys create visible vortex (10x force)
- **Viscosity Control** - V key cycles presets (0.05→0.1→0.5→1.0→2.0)
- **Clear Canvas** - X key resets all ink

### ✅ Testing & Quality
- **Auto-Corruption Detection** - Pauses on NaN/Inf detection
- **Quality Tests** - Ctrl+Q measures straightness % (MacCormack artifacts)
- **Pause/Freeze State** - P key to inspect
- **Velocity Visualization** - M key shows flow field
- **Performance Monitor** - Real-time FPS tracking

### ✅ Visual Quality
- Volumetric light absorption (Beer-Lambert law)
- No color mixing when painting over existing ink
- Smooth, curved flow patterns (low straightness %)
- 60 FPS at 1024×1024 resolution
- Stable motion without corruption

---

## Quick Start

```bash
# Clone and run
cd liquid-light-sim
python3 -m http.server 8001

# Open browser
http://localhost:8001
```

### Controls
- **Left-click + drag** - Paint colors
- **Right-click + drag** - Create powerful jets
- **A/D or Arrows** - Rotate container
- **1–5** - Select material (Ink, Mineral Oil, Alcohol, Syrup, Glycerine). Non‑Ink enables Oil.
- **Hamburger → Oil Layer** - Toggle Oil on/off
- **C** - Cycle RGB light rotation speed
- **Click light indicator** - Toggle light rotation
- **V** - Cycle viscosity
- **T** - Cycle turbulence strength
- **L** - Toggle volumetric rendering
- **K** - Cycle absorption coefficient
- **X** - Clear canvas
- **P** - Pause/Resume
- **M** - View velocity field
- **Ctrl+Q** - Run quality tests

See [CONTROLS.md](CONTROLS.md) for full reference.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  Strict MVC Separation                       │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Model (simulation.js)         View (renderer.js)            │
│  - Physics only                - Rendering only              │
│  - GPU textures                - Boundary overlay            │
│  - No rendering                - No physics                  │
│                                                               │
│  Controller (controller.js)                                  │
│  - Input handling                                            │
│  - User interactions                                         │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Key Design Principles (from v0 lessons)
1. **Testability First** - Can pause, inspect, and save state
2. **No God Objects** - Each class <500 lines, single responsibility
3. **Safe Parameter Ranges** - Documented inline with warnings
4. **Simple Solutions** - Avoid over-engineering
5. **Incremental Testing** - One change at a time

---

## Technical Details

### Physics Pipeline
```
1. Apply Forces           → Rotation, jets (clamped to ±5000)
2. Vorticity Confinement  → Preserve small-scale turbulence
3. Advect Velocity        → MacCormack self-advection
4. Apply Viscosity        → 20 Jacobi iterations
5. Pressure Projection    → 50 iterations for incompressibility
6. Advect Color           → MacCormack transport
7. Corruption Check       → Auto-pause on NaN/Inf (every 10 frames)
```

### GPU Textures (Float32)
| Texture | Purpose | Size |
|---------|---------|------|
| `colorTexture` | RGB dye | Canvas |
| `velocityTexture` | Velocity field (RG) | Canvas |
| `pressureTexture` | Pressure scalar | Canvas |
| `divergenceTexture` | Divergence field | Canvas |

### Shaders
- `advection.frag.glsl` - MacCormack transport with sharpness control
- `forces.frag.glsl` - Rotation/jets with NaN guards and velocity clamping
- `vorticity-confinement.frag.glsl` - Preserve small-scale turbulence
- `viscosity.frag.glsl` - Momentum diffusion (20 iterations)
- `pressure.frag.glsl` - Jacobi iteration for Poisson solve (50 iterations)
- `gradient.frag.glsl` - Subtract pressure gradient
- `divergence.frag.glsl` - Compute velocity divergence
- `splat.frag.glsl` - Inject color/velocity (no mixing)
- `volumetric.frag.glsl` - Beer-Lambert absorption rendering
- `oil-composite.frag.glsl` - Oil soft refraction + Fresnel highlight composite
- `boundary.frag.glsl` - Circular container visualization

---

## Testing

### Browser Console API
```javascript
// Available globally
window.tester         // SimulationTester instance
window.perfMonitor    // PerformanceMonitor
window.simulation     // Direct simulation access

// Quick tests
tester.runTests()           // Full test suite
tester.analyzeVelocity()    // Check velocity stats
tester.checkForNaN()        // Detect explosion
perfMonitor.logStats()      // FPS report

// Debugging
tester.pause()              // Freeze state
const state = tester.captureState('label')
tester.saveState(state)     // Download JSON
```

### Test Runner
Open `tests/test-runner.html` for visual test interface with automated suite.

See [tests/README.md](tests/README.md) for full API.

---

## Performance

### Benchmarks
- **FPS (idle):** 60
- **FPS (active):** 55-60
- **Frame time:** 16.6ms avg
- **Resolution:** 1024×1024 (auto-detected)
- **GPU:** Requires WebGL2 + `EXT_color_buffer_float`

### Optimizations
- NEAREST texture filtering for FBOs
- Capped deltaTime for stability
- Conservative iteration counts
- Efficient ping-pong rendering

---

## Project Structure

```
liquid-light-sim/
├── index.html              # Entry point
├── style.css               # Minimal styling
├── src/
│   ├── main.js            # App initialization, testing setup
│   ├── simulation.js      # Physics model (360 lines)
│   ├── renderer.js        # View with boundary overlay
│   ├── controller.js      # Input handling
│   ├── utils.js           # Shader loader
│   └── shaders/           # GLSL shaders (11 files)
├── tests/
│   ├── test-utils.js      # Testing utilities
│   ├── test-runner.html   # Visual test interface
│   └── README.md          # Testing documentation
├── docs/
│   ├── prd.md             # Product requirements
│   ├── materials.md       # Future material system
│   └── *.md               # Research & specs
├── CONTROLS.md            # User control reference
├── CHANGELOG.md           # Version history
└── README.md              # This file
```

---

## Roadmap

### ✅ Phase 1: Foundation (Complete)
- Single-fluid water dynamics
- Testing infrastructure
- Circular container

### 🔄 Phase 2: Dual-Fluid (Next)
- [ ] Phase field advection
- [ ] Buoyancy force
- [ ] Capillary forces (surface tension)
- [ ] Oil injection controls

### ⏳ Phase 3: Polish
- [ ] Material presets
- [ ] Color palettes
- [ ] Performance profiles
- [ ] MIDI control integration

---

## Development

### Prerequisites
- Modern browser with WebGL2 support
- `EXT_color_buffer_float` extension
- Local web server (Python, Node, etc.)

### Adding Features
1. Read `docs/lessons-from-v0.md` first
2. Follow testing-first approach
3. Keep classes focused (<500 lines)
4. Document parameter ranges
5. Test incrementally

### Before Committing
```bash
# 1. Run test suite
# Open browser console, run: tester.runTests()

# 2. Check performance
perfMonitor.logStats()

# 3. Verify no NaN
tester.checkForNaN()

# 4. Update CHANGELOG.md
```

---

## Known Issues

### Current Limitations
- **Straight lines in velocity field** - MacCormack can create horizontal/vertical artifacts at high sharpness. Use Ctrl+Q to measure, increase turbulence (T key) if >15%
- Water layer only (oil/water pending phase field implementation)
- No buoyancy or surface tension yet
- Light rotation off by default (press C to enable)

### Workarounds
- Press T to increase turbulence if seeing straight lines
- Use Ctrl+Q to measure straightness % (target <5%)
- Press M to visualize velocity field
- Press P to pause and inspect state

---

## References

### Documentation
- [CONTROLS.md](CONTROLS.md) - User controls
- [CHANGELOG.md](CHANGELOG.md) - Version history  
- [tests/README.md](tests/README.md) - Testing API
- [docs/prd.md](docs/prd.md) - Product requirements
- [docs/lessons-from-v0.md](docs/lessons-from-v0.md) - Architecture lessons

### Research
- [docs/Simulating 1960s Liquid Light Shows.md](docs/Simulating%201960s%20Liquid%20Light%20Shows.md)
- [docs/WebGL Liquid Light Simulation Spec.md](docs/WebGL%20Liquid%20Light%20Simulation%20Spec.md)

---

## License

See LICENSE file.

---

## Contributing

This project follows strict architectural principles learned from v0:
1. Test everything (no untestable code)
2. Keep it simple (avoid over-engineering)
3. Document safe ranges (prevent v0 mistakes)
4. Incremental changes (one feature at a time)

See contribution guidelines in `docs/lessons-from-v0.md`.

---

**Built with:** WebGL2, GLSL, JavaScript ES6  
**Inspired by:** 1960s liquid light shows, VJ culture, fluid dynamics  
**Status:** Milestone 2 Complete - Water layer functional, ready for phase field integration
