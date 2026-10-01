# 3D Walls

The map editor has a **3D Walls** tab beside Terreno and Decoração. It contains a full-height stone wall, a low wall, an open doorway, and a closed door.

Place wall modules in neighboring rows and columns to form continuous rectangular room boundaries. Architecture uses aligned columns rather than staggered hex-shaped pieces, with square corner joints. Use Girar objeto to turn a doorway or isolated wall by 90 degrees. The board cells still determine movement blocking. Select a placed piece and press Delete to remove it. Pieces are saved with the map and appear in the live preview and combat.

Walls and closed doors block movement and line of sight without changing the floor tile. Open doorways are passable. The initial closed-door piece is static; opening interactions, locks, and secret passages can be added separately.

The Three.js renderer builds solid geometry with rough stone materials, receives lighting, and casts shadows from the sun and local lights. Geometry is projected into the game's existing isometric view. No new bitmap artwork is required. Architecture stays in the Three scene while spell effects temporarily move ordinary sprite decorations to an overlay. Undiscovered architecture remains hidden under fog.
