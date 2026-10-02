/** Draw a continuous material in board coordinates, clipped by the caller's hex.
 * Mirroring each repeat gives identical boundary pixels without modifying the source art.
 * Camera motion changes only the screen offset, never the material's board position. */
export function drawHexGround(
  ctx: any,
  image: HTMLImageElement,
  cx: number,
  cy: number,
  worldX: number,
  worldY: number,
  radius: number,
): void {
  // Spread detailed material across several cells so repeats do not dominate the board.
  const period = radius * 8;
  ctx.save();
  ctx.translate(cx - worldX, cy - worldY);
  const left = Math.floor((worldX - radius) / period);
  const right = Math.floor((worldX + radius) / period);
  const top = Math.floor((worldY - radius) / period);
  const bottom = Math.floor((worldY + radius) / period);
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      const flipX = Math.abs(x % 2) === 1;
      const flipY = Math.abs(y % 2) === 1;
      ctx.save();
      ctx.translate((x + Number(flipX)) * period, (y + Number(flipY)) * period);
      ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
      drawGroundTexture(ctx, image, 0, 0, period, period);
      ctx.restore();
    }
  }
  ctx.restore();
}
/** Match the border filler: enlarge the middle half of every ground texture. */
export const GROUND_TEXTURE_SPAN = 0.5;
export const GROUND_TEXTURE_INSET = (1 - GROUND_TEXTURE_SPAN) / 2;

// The editor's 2D preview draws through WebGL2DRenderer, whose drawImage only takes
// (img, x, y, w, h). Give it a cached copy already cropped to the same middle half.
const croppedGroundTextures = new WeakMap<HTMLImageElement, HTMLCanvasElement>();
function croppedGroundTexture(image: HTMLImageElement): CanvasImageSource {
  let cropped = croppedGroundTextures.get(image);
  if (cropped) return cropped;
  if (!image.complete || !image.naturalWidth) return image;
  cropped = document.createElement("canvas");
  cropped.width = Math.max(1, Math.round(image.naturalWidth * GROUND_TEXTURE_SPAN));
  cropped.height = Math.max(1, Math.round(image.naturalHeight * GROUND_TEXTURE_SPAN));
  cropped.getContext("2d")!.drawImage(image,
    image.naturalWidth * GROUND_TEXTURE_INSET, image.naturalHeight * GROUND_TEXTURE_INSET,
    image.naturalWidth * GROUND_TEXTURE_SPAN, image.naturalHeight * GROUND_TEXTURE_SPAN,
    0, 0, cropped.width, cropped.height);
  croppedGroundTextures.set(image, cropped);
  return cropped;
}

export function drawGroundTexture(ctx: any, image: HTMLImageElement, x: number, y: number, width: number, height: number): void {
  if (!(ctx instanceof CanvasRenderingContext2D)) {
    ctx.drawImage(croppedGroundTexture(image), x, y, width, height);
    return;
  }
  ctx.drawImage(image,
    image.naturalWidth * GROUND_TEXTURE_INSET, image.naturalHeight * GROUND_TEXTURE_INSET,
    image.naturalWidth * GROUND_TEXTURE_SPAN, image.naturalHeight * GROUND_TEXTURE_SPAN,
    x, y, width, height);
}
