/**
 * ColorWheel - HSV color picker with saturation/value square
 * Beautiful, professional color selection for VJ performance
 */
export default class ColorWheel {
    constructor(container) {
        this.container = container;
        this.size = 200; // Wheel diameter
        this.hue = 180; // Default cyan
        this.saturation = 0.9;
        this.value = 1.0;
        
        this.isDraggingWheel = false;
        this.isDraggingSquare = false;
        
        this.onChange = null; // Callback for color changes
        
        this.createUI();
        this.setupEventListeners();
        this.updateColor();
    }
    
    createUI() {
        // Main container
        this.element = document.createElement('div');
        this.element.className = 'color-wheel-container';
        this.element.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: rgba(0, 0, 0, 0.8);
            border-radius: 12px;
            padding: 20px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
            backdrop-filter: blur(10px);
            z-index: 1000;
            user-select: none;
        `;
        
        // Hue wheel canvas
        this.wheelCanvas = document.createElement('canvas');
        this.wheelCanvas.width = this.size;
        this.wheelCanvas.height = this.size;
        this.wheelCanvas.style.cssText = `
            display: block;
            cursor: crosshair;
            border-radius: 50%;
        `;
        
        // SV square canvas
        this.squareCanvas = document.createElement('canvas');
        this.squareCanvas.width = this.size;
        this.squareCanvas.height = this.size;
        this.squareCanvas.style.cssText = `
            display: block;
            margin-top: 15px;
            cursor: crosshair;
            border-radius: 8px;
        `;
        
        // Current color preview
        this.preview = document.createElement('div');
        this.preview.style.cssText = `
            width: 100%;
            height: 40px;
            margin-top: 15px;
            border-radius: 8px;
            border: 2px solid rgba(255, 255, 255, 0.3);
        `;
        
        // RGB values display
        this.rgbDisplay = document.createElement('div');
        this.rgbDisplay.style.cssText = `
            margin-top: 10px;
            color: rgba(255, 255, 255, 0.8);
            font-family: 'Monaco', 'Courier New', monospace;
            font-size: 11px;
            text-align: center;
        `;
        
        this.element.appendChild(this.wheelCanvas);
        this.element.appendChild(this.squareCanvas);
        this.element.appendChild(this.preview);
        this.element.appendChild(this.rgbDisplay);
        this.container.appendChild(this.element);
        
        this.drawWheel();
        this.drawSquare();
    }
    
    drawWheel() {
        const ctx = this.wheelCanvas.getContext('2d');
        const centerX = this.size / 2;
        const centerY = this.size / 2;
        const radius = this.size / 2;
        
        // Draw hue wheel
        for (let angle = 0; angle < 360; angle++) {
            const startAngle = (angle - 90) * Math.PI / 180;
            const endAngle = (angle + 1 - 90) * Math.PI / 180;
            
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.arc(centerX, centerY, radius, startAngle, endAngle);
            ctx.closePath();
            
            const hue = angle;
            ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
            ctx.fill();
        }
        
        // Draw center circle (white)
        const innerRadius = radius * 0.3;
        ctx.beginPath();
        ctx.arc(centerX, centerY, innerRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        
        // Draw current hue indicator
        const indicatorAngle = (this.hue - 90) * Math.PI / 180;
        const indicatorRadius = (radius + innerRadius) / 2;
        const indicatorX = centerX + Math.cos(indicatorAngle) * indicatorRadius;
        const indicatorY = centerY + Math.sin(indicatorAngle) * indicatorRadius;
        
        ctx.beginPath();
        ctx.arc(indicatorX, indicatorY, 8, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.stroke();
    }
    
    drawSquare() {
        const ctx = this.squareCanvas.getContext('2d');
        const size = this.size;
        
        // Create gradient: white to hue (left to right = saturation)
        // top to bottom = value (brightness)
        const imageData = ctx.createImageData(size, size);
        const data = imageData.data;
        
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const s = x / size; // Saturation (0 to 1)
                const v = 1 - (y / size); // Value (1 to 0, top to bottom)
                
                const rgb = this.hsvToRgb(this.hue, s, v);
                const index = (y * size + x) * 4;
                
                data[index] = rgb.r;
                data[index + 1] = rgb.g;
                data[index + 2] = rgb.b;
                data[index + 3] = 255;
            }
        }
        
        ctx.putImageData(imageData, 0, 0);
        
        // Draw current selection indicator
        const x = this.saturation * size;
        const y = (1 - this.value) * size;
        
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, Math.PI * 2);
        ctx.strokeStyle = this.value > 0.5 ? '#000000' : '#ffffff';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.strokeStyle = this.value > 0.5 ? '#ffffff' : '#000000';
        ctx.lineWidth = 1;
        ctx.stroke();
    }
    
    setupEventListeners() {
        // Wheel events
        this.wheelCanvas.addEventListener('mousedown', (e) => {
            this.isDraggingWheel = true;
            this.handleWheelDrag(e);
        });
        
        // Square events
        this.squareCanvas.addEventListener('mousedown', (e) => {
            this.isDraggingSquare = true;
            this.handleSquareDrag(e);
        });
        
        // Global mouse events
        document.addEventListener('mousemove', (e) => {
            if (this.isDraggingWheel) {
                this.handleWheelDrag(e);
            } else if (this.isDraggingSquare) {
                this.handleSquareDrag(e);
            }
        });
        
        document.addEventListener('mouseup', () => {
            this.isDraggingWheel = false;
            this.isDraggingSquare = false;
        });
    }
    
    handleWheelDrag(e) {
        const rect = this.wheelCanvas.getBoundingClientRect();
        // Use rect dimensions (actual displayed size) instead of canvas internal size
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const x = e.clientX - rect.left - centerX;
        const y = e.clientY - rect.top - centerY;
        
        const angle = Math.atan2(y, x) * 180 / Math.PI;
        this.hue = (angle + 90 + 360) % 360;
        
        this.drawWheel();
        this.drawSquare();
        this.updateColor();
    }
    
    handleSquareDrag(e) {
        const rect = this.squareCanvas.getBoundingClientRect();
        // Use rect dimensions (actual displayed size) for accurate mapping
        const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
        const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
        
        this.saturation = x / rect.width;
        this.value = 1 - (y / rect.height);
        
        this.drawSquare();
        this.updateColor();
    }
    
    updateColor() {
        const rgb = this.hsvToRgb(this.hue, this.saturation, this.value);
        
        // Update preview
        this.preview.style.backgroundColor = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
        
        // Update RGB display
        this.rgbDisplay.textContent = `RGB(${rgb.r}, ${rgb.g}, ${rgb.b})`;
        
        // Trigger callback
        if (this.onChange) {
            this.onChange({
                r: rgb.r / 255,
                g: rgb.g / 255,
                b: rgb.b / 255
            });
        }
    }
    
    hsvToRgb(h, s, v) {
        h = h / 360;
        const i = Math.floor(h * 6);
        const f = h * 6 - i;
        const p = v * (1 - s);
        const q = v * (1 - f * s);
        const t = v * (1 - (1 - f) * s);
        
        let r, g, b;
        switch (i % 6) {
            case 0: r = v; g = t; b = p; break;
            case 1: r = q; g = v; b = p; break;
            case 2: r = p; g = v; b = t; break;
            case 3: r = p; g = q; b = v; break;
            case 4: r = t; g = p; b = v; break;
            case 5: r = v; g = p; b = q; break;
        }
        
        return {
            r: Math.round(r * 255),
            g: Math.round(g * 255),
            b: Math.round(b * 255)
        };
    }
    
    getColor() {
        const rgb = this.hsvToRgb(this.hue, this.saturation, this.value);
        return {
            r: rgb.r / 255,
            g: rgb.g / 255,
            b: rgb.b / 255
        };
    }
    
    setColor(r, g, b) {
        // Convert RGB to HSV
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const delta = max - min;
        
        // Value
        this.value = max;
        
        // Saturation
        this.saturation = max === 0 ? 0 : delta / max;
        
        // Hue
        if (delta === 0) {
            this.hue = 0;
        } else if (max === r) {
            this.hue = 60 * (((g - b) / delta) % 6);
        } else if (max === g) {
            this.hue = 60 * (((b - r) / delta) + 2);
        } else {
            this.hue = 60 * (((r - g) / delta) + 4);
        }
        
        if (this.hue < 0) this.hue += 360;
        
        this.drawWheel();
        this.drawSquare();
        this.updateColor();
    }
}
