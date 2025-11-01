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

    // Density-weighted occupancy: softly ramp from 0 to 1 as concentration increases
    // Low threshold t0 ignores faint haze; t1 marks fully-inked
    float t0 = 0.02;
    float t1 = 0.25;
    float inkWeight = smoothstep(t0, t1, conc); // 0..1
    float inked = inside * inkWeight;
    
    // Detect "pixel soup" - measure local color coherence
    vec2 texel = 1.0 / vec2(textureSize(u_color_texture, 0));
    vec3 n0 = texture(u_color_texture, v_texCoord + texel * vec2(-1.0, 0.0)).rgb;
    vec3 n1 = texture(u_color_texture, v_texCoord + texel * vec2( 1.0, 0.0)).rgb;
    vec3 n2 = texture(u_color_texture, v_texCoord + texel * vec2( 0.0,-1.0)).rgb;
    vec3 n3 = texture(u_color_texture, v_texCoord + texel * vec2( 0.0, 1.0)).rgb;
    vec3 avg = (c + n0 + n1 + n2 + n3) / 5.0;
    
    float m = length(c);
    float mAvg = length(avg);
    vec3 dir = m > 1e-6 ? c / m : vec3(0.0);
    vec3 dirAvg = mAvg > 1e-6 ? avg / mAvg : dir;
    float coherence = max(0.0, dot(dir, dirAvg)); // 0..1, lower = more mixed
    float mixedness = 1.0 - coherence; // 0..1, higher = pixel soup
    float isMixed = step(0.3, mixedness); // threshold: mixedness > 30% = soup
    float soupPixel = (inkWeight > 0.2 ? 1.0 : 0.0) * isMixed; // count only sufficiently inked mixed pixels

    // R = inked weight (0..1), G = inside mask (0/1), B = pixel soup (0/1)
    outColor = vec4(inked, inside, soupPixel, 1.0);
}
