from pathlib import Path
p=Path('scripts/qa-renderer-presets.mjs');s=p.read_text(encoding='utf-8').replace('pointResolution:this.pointLights[0].shadow.mapSize.x, contacts:this.contactShadowGroup.visible,','pointResolution:this.pointLights[0].shadow.mapSize.x, contacts:this.contactShadowGroup.visible, receiverContact:this.groundAO.uniforms.groundContactStrength.value,');s=s.replace('await panel.screenshot({path:`screenshots/preview-2d/${prefix}-3d.png`});','''await page.evaluate(()=>window.gfx.setDevGfx({contactShadows:true}));
await page.waitForFunction(()=>window.shadowSnapshot.receiverContact===1);
await panel.screenshot({path:`screenshots/preview-2d/${prefix}-3d-contact.png`});
await toggle.click();
await page.waitForFunction(()=>!window.shadowSnapshot.tactical && window.shadowSnapshot.receiverContact===1);
await panel.screenshot({path:`screenshots/preview-2d/${prefix}-2d-contact.png`});''');p.write_text(s,encoding='utf-8')
p=Path('scripts/qa-graphics-loading.mjs');s=p.read_text(encoding='utf-8').replace('p.lights && !p.contacts','p.lights && p.contacts');p.write_text(s,encoding='utf-8')
p=Path('scripts/qa-contact-shadows.mjs');s=p.read_text(encoding='utf-8-sig').replace(' console.log(JSON.stringify(result));\n assert.ok(result.on[0]',' assert.ok(result.on[0]');s=s.replace('  const outside=brightness(40,40);const center=brightness(0,0);','''  const outside=brightness(40,40);const center=brightness(0,0);
  // Rotate the sky light to the opposite side, as happens when the moon is used.
  light.position.set(1200,1600,2000);renderer.render(scene,camera);
  const opposite=brightness(9.75,0);light.position.set(-1200,1600,2000);
  // Raise the receiver and caster together; the correction must use receiver depth, not z=0.
  ground.position.z=12;caster.position.z=22;renderer.render(scene,camera);
  const raised=brightness(-9.75,0);ground.position.z=0;caster.position.z=10;''');s=s.replace('return {off,on,outside,center};','return {off,on,outside,center,opposite,raised};').replace(" assert.ok(result.center<result.outside-10,'Solid caster interior must be shadowed');", " assert.ok(result.center<result.outside-10,'Solid caster interior must be shadowed');\n assert.ok(result.raised<result.outside-10 && result.opposite<result.outside-10,'Raised receivers and opposite sky direction must stay attached');");p.write_text(s,encoding='utf-8')
