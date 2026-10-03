from pathlib import Path
p=Path('src/game/gfx/three/ThreeBattleRenderer.ts');s=p.read_text(encoding='utf-8');s='import { ThreeContactShadows } from "./ThreeContactShadows";\n'+s;s=s.replace('  private contactShadowGroup = new THREE.Group();','  private projectedContacts = new ThreeContactShadows();\n  private contactShadowGroup = new THREE.Group();');s=s.replace('    this.scene.add(this.contactShadowGroup);','    this.scene.add(this.projectedContacts.group);\n    this.scene.add(this.contactShadowGroup);');s=s.replace('    this.applyDevGfx();','    this.applyDevGfx();\n    this.syncProjectedContacts(tile);');s=s.replace('    this.contactShadowGroup.visible = gfx.contactShadows;','    this.contactShadowGroup.visible = gfx.contactShadows && !this.engine.tacticsCamera;').replace('    this.decorContactGroup.visible = gfx.contactShadows && this.decorGroup.visible;','    this.decorContactGroup.visible = gfx.contactShadows && this.decorGroup.visible && !this.engine.tacticsCamera;');pos=s.index('  /** Occluders for the ground AO field:');s=s[:pos]+'''  private syncProjectedContacts(tile: number): void {
    const enabled = this.engine.tacticsCamera && getDevGfx().contactShadows;
    this.projectedContacts.begin(enabled);
    if (enabled) {
      const direction = TIME_OF_DAY_LIGHT[this.timeOfDay].moon ? this.moonDir : this.sunDir;
      for (const entry of this.unitEntries.values()) {
        if (!entry.mesh.visible || !entry.shadowMesh.visible) continue;
        this.projectedContacts.add(entry.shadowMesh, entry.contactMesh.position.z - CONTACT_SHADOW_Z,
          tile * 0.22, direction, entry.contactMaterial.opacity * 0.6);
      }
      for (const entry of [...this.decorEntries, ...this.wallEntries]) {
        if (!entry.mesh.visible || DECORATIONS[entry.placement.id]?.noShadow) continue;
        const ground = this.groundHeight(entry.placement.x, entry.placement.y, tile);
        if (entry.shadowMesh) this.projectedContacts.add(entry.shadowMesh, ground, tile * 0.22, direction);
        else entry.mesh.traverseVisible(object => {
          if (object instanceof THREE.Mesh && object.castShadow)
            this.projectedContacts.add(object, ground, tile * 0.22, direction);
        });
      }
    }
    this.projectedContacts.end();
  }

'''+s[pos:];s=s.replace('    this.contactShadowTexture.dispose();','    this.projectedContacts.dispose();\n    this.contactShadowTexture.dispose();');p.write_text(s,encoding='utf-8')
