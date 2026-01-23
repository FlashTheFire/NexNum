
import fs from 'fs';
import path from 'path';
import https from 'https';
import { getSlugFromName, resolveToCanonicalName } from '../src/lib/normalizers/service-identity';
import metadata from '../src/data/metadata.json';

const ICONS_DIR = path.resolve(process.cwd(), 'public/icons/services');

// Ensure directory exists
if (!fs.existsSync(ICONS_DIR)) {
    fs.mkdirSync(ICONS_DIR, { recursive: true });
}

interface ServiceSource {
    name: string;
    iconUrl: string;
    provider: string;
}

// Custom fetch for Node environment (if fetch is not globally available in older Node, we'd need a polyfill, but Next.js env usually has it. We'll use https as fallback if needed, but modern Node has fetch)
// We'll stick to native fetch.

async function getSources(): Promise<ServiceSource[]> {
    const sources: ServiceSource[] = [];

    // 1. Metadata Overrides (High Priority)
    for (const [key, value] of Object.entries(metadata.serviceOverrides)) {
        const config = value as { displayName: string; iconUrl?: string };
        if (config.iconUrl) {
            sources.push({
                name: config.displayName,
                iconUrl: config.iconUrl,
                provider: 'metadata'
            });
        }
    }

    // 2. Fetch from GrizzlySMS (Official Public API)
    // We use the "name" field from their API to ensure we aren't relying on their internal IDs for our file mapping.
    try {
        console.log('   Fetching GrizzlySMS services...');
        const res = await fetch('https://grizzlysms.com/api/service?per-page=10000', {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
        });

        if (res.ok) {
            const data = await res.json() as any[];
            if (Array.isArray(data)) {
                for (const s of data) {
                    if (s.icon) {
                        // CRITICAL: Use the NAME for normalization, not the slug/id!
                        const serviceName = s.name || s.slug || 'Unknown Service';
                        sources.push({
                            name: serviceName,
                            iconUrl: `https://grizzlysms.com/api/storage/image/${s.icon}.webp`,
                            provider: 'grizzlysms'
                        });
                    }
                }
                console.log(`   Found ${data.length} services from GrizzlySMS.`);
            }
        } else {
            console.warn(`   GrizzlySMS API returned ${res.status}`);
        }
    } catch (e) {
        console.warn('   Failed to fetch Grizzly services', e);
    }

    return sources;
}

function getRemoteFileSize(url: string): Promise<number> {
    return new Promise((resolve) => {
        const req = https.request(url, { method: 'HEAD', headers: { 'User-Agent': 'Node-Script' } }, (res) => {
            if (res.statusCode === 200) {
                const size = parseInt(res.headers['content-length'] || '0', 10);
                resolve(size);
            } else {
                resolve(0);
            }
        });
        req.on('error', () => resolve(0));
        req.end();
    });
}

function downloadFile(url: string, dest: string): Promise<boolean> {
    return new Promise((resolve) => {
        const file = fs.createWriteStream(dest);
        https.get(url, { headers: { 'User-Agent': 'Node-Script' } }, (res) => {
            if (res.statusCode === 200) {
                res.pipe(file);
                file.on('finish', () => {
                    file.close();
                    resolve(true);
                });
            } else {
                file.close();
                if (fs.existsSync(dest)) fs.unlinkSync(dest);
                resolve(false);
            }
        }).on('error', (err) => {
            file.close();
            if (fs.existsSync(dest)) fs.unlinkSync(dest);
            resolve(false);
        });
    });
}

async function syncIcons() {
    console.log('🚀 Starting Smart Service Icon Sync (Multi-Provider)...');
    const sources = await getSources();
    console.log(`Found ${sources.length} potential icon sources.`);

    let downloadCount = 0;
    let skipCount = 0;
    let upgradeCount = 0;
    let errorCount = 0;

    for (const source of sources) {
        if (!source.iconUrl) continue;

        // 1. Normalize Identity (Using SERVICE NAME)
        // This converts "Instagram + Threads" -> "Instagram + Threads" (Canonical)
        // And "IG" -> "Instagram + Threads" (Canonical) if listed in aliases.
        const canonicalName = resolveToCanonicalName(source.name);

        // 2. Generate Safe Filename (Slug)
        // "Instagram + Threads" -> "instagram-threads.webp"
        const slug = getSlugFromName(canonicalName);

        // We assume .webp for now as most modern providers use it, or we could detect.
        const ext = '.webp';
        const destPath = path.join(ICONS_DIR, `${slug}${ext}`);

        // Log only if it's something interesting
        // process.stdout.write(`Processing ${source.name} -> ${slug}... `);

        try {
            const remoteSize = await getRemoteFileSize(source.iconUrl);
            if (remoteSize === 0) {
                // console.log('❌ Remote invalid/empty');
                errorCount++;
                continue;
            }

            let shouldDownload = false;
            let reason = '';

            if (fs.existsSync(destPath)) {
                const localStats = fs.statSync(destPath);
                // SMART UPGRADE RULE: Only replace if Remote is LARGER (Quality Proxy)
                // We add a small buffer (e.g. 100 bytes) to avoid thrashing similar sizes
                if (remoteSize > (localStats.size + 100)) {
                    shouldDownload = true;
                    reason = `Upgrade (${localStats.size}b -> ${remoteSize}b)`;
                    upgradeCount++;
                } else {
                    reason = `Skipped (Remote: ${remoteSize}b <= Local: ${localStats.size}b)`;
                    skipCount++;
                }
            } else {
                shouldDownload = true;
                reason = 'New Download';
                downloadCount++;
            }

            if (shouldDownload) {
                // console.log(`⬇️  ${reason}: ${source.name} -> ${slug}`);
                const success = await downloadFile(source.iconUrl, destPath);
                if (success) {
                    process.stdout.write('✓');
                } else {
                    process.stdout.write('x');
                    errorCount++;
                }
            } else {
                // console.log(`⏭️  ${reason}`);
                // process.stdout.write('.');
            }

        } catch (error) {
            console.log(`Error processing ${source.name}`);
            errorCount++;
        }
    }

    console.log('\n✨ Sync Complete Summary:');
    console.log(`   ⬇️  New: ${downloadCount}`);
    console.log(`   ⬆️  Upgraded: ${upgradeCount}`);
    console.log(`   ⏭️  Skipped: ${skipCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
}

syncIcons().catch(console.error);
