# Liquid Light Simulator

Try it: https://andyed.github.io/liquid-light-sim/

![Screenshot](https://raw.githubusercontent.com/andyed/liquid-light-sim/main/images/v01.png)

**Status:** SPH Phase 2.1 - Implicit Solver + Thermal ✅

A GPU-accelerated fluid simulation for play, VJ performance and digital art, built with WebGL2. The core now uses a layered architecture (FluidLayer interface) with a WaterLayer and an alpha OilLayer (visual refraction, smoothing, presets).

![Circular Container](https://img.shields.io/badge/Container-Circular_Boundary-blue)
![Physics](https://img.shields.io/badge/Physics-Navier--Stokes-green)
![Performance](https://img.shields.io/badge/FPS-60-brightgreen)
![Testing](https://img.shields.io/badge/Tests-Automated-yellow)

---

## 🌊 Getting Started: Groovy Fluids 101

**First time?** Try this flow (pun intended):

1. **🎨 Pick your vibe** - Press **1-5** to try different materials
   - **1** = Ink (water-based, flows freely)
   - **2** = Mineral Oil (thick, blobby goodness)  
   - **3** = Alcohol (thin, ethereal)
   - **4** = Syrup (viscous blobs)
   - **5** = Glycerine (smooth operator)

2. **🎨 Customize colors** - Click the **color wheel** (top-left) to pick your hue
   - Each material remembers its color (see the numbered circles)
   - Click circles **1-5** to quick-switch with saved colors

3. **🌀 Add motion** - Click the **rotation button** (bottom-left) to spin the container
   - Watch your fluids swirl and separate!

4. **💡 Light it up** - Click the **light indicator** (bottom-right) to rotate colored light
   - Press **C** to cycle rotation speeds

**Pro tip:** Start with **Mineral Oil (#2)** for maximum blob satisfaction. It's got more surface tension than a first date! 🛢️✨

---

## 🎮 Controls (The Physics of Fun)

### Essential Vibes
| Action | Control | Effect |
|--------|---------|--------|
| **Paint colors** | Left-click + drag | Drop paint, make art |
| **Create chaos** | Right-click + drag | Powerful jet stream (50,000× force!) |
| **Spin container** | **A/D** or **←/→** | Rotate the whole universe |
| **Switch materials** | **1-5** keys | Ink → Oils (each has personality) |
| **Material memory** | Click circles **1-5** | Restore saved material + color |
| **Pick colors** | Click color wheel | Choose your chakra |
| **Toggle rotation** | Rotation button | Spin or chill |
| **Light rotation** | Click light / **C** | Color wheel speed (0-5°/frame) |

### Advanced Mojo ✨
| Action | Control | What it does |
|--------|---------|--------------|
| **Viscosity** | **V** | Cycle flow resistance (thin → thicc) |
| **Turbulence** | **T** | More chaos energy |
| **Volumetric** | **L** | Beer-Lambert light absorption (ON by default) |
| **Absorption** | **K** | How dark the centers get |
| **Heat lamp** | Hamburger menu | Brightness + agitation (hippie lamp vibes) |
| **Clear canvas** | **X** | Erase everything (fresh start) |
| **Pause** | **P** | Freeze physics (inspect your art) |
| **Velocity field** | **M** | See the force, Luke |

**Physics pun quota:** We're conserving momentum AND good vibes. No dissipation of fun allowed! 🌈

See [CONTROLS.md](CONTROLS.md) for the full manual (for when you're ready to ascend).

---

## What's New (Nov 3, 2025)

### 🎨 Oil Rendering & Boundary Fixes
- **Boundary hard clamp** - No more dissipation at edges during rotation
- **Refraction clamp** - Fixes projection artifacts when painting near edges
- **Linear tint visibility** - Oil shows full color in centers, not just edges
- **Gray center fix** - Slow painting now creates saturated, colored oil

### 🔧 Technical Improvements
- Hard boundary clamping prevents edge blending losses
- Refraction sampling constrained to circular boundary
- Tint formula changed from quadratic to linear (40% more color)

## Previous Update (Nov 2, 2025)

### 🎨 Improved Persistence & Movement
- **Ambient water flow** - Gentle rotation (0.12) mimics real liquid light shows
- **Oil coupling working** - Oil moves immediately when painted
- **Gentler rotation** - Button force reduced 75% (1.2 → 0.3)
- **Material-specific persistence** - Different overflow thresholds per material

### 🔧 Critical Bug Fixes
- **Oil smoothing disabled** - Stopped per-frame thickness dissipation
- **Shader alpha preservation** - Overflow & diffusion preserve oil thickness
- **Overflow thresholds raised** - Oil 0.95 vs water 0.90
- **Vorticity reduced** - Less ink shredding (0.4 → 0.25)
- **Absorption lowered** - Ink centers stay vibrant (3.0 → 1.5)
- **Occlusion lowered** - Oil more visible (50-75% reduction)

### 📊 Current Status
- ✅ Ink persists 10+ rotations (was <3)
- ✅ Ink colors stay vibrant (no center washout)
- ✅ Gentler, more controllable swirls
- ✅ Ambient flow provides constant gentle motion
- 🟡 Oil persists ~15 seconds (improved from <5, still needs work)
- 🟡 Oil color weak (needs tint strength tuning)

**Known Issue:** Oil dissipates at container edges during rotation (boundary interaction)

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

### ✅ Heat Lamp
- **Brightness Gain** - Increases the overall brightness of the simulation.
- **Agitation** - Adds a subtle, noisy perturbation to the velocity field to create more natural, blob-like structures.

### ✅ Surface Tension
- **Cohesion** - A simplified surface tension model gives oil a tendency to form blob-like shapes and resist shearing.

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

Then follow the [Getting Started](#-getting-started-groovy-fluids-101) guide above!

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

### ✅ Phase 2: Dual-Fluid (Complete)
- ✅ **Layered architecture** - WaterLayer + OilLayer with independent advection (alternative to phase field)
- ✅ **Capillary forces** - Surface tension (50-90) with curvature-based forces for blobby separation
- ✅ **Oil injection controls** - 5 materials (Ink, Mineral Oil, Alcohol, Syrup, Glycerine) with full parameter control
- ✅ **Buoyancy force** - Density-based vertical motion (lighter oils rise, heavier sink)

### ⏳ Phase 3: Polish
- ✅ **Material presets** - 5 materials with distinct physics parameters
- ✅ **Color palettes** - Per-material color sets with memory
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
- **Pixelated Edges**: Oil blobs currently dissolve with noisy, pixelated edges instead of smoothly shrinking. This is a rendering artifact from the metaball shader.
- **Rapid Dissolution**: While improved, oil blobs still dissolve visually faster than desired. This is related to the visual representation of particle density and temperature decay.
- **Shape Maintenance**: Blobs do not consistently maintain a perfectly organic, cellular shape throughout their dissolution, though this has improved dramatically with the implicit solver.

### Workarounds
- These are primarily visual issues. The underlying SPH physics for blob formation and cohesion are now stable.
- Further tuning of the `oil-metaball.frag.glsl` shader and particle rendering parameters is required.

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
