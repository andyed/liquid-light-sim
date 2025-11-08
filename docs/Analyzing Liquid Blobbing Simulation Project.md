

# **Technical Analysis and Recommendations for Liquid-Liquid Blob Simulation in Real-Time Environments**

## **1\. Executive Synthesis: Diagnosing the Interface Problem and Roadmap**

The challenge of achieving consistent, cohesive "blobbing behavior" in a liquid light simulation is fundamentally an interfacial dynamics problem. The simulation is attempting to model a classic system of coupled fluid dynamics and heat transfer between two immiscible liquids, analogous to a lava lamp.1 The primary aesthetic failure—the lack of stable, organic blobs—overwhelmingly suggests a deficiency in the modeling and stable integration of the interfacial tension (IFT) force.

### **1.1. The Interfacial Physics of Liquid Light**

Successful simulation of the liquid light effect depends on accurately modeling two primary, competing physical forces and their thermal dependency:

1. **Interfacial Tension ($\\sigma$):** This force acts to minimize the surface area of the oil phase, coercing it into stable, spherical shapes.3 High IFT is the critical cohesive mechanism required to resist fluid breakup and govern the smooth merging (coalescence) of droplets.5 If IFT is absent or numerically weak, the oil phase will simply diffuse, shear unrealistically, or fail to form stable spheres, leading to the observed "lack of blobbing."  
2. **Buoyancy and Thermal Convection:** The movement is driven by a density difference ($\\Delta \\rho$) between the oil and the carrier fluid, which is temperature-dependent ($\\rho(T)$).6 This thermal coupling is necessary to sustain the cyclical, chaotic movement characteristic of a lava lamp, where heated, less dense blobs rise, cool and become denser, and subsequently sink.8

### **1.2. Deeper Analysis: The Stability Imperative**

The difficulty in achieving strong blobbing is usually rooted in numerical limitations rather than conceptual misunderstanding. High interfacial tension forces are computationally stiff. In explicit time integration schemes—common in real-time fluid solvers—high surface tension coefficients ($\\sigma$) necessitate extremely small timesteps to maintain stability (the Courant-Friedrichs-Lewy or CFL condition).9 If the current simulation uses an explicit solver, the user is likely forced to choose a low, unrealistically small $\\sigma$ value to maintain real-time performance, effectively killing the cohesive, blobby aesthetic.

The architectural solution, therefore, centers on computational stability. To enable the required high IFT (maximal blobbing), the simulation must transition to an **implicit integration scheme** for the stiffest forces, specifically surface tension and viscosity.10 This allows for larger, performance-friendly time steps while retaining the high magnitude of the cohesive forces necessary for robust droplet formation.9

The recommended technical roadmap is three-pronged, designed to achieve aesthetic goals through optimized performance:

1. **Stabilize Dynamics:** Adopt a particle-based framework, such as Smoothed Particle Hydrodynamics (SPH), and implement an Implicit Surface Tension model.  
2. **Drive Movement:** Implement density variations via simplified thermal coupling ($\\rho(T)$).  
3. **Refine Appearance:** Utilize customized Metaballs as the visualization backbone for seamless, organic blending.

## **2\. Foundational Physics: Tuning Interfacial and Thermal Dynamics**

For computer graphics, the goal is often visual plausibility and aesthetic control, not necessarily strict scientific accuracy.11 This means the key material parameters—IFT and viscosity—must be treated as artistic levers to exaggerate the desired "blobby" effect.

### **2.1. Interfacial Tension: Maximizing Cohesion and Spheroidization**

Interfacial tension is the single most important parameter for blob formation. For a visually convincing oil blob, the IFT ($\\sigma$) must be sufficiently high to ensure maximum cohesion. This force ensures the droplet remains cohesive and resists the stretching and tearing induced by flow vorticity and convection.5

High $\\sigma$ values have several desirable physical effects for this visualization:

* **Rapid Spheroidization:** High surface tension enhances the potential energy of the fluid interface. It reduces the natural period of droplet pulsation, meaning that if a blob is deformed, the restoring forces quickly push it back towards a stable spherical configuration.12  
* **Robust Merging:** When two high-tension oil phases contact, the merging (coalescence) should be aggressive and seamless. The simulation method must robustly handle these topology changes, which SPH, Level Set, and Phase Field models are all designed to manage.5

### **2.2. Viscosity and Aesthetic Damping**

