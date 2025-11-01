#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_oil_texture;

float thickness(vec3 c){ return dot(c, vec3(0.3333)); }

void main(){
  float th = thickness(texture(u_oil_texture, v_texCoord).rgb);
  fragColor = vec4(vec3(th), 1.0);
}
