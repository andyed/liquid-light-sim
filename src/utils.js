export async function loadShader(url) {
    // Allow calls like 'src/shaders/xyz.glsl' to work from both index.html (root)
    // and tests/test-runner.html (in /tests). When under /tests/, prefix '../'.
    let path = url;
    try {
        const inTests = typeof window !== 'undefined' && window.location && window.location.pathname.includes('/tests/');
        if (!url.startsWith('/') && inTests && !url.startsWith('../')) {
            path = '../' + url;
        }
    } catch (_) {}
    const response = await fetch(path);
    return await response.text();
}

export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
