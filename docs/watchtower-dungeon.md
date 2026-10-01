# Watchtower dungeon

Enter from Watchtower via `watchtower-gate-floor`. All six maps are available through the editor's saved-map picker. Existing maps and FX remain preserved.

| Floor | Map ID | Size | Role |
| --- | --- | --- | --- |
| Lower I | watchtower-undercroft | 48×40 | Stores, cistern and basalt sanctuary |
| Lower II | watchtower-prison | 52×40 | Four cell blocks, guard aisle, torture/ossuary rooms, and Aldric's lockpick-gated cell |
| Upper I | watchtower-gate-floor | 28×28 | Gate guard and dungeon entrance |
| Upper II | watchtower-barracks | 28×28 | Wooden barracks wing and stone arsenal |
| Upper III | watchtower-command | 28×28 | Commander chamber and limestone/basalt floors |
| Upper IV | watchtower-beacon | 28×28 | Signal brazier and final sentinels |

Connections: Prison ↔ Undercroft ↔ Gate ↔ Barracks ↔ Command ↔ Beacon. The gate and beacon have dungeon exits. Red floor connectors use the existing transition system; these are not new stair art. Return links are labeled Voltar.

The four upper maps share their doubled tower outline, column positions and stair layout. Party entry points are spaced away from exit and floor connectors so the first move cannot immediately leave a floor. Each floor has two additional guards positioned away from the party entry. New ground variants use board-aligned continuous material mapping. Older cages, wall segments, storage props, braziers and furnishings provide detail without replacing assets or changing FX definitions.

The prison's Aldric dialogue branches through his account of the Crimson Company's defeat and ends with an option to recruit him. A lockpick opens the cell; after he joins, he is added to the party roster and appears on the remaining watchtower floors.

Latest prison revision: `src/game/maps/watchtower-prison002.json`. All other new floors have serial 001. Entry is appended to `src/game/map-order.json` under watchtower; other floors remain connector destinations without separate world-map cards.

Validation: `node scripts/qa-watchtower-dungeon.mjs` checks map loading, tile assets, prop IDs and bounds, spawn passability, connected routes, reciprocal floor links, reachable exits and entrance assignment. All checks passed. Browser preview: `/watchtower-dungeon-preview.html`; screenshot: `screenshots/watchtower-dungeon.png`. The overview shows actual terrain and editor props with markers for units; it is not a full gameplay screenshot. Combat difficulty has not been playtested.
