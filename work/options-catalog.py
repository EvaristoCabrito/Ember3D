from pathlib import Path
p=Path('src/game/gamePreferences.ts');s=p.read_text(encoding='utf-8');s=s.replace(' "Opções": "Options",',' "Ajustes manuais personalizam o preset selecionado.": "Manual adjustments customize the selected preset.",\n "Poção de Vida": "Health Potion", "Poção de Mana": "Mana Potion", "Espada Curta": "Short Sword", "Espada Longa": "Long Sword", "Adaga": "Dagger", "Arco Curto": "Short Bow", "Arco Longo": "Long Bow",\n "Curar Doença Leve": "Cure Minor Disease", "Curar Fome e Sede": "Create Food and Water", "Fôlego Renovado": "Second Wind", "Aura de Proteção": "Aura of Protection", "Presença Intimidante": "Intimidating Presence", "Ira Divina": "Divine Wrath", "Investida de Ombro": "Shoulder Smash", "Debandada": "Stampede", "Investida Perfurante": "Piercing Thrust", "Varredura": "Sweep", "Rasteira": "Trip", "Corte Duplo": "Double Strike", "Investida Touro": "Bull Rush", "Golpe do Carrasco": "Executioner Strike", "Golpe de Escudo": "Shield Bash", "Tiro Múltiplo": "Multi Shot", "Força Fantasmal": "Phantasmal Force", "Teia dos Sonhos": "Web of Dreams", "Invocar Familiar Maior": "Summon Greater Familiar", "Invocar Familiar Titã": "Summon Titan Familiar", "Invocar Familiar Radiante": "Summon Radiant Familiar", "Invocar Cão Zumbi": "Summon Zombie Hound",\n "Feiticeiro": "Sorcerer", "Cultista Ancestral": "Ancient Cultist", "Golem Ancião": "Elder Golem", "Lanceiro": "Lancer", "Conjurador": "Conjurer", "Cão Zumbi": "Zombie Hound", "Cavaleiro Pesado": "Heavy Knight", "Elementalista": "Elementalist", "Bruxo": "Warlock", "Arcanista": "Arcanist", "Bispo": "Bishop", "Patrulheiro": "Ranger", "Sentinela": "Sentinel", "Templário": "Templar",\n "Opções": "Options",');p.write_text(s,encoding='utf-8')
p=Path('src/game/OptionsMenu.tsx');s=p.read_text(encoding='utf-8').replace('<GraphicsQualityControl />','<GraphicsQualityControl /><p className="text-xs text-muted">{t("Ajustes manuais personalizam o preset selecionado.")}</p>');p.write_text(s,encoding='utf-8')
Path('docs').mkdir(exist_ok=True)
Path('docs/localization.md').write_text('''# Languages and options

Preferences in `src/game/gamePreferences.ts` persist independently: `uiLanguage`, `dialogueLanguage`, and `subtitleLanguage`. Current authored content is never mutated. Missing translations fall back to original text.

## UI and names

Wrap presentation strings and displayed names in `uiText(original)` and subscribe with `useGamePreferences()` in standalone components. Add English entries to the `english` catalog. Existing mixed-language screens still need a gradual string audit; this is not a complete translation of the entire game.

For new content, `uiText(original, { en: "English name", pt: "Nome português" })` can override the catalog. Never translate identifiers, save keys, rule comparisons or serialized names.

## Dialogue

Keep existing `text`, `speaker`, and reply `text`. Add optional `translations` and `speakerTranslations` only when final copy is available:

```ts
{ id: "hello", speaker: "Mercador", text: "Bem-vindo.",
  translations: { en: "Welcome." }, speakerTranslations: { en: "Merchant" },
  replies: [{ text: "Até logo.", translations: { en: "Goodbye." } }] }
```

DialogOverlay resolves text and replies through dialogueLanguage, independently of UI language. Original Portuguese dialogue has not been translated.

## Video subtitles

CutsceneScreen accepts optional `subtitles` mapping languages to WebVTT URLs:
`subtitles={{ pt: "/game/subtitles/intro.pt.vtt", en: "/game/subtitles/intro.en.vtt" }}`.
Only the selected track is shown when subtitles are enabled. An unavailable English track falls back to Portuguese. No subtitle files are fabricated for current unfinished dialogue.

## Verification

`npm run typecheck` and `node scripts/qa-options.mjs` verify the options panel, independent locale selections, original-dialogue fallback, audio settings, advanced lighting persistence and Escape dismissal.
''',encoding='utf-8')
