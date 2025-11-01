#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_water_color;   // water ink texture (RGB)
uniform sampler2D u_oil_texture;   // oil texture (RGBA16F), thickness from rgb luminance
uniform float u_thresh;            // occupancy threshold in water

float lum(vec3 c){ return dot(c, vec3(0.2126,0.7152,0.0722)); }
float thickness(vec3 c){ return dot(c, vec3(0.3333)); }

void main(){
  float x = v_texCoord.x;
  vec3 col = vec3(0.0);
  if (x < 0.5) {
    // Left half: water ink occupancy
    float occ = lum(texture(u_water_color, vec2(x*2.0, v_texCoord.y)).rgb);
    float m = step(u_thresh, occ);
    col = vec3(m);
  } else {
    // Right half: oil thickness visualization
    float th = thickness(texture(u_oil_texture, vec2((x-0.5)*2.0, v_texCoord.y)).rgb);
    col = vec3(th);
  }
  fragColor = vec4(col, 1.0);
}