Viscosity ($\\mu$) dictates the internal resistance to deformation and flow within the oil and the carrier fluid. For a slow, organic, "syrupy" liquid light look, high viscosity is crucial.6

* **Controlling Blob Dynamics:** High viscosity creates high resistance to flow, which slows the overall movement and depresses internal fluid pulsation within the blobs.12 This creates the characteristic slow, languid movement and ensures that kinetic energy is rapidly transformed into viscous dissipation, preventing jittery or excessively turbulent motion.14  
* **Temperature Dependence of Viscosity ($\\mu(T)$):** For a more sophisticated model, both the density and viscosity of the oil should decrease as temperature rises.15 This introduces a dynamic element where hotter blobs, while rising faster due to reduced density, might also deform or stretch more easily due to reduced internal viscous damping, adding subtle visual complexity to the convective cycle.

### **2.3. Thermal Convection and the Chaotic Loop**

If the movement of the blobs is currently too predictable, it is likely due to a fixed density difference ($\\Delta \\rho$). The chaotic, sustained behavior requires the thermal feedback loop where material properties are temperature-dependent.8

The convective cycle is driven by heat transfer: a simulated heat source at the bottom warms the oil, decreasing its density and increasing buoyancy. As the oil rises, it cools, its density increases, and eventually, the blob sinks, completing the cycle.1 This competition between temperature and composition results in the desired chaotic, unpredictable behavior over time.6

An advanced detail to consider is the **Marangoni Effect**. This effect occurs when temperature differences ($\\nabla T$) create surface tension gradients ($\\sigma(T)$) along the fluid interface.17 These gradients induce fluid flow directed toward regions of higher surface tension. While complex to implement, introducing the Marangoni number ($Ma$) into the calculation can induce small-scale surface swirling, increasing the visual richness of the interface movement.18

## **3\. Numerical Framework: Choosing and Optimizing for Immiscibility**

Achieving real-time performance while handling high IFT and dynamic topology changes requires selecting the optimal numerical backbone.

### **3.1. Evaluating Multiphase Simulation Candidates**

| Feature | Smoothed Particle Hydrodynamics (SPH) | Level Set Method (LSM) | Phase Field (Cahn-Hilliard) |
| :---- | :---- | :---- | :---- |
| **Nature** | Lagrangian (Particle-based) | Eulerian (Grid-based, Interface Capturing) | Eulerian (Grid-based, Diffuse Interface) |
| **Handling Topology Change** | Excellent (Natural outcome of particle interaction) 19 | Excellent (Implicit function handles changes easily) 20 | Excellent (Natural outcome of energy minimization) 13 |
| **Interface Definition** | Implicit (Requires Metaball reconstruction) | Sharp (Zero-level set) | Diffuse (Finite thickness) |
| **Real-Time GPU Efficiency** | **Highest.** O($N \\log N$) with acceleration structures.22 | Moderate (Requires fast solvers).23 | Moderate/High. |
| **Complexity of Multiphase Setup** | Moderate (Requires specialized IFT/Buoyancy forces) 24 | High (Requires velocity extrapolation and distance function maintenance) 5 | High (Requires solving Cahn-Hilliard system) |

### **3.2. SPH/Metaball Synergy for Visual Effects**

The analysis strongly indicates that **Smoothed Particle Hydrodynamics (SPH)** is the most advantageous choice for a real-time visualization project with this specific aesthetic goal.

SPH is inherently a Lagrangian, mesh-free method, making it highly parallelizable and well-suited for GPU compute environments (e.g., CUDA or compute shaders in modern graphics APIs).22 Crucially, SPH handles topology changes—merging and splitting of fluid volumes—naturally through particle movement without requiring complex re-meshing or re-distancing algorithms, simplifying the implementation of merging oil blobs.19

The traditional drawback of SPH—that its particle nature leads to bumpy or noisy surfaces—is effectively irrelevant here because the aesthetic goal of smooth, organic "blobbing" *mandates* the use of implicit surfaces like Metaballs for visualization.25 This creates a powerful synergy: SPH's density calculation uses smoothing kernels that are mathematically analogous to the implicit fields used by Metaballs, ensuring consistency between the physics simulation and the rendered surface.27 This coupling yields the fastest and most aesthetically appropriate pipeline for this specific project.27

### **3.3. Multiphase Implementation in SPH**

