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
    
    // Tangential force: perpendicular to radius vector
    // For counter-clockwise rotation: force = (-y, x) * strength
    // Stronger at center, weaker at edge (compensates for radius in v = ω × r)
    float edgeFactor = dist / containerRadius; // linear ramp
    vec2 force = vec2(-centered_coord.y, centered_coord.x) * u_rotation_amount * 25.0 * (1.3 - 0.3 * edgeFactor);
    
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
    
    // Apply boundary constraint: reflect velocity at walls
    if (dist > containerRadius) {
        // Outside container - push velocity inward
        // Prevent NaN: only normalize if dist > 0
        vec2 normal = dist > 0.001 ? normalize(centered_coord) : vec2(1.0, 0.0);
        vec2 reflection = velocity.xy - 2.0 * dot(velocity.xy, normal) * normal;
        outColor = vec4(reflection * 0.5, 0.0, 0.0); // Dampen at walls
    } else {
        vec2 newVelocity = velocity.xy + force;
        // Clamp velocity to prevent overflow to Inf
        newVelocity = clamp(newVelocity, vec2(-50000.0), vec2(50000.0));
        outColor = vec4(newVelocity, 0.0, 0.0);
    }
}
