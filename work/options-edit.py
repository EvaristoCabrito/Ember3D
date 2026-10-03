from pathlib import Path
p=Path('src/game/gamePreferences.ts')
p.write_text('''import { useSyncExternalStore } from "react";
export type GameLanguage = "pt" | "en";
export type Translations = Partial<Record<GameLanguage, string>>;
export interface GamePreferences { uiLanguage: GameLanguage; dialogueLanguage: GameLanguage; subtitleLanguage: GameLanguage; subtitles: boolean; dialogueScale: number; }
const KEY = "emberash:preferences:v1";
const defaults: GamePreferences = { uiLanguage: "pt", dialogueLanguage: "pt", subtitleLanguage: "pt", subtitles: true, dialogueScale: 1 };
let current = { ...defaults };
try {
 const saved = JSON.parse(localStorage.getItem(KEY) || "{}");
 for (const key of ["uiLanguage", "dialogueLanguage", "subtitleLanguage"] as const) if (saved[key] === "pt" || saved[key] === "en") current[key] = saved[key];
 if (typeof saved.subtitles === "boolean") current.subtitles = saved.subtitles;
 if ([1, 1.15, 1.3].includes(saved.dialogueScale)) current.dialogueScale = saved.dialogueScale;
} catch { /* Defaults when storage is unavailable. */ }
const listeners = new Set<() => void>();
export const getGamePreferences = () => current;
export function setGamePreferences(patch: Partial<GamePreferences>) {
 current = { ...current, ...patch };
 try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* Session still works. */ }
 listeners.forEach(listener => listener());
}
export function subscribeGamePreferences(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function useGamePreferences() { return useSyncExternalStore(subscribeGamePreferences, getGamePreferences, getGamePreferences); }
/** Existing authored text remains the fallback until its translation is supplied. */
export function translatedText(original: string, translations: Translations | undefined, language: GameLanguage): string { return translations?.[language]?.trim() ? translations[language]! : original; }
const english: Record<string, string> = {
 "Opções": "Options", "Fechar": "Close", "Gráficos": "Graphics", "Áudio": "Audio", "Idiomas": "Languages", "Acessibilidade": "Accessibility",
 "Qualidade gráfica": "Graphics quality", "Baixa": "Low", "Média": "Medium", "Alta": "High",
 "Ajusta resolução, sombras e iluminação. Mantém os modelos e as regras do jogo.": "Adjusts resolution, shadows and lighting. Keeps models and gameplay rules unchanged.",
 "Nova campanha": "New campaign", "Continuar": "Continue", "Como jogar": "How to play", "Carregando…": "Loading…", "Modo teste": "Test mode", "Táticas em cinzas": "Tactics in ashes",
 "Seis sobreviventes. Um tabuleiro de guerra. Cada casa conta.": "Six survivors. A battlefield. Every square counts.", "Próximo": "Next", "Pular": "Skip", "Deite o telefone": "Rotate your phone",
 "Ativar som": "Enable sound", "Silenciar": "Mute", "Música": "Music", "Efeitos sonoros": "Sound effects", "Vídeos": "Videos",
 "Sombras": "Shadows", "Sombras suaves": "Soft shadows", "Sombras de contato": "Contact shadows", "Oclusão ambiente": "Ambient occlusion", "Luzes locais": "Local lights", "Tela cheia": "Fullscreen",
 "Interface e nomes": "Interface and names", "Diálogos": "Dialogue", "Legendas": "Subtitles", "Exibir legendas": "Show subtitles", "Tamanho do diálogo": "Dialogue text size", "Normal": "Normal", "Grande": "Large", "Muito grande": "Extra large",
 "Traduções ausentes usam o texto original. As escolhas são independentes.": "Missing translations use the original text. Each language choice is independent.",
 "Alterações salvas automaticamente.": "Changes are saved automatically.", "Tela cheia indisponível neste navegador.": "Fullscreen is unavailable in this browser.",
 "Bola De Fogo": "Fireball", "Míssil Mágico": "Magic Missile", "Cura Menor": "Minor Heal", "Cura Média": "Medium Heal", "Cura Leve": "Light Heal", "Relâmpago": "Lightning", "Choque": "Shock", "Dreno de Vida": "Life Drain", "Mãos Flamejantes": "Burning Hands", "Tiro Longo": "Long Shot", "Tiro Perfurante": "Piercing Shot", "Invocar Familiar": "Summon Familiar", "Veneno Cáustico": "Caustic Venom",
 "Guerreiro": "Warrior", "Arqueira": "Archer", "Mago Negro": "Black Mage", "Curandeiro": "Healer", "Soldado": "Soldier", "Piqueiro": "Pikeman", "Besteiro": "Crossbowman", "Capitão": "Captain", "Zumbi": "Zombie", "Troll da caverna": "Cave Troll", "Cão de guerra": "War Hound", "Paladino": "Paladin", "Clérigo": "Cleric", "Ladino": "Rogue", "Assassino": "Assassin", "Necromante": "Necromancer"
};
/** Presentation only: never changes IDs, authored names, saves or combat rules. */
export function uiText(text: string, translations?: Translations): string { return translatedText(current.uiLanguage === "en" ? english[text] ?? text : text, translations, current.uiLanguage); }
''',encoding='utf-8')
p=Path('src/game/OptionsMenu.tsx')
p.write_text('''import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { GraphicsQualityControl } from "./GraphicsQualityControl";
import { getDevGfx, setDevGfx, subscribeDevGfx } from "./gfx/three/devGfx";
import { getAudioVolumes, setMusicVolume, setSfxVolume, setCutsceneVolume } from "./audio";
import { uiText as t, useGamePreferences, setGamePreferences } from "./gamePreferences";

export function OptionsButton({ muted, onMute }: { muted: boolean; onMute: () => void }) {
 const prefs = useGamePreferences();
 const gfx = useSyncExternalStore(subscribeDevGfx, getDevGfx, getDevGfx);
 const [open, setOpen] = useState(false);
 const [volumes, setVolumes] = useState(getAudioVolumes);
 const [error, setError] = useState("");
 const dialog = useRef<HTMLDialogElement>(null);
 useEffect(() => { if (open) dialog.current?.showModal(); else dialog.current?.close(); }, [open]);
 return <>
 <button type="button" className="w-full ember-btn ember-btn-ghost py-3" onClick={() => { setVolumes(getAudioVolumes()); setOpen(true); }}>{t("Opções")}</button>
 <dialog ref={dialog} onCancel={() => setOpen(false)} onClose={() => setOpen(false)} className="m-auto w-[min(94vw,48rem)] max-h-[90dvh] overflow-y-auto rounded-xl border border-border bg-bg text-fg p-5 backdrop:bg-black/75" aria-labelledby="game-options-title">
 <div className="flex items-center justify-between gap-4 mb-5"><h2 id="game-options-title" className="text-xl font-display">{t("Opções")}</h2><button type="button" autoFocus className="ember-btn px-4 py-2" onClick={() => setOpen(false)}>{t("Fechar")}</button></div>
 <div className="grid gap-5 sm:grid-cols-2">
 <section className="space-y-3"><h3>{t("Gráficos")}</h3><GraphicsQualityControl />
 {([['realShadows', 'Sombras'], ['softShadows', 'Sombras suaves'], ['contactShadows', 'Sombras de contato'], ['ambientOcclusion', 'Oclusão ambiente'], ['localLights', 'Luzes locais']] as const).map(([key,label]) => <label key={key} className="flex justify-between gap-3 text-sm"><span>{t(label)}</span><input type="checkbox" checked={gfx[key]} disabled={key === 'softShadows' && !gfx.realShadows} onChange={e => setDevGfx({ [key]: e.target.checked })} /></label>)}
 <button type="button" className="ember-btn px-3 py-2" onClick={async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); setError(""); } catch { setError(t("Tela cheia indisponível neste navegador.")); } }}>{t("Tela cheia")}</button>{error && <p role="status">{error}</p>}
 </section>
 <section className="space-y-4"><h3>{t("Áudio")}</h3><label className="flex justify-between text-sm">{t("Silenciar")}<input type="checkbox" checked={muted} onChange={onMute} /></label>
 {([['music','Música',setMusicVolume],['sfx','Efeitos sonoros',setSfxVolume],['cutscene','Vídeos',setCutsceneVolume]] as const).map(([key,label,setter]) => <label key={key} className="block text-sm">{t(label)} <span className="float-right">{Math.round(volumes[key]*100)}%</span><input className="w-full" type="range" min="0" max="1" step="0.01" value={volumes[key]} onChange={e => { const value=Number(e.target.value); setter(value); setVolumes(v => ({...v,[key]:value})); }} /></label>)}
 </section>
 <section className="space-y-3"><h3>{t("Idiomas")}</h3>
 {([['uiLanguage','Interface e nomes'],['dialogueLanguage','Diálogos'],['subtitleLanguage','Legendas']] as const).map(([key,label]) => <label key={key} className="flex items-center justify-between gap-2 text-sm">{t(label)}<select className="bg-bg border border-border rounded p-2" value={prefs[key]} onChange={e => setGamePreferences({[key]:e.target.value as 'pt'|'en'})}><option value="pt">Português</option><option value="en">English</option></select></label>)}
 <p className="text-xs text-muted">{t("Traduções ausentes usam o texto original. As escolhas são independentes.")}</p></section>
 <section className="space-y-3"><h3>{t("Acessibilidade")}</h3><label className="flex justify-between text-sm">{t("Exibir legendas")}<input type="checkbox" checked={prefs.subtitles} onChange={e => setGamePreferences({subtitles:e.target.checked})} /></label>
 <label className="flex justify-between gap-2 text-sm">{t("Tamanho do diálogo")}<select className="bg-bg border border-border rounded p-2" value={prefs.dialogueScale} onChange={e => setGamePreferences({dialogueScale:Number(e.target.value)})}>{([[1,'Normal'],[1.15,'Grande'],[1.3,'Muito grande']] as const).map(([value,label]) => <option key={value} value={value}>{t(label)}</option>)}</select></label></section>
 </div><p className="mt-5 text-xs text-muted">{t("Alterações salvas automaticamente.")}</p>
 </dialog></>;
}
''',encoding='utf-8')
p=Path('src/game/GraphicsQualityControl.tsx');s=p.read_text(encoding='utf-8');s='import { uiText as t, useGamePreferences } from "./gamePreferences";\n'+s;s=s.replace('  const quality =','  useGamePreferences();\n  const quality =').replace('>Qualidade gráfica<','>{t("Qualidade gráfica")}<').replace('>{label}</button>','>{t(label)}</button>').replace('>Ajusta resolução, sombras e iluminação. Mantém os modelos e as regras do jogo.<','>{t("Ajusta resolução, sombras e iluminação. Mantém os modelos e as regras do jogo.")}<');p.write_text(s,encoding='utf-8')
p=Path('src/game/types.ts');s=p.read_text(encoding='utf-8');s=s.replace('export interface DialogReply {\n  text: string;','export interface DialogReply {\n  translations?: Partial<Record<"pt" | "en", string>>;\n  text: string;');s=s.replace('export interface DialogLine {','export interface DialogLine {\n  translations?: Partial<Record<"pt" | "en", string>>;\n  speakerTranslations?: Partial<Record<"pt" | "en", string>>;');p.write_text(s,encoding='utf-8')
p=Path('src/game/DialogOverlay.tsx');s=p.read_text(encoding='utf-8');s='import { useGamePreferences, translatedText, uiText } from "./gamePreferences";\n'+s;s=s.replace('  const [lineId','  const prefs = useGamePreferences();\n  const [lineId');s=s.replace('{line.speaker}','{translatedText(line.speaker, line.speakerTranslations, prefs.dialogueLanguage)}').replace('{line.text}','{translatedText(line.text, line.translations, prefs.dialogueLanguage)}').replace('{reply.text}','{translatedText(reply.text, reply.translations, prefs.dialogueLanguage)}').replace('{line.next ? "Próximo" : "Ok"}','{uiText(line.next ? "Próximo" : "Ok")}').replace('<div className="flex-1 min-w-0">','<div className="flex-1 min-w-0" style={{ fontSize: `${prefs.dialogueScale}rem` }}>').replace('text-base leading-relaxed','text-[1em] leading-relaxed');p.write_text(s,encoding='utf-8')
p=Path('src/game/GameApp.tsx');s=p.read_text(encoding='utf-8');s='import { OptionsButton } from "./OptionsMenu";\nimport { uiText, useGamePreferences, type Translations } from "./gamePreferences";\n'+s;s=s.replace('export function GameApp() {','export function GameApp() {\n  useGamePreferences();');s=s.replace('<div className="mt-3"><GraphicsQualityControl /></div>','<div className="mt-3"><OptionsButton muted={muted} onMute={onMute} /></div>');s=s.replace('              <GraphicsQualityControl />','              <OptionsButton muted={muted} onMute={onMute} />');start=s.index('function TitleScreen(');end=s.index('\nfunction ',start+10);part=s[start:end];part=part.replace('  const progress =','  useGamePreferences();\n  const progress =');
for label in ['Modo teste','Táticas em cinzas','Continuar','Como jogar','Seis sobreviventes. Um tabuleiro de guerra. Cada casa conta.']:
 part=part.replace('          '+label+'\n','          {uiText("'+label+'")}\n').replace('>'+label+'<','>{uiText("'+label+'")}<')
