import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { ALL_HERO_NAMES, BAG_MAX, CLASSES, EMPTY_BAG, EQUIPMENT, EQUIPMENT_SLOTS, POTION_CARRY_MAX, RATION_STACK_MAX, RATIONS_ICON, WEAPONS, equipmentFitsSlot, equipmentIcon, equipmentStatSummary, equipmentTooltip, equipmentTypeSlotName, heroRecruited, isPlayableClassForDisplay, lockpickTooltip, offHandBlocked, partyBagCapacity, partyBagUsed, potionLabel, potionTooltip, weaponDiceLabel, weaponIcon, weaponPower, weaponRangeLabel, weaponTooltip, weaponsForClass } from "./data";
import type { ClassId, EquipSlot, PotionId, SaveData } from "./types";
import { GOLD_ICON, GoldAmount } from "./GoldAmount";
import { fullness } from "./hunger";
import { HungerBar } from "./HungerBar";

const POTIONS: PotionId[] = ["weak", "mid", "potent", "disease", "manaSmall", "manaMid", "manaLarge"];
const BAG_ICON = "/game/icons/refresh-001/packs/small-pouch.png";
const HERO_BASE_CLASS: Record<string, ClassId> = { Kael: "kaelFinal", Neera: "neera", Voss: "voss", Salazar: "salazar", Aldric: "aldric", Malrec: "conjurer" };

type DollSlot = "mainHand" | EquipSlot;
/** Inner arch niches of equipment-male/female.jpg (1168×784), measured from the
 * labeled frames: 5 left, 5 right, 2 rings under the statue. Icons sit in the
 * opening above each plaque, not over the label. */
type DollSlotPosition = { id: DollSlot; label: string; left: string; top: string; width: string; height: string };

const MALE_DOLL_SLOT_POSITIONS: DollSlotPosition[] = [
  { id: "head", label: "Cabeça", left: "16.44%", top: "14.54%", width: "6.59%", height: "5.74%" },
  { id: "neck", label: "Pescoço", left: "16.44%", top: "31.38%", width: "6.59%", height: "5.74%" },
  { id: "shoulders", label: "Ombros", left: "16.44%", top: "48.21%", width: "6.59%", height: "5.74%" },
  { id: "chest", label: "Peito", left: "16.44%", top: "65.05%", width: "6.59%", height: "5.74%" },
  { id: "hands", label: "Mãos", left: "16.44%", top: "81.89%", width: "6.59%", height: "5.74%" },
  { id: "legs", label: "Pernas", left: "77.05%", top: "14.54%", width: "6.59%", height: "5.99%" },
  { id: "feet", label: "Pés", left: "76.88%", top: "31.38%", width: "6.76%", height: "5.74%" },
  { id: "waist", label: "Cintura", left: "76.97%", top: "48.21%", width: "6.59%", height: "5.74%" },
  { id: "mainHand", label: "Mão Principal", left: "76.97%", top: "65.05%", width: "6.59%", height: "5.74%" },
  { id: "offHand", label: "Mão Secundária", left: "76.97%", top: "81.89%", width: "6.59%", height: "5.74%" },
  { id: "ring1", label: "Anel 1", left: "37.33%", top: "82.91%", width: "7.96%", height: "6.12%" },
  { id: "ring2", label: "Anel 2", left: "54.97%", top: "83.16%", width: "7.71%", height: "5.74%" },
];

const ART_ASPECT_W = 1168;
const ART_ASPECT_H = 784;

/** Positions children in % of the *drawn* art rectangle. Size is measured off the
 * host with ResizeObserver so letterboxing never shifts the slots. */
