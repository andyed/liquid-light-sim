import Renderer from './renderer.js';
import Simulation from './simulation.js';
import Controller from './controller.js';
import { SimulationTester, PerformanceMonitor } from '../tests/test-utils.js';

console.log("🎨 Welcome to Liquid Light Simulator!");

class App {
    constructor(useWebGPU) {
        this.renderer = new Renderer(useWebGPU);
        this.simulation = new Simulation(this.renderer);
        this.renderer.setSimulation(this.simulation);
        this.controller = new Controller(this.simulation, this.renderer);
        this.perfMonitor = new PerformanceMonitor();

        this.lastTime = 0;
        this.frameCount = 0;
        this.animate = this.animate.bind(this);
    }

    async run() {
        await this.renderer.init();
        await this.simulation.init();
        
        // Initialize testing tools (F004 requirement)
        window.tester = new SimulationTester(this.simulation);
        window.perfMonitor = this.perfMonitor;
        window.simulation = this.simulation; // For console debugging
        window.controller = this.controller; // For material debugging
        
        console.log('\n📚 Testing Tools Available:');
        console.log('  window.tester - Simulation testing utilities');
        console.log('  window.perfMonitor - Performance monitoring');
        console.log('  window.simulation - Direct simulation access');
        console.log('  window.controller - Material and input controller');
        console.log('\n⌨️  Keyboard Shortcuts:');
        console.log('  P - Pause/Resume');
        console.log('  Ctrl+T - Run tests');
        console.log('  Ctrl+S - Save state');
        console.log('  A/D or Arrow Keys - Rotate (should work now!)');
        console.log('  V - Cycle viscosity\n');
        
        this.animate(0);
    }

    async animate(currentTime) {
        const deltaTime = (currentTime - this.lastTime) * 0.001; // convert to seconds
        this.lastTime = currentTime;

        // Record performance
        this.perfMonitor.recordFrame(deltaTime);
        
        // Log FPS every 60 frames
        if (++this.frameCount % 60 === 0) {
            this.perfMonitor.logStats();
        }

        // Update controller (continuous injection when buttons held)
        this.controller.update();
        
        await this.simulation.update(deltaTime);
        this.renderer.render(this.simulation);

        requestAnimationFrame(this.animate);
    }
}

window.addEventListener('DOMContentLoaded', async (event) => {
    // Default to WebGL-only for stability. Enable WebGPU renderer explicitly
    // via URL flag: ?webgpu=1
    const search = window.location && window.location.search || '';
    const useWebGPU = search.includes('webgpu=1');
    const app = new App(useWebGPU);
    app.run();
});
