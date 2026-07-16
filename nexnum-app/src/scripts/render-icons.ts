import { chromium } from '@playwright/test';
import * as path from 'path';

async function main() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 512, height: 512 }
    });
    const page = await context.newPage();
    
    // Convert path to standard file:/// URL for Windows
    const svgPath = path.resolve('src/app/icon.svg');
    const fileUrl = `file:///${svgPath.replace(/\\/g, '/')}`;
    
    console.log(`Navigating to: ${fileUrl}`);
    await page.goto(fileUrl);
    
    // Save 512x512 master png
    await page.screenshot({ path: 'src/app/icon-master.png', omitBackground: false });
    console.log('Saved src/app/icon-master.png');
    
    // Set viewport to 180x180 for apple-icon.png
    await page.setViewportSize({ width: 180, height: 180 });
    await page.screenshot({ path: 'src/app/apple-icon.png', omitBackground: false });
    console.log('Saved src/app/apple-icon.png');
    
    await browser.close();
    console.log('Finished rendering SVG using Playwright.');
}

main().catch((err) => {
    console.error('Error during SVG rendering:', err);
    process.exit(1);
});
