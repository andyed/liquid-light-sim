#version 300 es
precision highp float;

in vec2 v_uv;
out vec2 fragColor; // velocity RG

uniform sampler2D u_velocity;     // RG
uniform sampler2D u_oil;          // RGBA
uniform vec2 u_texel;             // 1.0 / resolution
uniform float u_dt;
uniform float u_strength;         // per-material global scale
uniform float u_edgeBand;         // pixels (converted using u_texel)
uniform float u_k_th;             // thickness-to-sigma gain

float thickness(vec3 c) { return dot(c, vec3(0.3333333)); }

void main() {
  vec2 v = texture(u_velocity, v_uv).xy;

  // Thickness gradient (central difference)
  float thL = thickness(texture(u_oil, v_uv - vec2(u_texel.x, 0.0)).rgb);
  float thR = thickness(texture(u_oil, v_uv + vec2(u_texel.x, 0.0)).rgb);
  float thD = thickness(texture(u_oil, v_uv - vec2(0.0, u_texel.y)).rgb);
  float thU = thickness(texture(u_oil, v_uv + vec2(0.0, u_texel.y)).rgb);
  vec2 gradTh = vec2(thR - thL, thU - thD) * 0.5;

  // Edge gating by gradient magnitude (interface band)
  float g = length(gradTh);
  float px = max(u_texel.x, u_texel.y);
  float edge = smoothstep(0.0, (u_edgeBand * px), g);

  // Force along gradient toward higher sigma (k_th * gradTh)
  vec2 Ft = normalize(gradTh + 1e-6) * u_k_th;

  // Scale, gate, clamp
  float clampMag = 0.05; // stability guard
  vec2 dv = clamp(Ft * (u_strength * u_dt) * edge, vec2(-clampMag), vec2(clampMag));

  fragColor = v + dv;
}
