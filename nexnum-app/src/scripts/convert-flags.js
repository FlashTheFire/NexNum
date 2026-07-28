const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const srcDir = path.join(__dirname, '../../public/assets/icons/flags');
const destDir = path.join(__dirname, '../../public/assets/icons/icons/flags-telegram');

if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
}

async function convertFlags() {
    const files = fs.readdirSync(srcDir);
    console.log(`Found ${files.length} flag files in ${srcDir}`);

    let convertedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        const basename = path.basename(file, ext);
        const srcPath = path.join(srcDir, file);
        const destPath = path.join(destDir, `${basename}.png`);

        try {
            if (['.webp', '.svg', '.png', '.jpg', '.jpeg'].includes(ext)) {
                await sharp(srcPath)
                    .png({ compressionLevel: 6 })
                    .toFile(destPath);
                convertedCount++;
            } else {
                skippedCount++;
            }
        } catch (err) {
            console.error(`Error converting ${file}: ${err.message}`);
            errorCount++;
        }
    }

    console.log(`\nFlag Conversion Complete!`);
    console.log(`Successfully converted to PNG: ${convertedCount}`);
    console.log(`Skipped: ${skippedCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log(`Destination: ${destDir}`);
}

convertFlags();
