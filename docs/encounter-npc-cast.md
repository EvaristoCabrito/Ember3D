# New encounter NPCs

Twelve new NPCs are registered in the game and selectable under the editor’s NPC brush. Each uses four distinct 512×768 transparent PNG frames (`1.png`–`4.png`), played by the existing NPC animation loop, and has its own branching dialogue.

The selected cartographer, mushroom collector, and bell collector sheets were retained exactly. The scholar keeps his approved first three frames; only frame four uses the new spectacles-adjusting action. Rejected pilgrim, dice gambler, and gardener designs are not registered or installed.

The second floor of the inn adds Nara, Erasmo, Ada, and Severino with conversations specific to their stay. All earlier NPCs and the original map save remain available. New versions of seven forest/ice encounters include the twelve NPCs. `npc-cast-showcase` is a free exploration map for inspecting the full cast.

Artwork was generated using the built-in image generation tool with Cliente Suspeito and Beberrão as style/action references. Atlas unpacking preserves the generated pixels and transparency without resizing or repainting. Approved original atlas sources and discarded drafts remain in work/npc-art or the original generated-image directory.

| ID | NPC |
|---|---|
| roadCartographer | Nara, Cartógrafa das Trilhas |
| mushroomForager | Bento, Catador de Cogumelos |
| bellCollector | Baltasar, Colecionador de Sinos |
| mothKeeper | Ofélia, Guardiã das Mariposas |
| charcoalBurner | Dário, Carvoeiro |
| wanderingTinker | Ada, Funileira Ambulante |
| marshTrapper | Gaspar, Caçador dos Brejos |
| ratCatcher | Tereza, Caça-Ratos |
| maskedPhysician | Severino, Médico da Máscara |
| shadowScholar | Erasmo, Estudioso da Própria Sombra |
| swampFerryman | Rúben, Barqueiro do Brejo |
| lostCourier | Lia, Mensageira Perdida |

Validation: `npm run typecheck`, `npm test` (63 passing), and `node --experimental-strip-types scripts/qa-encounter-npcs.mjs`. Browser QA verifies 48 distinct frames decode with transparency, animation visits every frame, dialogue survives editor conversion, and all newly placed NPCs are reachable.
