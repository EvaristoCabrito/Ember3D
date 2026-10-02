"""3D Water V4: seamless PBR water maps built for in-game lighting, not a baked picture.

Water reads as water through reflection: a dark, clear body color, and a glossy surface
whose many small ripples catch the light as moving glints. So V4 puts almost everything
into the normal and roughness maps (which ThreeWater lights and animates every frame) and
keeps the color map a plain deep-water body with only faint variation.

The normal map stacks three FFT wave bands, each periodic over the tile so the result
tiles with no seam:
  - wavelets: short wind waves, JONSWAP-style peaked spectrum, Tessendorf chop
  - wind ripples: ~3x shorter, broader band riding on the wavelets
  - capillary ripples: the finest sparkle-sized detail

Run with any Python that has numpy + Pillow:
    python assets/blender/create_game_water_v4.py
Writes public/game/textures/water-v4/water-{color,normal,roughness}.png
"""
from pathlib import Path
import sys
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public" / "game" / "textures" / "water-v4"
OUT.mkdir(parents=True, exist_ok=True)

N = int(sys.argv[1]) if len(sys.argv) > 1 else 2048
SEED = 4404
WIND_DIR = np.array([0.42, 0.91]); WIND_DIR /= np.linalg.norm(WIND_DIR)

# (wavelength in tile widths, RMS slope, spectral width, alignment exponent, chop)
BANDS = [
    (1 / 26, 0.07, 0.12, 2.5, 0.2),    # wavelets: smooth, sinuous wind waves
    (1 / 70, 0.05, 0.18, 1.5, 0.0),    # wind ripples riding on them
    (1 / 160, 0.02, 0.20, 1.0, 0.0),   # faint fine ripples for glint sparkle
]
BODY_SRGB = np.array([20, 40, 47], dtype=np.float64)   # deep clear water, blue-green slate

rng = np.random.default_rng(SEED)
freq = np.fft.fftfreq(N, d=1.0 / N)
kx, ky = np.meshgrid(freq * 2 * np.pi, freq * 2 * np.pi)
k = np.hypot(kx, ky)
k_safe = np.where(k == 0, 1.0, k)
cos_w = (kx * WIND_DIR[0] + ky * WIND_DIR[1]) / k_safe
yy, xx = np.meshgrid(np.arange(N, dtype=np.float64), np.arange(N, dtype=np.float64), indexing="ij")


def field(spec):
    return np.real(np.fft.ifft2(spec)) * N * N


def sample(grid, sx, sy):
    x0 = np.floor(sx).astype(int) % N; y0 = np.floor(sy).astype(int) % N
    fx = sx - np.floor(sx); fy = sy - np.floor(sy)
    x1 = (x0 + 1) % N; y1 = (y0 + 1) % N
    return ((grid[y0, x0] * (1 - fx) + grid[y0, x1] * fx) * (1 - fy)
            + (grid[y1, x0] * (1 - fx) + grid[y1, x1] * fx) * fy)


def band(wavelength, rms_slope, width, alignment, chop):
    """One periodic wave band; returns its (dh/dx, dh/dy) slopes in image space."""
    kp = 2 * np.pi / wavelength
    shape = np.exp(-((np.log(k_safe / kp)) ** 2) / (2 * width ** 2))   # log-normal peak
    spectrum = shape / k_safe ** 2 * np.abs(cos_w) ** alignment
    spectrum *= np.where(cos_w < 0, 0.45, 1.0)
    spectrum[k == 0] = 0
    amp = np.sqrt(spectrum) * (rng.standard_normal((N, N)) + 1j * rng.standard_normal((N, N)))
    height = field(amp)
    height /= height.std()
    if chop:
        # Tessendorf horizontal displacement sharpens crests and widens troughs.
        dx = field(-1j * kx / k_safe * amp); dy = field(-1j * ky / k_safe * amp)
        s = 1 / np.sqrt(field(amp).var())
        px = chop * wavelength * N / (2 * np.pi)
        ox = np.zeros_like(xx); oy = np.zeros_like(yy)
        for _ in range(2):
            ox = px * s * sample(dx, xx - ox, yy - oy)
            oy = px * s * sample(dy, xx - ox, yy - oy)
        height = sample(height, xx - ox, yy - oy)
    gx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) / 2
    gy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) / 2
    g = rms_slope / np.sqrt((gx ** 2 + gy ** 2).mean())
    return gx * g, gy * g, height


def low_noise(cycles):
    """Broad periodic noise (a few blobs per tile), unit variance."""
    spec = np.exp(-((k_safe / (2 * np.pi)) / cycles) ** 2) * (k > 0)
    f = field(np.sqrt(spec) * (rng.standard_normal((N, N)) + 1j * rng.standard_normal((N, N))))
    return (f - f.mean()) / f.std()


# Wind gusts make some areas choppier than others; slicks stay glassy.
gust = 1 + 0.35 * np.tanh(low_noise(2.5))
sx = np.zeros((N, N)); sy = np.zeros((N, N))
for i, params in enumerate(BANDS):
    gx, gy, _ = band(*params)
    weight = 1.0 if i == 0 else gust          # finer ripples follow the gusts
    sx += gx * weight; sy += gy * weight

# Image row 0 is the TOP of the PNG; normal-map green must point up the image (OpenGL).
nx, ny, nz = -sx, sy, np.ones_like(sx)
inv = 1 / np.sqrt(nx * nx + ny * ny + nz * nz)
nx *= inv; ny *= inv; nz *= inv
normal = np.stack([nx, ny, nz], axis=-1) * 0.5 + 0.5
Image.fromarray((normal * 255 + 0.5).astype(np.uint8), "RGB").save(OUT / "water-normal.png")

# Color: plain deep-water body, a faint broad variation (depth/silt), nothing that reads
# as painted shading. All highlights come from the game's lights on the normal map.
body = BODY_SRGB[None, None, :] * (1 + 0.05 * low_noise(1.5))[:, :, None]
Image.fromarray(np.clip(body + 0.5, 0, 255).astype(np.uint8), "RGB").save(OUT / "water-color.png")

# Roughness: glossy overall; wind slicks (low gust) even smoother, gusty patches a bit rougher.
rough = np.clip(0.16 + 0.07 * (gust - 1) / 0.35, 0.08, 0.3)
rough8 = (rough * 255 + 0.5).astype(np.uint8)
Image.fromarray(np.stack([rough8] * 3, axis=-1), "RGB").save(OUT / "water-roughness.png")

# Preview of the relief only: the normal map lit by a low light, so the ripple structure
# can be judged by eye without the game (not used by the game).
light = np.array([0.35, 0.55, 0.76]); light /= np.linalg.norm(light)
half_v = light + np.array([0, 0, 1.0]); half_v /= np.linalg.norm(half_v)
spec = np.clip(nx * half_v[0] + ny * half_v[1] + nz * half_v[2], 0, 1) ** 220
fres = 0.03 + 0.97 * (1 - nz) ** 5
sky = np.array([0.42, 0.52, 0.58]); bodyl = BODY_SRGB / 255
preview = bodyl * (1 - fres[:, :, None] * 6) + sky * fres[:, :, None] * 6 + spec[:, :, None] * 0.9
Image.fromarray((np.clip(preview, 0, 1) * 255).astype(np.uint8)).crop((0, 0, 1024, 1024)).save(
    ROOT / "assets" / "blender" / "game-water-v4-preview.png")
print("WATER_V4_DONE", OUT)
