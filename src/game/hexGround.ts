/** Draw a continuous material in board coordinates, clipped by the caller's hex.
 * Mirroring each repeat gives identical boundary pixels without modifying the source art.
 * Camera motion changes only the screen offset, never the material's board position. */
export function drawHexGround(
  ctx: any,
  image: CanvasImageSource,
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
      ctx.drawImage(image, 0, 0, period, period);
      ctx.restore();
    }
  }
  ctx.restore();
}
