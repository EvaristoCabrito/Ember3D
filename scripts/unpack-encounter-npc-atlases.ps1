# Unpack the four equal atlas cells without repainting, resizing, or changing alpha.
Add-Type -AssemblyName System.Drawing
$npcRepoRoot = Split-Path -Parent $PSScriptRoot
$npcCast = Get-Content -LiteralPath (Join-Path $npcRepoRoot 'work/npc-art/walk-cast.json') -Raw | ConvertFrom-Json
$npcSelectedSources = @{
  roadCartographer = 'C:\Users\evari\.codex\generated_images\01a0fb60-63a6-77a0-a50a-1a4f13c6cbe4\exec-0abc0036-c887-4338-b971-44952f196135.png'
  mushroomForager = 'C:\Users\evari\.codex\generated_images\01a0fb60-63a6-77a0-a50a-1a4f13c6cbe4\exec-4d93e2cc-41ed-4bb9-91f7-e22117329306.png'
  bellCollector = 'C:\Users\evari\.codex\generated_images\01a0fb60-63a6-77a0-a50a-1a4f13c6cbe4\exec-47e90734-82c9-4a10-aa17-054b06ada8bb.png'
}
foreach ($npc in $npcCast) {
  $npcSource = Join-Path $npcRepoRoot "work/npc-art/action-v2/$($npc.id)/sheet.png"
  if ($npcSelectedSources.ContainsKey($npc.id)) { $npcSource = $npcSelectedSources[$npc.id] }
  $npcTarget = Join-Path $npcRepoRoot "public/game/sprites/$($npc.id)"
  if (Test-Path -LiteralPath $npcTarget) { throw "Preserving existing sprite directory: $npcTarget" }
  New-Item -ItemType Directory -Path $npcTarget | Out-Null
  $npcBitmap = [System.Drawing.Bitmap]::new($npcSource)
  $npcScholarOriginal = $null
  if ($npc.id -eq 'shadowScholar') {
    $npcScholarOriginal = [System.Drawing.Bitmap]::new('C:\Users\evari\.codex\generated_images\01a0fb60-63a6-77a0-a50a-1a4f13c6cbe4\exec-74ce3beb-4a2e-4a5e-b939-4741bb31ce81.png')
  }
  try {
    if (($npcBitmap.Width % 2) -ne 0 -or ($npcBitmap.Height % 2) -ne 0) { throw 'Atlas must have four equal cells' }
    $npcWidth = [int]($npcBitmap.Width / 2)
    $npcHeight = [int]($npcBitmap.Height / 2)
    for ($npcFrame = 0; $npcFrame -lt 4; $npcFrame++) {
      $npcRect = [System.Drawing.Rectangle]::new(($npcFrame % 2) * $npcWidth, [int][Math]::Floor($npcFrame / 2) * $npcHeight, $npcWidth, $npcHeight)
      $npcFrameSource = $npcBitmap
      if ($null -ne $npcScholarOriginal -and $npcFrame -lt 3) { $npcFrameSource = $npcScholarOriginal }
      $npcCell = $npcFrameSource.Clone($npcRect, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
      try { $npcCell.Save((Join-Path $npcTarget "$($npcFrame + 1).png"), [System.Drawing.Imaging.ImageFormat]::Png) }
      finally { $npcCell.Dispose() }
    }
    Write-Output "$($npc.id): four $($npcWidth)x$($npcHeight) RGBA frames"
  } finally { $npcBitmap.Dispose(); if ($null -ne $npcScholarOriginal) { $npcScholarOriginal.Dispose() } }
}
