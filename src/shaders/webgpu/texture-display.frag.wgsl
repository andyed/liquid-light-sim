// texture-display.frag.wgsl
// WebGPU Fragment Shader for displaying a texture

@group(0) @binding(0)
var mySampler: sampler;
@group(0) @binding(1)
var myTexture: texture_2d<f32>;

@fragment
fn main(@builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
    let uv = fragCoord.xy / vec2<f32>(textureDimensions(myTexture));
    return textureSample(myTexture, mySampler, uv);
}
