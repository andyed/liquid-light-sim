// src/simulation/sph/webgpu-test.js

export async function runTestComputeShader(device, queue) {
    if (!device) {
        console.log("No WebGPU device, skipping test compute shader.");
        return;
    }

    console.log("Running WebGPU test compute shader...");

    // 1. Create data and buffers
    const inputData = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const bufferSize = inputData.byteLength;

    const gpuBuffer = device.createBuffer({
        size: bufferSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    });

    const stagingBuffer = device.createBuffer({
        size: bufferSize,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    // Copy input data to the GPU buffer
    queue.writeBuffer(gpuBuffer, 0, inputData);

    // 2. Create compute pipeline
    const shaderModule = device.createShaderModule({
        code: `
            @group(0) @binding(0)
            var<storage, read_write> data: array<f32>;

            @compute @workgroup_size(4)
            fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
                let index = global_id.x;
                if (index >= arrayLength(&data)) {
                    return;
                }
                data[index] = data[index] * 2.0;
            }
        `,
    });

    const pipeline = device.createComputePipeline({
        layout: 'auto',
        compute: {
            module: shaderModule,
            entryPoint: 'main',
        },
    });

    // 3. Create bind group
    const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
            {
                binding: 0,
                resource: {
                    buffer: gpuBuffer,
                },
            },
        ],
    });

    // 4. Dispatch compute shader
    const commandEncoder = device.createCommandEncoder();
    const passEncoder = commandEncoder.beginComputePass();
    passEncoder.setPipeline(pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.dispatchWorkgroups(Math.ceil(inputData.length / 4));
    passEncoder.end();

    // 5. Copy result to staging buffer
    commandEncoder.copyBufferToBuffer(gpuBuffer, 0, stagingBuffer, 0, bufferSize);

    // 6. Submit to queue
    queue.submit([commandEncoder.finish()]);

    // 7. Read back and verify
    await stagingBuffer.mapAsync(GPUMapMode.READ);
    const outputData = new Float32Array(stagingBuffer.getMappedRange());

    let testPassed = true;
    for (let i = 0; i < inputData.length; i++) {
        if (outputData[i] !== inputData[i] * 2) {
            console.error(`Test failed at index ${i}: expected ${inputData[i] * 2}, got ${outputData[i]}`);
            testPassed = false;
            break;
        }
    }

    if (testPassed) {
        console.log("✅ WebGPU test compute shader ran successfully!");
    } else {
        console.error("❌ WebGPU test compute shader failed.");
    }

    stagingBuffer.unmap();
}
