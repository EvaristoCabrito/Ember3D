# Watchtower dungeon

Enter from Watchtower via `watchtower-gate-floor`. All six maps are available through the editor's saved-map picker. Existing maps and FX remain preserved.

| Floor | Map ID | Size | Role |
| --- | --- | --- | --- |
| Lower I | watchtower-undercroft | 24×20 | Stores, cistern and basalt sanctuary |
| Lower II | watchtower-prison | 26×20 | Four cell blocks, guard aisle and torture/ossuary rooms |
| Upper I | watchtower-gate-floor | 14×14 | Gate guard and dungeon entrance |
| Upper II | watchtower-barracks | 14×14 | Wooden barracks wing and stone arsenal |
| Upper III | watchtower-command | 14×14 | Commander chamber and limestone/basalt floors |
| Upper IV | watchtower-beacon | 14×14 | Signal brazier and final sentinels |

Connections: Prison ↔ Undercroft ↔ Gate ↔ Barracks ↔ Command ↔ Beacon. The gate and beacon have dungeon exits. Red floor connectors use the existing transition system; these are not new stair art. Return links are labeled Voltar.

The four upper maps share their tower outline, column positions and stair layout. New ground variants use board-aligned continuous material mapping. Older cages, wall segments, storage props, braziers and furnishings provide detail without replacing assets or changing FX definitions.

Latest prison revision: `src/game/maps/watchtower-prison002.json`. All other new floors have serial 001. Entry is appended to `src/game/map-order.json` under watchtower; other floors remain connector destinations without separate world-map cards.

Validation: `node scripts/qa-watchtower-dungeon.mjs` checks map loading, tile assets, prop IDs and bounds, spawn passability, connected routes, reciprocal floor links, reachable exits and entrance assignment. All checks passed. Browser preview: `/watchtower-dungeon-preview.html`; screenshot: `screenshots/watchtower-dungeon.png`. The overview shows actual terrain and editor props with markers for units; it is not a full gameplay screenshot. Combat difficulty has not been playtested.