To simulate immiscible fluids (oil and water) using SPH, the framework must be extended beyond single-phase flow:

1. **Phase Identification:** A mechanism, often referred to as a "color function" or scalar field, must be maintained for each particle to distinguish the oil phase from the carrier phase.28  
2. **Buoyancy Force Integration:** The body force per unit volume ($F\_b \= \\rho \\mathbf{g}$) in the Navier-Stokes equations must be modified to calculate the differential buoyancy force based on the density contrast ($\\Delta \\rho$) between the phases.29 This force is essential for initiating convection.26  
3. **Incompressibility:** Liquids require constraints to maintain density. Utilizing a Weakly Compressible SPH (WCSPH) or an Implicit SPH (ISPH or PCISPH) formulation is necessary to ensure realistic behavior and a stable pressure field.25

## **4\. Technical Implementation: Stabilizing High Interfacial Tension (IFT)**

The transition from a system failing to produce blobs to one that sustains them relies entirely on stabilizing the IFT force calculation, allowing high coefficients to be used.

### **4.1. The Failure of Explicit Continuum Surface Force (CSF)**

Many SPH implementations initially adopt the Continuum Surface Force (CSF) model, adapted from grid-based methods.9 The CSF force, derived from the Young-Laplace equation, is proportional to the interface curvature ($\\kappa$) and the surface normal ($\\mathbf{n}$). Calculating $\\kappa$ and $\\mathbf{n}$ requires computing second-order derivatives (the Laplacian and gradient) of the phase color function.28

This derivative calculation is inherently error-prone and numerically noisy in SPH, particularly in areas where particles are sparse near the fluid boundary.28 When high IFT values ($\\sigma$) are applied via explicit time integration, these numerical errors amplify rapidly, leading to explosive instability and particle scatter.9 Consequently, developers are often forced to reduce $\\sigma$ to negligible levels, resulting in the observed lack of cohesive blobbing.

### **4.2. Recommended Solution: Implicit Cohesion Force**

The preferred solution for real-time graphics demanding high IFT is the use of a molecular-like or **Inter-Particle Force (IPF)** cohesion model, integrated implicitly.9

1. **Mechanism:** This approach models surface tension by introducing an artificial, attractive pairwise force (cohesion) that acts only between particles of the *same phase* near the interface.9 This force directly pulls the mass together, minimizing surface area and forming spherical shapes, without requiring the complex and error-prone calculation of interface curvature.28  
2. **Implicit Integration for Stability:** The key to success lies in adopting an implicit formulation for this cohesion force. Recent research demonstrates that utilizing an implicit time discretization—such as an adapted variant of the linearized backward Euler method—for the cohesion force dramatically improves stability. This method strongly couples surface tension forces with pressure and viscosity calculations within the time step, effectively bypassing the CFL instability constraints associated with high $\\sigma$.9 This allows the use of arbitrarily high $\\sigma$ values required for the resilient, cohesive oil blobs without sacrificing real-time frame rates.

### **4.3. Integrating Movement Forces**

To complete the physical model, buoyancy and potentially heat transfer must be integrated:

* **Buoyancy Implementation:** The buoyancy force is a body force added to the SPH momentum equation. For a simpler implementation, this can be faked as an artificial force based on penetration depth or phase markers, acting opposite to gravity.28 However, to achieve the sustained, chaotic cycling, the full $\\rho(T)$ dependency must eventually be modeled, ensuring the density of the rising fluid decreases, and the density of the sinking fluid increases.8  
* **GPU Implementation:** The entire SPH loop—including neighbor searches, pressure solving, and force application (viscosity, IFT, buoyancy)—must be implemented on the GPU. This is essential for handling the large number of particles (tens or hundreds of thousands) required to maintain sufficient visual resolution and achieve interactive frame rates.26

## **5\. Visualization Pipeline: Metaballs for Seamless Organic Blending**

The visualization pipeline is the final, crucial step in achieving the desired organic, smooth aesthetic, regardless of the underlying particle resolution limitations of the real-time simulation.25

### **5.1. The Role of Implicit Surfaces**

Metaballs are defined as implicit surfaces derived from summing the influence fields of spherical "fluid atoms" (the SPH particles).27 When particles move close, their fields add together, resulting in a smooth bridge that visually mimics surface tension.22 This visualization layer is essential for compensating for the inherent sparsity of SPH particles used in real-time simulations, which otherwise would render as visible points.27

