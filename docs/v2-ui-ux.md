# Shield v2: UI/UX Refactor - The Evidence Vault

**Status:** Plan
**Focus:** Refactor & Integration
**Target Components:** `ArtworkDetail.tsx`, `SimulationResultViewer.tsx`

---

## 1. Overview: The Evidence Vault

We are fundamentally changing how we present protection. Instead of just showing the protected image, we prove the protection works by exposing the results of our adversarial simulation engine. This "Defense Audit" transforms the artwork detail view into a forensic report.

**Core Philosophy:** "Trust, but Verify." The user should see exactly how an AI model fails to process their protected work.

---

## 2. Component: `ArtworkDetail.tsx` (The Container)

The `ArtworkDetail` view is refactored to prioritize the "Defense Audit".

### 2.1. Layout Structure
The view is vertically stacked:

1.  **Hero Section (The Protected Asset):**
    *   Displays the *Protected Image* fully.
    *   **Primary Action:** Download / Share.
    *   **Status Badge:** "Protected" (Green Check) or "Processing" (Yellow Spinner).

2.  **Defense Audit Section (The Evidence):**
    *   **Snippet:** A summary card showing the `Defense Status` (e.g., "Shield Active", "3/3 Layers Verified").
    *   **Interaction:** A prominent "View Simulation Report" button or an automatically expanded accordion section below the fold.

### 2.2. State Management
*   The component must fetch the `Artwork` and its associated `SimulationJob`.
*   It passes the `simulation_result` object to the `SimulationResultViewer`.

```tsx
// Concept
function ArtworkDetail({ artwork }) {
  const { simulation } = useSimulation(artwork.id);

  return (
    <div className="flex flex-col gap-8">
      {/* 1. Hero */}
      <div className="relative aspect-square w-full max-w-2xl mx-auto">
        <ProtectedImage src={artwork.url} />
        <StatusBadge status={artwork.status} />
        <DefenseStatus value={simulation.layers_passed} total={3} />
      </div>

      {/* 2. Defense Audit */}
      <section className="border-t pt-8">
        <h2 className="text-2xl font-bold mb-4">Defense Audit</h2>
        <SimulationResultViewer results={simulation} />
      </section>
    </div>
  );
}
```

---

## 3. Component: `SimulationResultViewer.tsx` (The Core)

This component handles the complexity of presenting 3 different layer verifications, each with before/after comparisons and specific pass/fail criteria.

### 3.1. Navigation: The Attack Tabs
We use a **Tabbed Interface** (or Accordion on mobile) to separate the different verification modules.

**Tabs:**
1.  **Identity (Biometrics)** - *Focus: Face Protection.*
2.  **Mimicry (Style)** - *Focus: Anti-LoRA / Style Cloning.*
3.  **Editing (Deepfake)** - *Focus: Anti-Inpaint / Manipulation.*
4.  **Watermark (Ownership)** - *Focus: Recovery.*

### 3.2. Check Item: `AttackResultCard`

Inside each tab, we render the `AttackResultCard`. This is a rich component containing:

1.  **Header:**
    *   **Layer Name:** e.g., "Layer 1: Identity Shield".
    *   **Status Badge:** "VERIFIED" (Green) / "COMPROMISED" (Red).

2.  **The Comparison Slider:**
    *   **Left:** Attack on Original (Successful Deepfake).
    *   **Right:** Attack on Protected (Failed/Blurry Deepfake).

3.  **Metrics Breakdown:**
    *   **Identity:** Faces Detected: 0 (Pass).
    *   **Mimicry:** Style Sim: 0.15 (Pass).
    *   **Editing:** Structure Integrity: Low (Pass).

### 3.3. Implementation Details

```tsx
// components/simulation/simulation-result-viewer.tsx

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function SimulationResultViewer({ results }) {
  return (
    <Tabs defaultValue="identity" className="w-full">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="identity">Identity</TabsTrigger>
        <TabsTrigger value="mimicry">Mimicry</TabsTrigger>
        <TabsTrigger value="editing">Editing</TabsTrigger>
        <TabsTrigger value="watermark">Watermark</TabsTrigger>
      </TabsList>
      
      {/* Tab Contents... */}
    </Tabs>
  );
}
```

## 4. Data Visualization Strategy

| Tab | Metric Display |
| :--- | :--- |
| **Identity** | **Faces:** 0 Detected. |
| **Mimicry** | **Style delta:** High. |
| **Editing** | **Inpaint fail:** Yes. |
| **Watermark** | **Recovered:** Yes. |

## 5. Mobile Responsiveness

*   **Tabs:** On mobile, `TabsList` may need to scroll horizontally or wrap. Alternatively, use an `Accordion` pattern where each attack type is a vertical section that expands.
*   **Slider:** The compare slider works naturally on mobile with touch interactions.
*   **Columns:** Stack Metrics below the Title, rather than side-by-side.
