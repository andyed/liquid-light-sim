#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_oil_texture;

void main(){
  float th = texture(u_oil_texture, v_texCoord).a; // thickness stored in alpha
  fragColor = vec4(vec3(th), 1.0);
}
