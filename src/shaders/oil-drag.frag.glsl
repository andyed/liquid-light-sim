#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec2 fragColor;

uniform sampler2D u_velocity;    // Water velocity to damp
uniform sampler2D u_oil;         // Oil thickness (alpha)
uniform float u_drag;            // Drag coefficient
uniform float u_dt;              // Timestep

void main() {
  vec2 v = texture(u_velocity, v_texCoord).xy;
  float th = texture(u_oil, v_texCoord).a; // oil thickness in alpha
  // Dampen velocity proportionally to thickness
  float damp = clamp(th * u_drag * u_dt, 0.0, 0.95);
  v *= (1.0 - damp);
  fragColor = v;
}
