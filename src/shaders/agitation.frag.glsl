#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_velocity_texture;
uniform float u_agitation;
uniform float u_time;

// 2D Random function
float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

// 2D Noise function
float noise(vec2 st) {
    vec2 i = floor(st);
    vec2 f = fract(st);

    float a = random(i);
    float b = random(i + vec2(1.0, 0.0));
    float c = random(i + vec2(0.0, 1.0));
    float d = random(i + vec2(1.0, 1.0));

    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.y * u.x;
}

void main() {
    vec2 velocity = texture(u_velocity_texture, v_texCoord).xy;
    
    if (u_agitation > 0.0) {
        float n = noise(v_texCoord * 10.0 + u_time * 0.1);
        velocity += vec2(cos(n * 6.28318), sin(n * 6.28318)) * u_agitation;
    }

    fragColor = vec4(velocity, 0.0, 1.0);
}
