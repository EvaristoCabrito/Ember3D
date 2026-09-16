import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BAG_MAX, CLASSES, EQUIPMENT, HERO_NAMES, LOCKPICK_PRICE, POTION_CARRY_MAX, POTION_PRICE, RATION_STACK_MAX, RATIONS_ICON, RATIONS_PRICE, WEAPON_MAX_ENH, WEAPONS, equipmentIcon, equipmentTooltip, equipmentTypeSlotName, heroRecruited, isPlayableClassForDisplay, isPouch, lockpickTooltip, partyBagHasRoom, partyPouchId, potionTooltip, pouchIcon, weaponDiceLabel, weaponEnhCost, weaponIcon, weaponPower, weaponRangeLabel, weaponSellValue, weaponTooltip, potionLabel } from "./data";
import { ItemTip, PartyInventoryOverlay } from "./InventoryScreens";
import type { Bag, ClassId, EquipSlot, PotionId, SaveData } from "./types";
import { GoldAmount } from "./GoldAmount";
import { playTheme, sfxPlay, stopMusic, unlockAudio } from "./audio";
import { fullness, INN_MEAL_PRICE } from "./hunger";
import { HungerBar } from "./HungerBar";

const BAG_ICON = pouchIcon(null);

const NPCS = [
  {
    id: "brue",
    name: "Brue",
    role: "Estalajadeiro",
    portrait: "/game/portraits/brue.png",
    talk: "O fogo ainda pega. As camas, não. Gold compra o que sobrou da adega. Salazar pode levar frasco — não precisa, mas o copo não recusa.",
    shop: true,
  },
  {
    id: "mudo",
    name: "O Mudo",
    role: "Viajante",
    portrait: "/game/portraits/mudo.png",
    talk: "Ele não fala. Nunca. Carrega uma pequena tábua de madeira e um pedaço de giz, e usa-a para responder quando não pode simplesmente apontar ou ir embora. Na tábua, uma frase aparece repetidamente: “Não fique parado por muito tempo.” Ninguém sabe de onde ele veio. Conhece estradas que não aparecem em mapa algum e parece sempre estar a caminho de algum lugar. Quando perguntam quanto custa uma bebida na velha adega, ele escreve apenas: “Ainda tem preço.”",
    shop: false,
  },
  {
    id: "porao",
    name: "A Hóspede",
    role: "Porão",
    portrait: "/game/portraits/porao.png",
    talk: "Não subo. O chão me conhece. Tragam histórias, não luz. Se Brue ainda mede Gold, o mundo não acabou.",
    shop: false,
  },
] as const;

const POTION_ORDER: PotionId[] = ["weak", "mid", "potent", "disease", "manaSmall", "manaMid", "manaLarge"];

const ICONS: Record<PotionId, string> = {
  weak: "/game/icons/potion-weak.png",
  mid: "/game/icons/potion-mid.png",
  potent: "/game/icons/potion-potent.png",
  disease: "/game/icons/potion-disease.png",
  manaSmall: "/game/icons/potion-manaSmall.png?v=ds2",
  manaMid: "/game/icons/potion-manaMid.png?v=ds2",
  manaLarge: "/game/icons/potion-manaLarge.png?v=ds2",
};

const EMPTY_CART: Record<PotionId, number> = { weak: 0, mid: 0, potent: 0, disease: 0, manaSmall: 0, manaMid: 0, manaLarge: 0 };

/** Aldric and Malrec join later in the story but aren't in HERO_NAMES yet, so they normally
 * never appear in the Inn/Smith. Test mode appends them so their gear/weapon compatibility
 * can be reviewed ahead of that. */
const TEST_EXTRA_HERO_NAMES = ["Aldric", "Malrec"] as const;

