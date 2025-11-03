# Proposal: Add Ambient Water Flow

## The Real Problem

**Oil isn't moving because there's no water velocity to couple to!**

Currently:
- ❌ Simulation starts with EMPTY container (no water)
- ❌ No ambient flow until user paints or rotates
- ❌ Oil coupling works perfectly, but `waterVelocity = 0`, so `oilVelocity = 0`

In real liquid light shows:
- ✅ Container pre-filled with water (the carrier medium)
- ✅ Water constantly rotating (overhead projector, heat convection, manual stirring)
- ✅ Ink/oil added ON TOP of moving water

## Current Behavior

```javascript
// At startup:
waterVelocity = 0 everywhere
oilVelocity = coupling(waterVelocity) = 0
// Oil painted but doesn't move!

// After user presses 'R' to rotate:
waterVelocity = rotation forces
oilVelocity = coupling(waterVelocity) = moving!
// NOW oil moves
```

## Proposed Solutions

### Option 1: Default Gentle Rotation (Simplest)
Start with `rotationBase = 0.15` (gentle clockwise rotation)

**Pros:**
- One line change
- Mimics real liquid light show behavior
- Oil will move immediately when painted

**Cons:**
- Always rotating (but that's realistic)
- User might want still water

### Option 2: Pre-fill with Invisible Water
Fill velocity field with gentle ambient flow patterns

**Pros:**
- More realistic "water already in container" metaphor
- Can have varied flow patterns (convection, eddies)

**Cons:**
- More complex to implement
- Still need continuous flow (water doesn't stay still in real shows)

### Option 3: Add "Base Flow" Setting
Add `baseFlowStrength` parameter for ambient rotation

**Pros:**
- User-controllable
- Can be toggled on/off
- Good for testing

**Cons:**
- More UI complexity

### Option 4: Start with Heat Lamp On
The heat lamp creates agitation/convection automatically

**Pros:**
- Already implemented
- Creates natural-looking flow

**Cons:**
- Might be too chaotic for initial state

## Recommended Approach

**Hybrid: Gentle default rotation + optional heat**

```javascript
// In simulation.js constructor:
this.rotationBase = 0.12;  // Gentle ambient rotation (was 0.0)
this.heatLampIntensity = 0.0;  // Start with no heat (user can add)
```

Users can:
- Leave it as-is for gentle ambient flow
- Press 'R' to stop rotation temporarily
- Add heat lamp for more chaos
- Paint and immediately see oil move

## Why This Fixes "Oil Not Moving"

Current:
```
1. Paint oil
2. Wait... nothing happens
3. User: "Oil doesn't move!"
```

With ambient flow:
```
1. Paint oil
2. Oil immediately starts swirling with water
3. User: "Oh wow, it moves!"
```

## Implementation

### Quick Fix (1 line):
```javascript
// src/simulation.js line 31
this.rotationBase = 0.12;  // Was 0.0
```

### Full Solution:
```javascript
// Add parameter
this.ambientFlowStrength = 0.12;  // 0 = still, 0.12 = gentle, 0.5 = vigorous

// In applyForces or similar:
if (this.ambientFlowStrength > 0) {
    this.rotationAmount += this.ambientFlowStrength;
}
```

## Addressing "Dissipation Without Movement"

If oil is fading even WITH this fix:
1. ✅ Already disabled smoothing (per-frame dissipation)
2. ✅ Already fixed overflow shader
3. ⚠️ Check if oil is advecting OFF-SCREEN
   - With ambient rotation, oil might be moving to edges
   - Rim absorption is disabled, but edge clamping might still apply
4. ⚠️ Check rendering alpha
   - Oil might be there but rendering too transparent

## Testing Plan

1. **Add ambient rotation** (`rotationBase = 0.12`)
2. **Reload page, paint oil**
3. **Expected:** Oil immediately starts moving in circle
4. **If still fading:** It's dissipation, not movement
5. **If moving but fading:** Track with diagnostic to see where it goes

---

**Bottom Line:** The coupling works. Oil needs water to move. Water needs initial velocity. Add gentle ambient rotation to match real liquid light shows.
