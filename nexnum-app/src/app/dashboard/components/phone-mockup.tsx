import { motion } from "framer-motion"

export function PhoneMockup() {
    return (
        <div className="relative w-[280px] h-[580px] perspective-[2000px] transform-gpu">
            <motion.div
                initial={{ rotateY: -12, rotateX: 5 }}
                animate={{
                    rotateY: [-12, -8, -12],
                    rotateX: [5, 2, 5],
                    y: [0, -10, 0]
                }}
                transition={{
                    duration: 6,
                    repeat: Infinity,
                    ease: "easeInOut"
                }}
                className="w-full h-full relative preserve-3d"
                style={{ transformStyle: "preserve-3d" }}
            >
                {/* Phone Frame */}
                <div className="absolute inset-0 bg-[#121212] rounded-[45px] border-[8px] border-[#2a2a2a] shadow-2xl overflow-hidden backface-hidden">
                    {/* Screen Content - Gradient & UI */}
                    <div className="absolute inset-0 bg-gradient-to-br from-[#0f172a] to-[#020617] overflow-hidden">
                        {/* Status Bar */}
                        <div className="h-6 w-full flex justify-between px-6 py-4 items-center opacity-60">
                            <div className="text-[10px] font-bold text-white">9:41</div>
                            <div className="flex gap-1.5">
                                <div className="h-2.5 w-4 rounded-[2px] bg-white/40" />
                                <div className="h-2.5 w-4 rounded-[2px] bg-white/40" />
                            </div>
                        </div>

                        {/* Lock Screen UI Mock */}
                        <div className="flex flex-col items-center justify-center pt-20">
                            <div className="text-5xl font-thin text-white tracking-tighter mb-2">09:41</div>
                            <div className="text-xs text-white/50 uppercase tracking-[0.2em] mb-12">Thursday, Nov 27</div>

                            {/* Notification Card */}
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 1 }}
                                className="w-[85%] bg-white/10 backdrop-blur-md border border-white/10 p-3 rounded-2xl mb-3"
                            >
                                <div className="flex gap-3">
                                    <div className="h-8 w-8 rounded-lg bg-emerald-500/20 flex items-center justify-center border border-emerald-500/20">
                                        <div className="text-[10px]">💬</div>
                                    </div>
                                    <div>
                                        <div className="text-[10px] text-white/60 mb-0.5">MESSAGES</div>
                                        <div className="text-xs font-medium text-white">Verification Code: 839201</div>
                                    </div>
                                </div>
                            </motion.div>
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 1.2 }}
                                className="w-[85%] bg-white/10 backdrop-blur-md border border-white/10 p-3 rounded-2xl"
                            >
                                <div className="flex gap-3">
                                    <div className="h-8 w-8 rounded-lg bg-indigo-500/20 flex items-center justify-center border border-indigo-500/20">
                                        <div className="text-[10px]">💳</div>
                                    </div>
                                    <div>
                                        <div className="text-[10px] text-white/60 mb-0.5">WALLET</div>
                                        <div className="text-xs font-medium text-white">Balance Updated: $24.50</div>
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                    </div>

                    {/* Reflection */}
                    <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/[0.05] to-transparent pointer-events-none" />
                </div>

                {/* Side Buttons */}
                <div className="absolute top-[120px] -left-[9px] w-[4px] h-[32px] bg-[#333] rounded-l-md transform -translate-z-1" />
                <div className="absolute top-[170px] -left-[9px] w-[4px] h-[64px] bg-[#333] rounded-l-md transform -translate-z-1" />
                <div className="absolute top-[150px] -right-[9px] w-[4px] h-[48px] bg-[#333] rounded-r-md transform -translate-z-1" />
            </motion.div>
        </div>
    )
}
