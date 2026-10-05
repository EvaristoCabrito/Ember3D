/** English-first subtitle release. Original Portuguese and English assets are preserved. */
export const CUTSCENE_SUBTITLES: Record<string, string> = Object.fromEntries([
  "aldeia-intro", "asherah-rite", "temple-aftermath", "wisp-entrance", "inn-arrival", "smith-intro",
].map(name => [`/game/${name}.mp4`, `/game/subtitles/${name}.en-v2.vtt`]));

/** Always disable other tracks, including browser-selected tracks from an earlier video. */
export function syncEnglishSubtitles(tracks: TextTrackList | undefined, enabled: boolean) {
  if (!tracks) return;
  for (const track of Array.from(tracks)) {
    track.mode = enabled && track.language === "en" ? "showing" : "disabled";
  }
}
