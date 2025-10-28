This is the complete Product Requirements Document (PRD) for the Alpha release of your VJ application, integrating the architectural, physical, control, and testability requirements we discussed.

---

# **📝 Product Requirements Document (PRD): Project Eye Candy**

| Key Detail | Value |
| :---- | :---- |
| **Product Name** | Project Eye Candy (Working Title) |
| **Release Version** | **Alpha 1.0** |
| **Product Manager** | User (Self) |
| **Target User** | VJs, Live Visual Artists, Digital Art Enthusiasts |
| **Target Release Date** | TBD (Post-Milestone 3 Completion) |
| **Owner (Engineering Lead)** | TBD |

---

## **1\. Vision, Goals, and Scope**

### **1.1. Product Vision**

To be the most **aesthetically rich** and **physically plausible** liquid light table simulation, optimized for real-time live performance and user-driven discovery of organic visual patterns. We aim to capture the beautiful, analogue complexity of oil and water in a stable, high-performance digital tool.

### **1.2. Alpha 1.0 Goals (SMART Objectives)**

1. **Aesthetic Fidelity:** Achieve a visual quality that successfully models the glossy, refractive look of an immiscible dual-fluid system at a stable frame rate.  
2. **Performance:** Sustain a minimum of **60 Frames Per Second (FPS)** on the target mid-range hardware during continuous, dynamic simulation.  
3. **Core Feature Complete:** Implement the core **immiscible fluid dynamics** and all **P1 User Controls**, especially the **Freeze/Inspect** feature.

### **1.3. Success Metrics (Alpha)**

* **Frame Rate:** Sustain $\\ge 60$ FPS during 2 hours of continuous user interaction.  
* **Stability:** Zero simulation crashes or visual artifacts (e.g., exploding colors, NaN values) during the 2-hour stress test.  
* **Aesthetics:** Positive validation from 3 VJ/Visualist test users confirming the visual output is captivating and responsive.

### **1.4. Out of Scope for Alpha 1.0**

* **Simulated Aging/Wear:** No degradation of materials, container wear, or physical contaminants.  
* **External Data Input (except MIDI):** No audio analysis or complex external data feeds (Future Release).  
* **Multi-Platform Optimization:** Initial focus is on one desktop environment (e.g., Windows/macOS native or high-performance WebGL/WebGPU).

---

## **2\. Architecture and Core Data Structure (The Model)**

### **2.1. Architectural Mandate**

The application must adhere to a strict **Model-View separation** to ensure performance and testability.

* **The Model (Physics Core):** Implemented via **GPGPU** using the **Phase-Field** (Cahn-Hilliard) and **Navier-Stokes** equations. Runs entirely on the GPU via Compute Shaders (WebGPU) or FBO Ping-Pong (WebGL).  
* **The View (Rendering Pipeline):** Renders the Model's state using **Ray Tracing/Marching** for optical realism.  
* **The Controller (UI/Input):** Pure JavaScript that only manages user input and sends small **Uniforms/Buffers** to the GPU.

### **2.2. Core Data Structure: The Reservoir State (F001.03)**

The entire state of the fluid simulation is stored in high-precision **3D Textures** on the GPU.

| Texture Name | Data Stored (Per Voxel) | Format | Purpose |
| :---- | :---- | :---- | :---- |
| **Phase Field ($\\phi$)** | Oil Concentration (0.0=Water, 1.0=Oil) | R32F (Single Float) | Tracks the immiscible interface and drives Buoyancy/Capillary forces. |
| **Velocity Field ($\\mathbf{u}$)** | Velocity vector $(V\_x, V\_y, V\_z)$ | RGBA32F (Three Floats) | Tracks fluid movement, driven by all forces (user, gravity, capillary, viscosity). |
| **Color Field ($\\mathbf{C}$)** | Injected Dye Color/Concentration ($R, G, B$) | RGBA32F (Three Floats) | Tracks visual dye, updated by **Advection** (carried by $\\mathbf{u}$) and **Diffusion**. |

---

## **3\. Core Functional Requirements (P1 Must-Haves)**

### **F001: The Simulation Core**

| ID | Requirement | Acceptance Criteria |
| :---- | :---- | :---- |
| **F001.01** | Implement a **stable, GPGPU-based dual-fluid solver** (Phase-Field \+ Navier-Stokes). | The two fluids exhibit stable, organic separation and swirling behavior over a long period ($\\ge 2$ hours). |
| **F001.02** | Implement **Buoyancy/Gravitational** forces (density difference). | Lighter fluid (Oil) naturally rises to the top, forming a clear, undulating layer when static. |
| **F001.03** | Implement **Viscosity** and **Capillary Forces** (surface tension). | Swirling patterns should be slow, thick, and highly dissipative, mimicking analogue liquids. |

### **F002: Physical Receptacle & Geometry**

| ID | Requirement | Acceptance Criteria |
| :---- | :---- | :---- |
| **F002.01** | Simulation must be constrained to a **shallow cylindrical volume** (disk shape, $D:R \\approx 1:10$). | The 3D Velocity and Phase Fields confirm fixed boundary conditions along the $X-Y$ circular wall and $Z$-min/max planes. |
| **F002.02** | The View must clearly render a **visible, non-simulated circular border**. | The user can visually discern the outer limits of the tabletop, regardless of fluid state. |

### **F003: Core Interaction Controls**

