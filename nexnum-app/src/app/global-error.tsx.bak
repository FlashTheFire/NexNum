'use client'

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    return (
        <html>
            <body style={{ backgroundColor: 'black', color: 'white', fontFamily: 'sans-serif', margin: 0, padding: '2rem', textAlign: 'center' }}>
                <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>Critical System Error</h1>
                <p style={{ color: '#888', marginBottom: '2rem' }}>
                    The application encountered a fatal exception during the production build or runtime.
                </p>
                <div style={{ backgroundColor: '#111', padding: '1rem', borderRadius: '0.5rem', marginBottom: '2rem', textAlign: 'left', overflow: 'auto' }}>
                    <code>{error.message || 'Unknown Error'}</code>
                    {error.digest && <p style={{ fontSize: '0.8rem', color: '#555' }}>Digest: {error.digest}</p>}
                </div>
                <button
                    onClick={() => reset()}
                    style={{
                        padding: '10px 20px',
                        backgroundColor: '#ccff00',
                        color: 'black',
                        border: 'none',
                        borderRadius: '8px',
                        fontWeight: 'bold',
                        cursor: 'pointer'
                    }}
                >
                    Retry Initialization
                </button>
            </body>
        </html>
    )
}
