from pathlib import Path
p=Path('scripts/qa-graphics-loading.mjs');s=p.read_text(encoding='utf-8').replace("    const gfx = await import('/src/game/gfx/three/devGfx.ts');",'''    const qualitySource = await (await fetch('/src/game/graphicsQuality.ts')).text();
    const gfxPath = qualitySource.match(/from ["']([^"']*devGfx\\.ts[^"']*)["']/)[1];
    const gfx = await import(gfxPath);''');p.write_text(s,encoding='utf-8')
p=Path('scripts/qa-options.mjs');s=p.read_text(encoding='utf-8').replace("  window.preferences=await import('/src/game/gamePreferences.ts');window.gfx=await import('/src/game/gfx/three/devGfx.ts');",'''  const optionsSource=await (await fetch('/src/game/OptionsMenu.tsx')).text();
  const dependency=name=>optionsSource.match(new RegExp('from ["\\\']([^"\\\']*'+name+'[^"\\\']*)["\\\']'))[1];
  window.preferences=await import(dependency('gamePreferences.ts'));window.gfx=await import(dependency('devGfx.ts'));''');p.write_text(s,encoding='utf-8')