export function InnScreen({
  onUseRation,
  onUseRationAll,
  onBuyMeal,
  onBuyMealAll,
  onOpenStatus,
  bags,
  ember,
  muted,
  weapons,
  equipped,
  heroClass,
  save,
  test,
  onMute,
  onLeave,
  onPay,
  onBuyRations,
  onBuyWeapon,
  onBuyEquipment,
  onEquipWeapon,
  onEquipItem,
  onUsePotion,
  onDiscardWeapon,
  onDiscardEquipment,
  onDiscardRation,
  onDiscardBagItem,
  onUpgradeWeapon,
  onSellWeapon,
  onSeenSmithIntro,
}: {
  bags: Record<string, Bag>;
  onUseRation: (hero: string) => void;
  onUseRationAll?: (heroes: string[]) => number;
  onBuyMeal: (hero: string) => boolean;
  /** Feeds every hero currently shown in the Adega's hero row in one go, cheapest way to
   * clear hunger for the whole party — same per-hero price and 120% cap as Comer, just
   * skips whoever's already full or has no Gold left by the time their turn comes.
   * Returns how many actually ate, for the note text. */
  onBuyMealAll: (heroes: string[]) => number;
  onOpenStatus: (hero: string) => void;
  ember: number;
  muted: boolean;
  weapons: Record<string, number>;
  equipped: Record<string, string>;
  heroClass: Record<string, ClassId>;
  save: SaveData;
  /** Test/review mode — the Smith stocks every weapon, item, and piece of gear in the game. */
  test?: boolean;
  onMute: () => void;
  onLeave: () => void;
  onPay: (hero: string, cart: Record<PotionId, number>, lockpicks: number) => boolean;
  /** Party-wide, unlike onPay's per-hero cart — rations don't belong to one hero. */
  onBuyRations: (qty: number) => boolean;
  onBuyWeapon: (hero: string, weaponId: string) => boolean;
  onBuyEquipment: (itemId: string) => boolean;
  onEquipWeapon: (hero: string, weaponId: string) => void;
  onEquipItem?: (hero: string, slot: EquipSlot, itemId: string | null) => void;
  onUsePotion?: (hero: string, kind: PotionId) => void;
  onDiscardWeapon?: (weaponId: string) => void;
  onDiscardEquipment?: (itemId: string) => void;
  onDiscardRation?: () => void;
  onDiscardBagItem?: (hero: string, kind: PotionId | "lockpick") => void;
  onUpgradeWeapon: (weaponId: string) => boolean;
  onSellWeapon: (weaponId: string) => number | false;
  onSeenSmithIntro: () => void;
}) {
  const [view, setView] = useState<"npc" | "smith">("npc");
  const [smithIntro, setSmithIntro] = useState(false);
  const [npc, setNpc] = useState<(typeof NPCS)[number]>(NPCS[0]);
  const [hero, setHero] = useState<string>("Kael");
  const [cart, setCart] = useState<Record<PotionId, number>>({ ...EMPTY_CART });
  const [lockpickQty, setLockpickQty] = useState(0);
  const [rationsQty, setRationsQty] = useState(0);
  const [rationsNote, setRationsNote] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [invView, setInvView] = useState<"doll" | "pack" | null>(null);
  useEffect(() => {
    if (!note) return;
    const timer = window.setTimeout(() => setNote(null), 2200);
    return () => window.clearTimeout(timer);
  }, [note]);
  useEffect(() => {
    if (!rationsNote) return;
    const timer = window.setTimeout(() => setRationsNote(null), 2200);
    return () => window.clearTimeout(timer);
  }, [rationsNote]);
  const bag = bags[hero] ?? { mid: 0, weak: 0, potent: 0, disease: 0, manaSmall: 0, manaMid: 0, manaLarge: 0, lockpick: 0 };
  // Same roster the Adega's own hero-selector row shows — Todos feeds exactly whoever
  // Comer could already feed one at a time, never a hero outside that list.
  const partyRoster = useMemo(
    () =>
      (test ? [...HERO_NAMES, ...TEST_EXTRA_HERO_NAMES] : HERO_NAMES).filter((name) => test || heroRecruited(name, save.completed)),
    [test, save.completed],
  );

  const total = useMemo(
    () => POTION_ORDER.reduce((n, kind) => n + cart[kind] * POTION_PRICE[kind], 0) + lockpickQty * LOCKPICK_PRICE,
    [cart, lockpickQty],
  );
  const items = POTION_ORDER.reduce((n, kind) => n + cart[kind], 0) + lockpickQty;
  const remain = ember - total;

  const add = (kind: PotionId, delta: number) => {
    setNote(null);
    setCart((prev) => {
      const next = Math.max(0, (prev[kind] ?? 0) + delta);
      const have = bag[kind] ?? 0;
      const cap = Math.max(0, POTION_CARRY_MAX[kind] - have);
      return { ...prev, [kind]: Math.min(next, cap) };
    });
  };

  const addLockpick = (delta: number) => {
    setNote(null);
    setLockpickQty((prev) => {
      const next = Math.max(0, prev + delta);
      const cap = Math.max(0, BAG_MAX - (bag.lockpick ?? 0));
      return Math.min(next, cap);
    });
  };

  const pay = () => {
    if (items <= 0) {
      setNote("Nada no copo.");
      return;
    }
    if (remain < 0) {
      setNote(`Faltam ${-remain} Gold.`);
      return;
    }
    const ok = onPay(hero, cart, lockpickQty);
    if (!ok) {
      setNote("Brue recusou. Gold ou espaço.");
      return;
    }
    setCart({ ...EMPTY_CART });
    setLockpickQty(0);
    setNote("Pago. Os frascos foram para o saco.");
  };

  // Party-wide, so it's a separate small purchase rather than folded into pay()'s
  // per-hero cart — there's no hero to charge it to.
  const buyRations = () => {
    if (rationsQty <= 0) {
      setRationsNote("Nada no carrinho.");
      return;
    }
    const ok = onBuyRations(rationsQty);
    if (!ok) {
      setRationsNote("Brue recusou. Gold ou espaço na mochila.");
      return;
    }
    setRationsQty(0);
    setRationsNote("Pago. As rações foram para a mochila.");
  };

  const finishSmithIntro = () => {
    setSmithIntro(false);
    onSeenSmithIntro();
    setView("smith");
    if (!muted) playTheme("inn");
  };

  const enterSmith = () => {
    unlockAudio();
    sfxPlay.ui();
    if (save.seenSmithIntro) {
      setView("smith");
      return;
    }
    stopMusic();
    setSmithIntro(true);
  };

  if (smithIntro) {
    return <SmithIntroScreen muted={muted} onSkip={finishSmithIntro} />;
  }

  if (view === "smith") {
    return (
      <SmithPanel
        ember={ember}
        muted={muted}
        weapons={weapons}
        equipped={equipped}
        heroClass={heroClass}
        save={save}
        test={test}
        onMute={onMute}
        onBack={() => setView("npc")}
        onBuyWeapon={onBuyWeapon}
        onBuyEquipment={onBuyEquipment}
        onEquipWeapon={onEquipWeapon}
        onEquipItem={onEquipItem}
        onUsePotion={onUsePotion}
        onDiscardWeapon={onDiscardWeapon}
        onDiscardEquipment={onDiscardEquipment}
        onDiscardRation={onDiscardRation}
        onDiscardBagItem={onDiscardBagItem}
        onOpenStatus={onOpenStatus}
        onUpgradeWeapon={onUpgradeWeapon}
        onSellWeapon={onSellWeapon}
      />
    );
  }

  return (
    <section className="shop-surface relative h-dvh min-h-0 flex flex-col overflow-hidden bg-bg">
      <img src="/game/assets/brief-estalagem.jpg" alt="" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-bg/80 via-bg/25 to-bg/10" />
      <header className="relative z-10 flex items-center gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
        {/* Back/exit always sits at the far left, across every screen, so it never gets lost. */}
        <button type="button" onClick={onLeave} className="h-10 px-3 rounded-md ember-chip text-xs uppercase tracking-[0.14em]">
          Sair
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-[0.18em] text-muted">Pousada à margem da cinza</p>
          <h1 className="font-display text-2xl leading-none">A Estalagem do Osso Seco</h1>
        </div>
        <button
          type="button"
          onClick={() => setInvView("pack")}
          className="h-12 px-3 rounded-md ember-chip text-xs uppercase tracking-[0.14em] flex items-center gap-2"
        >
          <img src={BAG_ICON} alt="" className="size-8 shrink-0 rounded-sm object-contain" />
          Mochila
        </button>
        <button
          type="button"
          onClick={() => setInvView("doll")}
          className="h-12 px-3 rounded-md ember-chip text-xs uppercase tracking-[0.14em]"
        >
          Equipar
        </button>
        <button
          type="button"
          onClick={enterSmith}
          className="h-10 px-3 rounded-md ember-chip text-xs uppercase tracking-[0.14em]"
        >
          Ferreiro
        </button>
        <p className="text-sm ember-chip rounded-md px-2 py-1"><GoldAmount amount={ember} /></p>
        <button type="button" onClick={onMute} className="size-10 grid place-items-center rounded-md ember-chip" aria-label="Som">
          {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
        </button>
      </header>
      <div className="relative z-10 flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-3 max-w-lg mx-auto w-full">
        <div className="grid grid-cols-3 gap-2">
          {NPCS.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => setNpc(n)}
              className={`rounded-xl border overflow-hidden text-left ${npc.id === n.id ? "border-accent" : "border-border"}`}
            >
              <img src={n.portrait} alt="" className="w-full aspect-[2/3] object-cover" />
              <p className="px-2 py-1 text-xs font-medium truncate ember-chip">{n.name}</p>
            </button>
          ))}
        </div>
        <div className="ember-window rounded-xl p-3 flex gap-3">
          <img src={npc.portrait} alt="" className="h-24 w-16 object-cover rounded-md shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {npc.name} · {npc.role}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-fg/90">{npc.talk}</p>
          </div>
        </div>
        {npc.shop && (
          <div className="shop-panel ember-window rounded-xl p-3 flex flex-col gap-2">
            <p className="text-xs uppercase tracking-[0.16em] text-muted">Adega · quem leva</p>
            <div className="flex flex-wrap gap-1">
              {partyRoster.map((name) => (
                <Button
                  key={name}
                  className="shop-hero-selector"
                  size="sm"
                  variant={hero === name ? undefined : "quiet"}
                  onClick={() => {
                    setHero(name);
                    setCart({ ...EMPTY_CART });
                    setLockpickQty(0);
                    setNote(null);
                  }}
                >
                  {name}
                </Button>
              ))}
            </div>
            <div className="flex flex-col gap-1">
              <div className="rounded-md border border-border p-3">
                <p className="text-sm">Refeição para {hero} · {INN_MEAL_PRICE} Gold</p>
                <p className="text-xs text-muted">Enche a saciedade até 120% · bônus de 20%</p>
                <HungerBar name={hero} value={save.heroHunger[hero]} />
                <div className="flex gap-1.5 mt-2">
                  <Button className="flex-1" disabled={ember < INN_MEAL_PRICE || fullness(save.heroHunger[hero]) >= 120 || (save.unitHp[hero] ?? 1) <= 0} onClick={() => setNote(onBuyMeal(hero) ? `${hero} comeu. Saciedade: 120%.` : "Falta Gold ou o personagem já está satisfeito.")}>
                    Comer · {INN_MEAL_PRICE} Gold
                  </Button>
                  <Button
                    className="flex-1"
                    variant="quiet"
                    disabled={ember < INN_MEAL_PRICE || !partyRoster.some((name) => fullness(save.heroHunger[name]) < 120 && (save.unitHp[name] ?? 1) > 0)}
                    onClick={() => {
                      const fed = onBuyMealAll(partyRoster);
                      setNote(
                        fed === 0
                          ? "Ninguém comeu. Falta Gold ou já estão satisfeitos."
                          : fed === partyRoster.length
                            ? "Todos comeram. Saciedade: 120%."
                            : `${fed} comeram · Gold não deu pros demais.`,
                      );
                    }}
                  >
                    Todos · {INN_MEAL_PRICE} Gold cada
                  </Button>
                </div>
              </div>
              {POTION_ORDER.map((kind) => {
                const price = POTION_PRICE[kind];
                const have = bag[kind] ?? 0;
                const qty = cart[kind] ?? 0;
                return (
                  <ItemTip key={kind} text={potionTooltip(kind)} className="block">
                    <div className="tavern-item-window flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
                      <img src={ICONS[kind]} alt="" className="size-6 rounded-sm object-cover bg-black" />
                      <span className="flex-1 text-sm min-w-0">
                        {potionLabel(kind)}
                        <span className="block text-[11px] text-muted tabular-nums">
                          comprar {qty} · tem {have} / {POTION_CARRY_MAX[kind]} · {price} Gold
                        </span>
                      </span>
                      <button type="button" className="size-8 grid place-items-center rounded-md border border-border bg-surface-2" onClick={() => add(kind, -1)} disabled={qty <= 0}>
                        −
                      </button>
                      <span className="w-6 text-center text-sm tabular-nums">{qty}</span>
                      <button
                        type="button"
                        className="size-8 grid place-items-center rounded-md border border-border bg-surface-2"
                        onClick={() => add(kind, 1)}
                        disabled={have + qty >= POTION_CARRY_MAX[kind]}
                      >
                        +
                      </button>
                    </div>
                  </ItemTip>
                );
              })}
              <ItemTip text={lockpickTooltip()} className="block">
                <div className="tavern-item-window flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
                  <img src="/game/icons/lockpick.png" alt="" className="size-6 rounded-sm object-cover bg-black" />
                  <span className="flex-1 text-sm min-w-0">
                    Gazua
                    <span className="block text-[11px] text-muted tabular-nums">
                      comprar {lockpickQty} · tem {bag.lockpick ?? 0} / {BAG_MAX} · {LOCKPICK_PRICE} Gold
                    </span>
                  </span>
                  <button type="button" className="size-8 grid place-items-center rounded-md border border-border bg-surface-2" onClick={() => addLockpick(-1)} disabled={lockpickQty <= 0}>
                    −
                  </button>
                  <span className="w-6 text-center text-sm tabular-nums">{lockpickQty}</span>
                  <button
                    type="button"
                    className="size-8 grid place-items-center rounded-md border border-border bg-surface-2"
                    onClick={() => addLockpick(1)}
                    disabled={(bag.lockpick ?? 0) + lockpickQty >= BAG_MAX}
                  >
                    +
                  </button>
                </div>
              </ItemTip>
            </div>
            <p className={`text-sm tabular-nums ${remain < 0 ? "text-danger" : "text-muted"}`}>
              Conta {total} Gold · restam {remain}
            </p>
            {note && <p className="text-sm text-accent">{note}</p>}
            <div className="flex gap-2">
              <Button className="flex-1" disabled={items <= 0} onClick={pay}>
                Pagar
              </Button>
              <Button variant="quiet" onClick={() => { setCart({ ...EMPTY_CART }); setNote(null); }}>
                Limpar
              </Button>
            </div>

            <p className="mt-2 text-xs uppercase tracking-[0.16em] text-muted">Rações · para toda a party</p>
            <ItemTip text="Alimenta o grupo inteiro por um dia cada, no mapa. Empilha até 30 por espaço na mochila." className="block">
              <div className="tavern-item-window flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
                <img src={RATIONS_ICON} alt="" className="size-6 rounded-sm object-cover bg-black" />
                <span className="flex-1 text-sm min-w-0">
                  Rações
                  <span className="block text-[11px] text-muted tabular-nums">
                    comprar {rationsQty} · tem {save.rations} · {RATIONS_PRICE} Gold cada
                  </span>
                </span>
                <button type="button" className="size-8 grid place-items-center rounded-md border border-border bg-surface-2" onClick={() => setRationsQty((q) => Math.max(0, q - 1))} disabled={rationsQty <= 0}>
                  −
                </button>
                <span className="w-6 text-center text-sm tabular-nums">{rationsQty}</span>
                <button
                  type="button"
                  className="size-8 grid place-items-center rounded-md border border-border bg-surface-2"
                  onClick={() => setRationsQty((q) => Math.min(q + 1, RATION_STACK_MAX * 20))}
                  disabled={!partyBagHasRoom(save, Math.ceil((save.rations + rationsQty + 1) / RATION_STACK_MAX) - Math.ceil(save.rations / RATION_STACK_MAX), test)}
                >
                  +
                </button>
              </div>
            </ItemTip>
            {rationsNote && <p className="text-sm text-accent">{rationsNote}</p>}
            <Button className="w-full" disabled={rationsQty <= 0 || ember < rationsQty * RATIONS_PRICE} onClick={buyRations}>
              Comprar {rationsQty > 0 ? `(${rationsQty * RATIONS_PRICE} Gold)` : ""}
            </Button>
          </div>
        )}
      </div>
      <div className="relative z-10 p-4 pt-0 pb-[max(1rem,env(safe-area-inset-bottom))] max-w-lg mx-auto w-full">
        <Button variant="ghost" className="w-full" onClick={onLeave}>
          <ChevronLeft className="size-4" /> Sair da estalagem
        </Button>
      </div>
      {invView && (
        <PartyInventoryOverlay
          heroName={hero}
          classId={heroClass[hero] ?? "swordsman"}
          save={save}
          test={test}
          onUseRation={onUseRation}
          onUseRationAll={onUseRationAll}
          onOpenStatus={(h) => {
            // The status sheet renders behind this overlay (both share z-40, and this one
            // mounts later) — close it first or the "Status" button looks like it does
            // nothing while it's actually opening right behind the Mochila/Equipar screen.
            setInvView(null);
            onOpenStatus(h);
          }}
          onClose={() => setInvView(null)}
          onEquipWeapon={onEquipWeapon}
          onEquipItem={onEquipItem}
          onUsePotion={onUsePotion}
          onDiscardWeapon={onDiscardWeapon}
          onDiscardEquipment={onDiscardEquipment}
          onDiscardRation={onDiscardRation}
          onDiscardBagItem={onDiscardBagItem}
          initialView={invView === "pack" ? "backpack" : "equipment"}
        />
      )}
    </section>
  );
}

