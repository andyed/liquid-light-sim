// src/simulation/sph/webgpu-sph-update.js
// WebGPU compute pipeline for SPH physics simulation

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

        // Uniforms: 12 floats (must match sph-gpu.wgsl Uniforms struct)
        // particleCount, dt, smoothingRadius, restDensity, particleMass, viscosity,
        // ipfStrength, containerRadius, blobCohesion, blobRepulsion, blobFriction, _pad
        this.uniformBuffer = this.device.createBuffer({
            size: 12 * 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            label: 'SPH Uniforms',
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

    /**
     * Run GPU SPH physics update.
     * No readback - particles stay GPU-resident.
     */
    update(sphSystem, dt) {
        if (!this.densityPipeline || !this.forcePipeline || !this.integratePipeline) {
            return;
        }

        const particleCount = this.webgpuSPH.particleCount;
        if (particleCount === 0) return;

        // 1. Update uniforms (must match sph-gpu.wgsl Uniforms struct)
        const uniforms = new Float32Array([
            particleCount,                    // particleCount (u32 as f32)
            dt,                               // dt
            sphSystem.blobInteractionRadius,  // smoothingRadius
            sphSystem.restDensity,            // restDensity
            sphSystem.particleMass,           // particleMass
            sphSystem.viscosity,              // viscosity
            sphSystem.ipfStrength || 0,       // ipfStrength
            sphSystem.containerRadius,        // containerRadius
            sphSystem.blobCohesion,           // blobCohesion
            sphSystem.blobRepulsion,          // blobRepulsion
            sphSystem.blobFriction,           // blobFriction
            0                                 // _pad
        ]);
        this.device.queue.writeBuffer(this.uniformBuffer, 0, uniforms);

        // 2. Dispatch compute passes
        const commandEncoder = this.device.createCommandEncoder();
        const passEncoder = commandEncoder.beginComputePass();

        const workgroupCount = Math.ceil(particleCount / 64);

        // Density pass
        passEncoder.setPipeline(this.densityPipeline);
        passEncoder.setBindGroup(0, this.bindGroup);
        passEncoder.dispatchWorkgroups(workgroupCount);

        // Pressure pass (optional, blob physics doesn't rely on it much)
        if (this.pressurePipeline) {
            passEncoder.setPipeline(this.pressurePipeline);
            passEncoder.setBindGroup(0, this.bindGroup);
            passEncoder.dispatchWorkgroups(workgroupCount);
        }

        // Force pass
        passEncoder.setPipeline(this.forcePipeline);
        passEncoder.setBindGroup(0, this.bindGroup);
        passEncoder.dispatchWorkgroups(workgroupCount);

        // Integration pass
        passEncoder.setPipeline(this.integratePipeline);
        passEncoder.setBindGroup(0, this.bindGroup);
        passEncoder.dispatchWorkgroups(workgroupCount);

        passEncoder.end();

        const commandBuffer = commandEncoder.finish();
        this.device.queue.submit([commandBuffer]);

        // NO READBACK - particles stay on GPU
        // Rendering will read directly from the particle buffer
    }
}

export default WebGPUSPHUpdate;
