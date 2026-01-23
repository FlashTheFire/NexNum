
import fs from 'fs'
import path from 'path'
import https from 'https'

const FLAGS_URL = 'https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/'
// Common list of country codes to support (ISO 3166-1 alpha-2)
// We can expand this list or dynamically fetch from a source if needed.
// For now, we'll try to download all known keys from our country DB if possible, 
// or just iterate a known large list of codes.
const COUNTRY_CODES = [
    'ac', 'ad', 'ae', 'af', 'ag', 'ai', 'al', 'am', 'ao', 'aq', 'ar', 'as', 'at', 'au', 'aw', 'ax', 'az',
    'ba', 'bb', 'bd', 'be', 'bf', 'bg', 'bh', 'bi', 'bj', 'bl', 'bm', 'bn', 'bo', 'bq', 'br', 'bs', 'bt', 'bv', 'bw', 'by', 'bz',
    'ca', 'cc', 'cd', 'cf', 'cg', 'ch', 'ci', 'ck', 'cl', 'cm', 'cn', 'co', 'cp', 'cr', 'cu', 'cv', 'cw', 'cx', 'cy', 'cz',
    'de', 'dg', 'dj', 'dk', 'dm', 'do', 'dz',
    'ea', 'ec', 'ee', 'eg', 'eh', 'er', 'es', 'et', 'eu',
    'fi', 'fj', 'fk', 'fm', 'fo', 'fr',
    'ga', 'gb', 'gd', 'ge', 'gf', 'gg', 'gh', 'gi', 'gl', 'gm', 'gn', 'gp', 'gq', 'gr', 'gs', 'gt', 'gu', 'gw', 'gy',
    'hk', 'hm', 'hn', 'hr', 'ht', 'hu',
    'ic', 'id', 'ie', 'il', 'im', 'in', 'io', 'iq', 'ir', 'is', 'it',
    'je', 'jm', 'jo', 'jp',
    'ke', 'kg', 'kh', 'ki', 'km', 'kn', 'kp', 'kr', 'kw', 'ky', 'kz',
    'la', 'lb', 'lc', 'li', 'lk', 'lr', 'ls', 'lt', 'lu', 'lv', 'ly',
    'ma', 'mc', 'md', 'me', 'mf', 'mg', 'mh', 'mk', 'ml', 'mm', 'mn', 'mo', 'mp', 'mq', 'mr', 'ms', 'mt', 'mu', 'mv', 'mw', 'mx', 'my', 'mz',
    'na', 'nc', 'ne', 'nf', 'ng', 'ni', 'nl', 'no', 'np', 'nr', 'nu', 'nz',
    'om',
    'pa', 'pe', 'pf', 'pg', 'ph', 'pk', 'pl', 'pm', 'pn', 'pr', 'ps', 'pt', 'pw', 'py',
    'qa',
    're', 'ro', 'rs', 'ru', 'rw',
    'sa', 'sb', 'sc', 'sd', 'se', 'sg', 'sh', 'si', 'sj', 'sk', 'sl', 'sm', 'sn', 'so', 'sr', 'ss', 'st', 'sv', 'sx', 'sy', 'sz',
    'ta', 'tc', 'td', 'tf', 'tg', 'th', 'tj', 'tk', 'tl', 'tm', 'tn', 'to', 'tr', 'tt', 'tv', 'tw', 'tz',
    'ua', 'ug', 'um', 'un', 'us', 'uy', 'uz',
    'va', 'vc', 've', 'vg', 'vi', 'vn', 'vu',
    'wf', 'ws', 'xk', 'xx',
    'ye', 'yt',
    'za', 'zm', 'zw'
]

const OUTPUT_DIR = path.resolve(process.cwd(), 'public/flags')

if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true })
}

console.log(`🌍 Downloading ${COUNTRY_CODES.length} flags...`)

async function downloadFlag(code: string) {
    const url = `${FLAGS_URL}${code}.svg`
    const dest = path.join(OUTPUT_DIR, `${code}.svg`)

    return new Promise<void>((resolve) => {
        // Skip if exists
        if (fs.existsSync(dest)) {
            // console.log(`⏩ Skipped ${code}`)
            resolve()
            return
        }

        https.get(url, (res) => {
            if (res.statusCode === 200) {
                const file = fs.createWriteStream(dest)
                res.pipe(file)
                file.on('finish', () => {
                    file.close()
                    // console.log(`✅ Downloaded ${code}`)
                    resolve()
                })
            } else {
                console.warn(`⚠️  Failed to download ${code}: ${res.statusCode}`)
                res.resume() // Consume data to free memory
                resolve()
            }
        }).on('error', (err) => {
            console.error(`❌ Error downloading ${code}:`, err.message)
            resolve()
        })
    })
}

async function main() {
    // Process in batches to avoid network congestion
    const BATCH_SIZE = 10
    for (let i = 0; i < COUNTRY_CODES.length; i += BATCH_SIZE) {
        const batch = COUNTRY_CODES.slice(i, i + BATCH_SIZE)
        await Promise.all(batch.map(downloadFlag))
        process.stdout.write('.') // Progress indicator
    }
    console.log('\n✨ Download complete!')
}

main().catch(console.error)
