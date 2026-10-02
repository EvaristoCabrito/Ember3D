"""3D Water V3: seamless PBR water maps from a real FFT ocean spectrum (Tessendorf).

V1/V2 summed a few hand-picked sine waves, which reads as a fake pattern. V3 synthesizes a
wind-driven ocean surface the way film/ocean simulators (and Blender's Ocean modifier) do:
a Phillips wave spectrum with random phases, inverse-FFT'd to a height field, plus
Tessendorf "choppy" horizontal displacement that sharpens crests and flattens troughs.
An FFT field is periodic by construction, so every map tiles with no seam.

The surface is shaded as seen straight down under an overcast sky (deep-water body color
plus Fresnel-weighted sky reflection), then tone-matched to the reference photo
assets/blender/water-v3-reference.jpg.

Run with any Python that has numpy + Pillow:
    python assets/blender/create_game_water_v3.py
Writes public/game/textures/water-v3/water-{color,normal,roughness}.png and a 2x2 tiling
check image at assets/blender/game-water-v3-tiling.png.
"""
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public" / "game" / "textures" / "water-v3"
REFERENCE = ROOT / "assets" / "blender" / "water-v3-reference.jpg"
OUT.mkdir(parents=True, exist_ok=True)

import sys
N = int(sys.argv[1]) if len(sys.argv) > 1 else 2048
SEED = 20261002
# Wavelengths are in tile widths, matched to the reference photo's crest spacing at 1:1
# pixels. How large the waves look in game is set by the V3 texture repeat in ThreeWater.
DOMINANT = 1 / 16
SMALLEST = 5.0 / N          # soft spectral cutoff: ripples under ~10 px fade out (no crinkle)
ALIGNMENT = 2.5             # |k.w|^ALIGNMENT: high = long crests running across the wind
WIND_DIR = np.array([0.26, 0.97])  # mostly "up" the image: crests run left-right like the photo
CHOP = 0.3                  # Tessendorf choppiness (sharp crests, broad troughs; kept below fold-over)
CONTRAST = 0.6               # color-map contrast relative to the reference photo
RIPPLE = 0.004              # strength of the fine ripple band riding on the wavelets
SLOPE_GAIN = 1.0            # overall wave steepness used for shading/normals

rng = np.random.default_rng(SEED)
WIND_DIR = WIND_DIR / np.linalg.norm(WIND_DIR)

# --- Phillips spectrum on the periodic frequency grid (tile width = 1). ---
freq = np.fft.fftfreq(N, d=1.0 / N)              # cycles per tile
kx, ky = np.meshgrid(freq * 2 * np.pi, freq * 2 * np.pi)
k = np.hypot(kx, ky)
k_safe = np.where(k == 0, 1.0, k)
# The reference photo was shot at a low angle, so perspective squashes the waves vertically
# and draws each crest out into a long horizontal line. FORESHORTEN builds that look into
# the spectrum itself (vertical frequencies count FORESHORTEN times as long).
FORESHORTEN = 1.0
kyv = ky / FORESHORTEN
k_view = np.where(np.hypot(kx, kyv) == 0, 1.0, np.hypot(kx, kyv))
# Main wavelets: a JONSWAP-style peaked spectrum (Phillips shape sharpened around its peak)
# with a steep short-wave tail, so slopes stay smooth and rounded instead of crinkled.
Lw = DOMINANT / (2 * np.pi * np.sqrt(2))
cos_w = (kx * WIND_DIR[0] + kyv * WIND_DIR[1]) / k_view
kp = 2 * np.pi / DOMINANT
sigma = np.where(k_view <= kp, 0.07, 0.09)
peak = 3.3 ** np.exp(-((k_view - kp) ** 2) / (2 * sigma ** 2 * kp ** 2))
spectrum = np.exp(-1.25 * (kp / k_view) ** 4) / k_view ** 4.5 * peak * np.abs(cos_w) ** ALIGNMENT
spectrum *= np.exp(-(k_safe * SMALLEST / (2 * np.pi)) ** 2 * 4)
# A little energy against the wind keeps the chop short-crested instead of corduroy.
spectrum *= np.where(cos_w < 0, 0.5, 1.0)
# Fine wind ripples riding on the wavelets: a separate faint band about 3.5x shorter.
kr = kp * 3.5
ripples = np.exp(-((k_view - kr) ** 2) / (2 * (0.35 * kr) ** 2)) / k_view ** 4.5
spectrum = spectrum / spectrum.max() + RIPPLE * ripples / ripples.max()
spectrum[k == 0] = 0
amp = np.sqrt(spectrum / 2) * (rng.standard_normal((N, N)) + 1j * rng.standard_normal((N, N)))

def field(spec):
    return np.real(np.fft.ifft2(spec)) * N * N

height = field(amp)
# Tessendorf horizontal displacement D = ifft(-i k/|k| h)
disp_x = field(-1j * kx / k_view * amp)
disp_y = field(-1j * kyv / k_view * amp) / FORESHORTEN
scale = 1.0 / height.std()
height *= scale; disp_x *= scale; disp_y *= scale

