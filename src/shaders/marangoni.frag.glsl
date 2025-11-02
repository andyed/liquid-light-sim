#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec2 fragColor; // velocity RG

uniform sampler2D u_velocity;     // RG
uniform sampler2D u_oil;          // RGBA
uniform vec2 u_texel;             // 1.0 / resolution
uniform float u_dt;
uniform float u_strength;         // per-material global scale
uniform float u_edgeBand;         // pixels (converted using u_texel)
uniform float u_k_th;             // thickness-to-sigma gain
uniform float u_thMin;            // minimum oil thickness to engage forces
uniform float u_forceClamp;       // per-component clamp for stability
uniform float u_amp;              // gradient amplification factor (0..N)

float thickness(vec3 c) { return dot(c, vec3(0.3333333)); }

void main() {
  vec2 v = texture(u_velocity, v_texCoord).xy;

  // Thickness at center and gradient (central differences)
  float thC = thickness(texture(u_oil, v_texCoord).rgb);
  float thL = thickness(texture(u_oil, v_texCoord - vec2(u_texel.x, 0.0)).rgb);
  float thR = thickness(texture(u_oil, v_texCoord + vec2(u_texel.x, 0.0)).rgb);
  float thD = thickness(texture(u_oil, v_texCoord - vec2(0.0, u_texel.y)).rgb);
  float thU = thickness(texture(u_oil, v_texCoord + vec2(0.0, u_texel.y)).rgb);
  vec2 gradTh = vec2(thR - thL, thU - thD) * 0.5;

  // Edge gating by gradient magnitude (interface band)
  float g = length(gradTh);
  float px = max(u_texel.x, u_texel.y);
  float edge = smoothstep(0.0, (u_edgeBand * px), g);
  // Thin-film mask
  float thickMask = step(u_thMin, thC);

  // Force along gradient toward higher sigma (k_th * gradTh), with optional amplification
  float gradMag = length(gradTh);
  float amp = (u_amp > 0.0) ? (1.0 + gradMag * u_amp) : 1.0;
  vec2 Ft = normalize(gradTh + 1e-6) * u_k_th * amp;

  // Scale, gate, and clamp for stability
  float clampMag = max(0.0, u_forceClamp);
  vec2 dv = clamp(Ft * (u_strength * u_dt) * edge * thickMask, vec2(-clampMag), vec2(clampMag));

  fragColor = v + dv;
}
