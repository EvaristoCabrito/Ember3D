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
Cutscene subtitles currently use English only. `cutsceneSubtitles.ts` registers the revised `.en-v2.vtt` tracks, which preserve the original subtitle files. Stored Portuguese subtitle preferences are migrated to English; the subtitle visibility toggle still works. Other language preferences remain independent.

The village, inn arrival, forest entrance, smith, Asherah ritual, and temple aftermath have dialogue tracks. The bridge, title opening, ford introduction, and gate ending have no recognized dialogue and do not attach dialogue captions. Caption text was checked with local speech recognition, including a normalized audio pass without voice-activity filtering to recover quiet opening lines. Recognition and timing still benefit from listening review.

Run `node scripts/qa-english-subtitles.mjs` with the dev server running to verify every video mapping, cue loading, timing bounds, English-only playback, and the village's opening captions.

## Verification

`npm run typecheck` and `node scripts/qa-options.mjs` verify the options panel, independent locale selections, original-dialogue fallback, audio settings, advanced lighting persistence and Escape dismissal.
