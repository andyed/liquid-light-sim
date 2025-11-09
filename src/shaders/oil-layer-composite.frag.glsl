#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_sphTexture;   // SPH particle layer (Mineral Oil, Syrup)
uniform sampler2D u_gridTexture;  // Grid-based layer (Alcohol)
uniform vec2 u_resolution;

/**
 * Multi-Layer Oil Compositor
 * 
 * Blends two independent oil simulation layers:
 * - SPH Layer: Particle-based blobs (Mineral Oil, Syrup, Glycerine)
 * - Grid Layer: Texture-based fluid (Alcohol)
 * 
 * Uses pre-multiplied alpha compositing ("over" operator):
 * Result = Foreground + Background * (1 - Foreground.alpha)
 * 
 * Layering: SPH is foreground (on top), Grid is background (underneath)
 */

void main() {
  vec4 sph = texture(u_sphTexture, v_texCoord);
  vec4 grid = texture(u_gridTexture, v_texCoord);
  
  // Pre-multiplied alpha compositing
  // SPH blobs appear on top of grid fluid
  vec3 composite_rgb = sph.rgb + grid.rgb * (1.0 - sph.a);
  float composite_a = sph.a + grid.a * (1.0 - sph.a);
  
  fragColor = vec4(composite_rgb, composite_a);
}
