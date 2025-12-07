# Testing Infrastructure

**Following v0 Lesson:** "If you can't test it, don't ship it"

---

## Overview

This testing framework addresses the critical v0 lesson that **GPGPU debugging without state inspection is hell**. It provides:

1. **Pause/Freeze State** (PRD F004 requirement)
2. **GPU Texture Reading** (inspect internal physics data)
3. **State Serialization** (create test fixtures)
4. **Performance Monitoring** (FPS tracking)
5. **Automated Test Suite** (physics validation)

---

## Quick Start

### 1. Visual Test Runner (Recommended)

1.  Open the file `tests/test-runner.html` in your browser.
2.  Click the **"▶️ Run All Tests"** button.
3.  Watch the output panel for `✅ PASS` or `❌ FAIL` results.

### 2. In Main App (index.html)

The testing tools are available in the browser console for quick checks:

```javascript
// Run the full suite
await tester.runTests();

// Or run individual checks
tester.checkForNaN();
tester.analyzeVelocity();
```

**Keyboard Shortcuts:**
- `P` - Pause/Resume simulation
- `Ctrl+S` - Save current state to file


## Testing Tools API

### SimulationTester

#### `pause()` / `resume()`
```javascript
tester.pause();   // Freeze simulation
tester.resume();  // Resume simulation
```

**Use Case:** Inspect broken state without it changing

#### `readTexture(texture, width, height)`
```javascript
const pixels = tester.readTexture(simulation.velocityTexture1, 512, 512);
// Returns Float32Array of RGBA data
```

**Use Case:** Inspect internal GPU state (velocity, pressure, color)

#### `captureState(label)`
```javascript
const state = tester.captureState('broken-rotation');
// Captures velocity, color, pressure textures
```

**Use Case:** Save broken state for regression testing

#### `saveState(state)`
```javascript
tester.saveState(state);  // Downloads JSON file
```

**Use Case:** Create test fixtures

#### `analyzeVelocity()`
```javascript
const stats = tester.analyzeVelocity();
// Returns: { maxSpeed, avgSpeed, totalVorticity, isStatic }
```

**Use Case:** Verify rotation/forces are working

#### `checkForNaN()`
```javascript
const isClean = tester.checkForNaN();
// Returns: true if no NaN/Infinity found
```

**Use Case:** Detect simulation explosion

#### `runTests()`
```javascript
const results = tester.runTests();
// Runs full automated test suite
```

---

### PerformanceMonitor

#### `recordFrame(deltaTime)`
```javascript
perfMonitor.recordFrame(0.016);  // Called automatically
```

#### `getStats()`
```javascript
const stats = perfMonitor.getStats();
// Returns: { avgFrameTime, maxFrameTime, minFrameTime, fps, isSmooth }
```

#### `logStats()`
```javascript
perfMonitor.logStats();  // Logs to console
// Output:
// 📊 Performance:
//   FPS: 60.0 ✅
//   Frame time: 16.67ms (min: 15.20, max: 18.30)
```

---

## Common Testing Scenarios

### Test 1: Verify Rotation Works

**Problem:** "I press arrow keys but nothing rotates"

**Test:**
```javascript
// In console:
const before = tester.analyzeVelocity();
console.log('Before:', before.avgSpeed);

// Press 'A' key (or 'D')
// Wait 2 seconds

const after = tester.analyzeVelocity();
console.log('After:', after.avgSpeed);

// Expected: after.avgSpeed > before.avgSpeed
```

### Test 2: Check for Simulation Explosion

**Problem:** "Blobs fly off screen / colors explode"

**Test:**
```javascript
tester.checkForNaN();
// If false: Simulation has NaN/Infinity (explosion)
// Common cause: pressure solver divergence
```

### Test 3: Performance Regression

**Problem:** "FPS dropped from 60 to 30"

**Test:**
```javascript
// Let simulation run for 5 seconds
perfMonitor.logStats();

// Compare FPS to baseline (target: ≥55)
// If low: reduce iterations or resolution
```

### Test 4: Save Broken State

**Problem:** "Weird visual artifact but can't reproduce"

