import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Check, ChevronLeft, Lock, MapPin, SlidersHorizontal, Volume2, VolumeX, X, ZoomIn, ZoomOut } from "lucide-react";
import { missionsForLocation } from "./mapstore";
import type { Mission, WorldLocation } from "./types";
import { GoldAmount } from "./GoldAmount";
import { getAudioVolumes, setMusicVolume, setSfxVolume, sfxPlay, unlockAudio } from "./audio";
import { hexToWorld, locationExpired, neighborsOf, type OverworldEvent, worldToHex } from "./overworld";
import { key } from "./pathfinding";

export type LocationStatus = "locked" | "available" | "done";

const ZOOM_STOPS = [70, 90, 110, 130];

/** Idle-breathing frames of the MC's own sprite (public/game/sprites/Kael_Final/kael-final-002),
 * the same art the battle engine plays as Kael — see assets.ts's "kaelFinal" entry. Only every
 * third of the 36 captured frames is used: plenty smooth at the size this renders (a small
 * JRPG-style overworld token), for a third of the image requests. */
const KAEL_MARKER_FRAMES = Array.from({ length: 12 }, (_, i) => 1 + i * 3);

function KaelMarker({ facingLeft }: { facingLeft: boolean }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setFrame((f) => (f + 1) % KAEL_MARKER_FRAMES.length), 110);
    return () => window.clearInterval(id);
  }, []);
  return (
    <img
      src={`/game/sprites/Kael_Final/kael-final-002/${KAEL_MARKER_FRAMES[frame]}.png?v=kael-final-002`}
      alt=""
      draggable={false}
      className="h-12 w-auto object-contain select-none drop-shadow-[0_2px_3px_rgba(0,0,0,0.6)]"
      style={{ transform: facingLeft ? "scaleX(-1)" : undefined }}
    />
  );
}

/** The RPG map: same background art and pan/zoom viewport as the classic map, but travel is
 * hex-by-hex instead of jumping straight to any unlocked location. The hex grid itself
 * (src/game/overworld.ts) is never drawn — only the party's current position (a small Kael
 * sprite) and the immediate neighbors it can step to are ever shown as interactive. Every
 * existing location pin still renders exactly where the classic map puts it; only whether a
 * click on it does anything depends on reachability this turn. */
