
// src/simulation/sph/webgpu.js

class WebGPUContext {
    constructor() {
        this.device = null;
        this.queue = null;
        this.adapter = null;
    }

    setDevice(device) {
        this.device = device;
        this.queue = device.queue;
        console.log("WebGPU context set from external device.");
    }
}

const webGPUContext = new WebGPUContext();
export default webGPUContext;
