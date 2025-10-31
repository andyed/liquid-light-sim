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

    // Rim weighting: stronger damping near rim
    float rim = smoothstep(containerRadius - 0.08, containerRadius, d);

    // Apply damping to color magnitude (preserve hue)
    float strength = clamp(u_strength, 0.0, 1.0);
    float damp = 1.0 - strength * (0.5 + 0.5 * rim); // 50% base + 50% extra at rim

    vec3 rgb = c.rgb * damp;
    outColor = vec4(rgb * inside, 1.0);
}
