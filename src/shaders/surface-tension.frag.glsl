#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_oil_texture;
uniform vec2 u_resolution;
uniform float u_surface_tension;

void main() {
    vec2 texel = 1.0 / u_resolution;
    float tx = texel.x;
    float ty = texel.y;

    // Sobel filter to calculate the gradient of the oil thickness
    float s00 = texture(u_oil_texture, v_texCoord + vec2(-tx, -ty)).a;
    float s10 = texture(u_oil_texture, v_texCoord + vec2(  0, -ty)).a;
    float s20 = texture(u_oil_texture, v_texCoord + vec2( tx, -ty)).a;
    float s01 = texture(u_oil_texture, v_texCoord + vec2(-tx,   0)).a;
    float s21 = texture(u_oil_texture, v_texCoord + vec2( tx,   0)).a;
    float s02 = texture(u_oil_texture, v_texCoord + vec2(-tx,  ty)).a;
    float s12 = texture(u_oil_texture, v_texCoord + vec2(  0,  ty)).a;
    float s22 = texture(u_oil_texture, v_texCoord + vec2( tx,  ty)).a;

    float s11 = texture(u_oil_texture, v_texCoord).a;

    float average_thickness = (s00 + s10 + s20 + s01 + s21 + s02 + s12 + s22) / 8.0;
    float difference = average_thickness - s11;

    vec4 oil = texture(u_oil_texture, v_texCoord);
    oil.a += difference * u_surface_tension;

    fragColor = oil;
}
