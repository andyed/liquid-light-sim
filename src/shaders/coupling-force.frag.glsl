#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec2 fragColor;

uniform sampler2D u_velocity;    // Water velocity to modify
uniform sampler2D u_oil;         // Oil thickness field
uniform vec2 u_resolution;
uniform float u_dt;
uniform float u_couplingStrength; // Strength of oil → water influence

void main() {
  vec2 v = texture(u_velocity, v_texCoord).xy;
  
  // Compute thickness gradient using central differences
  // Oil thickness is stored in ALPHA channel, not RGB
  vec2 texel = 1.0 / u_resolution;
  
  float thC = texture(u_oil, v_texCoord).a;
  float thL = texture(u_oil, v_texCoord - vec2(texel.x, 0.0)).a;
  float thR = texture(u_oil, v_texCoord + vec2(texel.x, 0.0)).a;
  float thD = texture(u_oil, v_texCoord - vec2(0.0, texel.y)).a;
  float thU = texture(u_oil, v_texCoord + vec2(0.0, texel.y)).a;
  
  vec2 gradTh = vec2(thR - thL, thU - thD) * 0.5;
  
  // Buoyancy-like force: thick oil pushes water away from gradient
  // Direction: along gradient (low thickness → high thickness)
  // Magnitude: proportional to gradient strength
  float gradMag = length(gradTh);
  
  // Only apply force where there's a gradient (interface regions)
  if (gradMag > 0.001 && thC > 0.01) { // Only where oil is present
    vec2 forceDir = normalize(gradTh);
    float forceMag = gradMag * u_couplingStrength;
    
    // Apply force (scaled by dt for frame-rate independence)
    // Increased multiplier from 10.0 to 50.0 for stronger oil→water influence
    vec2 deltaV = forceDir * forceMag * u_dt * 50.0;
    v += deltaV;
  }
  
  fragColor = v;
}
