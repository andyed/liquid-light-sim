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
  vec2 vOil = texture(u_oilVelocity, v_texCoord).xy;
  vec2 vWater = texture(u_waterVelocity, v_texCoord).xy;
  float th = texture(u_oil, v_texCoord).a;

  if (th < 0.0005) {
    // Preserve existing oil velocity; do not zero it out
    fragColor = vOil;
    return;
  }

  // Thickness gradient (interface detection)
  vec2 texel = 1.0 / u_resolution;
  float thL = texture(u_oil, v_texCoord - vec2(texel.x, 0.0)).a;
  float thR = texture(u_oil, v_texCoord + vec2(texel.x, 0.0)).a;
  float thD = texture(u_oil, v_texCoord - vec2(0.0, texel.y)).a;
  float thU = texture(u_oil, v_texCoord + vec2(0.0, texel.y)).a;
  vec2 gradTh = vec2(thR - thL, thU - thD) * 0.5;
  float gradMag = length(gradTh);

  // Interface normal and tangent
  vec2 n = gradMag > 1e-6 ? normalize(gradTh) : vec2(0.0, 0.0);
  vec2 t = vec2(-n.y, n.x);

  // Tangential component of water velocity (slip along interface)
  float vWT = dot(vWater, t);
  vec2 vWaterTangent = t * vWT;

  // Weight coupling by thickness and gradient magnitude (focus on rim)
  float thicknessFactor = clamp(th * 10.0, 0.0, 1.0);
  float edgeFactor = clamp(gradMag * 50.0, 0.0, 1.0); // gain tuned for texel scale
  // Add a small baseline coupling even away from the rim so motion can propagate
  float baseFactor = 0.15; // small baseline
  float propR = mix(1.0, texture(u_oilProps, v_texCoord).r, clamp(u_useProps, 0.0, 1.0));
  float effectiveCoupling = clamp(u_couplingStrength * propR * thicknessFactor * mix(baseFactor, 1.0, edgeFactor), 0.0, 1.0);

  // Blend oil velocity towards tangential water velocity at interface
  vec2 target = (edgeFactor > 0.05) ? vWaterTangent : vWater; // use full water in bulk, tangent at rim
  vec2 newVel = mix(vOil, target, effectiveCoupling);

  // Suppress normal motion across the interface (prevents penetration)
  if (edgeFactor > 0.05) {
    float vN = dot(newVel, n);
    newVel -= n * vN * clamp(u_normalDamp * edgeFactor, 0.0, 1.0);
  }

  fragColor = newVel;
}
