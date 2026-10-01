Add-Type -AssemblyName System.Drawing

$width = 1080
$height = 2340

$bmp = [System.Drawing.Bitmap]::new($width, $height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

# 1. Background gradient: sleek dark carbon fleet
$rect = [System.Drawing.Rectangle]::new(0, 0, $width, $height)
$topColor = [System.Drawing.ColorTranslator]::FromHtml('#080C14')
$midColor = [System.Drawing.ColorTranslator]::FromHtml('#121824')
$brush = [System.Drawing.Drawing2D.LinearGradientBrush]::new($rect, $topColor, $midColor, [System.Drawing.Drawing2D.LinearGradientMode]::Vertical)
$g.FillRectangle($brush, $rect)
$brush.Dispose()

# Subtle geometric grid accent
$gridPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(10, 255, 255, 255), 1.0)
for ($gx = 0; $gx -lt $width; $gx += 120) {
    $g.DrawLine($gridPen, [float]$gx, [float]0, [float]$gx, [float]$height)
}
for ($gy = 0; $gy -lt $height; $gy += 120) {
    $g.DrawLine($gridPen, [float]0, [float]$gy, [float]$width, [float]$gy)
}
$gridPen.Dispose()

# 2. Draw MM Ride Logo Watermark in Center (18% Opacity with rounded clip)
$logoPath = 'c:\MM Ride\driver-app\assets\logo.png'
if (-not (Test-Path $logoPath)) {
    $logoPath = 'C:\Users\acer\Desktop\mmride-logo.png'
}

if (Test-Path $logoPath) {
    $srcLogo = [System.Drawing.Image]::FromFile($logoPath)
    $targetW = 460
    $targetH = [int]($srcLogo.Height * ($targetW / $srcLogo.Width))
    $x = [int](($width - $targetW) / 2)
    $y = [int](($height - $targetH) / 2) - 130

    $cm = [System.Drawing.Imaging.ColorMatrix]::new()
    $cm.Matrix33 = 0.20  # 20% alpha opacity for clean visibility
    $ia = [System.Drawing.Imaging.ImageAttributes]::new()
    $ia.SetColorMatrix($cm, [System.Drawing.Imaging.ColorMatrixFlag]::Default, [System.Drawing.Imaging.ColorAdjustType]::Bitmap)

    # Squircle clipping path to remove any sharp outer square border
    $logoPathClip = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $lRad = [float]90.0
    $lD = [float]($lRad * 2.0)
    $logoPathClip.AddArc([float]$x, [float]$y, $lD, $lD, 180.0, 90.0)
    $logoPathClip.AddArc([float]($x + $targetW - $lD), [float]$y, $lD, $lD, 270.0, 90.0)
    $logoPathClip.AddArc([float]($x + $targetW - $lD), [float]($y + $targetH - $lD), $lD, $lD, 0.0, 90.0)
    $logoPathClip.AddArc([float]$x, [float]($y + $targetH - $lD), $lD, $lD, 90.0, 90.0)
    $logoPathClip.CloseFigure()

    $g.SetClip($logoPathClip)
    $destRect = [System.Drawing.Rectangle]::new($x, $y, $targetW, $targetH)
    $g.DrawImage($srcLogo, $destRect, 0, 0, $srcLogo.Width, $srcLogo.Height, [System.Drawing.GraphicsUnit]::Pixel, $ia)
    $g.ResetClip()

    $logoPathClip.Dispose()
    $srcLogo.Dispose()
    $ia.Dispose()
}

# 3. Top subtle fleet branding
$bullet = [char]0x2022
$topFont = [System.Drawing.Font]::new('Arial', 17, [System.Drawing.FontStyle]::Bold)
$topBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(70, 255, 255, 255))
$sfTop = [System.Drawing.StringFormat]::new()
$sfTop.Alignment = [System.Drawing.StringAlignment]::Center
$g.DrawString("MM RIDE $bullet OFFICIAL DRIVER FLEET", $topFont, $topBrush, [float]($width / 2), [float]115, $sfTop)
$topFont.Dispose()
$topBrush.Dispose()
$sfTop.Dispose()

