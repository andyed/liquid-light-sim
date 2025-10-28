#version 300 es
precision mediump float;

in vec2 v_texCoord;
out vec4 outColor;

uniform sampler2D u_velocity_texture;

void main() {
    float dx = 1.0 / float(textureSize(u_velocity_texture, 0).x);
    float dy = 1.0 / float(textureSize(u_velocity_texture, 0).y);

    float right = texture(u_velocity_texture, v_texCoord + vec2(dx, 0.0)).x;
    float left = texture(u_velocity_texture, v_texCoord - vec2(dx, 0.0)).x;
    float top = texture(u_velocity_texture, v_texCoord + vec2(0.0, dy)).y;
    float bottom = texture(u_velocity_texture, v_texCoord - vec2(0.0, dy)).y;

    outColor = vec4(0.5 * (right - left + top - bottom), 0.0, 0.0, 1.0);
}
