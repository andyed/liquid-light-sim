import Renderer from './renderer.js';
import Simulation from './simulation.js';
import Controller from './controller.js';
import { SimulationTester, PerformanceMonitor } from '../tests/test-utils.js';

console.log("🎨 Welcome to Liquid Light Simulator!");

class App {
    constructor() {
        this.renderer = new Renderer();
        this.simulation = new Simulation(this.renderer);
        this.controller = new Controller(this.simulation, this.renderer);
        this.perfMonitor = new PerformanceMonitor();

        this.lastTime = 0;
        this.frameCount = 0;
        this.animate = this.animate.bind(this);
    }

    async run() {
        await this.renderer.init();
        await this.simulation.init();
        // Keep simulation buffers in sync with canvas size/DPR changes
        window.addEventListener('resize', () => this.simulation.resize());
        
        // Initialize testing tools (F004 requirement)
        window.tester = new SimulationTester(this.simulation);
        window.perfMonitor = this.perfMonitor;
        window.simulation = this.simulation; // For console debugging
        
        console.log('\n📚 Testing Tools Available:');
        console.log('  window.tester - Simulation testing utilities');
        console.log('  window.perfMonitor - Performance monitoring');
        console.log('  window.simulation - Direct simulation access');
        console.log('\n⌨️  Keyboard Shortcuts:');
        console.log('  P - Pause/Resume');
        console.log('  Ctrl+T - Run tests');
        console.log('  Ctrl+S - Save state');
        console.log('  A/D or Arrow Keys - Rotate (should work now!)');
        console.log('  V - Cycle viscosity\n');
        
        this.animate(0);
    }

    animate(currentTime) {
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
        
        this.simulation.update(deltaTime);
        this.renderer.render(this.simulation);

        requestAnimationFrame(this.animate);
    }
}

const app = new App();
app.run();

