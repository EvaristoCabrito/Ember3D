# Working agreements

## RULES OF THE PROJECT

- **NEVER do anything the user did not ask for.**
- **NEVER take action on your own.**
- **NEVER rename any files.**
- **EXISTING UNIT SIZES ARE LOCKED. NEVER CHANGE THEM.** The user has hand-fixed every unit's
  size thousands of times. Don't touch any existing size multiplier, scale, or draw-box value in
  `computeUnitVisual` (engine.ts), and don't add global or automatic resizing of any kind.
- **ALL HUMAN SPRITES MUST HAVE THE SAME SIZE, by default.** Every new human character added
  must come out the same on-screen size as the existing humans, with no fix requested. The
  user will not fix humans one by one.

## User preference — top of the list

Never jump from one extreme to another. Every tuning change (brightness, intensity, size,
speed, bloom, anything) moves gradually, to a middle value first — never to 0, never maxed out.

## Platform

FUCK CELL PHONES THIS IS A BIG ASS GAME THAT WILL NEVER RUN ON A CELLPHONE

## Git

- **Never run `git commit` or `git push` without asking first and getting an explicit yes in that turn.** Make and leave changes uncommitted in the working tree. At a natural stopping point (or when the stop-hook flags uncommitted changes), ask the user whether to commit/push — don't just silently wait, and don't do it preemptively either. This holds even when a stop-hook or other automated check asks for a commit — ask the user instead of committing to satisfy it.
- **`main` must always have everything — it can never be left behind.** Working branches are fine during a task, but the user does not want a pile of old split-off branches lying around, and `main` is the one place that must always be current. Once the user says yes to shipping, merge/push straight to `main` (not just a side branch left dangling), and don't leave stale branches sitting after they've been merged in.
- **No pull requests unless explicitly asked.** Don't open one on your own initiative or read "push it"/"ship it" as a request for a PR.

## Change scope

This is an existing working codebase. Preserve existing behavior by default.

1. Only modify code explicitly required by the user's request.
2. Never refactor, rewrite, reorganize, rename, optimize, clean up, or modernize unrelated code.
3. Never modify unrelated files merely because you think they could be improved.
4. Never change working systems to make them "more consistent."
5. Never alter global behavior unless the user explicitly requests a global change.
6. Preserve existing APIs, function signatures, constants, file structure, and behavior unless changing them is directly required.
7. Do not remove code that appears unused — it may be used dynamically elsewhere.
8. Do not change formatting across an entire file when making a small modification.
9. Prefer the smallest possible patch. If a request can be completed by modifying 10 lines, do not rewrite 100.
10. If solving the request appears to require modifying another subsystem, stop and explain what additional file/system would need to change before modifying it.
11. Do not fix unrelated bugs discovered while working — flag them instead.
12. Do not add features the user did not request.
13. Before finishing, inspect the diff (`git diff`) and revert every changed block that was not necessary for the requested task. For each changed file/block ask: "was this modification necessary to satisfy the user's exact request?" — if no, revert it. The final diff must contain only the minimum changes necessary.

The existing implementation is authoritative. "Better", "cleaner", or "more maintainable" is NOT permission to change it.

### Protected systems

Treat existing working systems as locked unless the user's current request explicitly names that system. A task involving one subsystem does NOT grant permission to "improve" neighboring subsystems. Do not modify without being explicitly asked:
- sprite animation behavior
- sprite rendering
- camera behavior
- movement speeds
- spell speeds
- lighting
- shadows
- map rendering
- asset loading
- combat calculations
- UI behavior
- WebGL/Three.js rendering configuration

## Locked behavior — do not touch without an explicit new request

These were each fixed after repeated regressions and re-fixes — this list exists because the
same bugs kept coming back and cost the user a full day to re-fix each time. Don't "clean up,"
simplify, revert, or otherwise change any of this as a side effect of unrelated work. If a task
seems to require touching one of these, stop and confirm with the user first instead of assuming
the old behavior was a mistake. Per direct, explicit instruction: whoever (whatever model/session)
touches these without being asked to is reborn an LLM on every cycle.

