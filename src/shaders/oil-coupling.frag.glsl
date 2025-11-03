#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec2 fragColor;

uniform sampler2D u_oilVelocity;   // Current oil velocity
uniform sampler2D u_waterVelocity; // Water velocity to blend in
uniform sampler2D u_oil;           // Oil thickness field
uniform float u_couplingStrength;  // Base coupling factor
uniform float u_dt;
uniform vec2 u_resolution;         // For gradient computation
uniform float u_normalDamp;        // Damping of normal component at interface
uniform sampler2D u_oilProps;      // Optional per-pixel properties (R=coupling)
uniform float u_useProps;          // 0 or 1: whether to use props texture



void main() {
  vec2 vWater = texture(u_waterVelocity, v_texCoord).xy;
  float th = texture(u_oil, v_texCoord).a;

  // No oil present - output zero velocity
  if (th < 0.00001) {
    fragColor = vec2(0.0);
    return;
  }

  // ULTRA SIMPLE: Oil velocity = water velocity * coupling strength
  // No blending, no thickness factors, just direct copy
  float prop = texture(u_oilProps, v_texCoord).r;
  // If per-pixel props are disabled or zero, fall back to full coupling (1.0)
  float propR = (u_useProps > 0.5 && prop > 0.0) ? prop : 1.0;
  float strength = u_couplingStrength * propR * 2.0; // 2x multiplier boost
  
  fragColor = vWater * clamp(strength, 0.0, 2.0); // Allow up to 2x water velocity
}

