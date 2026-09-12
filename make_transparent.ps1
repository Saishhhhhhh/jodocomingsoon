Add-Type -AssemblyName System.Drawing
$file = 'C:\Users\Admin\Desktop\Jodocoming soon\public\logo-cropped.png'
$img = [System.Drawing.Bitmap]::FromFile($file)
$w = $img.Width
$h = $img.Height

$transparentImg = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)

for ($y = 0; $y -lt $h; $y++) {
    for ($x = 0; $x -lt $w; $x++) {
        $c = $img.GetPixel($x, $y)
        # If pixel is near white/light background
        if ($c.R -gt 242 -and $c.G -gt 242 -and $c.B -gt 242) {
            $transparentImg.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, 0, 0, 0))
        } else {
            $transparentImg.SetPixel($x, $y, $c)
        }
    }
}

$img.Dispose()
$dest = 'C:\Users\Admin\Desktop\Jodocoming soon\public\logo-transparent.png'
$transparentImg.Save($dest, [System.Drawing.Imaging.ImageFormat]::Png)
$transparentImg.Dispose()
Write-Output "Successfully saved transparent logo to $dest"
