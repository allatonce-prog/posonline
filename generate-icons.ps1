# PowerShell script to generate PWA icons from a base image
# This script uses ImageMagick or creates a simple HTML-based solution

$iconSizes = @(72, 96, 128, 144, 152, 192, 384, 512)
$baseIconPath = "C:/Users/renei/.gemini/antigravity/brain/9003e899-d4ae-4192-9245-b20652f6d40e/pos_app_icon_1769004545577.png"
$outputDir = "icons"

# Create icons directory if it doesn't exist
if (-not (Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir | Out-Null
}

Write-Host "Checking for ImageMagick..." -ForegroundColor Cyan

# Check if ImageMagick is installed
$magickInstalled = $false
try {
    $null = magick -version 2>$null
    $magickInstalled = $true
    Write-Host "ImageMagick found! Generating icons..." -ForegroundColor Green
} catch {
    Write-Host "ImageMagick not found. Will create HTML-based solution." -ForegroundColor Yellow
}

if ($magickInstalled) {
    # Use ImageMagick to resize
    foreach ($size in $iconSizes) {
        $outputFile = Join-Path $outputDir "icon-${size}x${size}.png"
        Write-Host "Generating ${size}x${size} icon..." -ForegroundColor Cyan
        magick $baseIconPath -resize "${size}x${size}" $outputFile
    }
    Write-Host "`nAll icons generated successfully!" -ForegroundColor Green
} else {
    Write-Host "`nImageMagick is not installed. Installing via winget..." -ForegroundColor Yellow
    Write-Host "Run: winget install ImageMagick.ImageMagick" -ForegroundColor Cyan
    Write-Host "`nAlternatively, you can use an online tool:" -ForegroundColor Yellow
    Write-Host "1. Go to https://www.pwabuilder.com/imageGenerator" -ForegroundColor Cyan
    Write-Host "2. Upload the base icon from: $baseIconPath" -ForegroundColor Cyan
    Write-Host "3. Download the generated icons and place them in the 'icons' folder" -ForegroundColor Cyan
}
