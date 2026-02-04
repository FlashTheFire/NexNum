import { reconfigureIndexes } from '../lib/search/search'
import { logger } from '../lib/core/logger'

async function main() {
    try {
        logger.info('Starting MeiliSearch initialization script...')
        await reconfigureIndexes()
        logger.info('MeiliSearch initialization complete.')
        process.exit(0)
    } catch (error: any) {
        logger.error('MeiliSearch initialization failed', { error: error.message })
        process.exit(1)
    }
}

main()
