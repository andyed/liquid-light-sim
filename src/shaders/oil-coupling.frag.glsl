#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec2 fragColor;

uniform sampler2D u_oilVelocity;   // Current oil velocity
uniform sampler2D u_waterVelocity; // Water velocity to blend in
uniform sampler2D u_oil;           // Oil thickness field
uniform float u_couplingStrength;  // Base coupling factor
uniform float u_dt;



void main() {
  vec2 vOil = texture(u_oilVelocity, v_texCoord).xy;
  vec2 vWater = texture(u_waterVelocity, v_texCoord).xy;
  vec4 oil = texture(u_oil, v_texCoord);
  float th = oil.a;
  
  float coupling = u_couplingStrength;
  
  // If no (or ultra-thin) oil present, zero velocity to prevent ghost transport
  if (th < 0.005) {
    fragColor = vec2(0.0);
    return;
  }
  
  // Apply water influence as immediate blend (no dt) using the effective weight
  vec2 newVel = mix(vOil, vWater, coupling);
  
  fragColor = newVel;
}