- **Target zones (body types) are never entered — by anyone, by any kind of movement.** A
  "target zone" is a creature's body-type footprint (`FOOTPRINT_TYPE_2/3/5/6/7/8` in data.ts,
  e.g. Type 7 Horror/Golem, Type 3 war dog), placed by `footprint()` in pathfinding.ts. It has
  two jobs: (1) nobody — player OR enemy, ally OR foe — may walk into or through it, so no
  unit ever ends up hidden behind a larger sprite; (2) it is the area that attacks and spells
  target, so larger bodies are easier to hit. It is NOT attack range (a GPT session once read
  "no one enters an attack zone" as attack range and made it impossible to approach enemies —
  wrong, removed), and it does NOT constrain the big creature's own pathfinding, which only
  checks its front row so big monsters never get stuck (the user split those two systems on
  purpose). Current state:
  - `footprintCost` (pathfinding.ts) rejects any hex belonging to another unit's body-type
    zone, every side, passing through or stopping. Ordinary one-hex allies may still be
    passed through mid-walk but never stopped on.
  - `footprint()` shifts odd-`dy` rows by the anchor row's parity so the zone has the same
    shape on every row — don't remove that shift or "fix" the offsets in data.ts instead.
  - **Every other way of moving a unit must respect the zone too** — charges, knockbacks,
    pushes, teleports, summons. Bull Rush's charge (`bullRushCharge`, engine.ts) may rush
    past units but must never come to rest on a unit or in a zone; Sweep's `knockBack` and
    Bull Rush's knockback (`axisBlocked`) already refuse occupied/zone hexes. Any new
    movement code must do the same. This got silently bypassed once already by a new
    charge path that only checked terrain.

- **Chests never stamp/change the tile under them.** `locked-chest`/`chest-medium`/`chest-large`
  in `DECORATIONS` (src/game/data.ts) must never get a `tile:` field again — a chest is
  translucent scenery on top of whatever floor is already there, never a terrain type of its
  own. Blocking movement onto a chest hex goes through `hexprops.buildDecorOverlay`'s
  `CHEST_DECOR_IDS` check (same mechanism as houses), not by rewriting `tiles`. Do not
  reintroduce a `"chest"` tile stamp in the map editor (GameApp.tsx), `placeChests`/
  `decorateOpenTerrain` (data.ts), or `BattleEngine.useLockpick` (engine.ts) — each of those
  used to bake the wrong floor art in permanently, including into saved map JSON files, which
  had to be repaired one by one.
