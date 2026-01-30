
import fs from 'fs';
import path from 'path';
import https from 'https';
import { generateCanonicalCode, getCanonicalName } from '@/lib/normalizers/service-identity';
import { prisma } from '@/lib/core/db';
import { getMetadataProvider } from './provider-factory';
import { logger } from '@/lib/core/logger';
import { Semaphore } from '@/lib/utils/async-utils';

const ICONS_DIR = path.resolve(process.cwd(), 'public/assets/icons/services');

export interface IconSyncResult {
    downloaded: number;
    upgraded: number;
    skipped: number;
    errors: number;
}

/**
 * Advanced Provider Icon Manager
 * 
 * Handles universal, fully dynamic icon synchronization from multiple providers
 * with quality control (size-based upgrades) and database-driven configuration.
 */
export class ProviderIconManager {

    constructor() {
        if (!fs.existsSync(ICONS_DIR)) {
            fs.mkdirSync(ICONS_DIR, { recursive: true });
        }
    }

    private async getRemoteFileSize(url: string): Promise<number> {
        return new Promise((resolve) => {
            try {
                const req = https.request(url, { method: 'HEAD', timeout: 5000, headers: { 'User-Agent': 'NexNum-Bot/1.0' } }, (res) => {
                    if (res.statusCode === 200) {
                        resolve(parseInt(res.headers['content-length'] || '0', 10));
                    } else {
                        resolve(0);
                    }
                });
                req.on('error', () => resolve(0));
                req.on('timeout', () => { req.destroy(); resolve(0); });
                req.end();
            } catch (e) {
                resolve(0);
            }
        });
    }

    private async downloadFile(url: string, dest: string): Promise<boolean> {
        return new Promise((resolve) => {
            try {
                const file = fs.createWriteStream(dest);
                https.get(url, { timeout: 10000, headers: { 'User-Agent': 'NexNum-Bot/1.0' } }, (res) => {
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
                }).on('error', () => {
                    file.close();
                    if (fs.existsSync(dest)) fs.unlinkSync(dest);
                    resolve(false);
                });
            } catch (e) {
                resolve(false);
            }
        });
    }

    /**
     * Run search/sync across all providers
     */
    async syncAllProviders(): Promise<IconSyncResult> {
        const result: IconSyncResult = { downloaded: 0, upgraded: 0, skipped: 0, errors: 0 };
        const semaphore = new Semaphore(5); // Process 5 icons concurrently

        logger.info('[IconManager] Starting universal provider sync...');

        const activeProviders = await prisma.provider.findMany({ where: { isActive: true } });

        for (const provider of activeProviders) {
            try {
                const engine = getMetadataProvider(provider);
                const services = await engine.getServicesList('us');

                const syncPromises = services.map(async (s) => {
                    if (!s.iconUrl) return;

                    await semaphore.acquire();
                    try {
                        const canonicalName = getCanonicalName(s.name);
                        const slug = generateCanonicalCode(canonicalName);
                        // Standardize on .webp for local storage
                        const dest = path.join(ICONS_DIR, `${slug}.webp`);

                        const remoteSize = await this.getRemoteFileSize(s.iconUrl);
                        if (remoteSize === 0) return;

                        let shouldDownload = false;
                        if (fs.existsSync(dest)) {
                            const localSize = fs.statSync(dest).size;
                            // Only upgrade if remote is significantly larger (>100 bytes diff)
                            if (remoteSize > (localSize + 100)) {
                                shouldDownload = true;
                                result.upgraded++;
                            } else {
                                result.skipped++;
                            }
                        } else {
                            shouldDownload = true;
                            result.downloaded++;
                        }

                        if (shouldDownload) {
                            const success = await this.downloadFile(s.iconUrl, dest);
                            if (!success) result.errors++;
                        }
                    } finally {
                        semaphore.release();
                    }
                });

                await Promise.all(syncPromises);
            } catch (e) {
                logger.error(`[IconManager] Provider ${provider.name} failed:`, e);
                result.errors++;
            }
        }

        return result;
    }
}
