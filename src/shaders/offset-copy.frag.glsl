#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_src;
uniform vec2 u_offset; // UV units, positive moves image right/up visually when subtracted

void main() {
  vec2 coord = v_texCoord - u_offset;
  fragColor = texture(u_src, coord);
}
