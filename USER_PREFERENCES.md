# Visual asset preference

Never generate, redraw, repaint, or otherwise alter visual artwork for this user.
Use only the exact image files the user supplies. Crop an image only when the user
explicitly requests a crop.

# Verification preference

Use rigorous tests by default before reporting work complete. Verify actual runtime behavior, exercise relevant alternate states and regressions, and inspect rendered results for visual changes. File checks and typechecks alone are insufficient for animation or rendering changes. State precisely what was tested and any remaining limitations. Deliver early results only when the user interrupts and requests them before verification is complete.

# Debug mode preference

Debug mode must follow the same game flow as normal play, including the same cutscenes, briefings, subtitle behavior, and sound controls. Its only gameplay differences are that missions are unlocked and party levels are boosted. Do not create separate debug-only menus or preview routes for content that belongs in the normal flow.
