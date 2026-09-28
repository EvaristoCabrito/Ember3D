import { type PointerEvent, useEffect, useRef, useState } from "react";
import { placedFootprint } from "./data";
import { BattleEngine, ZOOM_RADII } from "./engine";
import { EffectsRenderer } from "./gfx/EffectsRenderer";
import { WebGL2DRenderer } from "./gfx/WebGL2DRenderer";
import type { GameArt, Mission } from "./types";

export type PreviewUnitSelection = {
  side: "playerSpawns" | "enemySpawns" | "neutralSpawns";
  index: number;
  name: string;
};

export type PreviewDecorationSelection = { id: string; x: number; y: number; rot?: number };

// The technical map is a native scroll surface; keep preview scrollbar travel deliberately gentler.
const PREVIEW_SCROLL_PAN_RATE = 0.45;
const PREVIEW_ZOOM_MIN = 0.75;
// CODER-ONLY: DO NOT MESS WITH CONTROLS. Preserve left-button hold for 0.5 seconds,
// then show the grabbing hand and pan on drag. Never display this warning in the UI.
const PREVIEW_PAN_HOLD_MS = 500;

/** A read-only window onto the map exactly as the real battle would render it — same tile
 * art, same decoration art, same unit sprites — instead of the paint grid's flat color
 * swatches. Builds a throwaway BattleEngine from the current draft and only ever calls its
 * render(), never tick(): no animation loop, no AI, no turns — just a live snapshot that
 * redraws whenever the mission prop changes (the caller debounces that) or the panel resizes.
 * A left click can use the current editor brush directly; gameplay state remains untouched. */