export function OverworldMapScreen({
  locations,
  status,
  missionStatus,
  ember,
  test,
  muted,
  onMute,
  overworldPos,
  gameClock,
  rations,
  hungerStreak,
  event,
  onDismissEvent,
  onStep,
  onTeleport,
  onBack,
  onPick,
}: {
  locations: WorldLocation[];
  status: (loc: WorldLocation) => LocationStatus;
  missionStatus: (missionId: string) => LocationStatus;
  ember: number;
  test: boolean;
  muted: boolean;
  onMute: () => void;
  overworldPos: { col: number; row: number };
  gameClock: number;
  rations: number;
  hungerStreak: number;
  event: OverworldEvent | null;
  onDismissEvent: () => void;
  /** Commits one hex step (or a no-op re-click on the current hex) — day/ration/recovery
   * math lives in overworld.ts's stepOverworld, called by the parent. */
  onStep: (col: number, row: number) => void;
  /** Modo teste only: jumps straight to a non-adjacent pin, no day/supply cost. Never called
   * for a walkable (adjacent) pin — those always go through onStep instead, so the day
   * clock and rations stay visible and testable even in test mode. */
  onTeleport?: (col: number, row: number) => void;
  onBack: () => void;
  onPick: (missionId: string) => void;
}) {
  const [open, setOpen] = useState<WorldLocation | null>(null);
  const [artOk, setArtOk] = useState(true);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [zoomIdx, setZoomIdx] = useState(ZOOM_STOPS.length - 1);
  const [audioSettingsOpen, setAudioSettingsOpen] = useState(false);
  const [audioLevels, setAudioLevels] = useState(() => getAudioVolumes());
  const [dragging, setDragging] = useState(false);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number; moved: boolean } | null>(null);
  const centerFracRef = useRef({ x: 0.5, y: 0.5 });

  // Which way Kael last actually moved — kept across steps (not reset when standing still),
  // so re-clicking the current hex or arriving straight-up/down doesn't suddenly flip him.
  const [facingLeft, setFacingLeft] = useState(false);
  const prevPosRef = useRef(overworldPos);
  useEffect(() => {
    const prev = prevPosRef.current;
    if (overworldPos.col !== prev.col) setFacingLeft(overworldPos.col < prev.col);
    prevPosRef.current = overworldPos;
  }, [overworldPos.col, overworldPos.row]);

  const recenterOn = (fx: number, fy: number) => {
    const el = viewportRef.current;
    if (!el) return;
    el.scrollLeft = Math.max(0, Math.min(el.scrollWidth - el.clientWidth, fx * el.scrollWidth - el.clientWidth / 2));
    el.scrollTop = Math.max(0, Math.min(el.scrollHeight - el.clientHeight, fy * el.scrollHeight - el.clientHeight / 2));
  };
  const captureCenterFrac = () => {
    const el = viewportRef.current;
    if (!el || el.scrollWidth === 0 || el.scrollHeight === 0) return;
    centerFracRef.current = {
      x: (el.scrollLeft + el.clientWidth / 2) / el.scrollWidth,
      y: (el.scrollTop + el.clientHeight / 2) / el.scrollHeight,
    };
  };

  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) return;
    recenterOn(centerFracRef.current.x, centerFracRef.current.y);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomIdx]);

  // Opens centered on the party's current hex, same idea as the classic map centering on
  // centerLocationId — just derived from overworldPos instead. Mount-only, so panning
  // afterward isn't fought on every step.
  useEffect(() => {
    const world = hexToWorld(overworldPos.col, overworldPos.row);
    centerFracRef.current = { x: world.x / 100, y: world.y / 100 };
    recenterOn(centerFracRef.current.x, centerFracRef.current.y);
    mounted.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-dismiss a step's event toast so it doesn't require an extra tap on a phone.
  useEffect(() => {
    if (!event) return;
    const id = window.setTimeout(onDismissEvent, 4000);
    return () => window.clearTimeout(id);
  }, [event, onDismissEvent]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch") return;
    const el = viewportRef.current;
    if (!el) return;
    dragRef.current = { x: e.clientX, y: e.clientY, scrollLeft: el.scrollLeft, scrollTop: el.scrollTop, moved: false };
    setDragging(true);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    const el = viewportRef.current;
    if (!d || !el) return;
    if (e.pointerType === "mouse" && e.buttons === 0) {
      dragRef.current = null;
      setDragging(false);
      return;
    }
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
      d.moved = true;
      el.setPointerCapture(e.pointerId);
    }
    if (!d.moved) return;
    el.scrollLeft = d.scrollLeft - dx;
    el.scrollTop = d.scrollTop - dy;
  };
  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = viewportRef.current;
    if (el?.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    setDragging(false);
  };
  const onClickCapture = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (dragRef.current?.moved) {
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = null;
    }
  };

  const showHint = (text: string) => {
    setHint(text);
    window.setTimeout(() => setHint((h) => (h === text ? null : h)), 1200);
  };

  // Everything the party can step to right now: its own hex (re-clicking it just reopens
  // whatever's there, no day spent — see stepOverworld's same-hex no-op) plus its six
  // neighbors. The only adjacency rule the UI is allowed to know about.
  const reachable = useMemo(() => {
    const set = new Set<string>();
    set.add(key(overworldPos.col, overworldPos.row));
    for (const n of neighborsOf(overworldPos.col, overworldPos.row)) set.add(key(n.x, n.y));
    return set;
  }, [overworldPos.col, overworldPos.row]);

  const occupiedHexes = useMemo(() => new Set(locations.map((l) => { const h = worldToHex(l.x, l.y); return key(h.x, h.y); })), [locations]);

  const wildDots = useMemo(
    () =>
      neighborsOf(overworldPos.col, overworldPos.row)
        .filter((n) => !occupiedHexes.has(key(n.x, n.y)))
        .map((n) => ({ ...n, world: hexToWorld(n.x, n.y) })),
    [overworldPos.col, overworldPos.row, occupiedHexes],
  );

  // Standing exactly on a location's hex snaps the marker to that location's own authored
  // x/y (sub-hex precision) instead of the hex-center approximation, so Kael visibly lands
  // right on the pin rather than somewhere nearby within the same hex.
  const standingOn = useMemo(
    () => locations.find((l) => { const h = worldToHex(l.x, l.y); return h.x === overworldPos.col && h.y === overworldPos.row; }),
    [locations, overworldPos.col, overworldPos.row],
  );
  const partyWorld = standingOn ? { x: standingOn.x, y: standingOn.y } : hexToWorld(overworldPos.col, overworldPos.row);

  const enterLocation = (loc: WorldLocation, st: LocationStatus) => {
    if (locationExpired(loc, gameClock)) {
      showHint("Prazo esgotado por aqui.");
      return;
    }
    if (st === "locked") {
      setFlashId(loc.id);
      window.setTimeout(() => setFlashId((f) => (f === loc.id ? null : f)), 500);
      return;
    }
    const missions = missionsForLocation(loc);
    if (missions.length > 1) {
      setOpen(loc);
      return;
    }
    if (missions[0]) onPick(missions[0].id);
  };

  return (
    <section className="relative h-dvh min-h-0 flex flex-col overflow-hidden bg-bg">
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 30% 20%, #241f19 0%, #0c0b0a 70%)" }} />

      <header className="relative z-20 flex items-center gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-4 flex-wrap">
        <button type="button" onClick={onBack} className="size-10 grid place-items-center rounded-md border border-border bg-bg/70" aria-label="Voltar">
          <ChevronLeft className="size-5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm uppercase tracking-[0.18em] text-muted">{test ? "Modo teste" : "Campanha"} · RPG</p>
          <h1 className="font-display text-3xl leading-none">Mapa</h1>
        </div>
        <p className="text-sm text-muted border border-border rounded-md px-2 py-1 bg-bg/70">Dia <span className="text-fg tabular-nums">{gameClock}</span></p>
        <p className="text-sm text-muted border border-border rounded-md px-2 py-1 bg-bg/70">Rações <span className="text-fg tabular-nums">{rations}</span></p>
        {hungerStreak > 0 && (
          <p className="text-sm border rounded-md px-2 py-1 bg-bg/70 border-danger/60 text-danger">
            Fome <span className="tabular-nums">{hungerStreak}d</span>
          </p>
        )}
        <button type="button" onClick={onMute} className="size-9 grid place-items-center rounded-md border border-border bg-bg/70" aria-label="Som">
          {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setAudioSettingsOpen((o) => !o)}
            className="size-9 grid place-items-center rounded-md border border-border bg-bg/70"
            aria-label="Volumes"
            aria-expanded={audioSettingsOpen}
          >
            <SlidersHorizontal className="size-4" />
          </button>
          {audioSettingsOpen && (
            <div className="absolute right-0 top-full mt-2 w-64 rounded-md border border-border bg-bg/95 p-3 flex flex-col gap-3 shadow-lg shadow-bg/40 z-20">
              <label className="flex flex-col gap-1.5">
                <span className="flex items-center justify-between text-xs uppercase tracking-[0.14em] text-muted">
                  Música <span className="tabular-nums text-fg">{Math.round(audioLevels.music * 100)}%</span>
                </span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={audioLevels.music}
                  onChange={(e) => {
                    const music = Number(e.target.value);
                    setMusicVolume(music);
                    setAudioLevels((levels) => ({ ...levels, music }));
                  }}
                  aria-label="Volume da música"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="flex items-center justify-between text-xs uppercase tracking-[0.14em] text-muted">
                  Efeitos <span className="tabular-nums text-fg">{Math.round(audioLevels.sfx * 100)}%</span>
                </span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={audioLevels.sfx}
                  onChange={(e) => {
                    const sfx = Number(e.target.value);
                    setSfxVolume(sfx);
                    setAudioLevels((levels) => ({ ...levels, sfx }));
                  }}
                  aria-label="Volume dos efeitos"
                />
              </label>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted">Música em 0% deixa só os efeitos.</p>
                <button
                  type="button"
                  onClick={() => {
                    unlockAudio();
                    sfxPlay.magicAttack();
                  }}
                  className="h-8 px-3 rounded-md border border-border bg-bg/70 text-xs uppercase tracking-[0.1em]"
                >
                  Testar
                </button>
              </div>
            </div>
          )}
        </div>
        <p className="text-sm text-muted border border-border rounded-md px-2 py-1 bg-bg/70"><GoldAmount amount={ember} /></p>
      </header>

      <div
        ref={viewportRef}
        className={`relative z-10 flex-1 min-h-0 overflow-auto overscroll-contain touch-pan-x touch-pan-y select-none ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
        style={{ WebkitOverflowScrolling: "touch" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={endDrag}
        onClickCapture={onClickCapture}
      >
        <div className="relative inline-block m-2" style={{ width: artOk ? `${ZOOM_STOPS[zoomIdx]}%` : undefined }}>
          {artOk ? (
            <img
              src="/game/assets/world-map.jpg"
              alt=""
              className="block w-full h-auto rounded-lg select-none"
              draggable={false}
              onError={() => setArtOk(false)}
              onLoad={() => recenterOn(centerFracRef.current.x, centerFracRef.current.y)}
            />
          ) : (
            <div className="w-[70dvw] h-[70dvh] max-w-md" />
          )}
          <div className="absolute inset-0">
            {locations.map((loc) => {
              const st = status(loc);
              const missions = missionsForLocation(loc);
              const multi = missions.length > 1;
              const hex = worldToHex(loc.x, loc.y);
              const walkable = reachable.has(key(hex.x, hex.y));
              // Modo teste: every pin is clickable, no walking required — testing needs to
              // jump straight to any location, the same freedom the classic map already
              // gives it. A walkable (adjacent) pin still walks normally even in test mode,
              // so the day-clock/rations math stays visible and testable there too; only a
              // distant pin gets the free teleport.
              const isReachable = test || walkable;
              const expired = locationExpired(loc, gameClock);
              return (
                <button
                  key={loc.id}
                  type="button"
                  onClick={() => {
                    if (!isReachable) {
                      showHint("Ande até lá primeiro.");
                      return;
                    }
                    if (walkable) onStep(hex.x, hex.y);
                    else onTeleport?.(hex.x, hex.y);
                    enterLocation(loc, st);
                  }}
                  className={`group absolute -translate-x-1/2 -translate-y-1/2 ${isReachable ? "" : "opacity-70"}`}
                  style={{ left: `${loc.x}%`, top: `${loc.y}%` }}
                  aria-label={st === "locked" ? `${loc.name} (bloqueado)` : loc.name}
                >
                  <span
                    className={`relative size-10 rounded-full border-2 grid place-items-center bg-bg/80 transition-transform group-hover:scale-110 group-active:scale-95 ${
                      st === "locked"
                        ? `border-border opacity-50 ${loc.id === flashId ? "locked-flash" : ""}`
                        : st === "done"
                          ? "border-accent"
                          : missions.some((m) => m.hub)
                            ? "inn-open"
                            : "border-accent"
                    } ${expired ? "border-dashed" : ""}`}
                  >
                    {st === "locked" ? (
                      <Lock className="size-4 text-muted" />
                    ) : st === "done" ? (
                      <Check className="size-4 text-accent" />
                    ) : (
                      <MapPin className="size-4 text-accent" />
                    )}
                    {multi && (
                      <span className="absolute -top-1.5 -right-1.5 size-4 rounded-full bg-bg border border-border text-[10px] leading-none grid place-items-center text-fg/90">
                        {missions.length}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}

            {/* Wild-hex stepping stones: the invisible grid's only visible trace, and only
                right around the party — not pre-authored pins, so they appear and vanish as
                it moves instead of cluttering the whole map. */}
            {wildDots.map((dot) => (
              <button
                key={key(dot.x, dot.y)}
                type="button"
                onClick={() => onStep(dot.x, dot.y)}
                className="group absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${dot.world.x}%`, top: `${dot.world.y}%` }}
                aria-label="Andar"
              >
                <span className="block size-3 rounded-full bg-accent/70 border border-accent group-hover:scale-125 transition-transform" />
              </button>
            ))}

            {/* The party's own marker — a tiny idle Kael, sliding hex to hex as the party
                steps (the transition is what reads as "movement": there's no walk-cycle art
                for this sprite, just the idle loop, so distance covered does the talking). */}
            <div
              className="absolute -translate-x-1/2 -translate-y-full pointer-events-none transition-all duration-500 ease-in-out"
              style={{ left: `${partyWorld.x}%`, top: `${partyWorld.y}%` }}
            >
              <KaelMarker facingLeft={facingLeft} />
            </div>
          </div>
        </div>
      </div>

      {hint && (
        <div className="absolute z-30 top-24 left-1/2 -translate-x-1/2 bg-bg/90 border border-border rounded-md px-3 py-1.5 text-xs text-fg">
          {hint}
        </div>
      )}

      {event && (
        <div className="absolute z-30 bottom-[max(5rem,calc(env(safe-area-inset-bottom)+5rem))] left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-sm bg-surface/95 border border-border rounded-lg px-4 py-3 text-sm text-fg shadow-lg shadow-bg/40">
          <div className="flex items-start justify-between gap-3">
            <p>{event.text}</p>
            <button type="button" onClick={onDismissEvent} className="shrink-0 size-6 grid place-items-center rounded-md border border-border" aria-label="Fechar">
              <X className="size-3" />
            </button>
          </div>
        </div>
      )}

      {artOk && (
        <div className="absolute z-20 bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 flex flex-col gap-1 bg-bg/85 border border-border rounded-lg p-1">
          <button
            type="button"
            onClick={() => {
              captureCenterFrac();
              setZoomIdx((i) => Math.min(ZOOM_STOPS.length - 1, i + 1));
            }}
            disabled={zoomIdx >= ZOOM_STOPS.length - 1}
            className="size-11 grid place-items-center rounded-md disabled:opacity-30 active:bg-surface-2"
            aria-label="Aproximar"
          >
            <ZoomIn className="size-5" />
          </button>
          <div className="text-center text-[10px] tabular-nums text-muted py-0.5">
            {ZOOM_STOPS.length - zoomIdx}/{ZOOM_STOPS.length}
          </div>
          <button
            type="button"
            onClick={() => {
              captureCenterFrac();
              setZoomIdx((i) => Math.max(0, i - 1));
            }}
            disabled={zoomIdx <= 0}
            className="size-11 grid place-items-center rounded-md disabled:opacity-30 active:bg-surface-2"
            aria-label="Afastar"
          >
            <ZoomOut className="size-5" />
          </button>
        </div>
      )}

      {open && (
        <LocationPanel
          location={open}
          missions={missionsForLocation(open)}
          missionStatus={missionStatus}
          test={test}
          onPick={(id) => {
            setOpen(null);
            onPick(id);
          }}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  );
}

