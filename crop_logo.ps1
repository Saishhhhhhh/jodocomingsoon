Add-Type -AssemblyName System.Drawing
$file = 'C:\Users\Admin\Desktop\Jodocoming soon\public\logo.png'
$img = [System.Drawing.Bitmap]::FromFile($file)
$w = $img.Width
$h = $img.Height
$minX = $w; $minY = $h; $maxX = 0; $maxY = 0

for ($y = 0; $y -lt $h; $y += 2) {
    for ($x = 0; $x -lt $w; $x += 2) {
        $c = $img.GetPixel($x, $y)
        if ($c.A -gt 30 -and ($c.R -lt 248 -or $c.G -lt 248 -or $c.B -lt 248)) {
            if ($x -lt $minX) { $minX = $x }
            if ($x -gt $maxX) { $maxX = $x }
            if ($y -lt $minY) { $minY = $y }
            if ($y -gt $maxY) { $maxY = $y }
        }
    }
}

Write-Output "Bounds: minX=$minX, minY=$minY, maxX=$maxX, maxY=$maxY, origW=$w, origH=$h"

$pad = 12
$cropX = [Math]::Max(0, $minX - $pad)
$cropY = [Math]::Max(0, $minY - $pad)
$cropW = [Math]::Min($w - $cropX, ($maxX - $minX) + ($pad * 2))
$cropH = [Math]::Min($h - $cropY, ($maxY - $minY) + ($pad * 2))

$rect = New-Object System.Drawing.Rectangle($cropX, $cropY, $cropW, $cropH)
$cropped = $img.Clone($rect, $img.PixelFormat)
$img.Dispose()
$dest = 'C:\Users\Admin\Desktop\Jodocoming soon\public\logo-cropped.png'
$cropped.Save($dest, [System.Drawing.Imaging.ImageFormat]::Png)
$cropped.Dispose()
Write-Output "Successfully saved cropped logo to $dest"
