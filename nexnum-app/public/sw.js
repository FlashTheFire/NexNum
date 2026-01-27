
/**
 * Service Worker for NexNum Background Notifications
 * Handles 'push' events from the server and displays them.
 */

self.addEventListener('push', function (event) {
    if (!event.data) {
        return
    }

    try {
        const payload = event.data.json()
        const { title, body, icon, data } = payload

        const options = {
            body: body || 'New notification',
            icon: icon || '/assets/brand/nexnum-logo.svg',
            badge: '/assets/brand/nexnum-logo.svg',
            vibrate: [100, 50, 100],
            data: {
                dateOfArrival: Date.now(),
                url: data?.url || '/dashboard'
            },
            actions: [
                {
                    action: 'open',
                    title: 'View'
                }
            ]
        }

        event.waitUntil(
            self.registration.showNotification(title || 'NexNum', options)
        )
    } catch (err) {
        console.error('[SW] Error handling push event', err)
    }
})

self.addEventListener('notificationclick', function (event) {
    event.notification.close()

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
            // Check if there's already a tab open
            for (let i = 0; i < clientList.length; i++) {
                const client = clientList[i]
                if (client.url.includes('/dashboard') && 'focus' in client) {
                    return client.focus()
                }
            }
            // Otherwise open a new tab
            if (clients.openWindow) {
                return clients.openWindow(event.notification.data.url || '/dashboard')
            }
        })
    )
})