function FittedArt({
  src,
  alt,
  children,
  artW = ART_ASPECT_W,
  artH = ART_ASPECT_H,
}: {
  src: string;
  alt: string;
  children: ReactNode;
  artW?: number;
  artH?: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const fit = () => {
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      if (cw <= 0 || ch <= 0) return;
      const ratio = artW / artH;
      let w = cw;
      let h = cw / ratio;
      if (h > ch) {
        h = ch;
        w = ch * ratio;
      }
      setBox({ w, h });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [artW, artH]);
  return (
    <div ref={host} className="relative min-h-0 min-w-0 w-full flex-1">
      <div
        className="absolute overflow-hidden"
        style={{
          width: box.w,
          height: box.h,
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
        }}
      >
        <img src={src} alt={alt} className="pointer-events-none absolute inset-0 size-full object-fill" />
        {box.w > 0 ? children : null}
      </div>
    </div>
  );
}

/** Hover card that follows the cursor — `fixed` so overflow-hidden parents don't clip it. */
export function ItemTip({ text, children, className }: { text: string; children: ReactNode; className?: string }) {
  const [pos, setPos] = useState<{ x: number; top: number; bottom: number } | null>(null);
  const setAnchor = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    setPos({
      x: Math.max(136, Math.min(rect.left + rect.width / 2, window.innerWidth - 136)),
      top: rect.top,
      bottom: rect.bottom,
    });
  };
  return (
    <div
      className={className}
      onMouseEnter={(e) => setAnchor(e.currentTarget)}
      onMouseMove={(e) => setAnchor(e.currentTarget)}
      onMouseLeave={() => setPos(null)}
      onFocus={(e) => setAnchor(e.currentTarget)}
      onBlur={() => setPos(null)}
    >
      {children}
      {pos && (
        <div
          role="tooltip"
          className="pointer-events-none fixed z-[80] max-w-[16rem] whitespace-pre-line rounded-md border border-border bg-surface px-2.5 py-2 text-left text-[11px] leading-snug text-fg shadow-lg"
          style={
            pos.top > 176
              ? { left: pos.x, bottom: Math.max(8, window.innerHeight - pos.top + 10), transform: "translateX(-50%)" }
              : { left: pos.x, top: Math.min(pos.bottom + 10, window.innerHeight - 16), transform: "translateX(-50%)" }
          }
        >
          {text}
        </div>
      )}
    </div>
  );
}

/** Paper-doll equipment view for one hero. Clicking a slot opens a picker of compatible
 * OWNED items — Mão Principal lists owned weapons for this class (save.weapons), other
 * slots list owned EQUIPMENT of that slot type from the party's shared, unassigned stash
 * (save.looseEquipment) — gear found in chests lands there, never auto-equipped onto
 * whoever opened the chest, so it shows up here for the player to assign wherever they
 * want. */
