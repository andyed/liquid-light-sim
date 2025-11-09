# Next Session: Rendering Polish & Final Blob Tuning

## Current State (Nov 8, 2025)

The core physics of the SPH simulation are now working correctly. The implicit solver is stable and provides strong cohesion, and a thermal layer with Marangoni effects is active.

The primary remaining issues are in the **visualization pipeline**. The physics are creating blobs, but the rendering is not displaying them correctly.

## Problems to Solve

1.  **Pixelated Edges ("Pixel Eaten"):** Blobs dissolve with noisy, pixelated edges instead of smoothly shrinking. This is caused by sharp thresholding in the metaball shader.
2.  **Rapid Dissolution:** The visual representation of blobs dissolves too quickly, even if the underlying particles are still present.
3.  **Shape Maintenance:** Blobs don't maintain a convincing "cellular" shape throughout their lifetime.

## Plan

The goal of this session is to fix the visualization pipeline to accurately and aesthetically represent the underlying SPH simulation.

### 1. Refine the Metaball Shader (`oil-metaball.frag.glsl`)
This is the highest priority. The current shader is too aggressive.
-   **Action:** Replace the sharp `smoothstep` cutoff with a smoother falloff function. A power function (`pow(alpha, 0.5)`) or a wider `smoothstep` can be used to create a "fatter" blob with a soft, anti-aliased edge.
-   **Goal:** Eliminate the "pixel eaten" look and have blobs that smoothly shrink.

### 2. Tune Particle Rendering (`sph-particle-splat.frag.glsl`)
The input to the metaball shader is the texture created by splatting particles. The quality of this input matters.
-   **Action:** Adjust the `u_particleRadius` uniform used when rendering SPH particles. A larger radius will create a denser, more overlapping field, which can help the metaball shader produce a more coherent shape.
-   **Goal:** Reduce "holes" in the density field that contribute to pixel dust.

### 3. Balance Physics and Rendering
The final appearance is a result of the interplay between the physics (cohesion) and the rendering (metaballs).
-   **Action:** Once the metaball shader is improved, we may need to slightly re-tune the implicit cohesion stiffness (`k` in `ImplicitSolver.js`). A stronger visual "surface" from the metaball shader might allow for slightly weaker physical cohesion, improving performance or stability.
-   **Goal:** Find the optimal balance where blobs look cohesive and organic without putting unnecessary strain on the physics solver.

### 4. Address Dissolution Speed
-   **Action:** The "dissolving" is a visual effect of the particle density and temperature decreasing. The new metaball shader should already improve this by not making blobs "pop" out of existence. If they still fade too fast, we can adjust the `coolingRate` in `SPHOilSystem.js::computeTemperature` to keep them "hot" and visually prominent for longer.
-   **Goal:** Blobs should have a satisfying lifetime, gradually cooling and shrinking rather than abruptly disappearing.