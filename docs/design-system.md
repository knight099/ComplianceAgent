# ComplyOS dashboard design system

The overview uses the charcoal workspace from the frontend architecture reference. The header carries the product identity and operator shortcuts. Below it, a persistent navigation rail sits beside a two-column metric grid, control distributions and priority incidents.

[Workspace components](../app/ui/workspace.jsx) · [Tokens and responsive styles](../app/ui/workspace.module.css) · [Overview implementation](../app/page.jsx)

| Primitive | Usage |
| --- | --- |
| Workspace | Establishes the scoped palette, typography, rounded frame and spacing. |
| Metric | Pairs a label with a prominent value. Supply a semantic tone for status metrics. |
| Panel | Groups related content beneath a level-two heading. |
| ResultBar | Exposes a labeled percentage visually and through a native progress element. |

Use passing green for positive results, critical red for failures, warning orange for exceptions and pending work, and slate for unknowns. Pair color with a visible label. Use 22 px for page titles, 20 px for panel titles, 32 px for metric values and 14 px for navigation and distribution labels. The navigation collapses to labeled icons at widths up to 480 px.

The overview uses the illustrative values from the design reference. The operator workspace at `/operations` loads collected assessments and exposes review, monitoring and model configuration.
