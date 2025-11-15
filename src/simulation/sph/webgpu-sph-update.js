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

        // Clamp effective count to buffer capacity to avoid overruns.
        const maxParticles = this.webgpuSPH.maxParticles;
        const effectiveCount = Math.min(sphSystem.particleCount, maxParticles);

        // 1. Update uniforms
        const uniforms = new Float32Array([
            effectiveCount,
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

        const workgroupCount = Math.ceil(effectiveCount / 64);

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
            effectiveCount * this.webgpuSPH.particleStride
        );

        const commandBuffer = commandEncoder.finish();
        this.device.queue.submit([commandBuffer]);

        // For now, treat SPH state as GPU-resident only and skip per-frame readback.
        // This avoids device hangs seen on macOS (WindowServer watchdog) and Windows (DXGI device lost)
        // when performing full-buffer mapAsync every frame.
        return;
    }
}

export default WebGPUSPHUpdate;
