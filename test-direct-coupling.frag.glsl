#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec2 fragColor;

uniform sampler2D u_oilVelocity;   // Current oil velocity
uniform sampler2D u_waterVelocity; // Water velocity to blend in
uniform sampler2D u_oil;           // Oil thickness field
uniform float u_couplingStrength;  // Base coupling factor
uniform float u_dt;

// TEST VERSION: Direct copy of water velocity to oil (100% coupling)
void main() {
  vec2 vWater = texture(u_waterVelocity, v_texCoord).xy;
  vec4 oil = texture(u_oil, v_texCoord);
  float th = oil.a;
  
  // If no oil present, zero velocity
  if (th < 0.001) {
    fragColor = vec2(0.0);
    return;
  }
  
  // TEST: Direct copy of water velocity (ignore oil velocity entirely)
  fragColor = vWater;
}
