#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 outColor;

uniform sampler2D u_color_texture;
uniform vec2 u_resolution;

const vec2 center = vec2(0.5, 0.5);
const float containerRadius = 0.48;

void main() {
    // Mask to circular plate (aspect-correct)
    float aspect = u_resolution.x / max(u_resolution.y, 1.0);
    vec2 r = v_texCoord - center;
    vec2 r_as = vec2(r.x * aspect, r.y);
    float d = length(r_as);
    float inside = step(d, containerRadius);

    vec3 c = texture(u_color_texture, v_texCoord).rgb;
    float conc = length(c);

    // Count as inked if concentration above small threshold
    float threshold = 0.001; // very low to detect any ink
    float inked = inside * step(threshold, conc);

    // R = inked (0/1), G = inside mask (0/1)
    outColor = vec4(inked, inside, 0.0, 1.0);
}
