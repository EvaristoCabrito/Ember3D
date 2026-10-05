import React from 'react';
import { createRoot } from 'react-dom/client';
import { CutsceneScreen } from '../../src/game/GameApp';
import { isMuted } from '../../src/game/audio';

export { isMuted };

export function mount() {
  document.body.innerHTML = '<div id="qa-root"></div>';
  createRoot(document.getElementById('qa-root')!).render(<CutsceneScreen src="/game/title-open.mp4" onSkip={() => {}} onSoundChange={() => {}} />);
}