The standard process involves mapping the SPH density field, calculated using the kernel function, directly to the Metaball field function. This maintains consistency, where areas of high particle density generate a strong, coherent surface.27

### **5.2. Customizing the Blending Function for Exaggerated Merging**

To obtain a truly pronounced, exaggerated "blobby" effect—where objects smoothly meld far before they physically touch—the standard Metaball blending function must be customized.33

* **Tuning Coalescence:** The blending behavior is controlled by how the fields of adjacent spheres sum up. Research into generalized implicit surface composition methods, such as Ricci 73's operator, provides parameters to control the shape of the joining surfaces.34 Specifically, by adjusting the norm parameter ($P$) below $1.0$, the blending function can be modified to create "bulgy joining of surfaces" that look softer and merge over a greater distance.34 This artificial visual enhancement is a necessary shortcut to achieve the fluid-like appearance while keeping the particle count low enough for real-time performance.22

### **5.3. Surface Reconstruction Methods for Real-Time Rendering**

Once the Metaball field (an implicit scalar volume) is defined by the SPH particles, it must be rendered efficiently. Traditional techniques like Marching Cubes (MC) generate a polygon mesh.25 While effective, MC can be computationally heavy, especially if performed on the CPU.

For optimal real-time GPU performance, two alternatives are preferred:

1. **Point-Based Visualization:** This technique samples the implicit Metaball surface using a large number of dynamically placed surface particles. These particles are constrained to the zero-level set of the implicit function and are spread evenly across the surface using SPH-like repulsion forces.27 This avoids mesh generation entirely and is highly efficient on the GPU.  
2. **Texture-Based Rendering (for 2D/2.5D):** For simulations constrained to a plane (which the liquid light aesthetic often appears to be), the Metaball field can be calculated directly in a fragment shader, rendering the implicit field to a texture. The gradient of the scalar field provides surface normals, enabling real-time reflection, refraction, and thickness calculations, producing a visually clean and appealing result without the cost of complex geometry.37

## **6\. Consolidated Data Tables and Causal Analysis**

This section summarizes the critical parameters and the core relationship between the physical model and the numerical method required to achieve stable, high-tension blobbing.

Table 1: Key Tuning Parameters for Exaggerated Oil Blobbing

| Parameter | Physical Significance | Tuning Goal for Visual Effect | Causality/Effect |
| :---- | :---- | :---- | :---- |
| Interfacial Tension ($\\sigma$) | Cohesion force at the interface. | Increase significantly (Requires implicit solver). | Drives spheroidization; controls resilience to breakup; reduces oscillation period.12 |
| Viscosity ($\\mu\_{Oil}$) | Resistance to flow and deformation. | Increase significantly (Requires implicit solver). | Slows movement; creates viscous trails; increases dissipation.6 |
| Density Difference ($\\Delta \\rho(T)$) | Magnitude of Buoyancy force. | Dynamic (Temperature-dependent). | Drives convection cycle; controls speed of ascent/descent; sustains chaotic movement.7 |
| Metaball Blending Parameter ($P$) | Visual sphere of influence/bulginess. | Tune for exaggerated blending (e.g., $P \< 1.0$ in generalized functions). | Ensures blobs join far apart and merge seamlessly, compensating for sparse simulation resolution.32 |

The necessity of transitioning to high $\\sigma$ and high $\\mu$ is dictated by the aesthetic requirement for slow, cohesive, syrupy blobs. The critical consequence of using these high values is that standard explicit numerical methods become unstable, which is the underlying cause of the current difficulty. Therefore, the adoption of implicit force integration is not merely an optimization but a mandatory architectural change necessary to sustain the visual effect.9

## **7\. Conclusions and Final Action Plan**

The analysis concludes that the struggle to achieve visually compelling oil blobbing is a result of numerical instability inherent in explicitly simulating high interfacial tension, combined with a potential deficiency in the visualization pipeline to render smooth, organic surfaces from particle data.

The solution requires a fundamental shift in both the dynamics solver architecture and the visualization approach:

