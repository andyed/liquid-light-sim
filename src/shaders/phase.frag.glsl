#version 300 es
precision mediump float;

in vec2 v_texCoord;
out vec4 outColor;

uniform sampler2D u_phase_texture;
uniform float u_dt;

void main() {
    float dx = 1.0 / float(textureSize(u_phase_texture, 0).x);
    float dy = 1.0 / float(textureSize(u_phase_texture, 0).y);

    float center = texture(u_phase_texture, v_texCoord).x;
    float left = texture(u_phase_texture, v_texCoord - vec2(dx, 0.0)).x;
    float right = texture(u_phase_texture, v_texCoord + vec2(dx, 0.0)).x;
    float top = texture(u_phase_texture, v_texCoord + vec2(0.0, dy)).x;
    float bottom = texture(u_phase_texture, v_texCoord - vec2(0.0, dy)).x;

    float laplacian = left + right + top + bottom - 4.0 * center;

    // Simplified Cahn-Hilliard equation
    float reaction = center * (1.0 - center) * (0.5 - center);
    float diffusion = laplacian;

    outColor = vec4(center + u_dt * (diffusion - reaction), 0.0, 0.0, 1.0);
}
