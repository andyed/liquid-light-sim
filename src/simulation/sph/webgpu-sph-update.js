// src/simulation/sph/webgpu-sph-update.js

import { loadShader } from '../../utils.js';

class WebGPUSPHUpdate {
    constructor(device, webgpuSPH) {
        this.device = device;
        this.webgpuSPH = webgpuSPH;

        this.shaderModule = null;
        this.densityPipeline = null;
        this.pressurePipeline = null;
        this.forcePipeline = null;
        this.integratePipeline = null;

        this.uniformBuffer = this.device.createBuffer({
            size: 8 * 4, // 8 floats (maxParticles, dt, smoothingRadius, restDensity, particleMass, viscosity, 2x pad)
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this.stagingBuffer = this.device.createBuffer({
            size: this.webgpuSPH.maxParticles * this.webgpuSPH.particleStride,
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
        });

        this.bindGroupLayout = this.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: 'storage' },
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: 'uniform' },
                },
            ],
        });

        this.bindGroup = this.device.createBindGroup({
            layout: this.bindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.webgpuSPH.particleBuffer },
                },
                {
                    binding: 1,
                    resource: { buffer: this.uniformBuffer },
                },
            ],
        });
    }

    async init() {
        const shaderCode = await loadShader('src/shaders/sph-gpu.wgsl');
        this.shaderModule = this.device.createShaderModule({ code: shaderCode });

        const pipelineLayout = this.device.createPipelineLayout({
            bindGroupLayouts: [this.bindGroupLayout],
        });

        this.densityPipeline = await this.device.createComputePipelineAsync({
            layout: pipelineLayout,
            compute: {
                module: this.shaderModule,
                entryPoint: 'compute_density',
            },
        });

        this.pressurePipeline = await this.device.createComputePipelineAsync({
            layout: pipelineLayout,
            compute: {
                module: this.shaderModule,
                entryPoint: 'compute_pressure',
            },
        });

        this.forcePipeline = await this.device.createComputePipelineAsync({
            layout: pipelineLayout,
            compute: {
                module: this.shaderModule,
                entryPoint: 'compute_forces',
            },
        });

        this.integratePipeline = await this.device.createComputePipelineAsync({
            layout: pipelineLayout,
            compute: {
                module: this.shaderModule,
                entryPoint: 'integrate',
            },
        });
        
        console.log('✅ WebGPU SPH update pipelines created.');
    }

    async update(sphSystem, dt) {
        if (!this.densityPipeline || !this.pressurePipeline || !this.forcePipeline || !this.integratePipeline) {
            return;
        }

        // 1. Update uniforms
        const uniforms = new Float32Array([
            sphSystem.particleCount,
            dt,
            sphSystem.smoothingRadius,
            sphSystem.restDensity,
            sphSystem.particleMass,
            sphSystem.viscosity,
            0, 0 // padding
        ]);
        this.device.queue.writeBuffer(this.uniformBuffer, 0, uniforms);

        // 2. Dispatch compute passes
        const commandEncoder = this.device.createCommandEncoder();
        const passEncoder = commandEncoder.beginComputePass();

        const workgroupCount = Math.ceil(sphSystem.particleCount / 64);

        // Density pass
        passEncoder.setPipeline(this.densityPipeline);
        passEncoder.setBindGroup(0, this.bindGroup);
        passEncoder.dispatchWorkgroups(workgroupCount);

        // Pressure pass
        passEncoder.setPipeline(this.pressurePipeline);
        passEncoder.setBindGroup(0, this.bindGroup);
        passEncoder.dispatchWorkgroups(workgroupCount);

        // Force pass
        passEncoder.setPipeline(this.forcePipeline);
        passEncoder.setBindGroup(0, this.bindGroup);
        passEncoder.dispatchWorkgroups(workgroupCount);

        // Integration pass
        passEncoder.setPipeline(this.integratePipeline);
        passEncoder.setBindGroup(0, this.bindGroup);
        passEncoder.dispatchWorkgroups(workgroupCount);

        passEncoder.end();

        // 3. Readback data
        commandEncoder.copyBufferToBuffer(
            this.webgpuSPH.particleBuffer, 0,
            this.stagingBuffer, 0,
            this.webgpuSPH.maxParticles * this.webgpuSPH.particleStride
        );

        this.device.queue.submit([commandEncoder.finish()]);

        // 4. Map staging buffer and copy data back to CPU
        await this.stagingBuffer.mapAsync(GPUMapMode.READ);
        const data = new Float32Array(this.stagingBuffer.getMappedRange());

        for (let i = 0; i < sphSystem.particleCount; i++) {
            const offset = i * (this.webgpuSPH.particleStride / 4);
            sphSystem.positions[i * 2 + 0] = data[offset + 0];
            sphSystem.positions[i * 2 + 1] = data[offset + 1];
            sphSystem.velocities[i * 2 + 0] = data[offset + 2];
            sphSystem.velocities[i * 2 + 1] = data[offset + 3];
            sphSystem.densities[i] = data[offset + 6];
            sphSystem.pressures[i] = data[offset + 7];
        }

        this.stagingBuffer.unmap();
    }
}

export default WebGPUSPHUpdate;
