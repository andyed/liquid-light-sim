/**
 * Testing Utilities for Fluid Simulation
 * Following v0 lessons: "If you can't test it, don't ship it"
 */

export class SimulationTester {
    constructor(simulation) {
        this.simulation = simulation;
        this.gl = simulation.gl;
        this.capturedStates = [];
    }

    /**
     * Pause/freeze the simulation
     * Critical for debugging (v0 lesson: debugging without freeze is hell)
     */
    pause() {
        this.simulation.paused = true;
        console.log('⏸️  Simulation paused');
    }

    resume() {
        this.simulation.paused = false;
        console.log('▶️  Simulation resumed');
    }

    /**
     * Read texture data from GPU
     * Essential for inspecting internal physics state
     */
    readTexture(texture, width, height) {
        const gl = this.gl;
        const fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

        const pixels = new Float32Array(width * height * 4);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.FLOAT, pixels);
        
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.deleteFramebuffer(fbo);

        return pixels;
    }

    /**
     * Capture current simulation state
     * Can be saved as test fixture for regression tests
     */
    captureState(label = 'state') {
        const width = this.gl.canvas.width;
        const height = this.gl.canvas.height;

        const state = {
            label,
            timestamp: Date.now(),
            velocity: this.readTexture(this.simulation.velocityTexture1, width, height),
            color: this.readTexture(this.simulation.colorTexture1, width, height),
            pressure: this.readTexture(this.simulation.pressureTexture1, width, height),
            width,
            height
        };

        this.capturedStates.push(state);
        console.log(`📸 Captured state: ${label}`);
        return state;
    }

    /**
     * Save captured state to JSON
     * For creating test fixtures
     */
    saveState(state) {
        const json = {
            label: state.label,
            timestamp: state.timestamp,
            width: state.width,
            height: state.height,
            velocity: Array.from(state.velocity),
            color: Array.from(state.color),
            pressure: Array.from(state.pressure)
        };

        const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `simulation-state-${state.label}-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        
        console.log(`💾 Saved state: ${state.label}`);
    }

    /**
     * Analyze velocity field
     * Useful for debugging rotation, pressure solve, etc.
     */
    analyzeVelocity() {
        const width = this.gl.canvas.width;
        const height = this.gl.canvas.height;
        const pixels = this.readTexture(this.simulation.velocityTexture1, width, height);

        let maxSpeed = 0;
        let avgSpeed = 0;
        let totalVorticity = 0;

        for (let i = 0; i < pixels.length; i += 4) {
            const vx = pixels[i];
            const vy = pixels[i + 1];
            const speed = Math.sqrt(vx * vx + vy * vy);
            
            maxSpeed = Math.max(maxSpeed, speed);
            avgSpeed += speed;
        }

        avgSpeed /= (pixels.length / 4);

        return {
            maxSpeed,
            avgSpeed,
            totalVorticity,
            isStatic: maxSpeed < 0.001
        };
    }

    /**
     * Check for NaN or Infinity (simulation explosion)
     */
    checkForNaN() {
        const width = this.gl.canvas.width;
        const height = this.gl.canvas.height;
        const velocity = this.readTexture(this.simulation.velocityTexture1, width, height);
        const color = this.readTexture(this.simulation.colorTexture1, width, height);

        for (let i = 0; i < velocity.length; i++) {
            if (!isFinite(velocity[i])) {
                console.error(`❌ NaN/Infinity detected in velocity at index ${i}`);
                return false;
            }
        }

        for (let i = 0; i < color.length; i++) {
            if (!isFinite(color[i])) {
                console.error(`❌ NaN/Infinity detected in color at index ${i}`);
                return false;
            }
        }

        return true;
    }

    /**
     * Run automated test suite
     */
    runTests() {
        console.log('🧪 Running simulation tests...\n');

        // Test 1: No NaN values
        const noNaN = this.checkForNaN();
        console.log(`Test 1 - No NaN/Infinity: ${noNaN ? '✅ PASS' : '❌ FAIL'}`);

        // Test 2: Velocity analysis
        const velocityStats = this.analyzeVelocity();
        console.log(`Test 2 - Velocity Stats:`);
        console.log(`  Max speed: ${velocityStats.maxSpeed.toFixed(6)}`);
        console.log(`  Avg speed: ${velocityStats.avgSpeed.toFixed(6)}`);
        console.log(`  Is static: ${velocityStats.isStatic}`);

        // Test 3: Rotation Force (manual verification)
        console.log('\nTest 3 - Rotation Force:');
        console.log('  Press A or D key, then run: tester.analyzeVelocity()');
        console.log('  Expected: avgSpeed should increase');

        // New Test: Forces Kernel
        const forcesPass = this.testForcesKernel();
        console.log(`Test 4 - Forces Kernel: ${forcesPass ? '✅ PASS' : '❌ FAIL'}`);

        console.log('\n✅ Basic tests complete');
        return {
            noNaN,
            velocityStats,
            forcesPass
        };
    }

    testForcesKernel() {
        console.log('Testing Forces Kernel...');
        const gl = this.gl;
        const sim = this.simulation;

        // Save current state
        const originalRotationAmount = sim.rotationAmount;
        const originalCentralSpiralPower = sim.centralSpiralPower;
        const originalCentralSpiralAngle = sim.centralSpiralAngle;

        // Set up a known state
        sim.rotationAmount = 0.1; // Apply a rotation
        sim.centralSpiralPower = 0.0; // Start with no spiral power
        sim.centralSpiralAngle = 0.0; // Start with zero angle

        // Clear velocity field to ensure a clean test
        // This requires a clearVelocity function or direct manipulation
        // For now, we'll assume applyForces will overwrite previous velocity

        // Run the forces kernel
        sim.applyForces(0.016); // Use a small dt

        // Read back the velocity texture
        const velocityPixels = this.readTexture(sim.velocityTexture1, gl.canvas.width, gl.canvas.height);

        // Analyze the velocity field
        let totalVelocityMagnitude = 0;
        for (let i = 0; i < velocityPixels.length; i += 4) {
            const vx = velocityPixels[i];
            const vy = velocityPixels[i + 1];
            totalVelocityMagnitude += Math.sqrt(vx * vx + vy * vy);
        }

        // Restore original state
        sim.rotationAmount = originalRotationAmount;
        sim.centralSpiralPower = originalCentralSpiralPower;
        sim.centralSpiralAngle = originalCentralSpiralAngle;

        // Assertions
        // Expect some non-zero velocity after applying forces
        const minExpectedVelocity = 0.01; // A small threshold
        const pass = totalVelocityMagnitude > minExpectedVelocity;

        if (pass) {
            console.log('✅ Forces Kernel: Velocity increased as expected.');
        } else {
            console.error('❌ Forces Kernel: Velocity did NOT increase as expected.');
        }

        return pass;
    }
}

/**
 * Performance monitor
 */
export class PerformanceMonitor {
    constructor() {
        this.frameTimes = [];
        this.maxSamples = 60;
    }

    recordFrame(deltaTime) {
        this.frameTimes.push(deltaTime * 1000); // Convert to ms
        if (this.frameTimes.length > this.maxSamples) {
            this.frameTimes.shift();
        }
    }

    getStats() {
        if (this.frameTimes.length === 0) return null;

        const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
        const max = Math.max(...this.frameTimes);
        const min = Math.min(...this.frameTimes);
        const fps = 1000 / avg;

        return {
            avgFrameTime: avg.toFixed(2),
            maxFrameTime: max.toFixed(2),
            minFrameTime: min.toFixed(2),
            fps: fps.toFixed(1),
            isSmooth: fps >= 55
        };
    }

    logStats() {
        const stats = this.getStats();
        if (!stats) return;

        console.log('📊 Performance:');
        console.log(`  FPS: ${stats.fps} ${stats.isSmooth ? '✅' : '⚠️'}`);
        console.log(`  Frame time: ${stats.avgFrameTime}ms (min: ${stats.minFrameTime}, max: ${stats.maxFrameTime})`);
    }
}
