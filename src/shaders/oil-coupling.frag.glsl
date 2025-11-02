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
  
  // Lower threshold to capture thinner oil films
  if (th < 0.001) {
    fragColor = vec2(0.0);
    return;
  }
  
  // DEBUG: Output water velocity magnitude to console via a pixel read
  // This will help us see if water velocity exists where oil is
  float waterMag = length(vWater);
  float oilMag = length(vOil);
  
  // Modulate coupling by oil thickness - thicker oil gets more coupling
  float thicknessFactor = min(1.0, th * 10.0); // Scale thickness to 0-1 range
  float effectiveCoupling = u_couplingStrength * thicknessFactor;
  
  // Clamp to reasonable range (0.0 to 1.0) without dt multiplication
  // The dt is already handled in the advection step
  effectiveCoupling = clamp(effectiveCoupling, 0.0, 1.0);
  
  // Blend water velocity into oil velocity using effective coupling
  vec2 newVel = mix(vOil, vWater, effectiveCoupling);
  
  fragColor = newVel;
}
