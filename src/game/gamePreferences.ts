import { useSyncExternalStore } from "react";
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
 "Baixa: sombras 1024 suaves. Média: 2048 nítidas. Alta: 4096 nítidas.": "Low: soft 1024 shadows. Medium: sharp 2048. High: sharp 4096.",
 "Personalizada": "Custom",
 "Oclusão ambiente e iluminação mantidas em todas as qualidades.": "Ambient occlusion and lighting are preserved at every quality level.",
 "Oclusão ambiente sempre ativa. Suavidade das sombras é uma preferência visual independente.": "Ambient occlusion stays enabled. Shadow softness is an independent visual preference.",
 "Ajustes manuais personalizam o preset selecionado.": "Manual adjustments customize the selected preset.",
 "Poção de Vida": "Health Potion", "Poção de Mana": "Mana Potion", "Espada Curta": "Short Sword", "Espada Longa": "Long Sword", "Adaga": "Dagger", "Arco Curto": "Short Bow", "Arco Longo": "Long Bow",
 "Curar Doença Leve": "Cure Minor Disease", "Curar Fome e Sede": "Create Food and Water", "Fôlego Renovado": "Second Wind", "Aura de Proteção": "Aura of Protection", "Presença Intimidante": "Intimidating Presence", "Ira Divina": "Divine Wrath", "Investida de Ombro": "Shoulder Smash", "Debandada": "Stampede", "Investida Perfurante": "Piercing Thrust", "Varredura": "Sweep", "Rasteira": "Trip", "Corte Duplo": "Double Strike", "Investida Touro": "Bull Rush", "Golpe do Carrasco": "Executioner Strike", "Golpe de Escudo": "Shield Bash", "Tiro Múltiplo": "Multi Shot", "Força Fantasmal": "Phantasmal Force", "Teia dos Sonhos": "Web of Dreams", "Invocar Familiar Maior": "Summon Greater Familiar", "Invocar Familiar Titã": "Summon Titan Familiar", "Invocar Familiar Radiante": "Summon Radiant Familiar", "Invocar Cão Zumbi": "Summon Zombie Hound",
 "Feiticeiro": "Sorcerer", "Cultista Ancestral": "Ancient Cultist", "Golem Ancião": "Elder Golem", "Lanceiro": "Lancer", "Conjurador": "Conjurer", "Cão Zumbi": "Zombie Hound", "Cavaleiro Pesado": "Heavy Knight", "Elementalista": "Elementalist", "Bruxo": "Warlock", "Arcanista": "Arcanist", "Bispo": "Bishop", "Patrulheiro": "Ranger", "Sentinela": "Sentinel", "Templário": "Templar",
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
 "Guerreiro": "Warrior", "Arqueira": "Archer", "Mago Negro": "Black Mage", "Curandeiro": "Healer", "Soldado": "Soldier", "Piqueiro": "Pikeman", "Besteiro": "Crossbowman", "Capitão": "Captain", "Zumbi": "Zombie", "Boi Morto-vivo": "Undead Ox", "Troll da caverna": "Cave Troll", "Cão de guerra": "War Hound", "Paladino": "Paladin", "Clérigo": "Cleric", "Ladino": "Rogue", "Assassino": "Assassin", "Necromante": "Necromancer"
};
/** Presentation only: never changes IDs, authored names, saves or combat rules. */
export function uiText(text: string, translations?: Translations): string { return translatedText(current.uiLanguage === "en" ? english[text] ?? text : text, translations, current.uiLanguage); }