function LocationPanel({
  location,
  missions,
  missionStatus,
  test,
  onPick,
  onClose,
}: {
  location: WorldLocation;
  missions: Mission[];
  missionStatus: (missionId: string) => LocationStatus;
  test: boolean;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const [flashId, setFlashId] = useState<string | null>(null);
  return (
    <div
      className="absolute inset-0 z-40 bg-bg/45 backdrop-blur-[3px] flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md max-h-[80dvh] overflow-y-auto bg-surface/95 border border-border rounded-xl p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <p className="font-display text-xl leading-tight">{location.name}</p>
          <button type="button" onClick={onClose} className="size-8 grid place-items-center rounded-md border border-border" aria-label="Fechar">
            <X className="size-4" />
          </button>
        </div>
        <ol className="flex flex-col gap-2">
          {missions.map((m, i) => {
            const st = missionStatus(m.id);
            return (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => {
                    if (st === "locked") {
                      setFlashId(m.id);
                      window.setTimeout(() => setFlashId((f) => (f === m.id ? null : f)), 500);
                      return;
                    }
                    onPick(m.id);
                  }}
                  aria-label={st === "locked" ? `${m.title} (bloqueado)` : undefined}
                  className={`w-full text-left rounded-xl border bg-surface px-4 py-3 ${
                    st === "locked" ? `opacity-40 border-border ${m.id === flashId ? "locked-flash" : ""}` : "border-border"
                  }`}
                >
                  <p className="text-sm uppercase tracking-[0.16em] text-muted flex items-center gap-1.5">
                    {st === "locked" && <Lock className="size-3" />}
                    {st === "done" && <Check className="size-3 text-accent" />}
                    {String(i + 1).padStart(2, "0")} · {m.place}
                    {st === "done" ? " · feito" : ""}
                  </p>
                  <p className="font-display text-2xl">{m.title}</p>
                  <p className="text-base text-muted">{m.objective}</p>
                </button>
              </li>
            );
          })}
        </ol>
        {test && <p className="mt-3 text-xs text-muted">Modo teste: todos os capítulos estão abertos.</p>}
      </div>
    </div>
  );
}
