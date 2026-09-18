import { useEffect, useRef } from "react";
import type { BattleEngine } from "./engine";
import { EffectsRenderer } from "./gfx/EffectsRenderer";
import type { HudSnapshot } from "./types";

export function BattleCanvas({
  engine,
  onHud,
  paused = false,
  onTileReadout,
}: {
  engine: BattleEngine;
  onHud: (hud: HudSnapshot) => void;
  paused?: boolean;
  /** Fires when the pointer has settled on one tile long enough to be asking about it, so
   * the caller can show what that terrain does. With a mouse that is the cursor resting
   * still; on touch, where there is no hover, it is a press held in place. Called with
   * false as soon as the pointer moves off, lifts, or leaves the canvas. */
  onTileReadout?: (showing: boolean) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fxCanvasRef = useRef<HTMLCanvasElement>(null);
  const strikeCanvasRef = useRef<HTMLCanvasElement>(null);
  const unitsCanvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const hudKey = useRef("");

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Units, HP bars, particles and foreground decorations get their own transparent canvas
    // stacked ABOVE the FX canvas (see below), instead of being part of the ground canvas the
    // FX layer reads as its "scene" — otherwise a unit or decoration standing on/near a Water
    // placement would already be baked into that snapshot, and the FX canvas (a separate DOM
    // layer stacked on top of everything) would paint straight over it every frame regardless
    // of draw order. Splitting the ground and unit passes onto their own canvases (see
    // BattleEngine.renderGround/renderUnitsAndOverlays) puts a real layer boundary between them.
    const unitsCanvas = unitsCanvasRef.current;
    const unitsCtx = unitsCanvas?.getContext("2d") ?? null;
    (window as Window & { __emberEngine?: BattleEngine }).__emberEngine = engine;

    // Permanent map-authored elemental FX (lava fire, icy glints, ...) placed in the editor's
    // "FX" mode — a WebGL2 overlay that uploads the ground canvas as its "scene" texture and
    // draws the placements on top of the ground only; units/overlays are drawn afterward on
    // their own canvas above this one. Nothing to do with spell casting: it only ever plays
    // what the map author placed. Degrades to plain 2D (this canvas stays visible, overlay
    // hidden) if WebGL2 isn't available.
    let fx: EffectsRenderer | null = null;
    let strikeFx: EffectsRenderer | null = null;
    const fxCanvas = fxCanvasRef.current;
    const strikeCanvas = strikeCanvasRef.current;
    if (fxCanvas) {
      try {
        fx = new EffectsRenderer(fxCanvas);
        for (const p of engine.elementalFxPlacements) fx.spawnEffect(p.kind, p.x, p.y, { radiusTiles: p.radiusTiles, rotation: p.rotation });
      } catch (err) {
        console.error("[ember] WebGL2 map FX failed", err);
        fx = null;
        fxCanvas.style.display = "none";
      }
    }
    if (strikeCanvas) {
      try {
        strikeFx = new EffectsRenderer(strikeCanvas, { overlay: true });
        engine.preferGpuLightning = true;
      } catch (err) {
        console.error("[ember] WebGL2 lightning overlay failed", err);
        strikeFx = null;
        strikeCanvas.style.display = "none";
        engine.preferGpuLightning = false;
      }
    }

    let raf = 0;
    let last = performance.now();
    let running = true;
    let dragging = false;
    let dragged = false;
    let mouseDown = false;
    let lastX = 0;
    let lastY = 0;
    // Mouse hold-and-grab-to-pan: the button must stay down this long before a drag counts
    // as panning, so a quick click near a unit/tile never gets swallowed by a small
    // incidental jitter. mouseStartX/Y anchor the "moved far enough since the press" check;
    // lastX/Y (above) are updated every move so the pan itself only ever applies one frame's
    // delta, never a jump built up while waiting to arm.
    const MOUSE_PAN_HOLD_MS = 650;
    let mouseArmed = false;
    let mouseStartX = 0;
    let mouseStartY = 0;
    let mouseHoldTimer: number | null = null;
    const held = new Set<string>();
    const pointers = new Map<number, { x: number; y: number }>();
    // Press-and-hold on a tile reads out its terrain. It has to coexist with dragging the
    // camera, so the timer is armed on every press and cancelled the moment the pointer
    // travels far enough to count as a pan.
    let holdTimer: number | null = null;
    let holding = false;
    const cancelHold = () => {
      if (holdTimer !== null) {
        window.clearTimeout(holdTimer);
        holdTimer = null;
      }
      if (holding) {
        holding = false;
        onTileReadout?.(false);
      }
    };
    const armReadout = (px: number, py: number, delay: number) => {
      cancelHold();
      if (paused) return;
      holdTimer = window.setTimeout(() => {
        holdTimer = null;
        holding = true;
        engine.pointerMove(px, py); // point the hover at that tile so the HUD describes it
        onTileReadout?.(true);
      }, delay);
    };
    let pinchDist = 0;
    let pinched = false;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      if (fxCanvas) {
        fx?.resize(w, h, dpr);
        fxCanvas.style.width = `${w}px`;
        fxCanvas.style.height = `${h}px`;
      }
      if (strikeCanvas) {
        strikeFx?.resize(w, h, dpr);
        strikeCanvas.style.width = `${w}px`;
        strikeCanvas.style.height = `${h}px`;
      }
      if (unitsCanvas) {
        unitsCanvas.width = Math.max(1, Math.floor(w * dpr));
        unitsCanvas.height = Math.max(1, Math.floor(h * dpr));
        unitsCanvas.style.width = `${w}px`;
        unitsCanvas.style.height = `${h}px`;
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const loop = (now: number) => {
      if (!running) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!paused) {
        const speed = 520;
        let px = 0;
        let py = 0;
        if (held.has("ArrowLeft") || held.has("KeyA")) px -= 1;
        if (held.has("ArrowRight") || held.has("KeyD")) px += 1;
        if (held.has("ArrowUp") || held.has("KeyW")) py -= 1;
        if (held.has("ArrowDown") || held.has("KeyS")) py += 1;
        if (px || py) {
          const mag = Math.hypot(px, py) || 1;
          engine.panBy((px / mag) * speed * dt, (py / mag) * speed * dt);
        }
        engine.tick(dt);
      }
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      engine.renderGround(ctx, wrap.clientWidth, wrap.clientHeight, dpr);
      // Skip the whole FX pipeline (scene upload, light/effects/bloom FBO passes) whenever
      // the map has no elemental placements, so an ordinary fight never pays for it.
      if (fx) {
        if (fx.hasEffects()) {
          if (fxCanvas) fxCanvas.style.display = "block";
          fx.render(canvas, dt, (col, row) => engine.effectAnchor(col, row));
        } else if (fxCanvas) {
          fxCanvas.style.display = "none";
        }
      }
      if (strikeFx) {
        for (const s of engine.drainGpuFx()) {
          if (s.kind === "lightning") {
            const tall = s.power === "t3" ? 4.1 : s.power === "raio" ? 3.35 : 2.4;
            const wide = s.power === "t3" ? 0.95 : s.power === "raio" ? 0.72 : 0.55;
            strikeFx.spawnEffect("lightning", s.x, s.y, {
              duration: s.duration,
              radiusTiles: s.power === "t3" ? 2.35 : s.power === "raio" ? 1.85 : 1.4,
              aspect: [wide, tall],
            });
          } else if (s.kind === "fireball") {
            if (s.role === "blast") {
              strikeFx.spawnEffect("fire", s.x, s.y, {
                duration: s.duration,
                radiusTiles: s.center ? 2.45 : 1.7,
                aspect: [1.2, 1.2],
              });
            } else {
              strikeFx.spawnEffect("fire", s.x, s.y, {
                duration: s.duration,
                radiusTiles: s.center ? 1.28 : 1.05,
                aspect: [1, 0.92],
              });
            }
          } else if (s.kind === "magicMissile") {
            if (s.role === "bolt") {
              strikeFx.spawnEffect("holy", s.toX, s.toY, {
                duration: s.duration + 0.05,
                radiusTiles: 0.9,
                aspect: [1.9, 0.4],
                fromCol: s.fromX,
                fromRow: s.fromY,
                travel: s.duration,
                variant: 1,
                color: [0.78, 0.4, 1.0],
              });
            } else {
              strikeFx.spawnEffect("holy", s.x, s.y, {
                duration: s.duration,
                radiusTiles: 1.4,
                aspect: [1.15, 1.15],
                variant: 2,
                color: [0.92, 0.55, 1.0],
              });
            }
          } else if (s.kind === "webOfDreams") {
            if (s.role === "bolt") {
              strikeFx.spawnEffect("holy", s.toX, s.toY, {
                duration: s.duration + 0.06,
                radiusTiles: 0.95,
                aspect: [2.05, 0.48],
                fromCol: s.fromX,
                fromRow: s.fromY,
                travel: s.duration,
                variant: 3,
                color: [0.62, 0.32, 0.95],
              });
            } else {
              strikeFx.spawnEffect("holy", s.x, s.y, {
                duration: s.duration,
                radiusTiles: s.center ? 1.35 : 1.08,
                aspect: [1.15, 0.72],
                variant: 4,
                color: [0.7, 0.38, 0.98],
              });
            }
          } else if (s.kind === "causticVenom") {
            const acid: [number, number, number] = [0.45, 1.0, 0.18];
            if (s.role === "bolt") {
              strikeFx.spawnEffect("acid", s.toX, s.toY, {
                duration: s.duration + 0.05,
                radiusTiles: 0.95,
                aspect: [1.7, 0.55],
                fromCol: s.fromX,
                fromRow: s.fromY,
                travel: s.duration,
                variant: 1,
                color: acid,
              });
            } else if (s.role === "splash") {
              strikeFx.spawnEffect("acid", s.x, s.y, {
                duration: s.duration,
                radiusTiles: s.center ? 2.35 : 1.65,
                aspect: [1.2, 1.15],
                color: acid,
              });
            } else {
              strikeFx.spawnEffect("acid", s.x, s.y, {
                duration: s.duration,
                radiusTiles: s.center ? 1.22 : 1.02,
                aspect: [1.05, 0.72],
                color: acid,
              });
            }
          } else if (s.kind === "melee") {
            const steel: [number, number, number] = [0.82, 0.9, 1.0];
            if (s.style === "thrust") {
              strikeFx.spawnEffect("holy", s.toX, s.toY, {
                duration: s.duration + 0.04,
                radiusTiles: 0.85,
                aspect: [2.1, 0.32],
                fromCol: s.fromX,
                fromRow: s.fromY,
                travel: s.duration,
                variant: 1,
                color: steel,
              });
            } else if (s.style === "ring") {
              strikeFx.spawnEffect("holy", s.x, s.y, {
                duration: s.duration,
                radiusTiles: 2.15,
                aspect: [1.15, 0.7],
                variant: 6,
                color: steel,
              });
            } else {
              const arc = s.style === "arc" || s.style === "smash";
              const a = engine.effectAnchor(s.fromX, s.fromY);
              const b =
                arc && s.toX != null && s.toY != null
                  ? engine.effectAnchor(s.toX, s.toY)
                  : engine.effectAnchor(s.x, s.y);
              const rot = Math.atan2(b.y - a.y, b.x - a.x) + (s.rotOffset ?? 0);
              strikeFx.spawnEffect("holy", s.x, s.y, {
                duration: s.duration,
                radiusTiles: arc ? 2.35 : s.style === "trip" ? 1.15 : 1.35,
                aspect: s.style === "trip" ? [1.6, 0.32] : arc ? [2.55, 0.7] : [1.7, 0.42],
                rotation: rot,
                variant: 5,
                color: s.style === "smash" ? [0.95, 0.88, 0.72] : steel,
              });
            }
          }
        }
        if (strikeFx.hasEffects()) {
          if (strikeCanvas) strikeCanvas.style.display = "block";
          strikeFx.render(canvas, dt, (col, row) => engine.effectAnchor(col, row));
        } else if (strikeCanvas) {
          strikeCanvas.style.display = "none";
        }
      }
      // Drawn on its own transparent canvas above the FX layer, so units/HP-bars/foreground
      // decorations always read in front of a Water/Fire/etc placement instead of being
      // whatever the FX's snapshot happened to catch underneath it.
      if (unitsCtx && unitsCanvas) {
        unitsCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        unitsCtx.clearRect(0, 0, wrap.clientWidth, wrap.clientHeight);
        engine.renderUnitsAndOverlays(unitsCtx, wrap.clientWidth, wrap.clientHeight);
      }
      const hud = engine.getHud();
      const k = [
        hud.mode,
        hud.phase,
        hud.selected?.id,
        hud.canAttack,
        hud.banner,
        hud.result,
        hud.turn,
        hud.playerAlive,
        hud.enemyAlive,
        hud.forecast?.defender,
        hud.forecast?.dmgOut,
        hud.inspected?.id,
        hud.pendingFoe?.id,
        hud.selected?.hp,
        hud.selected?.fullness,
        hud.inspected?.fullness,
        hud.inspected?.hp,
        hud.selected?.bag.mid,
        hud.selected?.bag.weak,
        hud.selected?.bag.potent,
        hud.selected?.bag.disease,
        hud.tip,
        // Terrain inspection changes while the cursor rests over the board. It must be part
        // of the HUD identity; otherwise React keeps the first hovered hex (usually plains)
        // even though the engine has already resolved the actual tile underneath the cursor.
        hud.terrain
          ? `${hud.terrain.id}:${hud.terrain.name}:${hud.terrain.moveCost}:${hud.terrain.def}:${hud.terrain.atk}:${hud.terrain.passable ? 1 : 0}:${hud.terrain.blocksShot ? 1 : 0}:${hud.terrain.hazard ?? ""}:${hud.terrain.note ?? ""}:${hud.terrain.spellZone ? `${hud.terrain.spellZone.kind}:${hud.terrain.spellZone.roundsLeft}` : ""}`
          : "no-terrain",
        hud.zoom,
        hud.speedMode,
        hud.winAvailable,
        hud.spellReady,
        hud.turnQueue.find((q) => q.active)?.id,
        hud.turnQueue.map((q) => (q.acted ? "1" : "0")).join(""),
        hud.chestLoot ? `${hud.chestLoot.unitName}:${hud.chestLoot.ember}:${hud.chestLoot.items.map((i) => i.name).join(",")}` : null,
        hud.pendingDialog ? `${hud.pendingDialog.id}` : null,
      ].join("|");
      if (k !== hudKey.current) {
        hudKey.current = k;
        onHud(hud);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const pos = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onDown = (e: PointerEvent) => {
      if (paused) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const p = pos(e);
      if (e.pointerType === "mouse") {
        if (engine.getHud().mode === "awaitSpell") {
          engine.pointerDown(p.x, p.y, "click");
          return;
        }
        // Deferred to pointerup, same as touch: a held-and-dragged mouse pans the
        // camera (see onMove/onUp) instead of immediately acting on the down-press.
        mouseDown = true;
        dragging = true;
        dragged = false;
        mouseArmed = false;
        mouseStartX = e.clientX;
        mouseStartY = e.clientY;
        lastX = e.clientX;
        lastY = e.clientY;
        canvas.setPointerCapture(e.pointerId);
        canvas.style.cursor = "grabbing";
        if (mouseHoldTimer !== null) window.clearTimeout(mouseHoldTimer);
        mouseHoldTimer = window.setTimeout(() => {
          mouseHoldTimer = null;
          mouseArmed = true;
        }, MOUSE_PAN_HOLD_MS);
        return;
      }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      canvas.setPointerCapture(e.pointerId);
      if (pointers.size >= 2) {
        const pts = [...pointers.values()];
        pinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        pinched = true;
        dragging = false;
        dragged = true;
        return;
      }
      dragging = true;
      dragged = false;
      lastX = e.clientX;
      lastY = e.clientY;
      armReadout(p.x, p.y, 420);
      if (engine.getHud().mode === "awaitSpell") {
        engine.pointerMove(p.x, p.y);
      }
    };
    const onMove = (e: PointerEvent) => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size >= 2 && pinchDist > 0) {
        const pts = [...pointers.values()];
        const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (d > pinchDist * 1.22) {
          engine.cycleZoom(1);
          pinchDist = d;
        } else if (d < pinchDist * 0.82) {
          engine.cycleZoom(-1);
          pinchDist = d;
        }
        return;
      }
      const p = pos(e);
      const spell = engine.getHud().mode === "awaitSpell";
      // Resting the cursor on a tile asks about it. Every movement restarts the clock, so
      // this only fires once the pointer actually stops — no button involved.
      if (e.pointerType === "mouse" && !mouseDown) armReadout(p.x, p.y, 650);
      if (e.pointerType === "mouse" && mouseDown) {
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        if (!dragged && mouseArmed && Math.hypot(e.clientX - mouseStartX, e.clientY - mouseStartY) > 3) {
          dragged = true;
          cancelHold();
        }
        if (dragged) engine.panBy(-dx, -dy);
        lastX = e.clientX;
        lastY = e.clientY;
        return;
      }
      if (dragging && e.pointerType !== "mouse" && !spell) {
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        if (Math.abs(dx) + Math.abs(dy) > 3) {
          dragged = true;
          cancelHold();
        }
        if (dragged) {
          engine.panBy(-dx, -dy);
          lastX = e.clientX;
          lastY = e.clientY;
        }
      } else {
        if (dragging && e.pointerType !== "mouse" && spell) {
          const dx = e.clientX - lastX;
          const dy = e.clientY - lastY;
          if (Math.abs(dx) + Math.abs(dy) > 10) dragged = true;
        }
        engine.pointerMove(p.x, p.y);
      }
    };
    const onUp = (e: PointerEvent) => {
      const wasHolding = holding;
      cancelHold();
      if (e.pointerType === "mouse") {
        canvas.style.cursor = "";
        if (mouseHoldTimer !== null) {
          window.clearTimeout(mouseHoldTimer);
          mouseHoldTimer = null;
        }
        mouseArmed = false;
        if (!mouseDown) return;
        mouseDown = false;
        dragging = false;
        if (!dragged && !paused && !wasHolding) {
          const p = pos(e);
          engine.pointerDown(p.x, p.y, "click");
        }
        dragged = false;
        return;
      }
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinchDist = 0;
      if (pinched) {
        if (pointers.size === 0) pinched = false;
        dragging = false;
        return;
      }
      if (!dragging) return;
      dragging = false;
      if (!dragged && !paused && !wasHolding) {
        const p = pos(e);
        engine.pointerDown(p.x, p.y, "tap");
      }
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      engine.cycleZoom(e.deltaY > 0 ? -1 : 1);
    };
    const onKey = (e: KeyboardEvent) => {
      if (paused) return;
      const trap = [
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "Space",
        "Enter",
        "Escape",
        "KeyE",
        "KeyZ",
        "KeyW",
        "KeyA",
        "KeyS",
        "KeyD",
      ];
      if (trap.includes(e.code)) e.preventDefault();
      held.add(e.code);
      if (
        e.code === "ArrowLeft" ||
        e.code === "ArrowRight" ||
        e.code === "ArrowUp" ||
        e.code === "ArrowDown" ||
        e.code === "KeyW" ||
        e.code === "KeyA" ||
        e.code === "KeyS" ||
        e.code === "KeyD"
      ) {
        return;
      }
      engine.keyDown(e.code);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      held.delete(e.code);
    };

    const onMenu = (e: MouseEvent) => {
      e.preventDefault();
      if (paused) return;
      const hud = engine.getHud();
      const showAct =
        hud.mode === "awaitAction" || hud.mode === "awaitAttack" || hud.mode === "selected" || hud.mode === "awaitSpell";
      if (!showAct || hud.busy) return;
      engine.cancel();
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("pointerleave", cancelHold);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("contextmenu", onMenu);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      cancelHold();
      if (mouseHoldTimer !== null) window.clearTimeout(mouseHoldTimer);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointerleave", cancelHold);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("contextmenu", onMenu);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      const w = window as Window & { __emberEngine?: BattleEngine };
      if (w.__emberEngine === engine) delete w.__emberEngine;
      fx?.dispose();
      strikeFx?.dispose();
      engine.preferGpuLightning = false;
    };
  }, [engine, onHud, paused]);

  return (
    <div ref={wrapRef} className="relative h-full w-full min-h-0 touch-none">
      <canvas ref={canvasRef} className="block h-full w-full touch-none" />
      <canvas ref={fxCanvasRef} className="pointer-events-none absolute inset-0 block h-full w-full touch-none" style={{ display: "none" }} />
      <canvas ref={unitsCanvasRef} className="pointer-events-none absolute inset-0 block h-full w-full touch-none" />
      <canvas ref={strikeCanvasRef} className="pointer-events-none absolute inset-0 block h-full w-full touch-none" style={{ display: "none", mixBlendMode: "plus-lighter" }} />
    </div>
  );
}
