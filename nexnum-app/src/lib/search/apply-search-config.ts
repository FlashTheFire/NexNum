
import 'dotenv/config'
import { reconfigureIndexes } from './search'
import { meili } from './search'

async function apply() {
    console.log('🚀 Applying Deep Search Configuration...')
    try {
        await reconfigureIndexes()

        // Optimize Index
        console.log('🧹 Optimizing index (removing deleted documents)...')
        // (Optional: trigger garbage collection if needed, but updateSettings usually handles it)

        console.log('✅ Configuration Applied Successfully!')
    } catch (e) {
        console.error('❌ Failed:', e)
    }
}

apply()
