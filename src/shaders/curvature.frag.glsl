#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_oil_texture;
uniform vec2 u_resolution;

void main() {
    vec2 texel = 1.0 / u_resolution;
    float tx = texel.x;
    float ty = texel.y;

    float s11 = texture(u_oil_texture, v_texCoord).a;
    float s10 = texture(u_oil_texture, v_texCoord + vec2(  0, -ty)).a;
    float s01 = texture(u_oil_texture, v_texCoord + vec2(-tx,   0)).a;
    float s21 = texture(u_oil_texture, v_texCoord + vec2( tx,   0)).a;
    float s12 = texture(u_oil_texture, v_texCoord + vec2(  0,  ty)).a;

    // Calculate Laplacian (approximating curvature)
    // Using a 5-point stencil: (sum of neighbors - 4 * center) / (texel_size^2)
    float laplacian = (s10 + s01 + s21 + s12 - 4.0 * s11) / (tx * tx);

    // Store Laplacian in the R channel (or any channel, as it's a scalar)
    fragColor = vec4(laplacian, 0.0, 0.0, 1.0);
}
