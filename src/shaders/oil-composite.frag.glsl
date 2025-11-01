#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_scene;
uniform sampler2D u_oil_texture;

void main() {
    vec4 base = texture(u_scene, v_uv);
    vec4 oil = texture(u_oil_texture, v_uv);

    // Use luminance of oil RGB as thickness proxy
    float oilLuma = dot(oil.rgb, vec3(0.3333));
    float a = clamp(oilLuma, 0.0, 1.0);

    // Gentle lensy highlight tinted by oil color
    vec3 tint = mix(vec3(1.0), normalize(oil.rgb + 1e-4), 0.5);
    vec3 highlight = 0.15 * tint + 0.35 * oil.rgb;

    vec3 color = base.rgb + a * highlight;
    fragColor = vec4(color, 1.0);
}
