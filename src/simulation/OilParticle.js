/**
 * OilParticle - Represents a discrete blob of oil
 * Used in hybrid particle-grid system for thick oil
 */
export default class OilParticle {
    constructor(x, y, vx, vy, thickness, color) {
        this.x = x;           // Position in normalized coords [0,1]
        this.y = y;
        this.vx = vx || 0;    // Velocity
        this.vy = vy || 0;
        this.thickness = thickness;  // Mass/radius
        this.color = color || { r: 1.0, g: 0.82, b: 0.4 };  // RGB tint
        this.age = 0;         // Lifetime in seconds
        this.id = OilParticle.nextId++;
    }
    
    update(dt, waterVelocity, buoyancy, damping = 0.98) {
        // Apply water coupling
        this.vx += waterVelocity.x * dt;
        this.vy += waterVelocity.y * dt;
        
        // Apply buoyancy (vertical force)
        this.vy -= buoyancy * dt; // Negative = rises (up is negative Y in texture space)
        
        // Damping (friction)
        this.vx *= damping;
        this.vy *= damping;
        
        // Advect position
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        
        // Age
        this.age += dt;
    }
    
    constrainToCircle(centerX = 0.5, centerY = 0.5, radius = 0.48) {
        const dx = this.x - centerX;
        const dy = this.y - centerY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist > radius) {
            // Bounce off boundary
            const nx = dx / dist;
            const ny = dy / dist;
            
            // Reflect position
            this.x = centerX + nx * radius;
            this.y = centerY + ny * radius;
            
            // Reflect velocity (elastic collision)
            const dot = this.vx * nx + this.vy * ny;
            this.vx -= 2 * dot * nx;
            this.vy -= 2 * dot * ny;
            
            // Dampen bounce
            this.vx *= 0.8;
            this.vy *= 0.8;
        }
    }
    
    distanceTo(other) {
        const dx = this.x - other.x;
        const dy = this.y - other.y;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    // Check if this particle should merge with another
    shouldMerge(other, mergeDistance = 0.02) {
        return this.distanceTo(other) < (this.thickness + other.thickness) * mergeDistance;
    }
    
    // Merge another particle into this one
    absorb(other) {
        const totalMass = this.thickness + other.thickness;
        
        // Weighted average position
        this.x = (this.x * this.thickness + other.x * other.thickness) / totalMass;
        this.y = (this.y * this.thickness + other.y * other.thickness) / totalMass;
        
        // Weighted average velocity
        this.vx = (this.vx * this.thickness + other.vx * other.thickness) / totalMass;
        this.vy = (this.vy * this.thickness + other.vy * other.thickness) / totalMass;
        
        // Weighted average color
        this.color = {
            r: (this.color.r * this.thickness + other.color.r * other.thickness) / totalMass,
            g: (this.color.g * this.thickness + other.color.g * other.thickness) / totalMass,
            b: (this.color.b * this.thickness + other.color.b * other.thickness) / totalMass
        };
        
        // Combine mass
        this.thickness = totalMass;
        
        // Average age
        this.age = (this.age + other.age) * 0.5;
    }
}

OilParticle.nextId = 0;