# 4. Bottom-Right UPI Payment QR Card (High-Contrast White Card for Instant Camera Scanning)
$qrPath = 'c:\MM Ride\mdm\payment_qr.png'
if (Test-Path $qrPath) {
    $qrImg = [System.Drawing.Image]::FromFile($qrPath)

    # Card dimensions
    $cardW = 460.0
    $cardH = 580.0
    $cardMarginRight = 45.0
    $cardMarginBottom = 160.0

    $cardX = [float]($width - $cardW - $cardMarginRight)
    $cardY = [float]($height - $cardH - $cardMarginBottom)
    $radius = 28.0

    # Rounded rectangle path
    $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $d = [float]($radius * 2.0)
    $path.AddArc($cardX, $cardY, $d, $d, 180.0, 90.0)
    $path.AddArc([float]($cardX + $cardW - $d), $cardY, $d, $d, 270.0, 90.0)
    $path.AddArc([float]($cardX + $cardW - $d), [float]($cardY + $cardH - $d), $d, $d, 0.0, 90.0)
    $path.AddArc($cardX, [float]($cardY + $cardH - $d), $d, $d, 90.0, 90.0)
    $path.CloseFigure()

    # Outer cyan glow
    $glowPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(160, 0, 185, 241), 5.0)
    $g.DrawPath($glowPen, $path)
    $glowPen.Dispose()

    # Fill card with crisp white background
    $cardBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
    $g.FillPath($cardBrush, $path)
    $cardBrush.Dispose()

    # Card Top Header Banner
    $bannerH = 54.0
    $bannerBrush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#002E6E')) # Deep Paytm Navy
    $bannerRect = [System.Drawing.RectangleF]::new($cardX, $cardY, $cardW, [float]$bannerH)
    
    # Clip banner to top rounded corners of card
    $g.SetClip($path)
    $g.FillRectangle($bannerBrush, $bannerRect)
    
    # Banner Text
    $bannerFont = [System.Drawing.Font]::new('Arial', 14, [System.Drawing.FontStyle]::Bold)
    $bannerTextBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
    $sfBanner = [System.Drawing.StringFormat]::new()
    $sfBanner.Alignment = [System.Drawing.StringAlignment]::Center
    $sfBanner.LineAlignment = [System.Drawing.StringAlignment]::Center
    $g.DrawString("SCAN & PAY $bullet ALL UPI APPS", $bannerFont, $bannerTextBrush, $bannerRect, $sfBanner)
    $g.ResetClip()

    $bannerBrush.Dispose()
    $bannerFont.Dispose()
    $bannerTextBrush.Dispose()
    $sfBanner.Dispose()

    # Draw the QR Code image inside the card below banner
    $qrPadding = 16.0
    $qrAreaW = [float]($cardW - ($qrPadding * 2.0))
    $qrAreaH = [float]($cardH - $bannerH - ($qrPadding * 2.0))

    # Scale QR keeping aspect ratio
    $scale = [Math]::Min([float]($qrAreaW / $qrImg.Width), [float]($qrAreaH / $qrImg.Height))
    $drawW = [int]($qrImg.Width * $scale)
    $drawH = [int]($qrImg.Height * $scale)
    $drawX = [int]($cardX + ($cardW - $drawW) / 2.0)
    $drawY = [int]($cardY + $bannerH + 6.0 + ($qrAreaH - $drawH) / 2.0)

    $g.DrawImage($qrImg, $drawX, $drawY, $drawW, $drawH)

    # Clean border stroke around entire card
    $borderPen = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml('#00B9F1'), 2.5)
    $g.DrawPath($borderPen, $path)
    $borderPen.Dispose()

    $path.Dispose()
    $qrImg.Dispose()
}

$g.Dispose()

# Save outputs to Desktop, Downloads, project, and artifacts
$out1 = 'C:\Users\acer\Desktop\mmride-wallpaper.png'
$out2 = 'C:\Users\acer\Downloads\mmride-wallpaper.png'
$out3 = 'c:\MM Ride\mdm\mmride-wallpaper.png'
$out4 = 'C:\Users\acer\.gemini\antigravity-ide\brain\755e5b7d-69a9-46a3-8cee-f268dfb42bc7\mmride-wallpaper.png'

$bmp.Save($out1, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Save($out2, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Save($out3, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Save($out4, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

Write-Output "Successfully updated wallpaper with bottom-right Payment QR at: $out1"
