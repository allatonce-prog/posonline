// Simple Node.js script to generate PWA icons
// Run: node generate-icons-node.js

const fs = require('fs');
const path = require('path');

console.log('📱 PWA Icon Generator');
console.log('====================\n');

const baseIconPath = path.join(__dirname, 'icons', 'base-icon.png');
const iconsDir = path.join(__dirname, 'icons');

if (!fs.existsSync(baseIconPath)) {
    console.error('❌ Error: base-icon.png not found in icons folder!');
    console.log('\n📋 Instructions:');
    console.log('1. Open icon-generator.html in your browser');
    console.log('2. Upload the base icon image');
    console.log('3. Click "Generate All Icons"');
    console.log('4. Move all downloaded icons to the icons/ folder');
    process.exit(1);
}

console.log('✅ Base icon found!');
console.log('\n📋 To generate icons, you have two options:');
console.log('\nOption 1: Use the HTML Generator (Recommended)');
console.log('  1. Open icon-generator.html in your browser');
console.log('  2. Upload icons/base-icon.png');
console.log('  3. Click "Generate All Icons"');
console.log('  4. Icons will be downloaded automatically');
console.log('\nOption 2: Use an online tool');
console.log('  1. Go to https://www.pwabuilder.com/imageGenerator');
console.log('  2. Upload icons/base-icon.png');
console.log('  3. Download the generated icons');
console.log('  4. Place them in the icons/ folder');

console.log('\n✨ Required icon sizes: 72, 96, 128, 144, 152, 192, 384, 512');
