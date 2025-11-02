#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_propsTex;   // existing RGBA16F props
uniform vec2 u_point;           // center in UV [0,1]
uniform float u_radius;         // radius in UV
uniform vec2 u_resolution;      // canvas size
uniform vec4 u_props;           // R=coupling, G=viscosity, B=surfaceTension, A=drag

void main() {
  vec4 prev = texture(u_propsTex, v_texCoord);
  // Distance in UV
  vec2 p = u_point;
  float d = distance(v_texCoord, p);
  float r = u_radius;
  // Soft brush
  float t = clamp(1.0 - smoothstep(r * 0.5, r, d), 0.0, 1.0);
  // Overwrite toward target properties within brush
  vec4 next = mix(prev, u_props, t);
  fragColor = next;
}
