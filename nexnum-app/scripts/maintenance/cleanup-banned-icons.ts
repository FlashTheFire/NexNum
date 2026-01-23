
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const ICONS_DIR = path.join(process.cwd(), 'public/icons/services');
const BANNED_HASH = 'be311539f1b49d644e5a70c1f0023c05a7eebabd282287305e8ca49587087702';

async function cleanupBannedIcons() {
    console.log('🔍 Scanning for banned icons...');

    if (!fs.existsSync(ICONS_DIR)) {
        console.log('❌ Icons directory not found.');
        return;
    }

    const files = fs.readdirSync(ICONS_DIR);
    let deletedCount = 0;

    for (const file of files) {
        const filePath = path.join(ICONS_DIR, file);
        const stats = fs.statSync(filePath);

        if (stats.isFile()) {
            // Optimization: Only check files with the known bad size (7144 bytes) to speed up
            // But checking hash is safer. Let's check size first as a quick filter.
            if (stats.size === 7144) {
                const buffer = fs.readFileSync(filePath);
                const hash = crypto.createHash('sha256').update(buffer).digest('hex');

                if (hash === BANNED_HASH) {
                    console.log(`🗑️ Deleting banned icon: ${file}`);
                    fs.unlinkSync(filePath);
                    deletedCount++;
                }
            }
        }
    }

    console.log(`✅ Cleanup complete. Deleted ${deletedCount} banned icons.`);
}

cleanupBannedIcons();
