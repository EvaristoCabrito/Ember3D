import { useCallback, useEffect, useRef, useState } from "react";

/** Keeps the map hidden until its large image has dimensions and React can position its markers. */
export function useMapLoading() {
  const [progress, setProgress] = useState(12);
  const [visible, setVisible] = useState(true);
  const finished = useRef(false);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    setProgress((current) => Math.max(current, 86));
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        setProgress(100);
        window.setTimeout(() => setVisible(false), 280);
      });
    });
  }, []);

  useEffect(() => {
    const art = new Image();
    art.onload = art.onerror = () => setProgress((current) => Math.max(current, 42));
    art.src = "/game/ui/loading-screen.jpg?v=1";
    const warmup = window.setTimeout(() => setProgress((current) => Math.max(current, 58)), 180);
    // Do not leave the player trapped if the map image fails to load.
    const fallback = window.setTimeout(finish, 6000);
    return () => {
      window.clearTimeout(warmup);
      window.clearTimeout(fallback);
    };
  }, [finish]);

  return { progress, visible, finish };
}

export function MapLoadingOverlay({ progress, visible }: { progress: number; visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="absolute inset-0 z-[70] grid place-items-end overflow-hidden bg-[#151311] px-6 pb-[max(2.5rem,env(safe-area-inset-bottom))]" aria-live="polite" aria-label={`Carregando mapa: ${progress}%`}>
      <img src="/game/ui/loading-screen.jpg?v=1" alt="" className="absolute inset-0 size-full object-cover" />
      <div className="relative w-full max-w-md">
        <div className="h-3 overflow-hidden rounded-sm border border-[#b4976a]/80 bg-black/80 p-[2px] shadow-[0_2px_18px_rgba(0,0,0,0.8)]">
          <div className="h-full bg-gradient-to-r from-[#713718] via-[#e1a541] to-[#fff0a2] transition-[width] duration-300 ease-out" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-2 text-center text-[11px] uppercase tracking-[0.22em] text-[#eee0c8] drop-shadow-[0_1px_2px_#000]">Carregando o mapa · {progress}%</p>
      </div>
    </div>
  );
}

/** Screen ids heavy enough (a big map background, the battle canvas' whole art set) that
 * the swap into them can outrun a single React commit and leave a blank/frozen frame in
 * between — the general "stuck for a few seconds" complaint. Anything else (briefing,
 * cutscenes, menus) is cheap enough not to need this. */
const HEAVY_SCREENS = new Set(["overworldMap", "worldMap", "battle"]);

/** Curtains any transition into a HEAVY_SCREENS destination behind the same loading art
 * used for the map, for a floor of MIN_VISIBLE_MS so it always reads as a deliberate
 * loading beat rather than a flicker, however fast the actual mount turns out to be. */
export function useLoadingCurtain(screen: string): boolean {
  const [visible, setVisible] = useState(false);
  const prevScreen = useRef(screen);

  useEffect(() => {
    if (prevScreen.current === screen) return;
    prevScreen.current = screen;
    if (!HEAVY_SCREENS.has(screen)) return;
    setVisible(true);
    const MIN_VISIBLE_MS = 380;
    const timer = window.setTimeout(() => setVisible(false), MIN_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [screen]);

  return visible;
}

export function LoadingCurtain({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="absolute inset-0 z-[80] grid place-items-end overflow-hidden bg-[#151311] px-6 pb-[max(2.5rem,env(safe-area-inset-bottom))]" aria-live="polite" aria-label="Carregando">
      <img src="/game/ui/loading-screen.jpg?v=1" alt="" className="absolute inset-0 size-full object-cover" />
      <div className="relative w-full max-w-md">
        <div className="h-3 overflow-hidden rounded-sm border border-[#b4976a]/80 bg-black/80 p-[2px] shadow-[0_2px_18px_rgba(0,0,0,0.8)]">
          <div className="h-full w-full bg-gradient-to-r from-[#713718] via-[#e1a541] to-[#fff0a2] animate-pulse" />
        </div>
        <p className="mt-2 text-center text-[11px] uppercase tracking-[0.22em] text-[#eee0c8] drop-shadow-[0_1px_2px_#000]">Carregando…</p>
      </div>
    </div>
  );
}
