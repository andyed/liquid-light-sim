#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 outColor;

uniform sampler2D u_velocity_texture;
uniform sampler2D u_color_texture;
uniform float u_rotation_amount;
uniform vec2 u_resolution;
uniform float u_dt;

void main() {
    vec2 centered_coord = v_texCoord - 0.5;
    float aspect = u_resolution.x / max(u_resolution.y, 1.0);
    vec2 centered_aspect = vec2(centered_coord.x * aspect, centered_coord.y);
    float dist = length(centered_aspect);
    
    // Circular container boundary (radius = 0.48 to leave edge space)
    const float containerRadius = 0.48;
    vec2 force;
    
    // Rigid-body rotation: v_as = ω × r_as; stronger center dead-zone, smooth ramp
    float centerFeather = smoothstep(0.04, 0.09, dist);          // avoid whirlpool at center
    float rimFeather = 1.0 - smoothstep(containerRadius - 0.02, containerRadius, dist); // soften near wall
    float rotWeight = centerFeather * rimFeather;
    vec2 v_as = vec2(-centered_aspect.y, centered_aspect.x) * (u_rotation_amount * rotWeight);
    // Map back to UV and apply calibrated gain (not dt-scaled)
    // We write velocity directly, so scaling by dt would under-drive the effect
    vec2 v_uv = vec2(v_as.x / max(aspect, 1e-6), v_as.y);
    const float rotationGain = 18.0; // tune as needed (15-30 typical)
    force = v_uv * rotationGain;

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
        // Inside container - apply forces with smooth edge falloff
        float edgeFalloff = 1.0 - smoothstep(0.45, containerRadius, dist);
        vec2 newVelocity = velocity.xy + force * edgeFalloff;

        // Bounce impulse: in a thin rim band, cancel inward normal velocity component
        float rimBand = smoothstep(containerRadius - 0.04, containerRadius, dist);
        if (rimBand > 0.0) {
            vec2 normal_as = dist > 0.0 ? centered_aspect / dist : vec2(1.0, 0.0);
            vec2 normal = normalize(vec2(normal_as.x / max(aspect, 1e-6), normal_as.y));
            float vN = dot(newVelocity, normal); // normal component (positive = outward)
            float inward = max(0.0, -vN);
            // Remove a fraction of inward component to emulate elastic reflection
            float k = 0.95; // 0..1, 1 = perfectly elastic cancellation of inward component
            newVelocity += normal * (inward * k);
        }
        // Clamp velocity to prevent overflow to Inf
        newVelocity = clamp(newVelocity, vec2(-50000.0), vec2(50000.0));
        outColor = vec4(newVelocity, 0.0, 0.0);
    }
}
