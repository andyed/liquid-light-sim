#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_oil_texture;
uniform vec2 u_resolution;

float thickness(vec3 c){ return dot(c, vec3(0.3333)); }

void main(){
  vec2 texel = 1.0 / max(u_resolution, vec2(1.0));
  float thL = thickness(texture(u_oil_texture, v_texCoord - vec2(texel.x, 0.0)).rgb);
  float thR = thickness(texture(u_oil_texture, v_texCoord + vec2(texel.x, 0.0)).rgb);
  float thD = thickness(texture(u_oil_texture, v_texCoord - vec2(0.0, texel.y)).rgb);
  float thU = thickness(texture(u_oil_texture, v_texCoord + vec2(0.0, texel.y)).rgb);
  vec2 g = vec2(thR - thL, thU - thD) * 0.5;
  float mag = length(g);
  fragColor = vec4(vec3(clamp(mag * 20.0, 0.0, 1.0)), 1.0); // scaled for visibility
}
