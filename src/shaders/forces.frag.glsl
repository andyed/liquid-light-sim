#version 300 es
precision mediump float;

in vec2 v_texCoord;
out vec4 outColor;

uniform sampler2D u_velocity_texture;
uniform sampler2D u_color_texture;
uniform float u_rotation_amount;

void main() {
    vec2 centered_coord = v_texCoord - 0.5;
    float dist = length(centered_coord);
    
    // Circular container boundary (radius = 0.48 to leave edge space)
    const float containerRadius = 0.48;
    vec2 force;
    
    // Tangential force: perpendicular to radius vector
    // For counter-clockwise rotation: force = (-y, x) * strength
    // Use solid body rotation: v = ω × r, where ω is angular velocity
    // This creates smoother, more physically accurate rotation
    float maxRadius = containerRadius * 0.9; // Don't apply force at very edge
    if (dist < maxRadius) {
        // Angular velocity decreases near center to avoid singularity
        float radiusFactor = smoothstep(0.0, 0.1, dist) * (1.0 - smoothstep(maxRadius * 0.8, maxRadius, dist));
        // Tangential velocity = angular_velocity × radius
        vec2 tangentialVel = vec2(-centered_coord.y, centered_coord.x) * u_rotation_amount * radiusFactor;
        force = tangentialVel;
    } else {
        force = vec2(0.0);
    }
    
    // Passive edge drain: gentle spillway near rim
    // Scales with local dye concentration - more ink = more drain force
    if (dist > 0.45) {
        vec3 dye = texture(u_color_texture, v_texCoord).rgb;
        float concentration = length(dye);
        float drainStrength = smoothstep(0.45, containerRadius, dist) * concentration;
        vec2 drainDir = dist > 0.001 ? normalize(centered_coord) : vec2(1.0, 0.0);
        vec2 drainForce = drainDir * drainStrength * 0.3; // gentle radial push
        force += drainForce;
    }
    
    vec4 velocity = texture(u_velocity_texture, v_texCoord);
    
    // Apply smooth boundary constraint: soften velocity near walls
    if (dist > containerRadius) {
        // Outside container - push velocity inward with smooth falloff
        vec2 normal = dist > 0.001 ? normalize(centered_coord) : vec2(1.0, 0.0);
        vec2 reflection = velocity.xy - 2.0 * dot(velocity.xy, normal) * normal;
        float falloff = 1.0 - smoothstep(containerRadius, containerRadius + 0.02, dist);
        outColor = vec4(reflection * 0.5 * falloff, 0.0, 0.0);
    } else {
        // Inside container - apply forces with smooth edge falloff
        float edgeFalloff = 1.0 - smoothstep(0.45, containerRadius, dist);
        vec2 newVelocity = velocity.xy + force * edgeFalloff;
        // Clamp velocity to prevent overflow to Inf
        newVelocity = clamp(newVelocity, vec2(-50000.0), vec2(50000.0));
        outColor = vec4(newVelocity, 0.0, 0.0);
    }
}
