#version 300 es
precision highp float;
// UPDATED: Nov 2, 2025 - Lowered thin-film threshold from 0.005-0.020 to 0.001-0.01

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_scene;
uniform sampler2D u_oil_texture;
uniform vec2 u_resolution;         // screen resolution in pixels
uniform float u_refract_strength;  // 0.0 - small value (e.g., 0.005 .. 0.02)
uniform float u_fresnel_power;     // e.g., 3.0
uniform float u_occlusion;         // 0..1 how much oil occludes scene
uniform float u_oil_gamma;         // thickness gamma for alpha mapping
uniform float u_tint_strength;     // 0..1 how much oil color tints the scene under oil

// Thickness is stored in alpha channel of oil texture
float thickness(vec4 o) { return o.a; }

// Circular container boundary
const vec2 center = vec2(0.5, 0.5);
const float containerRadius = 0.48;

// Clamp coordinate to circular boundary
vec2 clampToCircle(vec2 coord, vec2 resolution) {
    float aspect = resolution.x / max(resolution.y, 1.0);
    vec2 r = coord - center;
    vec2 r_as = vec2(r.x * aspect, r.y);
    float d = length(r_as);
    
    if (d > containerRadius) {
        vec2 r_as_clamped = (r_as / max(d, 1e-6)) * containerRadius;
        vec2 r_uv_clamped = vec2(r_as_clamped.x / max(aspect, 1e-6), r_as_clamped.y);
        return center + r_uv_clamped;
    }
    return coord;
}

void main() {
    vec2 texel = 1.0 / max(u_resolution, vec2(1.0));

    // Read oil and derive thickness field
    vec4 oilSample = texture(u_oil_texture, v_texCoord);
    vec3 oilRGB = oilSample.rgb;
    float th = thickness(oilSample);

    // Screen-space gradient of thickness (Sobel-lite)
    float thL = thickness(texture(u_oil_texture, v_texCoord - vec2(texel.x, 0.0)));
    float thR = thickness(texture(u_oil_texture, v_texCoord + vec2(texel.x, 0.0)));
    float thD = thickness(texture(u_oil_texture, v_texCoord - vec2(0.0, texel.y)));
    float thU = thickness(texture(u_oil_texture, v_texCoord + vec2(0.0, texel.y)));
    vec2 grad = vec2(thR - thL, thU - thD);

    // Refraction offset: bend toward normal (negative gradient)
    vec2 offset = -normalize(grad + 1e-6) * (u_refract_strength * th);
    vec2 refractCoord = clampToCircle(v_texCoord + offset, u_resolution);
    vec3 refracted = texture(u_scene, v_texCoord).rgb;

    // Simple highlight based on thickness
    float highlight = pow(th, 2.0) * 0.1;

    // Alpha by thickness with thin-film suppression (ignore ultra-thin oil)
    // Lowered threshold from 0.005-0.020 to 0.001-0.01 for better visibility
    float thinGate = smoothstep(0.001, 0.01, th);
    float a = clamp(pow(th, u_oil_gamma), 0.0, 1.0) * thinGate;
    vec3 base = texture(u_scene, v_texCoord).rgb;
    // Apply occlusion to base content under oil first (no color blend yet)
    vec3 baseOccluded = mix(base, base * (1.0 - u_occlusion), a);
    // Then refract and blend oil over the occluded base
    vec3 color = mix(baseOccluded, refracted, a);
    // Apply color tint from the oil itself - linear visibility for better color saturation
    float tintVisibility = a * thinGate; // was (a*a)*(thinGate*thinGate), too weak
    color = mix(color, oilRGB, tintVisibility * clamp(u_tint_strength, 0.0, 1.0) * 2.0);
    // Add highlight on top
    // color += highlight * a;
    fragColor = vec4(color, 1.0);
}
