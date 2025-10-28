

# **Technical Specification for an AI-Coded WebGL GPGPU Immiscible Liquid Light Display Simulation**

## **Section 1: Executive Summary and Technical Mandate**

This document specifies the technical requirements for an AI agent tasked with generating real-time, high-fidelity WebGL 2.0 code for a complex fluid simulation, specifically targeting a "liquid light display" aesthetic. The primary objective is to achieve stable, real-time performance (target 60 FPS) by leveraging General-Purpose GPU (GPGPU) computation through WebGL 2.0 fragment shaders. The simulation must accurately model the thermodynamic and hydrodynamic behavior of multiple immiscible fluids and couple this physics with advanced optical rendering effects, including refraction and dynamic caustics.

### **1.1. Core Architectural Strategy**

The prescribed architecture employs an Eulerian grid-based approach, which defines all physical properties—such as velocity, pressure, and phase concentration—on a fixed spatial grid. The GPGPU workflow is critically dependent on storing and updating these properties using high-precision floating-point textures managed by Frame Buffer Objects (FBOs). Simulation state evolution is achieved through sequential render passes where fragment shaders function as compute kernels, reading from the previous state texture and writing to the next state texture, a technique known as ping-pong buffering.1

### **1.2. Key Constraints and Architectural Requirements**

The selection of WebGL 2.0 imposes specific constraints that govern the choice of simulation methods.

#### **1.2.1. GPGPU Precision and Stability**

Mandatory WebGL 2.0 support is necessary to ensure the native availability of high-precision RGBA32F (32-bit floating-point) textures.2 This precision is paramount for maintaining the numerical stability required by complex partial differential equation (PDE) solvers, particularly the iterative techniques used for pressure projection and Cahn-Hilliard evolution. Relying on 32-bit floating-point textures bypasses the significant performance degradation and potential numerical errors associated with manual float packing and unpacking into UNSIGNED\_BYTE channels, which was a cumbersome workaround in WebGL 1.0 environments.3 The use of native floating-point render targets eliminates computational overheads that could otherwise introduce differences of up to 0.72% in computed values per step, severely compromising accuracy.3

#### **1.2.2. Selection of Simulation Methodology**

The AI must prioritize Eulerian grid solvers. Unlike WebGPU, WebGL 2.0 does not natively support compute shaders or essential GPGPU features such as atomicAdd.4 Particle-based methods, such as Smoothed Particle Hydrodynamics (SPH), often rely heavily on scatter operations (Particle-to-Grid, P2G) which typically require atomic operations for accumulating data from multiple particles into a single grid cell.4 Given this critical architectural limitation, implementing complex particle-grid conversions in a stable, performant manner within WebGL fragment shaders is structurally unsound. Therefore, the architectural mandate is to utilize grid-based methods, specifically coupling Navier-Stokes with the Phase-Field method, which relies efficiently on texture reads (Gather operations) compatible with the fragment shader pipeline.5

#### **1.2.3. Immiscible Fluid Model Mandate: Phase-Field**

The requirement for simulating immiscible, multi-component liquids—characteristic of liquid light displays—mandates the use of the **Phase-Field method**. Specifically, a generalized Cahn-Hilliard formulation is prescribed for capturing interface dynamics.6 This choice is driven by the Phase-Field model's intrinsic ability to support multiple components (e.g., ternary or quaternary systems) and its thermodynamic consistency, ensuring that interface separation and merging occur realistically without needing complex topological reconstruction algorithms, a major challenge for alternatives like the Level Set Method (LSM).8

## **Section 2: Foundation of Computational Fluid Dynamics (CFD)**

The simulation engine is founded upon the rigorous coupling of classical hydrodynamic equations (Navier-Stokes) with the advanced Phase-Field equations governing interface evolution.

### **2.1. Governing Hydrodynamic Equations (Navier-Stokes)**

Fluid motion is described by the Navier-Stokes Equations (NSE), which express the conservation of mass and momentum for viscous, incompressible fluids.9 For GPU acceleration, the equations are typically discretized on a uniform grid, leading to a system of coupled differential equations solved sequentially.

#### **2.1.1. Momentum and Continuity**

