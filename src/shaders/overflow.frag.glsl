#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 outColor;

uniform sampler2D u_color_texture;
uniform vec2 u_resolution;
uniform float u_strength; // 0..1 overall damping strength

const vec2 center = vec2(0.5, 0.5);
const float containerRadius = 0.48;

void main() {
    vec4 c = texture(u_color_texture, v_texCoord);

    // Aspect-correct distance to rim
    float aspect = u_resolution.x / max(u_resolution.y, 1.0);
    vec2 r = v_texCoord - center;
    vec2 r_as = vec2(r.x * aspect, r.y);
    float d = length(r_as);

    // Inside mask
    float inside = step(d, containerRadius);

    // Rim weighting: stronger damping near rim (normalize band to pixel scale)
    float scale = 1080.0 / max(min(u_resolution.x, u_resolution.y), 1.0);
    float w08 = 0.08 * scale;
    float rim = smoothstep(containerRadius - w08, containerRadius, d);

    // Apply damping to color magnitude (preserve hue)
    float strength = clamp(u_strength, 0.0, 1.0);
    
    // Detect "pixel soup" - high local color variance indicates speckling
    vec2 texel = 1.0 / vec2(textureSize(u_color_texture, 0));
    vec3 n0 = texture(u_color_texture, v_texCoord + texel * vec2(-1.0, -1.0)).rgb;
    vec3 n1 = texture(u_color_texture, v_texCoord + texel * vec2( 0.0, -1.0)).rgb;
    vec3 n2 = texture(u_color_texture, v_texCoord + texel * vec2( 1.0, -1.0)).rgb;
    vec3 n3 = texture(u_color_texture, v_texCoord + texel * vec2(-1.0,  0.0)).rgb;
    vec3 n4 = texture(u_color_texture, v_texCoord + texel * vec2( 1.0,  0.0)).rgb;
    vec3 n5 = texture(u_color_texture, v_texCoord + texel * vec2(-1.0,  1.0)).rgb;
    vec3 n6 = texture(u_color_texture, v_texCoord + texel * vec2( 0.0,  1.0)).rgb;
    vec3 n7 = texture(u_color_texture, v_texCoord + texel * vec2( 1.0,  1.0)).rgb;
    
    // Compute hue directions and variance
    vec3 avg = (n0 + n1 + n2 + n3 + c.rgb + n4 + n5 + n6 + n7) / 9.0;
    float m = length(c.rgb);
    float mAvg = length(avg);
    
    // Measure color coherence (low = speckled/mixed, high = uniform)
    vec3 dir = m > 1e-6 ? c.rgb / m : vec3(0.0);
    vec3 dirAvg = mAvg > 1e-6 ? avg / mAvg : dir;
    float coherence = max(0.0, dot(dir, dirAvg)); // 0..1, lower = more mixed
    float mixedness = 1.0 - coherence; // 0..1, higher = more pixel soup
    
    // Target mixed areas more aggressively during overflow
    // Base damping: 30% base + 40% at rim + up to 30% for mixed areas
    float baseFactor = 0.3 + 0.4 * rim;
    float mixedFactor = mixedness * 0.3;
    float totalDamping = strength * (baseFactor + mixedFactor);
    float damp = clamp(1.0 - totalDamping, 0.0, 1.0); // ensure valid range

    vec3 rgb = c.rgb * damp;
    outColor = vec4(rgb * inside, 1.0);
}
