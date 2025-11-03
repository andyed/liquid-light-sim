#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_scene;
uniform sampler2D u_oil_texture;
uniform vec2 u_resolution;
uniform float u_oil_gamma;
uniform float u_tint_strength;

void main() {
    vec4 oilSample = texture(u_oil_texture, v_texCoord);
    float th = oilSample.a;
    vec3 oilRGB = oilSample.rgb;

    float a = clamp(pow(th, u_oil_gamma), 0.0, 1.0);

    vec3 base = texture(u_scene, v_texCoord).rgb;

    vec3 color = mix(base, oilRGB, a * u_tint_strength);

    fragColor = vec4(color, 1.0);
}
