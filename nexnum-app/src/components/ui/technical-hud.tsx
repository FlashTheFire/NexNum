"use client"

export function TechnicalHUD() {
    return (
        <div className="absolute inset-0 flex items-center justify-center overflow-hidden pointer-events-none select-none bg-black">
            <video
                autoPlay
                loop
                muted
                playsInline
                className="absolute inset-0 w-full h-full object-cover opacity-60"
            >
                <source src="/backgrounds/hud-background.mp4" type="video/mp4" />
            </video>

            {/* Overlay to ensure text readability if needed, though video opacity handles most of it */}
            <div className="absolute inset-0 bg-black/20" />
        </div>
    )
}