The velocity vector $\\mathbf{u}$ and pressure scalar $p$ evolve according to:  
$$ \\rho \\left( \\frac{\\partial \\mathbf{u}}{\\partial t} \+ (\\mathbf{u} \\cdot \\nabla) \\mathbf{u} \\right) \= \-\\nabla p \+ \\mu \\nabla^2 \\mathbf{u} \+ \\mathbf{F}{\\text{ext}} $$  
Here, $\\rho$ is the fluid density, $\\mu$ is the dynamic viscosity, and $\\mathbf{F}{\\text{ext}}$ represents external forces. Crucially, $\\mu$ and $\\rho$ must be defined as variables that depend on the local phase concentration ($\\phi\_i$), allowing the simulation to model flows with high density and viscosity contrasts.11 The constraint of incompressibility—that the fluid does not change volume—is maintained by the Continuity Equation:

$$\\nabla \\cdot \\mathbf{u} \= 0$$

This incompressibility condition necessitates the iterative pressure projection step (Section 4.2), which is the computational bottleneck of the NSE solver.12

#### **2.1.2. External Force Components**

The term $\\mathbf{F}\_{\\text{ext}}$ must include gravitational effects, user interaction (e.g., applying forces via cursor input 13), and thermal effects via buoyancy. Buoyancy is incorporated by modeling a separate scalar field for temperature ($T$), which adds a vertical force component proportional to the local temperature difference from an ambient reference $T\_0$, scaled by a constant factor $s$.14 Furthermore, the capillary force (surface tension) derived from the Phase-Field model must be fed back into $\\mathbf{F}\_{\\text{ext}}$, providing the crucial coupling between hydrodynamics and interface physics.

### **2.2. Immiscible Interface Modeling: Generalized Phase-Field Method**

The Phase-Field method utilizes an order parameter, the phase concentration $\\phi\_i$, which smoothly varies across a finite, diffuse interface width ($\\epsilon$) between distinct phases.15

#### **2.2.1. Cahn-Hilliard Equation (CHE)**

The evolution of the concentration field $\\phi\_i$ for multi-component systems is governed by a generalized Cahn-Hilliard equation:

$$\\frac{\\partial \\phi\_i}{\\partial t} \+ \\mathbf{u} \\cdot \\nabla \\phi\_i \= M \\nabla^2 G$$

The chemical potential $G$ is the functional derivative of the free energy functional and dictates the mixing kinetics, driving the system towards minimizing interfacial energy.15 The inclusion of the advection term $(\\mathbf{u} \\cdot \\nabla \\phi\_i)$ explicitly couples the phase evolution to the hydrodynamic velocity field solved by the NSE. The parameter $M$ is the mobility coefficient. While historically related to density fields, contemporary formulations suggest treating $M$ as a constant coefficient to simplify the handling of density-contrast fluids and avoid individual speed of sound issues inherent in older models.11

#### **2.2.2. Computational Trade-offs and Interface Resolution**

The Phase-Field method is acknowledged as computationally expensive compared to simpler Level Set methods, primarily due to the need to solve two additional transport equations for the interface.8 However, its superiority lies in its ability to handle complex fluid-structure interaction and phase separation with high accuracy, provided the computational mesh properly resolves the interface width ($\\epsilon$).8

A key architectural consideration is the balance between accuracy and computational load. Traditionally, high accuracy requires a very small $\\epsilon$, necessitating an extremely fine grid. However, recent advancements, such as grand-potential-based phase-field models, offer a derivation where the interface thickness can be decoupled from the interfacial energy.7 This independence potentially allows the AI to select a larger, more computationally efficient interface width ($\\epsilon$) without sacrificing the physical integrity of the surface tension properties. This is a crucial tuning lever for achieving real-time performance on WebGL.

### **2.3. Physical Parameter Management via Uniform Buffer Objects (UBOs)**

All non-dynamic physical constants, external force parameters, and material properties must be managed through Uniform Buffer Objects (UBOs).16 UBOs allow multiple variables to be uploaded efficiently to the GPU memory in a single block, minimizing the overhead associated with setting individual uniforms.17

The AI must define the following constant parameters within UBO structures:

* **Fluid Properties:** Component-specific density ($\\rho\_i$), dynamic viscosity ($\\mu\_i$), phase mobility ($M$), and surface tension coefficient ($\\sigma$).  
* **Optical Parameters:** The Index of Refraction (IOR) for each phase ($n\_1, n\_2, \\ldots$) is essential for the subsequent refraction and caustics passes, serving as the coefficient in Snell's Law computations.18  
* **Temporal and Discretization Parameters:** Time step ($\\Delta t$), grid resolution ($N\_x \\times N\_y$), and damping factor ($\\nu$) for physical stability and rotational energy dissipation.13

