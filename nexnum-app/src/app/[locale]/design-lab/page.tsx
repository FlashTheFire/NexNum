import {
    Orbitron,
    Michroma,
    Audiowide,
    Syncopate,
    Bruno_Ace,
    Quantico,
    Zen_Dots,
    Rajdhani
} from 'next/font/google'

const orbitron = Orbitron({ subsets: ['latin'] })
const michroma = Michroma({ weight: '400', subsets: ['latin'] })
const audiowide = Audiowide({ weight: '400', subsets: ['latin'] })
const syncopate = Syncopate({ weight: '700', subsets: ['latin'] })
const bruno = Bruno_Ace({ weight: '400', subsets: ['latin'] })
const quantico = Quantico({ weight: '700', subsets: ['latin'] })
const zenDots = Zen_Dots({ weight: '400', subsets: ['latin'] })
const rajdhani = Rajdhani({ weight: '700', subsets: ['latin'] })

export default function DesignLab() {
    const variations = [
        { name: 'Core Futuristic (Orbitron)', font: orbitron, label: 'NEXNUM', desc: 'The classic sci-fi choice. Reliable, wide.' },
        { name: 'High-Tech Squad (Michroma)', font: michroma, label: 'NEXNUM', desc: 'Square, solid, military-grade precision.' },
        { name: 'Cyber Techno (Audiowide)', font: audiowide, label: 'NexNum', desc: 'Soft curves, fluid, digital flow.' },
        { name: 'Hyper Wide (Syncopate)', font: syncopate, label: 'NEXNUM', desc: 'Extremely wide stance. Maximum impact.' },
        { name: 'Geometric Ace (Bruno Ace)', font: bruno, label: 'NexNum', desc: 'Sharp angles, clean lines, modern machinery.' },
        { name: 'Tactical HUD (Quantico)', font: quantico, label: 'NEXNUM', desc: 'Inspired by military HUDs/Terminals.' },
        { name: 'Digital Dot (Zen Dots)', font: zenDots, label: 'NexNum', desc: 'Retro-future, heavy digital aesthetic.' },
        { name: 'Mecha Interface (Rajdhani)', font: rajdhani, label: 'NEXNUM', desc: 'Squared mechanics, dense, info-heavy.' },
    ]

    return (
        <div className="min-h-screen bg-[#050505] text-white p-20 font-sans selection:bg-[#C6FF00] selection:text-black">
            <div className="max-w-5xl mx-auto">
                <h1 className="text-5xl font-bold mb-4 text-transparent bg-clip-text bg-gradient-to-r from-[#C6FF00] to-cyan-400">
                    FUTURISTIC LAB
                </h1>
                <p className="text-gray-400 mb-12 text-lg border-l-2 border-[#C6FF00] pl-4">
                    Selecting the ultimate <strong>"Mili Attraction"</strong> signature. <br />
                    Which distinct sci-fi flavor defines NexNum?
                </p>

                <div className="grid gap-6">
                    {variations.map((v) => (
                        <div key={v.name} className="relative group overflow-hidden border border-[#222] bg-[#0A0A0A] p-10 rounded-xl transition-all hover:border-[#C6FF00] hover:shadow-[0_0_40px_-10px_rgba(198,255,0,0.3)]">
                            <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                <span className="text-[#C6FF00] text-xs font-mono tracking-widest">[READY]</span>
                            </div>

                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                                <div>
                                    <h3 className="text-xs text-gray-500 uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-gray-700 group-hover:bg-[#C6FF00]"></span>
                                        {v.name}
                                    </h3>
                                    <div className={`${v.font.className} text-6xl md:text-7xl text-white group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white group-hover:to-gray-400 transition-all`}>
                                        {v.label}
                                    </div>
                                    <p className="mt-4 text-sm text-gray-600 font-mono group-hover:text-[#C6FF00]">{v.desc}</p>
                                </div>

                                <div className="opacity-0 group-hover:opacity-100 transform translate-x-10 group-hover:translate-x-0 transition-all duration-300">
                                    <button className="px-8 py-4 bg-[#C6FF00] text-black font-bold uppercase tracking-wider text-sm hover:bg-white transition-colors skew-x-[-10deg]">
                                        DEPLOY
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
