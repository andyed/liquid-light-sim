#version 300 es
precision mediump float;

in vec2 v_texCoord;
out vec4 outColor;

uniform sampler2D u_texture;

void main() {
    vec4 color = texture(u_texture, v_texCoord);
    // Clamp display to 0-1 range (but physics can have values > 1.0)
    outColor = vec4(clamp(color.rgb, 0.0, 1.0), color.a);
}
