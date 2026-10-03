from pathlib import Path
p=Path('scripts/qa-options.mjs');s=p.read_text(encoding='utf-8-sig').replace('h(R.Fragment,null','h(R.Fragment??R.default.Fragment,null').replace(" await page.waitForTimeout(2000); console.log(await page.locator('body').innerText(), errors);\n",'');p.write_text(s,encoding='utf-8')
p=Path('src/game/GameApp.tsx');s=p.read_text(encoding='utf-8');import re
s=re.sub(r'(\n\s*)\{([A-Z][A-Z_]*(?:\.[a-zA-Z]+)*\.name)\}',r'\1{uiText(\2)}',s)
p.write_text(s,encoding='utf-8')