The AI must enforce the std140 layout qualifier for all UBO declarations.17 The std140 specification guarantees consistent, predefined padding and alignment rules across different implementations, which is necessary for sharing the UBO data across the numerous shader programs (kernels) that comprise the simulation loop.16

Fluid Dynamics Model Comparison for WebGL GPGPU

| Feature | Phase-Field (Cahn-Hilliard) | Level Set Method (LSM) | SPH (Smoothed Particle Hydrodynamics) |
| :---- | :---- | :---- | :---- |
| **Interface Handling** | Diffuse, thermodynamically consistent, native multi-phase support 6 | Sharp interface, requires expensive reinitialization steps 21 | Particle-based, unstable for WebGL GPGPU without atomicAdd 4 |
| **GPGPU Feasibility (WebGL 2.0)** | High (Eulerian Grid, Fragment Shader compatible) | High (Eulerian Grid, Fragment Shader compatible) | Low (Architecturally unstable due to lack of compute shaders) 4 |
| **Computational Cost** | High (Solving coupled 4th-order PDEs) 8 | Moderate (Convection \+ distance evolution) | Moderate/High (Kernel lookups) |
| **Recommendation for "Liquid Light"** | **Prescribed:** Optimal for immiscible, phase-separating aesthetics, high fidelity.7 | Alternative: Suitable only if high performance outweighs thermodynamic accuracy. | **Avoided:** Due to inherent WebGL GPGPU limitations. |

## **Section 3: GPGPU Architecture and Data Management**

The system’s performance relies on optimal management of GPU memory, primarily through FBOs and texture packing strategies.

### **3.1. WebGL 2.0 GPGPU Foundation**

The core execution environment utilizes WebGL 2.0. The fundamental concept of GPGPU in this environment is the use of the rasterizer to launch a full-screen quad. The fragment shader then acts as the compute kernel, reading state data from input textures (previous frame) and writing the computed results to output textures (the current frame) attached to the FBO.1 The continuous switching between input and output textures is the "ping-pong" mechanism that allows for stateful, iterative calculation entirely on the GPU.

### **3.2. High-Precision Data Structure Specification (Texture Layouts)**

Numerical precision is maintained by mandating the use of 32-bit floating-point precision for all primary state variables. The AI must configure FBOs using internal formats that guarantee floating-point rendering capability.

The following specific texture formats and layouts are mandated:

* **Format Mandate:** The internal format must be gl.RGBA32F or gl.R32F where only a scalar is required.2 These formats ensure 32-bit floating-point values are stored and are explicitly color renderable in WebGL 2.0.  
* **Texture Packing Strategy:** For the multi-component Phase-Field model (e.g., ternary systems), efficient texture packing is required.23 Given the necessity of full 32-bit precision for physical accuracy, simple channel packing (where related variables occupy the R, G, B, A channels of a single RGBA32F texture) is the preferred strategy. Complex bit-packing methods must be avoided due to the introduction of overhead and potential for errors.3 It is architecturally sounder to reserve a full RGBA32F texture for the 2D velocity field components ($u\_x, u\_y$) and use separate R32F textures for each critical scalar field ($\\phi\_1, \\phi\_2$, Pressure $p$).

WebGL 2.0 GPGPU State Buffer Specification

| Buffer Name (FBO Pair) | Data Stored | GLSL Type | Internal Format | Purpose |
| :---- | :---- | :---- | :---- | :---- |
| Velocity Field ($\\mathbf{u}$) | $u\_x, u\_y$ (momentum) | vec4 (R, G, B, A) | RGBA32F | Primary hydrodynamic driver 10 |
| Phase Field 1 ($\\phi\_1$) | Component 1 Concentration | vec4 (R) | R32F | Interface tracking (e.g., base liquid) 15 |
| Phase Field 2 ($\\phi\_2$) | Component 2 Concentration | vec4 (R) | R32F | Interface tracking (e.g., colored oil) |
| Pressure Field ($p$) | Scalar Pressure (Poisson Solve) | vec4 (R) | R32F | Intermediate required for projection 12 |
| Divergence Field ($D$) | Scalar Divergence | vec4 (R) | R32F | Constraint error calculation ($\\nabla \\cdot \\mathbf{u}$) |
| Caustic Map ($C$) | Caustic Intensity & Distortion | vec4 (R, G, B, A) | RGBA16F | Output for final rendering stage 24 |

