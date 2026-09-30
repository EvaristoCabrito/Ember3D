/** Quiet tactical colors shared by the spatial and legacy renderers. */
export function tacticalGridStyle(fill: string): { fill: string; edge: string } {
  const m = /rgba?\(([^,]+),([^,]+),([^,]+)(?:,([^)]+))?\)/.exec(fill);
  const rgb = m ? `${m[1]},${m[2]},${m[3]}` : "220,230,238";
  const alpha = m?.[4] ? Number(m[4]) : 1;
  // Silver targets retain their full strength; only movement uses the faint wash.
  if (rgb === "220,226,235") return { fill, edge: "rgba(220,226,235,1)" };
  return { fill: `rgba(${rgb},${Math.min(0.12, alpha * 0.16)})`, edge: `rgba(${rgb},${Math.min(0.52, 0.18 + alpha * 0.36)})` };
}
export const GRID_MOVE = "rgba(112,174,220,0.5)";
export const GRID_ROUTE = "rgba(220,226,235,1)";
export const GRID_ALLY = "rgba(220,226,235,1)";
export const GRID_ENEMY = "rgba(231,133,115,1)";
