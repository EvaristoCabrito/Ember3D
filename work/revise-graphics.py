from pathlib import Path
p=Path('src/game/gfx/three/ThreeBattleRenderer.ts');s=p.read_text(encoding='utf-8');s=s.replace('import { ThreeContactShadows } from "./ThreeContactShadows";\n','').replace('  private projectedContacts = new ThreeContactShadows();\n','').replace(', stencil: true','').replace('    this.scene.add(this.projectedContacts.group);\n','').replace('new EffectComposer(this.renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, stencilBuffer: true }))','new EffectComposer(this.renderer)').replace('    this.syncProjectedContacts(tile);\n','').replace('    this.projectedContacts.dispose();\n','');start=s.index('  private syncProjectedContacts(');end=s.index('  /** Occluders for the ground AO field:',start);s=s[:start]+s[end:];s=s.replace('    this.renderer.shadowMap.type = THREE.PCFShadowMap;','    this.renderer.shadowMap.type = getDevGfx().softShadows ? THREE.PCFShadowMap : THREE.BasicShadowMap;');start=s.index('    // PCFSoftShadowMap was removed');end=s.index('    this.renderer.shadowMap.type',start);s=s[:start]+'    // Sharp shadows use a single depth comparison; the low preset uses PCF filtering.\n'+s[end:];s=s.replace('    this.sunLight.shadow.radius = gfx.softShadows ? SHADOW_RADIUS_SOFT : SHADOW_RADIUS_HARD;','''    const shadowType = gfx.softShadows ? THREE.PCFShadowMap : THREE.BasicShadowMap;
    if (this.renderer.shadowMap.type !== shadowType) {
      this.renderer.shadowMap.type = shadowType;
      this.renderer.shadowMap.needsUpdate = true;
    }
    const requested = [1024, 2048, 4096].includes(gfx.shadowResolution) ? gfx.shadowResolution : 4096;
    const resolution = Math.min(requested, this.renderer.capabilities.maxTextureSize);
    for (const light of [this.sunLight, this.moonLight, ...this.pointLights]) {
      const size = light instanceof THREE.PointLight ? Math.max(256, resolution / 4) : resolution;
      if (light.shadow.mapSize.x === size) continue;
      light.shadow.mapSize.set(size, size);
      light.shadow.map?.dispose(); light.shadow.map = null;
      light.shadow.mapPass?.dispose(); light.shadow.mapPass = null;
      light.shadow.needsUpdate = true;
    }
    this.sunLight.shadow.radius = gfx.softShadows ? SHADOW_RADIUS_SOFT : SHADOW_RADIUS_HARD;''');p.write_text(s,encoding='utf-8')
p=Path('src/game/gfx/three/devGfx.ts');s=p.read_text(encoding='utf-8').replace('  realShadows: boolean;','  realShadows: boolean;\n  /** Directional shadow depth-map edge; point lights use a quarter of this. */\n  shadowResolution: 1024 | 2048 | 4096;').replace('realShadows: true, softShadows: true, contactShadows: true','realShadows: true, shadowResolution: 4096, softShadows: false, contactShadows: false');p.write_text(s,encoding='utf-8')
p=Path('src/game/graphicsQuality.ts');s=p.read_text(encoding='utf-8');s=s.replace('import { setDevGfx }','import { getDevGfx, setDevGfx }');start=s.index('const profiles =');end=s.index('let current:',start);s=s[:start]+'''const profiles = {
  low: { maxDpr: 1, shadowResolution: 1024, realShadows: true, softShadows: true, contactShadows: false, ambientOcclusion: true, localLights: true },
  medium: { maxDpr: 1.5, shadowResolution: 2048, realShadows: true, softShadows: false, contactShadows: false, ambientOcclusion: true, localLights: true },
  high: { maxDpr: 2, shadowResolution: 4096, realShadows: true, softShadows: false, contactShadows: false, ambientOcclusion: true, localLights: true },
} as const;
'''+s[end:];start=s.index('// Lighting is already');end=s.index('export function getGraphicsQuality',start);s=s[:start]+'''// Upgrade the earlier presets once; retain advanced overrides on later starts.
try {
  if (localStorage.getItem("emberash:graphicsProfilesVersion") !== "2") {
    apply(); localStorage.setItem("emberash:graphicsProfilesVersion", "2");
  }
} catch { /* Use session defaults. */ }
export function graphicsQualityIsCustom(): boolean {
  const gfx = getDevGfx(); const { maxDpr: _, ...profile } = profiles[current];
  return Object.entries(profile).some(([key, value]) => gfx[key as keyof typeof gfx] !== value);
}
'''+s[end:];p.write_text(s,encoding='utf-8')
p=Path('src/game/OptionsMenu.tsx');s=p.read_text(encoding='utf-8').replace('Oclusão ambiente sempre ativa. Suavidade das sombras é uma preferência visual independente.','Oclusão ambiente e iluminação mantidas em todas as qualidades.').replace(", ['contactShadows', 'Sombras de contato']",'').replace(", ['softShadows', 'Sombras suaves']",'');p.write_text(s,encoding='utf-8')
p=Path('src/game/GraphicsQualityControl.tsx');s=p.read_text(encoding='utf-8').replace('type GraphicsQuality','graphicsQualityIsCustom, type GraphicsQuality');s='import { getDevGfx, subscribeDevGfx } from "./gfx/three/devGfx";\n'+s;s=s.replace('  return <fieldset','  const gfx = useSyncExternalStore(subscribeDevGfx, getDevGfx, getDevGfx);\n  const custom = graphicsQualityIsCustom();\n  return <fieldset').replace('aria-pressed={quality === id}','aria-pressed={!custom && quality === id}').replace("quality === id ?", "!custom && quality === id ?");s=s.replace('    <p className="mt-2', '''    <p className="mt-2 text-xs text-muted">{t("Baixa: sombras 1024 suaves. Média: 2048 nítidas. Alta: 4096 nítidas.")}</p>
    {custom && <p className="mt-2 text-xs">{t("Personalizada")} · {gfx.shadowResolution}</p>}
    <p className="mt-2''');p.write_text(s,encoding='utf-8')
p=Path('src/game/gamePreferences.ts');s=p.read_text(encoding='utf-8').replace('const english: Record<string, string> = {','''const english: Record<string, string> = {
 "Baixa: sombras 1024 suaves. Média: 2048 nítidas. Alta: 4096 nítidas.": "Low: soft 1024 shadows. Medium: sharp 2048. High: sharp 4096.",
 "Personalizada": "Custom",
 "Oclusão ambiente e iluminação mantidas em todas as qualidades.": "Ambient occlusion and lighting are preserved at every quality level.",''');p.write_text(s,encoding='utf-8')
# Only remove the two newly introduced failed experiment files.
Path('src/game/gfx/three/ThreeContactShadows.ts').unlink()
Path('scripts/qa-contact-shadows.mjs').unlink()
