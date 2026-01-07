
import useSWR from 'swr'
import { SMSMessage } from '@/lib/sms-service'

const fetcher = (url: string) => fetch(url).then(r => r.json())

interface UseSMSResult {
    messages: SMSMessage[]
    isLoading: boolean
    isError: any
    refresh: () => Promise<void>
    isValidating: boolean
}

interface BackendSMS {
    id: string
    sender: string | null
    content: string | null
    code: string | null
    receivedAt: string
}

export function useSMS(numberId: string): UseSMSResult {
    const { data, error, mutate, isValidating } = useSWR<{ success: boolean; messages: BackendSMS[]; status?: string }>(
        numberId ? `/api/sms/${encodeURIComponent(numberId)}` : null,
        fetcher,
        {
            refreshInterval: 3000,
            revalidateOnFocus: true,
            dedupingInterval: 2000,
        }
    )

    // Map backend response (sender/content) to UI expectations (from/text)
    const messages: SMSMessage[] = data?.messages?.map(m => ({
        id: m.id,
        numberId,
        from: m.sender || 'Unknown',
        text: m.content || '',
        receivedAt: m.receivedAt,
        isRead: false
    })).sort((a, b) =>
        new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
    ) || []

    const refresh = async () => {
        await fetch(`/api/sms/${encodeURIComponent(numberId)}`, {
            method: 'POST',
            body: JSON.stringify({ force: false })
        })
        await mutate()
    }

    return {
        messages,
        isLoading: !error && !data,
        isError: error,
        refresh,
        isValidating
    }
}
