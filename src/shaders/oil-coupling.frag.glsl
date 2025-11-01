#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec2 fragColor;

uniform sampler2D u_oilVelocity;   // Current oil velocity
uniform sampler2D u_waterVelocity; // Water velocity to blend in
uniform sampler2D u_oil;           // Oil thickness field
uniform float u_couplingStrength;  // Base coupling factor
uniform float u_dt;

// Compute oil thickness from RGB luminance
float thickness(vec3 oil) {
  return dot(oil.rgb, vec3(0.333333));
}

void main() {
  vec2 vOil = texture(u_oilVelocity, v_texCoord).xy;
  vec2 vWater = texture(u_waterVelocity, v_texCoord).xy;
  vec3 oil = texture(u_oil, v_texCoord).rgb;
  
  float th = thickness(oil);
  
  // Coupling factor: thin oil → more water-driven, thick oil → more independent
  // Range: 0.3 (thick) to 0.8 (thin)
  float coupling = u_couplingStrength * (0.8 - 0.5 * smoothstep(0.0, 0.3, th));
  
  // If no oil present, just copy water velocity (for stability)
  if (th < 0.001) {
    fragColor = vWater;
    return;
  }
  
  // Apply water influence as additive force, scaled by dt
  vec2 force = (vWater - vOil) * coupling;
  vec2 newVel = vOil + force * u_dt * 2.0; // 2.0 for faster coupling response
  
  fragColor = newVel;
}
