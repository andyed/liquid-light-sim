#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 outColor;

uniform sampler2D u_color_texture;
uniform sampler2D u_velocity_texture;
uniform float u_dt;
uniform vec2 u_resolution;

// Circular container boundary
const vec2 center = vec2(0.5, 0.5);
const float containerRadius = 0.48;

vec2 clampToCircle(vec2 coord) {
    vec2 toCenter = coord - center;
    float dist = length(toCenter);
    if (dist > containerRadius) {
        return center + normalize(toCenter) * containerRadius;
    }
    return coord;
}

void main() {
    vec2 velocity = texture(u_velocity_texture, v_texCoord).xy;
    // Increase velocity scaling to get visible movement
    vec2 dt_vel = velocity * u_dt * 10.0 / u_resolution;
    
    // MacCormack advection for high-fidelity transport
    // Reference: GPU Gems 3, Chapter 30
    
    // Step 1: Forward advection (semi-Lagrangian)
    vec2 coord_forward = clampToCircle(v_texCoord - dt_vel);
    vec4 forward = texture(u_color_texture, coord_forward);
    
    // Step 2: Backward advection (reverse step to estimate error)
    vec2 vel_forward = texture(u_velocity_texture, coord_forward).xy;
    vec2 coord_backward = clampToCircle(coord_forward + vel_forward * u_dt * 10.0 / u_resolution);
    vec4 backward = texture(u_color_texture, coord_backward);
    
    // Step 3: Error correction
    vec4 current = texture(u_color_texture, v_texCoord);
    vec4 corrected = forward + 0.5 * (current - backward);
    
    // Step 4: Min/max limiter (prevents overshoots, maintains stability)
    // Sample neighborhood of forward position
    vec2 texel = 1.0 / u_resolution;
    vec4 n0 = texture(u_color_texture, clampToCircle(coord_forward + vec2(-texel.x, -texel.y)));
    vec4 n1 = texture(u_color_texture, clampToCircle(coord_forward + vec2(0.0, -texel.y)));
    vec4 n2 = texture(u_color_texture, clampToCircle(coord_forward + vec2(texel.x, -texel.y)));
    vec4 n3 = texture(u_color_texture, clampToCircle(coord_forward + vec2(-texel.x, 0.0)));
    vec4 n4 = forward;
    vec4 n5 = texture(u_color_texture, clampToCircle(coord_forward + vec2(texel.x, 0.0)));
    vec4 n6 = texture(u_color_texture, clampToCircle(coord_forward + vec2(-texel.x, texel.y)));
    vec4 n7 = texture(u_color_texture, clampToCircle(coord_forward + vec2(0.0, texel.y)));
    vec4 n8 = texture(u_color_texture, clampToCircle(coord_forward + vec2(texel.x, texel.y)));
    
    vec4 minVal = min(min(min(n0, n1), min(n2, n3)), min(min(n4, n5), min(n6, min(n7, n8))));
    vec4 maxVal = max(max(max(n0, n1), max(n2, n3)), max(max(n4, n5), max(n6, max(n7, n8))));
    
    // Clamp corrected value to neighborhood bounds
    outColor = clamp(corrected, minVal, maxVal);
    
    // Aesthetic enhancement: Balance sharpness with smoothness
    // Lower sharpness reduces banding artifacts
    float sharpness = 0.75; // Balanced for quality without artifacts
    outColor = mix(forward, outColor, sharpness);

    // --- Conservation guards ---
    // 1) Clamp channels to [0,1]
    outColor.rgb = clamp(outColor.rgb, vec3(0.0), vec3(1.0));
    // 2) Per-pixel concentration cap: ||color|| <= 1.0
    float conc = length(outColor.rgb);
    if (conc > 1.0) {
        outColor.rgb *= (1.0 / conc);
    }
    // 3) Force alpha to 1.0
    outColor.a = 1.0;
}
