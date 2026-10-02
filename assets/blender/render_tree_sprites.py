"""Classic overhead-view cutouts of the approved tree assets."""
from pathlib import Path
import bpy

ROOT=Path(__file__).resolve().parents[2]
for source,prefix,target in [("realistic-tree.blend","Tree |","tree-3d-broadleaf"),("snowy-pine.blend","Snowy pine |","tree-3d-snowy-pine")]:
    bpy.ops.wm.open_mainfile(filepath=str(ROOT/"assets/blender"/source))
    for obj in bpy.context.scene.objects:
        if obj.type=="MESH" and not obj.name.startswith(prefix):
            obj.hide_render=True
    scene=bpy.context.scene
    scene.render.film_transparent=True
    scene.render.resolution_x=384
    scene.render.resolution_y=448
    scene.cycles.samples=24
    scene.render.image_settings.color_mode="RGBA"
    scene.render.filepath=str(ROOT/"public/game/decorations"/(target+".png"))
    bpy.ops.render.render(write_still=True)