export function PaperDollScreen({
  heroName,
  classId,
  save,
  onClose,
  onSwitchToBackpack,
  onOpenStatus,
  onEquipWeapon,
  onEquipItem,
  glowSlot = null,
  embedded = false,
  availableHeroes,
  onHeroChange,
}: {
  heroName: string;
  classId: ClassId;
  save: SaveData;
  onClose: () => void;
  onSwitchToBackpack?: () => void;
  onOpenStatus?: (hero: string) => void;
  onEquipWeapon?: (hero: string, weaponId: string) => void;
  onEquipItem?: (hero: string, slot: EquipSlot, itemId: string | null) => void;
  /** Briefly highlights the slot the same way the Inn glows an open location — for when a
   * weapon/item was just equipped from the Mochila's own list instead of through the
   * picker below, which otherwise gives no indication of where it landed. */
  glowSlot?: "mainHand" | EquipSlot | null;
  embedded?: boolean;
  availableHeroes?: string[];
  onHeroChange?: (name: string) => void;
}) {
  const [picker, setPicker] = useState<"mainHand" | EquipSlot | null>(null);
  const weaponId = save.equipped[heroName];
  const weapon = weaponId ? WEAPONS[weaponId] : null;
  const enh = weaponId ? (save.weapons[weaponId] ?? 0) : 0;
  const equip = save.equipment[heroName] ?? {};
  const femaleDoll = heroName === "Neera";
  const dollImage = femaleDoll ? "/game/ui/equipment-female.jpg" : "/game/ui/equipment-male.jpg";
  const dollSlotPositions = MALE_DOLL_SLOT_POSITIONS;
  const wearerOf = (itemId: string) => Object.entries(save.equipment).find(([, slots]) => Object.values(slots).includes(itemId))?.[0];
  const ownedWeapons = [...weaponsForClass(classId)].filter((w) => save.weapons[w.id] != null).sort((a, b) => weaponPower(a) - weaponPower(b));

  return (
    <div
      className={embedded ? "equipment-backdrop relative z-0 h-full min-w-0 overflow-hidden" : "equipment-backdrop absolute inset-0 z-40 flex items-center justify-center p-2"}
      onClick={(e) => {
        if (!embedded && e.target === e.currentTarget) onClose();
      }}
    >
      <div className="equipment-surface flex h-full min-h-0 w-full flex-col overflow-hidden ember-window p-2">
        <div className="mb-2 flex shrink-0 items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            {/* Back always sits at the far left, across every screen, so it never gets lost. */}
            <button type="button" onClick={onClose} className="h-9 px-3 flex items-center gap-1.5 rounded-md border border-border bg-bg/80 text-xs" aria-label="Voltar">
              <ChevronLeft className="size-4" /> Voltar
            </button>
            <div>
              <p className="font-display text-xl leading-tight">{heroName}</p>
              <p className="text-xs text-muted">{CLASSES[classId].name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onOpenStatus && (
              <button type="button" onClick={() => onOpenStatus(heroName)} className="h-9 px-3 rounded-md border border-border bg-bg text-xs">
                Status
              </button>
            )}
            {availableHeroes && availableHeroes.length > 1 && onHeroChange && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onHeroChange(availableHeroes[(availableHeroes.indexOf(heroName) - 1 + availableHeroes.length) % availableHeroes.length]!)}
                  className="size-9 grid place-items-center rounded-md border border-border bg-bg"
                  aria-label="Personagem anterior"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onHeroChange(availableHeroes[(availableHeroes.indexOf(heroName) + 1) % availableHeroes.length]!)}
                  className="size-9 grid place-items-center rounded-md border border-border bg-bg"
                  aria-label="Próximo personagem"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
            )}
            {onSwitchToBackpack && (
              <button type="button" onClick={onSwitchToBackpack} className="h-12 px-3 rounded-md border border-border text-xs flex items-center gap-2">
                <img src={BAG_ICON} alt="" className="size-8 shrink-0 rounded-sm object-contain" />
                Mochila
              </button>
            )}
          </div>
        </div>

        {availableHeroes && availableHeroes.length > 1 && (
          <div className="mb-2 flex shrink-0 flex-wrap gap-1.5" aria-label="Personagem do equipamento">
            {availableHeroes.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => onHeroChange?.(name)}
                className={`rounded-md border px-3 py-1.5 text-xs ${name === heroName ? "border-accent bg-accent/15 text-fg" : "border-border bg-bg/75 text-muted"}`}
              >
                {name}
              </button>
            ))}
          </div>
        )}

        <FittedArt
          src={dollImage}
          alt={`Equipamento de ${heroName}`}
          artW={femaleDoll ? 1712 : ART_ASPECT_W}
          artH={femaleDoll ? 1152 : ART_ASPECT_H}
        >
          {dollSlotPositions.map((slot) => {
            const isWeapon = slot.id === "mainHand";
            const itemId = isWeapon ? weaponId : equip[slot.id as EquipSlot];
            const item = !isWeapon && itemId ? EQUIPMENT[itemId] : null;
            const icon = isWeapon && weapon ? weaponIcon(weapon.id) : item ? equipmentIcon(item.id) : null;
            const tip = isWeapon
              ? weapon ? weaponTooltip(weapon, enh) : `${slot.label} · vazia`
              : item ? equipmentTooltip(item) : `${slot.label} · vazio`;
            return (
              <div key={slot.id} className="absolute" style={{ left: slot.left, top: slot.top, width: slot.width, height: slot.height }}>
                <ItemTip text={tip} className="block h-full w-full">
                  <button
                    type="button"
                    onClick={() => setPicker(slot.id)}
                    className={`flex size-full items-center justify-center overflow-hidden rounded-sm border border-transparent transition-colors hover:border-accent/80 focus-visible:border-accent ${isWeapon ? "bg-black" : "hover:bg-bg/35"} ${glowSlot === slot.id ? "inn-open" : ""}`}
                    aria-label={`${slot.label}: ${isWeapon ? weapon?.name ?? "vazia" : item?.name ?? "vazio"}`}
                  >
                    {icon ? (
                      <img src={icon} alt="" className="max-h-[96%] max-w-[96%] object-contain drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]" />
                    ) : null}
                  </button>
                </ItemTip>
              </div>
            );
          })}
        </FittedArt>
      </div>

      {picker != null && (
        <div
          className="absolute inset-0 z-50 ember-veil flex items-center justify-center p-3"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPicker(null);
          }}
        >
          <div className="w-full max-w-sm max-h-[80dvh] overflow-y-auto ember-window rounded-xl p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <p className="font-display text-lg leading-tight">{picker === "mainHand" ? "Mão Principal" : EQUIPMENT_SLOTS.find((s) => s.id === picker)?.label}</p>
              <button type="button" onClick={() => setPicker(null)} className="size-8 grid place-items-center rounded-md border border-border" aria-label="Fechar">
                <X className="size-4" />
              </button>
            </div>

            {picker === "mainHand" ? (
              <>
                {weapon && onEquipWeapon && (
                  <button
                    type="button"
                    onClick={() => {
                      onEquipWeapon(heroName, "");
                      setPicker(null);
                    }}
                    className="w-full mb-2 rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-left"
                  >
                    Desequipar
                  </button>
                )}
                {ownedWeapons.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  {ownedWeapons.map((w) => (
                    <ItemTip key={w.id} text={weaponTooltip(w, save.weapons[w.id] ?? 0)}>
                      <button
                        type="button"
                        onClick={() => {
                          onEquipWeapon?.(heroName, w.id);
                          setPicker(null);
                        }}
                        disabled={w.id === weaponId}
                        className="w-full flex items-center gap-2 bg-black border border-border rounded-md px-2 py-1.5 text-left disabled:opacity-50"
                      >
                        <img src={weaponIcon(w.id)} alt="" className="size-12 shrink-0 object-contain" />
                        <span className="flex-1 text-sm min-w-0">
                          {w.name} {save.weapons[w.id] ? `+${save.weapons[w.id]}` : ""}
                          <span className="block text-[11px] text-muted tabular-nums">
                            {weaponDiceLabel(w.id)} · {weaponRangeLabel(w.id)}
                          </span>
                          {w.bonusClass && isPlayableClassForDisplay(w.bonusClass) && (
                            <span className={`block text-[11px] tabular-nums ${w.bonusClass === classId ? "text-accent" : "text-muted"}`}>
                              +10% dano · {CLASSES[w.bonusClass].name}
                            </span>
                          )}
                        </span>
                        {w.id === weaponId && <span className="text-[11px] text-muted shrink-0">Equipada</span>}
                      </button>
                    </ItemTip>
                  ))}
                </div>
                ) : (
                  <p className="text-sm text-muted">Nenhuma arma no saco ainda. Compre uma com o Ferreiro.</p>
                )}
              </>
            ) : picker === "offHand" && offHandBlocked(weaponId ?? null) ? (
              <p className="text-sm text-muted">Arma principal de duas mãos — sem mão livre para a secundária.</p>
            ) : (
              (() => {
                const slot = picker as EquipSlot;
                const otherRing = slot === "ring1" ? equip.ring2 : slot === "ring2" ? equip.ring1 : undefined;
                const options = Object.values(EQUIPMENT).filter(
                  (it) =>
                    equipmentFitsSlot(it, slot) &&
                    ((save.looseEquipment[it.id] ?? 0) > 0 || !!wearerOf(it.id)) &&
                    (!it.usableBy || it.usableBy.includes(classId)),
                );
                const wornHere = equip[slot];
                return (
                  <div className="flex flex-col gap-1.5">
                    {wornHere && onEquipItem && (
                      <button
                        type="button"
                        onClick={() => {
                          onEquipItem(heroName, slot, null);
                          setPicker(null);
                        }}
                        className="w-full rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-left"
                      >
                        Desequipar
                      </button>
                    )}
                    {options.length > 0 ? (
                      options.map((it) => {
                        const equipped = equip[slot] === it.id;
                        const owned = save.looseEquipment[it.id] ?? 0;
                        const wearer = wearerOf(it.id);
                        const onOtherFinger = otherRing === it.id && owned <= 0;
                        return (
                          <ItemTip key={it.id} text={equipmentTooltip(it)}>
                            <button
                              type="button"
                              disabled={equipped || onOtherFinger || !onEquipItem}
                              onClick={() => {
                                onEquipItem?.(heroName, slot, it.id);
                                setPicker(null);
                              }}
                              className="w-full flex items-center gap-2 bg-bg border border-border rounded-md px-2 py-1.5 text-left disabled:opacity-50"
                            >
                              <img src={equipmentIcon(it.id)} alt="" className="size-9 rounded-sm object-cover shrink-0" />
                              <span className="flex-1 text-sm min-w-0">
                                {it.name} {owned > 1 ? `×${owned}` : ""}
                                <span className="block text-[10px] uppercase tracking-wide text-muted">{equipmentTypeSlotName(it)}</span>
                                <span className="block text-[11px] text-muted">
                                  {it.kind === "shield"
                                    ? `Investida de Escudo · ${Math.round((it.dmgMul ?? 0.75) * 100)}% dano · 70% atordoa`
                                    : it.kind === "weapon"
                                      ? `${it.dice}D${it.faces} · Mão secundária`
                                      : equipmentStatSummary(it)}
                                </span>
                              </span>
                              {equipped && <span className="text-[11px] text-muted shrink-0">Equipado</span>}
                              {onOtherFinger && <span className="text-[11px] text-muted shrink-0">já no outro anel</span>}
                              {!equipped && !onOtherFinger && wearer && <span className="text-[11px] text-muted shrink-0">em {wearer}</span>}
                            </button>
                          </ItemTip>
                        );
                      })
                    ) : (
                      <p className="text-sm text-muted">Nenhum item na Mochila para esse espaço ainda.</p>
                    )}
                  </div>
                );
              })()
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Backpack overview: this hero's potions/gazuas plus the party's shared weapon and equipment stash. */
export function BackpackScreen({
  heroName,
  classId,
  save,
  onClose,
  onSwitchToDoll,
  onOpenStatus,
  onEquipWeapon,
  onEquipItem,
  embedded = false,
  availableHeroes,
  onHeroChange,
  onUseRation,
  onUseRationAll,
  test,
}: {
  heroName: string;
  onUseRation?: (hero: string) => void;
  /** "Alimentar todos" — one ration per hero in availableHeroes, off the shared party
   * stock. Omit to leave the button off (see PartyInventoryOverlay's doc on this prop). */
  onUseRationAll?: (heroes: string[]) => number;
  /** Modo teste: bag capacity counts every named hero, not just whoever the story has
   * recruited yet — same god-mode rule as everywhere else. */
  test?: boolean;
  classId?: ClassId;
  save: SaveData;
  onClose: () => void;
  onSwitchToDoll?: () => void;
  onOpenStatus?: (hero: string) => void;
  /** Clicking a weapon here equips it straight onto this hero — only offered when the
   * weapon actually fits their class (see weaponsForClass below). */
  onEquipWeapon?: (hero: string, weaponId: string) => void;
  /** Same, for a piece of shared Equipamento — only offered when it fits the hero's class
   * and a slot for it is actually free to pick automatically (see targetSlotFor below). */
  onEquipItem?: (hero: string, slot: EquipSlot, itemId: string | null) => void;
  embedded?: boolean;
  /** Same hero-switcher the doll view offers — whoever's bag/potions are shown here can be
   * changed without leaving to the doll first. Whatever roster this is given (today's four
   * or a future longer one) just flows through: this wraps, it doesn't assume a count. */
  availableHeroes?: string[];
  onHeroChange?: (name: string) => void;
}) {
  const [rationNote, setRationNote] = useState<string | null>(null);
  useEffect(() => {
    if (!rationNote) return;
    const timer = window.setTimeout(() => setRationNote(null), 2200);
    return () => window.clearTimeout(timer);
  }, [rationNote]);
  const bag = save.bags[heroName] ?? EMPTY_BAG;
  const weaponEntries = Object.entries(save.weapons).filter(([id]) => {
    const wielder = Object.entries(save.equipped).find(([, v]) => v === id)?.[0];
    return !wielder || heroRecruited(wielder, save.completed);
  });
  const wearerOf = (id: string) =>
    Object.entries(save.equipment).find(([, slots]) => Object.values(slots).includes(id))?.[0];
  const sharedEquipmentIds = new Set([
    ...Object.keys(save.looseEquipment),
    ...Object.values(save.equipment).flatMap((slots) => Object.values(slots)),
  ]);
  const equipmentEntries = [...sharedEquipmentIds]
    .map((id) => [
      id,
      (save.looseEquipment[id] ?? 0) + Object.values(save.equipment).reduce((total, slots) => total + Object.values(slots).filter((equippedId) => equippedId === id).length, 0),
    ] as const)
    .filter(([id]) => {
      const wearer = wearerOf(id);
      return !wearer || heroRecruited(wearer, save.completed);
    });
  // Shared stash: unequipped weapons + loose gear. Potions/gazuas stay per-hero and
  // never count. Each physical piece takes one cell — copies do not stack.
  const bagCount = partyBagUsed(save);
  const bagCapacity = partyBagCapacity(save, test);
  const heroEquip = save.equipment[heroName] ?? {};
  /** Which slot a click-to-equip should fill: rings pick whichever finger is free (ring1
   * first), everything else has exactly one slot — except offHand, which has none at all
   * while the main hand holds a two-handed weapon. Returns null when there's nowhere for
   * it to go automatically (the picker on the doll itself still handles that case). */
  const targetSlotFor = (item: (typeof EQUIPMENT)[string]): EquipSlot | null => {
    if (item.slot === "ring1" || item.slot === "ring2") return heroEquip.ring1 ? "ring2" : "ring1";
    if (item.slot === "offHand" && offHandBlocked(save.equipped[heroName] ?? null)) return null;
    return item.slot;
  };
  const backpackEntries: {
    key: string;
    name: string;
    icon: string;
    tip: string;
    count?: number;
    isWeapon?: boolean;
    onClick?: () => void;
  }[] = [];
  // Rations always come first — a stack per RATION_STACK_MAX, so the first stack pins to
  // slot 1, the second to slot 2 and so on, and the whole run vanishes the moment
  // save.rations hits 0 freeing those slots back up. Not equippable, so no onClick.
  const rationStacks = Math.ceil(save.rations / RATION_STACK_MAX);
  for (let i = 0; i < rationStacks; i++) {
    const count = Math.min(RATION_STACK_MAX, save.rations - i * RATION_STACK_MAX);
    backpackEntries.push({
      key: `rations:${i}`,
      name: "Rações",
      icon: RATIONS_ICON,
      tip: `${count} rações · usar 1 para encher a saciedade de ${heroName} até 100%. Atual: ${fullness(save.heroHunger[heroName])}%.`,
      count,
      onClick: onUseRation && fullness(save.heroHunger[heroName]) < 100 ? () => onUseRation(heroName) : undefined,
    });
  }
  for (const [id, enh] of weaponEntries) {
    const w = WEAPONS[id];
    if (!w || Object.values(save.equipped).includes(id)) continue;
    const fitsClass = !!classId && weaponsForClass(classId).some((candidate) => candidate.id === id);
    backpackEntries.push({
      key: `weapon:${id}`,
      name: `${w.name}${enh > 0 ? ` +${enh}` : ""}`,
      icon: weaponIcon(id),
      tip: weaponTooltip(w, enh),
      isWeapon: true,
      onClick: onEquipWeapon && fitsClass ? () => onEquipWeapon(heroName, id) : undefined,
    });
  }
  for (const [id] of equipmentEntries) {
    const item = EQUIPMENT[id];
    const count = save.looseEquipment[id] ?? 0;
    if (!item || count <= 0) continue;
    const fitsClass = !!classId && (!item.usableBy || item.usableBy.includes(classId));
    const targetSlot = targetSlotFor(item);
    for (let copy = 0; copy < count; copy++) {
      backpackEntries.push({
        key: `equipment:${id}:${copy}`,
        name: item.name,
        icon: equipmentIcon(id),
        tip: equipmentTooltip(item),
        onClick: onEquipItem && fitsClass && targetSlot ? () => onEquipItem(heroName, targetSlot, id) : undefined,
      });
    }
  }

  return (
    <div
      className={embedded ? "relative z-0 h-full min-w-0 overflow-hidden" : "absolute inset-0 z-40 flex items-center justify-center ember-veil p-2"}
      onClick={(e) => {
        if (!embedded && e.target === e.currentTarget) onClose();
      }}
    >
      <div className="backpack-window flex h-full min-h-0 w-full flex-col overflow-hidden ember-window p-2">
        <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {/* Back always sits at the far left, across every screen, so it never gets lost. */}
            <button type="button" onClick={onClose} className="h-9 px-3 flex items-center gap-1.5 rounded-md border border-border bg-bg text-xs" aria-label="Voltar">
              <ChevronLeft className="size-4" /> Voltar
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <img src={BAG_ICON} alt="" className="size-9 shrink-0 object-contain" />
                <h2 className="font-display text-2xl leading-none">Mochila</h2>
              </div>
              <p className="mt-1 text-xs text-muted">{heroName} · clique nas rações para comer ou num item para equipar</p>
              <HungerBar name={heroName} value={save.heroHunger[heroName]} />
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {rationNote && <p className="text-xs text-accent">{rationNote}</p>}
            {onUseRationAll && availableHeroes && availableHeroes.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  const fed = onUseRationAll(availableHeroes);
                  setRationNote(
                    fed === 0
                      ? "Ninguém comeu — sem rações ou já saciados."
                      : fed === availableHeroes.length
                        ? "Todos comeram."
                        : `${fed} comeram — rações não deram pros demais.`,
                  );
                }}
                className="h-9 px-3 rounded-md border border-border bg-bg text-xs"
              >
                Alimentar todos
              </button>
            )}
            {onOpenStatus && (
              <button type="button" onClick={() => onOpenStatus(heroName)} className="h-9 px-3 rounded-md border border-border bg-bg text-xs">
                Status
              </button>
            )}
            {availableHeroes && availableHeroes.length > 1 && onHeroChange && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onHeroChange(availableHeroes[(availableHeroes.indexOf(heroName) - 1 + availableHeroes.length) % availableHeroes.length]!)}
                  className="size-9 grid place-items-center rounded-md border border-border bg-bg"
                  aria-label="Personagem anterior"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onHeroChange(availableHeroes[(availableHeroes.indexOf(heroName) + 1) % availableHeroes.length]!)}
                  className="size-9 grid place-items-center rounded-md border border-border bg-bg"
                  aria-label="Próximo personagem"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
            )}
            <p className={`rounded-md border border-border bg-bg px-2.5 py-1.5 text-sm tabular-nums ${bagCount >= bagCapacity ? "text-danger" : "text-fg"}`}>
              {bagCount} / {bagCapacity}
            </p>
            {onSwitchToDoll && (
              <button type="button" onClick={onSwitchToDoll} className="h-9 px-3 rounded-md border border-border bg-bg text-xs">
                Equipar
              </button>
            )}
          </div>
        </div>

        {availableHeroes && availableHeroes.length > 1 && onHeroChange && (
          <div className="mb-2 flex shrink-0 flex-wrap gap-1.5" aria-label="Personagem da mochila">
            {availableHeroes.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => onHeroChange(name)}
                className={`rounded-md border px-3 py-1.5 text-xs ${name === heroName ? "border-accent bg-accent/15 text-fg" : "border-border bg-bg/75 text-muted"}`}
              >
                {name}
              </button>
            ))}
          </div>
        )}

        <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-bg/45 shadow-inner backdrop-blur-[1px]">
          <div className="relative h-full overflow-y-auto p-4">
            <p className="mb-2 text-xs uppercase tracking-[0.18em] text-muted">Itens da party</p>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
              {Array.from({ length: bagCapacity }, (_, index) => {
                const entry = backpackEntries[index];
                const inner = entry ? (
                  <>
                    <img src={entry.icon} alt="" className="pointer-events-none max-h-[96%] max-w-[96%] object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.85)]" />
                    {entry.count != null && entry.count > 1 && (
                      <span className="pointer-events-none absolute bottom-0.5 right-0.5 rounded bg-black/80 px-1 text-[10px] font-medium leading-tight tabular-nums text-fg">
                        {entry.count}
                      </span>
                    )}
                  </>
                ) : null;
                const slotClass = `relative flex aspect-square w-full items-center justify-center rounded-md border border-border/80 shadow-inner backdrop-blur-[2px] ${entry?.isWeapon ? "bg-black" : "bg-bg/70"}`;
                if (entry?.onClick) {
                  return (
                    <ItemTip key={entry.key} text={entry.tip} className="block">
                      <button type="button" onClick={entry.onClick} className={`${slotClass} hover:border-accent`} aria-label={`Equipar ${entry.name}`}>
                        {inner}
                      </button>
                    </ItemTip>
                  );
                }
                if (entry) {
                  return (
                    <ItemTip key={entry.key} text={entry.tip} className="block">
                      <div className={slotClass}>{inner}</div>
                    </ItemTip>
                  );
                }
                return <div key={`empty-${index}`} className={slotClass} aria-hidden />;
              })}
            </div>

            <p className="mt-5 mb-2 text-xs uppercase tracking-[0.18em] text-muted">Poções e gazua de {heroName}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {POTIONS.map((kind) => (
                <ItemTip key={kind} text={potionTooltip(kind)} className="block">
                  <div className="flex items-center gap-2 rounded-md border border-border/80 bg-bg/75 px-2 py-1.5 backdrop-blur-[2px]">
                    <img src={`/game/icons/potion-${kind}.png?v=ds2`} alt="" className="size-8 shrink-0 object-contain" />
                    <p className="min-w-0 flex-1 truncate text-xs">
                      {potionLabel(kind)}
                      <span className="block text-[10px] uppercase tracking-wide text-muted">
                        {bag[kind] ?? 0} / {POTION_CARRY_MAX[kind]}
                      </span>
                    </p>
                  </div>
                </ItemTip>
              ))}
              <ItemTip text={lockpickTooltip()} className="block">
                <div className="flex items-center gap-2 rounded-md border border-border/80 bg-bg/75 px-2 py-1.5 backdrop-blur-[2px]">
                  <img src="/game/icons/lockpick.png" alt="" className="size-8 shrink-0 object-contain" />
                  <p className="min-w-0 flex-1 truncate text-sm">
                    Gazua
                    <span className="block text-[10px] uppercase tracking-wide text-muted">
                      {bag.lockpick ?? 0} / {BAG_MAX}
                    </span>
                  </p>
                </div>
              </ItemTip>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** One inventory action opens the hero's personal consumables beside the party's equipment
 * sheet. The grid never exceeds its container; narrow screens stack vertically instead of
 * producing a horizontal scrollbar. */
