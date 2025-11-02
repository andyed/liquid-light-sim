#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec2 fragColor;

uniform sampler2D u_velocity;    // Water velocity to damp
uniform sampler2D u_oil;         // Oil thickness (alpha)
uniform float u_drag;            // Drag coefficient (global)
uniform float u_dt;              // Timestep
uniform sampler2D u_oilProps;    // Optional per-pixel properties (A=drag)
uniform float u_useProps;        // 0 or 1

void main() {
  vec2 v = texture(u_velocity, v_texCoord).xy;
  float th = texture(u_oil, v_texCoord).a; // oil thickness in alpha
  // Dampen velocity proportionally to thickness
  float dragPx = mix(1.0, texture(u_oilProps, v_texCoord).a, clamp(u_useProps, 0.0, 1.0));
  float drag = u_drag * dragPx;
  float damp = clamp(th * drag * u_dt, 0.0, 0.95);
  v *= (1.0 - damp);
  fragColor = v;
}
