from pathlib import Path
p=Path('src/game/gfx/three/ThreeGroundAO.ts');s=p.read_text(encoding='utf-8');s=s.replace('    groundLightCap: { value: 10 },','''    groundLightCap: { value: 10 },
    /** Ground-only close-contact comparison. Never changes bias on the lights/model surfaces. */
    groundContactStrength: { value: 1 },''');s=s.replace('uniform float groundLightCap;",','uniform float groundLightCap;\\nuniform float groundContactStrength;",');needle='''      shader.fragmentShader = shader.fragmentShader''';s=s.replace(needle,'''      // Keep complete shadow-map silhouettes. A receiver-side comparison closes the
      // large bias gap without clipping caster triangles or drawing a second dark shape.
      const lighting = THREE.ShaderChunk.lights_fragment_begin
        .replaceAll("directionalLightShadow.shadowBias", "mix(directionalLightShadow.shadowBias, max(-0.00005, directionalLightShadow.shadowBias * 0.03), groundContactStrength)")
        .replaceAll("pointLightShadow.shadowBias", "mix(pointLightShadow.shadowBias, max(-0.00005, pointLightShadow.shadowBias * 0.03), groundContactStrength)");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <lights_fragment_begin>", lighting)''');s=s.replace('() => "groundAO"','() => "groundAO-groundContact-v1"');p.write_text(s,encoding='utf-8')
p=Path('src/game/gfx/three/ThreeBattleRenderer.ts');s=p.read_text(encoding='utf-8').replace('    this.groundAO.setEnabled(gfx.ambientOcclusion);','    this.groundAO.setEnabled(gfx.ambientOcclusion);\n    this.groundAO.uniforms.groundContactStrength.value = gfx.contactShadows ? 1 : 0;').replace('    this.contactShadowGroup.visible = gfx.contactShadows && !this.engine.tacticsCamera;','    this.contactShadowGroup.visible = false;').replace('    this.decorContactGroup.visible = gfx.contactShadows && this.decorGroup.visible && !this.engine.tacticsCamera;','    this.decorContactGroup.visible = false;');p.write_text(s,encoding='utf-8')
p=Path('src/game/graphicsQuality.ts');s=p.read_text(encoding='utf-8').replace('contactShadows: false','contactShadows: true').replace('!== "2"','!== "3"').replace('Version", "2"','Version", "3"');p.write_text(s,encoding='utf-8')
p=Path('src/game/gfx/three/devGfx.ts');s=p.read_text(encoding='utf-8').replace('contactShadows: false','contactShadows: true');start=s.index('  /** A short, darken-only grounding decal');end=s.index('  contactShadows:',start);s=s[:start]+'''  /** Ground receiver shadow comparison closes the bias gap using the full caster silhouette. */
'''+s[end:];p.write_text(s,encoding='utf-8')
p=Path('src/game/OptionsMenu.tsx');s=p.read_text(encoding='utf-8').replace("[['realShadows', 'Sombras'], ['localLights', 'Luzes locais']]", "[['realShadows', 'Sombras'], ['contactShadows', 'Sombras de contato'], ['localLights', 'Luzes locais']]");p.write_text(s,encoding='utf-8')
