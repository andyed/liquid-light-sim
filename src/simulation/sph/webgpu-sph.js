// src/simulation/sph/webgpu-sph.js
// WebGPU particle buffer management for SPH simulation

class WebGPUSPH {
    constructor(device, maxParticles) {
        this.device = device;
        this.maxParticles = maxParticles;
        this.particleCount = 0;

        // WGSL struct definition (must match sph-gpu.wgsl)
        /*
        struct Particle {
            pos: vec2<f32>,      // 8 bytes  (offset 0)
            vel: vec2<f32>,      // 8 bytes  (offset 8)
            force: vec2<f32>,    // 8 bytes  (offset 16)
            density: f32,        // 4 bytes  (offset 24)
            pressure: f32,       // 4 bytes  (offset 28)
            color: vec3<f32>,    // 12 bytes (offset 32)
            _pad: f32,           // 4 bytes  (offset 44)
        }; // Total = 48 bytes
        */
        this.particleStride = 12 * 4; // 12 floats per particle (48 bytes)

        this.particleBuffer = this.device.createBuffer({
            size: this.maxParticles * this.particleStride,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
            label: 'SPH Particle Buffer',
        });

        console.log(`✅ WebGPU SPH buffer created: ${maxParticles} particles × ${this.particleStride} bytes`);
    }

    /**
     * Uploads particle data from the CPU SPH system to GPU.
     * Call this each frame to sync new particles (spawns).
     * @param {SPHOilSystem} sphSystem - The CPU SPH system instance.
     */
    uploadParticleData(sphSystem) {
        if (sphSystem.particleCount === 0) {
            this.particleCount = 0;
            return;
        }

        this.particleCount = sphSystem.particleCount;
        const floatsPerParticle = this.particleStride / 4;
        const particleData = new Float32Array(sphSystem.particleCount * floatsPerParticle);

        for (let i = 0; i < sphSystem.particleCount; i++) {
            const offset = i * floatsPerParticle;
            // pos (vec2)
            particleData[offset + 0] = sphSystem.positions[i * 2 + 0];
            particleData[offset + 1] = sphSystem.positions[i * 2 + 1];
            // vel (vec2)
            particleData[offset + 2] = sphSystem.velocities[i * 2 + 0];
            particleData[offset + 3] = sphSystem.velocities[i * 2 + 1];
            // force (vec2) - init to 0, will be computed on GPU
            particleData[offset + 4] = 0;
            particleData[offset + 5] = 0;
            // density (f32)
            particleData[offset + 6] = sphSystem.densities[i];
            // pressure (f32)
            particleData[offset + 7] = sphSystem.pressures[i];
            // color (vec3)
            particleData[offset + 8] = sphSystem.colors[i * 3 + 0];
            particleData[offset + 9] = sphSystem.colors[i * 3 + 1];
            particleData[offset + 10] = sphSystem.colors[i * 3 + 2];
            // _pad (f32)
            particleData[offset + 11] = 0;
        }

        this.device.queue.writeBuffer(this.particleBuffer, 0, particleData);
    }

    /**
     * Upload only new particles (for incremental spawning).
     * More efficient than full upload when adding particles.
     */
    uploadNewParticles(sphSystem, startIndex, count) {
        if (count === 0) return;

        const floatsPerParticle = this.particleStride / 4;
        const particleData = new Float32Array(count * floatsPerParticle);

        for (let i = 0; i < count; i++) {
            const srcIdx = startIndex + i;
            const offset = i * floatsPerParticle;
            
            particleData[offset + 0] = sphSystem.positions[srcIdx * 2 + 0];
            particleData[offset + 1] = sphSystem.positions[srcIdx * 2 + 1];
            particleData[offset + 2] = sphSystem.velocities[srcIdx * 2 + 0];
            particleData[offset + 3] = sphSystem.velocities[srcIdx * 2 + 1];
            particleData[offset + 4] = 0;
            particleData[offset + 5] = 0;
            particleData[offset + 6] = sphSystem.densities[srcIdx];
            particleData[offset + 7] = sphSystem.pressures[srcIdx];
            particleData[offset + 8] = sphSystem.colors[srcIdx * 3 + 0];
            particleData[offset + 9] = sphSystem.colors[srcIdx * 3 + 1];
            particleData[offset + 10] = sphSystem.colors[srcIdx * 3 + 2];
            particleData[offset + 11] = 0;
        }

        const byteOffset = startIndex * this.particleStride;
        this.device.queue.writeBuffer(this.particleBuffer, byteOffset, particleData);
        this.particleCount = sphSystem.particleCount;
    }
}

export default WebGPUSPH;