export function PartyInventoryOverlay({
  heroName,
  classId,
  save,
  test,
  onClose,
  onEquipWeapon,
  onEquipItem,
  initialView = "equipment",
  onUseRation,
  onUseRationAll,
  onOpenStatus,
}: {
  heroName: string;
  onUseRation?: (hero: string) => void;
  /** Mochila's "Alimentar todos" — one ration per hero currently in the switcher, off the
   * shared party stock. Omit to leave the button off entirely (battle, say, where rations
   * come out of loot too and need per-unit bookkeeping this bulk action doesn't do). */
  onUseRationAll?: (heroes: string[]) => number;
  onOpenStatus?: (hero: string) => void;
  classId: ClassId;
  save: SaveData;
  /** Modo teste: every hero shows in the switcher regardless of story recruitment, same
   * freedom test mode gives everywhere else — see the RPG map's party row and the Smith's
   * own hero selector. */
  test?: boolean;
  onClose: () => void;
  onEquipWeapon?: (hero: string, weaponId: string) => void;
  onEquipItem?: (hero: string, slot: EquipSlot, itemId: string | null) => void;
  initialView?: "equipment" | "backpack";
}) {
  // Equipping straight from the Mochila's shared lists (rather than through a picker on
  // the doll itself) has no other feedback showing where it landed — with a long list,
  // "which slot did that just fill?" isn't obvious. Flash the same glow the Inn uses for
  // a couple seconds on the slot it just filled.
  const [glowSlot, setGlowSlot] = useState<"mainHand" | EquipSlot | null>(null);
  const [view, setView] = useState<"equipment" | "backpack">(initialView);
  const [selectedHero, setSelectedHero] = useState(heroName);
  const availableHeroes = ALL_HERO_NAMES.filter((name) => test || heroRecruited(name, save.completed));
  const selectedClass = save.promotions[selectedHero] ?? HERO_BASE_CLASS[selectedHero] ?? classId;
  const glowTimer = useRef<number | null>(null);
  const flashGlow = (slot: "mainHand" | EquipSlot) => {
    if (glowTimer.current !== null) window.clearTimeout(glowTimer.current);
    setGlowSlot(slot);
    glowTimer.current = window.setTimeout(() => setGlowSlot(null), 1800);
  };
  const handleEquipWeapon = (hero: string, weaponId: string) => {
    onEquipWeapon?.(hero, weaponId);
    if (weaponId) flashGlow("mainHand");
  };
  const handleEquipItem = (hero: string, slot: EquipSlot, itemId: string | null) => {
    onEquipItem?.(hero, slot, itemId);
    if (itemId) flashGlow(slot);
  };
  useEffect(() => () => {
    if (glowTimer.current !== null) window.clearTimeout(glowTimer.current);
  }, []);
  return (
    <div
      className="absolute inset-0 z-40 ember-veil p-0 sm:p-2"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="h-full w-full min-w-0 overflow-hidden">
        {view === "backpack" ? (
          <BackpackScreen
            heroName={selectedHero}
            classId={selectedClass}
            save={save}
            test={test}
            onUseRation={onUseRation}
            onUseRationAll={onUseRationAll}
            onOpenStatus={onOpenStatus}
            onClose={onClose}
            onSwitchToDoll={() => setView("equipment")}
            onEquipWeapon={onEquipWeapon && handleEquipWeapon}
            onEquipItem={onEquipItem && handleEquipItem}
            availableHeroes={availableHeroes}
            onHeroChange={setSelectedHero}
            embedded
          />
        ) : (
          <PaperDollScreen
            heroName={selectedHero}
            classId={selectedClass}
            save={save}
            onClose={onClose}
            onSwitchToBackpack={() => setView("backpack")}
            onOpenStatus={onOpenStatus}
            onEquipWeapon={onEquipWeapon}
            onEquipItem={onEquipItem}
            glowSlot={glowSlot}
            availableHeroes={availableHeroes}
            onHeroChange={setSelectedHero}
            embedded
          />
        )}
      </div>
    </div>
  );
}