export function MapPreviewCanvas({
  mission,
  art,
  onCellClick,
  selectedDecorationId,
  selectedPlacedDecoration,
  onUnitSelect,
  onHeldUnitDelete,
  onUnitPlace,
  onDecorationSelect,
  onDecorationPlace,
}: {
  mission: Mission;
  art: GameArt;
  onCellClick?: (x: number, y: number) => void;
  selectedDecorationId?: string;
  selectedPlacedDecoration?: PreviewDecorationSelection | null;
  onUnitSelect?: (unit: PreviewUnitSelection) => void;
  /** Delete is deliberate: it only applies while the author is holding a placed unit. */
  onHeldUnitDelete?: (unit: PreviewUnitSelection) => void;
  onUnitPlace?: (unit: PreviewUnitSelection, x: number, y: number) => void;
  /** Right-click-drag pickup, mirroring onUnitSelect for units: fires as soon as an existing
   * placement is grabbed, before it's known where it'll be dropped. */
  onDecorationSelect?: (decoration: PreviewDecorationSelection) => void;
  onDecorationPlace?: (decoration: PreviewDecorationSelection, x: number, y: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fxCanvasRef = useRef<HTMLCanvasElement>(null);
  const unitsCanvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<BattleEngine | null>(null);
  const redrawRef = useRef<(() => void) | null>(null);
  const armTimerRef = useRef<number | null>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; startX: number; startY: number; armed: boolean; moved: boolean } | null>(null);
  // moved stays false for a plain right-click (press and release without dragging) — that's
  // a pick-up-and-hold, not a move, so releasing the button must not drop the unit back onto
  // the board. Only a real drag past the threshold (see onPointerMove) arms a drop on release.
  const unitDragRef = useRef<{ pointerId: number; unit: PreviewUnitSelection; startX: number; startY: number; moved: boolean } | null>(null);
  const decorationDragRef = useRef<{ pointerId: number; decoration: PreviewDecorationSelection } | null>(null);
  const cameraRef = useRef<{ x: number; y: number; missionId: string; tile: number; viewW: number; viewH: number } | null>(null);
  /** CSS pixels divided by this value become preview-engine logical pixels. This preserves
   * the requested zoom while keeping the engine on one of its supported tile sizes. */
  const renderScaleRef = useRef(1);
  const verticalScrollTopRef = useRef(0);
  const horizontalScrollLeftRef = useRef(0);
  const verticalScrollInitializedRef = useRef(false);
  // Start at a true 75% scale. Large maps extend beyond the viewport and can be panned.
  const [zoom, setZoom] = useState(PREVIEW_ZOOM_MIN);
  const [isPanning, setIsPanning] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  // Map the percentage control to an actual rendered tile size relative to the game's 34px
  // default. The engine renders at its nearest supported radius; the canvas scale supplies
  // the exact percentage between those discrete sizes.
  const targetTileRadius = 34 * zoom;
  const previewZoomLevel = ZOOM_RADII.reduce((best, radius, index) =>
    Math.abs(radius - targetTileRadius) < Math.abs(ZOOM_RADII[best]! - targetTileRadius) ? index : best, 0);
  const previewTileRadius = ZOOM_RADII[previewZoomLevel]!;
  const previewRenderScale = targetTileRadius / previewTileRadius;
  const previewBoardWidth = Math.ceil(previewTileRadius * Math.sqrt(3) * (mission.cols + 0.5) * previewRenderScale);
  // Keep this in step with BattleEngine.boardSize, including vertical breathing room.
  const previewBoardHeight = Math.ceil(previewTileRadius * (1.5 * (mission.rows - 1) + 4.4) * previewRenderScale);
  // Scrolling only moves the camera at PREVIEW_SCROLL_PAN_RATE of the raw scroll delta (a
  // deliberately gentler feel than the technical grid's native scroll), so the scrollable
  // range has to be inflated by the same factor — otherwise dragging the scrollbar all the
  // way to an edge still pans the camera only a fraction of the way to the board's real edge,
  // and the far side of any map bigger than a couple of screens is simply unreachable.
  const previewScrollWidth = Math.ceil(previewBoardWidth / PREVIEW_SCROLL_PAN_RATE);
  const previewScrollHeight = Math.ceil(previewBoardHeight / PREVIEW_SCROLL_PAN_RATE);
  const unitAt = (x: number, y: number): PreviewUnitSelection | null => {
    const groups = [
      { side: "playerSpawns" as const, units: mission.playerSpawns },
      { side: "enemySpawns" as const, units: mission.enemySpawns },
      { side: "neutralSpawns" as const, units: mission.neutralSpawns ?? [] },
    ];
    for (const group of groups) {
      const index = group.units.findIndex((unit) => unit.x === x && unit.y === y);
      if (index >= 0) return { side: group.side, index, name: group.units[index]!.name };
    }
    return null;
  };
  const decorationAt = (x: number, y: number): PreviewDecorationSelection | null => {
    const hit = (mission.decorations ?? []).find((p) => placedFootprint(p).some((f) => p.x + f.dx === x && p.y + f.dy === y));
    return hit ? { id: hit.id, x: hit.x, y: hit.y, rot: hit.rot } : null;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const viewport = viewportRef.current;
    if (!canvas || !viewport) return;
    // Same WebGL2D wrapper BattleCanvas renders through (see WebGL2DRenderer) rather than a
    // native CanvasRenderingContext2D — the engine's render methods lean on wrapper-only
    // extensions like drawImageLit for sprite relighting that a plain 2d context doesn't have.
    let ctx: WebGL2DRenderer;
    try {
      ctx = new WebGL2DRenderer(canvas);
    } catch {
      return;
    }
    // See BattleCanvas for why: units/foreground decorations get their own transparent
    // canvas above the FX layer, so a Water/Fire/etc placement can't paint over them
    // regardless of draw order.
    const unitsCanvas = unitsCanvasRef.current;
    let unitsCtx: WebGL2DRenderer | null = null;
    if (unitsCanvas) {
      try {
        unitsCtx = new WebGL2DRenderer(unitsCanvas);
      } catch {
        unitsCtx = null;
      }
    }

    let engine: BattleEngine;
    try {
      // The editor is an authoring surface, not a play session: even when a draft opts into
      // fog for the actual battle, its preview must expose every tile, prop, and spawn.
      // Keep this override local to the throwaway preview engine so playtests and gameplay
      // still honor the mission's saved fog setting.
      engine = new BattleEngine({ ...mission, fog: false }, art, { hp: {}, levels: {} }, 1);
      // Keep the canvas the size of the window. The BattleEngine owns the real
      // camera, so dragging moves the board rather than an oversized empty canvas.
      engine.setZoom(previewZoomLevel);
      // Keep a small edge rim so the preview can pan without opening onto a half-window of
      // empty space when the party's starting hex is near the board boundary.
      engine.setPreviewPanMargin(3);
      engineRef.current = engine;
    } catch {
      return;
    }
    let needsCameraRestore = cameraRef.current?.missionId === mission.id;
    let needsInitialCenter = !needsCameraRestore;

    // Live preview of any elemental FX placed on this map (see the editor's "FX" mode) —
    // same pipeline BattleCanvas uses, spawned once here as persistent instances so the
    // author can see exactly what will play once the mission loads for real.
    let fx: EffectsRenderer | null = null;
    const fxCanvas = fxCanvasRef.current;
    if (fxCanvas) {
      try {
        fx = new EffectsRenderer(fxCanvas);
        for (const p of engine.elementalFxPlacements) fx.spawnEffect(p.kind, p.x, p.y, { radiusTiles: p.radiusTiles, rotation: p.rotation });
      } catch {
        fx = null;
      }
    }
    let lastFrame = performance.now();

    const draw = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.floor(viewport.clientWidth));
      const h = Math.max(1, Math.floor(viewport.clientHeight));
      if (w <= 0 || h <= 0) return;
      // Keep the requested zoom percentage independent of map dimensions. The canvas is
      // rendered at the engine's nearest tile size, then scaled to the exact selected zoom.
      const renderW = Math.ceil(w / previewRenderScale);
      const renderH = Math.ceil(h / previewRenderScale);
      renderScaleRef.current = previewRenderScale;
      canvas.width = Math.max(1, Math.floor(renderW * dpr));
      canvas.height = Math.max(1, Math.floor(renderH * dpr));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setSize(canvas.width, canvas.height);
      if (unitsCanvas && unitsCtx) {
        unitsCanvas.width = Math.max(1, Math.floor(renderW * dpr));
        unitsCanvas.height = Math.max(1, Math.floor(renderH * dpr));
        unitsCanvas.style.width = `${w}px`;
        unitsCanvas.style.height = `${h}px`;
        unitsCtx.setSize(unitsCanvas.width, unitsCanvas.height);
      }
      const drawGroundAndUnits = () => {
        ctx.clear();
        engine.renderGround(ctx, renderW, renderH, dpr);
        if (unitsCtx && unitsCanvas) {
          unitsCtx.clear();
          unitsCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
          unitsCtx.clearRect(0, 0, renderW, renderH);
          engine.renderUnitsAndOverlays(unitsCtx, renderW, renderH);
        }
      };
      drawGroundAndUnits();
      if (needsCameraRestore) {
        const savedCamera = cameraRef.current;
        if (savedCamera) {
          const centerX = (savedCamera.x + savedCamera.viewW / 2) / savedCamera.tile;
          const centerY = (savedCamera.y + savedCamera.viewH / 2) / savedCamera.tile;
          engine.restoreCamera({
            x: centerX * previewTileRadius - renderW / 2,
            y: centerY * previewTileRadius - renderH / 2,
          });
          drawGroundAndUnits();
        }
        needsCameraRestore = false;
      } else if (needsInitialCenter) {
        // First-ever mount for this draft: the draw() above just ran the engine's own
        // first-render focus (a spawn unit, or nowhere at all on a still-empty draft) —
        // override it so the preview opens at the party's starting location, not the board
        // edge or a stale camera from another map. Only runs once —
        // drawGroundAndUnits() can rerun many times after this (resize, elemental-FX
        // animation frames) and must never re-center over panning the author already did.
        engine.centerOnStartingParty();
        drawGroundAndUnits();
        needsInitialCenter = false;
      }
      // Drawn on the units canvas (top layer) so the highlight stays visible over units too,
      // matching where it used to land back when everything shared one canvas.
      const highlightCtx = unitsCtx ?? ctx;
      if (selectedPlacedDecoration) engine.drawDecorationHighlight(highlightCtx, selectedPlacedDecoration.id, selectedPlacedDecoration);
      else if (selectedDecorationId) engine.drawDecorationHighlight(highlightCtx, selectedDecorationId);
      if (fx && fxCanvas) {
        const now = performance.now();
        const dt = Math.min(0.05, (now - lastFrame) / 1000);
        lastFrame = now;
        if (fx.hasEffects()) {
          fxCanvas.style.width = `${w}px`;
          fxCanvas.style.height = `${h}px`;
          fx.resize(renderW, renderH, dpr);
          fxCanvas.style.display = "block";
          fx.render(canvas, dt, (col, row) => engine.effectAnchor(col, row));
        } else {
          fxCanvas.style.display = "none";
        }
      }
    };

    redrawRef.current = draw;
    draw();
    // Placements are static in this editor preview (no camera-independent trigger redraws
    // them), so a small self-sustaining loop keeps their animation running; it's a no-op
    // draw() call once fx.hasEffects() goes false, and stops itself right after.
    let fxRaf = 0;
    const animateFx = () => {
      if (!fx?.hasEffects()) return;
      draw();
      fxRaf = requestAnimationFrame(animateFx);
    };
    if (fx?.hasEffects()) fxRaf = requestAnimationFrame(animateFx);
    if (!verticalScrollInitializedRef.current) {
      requestAnimationFrame(() => {
        const centeredTop = Math.round(Math.max(0, viewport.scrollHeight - viewport.clientHeight) / 2);
        const centeredLeft = Math.round(Math.max(0, viewport.scrollWidth - viewport.clientWidth) / 2);
        verticalScrollTopRef.current = centeredTop;
        horizontalScrollLeftRef.current = centeredLeft;
        viewport.scrollTop = centeredTop;
        viewport.scrollLeft = centeredLeft;
        verticalScrollInitializedRef.current = true;
      });
    }
    const ro = new ResizeObserver(draw);
    ro.observe(viewport);
    return () => {
      ro.disconnect();
      if (fxRaf) cancelAnimationFrame(fxRaf);
      fx?.dispose();
      const camera = engine.cameraPosition();
      const scale = renderScaleRef.current;
      cameraRef.current = {
        ...camera,
        missionId: mission.id,
        tile: ZOOM_RADII[engine.zoom]!,
        viewW: (viewportRef.current?.clientWidth ?? 1) / scale,
        viewH: (viewportRef.current?.clientHeight ?? 1) / scale,
      };
      if (engineRef.current === engine) engineRef.current = null;
      if (redrawRef.current === draw) redrawRef.current = null;
    };
  }, [mission, art, onCellClick, selectedDecorationId, selectedPlacedDecoration, zoom]);

  useEffect(() => {
    const deleteHeldUnit = (event: KeyboardEvent) => {
      if (event.key !== "Delete") return;
      const held = unitDragRef.current;
      if (!held) return;
      event.preventDefault();
      onHeldUnitDelete?.(held.unit);
      const viewport = viewportRef.current;
      if (viewport?.hasPointerCapture(held.pointerId)) viewport.releasePointerCapture(held.pointerId);
      unitDragRef.current = null;
      setIsDragging(false);
    };
    window.addEventListener("keydown", deleteHeldUnit);
    return () => window.removeEventListener("keydown", deleteHeldUnit);
  }, [onHeldUnitDelete]);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    // Leave native scrollbar gutters available to the scrollbar thumb. Capturing those
    // pointer events as map gestures made it impossible to drag the view back from an edge.
    const bounds = viewport.getBoundingClientRect();
    const contentLeft = bounds.left + viewport.clientLeft;
    const contentTop = bounds.top + viewport.clientTop;
    if (
      event.clientX < contentLeft ||
      event.clientX >= contentLeft + viewport.clientWidth ||
      event.clientY < contentTop ||
      event.clientY >= contentTop + viewport.clientHeight
    ) return;
    // Units are deliberately picked up with the secondary button. The primary button stays
    // available for the map itself: a held left-drag pans, while an ordinary left click uses
    // the active paint brush.
    if (event.button === 2) {
      event.preventDefault();
      const canvas = canvasRef.current;
      const engine = engineRef.current;
      if (!canvas || !engine) return;
      const rect = canvas.getBoundingClientRect();
      const scale = renderScaleRef.current;
      const px = (event.clientX - rect.left) / scale;
      const py = (event.clientY - rect.top) / scale;
      const cell = engine.cellAt(px, py);
      // Try the exact hex first, then fall back to anywhere on the unit's drawn sprite — a
      // sprite commonly extends well beyond its own hex on screen (tall creatures especially),
      // which otherwise makes some units hard to grab.
      let unit = cell ? unitAt(cell.x, cell.y) : null;
      if (!unit) {
        const spriteUnit = engine.unitSpriteAt(px, py);
        if (spriteUnit) unit = unitAt(spriteUnit.x, spriteUnit.y);
      }
      if (unit) {
        unitDragRef.current = { pointerId: event.pointerId, unit, startX: event.clientX, startY: event.clientY, moved: false };
        viewport.setPointerCapture(event.pointerId);
        onUnitSelect?.(unit);
        setIsDragging(true);
        return;
      }
      const decoration = cell ? decorationAt(cell.x, cell.y) : null;
      if (decoration) {
        decorationDragRef.current = { pointerId: event.pointerId, decoration };
        viewport.setPointerCapture(event.pointerId);
        onDecorationSelect?.(decoration);
        setIsDragging(true);
        return;
      }
      // Right-clicking empty ground is intentionally inert: map panning belongs to the
      // primary-button hold gesture below, so it never competes with moving a unit.
      return;
    }
    if (event.button !== 0) return;
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      armed: false,
      moved: false,
    };
    viewport.setPointerCapture(event.pointerId);
    armTimerRef.current = window.setTimeout(() => {
      const drag = dragRef.current;
      if (drag?.pointerId !== event.pointerId || drag.moved) return;
      drag.armed = true;
      // The hand cursor confirms that the hold-to-pan gesture is armed.
      setIsPanning(true);
    }, PREVIEW_PAN_HOLD_MS);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const unitDrag = unitDragRef.current;
    if (unitDrag?.pointerId === event.pointerId) {
      // Same 6px threshold as the pan gesture below: past it, this is a deliberate drag to a
      // new hex, not a pick-up-and-hold — see endDrag, which only drops the unit if moved.
      if (!unitDrag.moved && Math.hypot(event.clientX - unitDrag.startX, event.clientY - unitDrag.startY) >= 6) {
        unitDrag.moved = true;
      }
      return;
    }
    const decorationDrag = decorationDragRef.current;
    if (decorationDrag?.pointerId === event.pointerId) return;
    const viewport = viewportRef.current;
    const drag = dragRef.current;
    if (!viewport || !drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    // The brush owns normal clicks and drags. Pan begins only after the 0.5-second hold
    // timer arms it, then a real movement, so it can never auto-activate.
    if (!drag.moved) {
      const movedFarEnough = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >= 6;
      if (drag.armed && movedFarEnough) {
        drag.moved = true;
      }
    }
    if (drag.moved) {
      const scale = renderScaleRef.current;
      const panX = -dx / scale;
      const panY = -dy / scale;
      engineRef.current?.panBy(panX, panY);
      // Keep the scrollbar thumb in step with pointer panning. Updating the refs first means
      // the resulting scroll event won't apply the same camera movement a second time.
      const scrollLeft = Math.max(0, Math.min(viewport.scrollWidth - viewport.clientWidth, viewport.scrollLeft + panX));
      const scrollTop = Math.max(0, Math.min(viewport.scrollHeight - viewport.clientHeight, viewport.scrollTop + panY));
      horizontalScrollLeftRef.current = scrollLeft;
      verticalScrollTopRef.current = scrollTop;
      viewport.scrollLeft = scrollLeft;
      viewport.scrollTop = scrollTop;
      redrawRef.current?.();
    }
    drag.x = event.clientX;
    drag.y = event.clientY;
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>, cancelled = false) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const unitDrag = unitDragRef.current;
    if (unitDrag?.pointerId === event.pointerId) {
      if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
      // An ordinary right-click — press and release without dragging — is a pick-up-and-hold,
      // not a move: releasing the button must not drop the unit back onto the board, and the
      // selection has to survive the release so Delete still works afterward (a real mouse
      // click is a near-instant press+release; requiring Delete to land before the button
      // comes back up made the whole gesture impossible to actually perform). Only a real
      // drag (unitDrag.moved) or a cancel ends the hold here.
      if (!unitDrag.moved) {
        if (cancelled) unitDragRef.current = null;
        setIsDragging(false);
        return;
      }
      if (!cancelled) {
        const canvas = canvasRef.current;
        const engine = engineRef.current;
        if (canvas && engine) {
          const rect = canvas.getBoundingClientRect();
          const scale = renderScaleRef.current;
          const cell = engine.cellAt((event.clientX - rect.left) / scale, (event.clientY - rect.top) / scale);
          if (cell) onUnitPlace?.(unitDrag.unit, cell.x, cell.y);
        }
      }
      unitDragRef.current = null;
      setIsDragging(false);
      return;
    }
    const decorationDrag = decorationDragRef.current;
    if (decorationDrag?.pointerId === event.pointerId) {
      if (!cancelled) {
        const canvas = canvasRef.current;
        const engine = engineRef.current;
        if (canvas && engine) {
          const rect = canvas.getBoundingClientRect();
          const scale = renderScaleRef.current;
          const cell = engine.cellAt((event.clientX - rect.left) / scale, (event.clientY - rect.top) / scale);
          if (cell) onDecorationPlace?.(decorationDrag.decoration, cell.x, cell.y);
        }
      }
      if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
      decorationDragRef.current = null;
      setIsDragging(false);
      return;
    }
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (armTimerRef.current !== null) {
      window.clearTimeout(armTimerRef.current);
      armTimerRef.current = null;
    }
    // Normal left click remains the terrain/decorations brush. Panning is still hold + drag.
    if (!cancelled && !drag.moved && event.button === 0) {
      const canvas = canvasRef.current;
      const engine = engineRef.current;
      if (canvas && engine) {
        const rect = canvas.getBoundingClientRect();
        const scale = renderScaleRef.current;
        const cell = engine.cellAt((event.clientX - rect.left) / scale, (event.clientY - rect.top) / scale);
        if (cell) onCellClick?.(cell.x, cell.y);
      }
    }
    if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
    dragRef.current = null;
    setIsPanning(false);
  };
  const onViewportScroll = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const deltaY = viewport.scrollTop - verticalScrollTopRef.current;
    const deltaX = viewport.scrollLeft - horizontalScrollLeftRef.current;
    verticalScrollTopRef.current = viewport.scrollTop;
    horizontalScrollLeftRef.current = viewport.scrollLeft;
    if (!deltaX && !deltaY) return;
    const scale = renderScaleRef.current;
    engineRef.current?.panBy(deltaX * PREVIEW_SCROLL_PAN_RATE / scale, deltaY * PREVIEW_SCROLL_PAN_RATE / scale);
    redrawRef.current?.();
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <div className="absolute right-2 top-2 z-10 flex overflow-hidden rounded border border-border bg-surface shadow-md">
        <button
          type="button"
          className="h-7 w-7 text-base text-fg hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Diminuir zoom da prévia"
          title="Diminuir zoom"
          disabled={zoom <= PREVIEW_ZOOM_MIN}
          onClick={() => setZoom((value) => Math.max(PREVIEW_ZOOM_MIN, Number((value - 0.25).toFixed(2))))}
        >
          −
        </button>
        <button
          type="button"
          className="min-w-12 border-x border-border px-1 text-[10px] font-semibold text-fg hover:bg-surface-2"
          aria-label="Restaurar zoom da prévia"
          title="Restaurar zoom"
          onClick={() => setZoom(PREVIEW_ZOOM_MIN)}
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          className="h-7 w-7 text-base text-fg hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Aumentar zoom da prévia"
          title="Aumentar zoom"
          disabled={zoom >= 2.5}
          onClick={() => setZoom((value) => Math.min(2.5, Number((value + 0.25).toFixed(2))))}
        >
          +
        </button>
      </div>
      <div
        ref={viewportRef}
        className={`h-full w-full bg-black ember-scrollbar overflow-x-auto overflow-y-scroll ${isDragging || isPanning ? "cursor-grabbing" : "cursor-default"}`}
        style={{ scrollbarGutter: "stable both-edges" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={(event) => endDrag(event, true)}
        onLostPointerCapture={(event) => endDrag(event, true)}
        onContextMenu={(event) => event.preventDefault()}
        onScroll={onViewportScroll}
      >
        <div style={{ width: `max(100%, ${previewScrollWidth}px)`, minHeight: `max(100%, ${previewScrollHeight}px)` }}>
          <div className="sticky left-0 top-0 w-max">
            <div className="relative">
              <canvas ref={canvasRef} className="block" />
              <canvas ref={fxCanvasRef} className="pointer-events-none absolute inset-0 block" style={{ display: "none" }} />
              <canvas ref={unitsCanvasRef} className="pointer-events-none absolute inset-0 block" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