1. **Phase 1: Stabilization (Numerical Refinement):** The highest priority is stabilizing the cohesive forces. The simulation framework should utilize **Smoothed Particle Hydrodynamics (SPH)** and transition the interfacial tension calculation from any potentially unstable Explicit Continuum Surface Force (CSF) approach to an **Implicit Cohesion Force (IPF)** model.10 This implicit integration allows the simulation to use the high $\\sigma$ coefficients required for robust blob cohesion and spheroidization without suffering time-step restrictions, ensuring stability and visual fidelity.9  
2. **Phase 2: Movement (Physical Refinement):** Implement the chaotic dynamics by integrating a **temperature-dependent density model ($\\rho(T)$)** and solving a simplified heat equation alongside the fluid equations. This thermal coupling will sustain the buoyancy-driven convection cycle, transitioning the movement from predictable to the desired chaotic, periodic exchange of rising and sinking blobs.8  
3. **Phase 3: Visualization (Aesthetic Shortcut):** Integrate a **Metaball visualization pipeline** to translate the SPH particle distribution into a smooth, seamless surface. Crucially, the blending parameters of the Metaball function must be tuned (e.g., using generalized functions with non-standard norms) to *exaggerate* the surface influence and joining effect. This visual shortcut ensures that even if the underlying particle simulation runs at a lower resolution for real-time speed, the resulting rendered surface maintains the organic, fluid aesthetic required for the "liquid light" project.22

#### **Works cited**