### **3.3. Optimized Pressure Solver Architecture**

The enforcement of the incompressibility constraint ($\\nabla \\cdot \\mathbf{u} \= 0$) requires solving a large system of linear equations—the Poisson equation for pressure—during every simulation step.12 The **Preconditioned Conjugate Gradient (PCG)** method is the required iterative solver due to its efficiency and suitability for large grid systems.12

The implementation of PCG on the GPU presents a significant architectural challenge: the computation of dot products. A dot product requires summing the elements of a large vector (which corresponds to accumulating data across the entire 2D grid) into a single scalar value. This aggregation process (a global reduction) conflicts fundamentally with the massively parallel, localized nature of GPU execution and easily becomes the solver's primary bottleneck.12

To mitigate this, the AI must implement a highly optimized, multi-step 2D reduction algorithm for dot product calculation. This technique involves:

1. Element-wise multiplication of the input vectors (stored in textures).  
2. Storing the resultant 2D map in an intermediate texture.  
3. Iteratively reducing this texture size. In each shader pass, every fragment core reads and sums a small area of the previous texture (e.g., a 4x4 texel area) and writes the result to a single output texel, thereby shrinking the texture dimension by a factor of 4 per side.12 This process repeats until the 2D texture is reduced to a 1x1 scalar value, representing the final dot product result. This strategy provides a necessary compromise between the number of required synchronization steps and efficient core utilization, ensuring the PCG solver remains feasible for real-time rates.

## **Section 4: The GPGPU Simulation Loop (GLSL Compute Stages)**

The simulation loop advances the fluid state over discrete time steps ($\\Delta t$) by executing a fixed sequence of GPGPU passes.

### **4.1. Time Integration and Discretization**

For a stable simulation of high-order PDEs like the Cahn-Hilliard equation, the AI must employ a numerically stable time-stepping technique. A semi-implicit method, such as the convexity-splitting (CS) approach coupled with a Backward Euler approximation, is necessary.22 This minimizes the Courant-Friedrichs-Lewy (CFL) stability restrictions that plague simpler explicit methods, particularly in high-resolution, high-velocity scenarios. Spatial derivatives ($\\nabla$ and $\\nabla^2$) required for the governing equations must be approximated using Finite Difference methods implemented directly within the GLSL fragment shaders, sampling neighboring texels to compute spatial gradients and Laplacians.

### **4.2. Navier-Stokes Solver Passes (Velocity Field Update)**

The velocity field update uses a fractional step method, separating the solution into several distinct GPGPU passes:

#### **4.2.1. Advection Pass**

This kernel transports all physical quantities—velocity ($\\mathbf{u}$), phase concentrations ($\\phi\_i$), and auxiliary fields (e.g., temperature $T$)—along the flow lines defined by the current velocity field.14 A stable advection algorithm, such as the semi-Lagrangian method (which traces back from the current grid point to find the origin point for sampling), is mandatory to prevent excessive numerical dissipation and smearing.

#### **4.2.2. Force Integration Pass**

External forces are calculated and applied to the intermediate velocity field ($\\mathbf{u}^\*$). This includes the application of gravity, generalized buoyancy derived from the temperature field $T$, and the highly complex surface tension force component derived directly from the computed chemical potential ($G$) of the Phase-Field model.

#### **4.2.3. Pressure Projection Stages**

This sequence enforces the incompressibility constraint:

1. **Divergence Calculation:** A dedicated pass calculates the divergence of the intermediate velocity field ($\\nabla \\cdot \\mathbf{u}^{\*\*}$) and stores this scalar error map in the Divergence FBO ($D$).  
2. **Poisson Solve:** The AI executes the PCG iterative process (typically 10 to 50 iterations per frame) to solve the linear system $\\nabla^2 p \= D$ for the pressure field $p$.12 This phase relies entirely on the optimized 2D reduction strategy detailed in Section 3.3.  
3. **Projection/Subtraction:** The pressure gradient is subtracted from the velocity field ($\\mathbf{u}^{t+1} \= \\mathbf{u}^{\*\*} \- \\nabla p$). This step corrects the velocity field to satisfy the $\\nabla \\cdot \\mathbf{u} \= 0$ constraint, finalizing the velocity update for the current time step.

