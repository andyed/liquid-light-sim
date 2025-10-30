#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 outColor;

uniform sampler2D u_velocity_texture;
uniform float u_scale; // visualization scale (larger = brighter)

vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
    vec2 v = texture(u_velocity_texture, v_texCoord).xy;
    float mag = length(v);
    float ang = atan(v.y, v.x);
    float hue = (ang / 6.2831853) + 0.5; // map [-pi,pi] -> [0,1]
    float val = 1.0 - exp(-mag * u_scale);
    vec3 rgb = hsv2rgb(vec3(hue, 1.0, val));
    outColor = vec4(rgb, 1.0);
}