**Test:**
```javascript
// When artifact appears:
tester.pause();  // Freeze it
const state = tester.captureState('artifact-2025-10-28');
tester.saveState(state);  // Downloads JSON

// Now you have a test fixture!
```

### Test 5: Viscosity Validation

**Problem:** "Viscosity doesn't seem to do anything"

**Test:**
```javascript
// Low viscosity
simulation.viscosity = 0.5;
setTimeout(() => {
    const low = tester.analyzeVelocity();
    
    // High viscosity
    simulation.viscosity = 5.0;
    setTimeout(() => {
        const high = tester.analyzeVelocity();
        
        // Expected: lower avg speed with high viscosity
        console.log('Low visc speed:', low.avgSpeed);
        console.log('High visc speed:', high.avgSpeed);
    }, 2000);
}, 2000);
```

---

## Automated Test Suite

Run with `Ctrl+T` or `tester.runTests()`

### Tests Included:

1. **No NaN/Infinity** - Checks all textures for invalid values
2. **Velocity Analysis** - Reports max/avg speed, detects static fields
3. **Rotation Force** - Instructions to manually verify

**Output Example:**
```
🧪 Running simulation tests...

Test 1 - No NaN/Infinity: ✅ PASS
Test 2 - Velocity Stats:
  Max speed: 0.123456
  Avg speed: 0.012345
  Is static: false

Test 3 - Rotation Force:
  Press A or D key, then run: tester.analyzeVelocity()
  Expected: avgSpeed should increase

✅ Basic tests complete
```

---

## Test Fixtures (Future)

Captured states can be used for regression testing:

```javascript
// Load fixture
fetch('test-fixtures/rotation-baseline.json')
    .then(r => r.json())
    .then(fixture => {
        // Compare current sim to baseline
        const current = tester.captureState('current');
        
        // Assert velocity field similarity
        // Assert no new NaN values
        // etc.
    });
```

---

## Performance Benchmarks

| Test | Target | Pass Criteria |
|------|--------|---------------|
| FPS (idle) | 60 | ≥55 FPS |
| FPS (interaction) | 60 | ≥45 FPS |
| Frame time (avg) | 16.6ms | ≤18ms |
| Frame time (max) | 20ms | ≤25ms |
| No NaN | true | Always true |

Run tests before committing changes:
```bash
# 1. Run test-runner.html
# 2. Click "Run All Tests"
# 3. Verify all pass
# 4. Check console for warnings
```

---

## Integration with PRD

This testing framework satisfies **PRD F004** requirements:

✅ **F004.01** - Pause/Freeze State: `tester.pause()`  
✅ **F004.02** - Cross-Section View: `tester.readTexture()`  
✅ **F004.03** - Serializable State: `tester.saveState()`

---

## Debugging Workflow

When something breaks:

1. **Pause immediately:** Press `P`
2. **Check for NaN:** `tester.checkForNaN()`
3. **Analyze velocity:** `tester.analyzeVelocity()`
4. **Capture state:** `Ctrl+S`
5. **Check console logs:** Look for errors
6. **Read texture manually:** `tester.readTexture(...)`

---

## Known Issues to Test For

From v0 lessons:

- **Rainbow gradients** - Not a bug (color mixing is physics)
- **Blobs flying away** - Check buoyancy parameter
- **Static field** - Check if rotation force is applied
- **NaN explosion** - Pressure solver divergence
- **FPS drops** - Too many iterations

---

## Contributing Tests

When adding new features:

1. Add test to `test-runner.html`
2. Update this README
3. Verify tests pass before PR
4. Add baseline performance metrics

---

## Console Commands Cheat Sheet

```javascript
// Pause/Resume
tester.pause()
tester.resume()

// Analyze
tester.analyzeVelocity()
tester.checkForNaN()
tester.runTests()

// Capture
tester.captureState('label')
tester.saveState(state)

// Performance
perfMonitor.getStats()
perfMonitor.logStats()

// Direct access
simulation.paused = true
simulation.viscosity = 2.0
simulation.setRotation(0.1)
```

---

**Remember:** Testing is not optional. It's what prevents v0's mistakes from repeating.