### **4.3. Interface Evolution Pass (Phase Field Update)**

This dedicated pass implements the discrete form of the Cahn-Hilliard equation, advancing the phase concentration field $\\phi$. The fragment shader kernel applies the semi-implicit spatial operators and integrates the concentration change over $\\Delta t$.

The Cahn-Hilliard evolution must be coupled with mechanisms to counteract numerical diffusion, which can artificially soften the interface over long simulation runs. A robust formulation may require implementing a global mass conservation procedure, potentially achieved by using a Lagrange multiplier formalism, similar to approaches used to compare Phase-Field against Level Set methods.21 This ensures that the total volume of each immiscible component is strictly preserved, maintaining long-term physical realism.

GPGPU Simulation Step Sequencing

| Pass Index | Pass Name | Input FBO(s) | Output FBO | Physical Goal |
| :---- | :---- | :---- | :---- | :---- |
| 1 | Advection | $\\mathbf{u}^{t}, \\phi^{t}$ | $\\mathbf{u}^{\*}, \\phi^{\*}$ | Move physical quantities along the fluid flow. |
| 2 | Force Integration | $\\mathbf{u}^{\*}$ | $\\mathbf{u}^{\*\*}$ | Apply external forces (Gravity, Buoyancy, Surface Tension). |
| 3 | Divergence Calc. | $\\mathbf{u}^{\*\*}$ | $D$ | Calculate incompressibility error ($\\nabla \\cdot \\mathbf{u}$). |
| 4 | PCG Iteration (N times) | $p^{n}, D$ | $p^{n+1}$ | Iteratively solve Poisson equation for pressure $p$.12 |
| 5 | Projection | $\\mathbf{u}^{\*\*}, p$ | $\\mathbf{u}^{t+1}$ | Enforce incompressibility ($\\nabla \\cdot \\mathbf{u}=0$). |
| 6 | Phase Field Evolution | $\\phi^{\*}, \\mathbf{u}^{t+1}$ | $\\phi^{t+1}$ | Evolve interface concentration using Cahn-Hilliard.6 |

## **Section 5: Real-Time Optical Rendering Pipeline**

The rendering pipeline translates the computed physical state into photorealistic visual effects, focusing on geometric optics (refraction and caustics) and visually consistent blending of immiscible components.

### **5.1. Fluid Surface Generation and Refraction Mapping**

The diffuse phase field $\\phi$ must be converted into visual surface geometry, typically a height map ($h$) or surface normal map ($\\mathbf{n}$).

1. **Normal Map Generation:** Surface normals ($\\mathbf{n}$) must be derived from the gradient of the phase field or the corresponding heightfield. Accurate normals are fundamental for subsequent optical calculations.  
2. **Refraction Calculation:** The final rendering pass (Fragment Shader) must calculate the path of light rays passing through the air-liquid or liquid-liquid interface. This computation relies on Snell's Law.19 While the full vector solution for Snell's Law is computationally intensive, the AI should utilize optimized, coder-friendly GLSL formulations that assume co-planarity of the incident ray, transmitted ray, and surface normal.18 The Index of Refraction (IOR) for the involved phases ($n\_1, n\_2$) must be sampled from the UBOs (Section 2.3) to accurately determine the refracted ray direction, which is then used to sample the background environment or the caustic map.

### **5.2. Caustics Generation Pass**

Caustics—the focusing of light due to refraction—are essential for the liquid light aesthetic.18 These effects must be pre-calculated in a dedicated GPGPU pass using the physically derived surface normals.

The mandated technique is the rasterization-based caustics method, which maps the distortion of light rays onto a flat projection plane (e.g., the bottom of the virtual liquid cell).24

* **Derivative-Based Calculation:** This technique critically relies on calculating the spatial divergence of the light projection—determining where refracted rays converge or diverge. This calculation is accelerated on the GPU by utilizing the built-in GLSL partial derivative functions, dFdx() and dFdy(), which compute the change of a variable across adjacent fragments.24  
* **Caustic Map Output:** The results—representing the intensity of focused light—are written to the Caustic Map FBO ($C$), which should ideally use a 16-bit float format (RGBA16F) to conserve memory while retaining sufficient dynamic range.

