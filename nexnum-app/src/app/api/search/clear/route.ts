import { GET as debugSyncGET } from '@/app/api/admin/providers/debug-sync/route'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: Request) {
    const url = new URL(request.url)
    url.searchParams.set('provider', 'all')
    url.searchParams.set('clearOld', 'true')
    url.searchParams.set('format', 'html')
    
    const modifiedRequest = new Request(url.toString(), {
        method: request.method,
        headers: request.headers
    })

    return debugSyncGET(modifiedRequest)
}
