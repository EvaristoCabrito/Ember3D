# Languages and options

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
