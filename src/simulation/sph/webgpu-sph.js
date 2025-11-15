// src/simulation/sph/webgpu-sph.js

class WebGPUSPH {
    constructor(device, maxParticles) {
        this.device = device;
        this.maxParticles = maxParticles;

        // WGSL struct definition (for reference)
        /*
        struct Particle {
            pos: vec2<f32>,     // 8 bytes
            vel: vec2<f32>,     // 8 bytes
            force: vec2<f32>,   // 8 bytes
            density: f32,       // 4 bytes
            pressure: f32,      // 4 bytes
        }; // Total = 32 bytes
        */
        this.particleStride = 8 * 4; // 8 floats per particle

        this.particleBuffer = this.device.createBuffer({
            size: this.maxParticles * this.particleStride,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
        });
    }

    /**
     * Uploads initial particle data from the CPU SPH system.
     * @param {SPHOilSystem} sphSystem - The CPU SPH system instance.
     */
    uploadInitialData(sphSystem) {
        if (sphSystem.particleCount === 0) {
            return;
        }

        const particleData = new Float32Array(this.maxParticles * (this.particleStride / 4));

        for (let i = 0; i < sphSystem.particleCount; i++) {
            const offset = i * (this.particleStride / 4);
            // pos
            particleData[offset + 0] = sphSystem.positions[i * 2 + 0];
            particleData[offset + 1] = sphSystem.positions[i * 2 + 1];
            // vel
            particleData[offset + 2] = sphSystem.velocities[i * 2 + 0];
            particleData[offset + 3] = sphSystem.velocities[i * 2 + 1];
            // force (init to 0)
            particleData[offset + 4] = 0;
            particleData[offset + 5] = 0;
            // density
            particleData[offset + 6] = sphSystem.densities[i];
            // pressure
            particleData[offset + 7] = sphSystem.pressures[i];
        }

        this.device.queue.writeBuffer(this.particleBuffer, 0, particleData);
        console.log(`✅ Uploaded ${sphSystem.particleCount} particles to WebGPU buffer.`);
    }
}

export default WebGPUSPH;