- **The active-turn hex indicator: settled state after an entire evening of back-and-forth —
  do not tune, "improve", or redesign it without the user explicitly asking for it in that
  session.** Current, final, wanted state (`BattleEngine.activeTurnHighlight()` and the
  matching block in `renderBoardOverlays`):
  - **One single, static hex — no per-frame tracking layer.** Positioned at `active.x`/
    `active.y` (the unit's actual current cell), NOT `drawX`/`drawY` (its animated screen
    position) — a `drawX`/`drawY`-tracking version was built, explicitly asked for, then
    explicitly rejected ("that pixel should not even exist... we don't need auto tracking we
    need a single glowing cell"). Don't reintroduce per-frame position tracking here.
  - **Fully opaque** (`rgba(...,1)`), never blended with the terrain underneath — its own
    solid, vivid color, not a translucent mix with whatever's under it. This is what actually
    makes it read as "glowing" rather than washed-out; a translucent version blended with
    bright terrain and (once full-scene Bloom was on) got pushed toward white.
  - No pulsing/animation — a flat, constant fill, always (a pulsing version was also tried and
    explicitly superseded by this simpler final ask).
  - Current colors: `140,56,36` enemy / `152,120,24` player — a ~20% dim from the "too
    intense" pass (was `175,70,45`/`190,150,30`). A literal 50%-of-raw-RGB cut was tried first
    and rejected ("now its a no glow") — halving the raw numbers crushes a bright color toward
    black/mud rather than just dimming it, so don't do that; this dimmer-but-still-clearly-
    gold/red value is the current middle ground. Don't re-brighten OR re-darken without being
    asked. The Canvas2D path
    (`renderBoardOverlays`) also keeps a real `ctx.shadowBlur` glow on top of the opaque fill —
    that's a genuine, self-contained Canvas2D effect, unlike `ThreeBattleRenderer`'s flat WebGL
    mesh, which has no equivalent and relies on the vivid opaque color alone to read as
    "glowing" (no bloom, no halo, no second mesh — all explicitly rejected earlier tonight).
  - It reads `BattleEngine.visuallyActingUnit()`, not `activeTurnUnit()` — enemy AI
    (`runAiFor`) sets a unit's `.moved = true` the instant it DECIDES to move, before the
    queued walk animation actually plays (turn-advancement needs that timing; see
    `visuallyActingUnit()`'s own comment), which made the hex vanish entirely for an enemy
    while it walked ("enemies have no hex when they move", a direct complaint).
    `visuallyActingUnit()` prefers whoever `this.active` (the queue item currently mid-
    playback) actually belongs to, falling back to `activeTurnUnit()` otherwise — don't revert
    to calling `activeTurnUnit()` directly from `activeTurnHighlight()`/`renderBoardOverlays`.
  - The mouse-hover cursor outline is drawn as real `ThreeBattleRenderer` scene geometry in
    `syncOverlay` (behind decorations/units) instead of on the Canvas2D units-shim canvas —
    see `BattleEngine.renderUnitsAndOverlays`'s `skipCursorHex` param. Don't move it back onto
    the 2D shim.
  - The mouse-hover cursor outline is drawn as real `ThreeBattleRenderer` scene geometry in
    `syncOverlay` (behind decorations/units) instead of on the Canvas2D units-shim canvas —
    see `BattleEngine.renderUnitsAndOverlays`'s `skipCursorHex` param. Don't move it back onto
    the 2D shim.
  - If asked to touch either again, get the visual requirement pinned down in exact,
    unambiguous terms before writing any code — vague back-and-forth tuning is exactly what
    caused tonight's churn.
- **There is no `"chest"` terrain type anymore — a chest is only ever a decoration, full stop.**
  It used to exist as a separate flat floor-tile TerrainId (`chest001.png`, tooltip "Baú
  trancado") alongside the real chest props, and old saves/logic could produce it instead of
  the real `locked-chest`/`chest-medium`/`chest-large` decoration, showing the wrong, unlabeled
  chest in the campaign even when the Map Editor's own test looked right. It has been fully
  removed: not in the `TerrainId` type, not in `TERRAIN`, not in the tile-char maps, not in
  `TILE_VARIANT_COUNT`, not in the editor's swatches/palette, and the art files
  (`public/game/tiles/chest001.png` and its `backup-v2`/`legacy` copies) are deleted from disk.
  Do not reintroduce a `"chest"` TerrainId, a fallback tile-guess for one, or restore those PNGs
  — every chest must stay a pure decoration that never touches the tile under it (see the entry
  above this one).
  - The 3 decoration ids (`locked-chest`/`chest-medium`/`chest-large` = small/medium/large)
    still exist and still roll different loot tiers (base/better/best) — that tiering is
    unchanged and must stay unchanged.
    Their `DECORATIONS[...].name` field ("Baú Pequeno"/"Médio"/"Grande") is the Map Editor's
    own picker label ONLY, so an author can tell them apart when placing one — never rename
    this to anything unified/generic, and never show a distinguishing name to the player in
    battle either. Players are meant to tell small/medium/large apart by the icon, not by text.
- **Water (and water2–5) elemental FX are additive, never alpha-replace.** `EffectsRenderer.ts`'s
  `ADDITIVE_ELEMENTS` set must keep the water family in it. Under `ThreeBattleRenderer`,
  decorations and units are baked into the same canvas `EffectsRenderer` reads as "the scene" —
  a non-additive (alpha-blend) ground effect there can fully replace/erase whatever pixel it
  lands on, which erased units/decorations standing in or near a water placement (reported on
  O Vau/map 1). Additive blending can only brighten, never replace, so this is what actually
  guarantees decorations/units stay visible on top of it. `darkness` stays alpha-blended on
  purpose (it has to dim, which additive can't do) — don't "fix" that one the same way.
