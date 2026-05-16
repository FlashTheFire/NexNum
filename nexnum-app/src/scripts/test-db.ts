import { prisma } from '../lib/core/db'

async function main() {
  try {
    const userCount = await prisma.user.count()
    console.log(`Connection successful! User count: ${userCount}`)
  } catch (error: any) {
    console.error('Connection failed:', error.message)
    if (error.meta) console.error('Meta:', error.meta)
  } finally {
    // Note: shutdown logic in db.ts might close the pool automatically on exit
    process.exit(0)
  }
}

main()
