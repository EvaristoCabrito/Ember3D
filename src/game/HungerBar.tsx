import { fullness } from "./hunger";

export function HungerBar({ value, name, travel = false }: { value?: number; name: string; travel?: boolean }) {
  const remaining = fullness(value);
  const label = `Saciedade: ${Number(remaining.toFixed(1))}%`;
  const cost = travel ? "Estrada (6h): −12,5 · Planície (12h): −25 · Floresta (24h): −50 · Montanha/caverna (36h): −75" : "−50 por dia · −2 por ação";
  return (
    <span className="hunger-bar" role="progressbar" aria-label={`Saciedade de ${name}`} aria-valuemin={0} aria-valuemax={120} aria-valuenow={remaining} aria-valuetext={`${label} · ${cost}`} title={`${label} · ${cost}`}>
      <span className={remaining <= 25 ? "bg-danger" : "bg-accent"} style={{ width: `${(Math.min(100, remaining) / 120) * 100}%` }} />
      {remaining > 100 && <span className="hunger-bonus" style={{ width: `${((remaining - 100) / 120) * 100}%` }} />}
    </span>
  );
}
