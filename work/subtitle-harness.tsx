import React from 'react';
import { createRoot } from 'react-dom/client';
import { CutsceneScreen } from '../src/game/GameApp';
export function mount(src: string) {
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  createRoot(root).render(<CutsceneScreen src={src} onSkip={() => {}} onSoundChange={() => {}} />);
}