part=part.replace('{ready ? "Nova campanha" : "Carregando…"}','{uiText(ready ? "Nova campanha" : "Carregando…")}').replace('aria-label={muted ? "Ativar som" : "Silenciar"}','aria-label={uiText(muted ? "Ativar som" : "Silenciar")}');s=s[:start]+part+s[end:]
# Translate display-only name expressions; keep rule comparisons and stored names untouched.
import re
s=re.sub(r'(?<=>)\{([^{}\n]+\.name)\}',r'{uiText(\1)}',s)
s=s.replace('function CutsceneScreen({\n  src,','function CutsceneScreen({\n  src,\n  subtitles,').replace('  src: string;\n  onSkip: () => void;','  src: string;\n  subtitles?: Translations;\n  onSkip: () => void;');s=s.replace('  const ref = useRef<HTMLVideoElement>(null);','  const prefs = useGamePreferences();\n  const ref = useRef<HTMLVideoElement>(null);\n  useEffect(() => {\n    const tracks = ref.current?.textTracks;\n    if (tracks) for (const track of Array.from(tracks)) track.mode = prefs.subtitles && track.language === (subtitles?.[prefs.subtitleLanguage] ? prefs.subtitleLanguage : subtitles?.pt ? "pt" : "en") ? "showing" : "disabled";\n  }, [prefs.subtitles, prefs.subtitleLanguage, subtitles]);');s=s.replace('<video ref={ref} src={src} playsInline autoPlay preload="auto" onEnded={onSkip} onError={onSkip} />','<video ref={ref} src={src} playsInline autoPlay preload="auto" onEnded={onSkip} onError={onSkip}>\n          {Object.entries(subtitles ?? {}).map(([language, url]) => <track key={language} kind="subtitles" src={url} srcLang={language} label={language === "pt" ? "Português" : "English"} />)}\n        </video>');p.write_text(s,encoding='utf-8')
