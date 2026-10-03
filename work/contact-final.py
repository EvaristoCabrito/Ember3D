from pathlib import Path
p=Path('src/game/gfx/three/ThreeBattleRenderer.ts');s=p.read_text(encoding='utf-8').replace('this.projectedContacts.setSurface(this.engine.tacticsCamera ? this.landscape : null);','this.projectedContacts.setSurface(enabled ? this.landscape : null);');p.write_text(s,encoding='utf-8')
p=Path('scripts/qa-contact-shadows.mjs');s=p.read_text(encoding='utf-8-sig');s=s.replace('  contacts.dispose();renderer.dispose();canvas.remove();','''  // Receiver height sampler must compile and keep contacts on a raised/sloping surface.
  const {buildLandscape}=await import('/src/game/gfx/three/ThreeLandscape.ts');
  const surface=buildLandscape({minX:-64,minY:-64,maxX:64,maxY:64},8,8,(x)=>10+x*.1,()=>true);
  ground.geometry.dispose();ground.geometry=surface.geometry;
  for(const leg of legs) leg.position.z=surface.heightAt(leg.position.x,0)+10;
  contacts.setSurface(surface);contacts.begin(true);
  legs.forEach(m=>contacts.add(m,surface.heightAt(m.position.x,0),5,direction,.5));contacts.end();renderer.render(scene,camera);
  const raised=brightness(23,-1);
  contacts.begin(false);contacts.end();renderer.render(scene,camera);const raisedOff=brightness(23,-1);
  contacts.dispose();renderer.dispose();canvas.remove();''').replace('return {on,off};','return {on,off,raised,raisedOff};').replace('assert.equal(result.off,255);','assert.equal(result.off,255);\n assert.ok(result.raised<result.raisedOff,"Contact must remain on a raised sloping receiver");');p.write_text(s,encoding='utf-8')
