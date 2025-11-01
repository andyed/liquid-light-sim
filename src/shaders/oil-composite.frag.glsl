#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_scene;
uniform sampler2D u_oil_texture;
uniform vec2 u_resolution;         // screen resolution in pixels
uniform float u_refract_strength;  // 0.0 - small value (e.g., 0.005 .. 0.02)
uniform float u_fresnel_power;     // e.g., 3.0

// Convert oil color to a thickness proxy (luminance)
float thickness(vec3 c) {
    return dot(c, vec3(0.3333));
}

void main() {
    vec2 texel = 1.0 / max(u_resolution, vec2(1.0));

    // Read oil and derive thickness field
    vec3 oilRGB = texture(u_oil_texture, v_uv).rgb;
    float th = thickness(oilRGB);

    // Screen-space gradient of thickness (Sobel-lite)
    float thL = thickness(texture(u_oil_texture, v_uv - vec2(texel.x, 0.0)).rgb);
    float thR = thickness(texture(u_oil_texture, v_uv + vec2(texel.x, 0.0)).rgb);
    float thD = thickness(texture(u_oil_texture, v_uv - vec2(0.0, texel.y)).rgb);
    float thU = thickness(texture(u_oil_texture, v_uv + vec2(0.0, texel.y)).rgb);
    vec2 grad = vec2(thR - thL, thU - thD);

    // Refraction offset: bend toward normal (negative gradient)
    vec2 offset = -normalize(grad + 1e-6) * (u_refract_strength * th);
    vec3 refracted = texture(u_scene, clamp(v_uv + offset, 0.0, 1.0)).rgb;

    // Fresnel-ish highlight using view-normal alignment proxy: gradient magnitude
    float g = length(grad);
    float fres = pow(clamp(g * 40.0, 0.0, 1.0), u_fresnel_power); // scale factor 40 tuned for 1080p
    vec3 tint = mix(vec3(1.0), normalize(oilRGB + 1e-4), 0.5);
    vec3 highlight = fres * (0.15 * tint + 0.35 * oilRGB);

    // Alpha by thickness, blend refracted over base with highlight
    float a = clamp(th, 0.0, 1.0);
    vec3 base = texture(u_scene, v_uv).rgb;
    vec3 color = mix(base, refracted, a) + highlight * a;
    fragColor = vec4(color, 1.0);
}
