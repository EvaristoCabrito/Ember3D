# Frozen Swamp Crossing

The existing Frozen Swamp world marker opens `frozen-swamp-crossing-1`. The location has open access. Parts II–III and the six underground sites are connected submaps under the same location, rather than separate world markers or campaign cards. `map-order.json` registers one main mission; `map-slots.json` reserves one slot; `WORLD_LOCATIONS` registers all eight submaps for Locais.

| Part | Surface | Optional underground maps |
| --- | --- | --- |
| I — The Drowned Causeway | `frozen-swamp-crossing-1` | `frozen-swamp-1-sunk-vault`, `frozen-swamp-1-hidden-cellar` |
| II — The Hollow Reed Basin | `frozen-swamp-crossing-2` | `frozen-swamp-2-sunk-vault`, `frozen-swamp-2-hidden-cellar` |
| III — The Pale Beacon | `frozen-swamp-crossing-3` | `frozen-swamp-3-sunk-vault`, `frozen-swamp-3-hidden-cellar` |

Each surface is 52×38 hexes, has twelve enemies, two underground entrances, alternate island routes and a separate secret cache. Each dungeon is 24×20 hexes with five enemies, a flooded cistern, ordinary loot and a sealed secret treasury. Exploration and fog of war are enabled; killing every enemy is not required to use the crossings.

Editor coordinates use zero-based `(x,y)`:

- Surface starting party: `(3,31)`; world exit: `(2,34)`.
- Forward link: `(47,5)` in Parts I–II; final world exit at the same position in Part III.
- Backward link: `(6,32)` in Parts II–III.
- Visible vault entrance: `(25,8)`.
- Hidden cellar entrance: `(9,6)`, behind the secret door at `(9,9)`.
- Surface secret cache: `(37,30)`, behind the secret door at `(37,33)`.
- Underground return link: `(3,17)`.
- Underground secret treasury: `(18,5)`, behind the secret door at `(18,8)`.

Secret entrances use the existing `secret-door-3d-hidden` discovery/opening mechanics and enclosed terrain. Floor connectors are reciprocal and always target a saved map. Both optional dungeons return to their parent surface.

Source saves live in `src/game/maps/` and can be edited normally in the map editor. `scripts/create-frozen-swamp-crossing.mjs` documents their generation and refuses to overwrite existing saves. Validate using `node --experimental-strip-types scripts/qa-ice-encounters.mjs --frozen-swamp`; the checks cover map geometry, concealed rooms, accessible connectors, return links, class footprints, Locais membership and terrain-image decoding.