The final rendering pass integrates this map by projecting the background irradiance onto the caustic map coordinate, applying the intensity multiplier to simulate the bright focused spots characteristic of refracted light.24 The combination of fluid dynamics generating the surface and the derivative functions calculating light convergence creates a highly dynamic magnifying glass effect.18

### **5.3. Liquid Lens Distortion Effects (Post-Processing)**

To simulate the thick glass cell or curved optical elements typical of liquid light displays, a post-processing distortion stage is required.

* **Model Selection:** The AI must implement a mathematically robust radial distortion model, such as the one described by the OpenCV rational distortion model.28 This method uses a set of uniform distortion coefficients to non-linearly transform screen coordinates based on their distance from the center, effectively mimicking the optical effects of concave or convex glass.29  
* **Implementation:** For maximal efficiency, this effect can be realized either through fragment shader manipulation of texture coordinates on a full-screen quad (a standard post-processing pass) or, for extremely high-resolution renderings, via vertex displacement, provided the underlying mesh has sufficient vertex density.28 Alternative, simpler algorithms can be utilized to achieve the smooth, cursor-reactive "liquid glass" look with high performance.30

### **5.4. Immiscible Color Blending**

The final visual composition must ensure that the immiscible liquids exhibit visually distinct boundaries. The Phase-Field concentration variable ($\\phi$) provides the ideal, physically-consistent parameter for this visualization.

