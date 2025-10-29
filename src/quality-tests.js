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
}
