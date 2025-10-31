#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 outColor;

uniform sampler2D u_velocity_texture;
uniform sampler2D u_color_texture;
uniform float u_rotation_amount;
uniform vec2 u_resolution;
uniform float u_dt;
uniform float u_boundary_mode; // 0=bounce, 1=viscous drag, 2=repulsive force

void main() {
    vec2 centered_coord = v_texCoord - 0.5;
    float aspect = u_resolution.x / max(u_resolution.y, 1.0);
    vec2 centered_aspect = vec2(centered_coord.x * aspect, centered_coord.y);
    float dist = length(centered_aspect);
    
    // Circular container boundary (radius = 0.48 to leave edge space)
    const float containerRadius = 0.48;
    vec2 force;
    
    // Rigid-body rotation as viscous coupling from spinning plate boundary
    // Physical model: plate spins → friction at bottom → shear stress → velocity diffuses upward
    // Apply rotation everywhere with gentle blend (no dead-zone to avoid pooling)
    
    // Compute rigid-body velocity field: v = ω × r
    float distSafe = max(dist, 0.002); // tiny epsilon to avoid singularity at exact center
    vec2 v_as = vec2(-centered_aspect.y, centered_aspect.x) * u_rotation_amount;
    
    // Rim feathering only (smooth at wall to avoid boundary artifacts)
    float rimFeather = 1.0 - smoothstep(containerRadius - 0.03, containerRadius, dist);
    
    // Map back to UV space
    vec2 v_uv = vec2(v_as.x / max(aspect, 1e-6), v_as.y);
    
    // Viscous coupling: blend factor mimics friction transmission (not instant velocity replacement)
    // Higher = stronger coupling, longer persistence
    const float viscousCoupling = 0.25; // 25% blend per frame for lingering rotation
    const float rotationGain = 0.4; // drastically reduced to prevent over-energizing (was 16.0)
    
    force = v_uv * rotationGain * viscousCoupling * rimFeather;
    
    // Add gentle spiral outflow near center to break up pooling (prevents dead zone)
    // Physics: spinning creates outward spiral flow at center (like a vortex pump)
    const float centralRadius = 0.08; // active in central 8% of plate
    float centralStrength = smoothstep(centralRadius, 0.0, dist); // 1 at center, 0 at edge of zone
    vec2 radialDir = dist > 1e-6 ? centered_aspect / dist : vec2(1.0, 0.0);
    vec2 tangentDir = vec2(-radialDir.y, radialDir.x); // perpendicular to radial (tangential)
    vec2 radialDir_uv = vec2(radialDir.x / max(aspect, 1e-6), radialDir.y);
    vec2 tangentDir_uv = vec2(tangentDir.x / max(aspect, 1e-6), tangentDir.y);
    float outflowStrength = abs(u_rotation_amount) * 0.08; // reduced from 0.3 to be much gentler
    // Spiral: 70% radial + 30% tangential (in rotation direction)
    float rotationSign = sign(u_rotation_amount + 1e-6); // preserve rotation direction
    vec2 centralOutflow = (radialDir_uv * 0.7 + tangentDir_uv * rotationSign * 0.3) * centralStrength * outflowStrength;
    force += centralOutflow;

    // Apply rotation only inside the plate (aspect-correct mask)
    float inside = step(dist, containerRadius);
    force *= inside;
    
    // Note: removed passive radial drain to prevent artificial ink loss
    
    vec4 velocity = texture(u_velocity_texture, v_texCoord);
    
    // Apply smooth boundary constraint: soften velocity near walls
    if (dist > containerRadius) {
        // Outside container - push velocity inward with smooth falloff
        vec2 normal_as = dist > 0.001 ? normalize(centered_aspect) : vec2(1.0, 0.0);
        vec2 normal = normalize(vec2(normal_as.x / max(aspect, 1e-6), normal_as.y));
        vec2 reflection = velocity.xy - 2.0 * dot(velocity.xy, normal) * normal;
        float falloff = 1.0 - smoothstep(containerRadius, containerRadius + 0.02, dist);
        outColor = vec4(reflection * 0.5 * falloff, 0.0, 0.0);
    } else {
        // Inside container - apply forces uniformly (rotation persists to rim)
        vec2 newVelocity = velocity.xy + force;

        // Compute normal for boundary interactions
        vec2 normal_as = dist > 0.001 ? centered_aspect / dist : vec2(1.0, 0.0);
        vec2 normal = normalize(vec2(normal_as.x / max(aspect, 1e-6), normal_as.y));
        
        // Three boundary modes:
        if (u_boundary_mode < 0.5) {
            // Mode 0: Original bounce (elastic reflection)
            float rimBand = smoothstep(containerRadius - 0.04, containerRadius, dist);
            float vN = dot(newVelocity, normal);
            float inward = max(0.0, -vN);
            float k = 0.95; // elasticity
            newVelocity += normal * (inward * k * rimBand);
            
        } else if (u_boundary_mode < 1.5) {
            // Mode 1: Viscous drag (squeeze film effect)
            // Model: ink between moving ink and wall creates velocity-dependent resistance
            // Drag increases exponentially as distance to wall decreases
            float rimBand = smoothstep(containerRadius - 0.08, containerRadius, dist);
            
            // Drag coefficient increases near wall (squeeze film effect)
            // At wall: very high drag; further away: minimal drag
            float dragCoeff = rimBand * rimBand * 0.85; // quadratic increase, max 85% damping
            
            // Apply drag to velocity component perpendicular to radius (tangential)
            // and stronger drag to radial outward component
            float vN = dot(newVelocity, normal);
            vec2 vTangent = newVelocity - vN * normal;
            
            // Damp tangential velocity (friction from wall)
            vTangent *= (1.0 - dragCoeff * 0.6);
            
            // Strongly resist outward motion (squeeze film pressure)
            float outward = max(0.0, vN);
            vN = vN - outward * dragCoeff * 1.2;
            
            // Gentle bounce for strong inward motion
            float inward = max(0.0, -vN);
            float bounceStrength = smoothstep(containerRadius - 0.02, containerRadius, dist);
            vN += inward * 0.7 * bounceStrength;
            
            newVelocity = vTangent + vN * normal;
            
        } else {
            // Mode 2: Repulsive force (increases near edge)
            // Soft potential wall that pushes ink away before collision
            float repulsionBand = smoothstep(containerRadius - 0.12, containerRadius, dist);
            
            // Exponential repulsion: gentle far away, strong near wall
            float repulsionStrength = repulsionBand * repulsionBand * repulsionBand * 0.008;
            
            // Push inward (against the normal)
            vec2 repulsionForce = -normal * repulsionStrength;
            newVelocity += repulsionForce;
            
            // Still need gentle bounce for any remaining inward velocity
            float rimBand = smoothstep(containerRadius - 0.02, containerRadius, dist);
            float vN = dot(newVelocity, normal);
            float inward = max(0.0, -vN);
            newVelocity += normal * (inward * 0.8 * rimBand);
        }
        
        // Clamp velocity to prevent overflow to Inf
        newVelocity = clamp(newVelocity, vec2(-50000.0), vec2(50000.0));
        outColor = vec4(newVelocity, 0.0, 0.0);
    }
}
