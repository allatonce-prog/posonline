const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const inputFile = path.join(__dirname, 'icons', 'base-icon.png');
const outputDir = path.join(__dirname, 'icons');

async function generateIcons() {
    console.log('Generating PWA icons from base-icon.png...');

    for (const size of sizes) {
        const outputFile = path.join(outputDir, `icon-${size}x${size}.png`);

        try {
            await sharp(inputFile)
                .resize(size, size, {
                    fit: 'contain',
                    background: { r: 255, g: 255, b: 255, alpha: 0 }
                })
                .png()
                .toFile(outputFile);

            console.log(`✓ Generated ${size}x${size} icon`);
        } catch (error) {
            console.error(`✗ Error generating ${size}x${size}:`, error.message);
        }
    }

    console.log('Done! All icons generated.');
}

generateIcons().catch(console.error);
