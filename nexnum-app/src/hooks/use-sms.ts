
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

export function useSMS(numberId: string): UseSMSResult {
    // Poll every 3 seconds for new messages
    // Key is null if no numberId, preventing fetch
    const { data, error, mutate, isValidating } = useSWR<{ success: boolean; data: SMSMessage[] }>(
        numberId ? `/api/sms/${encodeURIComponent(numberId)}` : null,
        fetcher,
        {
            refreshInterval: 3000,
            revalidateOnFocus: true,
            dedupingInterval: 2000,
        }
    )

    // Sort messages locally if backend doesn't (descending time)
    // SWR might return undefined initially
    const messages = data?.data?.sort((a, b) =>
        new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
    ) || []

    const refresh = async () => {
        // Optimistic UI or just trigger re-fetch with a POST to force simulation check
        await fetch(`/api/sms/${encodeURIComponent(numberId)}`, {
            method: 'POST',
            body: JSON.stringify({ force: false }) // Let server decide probability
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
