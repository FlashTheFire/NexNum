import useSWR from 'swr'
import { SMSMessage } from '@/lib/providers/sms-service'
import { useGlobalStore } from '@/store'
import { useEffect } from 'react'

const fetcher = (url: string) => fetch(url).then(r => r.json())

interface UseSMSResult {
    messages: SMSMessage[]
    status?: string
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
    const { updateNumber } = useGlobalStore()
    const { data, error, mutate, isValidating } = useSWR<{ success: boolean; messages: BackendSMS[]; status?: string }>(
        numberId ? `/api/sms/${encodeURIComponent(numberId)}` : null,
        fetcher,
        {
            refreshInterval: (latestData) => {
                if (latestData?.status && ['completed', 'timeout', 'cancelled'].includes(latestData.status)) {
                    return 0
                }
                return 3000
            },
            revalidateOnFocus: true,
            dedupingInterval: 2000,
        }
    )

    // Map backend response (sender/content) to UI expectations (from/text)
    // Also include the extracted code and create professional fallback messages
    const messages: SMSMessage[] = data?.messages?.map(m => {
        // Clean the code - remove any leading colon
        const cleanCode = m.code?.replace(/^:/, '').trim() || null

        // Build professional message text
        let displayText = m.content || ''
        if (!displayText && cleanCode) {
            // Professional fallback when no content but code exists
            displayText = `Your verification code is: ${cleanCode}`
        } else if (!displayText && !cleanCode) {
            displayText = 'Message received'
        }

        return {
            id: m.id,
            numberId,
            from: m.sender || 'Verification Service',
            text: displayText,
            code: cleanCode, // Pass the extracted code directly
            receivedAt: m.receivedAt,
            isRead: false
        }
    }).sort((a, b) =>
        new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
    ) || []

    // Sync with global store on poll update
    useEffect(() => {
        if (data && numberId) {
            updateNumber(numberId, {
                status: data.status as any,
                smsCount: data.messages?.length || 0,
                latestSms: data.messages && data.messages.length > 0 ? {
                    content: data.messages[0].content,
                    code: data.messages[0].code,
                    receivedAt: data.messages[0].receivedAt
                } : undefined
            })
        }
    }, [data, numberId, updateNumber])

    const refresh = async () => {
        await fetch(`/api/sms/${encodeURIComponent(numberId)}`, {
            method: 'POST',
            body: JSON.stringify({ force: false })
        })
        await mutate()
    }

    return {
        messages,
        status: data?.status,
        isLoading: !error && !data,
        isError: error,
        refresh,
        isValidating
    }
}
