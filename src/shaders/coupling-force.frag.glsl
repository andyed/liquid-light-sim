#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec2 fragColor;

uniform sampler2D u_velocity;    // Water velocity to modify
uniform sampler2D u_oil;         // Oil thickness field
uniform vec2 u_resolution;
uniform float u_dt;
uniform float u_couplingStrength; // Strength of oil → water influence

// Compute oil thickness from RGB luminance
float thickness(vec3 oil) {
  return dot(oil.rgb, vec3(0.333333));
}

void main() {
  vec2 v = texture(u_velocity, v_texCoord).xy;
  
  // Compute thickness gradient using central differences
  vec2 texel = 1.0 / u_resolution;
  
  float thC = thickness(texture(u_oil, v_texCoord).rgb);
  float thL = thickness(texture(u_oil, v_texCoord - vec2(texel.x, 0.0)).rgb);
  float thR = thickness(texture(u_oil, v_texCoord + vec2(texel.x, 0.0)).rgb);
  float thD = thickness(texture(u_oil, v_texCoord - vec2(0.0, texel.y)).rgb);
  float thU = thickness(texture(u_oil, v_texCoord + vec2(0.0, texel.y)).rgb);
  
  vec2 gradTh = vec2(thR - thL, thU - thD) * 0.5;
  
  // Buoyancy-like force: thick oil pushes water away from gradient
  // Direction: along gradient (low thickness → high thickness)
  // Magnitude: proportional to gradient strength
  float gradMag = length(gradTh);
  
  // Only apply force where there's a gradient (interface regions)
  if (gradMag > 0.001) {
    vec2 forceDir = normalize(gradTh);
    float forceMag = gradMag * u_couplingStrength;
    
    // Apply force (scaled by dt for frame-rate independence)
    vec2 deltaV = forceDir * forceMag * u_dt * 10.0; // 10.0 for visible effect
    v += deltaV;
  }
  
  fragColor = v;
}
