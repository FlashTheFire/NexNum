
import fs from 'fs'
import path from 'path'
import * as dotenv from 'dotenv'
dotenv.config()

const ICONS_DIR = path.join(process.cwd(), 'public/icons/services')

async function pruneCorruptIcons() {
    console.log('🧹 Starting Icon Pruning...')

    if (!fs.existsSync(ICONS_DIR)) {
        console.log('❌ Icons directory not found:', ICONS_DIR)
        return
    }

    const files = fs.readdirSync(ICONS_DIR)
    let deletedCount = 0
    let keptCount = 0

    for (const file of files) {
        if (!file.endsWith('.webp')) continue

        const filePath = path.join(ICONS_DIR, file)
        try {
            // Read first 100 bytes to check header
            const buffer = Buffer.alloc(100)
            const fd = fs.openSync(filePath, 'r')
            fs.readSync(fd, buffer, 0, 100, 0)
            fs.closeSync(fd)

            const header = buffer.toString('utf8')
            const isSvg = header.includes('<svg') || header.includes('<?xml')
            const isHtml = header.includes('<!DOCTYPE html') || header.includes('<html')
            const isRiff = buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP'

            if (!isRiff && (isSvg || isHtml)) {
                console.log(`🗑️  Deleting corrupt file: ${file} (Detected: ${isSvg ? 'SVG' : 'HTML'})`)
                fs.unlinkSync(filePath)
                deletedCount++
            } else {
                keptCount++
            }
        } catch (e) {
            console.error(`⚠️ Error processing ${file}:`, e)
        }
    }

    console.log(`\n✨ Prune Complete.`)
    console.log(`   Deleted: ${deletedCount}`)
    console.log(`   Kept:    ${keptCount}`)
}

pruneCorruptIcons()
