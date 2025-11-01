#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 outColor;

uniform sampler2D u_texture;
uniform vec2 u_point;
uniform vec3 u_color;
uniform float u_radius;
uniform bool u_isVelocity; // true when splatting into velocity field
uniform vec2 u_resolution;

void main() {
    // Aspect-correct distance so splats are circular in the plate space
    float aspect = u_resolution.x / max(u_resolution.y, 1.0);
    vec2 r = v_texCoord - u_point;
    vec2 r_as = vec2(r.x * aspect, r.y);
    float d = length(r_as);
    vec4 existing = texture(u_texture, v_texCoord);
    
    // Continuous source injection with Gaussian falloff
    // Interpret u_radius in UV based on min dimension; aspect-corrected distance handles shape
    float gaussian = exp(-d * d / (u_radius * u_radius * 0.5));
    float sourceStrength = 0.03;
    
    vec3 result;
    if (u_isVelocity) {
        // Velocity splat: add directly, no color 'spaceAvailable' gating
        // u_color carries (vx, vy, 0)
        vec3 velToAdd = u_color * gaussian; // sourceStrength not needed for velocity
        result = existing.rgb + velToAdd;
        // Clamp for safety (matches force shaders)
        result = clamp(result, vec3(-50000.0), vec3(50000.0));
    } else {
        // Color splat: respect available space to avoid mixing
        vec3 newInk = u_color * gaussian * sourceStrength;
        float existingConc = length(existing.rgb);
        float spaceAvailable = max(0.0, 0.8 - existingConc);
        vec3 inkToAdd = newInk * spaceAvailable;
        result = existing.rgb + inkToAdd;
        // Clamp to [0,1] for color
        result = clamp(result, vec3(0.0), vec3(1.0));
    }
    outColor = vec4(result, 1.0);
}
