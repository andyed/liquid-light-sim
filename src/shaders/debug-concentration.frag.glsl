#version 300 es
precision mediump float;

in vec2 v_texCoord;
out vec4 outColor;

uniform sampler2D u_color_texture;

void main() {
    vec2 texelSize = 1.0 / vec2(textureSize(u_color_texture, 0));
    
    // Sample local color concentration
    vec4 center = texture(u_color_texture, v_texCoord);
    float centerConc = dot(center.rgb, vec3(0.299, 0.587, 0.114));
    
    // Sample neighbors
    vec4 left = texture(u_color_texture, v_texCoord - vec2(texelSize.x, 0.0));
    vec4 right = texture(u_color_texture, v_texCoord + vec2(texelSize.x, 0.0));
    vec4 top = texture(u_color_texture, v_texCoord + vec2(0.0, texelSize.y));
    vec4 bottom = texture(u_color_texture, v_texCoord - vec2(0.0, texelSize.y));
    
    float leftConc = dot(left.rgb, vec3(0.299, 0.587, 0.114));
    float rightConc = dot(right.rgb, vec3(0.299, 0.587, 0.114));
    float topConc = dot(top.rgb, vec3(0.299, 0.587, 0.114));
    float bottomConc = dot(bottom.rgb, vec3(0.299, 0.587, 0.114));
    
    // Calculate gradient
    vec2 gradient = vec2(
        (rightConc - leftConc) * 0.5,
        (topConc - bottomConc) * 0.5
    );
    
    // Visualize gradient as color
    // Red = gradient pointing right, Cyan = gradient pointing left
    // Green = gradient pointing up, Magenta = gradient pointing down
    vec3 color = vec3(
        gradient.x * 20.0 + 0.5,   // Red channel (amplified)
        gradient.y * 20.0 + 0.5,   // Green channel (amplified)
        centerConc * 0.2           // Blue = concentration (scaled to show super-saturation)
    );
    
    // Show super-saturation as brightness
    float brightness = centerConc * 0.5;
    
    outColor = vec4(color * (0.5 + brightness), 1.0);
}
