/**
 * Quality Tests for Fluid Simulation
 * Detects visual artifacts like straight lines, banding, etc.
 */

export class QualityTester {
    constructor(simulation) {
        this.simulation = simulation;
        this.gl = simulation.gl;
    }

    /**
     * Measure percentage of straight horizontal/vertical lines
     * High % indicates MacCormack artifacts or insufficient vorticity
     * 
     * @returns {object} { horizontal: %, vertical: %, overall: % }
     */
    measureStraightness() {
        const gl = this.gl;
        const width = gl.canvas.width;
        const height = gl.canvas.height;
        
        // Read velocity field
        const pixels = new Float32Array(width * height * 4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.simulation.velocityFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, 
            gl.TEXTURE_2D, this.simulation.velocityTexture1, 0);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.FLOAT, pixels);
        
        let horizontalLines = 0;
        let verticalLines = 0;
        let totalSamples = 0;
        
        const threshold = 0.01; // Velocity variation threshold
        
        // Check horizontal lines (sample every 10 rows)
        for (let y = 0; y < height; y += 10) {
            let consecutiveSame = 0;
            for (let x = 1; x < width; x++) {
                const idx = (y * width + x) * 4;
                const prevIdx = (y * width + (x - 1)) * 4;
                
                const vx = pixels[idx];
                const vy = pixels[idx + 1];
                const prevVx = pixels[prevIdx];
                const prevVy = pixels[prevIdx + 1];
                
                const diff = Math.abs(vx - prevVx) + Math.abs(vy - prevVy);
                
                if (diff < threshold) {
                    consecutiveSame++;
                } else {
                    if (consecutiveSame > 10) {
                        horizontalLines++;
                    }
                    consecutiveSame = 0;
                }
            }
            totalSamples++;
        }
        
        // Check vertical lines (sample every 10 columns)
        for (let x = 0; x < width; x += 10) {
            let consecutiveSame = 0;
            for (let y = 1; y < height; y++) {
                const idx = (y * width + x) * 4;
                const prevIdx = ((y - 1) * width + x) * 4;
                
                const vx = pixels[idx];
                const vy = pixels[idx + 1];
                const prevVx = pixels[prevIdx];
                const prevVy = pixels[prevIdx + 1];
                
                const diff = Math.abs(vx - prevVx) + Math.abs(vy - prevVy);
                
                if (diff < threshold) {
                    consecutiveSame++;
                } else {
                    if (consecutiveSame > 10) {
                        verticalLines++;
                    }
                    consecutiveSame = 0;
                }
            }
            totalSamples++;
        }
        
        const horizontalPct = (horizontalLines / totalSamples) * 100;
        const verticalPct = (verticalLines / totalSamples) * 100;
        const overallPct = (horizontalPct + verticalPct) / 2;
        
