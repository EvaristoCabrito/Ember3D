from pathlib import Path
s=Path('scripts/qa-preview-2d.mjs').read_text(encoding='utf-8')
s=s.replace("import { chromium }", "import assert from 'node:assert/strict';\nimport { chromium }")
s=s.replace("const prefix = process.argv[3] ?? 'preview2d';", "const prefix = 'revised-presets';")
s=s.replace("  const { MapEditorScreen } = await import('/src/game/GameApp.tsx');", '''  const appSource=await (await fetch('/src/game/GameApp.tsx')).text();
  const previewPath=appSource.match(/from ["']([^"']*MapPreviewCanvas[^"']*)["']/)[1];
  const previewSource=await (await fetch(previewPath)).text();
  const rendererPath=previewSource.match(/from ["']([^"']*ThreeBattleRenderer[^"']*)["']/)[1];
  const rendererSource=await (await fetch(rendererPath)).text();
  const gfxPath=rendererSource.match(/from ["']([^"']*devGfx[^"']*)["']/)[1];
  const {ThreeBattleRenderer}=await import(rendererPath);
  window.gfx=await import(gfxPath);
  const original=ThreeBattleRenderer.prototype.render;
  ThreeBattleRenderer.prototype.render=function(...args) {
    original.apply(this,args);
    window.shadowSnapshot={type:this.renderer.shadowMap.type,resolution:this.sunLight.shadow.mapSize.x,
      pointResolution:this.pointLights[0].shadow.mapSize.x, contacts:this.contactShadowGroup.visible,
      tactical:this.engine.tacticsCamera};
  };
  const { MapEditorScreen } = await import('/src/game/GameApp.tsx');''')
start=s.index('await toggle.click();\nawait page.waitForTimeout(4000);')
end=s.index("console.log('errors:'",start)
s=s[:start]+'''await toggle.click();
await page.waitForFunction(()=>window.shadowSnapshot?.tactical,{timeout:30000});
for (const [resolution,soft,type,point] of [[1024,true,1,256],[2048,false,0,512],[4096,false,0,1024]]) {
 await page.evaluate(({resolution,soft})=>window.gfx.setDevGfx({shadowResolution:resolution,softShadows:soft,realShadows:true,contactShadows:false}),{resolution,soft});
 await page.waitForFunction(({resolution,type})=>window.shadowSnapshot.resolution===resolution&&window.shadowSnapshot.type===type,{resolution,type});
 const snapshot=await page.evaluate(()=>window.shadowSnapshot);
 assert.equal(snapshot.pointResolution,point);assert.equal(snapshot.contacts,false);
 console.log(snapshot);
}
await panel.screenshot({path:`screenshots/preview-2d/${prefix}-3d.png`});
assert.ok(!errors.some(e=>/THREE.WebGLProgram|shader error|ReferenceError|TypeError/.test(e)));
'''+s[end:]
Path('scripts/qa-renderer-presets.mjs').write_text(s,encoding='utf-8')