# Sample the surface at x - CHOP*D(x) (one fixed-point step of the choppy remap), periodic
# bilinear, so crests sharpen and troughs widen exactly like the displaced ocean mesh.
px = DOMINANT * N / (2 * np.pi)                  # displacement units -> pixels
yy, xx = np.meshgrid(np.arange(N, dtype=np.float64), np.arange(N, dtype=np.float64), indexing="ij")
def sample(grid, sx, sy):
    x0 = np.floor(sx).astype(int) % N; y0 = np.floor(sy).astype(int) % N
    fx = sx - np.floor(sx); fy = sy - np.floor(sy)
    x1 = (x0 + 1) % N; y1 = (y0 + 1) % N
    return ((grid[y0, x0] * (1 - fx) + grid[y0, x1] * fx) * (1 - fy)
            + (grid[y1, x0] * (1 - fx) + grid[y1, x1] * fx) * fy)

# Invert x' = x + CHOP*D(x) with two fixed-point steps: one step leaves crease lines
# where crests bunch up; the second settles them.
ox = np.zeros_like(xx); oy = np.zeros_like(yy)
for _ in range(2):
    ox = CHOP * px * sample(disp_x, xx - ox, yy - oy)
    oy = CHOP * px * sample(disp_y, xx - ox, yy - oy)
h = sample(height, xx - ox, yy - oy)


# --- Surface normals from the choppy height field (periodic central differences). ---
gx = (np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1)) / 2
gy = (np.roll(h, -1, axis=0) - np.roll(h, 1, axis=0)) / 2
# Steepness: RMS slope ~0.28 is typical for wind chop seen from above.
slope_scale = SLOPE_GAIN * 0.28 / np.sqrt((gx ** 2 + gy ** 2).mean())
sx_, sy_ = gx * slope_scale, gy * slope_scale
# Image row 0 is the TOP of the PNG; normal-map green must point up the image (OpenGL).
nx, ny, nz = -sx_, sy_, np.ones_like(sx_)
inv = 1 / np.sqrt(nx * nx + ny * ny + nz * nz)
nx *= inv; ny *= inv; nz *= inv

# --- Color: what the eye reads as water is reflection, not relief. ---
# The game lights the normal map itself, so the color map must not bake directional
# shading (that double-embosses into rock/leather). Instead: a calm body color with broad,
# slow patches (wind slicks and deeper water), plus soft sky glints on the steeper ripple
# faces whichever way they lean, from the Fresnel term of a straight-down view.
fresnel = 0.02 + 0.98 * (1 - np.clip(nz, 0, 1)) ** 5
glint = np.clip((fresnel - 0.02) * 30, 0, 1) ** 0.8
patch_spec = np.exp(-((k_safe / (2 * np.pi)) / 3.0) ** 2) * (k > 0)
patches = field(np.sqrt(patch_spec) * (rng.standard_normal((N, N)) + 1j * rng.standard_normal((N, N))))
patches = (patches - patches.mean()) / patches.std()
lum = 0.55 * glint + 0.35 * patches + 0.25 * h / max(h.std(), 1e-9)
# A camera lens never resolves a perfectly crisp surface; a sub-pixel softening reads as
# photo. Done in the frequency domain so it wraps around and the tile stays seamless.
lum = np.real(np.fft.ifft2(np.fft.fft2(lum) * np.exp(-0.5 * (0.8 * k / N) ** 2)))

# --- Tone-match to the reference photo: luminance CDF, then its average tint. ---
ref = np.asarray(Image.open(REFERENCE).convert("RGB"), dtype=np.float64)
ref_lum = ref.mean(axis=2).ravel()
ref_sorted = np.sort(ref_lum)
rank = np.empty(N * N); rank[np.argsort(lum.ravel())] = np.linspace(0, 1, N * N)
matched = np.interp(rank, np.linspace(0, 1, ref_sorted.size), ref_sorted).reshape(N, N)
# Half the photo's contrast: the game's own lighting adds the rest from the normal map.
matched = ref_lum.mean() + (matched - ref_lum.mean()) * CONTRAST
tint = ref.reshape(-1, 3).mean(axis=0) / ref.mean()
color = np.clip(matched[:, :, None] * tint[None, None, :], 0, 255)
# Brighter pixels in the photo are a little greyer (sky reflection); keep that.
grey = np.clip((matched - ref_lum.mean()) / 40, 0, 1)[:, :, None]
color = np.clip(color * (1 - 0.25 * grey) + matched[:, :, None] * 0.25 * grey, 0, 255)

Image.fromarray(color.astype(np.uint8), "RGB").save(OUT / "water-color.png")
normal_rgb = np.stack([nx * 0.5 + 0.5, ny * 0.5 + 0.5, nz * 0.5 + 0.5], axis=-1)
Image.fromarray((normal_rgb * 255 + 0.5).astype(np.uint8), "RGB").save(OUT / "water-normal.png")
# Rough where the surface is breaking (steep crests), glossy in the smooth troughs.
steep = np.clip((1 - nz) * 12, 0, 1)
rough = np.clip(0.30 + 0.22 * steep + 0.05 * np.clip(h, -1, 1), 0.25, 0.6)
rough8 = (rough * 255 + 0.5).astype(np.uint8)
Image.fromarray(np.stack([rough8] * 3, axis=-1), "RGB").save(OUT / "water-roughness.png")

# 2x2 tiling check (any seam would show as a cross through the middle).
half = Image.open(OUT / "water-color.png").resize((N // 2, N // 2), Image.LANCZOS)
tiled = Image.new("RGB", (N, N))
for ox in (0, N // 2):
    for oy in (0, N // 2):
        tiled.paste(half, (ox, oy))
tiled.save(ROOT / "assets" / "blender" / "game-water-v3-tiling.png")
print("WATER_V3_DONE", OUT, "mean", color.reshape(-1, 3).mean(axis=0).round(1), "std", color.reshape(-1, 3).std(axis=0).round(1))