function SmithPanel({
  ember,
  muted,
  weapons,
  equipped,
  heroClass,
  save,
  test,
  onMute,
  onBack,
  onBuyWeapon,
  onBuyEquipment,
  onEquipWeapon,
  onEquipItem,
  onUsePotion,
  onDiscardWeapon,
  onDiscardEquipment,
  onDiscardRation,
  onDiscardBagItem,
  onOpenStatus,
  onUpgradeWeapon,
  onSellWeapon,
}: {
  ember: number;
  muted: boolean;
  weapons: Record<string, number>;
  equipped: Record<string, string>;
  heroClass: Record<string, ClassId>;
  save: SaveData;
  test?: boolean;
  onMute: () => void;
  onBack: () => void;
  onBuyWeapon: (hero: string, weaponId: string) => boolean;
  onBuyEquipment: (itemId: string) => boolean;
  onEquipWeapon: (hero: string, weaponId: string) => void;
  onEquipItem?: (hero: string, slot: EquipSlot, itemId: string | null) => void;
  onUsePotion?: (hero: string, kind: PotionId) => void;
  onDiscardWeapon?: (weaponId: string) => void;
  onDiscardEquipment?: (itemId: string) => void;
  onDiscardRation?: () => void;
  onDiscardBagItem?: (hero: string, kind: PotionId | "lockpick") => void;
  onOpenStatus: (hero: string) => void;
  onUpgradeWeapon: (weaponId: string) => boolean;
  onSellWeapon: (weaponId: string) => number | false;
}) {
  const [hero, setHero] = useState<string>("Kael");
  const [note, setNote] = useState<string | null>(null);
  const [invView, setInvView] = useState<"doll" | "pack" | null>(null);
  useEffect(() => {
    if (!note) return;
    const timer = window.setTimeout(() => setNote(null), 2200);
    return () => window.clearTimeout(timer);
  }, [note]);

  const classId = heroClass[hero];
  // Purchases still enter the shared Mochila, but the selected hero is the compatibility
  // filter: Vargan never offers that hero a weapon they cannot wield. This stays on in
  // test mode too — it's how per-class gear gets reviewed, one hero tab at a time.
  // Test mode only drops the OTHER stock-limiting rules below (price floor, half-stock
  // slicing, pouch exclusion) so nothing compatible with the selected hero is hidden.
  const pool = useMemo(
    () =>
      Object.values(WEAPONS)
        .filter((weapon) => test || weapon.price > 0)
        .filter((weapon) => weapon.usableBy.includes(classId))
        .sort((a, b) => weaponPower(a) - weaponPower(b)),
    [classId, test],
  );
  const smithEquipment = useMemo(() => {
    const bySlot = new Map<string, (typeof EQUIPMENT)[string][]>();
    for (const item of Object.values(EQUIPMENT)) {
      if (!test && (item.price ?? 0) <= 0) continue;
      if (!test && isPouch(item.id)) continue;
      if (item.slot === "ring1" || item.slot === "ring2") continue;
      if (item.usableBy && !item.usableBy.includes(classId)) continue;
      const key = item.slot;
      bySlot.set(key, [...(bySlot.get(key) ?? []), item]);
    }
    return [...bySlot.values()].flatMap((items) => {
      const ranked = items.sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
      return test ? ranked : ranked.slice(0, Math.ceil(ranked.length / 2));
    }).sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
  }, [classId, test]);
  const smithRings = useMemo(
    () =>
      Object.values(EQUIPMENT)
        .filter((item) => item.slot === "ring1" || item.slot === "ring2")
        .filter((item) => test || (item.price ?? 0) > 0)
        .filter((item) => !item.usableBy || item.usableBy.includes(classId))
        .sort((a, b) => (a.price ?? 0) - (b.price ?? 0)),
    [classId, test],
  );
  const equippedId = equipped[hero];
  const equippedWeapon = equippedId ? WEAPONS[equippedId] : null;
  const equippedEnh = equippedId ? (weapons[equippedId] ?? 0) : 0;
  const owned = pool.filter((w) => weapons[w.id] != null && w.id !== equippedId);
  const notOwned = pool.filter((w) => weapons[w.id] == null);

  const buy = (weaponId: string) => {
    setNote(null);
    if (!partyBagHasRoom(save, 1, test)) {
      setNote("Mochila cheia.");
      return;
    }
    if (!onBuyWeapon(hero, weaponId)) {
      setNote("Vargan recusou. Falta Gold.");
      return;
    }
    sfxPlay.purchase();
    setNote(`${WEAPONS[weaponId]!.name} comprada. Equipe no saco quando quiser.`);
  };
  const buyEquipment = (itemId: string) => {
    setNote(null);
    if (!partyBagHasRoom(save, 1, test)) {
      setNote("Mochila cheia.");
      return;
    }
    if (!onBuyEquipment(itemId)) {
      setNote("Vargan recusou. Falta Gold.");
      return;
    }
    sfxPlay.purchase();
    setNote(`${EQUIPMENT[itemId]!.name} foi colocada na Mochila.`);
  };

  const equip = (weaponId: string) => {
    setNote(null);
    onEquipWeapon(hero, weaponId);
  };

  const upgrade = () => {
    if (!equippedId) return;
    setNote(null);
    if (!onUpgradeWeapon(equippedId)) {
      setNote("Vargan recusou. Falta Gold ou já está no máximo.");
      return;
    }
    setNote(`${equippedWeapon?.name} aprimorada.`);
  };

  const sell = (weaponId: string) => {
    setNote(null);
    const value = onSellWeapon(weaponId);
    if (value === false) return;
    setNote(`${WEAPONS[weaponId]!.name} vendida por ${value} Gold.`);
  };

  const nextEnhCost = equippedEnh < WEAPON_MAX_ENH ? weaponEnhCost(equippedEnh + 1) : null;
  const bagFull = !partyBagHasRoom(save, 1, test);

  return (
    <section className="shop-surface relative h-dvh min-h-0 flex flex-col overflow-hidden bg-bg">
      <img src="/game/ui/smith-background.jpg" alt="" className="absolute inset-0 h-full w-full object-cover object-left" />
      <header className="relative z-10 flex items-center gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
        {/* Back always sits at the far left, across every screen, so it never gets lost. */}
        <button type="button" onClick={onBack} className="h-10 px-3 rounded-md ember-chip text-xs uppercase tracking-[0.14em]">
          <ChevronLeft className="size-4 inline -mt-0.5" /> Voltar
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-[0.18em] text-muted">A forja no porão</p>
          <h1 className="font-display text-2xl leading-none">Vargan, o Ferreiro</h1>
        </div>
        <button
          type="button"
          onClick={() => setInvView("pack")}
          className="h-12 px-3 rounded-md ember-chip text-xs uppercase tracking-[0.14em] flex items-center gap-2"
        >
          <img src={BAG_ICON} alt="" className="size-8 shrink-0 rounded-sm object-contain" />
          Mochila
        </button>
        <button
          type="button"
          onClick={() => setInvView("doll")}
          className="h-12 px-3 rounded-md ember-chip text-xs uppercase tracking-[0.14em]"
        >
          Equipar
        </button>
        <p className="text-sm ember-chip rounded-md px-2 py-1"><GoldAmount amount={ember} /></p>
        <button type="button" onClick={onMute} className="size-10 grid place-items-center rounded-md ember-chip" aria-label="Som">
          {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
        </button>
      </header>
      {note && (
        <div className="pointer-events-none absolute left-1/2 top-20 z-30 -translate-x-1/2 rounded-lg border border-accent bg-surface px-4 py-2 text-sm text-fg shadow-2xl" role="status" aria-live="polite">
          {note}
        </div>
      )}
      <div className="relative z-10 flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-3 max-w-lg ml-auto w-full">
        <div className="shop-panel ember-window rounded-xl p-3">
          <p className="text-sm leading-relaxed text-fg/90">
            “Aço, sangue, alma — tudo é forjado.” Ele não fala mais que isso. Aponta pra bigorna e espera você escolher.
          </p>
        </div>
        <div className="shop-panel ember-window rounded-xl p-3 flex flex-col gap-2">
          <p className="text-xs uppercase tracking-[0.16em] text-muted">Equipamento exibido</p>
          <div className="flex flex-wrap gap-1">
            {(test ? [...HERO_NAMES, ...TEST_EXTRA_HERO_NAMES] : HERO_NAMES)
              .filter((name) => test || heroRecruited(name, save.completed))
              .map((name) => (
              <Button
                key={name}
                className="shop-hero-selector"
                size="sm"
                variant={hero === name ? undefined : "quiet"}
                onClick={() => {
                  setHero(name);
                  setNote(null);
                }}
              >
                {name}
              </Button>
            ))}
          </div>

          <p className="text-xs uppercase tracking-[0.16em] text-muted mt-2">Equipada</p>
          {equippedWeapon ? (
            <ItemTip text={weaponTooltip(equippedWeapon, equippedEnh)} className="block">
              <div className="flex items-center gap-2 rounded-md border border-accent px-2 py-1.5">
                <span className="grid size-20 shrink-0 place-items-center rounded-sm bg-black">
                  <img src={weaponIcon(equippedWeapon.id)} alt="" className="size-full object-contain" />
                </span>
                <span className="flex-1 text-sm min-w-0">
                  {equippedWeapon.name} {equippedEnh > 0 ? `+${equippedEnh}` : ""}
                  <span className="block text-[11px] text-muted tabular-nums">
                    {weaponDiceLabel(equippedWeapon.id)} {equippedEnh > 0 ? `+ ${equippedEnh} aprimoro` : ""} · {weaponRangeLabel(equippedWeapon.id)}
                  </span>
                  <span className="block text-[10px] uppercase tracking-wide text-muted">Mão principal</span>
                </span>
                <div className="flex flex-col gap-1">
                  <Button size="sm" disabled={nextEnhCost == null || ember < nextEnhCost} onClick={upgrade}>
                    {nextEnhCost == null ? "Máx." : `+1 · ${nextEnhCost} Gold`}
                  </Button>
                  <Button size="sm" variant="quiet" onClick={() => onEquipWeapon(hero, "")}>
                    Desequipar
                  </Button>
                  <Button size="sm" variant="quiet" onClick={() => sell(equippedWeapon.id)}>
                    Vender · {weaponSellValue(equippedWeapon.id, equippedEnh)} Gold
                  </Button>
                </div>
              </div>
            </ItemTip>
          ) : (
            <p className="text-sm text-muted">Nenhuma arma equipada ainda.</p>
          )}

          {owned.length > 0 && (
            <>
              <p className="text-xs uppercase tracking-[0.16em] text-muted mt-2">No saco</p>
              <div className="flex flex-col gap-1">
                {owned.map((w) => (
                  <ItemTip key={w.id} text={weaponTooltip(w, weapons[w.id] ?? 0)} className="block">
                    <div className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
                      <span className="grid size-16 shrink-0 place-items-center rounded-sm bg-black">
                        <img src={weaponIcon(w.id)} alt="" className="size-full object-contain" />
                      </span>
                      <span className="flex-1 text-sm min-w-0">
                        {w.name}
                        <span className="block text-[11px] text-muted tabular-nums">
                          {weaponDiceLabel(w.id)} · {weaponRangeLabel(w.id)}
                        </span>
                        <span className="block text-[10px] uppercase tracking-wide text-muted">Mão principal</span>
                        {w.bonusClass && isPlayableClassForDisplay(w.bonusClass) && (
                          <span
                            className={`block text-[11px] tabular-nums ${w.bonusClass === classId ? "text-accent" : "text-muted"}`}
                          >
                            +10% dano · {CLASSES[w.bonusClass].name}
                          </span>
                        )}
                      </span>
                      <Button size="sm" variant="quiet" onClick={() => equip(w.id)}>
                        Equipar
                      </Button>
                      <Button size="sm" variant="quiet" onClick={() => sell(w.id)}>
                        Vender · {weaponSellValue(w.id, weapons[w.id] ?? 0)} Gold
                      </Button>
                    </div>
                  </ItemTip>
                ))}
              </div>
            </>
          )}

          {notOwned.length > 0 && (
            <>
              <p className="text-xs uppercase tracking-[0.16em] text-muted mt-2">Na bancada</p>
              <div className="flex flex-col gap-1">
                {notOwned.map((w) => (
                  <ItemTip key={w.id} text={weaponTooltip(w)} className="block">
                    <div className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
                      <span className="grid size-16 shrink-0 place-items-center rounded-sm bg-black">
                        <img src={weaponIcon(w.id)} alt="" className="size-full object-contain" />
                      </span>
                      <span className="flex-1 text-sm min-w-0">
                        {w.name}
                        <span className="block text-[11px] text-muted tabular-nums">
                          {weaponDiceLabel(w.id)} · {weaponRangeLabel(w.id)} · {w.price} Gold
                        </span>
                        <span className="block text-[10px] uppercase tracking-wide text-muted">Mão principal</span>
                        {w.bonusClass && isPlayableClassForDisplay(w.bonusClass) && (
                          <span
                            className={`block text-[11px] tabular-nums ${w.bonusClass === classId ? "text-accent" : "text-muted"}`}
                          >
                            +10% dano · {CLASSES[w.bonusClass].name}
                          </span>
                        )}
                      </span>
                      <Button size="sm" disabled={bagFull || ember < w.price} onClick={() => buy(w.id)}>
                        Comprar
                      </Button>
                    </div>
                  </ItemTip>
                ))}
              </div>
            </>
          )}
          <p className="text-xs uppercase tracking-[0.16em] text-muted mt-2">Anéis</p>
          <p className="text-[11px] text-muted">Cabem nos dois dedos da paper doll. Compra dois se quiser testar os dois espaços.</p>
          <div className="grid grid-cols-2 gap-1.5">
            {smithRings.map((item) => (
              <ItemTip key={item.id} text={equipmentTooltip(item)} className="block">
                <div className="flex h-full items-center gap-2 rounded-md border border-border px-2 py-1.5">
                  <span className="grid size-16 shrink-0 place-items-center rounded-sm bg-black">
                    <img src={equipmentIcon(item.id)} alt="" className="size-full object-contain" />
                  </span>
                  <span className="min-w-0 flex-1 text-xs">
                    <span className="block truncate">{item.name}</span>
                    <span className="block text-[10px] text-muted">{equipmentTypeSlotName(item)} · {item.price ?? 0} Gold</span>
                  </span>
                  <Button size="sm" disabled={bagFull || ember < (item.price ?? 0)} onClick={() => buyEquipment(item.id)}>Comprar</Button>
                </div>
              </ItemTip>
            ))}
          </div>
          <p className="text-xs uppercase tracking-[0.16em] text-muted mt-2">Armaduras e acessórios</p>
          <p className="text-[11px] text-muted">Estoque básico da estalagem. As peças superiores pertencem ao ferreiro da cidade.</p>
          <div className="grid grid-cols-2 gap-1.5">
            {smithEquipment.map((item) => (
              <ItemTip key={item.id} text={equipmentTooltip(item)} className="block">
                <div className="flex h-full items-center gap-2 rounded-md border border-border px-2 py-1.5">
                  <span className="grid size-16 shrink-0 place-items-center rounded-sm bg-black">
                    <img src={equipmentIcon(item.id)} alt="" className="size-full object-contain" />
                  </span>
                  <span className="min-w-0 flex-1 text-xs">
                    <span className="block truncate">{item.name}</span>
                    <span className="block text-[10px] text-muted">{equipmentTypeSlotName(item)} · {item.price ?? 0} Gold</span>
                  </span>
                  <Button size="sm" disabled={bagFull || ember < (item.price ?? 0)} onClick={() => buyEquipment(item.id)}>Comprar</Button>
                </div>
              </ItemTip>
            ))}
          </div>
          {note && <p className="text-sm text-accent">{note}</p>}
        </div>
      </div>
      {invView && (
        <PartyInventoryOverlay
          heroName={hero}
          classId={heroClass[hero] ?? "swordsman"}
          save={save}
          test={test}
          onOpenStatus={(h) => {
            // Same reasoning as the NPC panel's overlay: close this one first so the status
            // sheet (same z-40 layer, mounted earlier in the tree) isn't hidden behind it.
            setInvView(null);
            onOpenStatus(h);
          }}
          onClose={() => setInvView(null)}
          onEquipWeapon={onEquipWeapon}
          onEquipItem={onEquipItem}
          onUsePotion={onUsePotion}
          onDiscardWeapon={onDiscardWeapon}
          onDiscardEquipment={onDiscardEquipment}
          onDiscardRation={onDiscardRation}
          onDiscardBagItem={onDiscardBagItem}
          initialView={invView === "pack" ? "backpack" : "equipment"}
        />
      )}
    </section>
  );
}

function SmithIntroScreen({ muted, onSkip }: { muted: boolean; onSkip: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [portrait, setPortrait] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 720px) and (orientation: portrait)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 720px) and (orientation: portrait)");
    const sync = () => setPortrait(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.muted = muted;
    const kick = () => {
      void el.play().catch(() => {
        el.muted = true;
        void el.play().catch(() => {});
      });
    };
    kick();
    el.addEventListener("canplay", kick);
    const t = window.setTimeout(onSkip, 22000);
    return () => {
      el.removeEventListener("canplay", kick);
      window.clearTimeout(t);
    };
  }, [muted, onSkip]);
  return (
    <section className="relative h-dvh w-dvw bg-black overflow-hidden">
      <div className="cutscene-stage">
        <video ref={ref} src="/game/smith-intro.mp4" playsInline autoPlay preload="auto" onEnded={onSkip} onError={onSkip} />
      </div>
      {portrait && (
        <p className="pointer-events-none absolute inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] text-center text-[11px] tracking-[0.16em] uppercase text-muted">
          Deite o telefone
        </p>
      )}
      <div className="absolute inset-x-0 bottom-0 z-10 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] flex justify-end">
        <Button size="md" variant="ghost" onClick={onSkip}>
          Pular
        </Button>
      </div>
    </section>
  );
}
