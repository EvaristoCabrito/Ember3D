"""Animate the fireball study and render a looping flight preview."""
from pathlib import Path
import math
import bpy

OUT=Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(OUT/'fireball-v3.blend'))
scene=bpy.context.scene
scene.frame_start=1; scene.frame_end=48; scene.render.fps=24
root=bpy.data.objects.new('Fireball flight control',None)
scene.collection.objects.link(root)
objects=[o for o in scene.objects if o.name.startswith('Fireball |')]
for i,obj in enumerate(objects):
    obj.parent=root
    base=obj.location.copy(); scale=obj.scale.copy()
    if 'ember' in obj.name:
        for frame in (1,12,24,36,49):
            t=(frame-1)/48
            obj.location=base.copy()
            obj.location.x-=.5*math.sin(math.tau*t+i)
            obj.location.z+=.14*math.sin(math.tau*t+i*.7)
            obj.scale=scale*(.7+.3*math.sin(math.tau*t+i)**2)
            obj.keyframe_insert('location',frame=frame); obj.keyframe_insert('scale',frame=frame)
    elif 'smoke puff' in obj.name:
        for frame in (1,12,24,36,49):
            t=(frame-1)/48
            obj.location=base.copy(); obj.location.z+=.09*math.sin(math.tau*t+i)
            obj.scale=scale*(1+.1*math.sin(math.tau*t+i))
            obj.keyframe_insert('location',frame=frame); obj.keyframe_insert('scale',frame=frame)
    elif 'flame tongue' in obj.name or 'surface filament' in obj.name:
        for frame in (1,12,24,36,49):
            t=(frame-1)/48
            obj.rotation_euler.x=.12*math.sin(math.tau*t+i)
            obj.scale=(1+.05*math.sin(math.tau*t+i),1,1)
            obj.keyframe_insert('rotation_euler',frame=frame); obj.keyframe_insert('scale',frame=frame)
    elif 'spherical head' in obj.name:
        for frame in (1,12,24,36,49):
            t=(frame-1)/48
            obj.rotation_euler.x=t*math.tau
            obj.scale=(1+.025*math.sin(math.tau*t),1,1)
            obj.keyframe_insert('rotation_euler',frame=frame); obj.keyframe_insert('scale',frame=frame)
for frame,x in [(1,-.35),(24,.35),(49,-.35)]:
    root.location=(x,0,.08*math.sin((frame-1)*math.tau/48))
    root.keyframe_insert('location',frame=frame)
# Loop the shader turbulence without a jump at the preview boundary.
for mat in bpy.data.materials:
    if not mat.use_nodes: continue
    for node in mat.node_tree.nodes:
        if node.type=='TEX_NOISE' and node.noise_dimensions=='4D':
            for frame,w in [(1,0),(24,1.2),(49,0)]:
                node.inputs['W'].default_value=w
                node.inputs['W'].keyframe_insert('default_value',frame=frame)
scene.render.resolution_x=640; scene.render.resolution_y=390
scene.cycles.samples=12
scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'fireball-v3-animated.blend'))
frames=OUT/'fireball-v3-frames'; frames.mkdir(exist_ok=True)
for frame in range(1,49,2):
    scene.frame_set(frame)
    scene.render.filepath=str(frames/f'{frame:03d}.png')
    bpy.ops.render.render(write_still=True)
