from pathlib import Path
p=Path('scripts/qa-character-shadows.mjs');s=p.read_text(encoding='utf-8');s=s.replace('window.demo={e,r,art,decorationAnchor,T};','''window.demo={e,r,art,decorationAnchor,T};
 const program=r.renderer.properties.get(r.landscapeMaterial).currentProgram;
 const shader=r.renderer.getContext().getShaderSource(program.fragmentShader);
 console.log('CONTACT SHADER',shader.includes('max(-0.00005'),shader.match(/getShadow\\([^;]+/g)?.slice(-2));''');p.write_text(s,encoding='utf-8')
