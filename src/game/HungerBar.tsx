import { fullness } from "./hunger";

export function HungerBar({ value, name }: { value?: number; name: string }) {
  const remaining = fullness(value);
  return (
    <span className="hunger-bar" role="progressbar" aria-label={`Saciedade de ${name}`} aria-valuemin={0} aria-valuemax={120} aria-valuenow={remaining} title={`Saciedade: ${remaining}% · −50 por dia · −2 por ação`}>
      <span className={remaining <= 25 ? "bg-danger" : "bg-accent"} style={{ width: `${Math.min(100, remaining)}%` }} />
      {remaining > 100 && <span className="hunger-bonus" style={{ width: `${remaining - 100}%` }} />}
    </span>
  );
}