        return {
            horizontal: horizontalPct.toFixed(1),
            vertical: verticalPct.toFixed(1),
            overall: overallPct.toFixed(1),
            quality: overallPct < 5 ? 'GOOD' : overallPct < 15 ? 'FAIR' : 'POOR'
        };
    }

    /**
     * Run full quality test suite
     * Press Ctrl+Q to run
     */
    runTests() {
        console.log('🧪 Running Quality Tests...');
        
        const straightness = this.measureStraightness();
        console.log(`📏 Straightness: ${straightness.overall}% (${straightness.quality})`);
        console.log(`   Horizontal: ${straightness.horizontal}%`);
        console.log(`   Vertical: ${straightness.vertical}%`);
        
        // Add more tests here as needed
        // - Vorticity strength
        // - Velocity magnitude distribution
        // - Color bleeding
        
        return straightness;
    }

    /** Compute oil thickness centroid (UV) using occupancy buffer */
    _measureOilCentroid() {
        const sim = this.simulation;
        const gl = this.gl;
        if (!sim.useOil || !sim.oil) return { x: 0.5, y: 0.5, mass: 0 };

        // Render oil to occupancy buffer (R=thickness, G=inside)
        gl.useProgram(sim.occupancyProgram);
        gl.bindFramebuffer(gl.FRAMEBUFFER, sim.occupancyFBO);
        gl.viewport(0, 0, sim.occupancyWidth, sim.occupancyHeight);

        gl.bindBuffer(gl.ARRAY_BUFFER, sim.renderer.quadBuffer);
        const positionAttrib = gl.getAttribLocation(sim.occupancyProgram, 'a_position');
        gl.enableVertexAttribArray(positionAttrib);
        gl.vertexAttribPointer(positionAttrib, 2, gl.FLOAT, false, 0, 0);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, sim.oil.oilTexture1);
        gl.uniform1i(gl.getUniformLocation(sim.occupancyProgram, 'u_color_texture'), 0);
        gl.uniform2f(gl.getUniformLocation(sim.occupancyProgram, 'u_resolution'), gl.canvas.width, gl.canvas.height);
        const isOilLoc = gl.getUniformLocation(sim.occupancyProgram, 'u_isOil');
        if (isOilLoc) gl.uniform1i(isOilLoc, 1);

        gl.drawArrays(gl.TRIANGLES, 0, 6);

        // Read back low-res buffer
        const w = sim.occupancyWidth, h = sim.occupancyHeight;
        const pixels = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        // Weighted centroid using R as weight; consider only inside mask G>0
        let sumW = 0, sumX = 0, sumY = 0;
        for (let j = 0; j < h; j++) {
          for (let i = 0; i < w; i++) {
            const idx = (j * w + i) * 4;
            const inside = pixels[idx + 1] > 0;
            if (!inside) continue;
            const wgt = pixels[idx] / 255.0; // thickness proxy
            if (wgt <= 0) continue;
            // UV center of the pixel
            const u = (i + 0.5) / w;
            const v = (j + 0.5) / h;
            sumW += wgt;
            sumX += wgt * u;
            sumY += wgt * v;
          }
        }
        if (sumW <= 1e-6) return { x: 0.5, y: 0.5, mass: 0 };
        return { x: sumX / sumW, y: sumY / sumW, mass: sumW };
    }

    /**
     * Oil mobility test: apply small rotation and verify oil centroid moves.
     * Options: { frames: number, dt: number, minDisplacement: number, tempCoupling: number }
     */
    runOilMobilityTest(options = {}) {
        const sim = this.simulation;
        const gl = this.gl;
        const frames = options.frames ?? 120;
        const dt = options.dt ?? 1/60;
        const minDisp = options.minDisplacement ?? 0.003; // ~0.3% of canvas
        const tempCoupling = options.tempCoupling ?? 0.006; // ensure response

        if (!sim.useOil || !sim.oil) {
          console.warn('🛢️ Oil layer not enabled; enabling for test');
          sim.useOil = true;
        }

        // Save state
        const prevPaused = sim.paused;
        const prevRotBase = sim.rotationBase;
        const prevRotDelta = sim.rotationDelta;
        const prevCoupling = sim.couplingStrength;
        const prevOilVisc = sim.oilViscosity;
        const prevOilIters = sim.oilViscosityIterations;

        // Test parameters (gentle rotation, moderate coupling, reasonable viscosity)
        sim.paused = false;
        sim.rotationBase = 0.8;
        sim.rotationDelta = 0.0;
        sim.couplingStrength = tempCoupling;
        sim.oilViscosity = Math.min(prevOilVisc, 0.7);
        sim.oilViscosityIterations = Math.min(prevOilIters, 90);

        const before = this._measureOilCentroid();
        for (let i = 0; i < frames; i++) {
          sim.update(dt);
        }
        const after = this._measureOilCentroid();

        // Restore state
        sim.rotationBase = prevRotBase;
        sim.rotationDelta = prevRotDelta;
        sim.couplingStrength = prevCoupling;
        sim.oilViscosity = prevOilVisc;
        sim.oilViscosityIterations = prevOilIters;
        sim.paused = prevPaused;

        const dx = after.x - before.x;
        const dy = after.y - before.y;
        const disp = Math.hypot(dx, dy);
        const passed = disp >= minDisp;
        console.log(`🛢️ Oil mobility: disp=${disp.toFixed(4)} (min ${minDisp}) → ${passed ? 'PASS' : 'FAIL'}`);
        if (!passed) {
          console.log('   Hint: increase couplingStrength or reduce oilViscosity/iterations');
        }
        return { displacement: disp, passed, before, after };
    }
}
