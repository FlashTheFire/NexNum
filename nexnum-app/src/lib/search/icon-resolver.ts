import { prisma } from '@/lib/core/db';
import { getCanonicalName, generateCanonicalCode } from '@/lib/normalizers/service-identity';
import fs from 'fs';
import path from 'path';

let localWebpIcons: Map<string, string> | null = null;
let localSvgIcons: Map<string, string> | null = null;

export function dicebearUrl(seed: string) {
    return `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(seed)}&backgroundColor=0ea5e9,6366f1,8b5cf6,ec4899`;
}

function getLocalIconMaps(): { webp: Map<string, string>; svg: Map<string, string> } {
    if (localWebpIcons && localSvgIcons) return { webp: localWebpIcons, svg: localSvgIcons };

    const webpMap = new Map<string, string>();
    const svgMap = new Map<string, string>();
    const iconsDir = path.join(process.cwd(), 'public', 'assets', 'icons', 'services');

    try {
        if (fs.existsSync(iconsDir)) {
            const files = fs.readdirSync(iconsDir);
            for (const file of files) {
                const ext = path.extname(file).toLowerCase();
                const basename = path.basename(file, ext).toLowerCase();
                if (ext === '.webp') webpMap.set(basename, `/assets/icons/services/${file}`);
                else if (ext === '.svg') svgMap.set(basename, `/assets/icons/services/${file}`);
            }
        }
    } catch { /* fail open */ }

    localWebpIcons = webpMap;
    localSvgIcons = svgMap;
    return { webp: webpMap, svg: svgMap };
}

/**
 * Batched icon resolver for service names.
 * Returns a Map keyed by original service name for O(1) lookup.
 */
export async function resolveServiceIconUrls(serviceNames: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (serviceNames.length === 0) return map;

    const codeToName = new Map<string, string>();
    for (const name of serviceNames) {
        if (!name) continue;
        const canonical = getCanonicalName(name);
        const code = generateCanonicalCode(canonical);
        codeToName.set(code, name);
    }

    const { webp, svg } = getLocalIconMaps();
    const resolvedCodes = new Set<string>();
    for (const [code, originalName] of codeToName) {
        if (webp.has(code)) { map.set(originalName, webp.get(code)!); resolvedCodes.add(code); }
        else if (svg.has(code)) { map.set(originalName, svg.get(code)!); resolvedCodes.add(code); }
    }

    const missingCodes = [...codeToName.keys()].filter(c => !resolvedCodes.has(c));
    if (missingCodes.length > 0) {
        try {
            const lookups = await prisma.serviceLookup.findMany({
                where: { serviceCode: { in: missingCodes } },
                select: { serviceCode: true, serviceIcon: true }
            });
            for (const row of lookups) {
                const originalName = codeToName.get(row.serviceCode);
                if (originalName && row.serviceIcon) map.set(originalName, row.serviceIcon);
            }
        } catch { /* fail open */ }
    }

    return map;
}