1. A Closer Look at the Physics Involved in Lava Lamps | COMSOL Blog, accessed November 8, 2025, [https://www.comsol.com/blogs/closer-look-physics-involved-in-lava-lamps](https://www.comsol.com/blogs/closer-look-physics-involved-in-lava-lamps)  
2. The techniques presented in this paper allow the simulation of a lava... \- ResearchGate, accessed November 8, 2025, [https://www.researchgate.net/figure/The-techniques-presented-in-this-paper-allow-the-simulation-of-a-lava-lamp-The\_fig1\_220789344](https://www.researchgate.net/figure/The-techniques-presented-in-this-paper-allow-the-simulation-of-a-lava-lamp-The_fig1_220789344)  
3. BEHAVIOR OF FLUIDS IN A WEIGHTLESS ENVIROWNT By Dale A. Fester, Ralph N. Eberhardt and James R. Tegart Martin Marietta Corporati \- NASA Technical Reports Server (NTRS), accessed November 8, 2025, [https://ntrs.nasa.gov/api/citations/19770010736/downloads/19770010736.pdf](https://ntrs.nasa.gov/api/citations/19770010736/downloads/19770010736.pdf)  
4. Interfacial Tension | Measurements \- Biolin Scientific, accessed November 8, 2025, [https://www.biolinscientific.com/measurements/interfacial-tension](https://www.biolinscientific.com/measurements/interfacial-tension)  
5. Numerical simulation of immiscible fluids with FEM level set techniques \- ResearchGate, accessed November 8, 2025, [https://www.researchgate.net/publication/28357474\_Numerical\_simulation\_of\_immiscible\_fluids\_with\_FEM\_level\_set\_techniques](https://www.researchgate.net/publication/28357474_Numerical_simulation_of_immiscible_fluids_with_FEM_level_set_techniques)  
6. Lava Lamps & Thermochemical Convection, accessed November 8, 2025, [https://www.geo-down-under.org.au/lava-lamps-thermochemical-convection/](https://www.geo-down-under.org.au/lava-lamps-thermochemical-convection/)  
7. Lava Lamp Experiment \- Little Bins for Little Hands, accessed November 8, 2025, [https://littlebinsforlittlehands.com/homemade-lava-lamp-density-science-experiment/](https://littlebinsforlittlehands.com/homemade-lava-lamp-density-science-experiment/)  
8. Basics of lava-lamp convection | Phys. Rev. E \- Physical Review Link Manager, accessed November 8, 2025, [https://link.aps.org/doi/10.1103/PhysRevE.80.046307](https://link.aps.org/doi/10.1103/PhysRevE.80.046307)  
9. Implicit Surface Tension for SPH Fluid Simulation \- Computer Animation, accessed November 8, 2025, [https://animation.rwth-aachen.de/media/papers/85/2023-TOG-SPH\_Implicit\_Surface\_tension-compressed.pdf](https://animation.rwth-aachen.de/media/papers/85/2023-TOG-SPH_Implicit_Surface_tension-compressed.pdf)  
10. Implicit Surface Tension for SPH Simulations \- Stefan Rhys Jeske, accessed November 8, 2025, [https://srjeske.de/publications/2023-tog-sph-surface-tension/](https://srjeske.de/publications/2023-tog-sph-surface-tension/)  
11. Real-Time Fluid Dynamics for Games, accessed November 8, 2025, [http://graphics.cs.cmu.edu/nsp/course/15-464/Fall09/papers/StamFluidforGames.pdf](http://graphics.cs.cmu.edu/nsp/course/15-464/Fall09/papers/StamFluidforGames.pdf)  
12. Influence of viscosity and surface tension of fluid on the motion of bubbles \- 物理学报, accessed November 8, 2025, [https://wulixb.iphy.ac.cn/en/article/doi/10.7498/aps.66.234702](https://wulixb.iphy.ac.cn/en/article/doi/10.7498/aps.66.234702)  
13. Numerical Simulations of Immiscible Fluid Clusters \- CORE, accessed November 8, 2025, [https://core.ac.uk/download/pdf/295864.pdf](https://core.ac.uk/download/pdf/295864.pdf)  
14. EFFECTS OF SURFACE TENSION AND VISCOSITY ON TAYLOR INSTABILITY \- DTIC, accessed November 8, 2025, [https://apps.dtic.mil/sti/citations/AD0604215](https://apps.dtic.mil/sti/citations/AD0604215)  
15. Physical viscosity in smoothed particle hydrodynamics simulations of galaxy clusters | Monthly Notices of the Royal Astronomical Society | Oxford Academic, accessed November 8, 2025, [https://academic.oup.com/mnras/article/371/3/1025/1006399](https://academic.oup.com/mnras/article/371/3/1025/1006399)  
16. LAVA LAMP | DENSITY EXPERIMENT | \- YouTube, accessed November 8, 2025, [https://www.youtube.com/watch?v=SuUdtXe-zbc](https://www.youtube.com/watch?v=SuUdtXe-zbc)  
17. What Is the Marangoni Effect? \- COMSOL, accessed November 8, 2025, [https://www.comsol.com/multiphysics/marangoni-effect](https://www.comsol.com/multiphysics/marangoni-effect)  
18. Simulation of the Marangoni Effect and Phase Change Using the Particle Finite Element Method \- MDPI, accessed November 8, 2025, [https://www.mdpi.com/2076-3417/11/24/11893](https://www.mdpi.com/2076-3417/11/24/11893)  
19. Smoothed particle hydrodynamics method for evaporating multiphase flows | Phys. Rev. E, accessed November 8, 2025, [https://link.aps.org/doi/10.1103/PhysRevE.96.033309](https://link.aps.org/doi/10.1103/PhysRevE.96.033309)  
20. Level-set method \- Wikipedia, accessed November 8, 2025, [https://en.wikipedia.org/wiki/Level-set\_method](https://en.wikipedia.org/wiki/Level-set_method)  
21. Level Set Methods for Visualization \- Department of Computer Science, accessed November 8, 2025, [https://www.cs.drexel.edu/\~david/Papers/Viz06\_LS\_Course\_Notes.pdf](https://www.cs.drexel.edu/~david/Papers/Viz06_LS_Course_Notes.pdf)  
22. Smoothed Particle Hydrodynamics, accessed November 8, 2025, [https://cal-cs184-student.github.io/hw-webpages-sp24-oliver-trinity/final/](https://cal-cs184-student.github.io/hw-webpages-sp24-oliver-trinity/final/)  
23. Chapter 38\. Fast Fluid Dynamics Simulation on the GPU \- NVIDIA Developer, accessed November 8, 2025, [https://developer.nvidia.com/gpugems/gpugems/part-vi-beyond-triangles/chapter-38-fast-fluid-dynamics-simulation-gpu](https://developer.nvidia.com/gpugems/gpugems/part-vi-beyond-triangles/chapter-38-fast-fluid-dynamics-simulation-gpu)  
24. Multiple-fluid SPH Simulation Using a Mixture Model \- GAMMA, accessed November 8, 2025, [http://gamma.cs.unc.edu/SPH\_MULTI\_FLUIDS/TOG2014.pdf](http://gamma.cs.unc.edu/SPH_MULTI_FLUIDS/TOG2014.pdf)  
25. Smoothed-particle hydrodynamics \- Wikipedia, accessed November 8, 2025, [https://en.wikipedia.org/wiki/Smoothed-particle\_hydrodynamics](https://en.wikipedia.org/wiki/Smoothed-particle_hydrodynamics)  
26. SPH Modeling of Water-Related Natural Hazards \- MDPI, accessed November 8, 2025, [https://www.mdpi.com/2073-4441/11/9/1875](https://www.mdpi.com/2073-4441/11/9/1875)  
27. Chapter 7\. Point-Based Visualization of Metaballs on a GPU | NVIDIA Developer, accessed November 8, 2025, [https://developer.nvidia.com/gpugems/gpugems3/part-i-geometry/chapter-7-point-based-visualization-metaballs-gpu](https://developer.nvidia.com/gpugems/gpugems3/part-i-geometry/chapter-7-point-based-visualization-metaballs-gpu)  
28. Week 6 \- SPH continued \- Nervous System | Simulation and Nature in Design, accessed November 8, 2025, [https://n-e-r-v-o-u-s.com/education/simulation/week6.php](https://n-e-r-v-o-u-s.com/education/simulation/week6.php)  
29. Numerical Modeling of Surface Tension with Smoothed Particles Hydrodynamics \- Simulation Based Engineering Lab, accessed November 8, 2025, [https://sbel.wisc.edu/wp-content/uploads/sites/569/2019/09/Lijing.pdf](https://sbel.wisc.edu/wp-content/uploads/sites/569/2019/09/Lijing.pdf)  
30. SPH Analysis of Interfacial Flow of the Two Immiscible Melts \- Pyro.co.za, accessed November 8, 2025, [https://www.pyrometallurgy.co.za/MoltenSlags2016/Manuscripts/SPH%20Analysis%20of%20Interfacial%20Flow%20of%20the%20Two%20Immisc.pdf](https://www.pyrometallurgy.co.za/MoltenSlags2016/Manuscripts/SPH%20Analysis%20of%20Interfacial%20Flow%20of%20the%20Two%20Immisc.pdf)  
31. Comparison of Surface Tension Models in Smoothed Particles Hydrodynamics Method, accessed November 8, 2025, [https://www.researchgate.net/publication/337523538\_Comparison\_of\_Surface\_Tension\_Models\_in\_Smoothed\_Particles\_Hydrodynamics\_Method](https://www.researchgate.net/publication/337523538_Comparison_of_Surface_Tension_Models_in_Smoothed_Particles_Hydrodynamics_Method)  
32. Metaball geometry node \- SideFX, accessed November 8, 2025, [https://www.sidefx.com/docs/houdini/nodes/sop/metaball.html](https://www.sidefx.com/docs/houdini/nodes/sop/metaball.html)  
33. Motion Graphics in Blender: Fake Fluids with Metaballs \- YouTube, accessed November 8, 2025, [https://www.youtube.com/watch?v=X3pI7ycYN3A](https://www.youtube.com/watch?v=X3pI7ycYN3A)  
34. Metaball blending parameter proposal \- \[Ricci 73\] blending method \- Blender Devtalk, accessed November 8, 2025, [https://devtalk.blender.org/t/metaball-blending-parameter-proposal-ricci-73-blending-method/14306](https://devtalk.blender.org/t/metaball-blending-parameter-proposal-ricci-73-blending-method/14306)  
35. Unity 3D implementation of metaballs and marching cubes algorithm \- GitHub, accessed November 8, 2025, [https://github.com/dario-zubovic/metaballs](https://github.com/dario-zubovic/metaballs)  
36. Point-based visualization of metaballs on a GPU \- ResearchGate, accessed November 8, 2025, [https://www.researchgate.net/publication/250758279\_Point-based\_visualization\_of\_metaballs\_on\_a\_GPU](https://www.researchgate.net/publication/250758279_Point-based_visualization_of_metaballs_on_a_GPU)  
37. Metaballs with Runtimeshaders \- Medium, accessed November 8, 2025, [https://medium.com/@off.mind.by/metaballs-with-runtimeshaders-bb7e5f6b27c2](https://medium.com/@off.mind.by/metaballs-with-runtimeshaders-bb7e5f6b27c2)  
38. WebGPU Fluid Simulations: High Performance & Real-Time Rendering \- Codrops, accessed November 8, 2025, [https://tympanus.net/codrops/2025/02/26/webgpu-fluid-simulations-high-performance-real-time-rendering/](https://tympanus.net/codrops/2025/02/26/webgpu-fluid-simulations-high-performance-real-time-rendering/)