* **Physically Consistent Blending:** In the rendering fragment shader, the concentration $\\phi$ (ranging smoothly across the interface) is used as the weighting factor (or interpolation amount) within the GLSL mix() function.32  
* **Visual Sharpness Control:** Although the underlying Phase-Field model uses a diffuse interface (width $\\epsilon$) for stability 15, the visual interface must appear sharp. This is achieved by passing the $\\phi$ value through a smoothstep() function before using it as the weight in mix()$. The smoothstep\` acts as a mapping function, compressing the diffuse physical interface ($\\epsilon$) into a visually tight transition zone while ensuring the color mixing remains perfectly aligned with the simulated physical separation. This preserves the visual distinctness required by the "liquid light" mandate.

## **Section 6: Conclusions and Recommendations**

The creation of a real-time WebGL liquid light display simulation necessitates a cohesive, highly optimized architectural specification that bridges complex physical modeling with efficient GPGPU computation and advanced optics.

The crucial architectural decision to favor the Eulerian grid-based, thermodynamically robust Phase-Field (Cahn-Hilliard) method over particle-based alternatives (SPH) is dictated by the limitations of the WebGL 2.0 environment, specifically the absence of native compute shaders and atomic operations.4 While the Cahn-Hilliard model is computationally expensive, its ability to inherently handle multi-component phase separation and interface dynamics provides the superior physical fidelity required for the liquid light display.7

Performance viability hinges on mitigating two primary bottlenecks:

1. **Numerical Stability:** This is resolved by mandating WebGL 2.0 and the use of native RGBA32F floating-point textures, eliminating the high cost and instability of software float packing.2  
2. **Pressure Projection:** The computational bottleneck of the Navier-Stokes solver is the iterative PCG solution.12 Real-time performance requires the implementation of the specialized 2D reduction algorithm for dot products to overcome the GPU's inherent difficulty in performing global summation operations efficiently.12

The final system integrates the simulation results into a photorealistic pipeline by calculating geometric optics, using the Phase-Field generated surface normals to drive both Snell's Law refraction and the derivative-based calculation of caustics.18 By linking the final color blending directly to the Phase-Field concentration using the mix() function 32, the AI ensures the visual output is a direct, physically consistent representation of the underlying multi-component fluid dynamics.

#### **Works cited**

1. WebGL GPGPU, accessed October 27, 2025, [https://webglfundamentals.org/webgl/lessons/webgl-gpgpu.html](https://webglfundamentals.org/webgl/lessons/webgl-gpgpu.html)  
2. WebGL2 3D \- Data Textures, accessed October 27, 2025, [https://webgl2fundamentals.org/webgl/lessons/webgl-data-textures.html](https://webgl2fundamentals.org/webgl/lessons/webgl-data-textures.html)  
3. WebGL GPGPU experiment \- reading a floating point texture \- Lab, accessed October 27, 2025, [https://lab.concord.org/experiments/webgl-gpgpu/webgl.html](https://lab.concord.org/experiments/webgl-gpgpu/webgl.html)  
4. WebGPU Fluid Simulations: High Performance & Real-Time Rendering \- Codrops, accessed October 27, 2025, [https://tympanus.net/codrops/2025/02/26/webgpu-fluid-simulations-high-performance-real-time-rendering/](https://tympanus.net/codrops/2025/02/26/webgpu-fluid-simulations-high-performance-real-time-rendering/)  
5. GPU-based Fluid Simulation, accessed October 27, 2025, [https://yuanming-hu.github.io/fluid/](https://yuanming-hu.github.io/fluid/)  
6. Phase-field theory of multicomponent incompressible Cahn-Hilliard liquids | Phys. Rev. E, accessed October 27, 2025, [https://link.aps.org/doi/10.1103/PhysRevE.93.013126](https://link.aps.org/doi/10.1103/PhysRevE.93.013126)  
7. Grand-potential-based phase-field model for multiple phases, grains, and chemical components | Phys. Rev. E, accessed October 27, 2025, [https://link.aps.org/doi/10.1103/PhysRevE.98.023309](https://link.aps.org/doi/10.1103/PhysRevE.98.023309)  
8. Difference between phase-field and level set method? \- ResearchGate, accessed October 27, 2025, [https://www.researchgate.net/post/Difference-between-phase-field-and-level-set-method](https://www.researchgate.net/post/Difference-between-phase-field-and-level-set-method)  
9. Navier-Stokes Equations, accessed October 27, 2025, [https://www.grc.nasa.gov/www/k-12/airplane/nseqs.html](https://www.grc.nasa.gov/www/k-12/airplane/nseqs.html)  
10. Navier–Stokes equations \- Wikipedia, accessed October 27, 2025, [https://en.wikipedia.org/wiki/Navier%E2%80%93Stokes\_equations](https://en.wikipedia.org/wiki/Navier%E2%80%93Stokes_equations)  
11. Color-gradient-based phase-field equation for multiphase flow | Phys. Rev. E, accessed October 27, 2025, [https://link.aps.org/doi/10.1103/PhysRevE.109.035301](https://link.aps.org/doi/10.1103/PhysRevE.109.035301)  
12. GPU Fluid Simulation | Benedikt Bitterli's Portfolio, accessed October 27, 2025, [https://benedikt-bitterli.me/gpu-fluid.html](https://benedikt-bitterli.me/gpu-fluid.html)  
13. Constraint Fluids on GPU \- Algoryx, accessed October 27, 2025, [https://www.algoryx.se/mainpage/wp-content/uploads/2021/04/MartinNilsson.pdf](https://www.algoryx.se/mainpage/wp-content/uploads/2021/04/MartinNilsson.pdf)  
14. Chapter 38\. Fast Fluid Dynamics Simulation on the GPU \- NVIDIA Developer, accessed October 27, 2025, [https://developer.nvidia.com/gpugems/gpugems/part-vi-beyond-triangles/chapter-38-fast-fluid-dynamics-simulation-gpu](https://developer.nvidia.com/gpugems/gpugems/part-vi-beyond-triangles/chapter-38-fast-fluid-dynamics-simulation-gpu)  
15. Phase-field model \- Wikipedia, accessed October 27, 2025, [https://en.wikipedia.org/wiki/Phase-field\_model](https://en.wikipedia.org/wiki/Phase-field_model)  
16. Uniform & Shader Storage Buffer Objects \- Bauhaus-Universität Weimar, accessed October 27, 2025, [https://www.uni-weimar.de/fileadmin/user/fak/medien/professuren/Computer\_Graphics/CG\_WS\_19\_20/Computer\_Graphics/06\_ShaderBuffers.pdf](https://www.uni-weimar.de/fileadmin/user/fak/medien/professuren/Computer_Graphics/CG_WS_19_20/Computer_Graphics/06_ShaderBuffers.pdf)  
17. GLSL Tutorial – Uniform Blocks \- Lighthouse3d.com, accessed October 27, 2025, [https://www.lighthouse3d.com/tutorials/glsl-tutorial/uniform-blocks/](https://www.lighthouse3d.com/tutorials/glsl-tutorial/uniform-blocks/)  
18. Chapter 2\. Rendering Water Caustics \- NVIDIA Developer, accessed October 27, 2025, [https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-2-rendering-water-caustics](https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-2-rendering-water-caustics)  
19. Snell's law \- Wikipedia, accessed October 27, 2025, [https://en.wikipedia.org/wiki/Snell%27s\_law](https://en.wikipedia.org/wiki/Snell%27s_law)  
20. Real-Time 2.5D Fluid Dynamics Simulation Using GPGPU | CESCG, accessed October 27, 2025, [https://cescg.org/wp-content/uploads/2017/03/Leber-Real-time-2.5D-Fluid-Dynamics-Simulation-Using-GPGPU.pdf](https://cescg.org/wp-content/uploads/2017/03/Leber-Real-time-2.5D-Fluid-Dynamics-Simulation-Using-GPGPU.pdf)  
21. \[2202.11476\] Comparing the convected level-set and the Allen-Cahn phase-field methods in AMR/C simulations of two-phase flows \- arXiv, accessed October 27, 2025, [https://arxiv.org/abs/2202.11476](https://arxiv.org/abs/2202.11476)  
22. Efficient numerical approaches with accelerated graphics processing unit (GPU) computations for Poisson problems and Cahn-Hilliard equations \- NIH, accessed October 27, 2025, [https://pmc.ncbi.nlm.nih.gov/articles/PMC11466300/](https://pmc.ncbi.nlm.nih.gov/articles/PMC11466300/)  
23. Texture packing algorithm \- Game Development Stack Exchange, accessed October 27, 2025, [https://gamedev.stackexchange.com/questions/2829/texture-packing-algorithm](https://gamedev.stackexchange.com/questions/2829/texture-packing-algorithm)  
24. Real-time rendering of water caustics | by Martin Renou \- Medium, accessed October 27, 2025, [https://medium.com/@martinRenou/real-time-rendering-of-water-caustics-59cda1d74aa](https://medium.com/@martinRenou/real-time-rendering-of-water-caustics-59cda1d74aa)  
25. Chapter 47\. Flow Simulation with Complex Boundaries \- NVIDIA Developer, accessed October 27, 2025, [https://developer.nvidia.com/gpugems/gpugems2/part-vi-simulation-and-numerical-algorithms/chapter-47-flow-simulation-complex](https://developer.nvidia.com/gpugems/gpugems2/part-vi-simulation-and-numerical-algorithms/chapter-47-flow-simulation-complex)  
26. Rendering Realtime Caustics in WebGL | by Evan Wallace \- Medium, accessed October 27, 2025, [https://medium.com/@evanwallace/rendering-realtime-caustics-in-webgl-2a99a29a0b2c](https://medium.com/@evanwallace/rendering-realtime-caustics-in-webgl-2a99a29a0b2c)  
27. WebGL Water \- Evan Wallace, accessed October 27, 2025, [https://madebyevan.com/webgl-water/](https://madebyevan.com/webgl-water/)  
28. Camera lens distortion in OpenGL \- Stack Overflow, accessed October 27, 2025, [https://stackoverflow.com/questions/44489686/camera-lens-distortion-in-opengl](https://stackoverflow.com/questions/44489686/camera-lens-distortion-in-opengl)  
29. A collection of Lens Correction shaders for OpenGL (GLSL) \- GitHub, accessed October 27, 2025, [https://github.com/Visual-Vincent/Lens-Correction-GLSL](https://github.com/Visual-Vincent/Lens-Correction-GLSL)  
30. Liquid Glass Shader: WebGL-Powered iOS-Style Glass Effects for JavaScript, accessed October 27, 2025, [https://dev.to/jqueryscript/liquid-glass-shader-webgl-powered-ios-style-glass-effects-for-javascript-3lek](https://dev.to/jqueryscript/liquid-glass-shader-webgl-powered-ios-style-glass-effects-for-javascript-3lek)  
31. Easy Liquid Glass Effect for WebGL (Unicorn Studio) \- YouTube, accessed October 27, 2025, [https://www.youtube.com/watch?v=dtmrg5rO27w](https://www.youtube.com/watch?v=dtmrg5rO27w)  
32. Using GLSL mix() to Combine Colors in OpenGL \- YouTube, accessed October 27, 2025, [https://www.youtube.com/watch?v=7AQIdwd5PEU](https://www.youtube.com/watch?v=7AQIdwd5PEU)