| ID | Requirement | Acceptance Criteria |
| :---- | :---- | :---- |
| **F003.01** | **Injection Tool:** Primary input to inject **Color Dye** and a minor velocity impulse at the cursor location. | A click generates a localized bloom of color that is immediately advected (carried) by the fluid flow. |
| **F003.02** | **Color Wheel Input:** Real-time control to change the **background light source color** (the light table). | Changing the color with a slider or picker results in an instantaneous ( $\\le 16$ms latency) change to the overall aesthetic tint of the fluids. |
| **F003.03** | **Global Reset:** A dedicated button/hotkey to instantly wipe the Reservoir State to its initial, static configuration. | The entire simulation resets to a clean, still state, ready for a new composition. |

### **F004: Inspection and Testability (The Freeze Frame Model)**

| ID | Requirement | Acceptance Criteria |
| :---- | :---- | :---- |
| **F004.01** | **Pause/Freeze State:** A dedicated hotkey/button must instantly halt the GPGPU physics update loop. | Movement and color diffusion cease immediately. The rendered output remains static and fully detailed, without visual hitching. |
| **F004.02** | **Cross-Section Slide View:** When frozen, the user must be able to toggle a view mode to inspect a 2D slice of the 3D data. | A UI slider allows panning a visualized plane across the $\\mathbf{Z}$-axis (depth), showing the internal distribution of **Color Field** and **Phase Field**. |
| **F004.03** | **Testability Mandate:** The frozen Reservoir State must be serializable (savable) to a file for use as a **test fixture**. | The engineering team can reliably capture and reload a complex state for running physics and rendering regression tests. |

### **F005: VJ Controls**

| ID | Requirement | Acceptance Criteria |
| :---- | :---- | :---- |
| **F005.01** | **Container Rotation (Global Shear):** A control (e.g., keyboard input) that applies a constant **rotational force** to the entire fluid volume. | Fluids accelerate into a stable, uniform rotation, and slowly decelerate back to rest upon release. |
| **F005.02** | **Jet/Force Impulse Tool:** A secondary input (e.g., right-click or key-combo) that injects a strong, **local linear velocity** to simulate rapid stirring. | The jet creates turbulent, highly-localized vortices that dissipate organically into the larger fluid movement. |

---

## **4\. Construction Sequence and Milestones**

The project will use a phased approach to validate the user experience before escalating physics complexity.

### **Phase 1: Foundation & Single-Fluid Model (Fluid Ink Demo)**

* **Goal:** Validate all P1 user controls and the rendering pipeline with a simplified model.  
* **Physics:** Implement simplified **Advection and Diffusion** for a **single, uniform-density fluid** (Water/Inks). Buoyancy/Capillarity are ignored.  
* **Focus:** Core UI setup, Color Wheel (F003.02), Injection Tool (F003.01), and Container Rotation (F005.01) on the single fluid.

### **Milestone 1: Fluid Ink Demo (Go/No-Go)**

* User can interactively stir and inject color; movement is smooth and responsive ($\\ge 60$ FPS).  
* The overall output achieves initial aesthetic approval for light/color blending.

### **Phase 2: Core Simulation & Stability (Dual-Fluid Alpha Core)**

* **Goal:** Implement the full immiscible fluid model and optimize performance.  
* **Physics:** Upgrade the solver to the **dual-fluid Phase-Field model** (Oil/Water). Implement Buoyancy (F001.02) and Viscosity/Capillary Forces (F001.03).  
* **Focus:** Implement the **Jet Impulse Tool** (F005.02) which now affects two different fluids.

### **Milestone 2: Dual-Fluid Alpha Core (Go/No-Go)**

* Oil and water separation is visible, dynamic, and stable.  
* The application runs continuously near the target $\\mathbf{60 \\text{ FPS}}$.

### **Phase 3: Alpha Feature Polish & Test (Alpha 1.0 Release)**

* **Goal:** Finalize inspection features and integrate the testability framework.  
* **Features:** Implement the **Pause/Freeze State** (F004.01) and **Cross-Section Slide View** (F004.02). Implement **Global Reset** (F003.03).  
* **Focus:** Rigorous performance and stability testing; implement the code to **Save/Load Test Fixtures** from the frozen state.

### **Milestone 3: Alpha 1.0 Release**

* All requirements in this PRD are successfully implemented, stress-tested, and ready for internal user validation.

---

## **5\. Non-Functional Requirements (NFRs)**

| Category | Requirement | Priority | Acceptance Criteria |
| :---- | :---- | :---- | :---- |
| **Performance** | Must sustain **$\\ge 60$ FPS** during continuous simulation and rendering. | High | Frame time averaged over 1 minute must be $\\le 16.6$ ms. |
| **Usability** | Core controls (injection, rotation, color change) must have **$\\le 50$ms latency** from input to visual output. | High | User feels direct, real-time connection to the fluid manipulation. |
| **Stability** | The simulation must be mathematically stable, preventing numerical divergence (e.g., exploding velocities) under all input conditions. | High | Zero crashes or visual artifacts (NaNs, sudden flashes) during stress testing. |
| **Testability** | Strict **Model-View separation** must be maintained for independent testing of physics logic and rendering aesthetics. | High | Physics calculations must be testable via numerical comparison of frozen states. |
| **Data Integrity** | The **Reservoir State** data structure must use **high-precision floating-point formats** (e.g., $32\\text{-bit}$ floats) for all field variables. | High | Visual inspection confirms no obvious quantization errors or banding in color or velocity. |

