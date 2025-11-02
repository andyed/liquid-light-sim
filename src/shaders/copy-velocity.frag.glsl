#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec2 fragColor;

uniform sampler2D u_src; // source velocity (RG)

void main() {
  vec2 v = texture(u_src, v_texCoord).xy;
  fragColor = v;
}
