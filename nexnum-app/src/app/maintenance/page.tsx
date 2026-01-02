import { Wrench } from 'lucide-react'

export default function MaintenancePage() {
    return (
        <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
            {/* Background effects */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-violet-600/10 rounded-full blur-[120px]" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-600/10 rounded-full blur-[120px]" />
            </div>

            <div className="relative z-10 text-center max-w-lg mx-auto">
                <div className="w-20 h-20 bg-gray-900/50 border border-gray-800 rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-2xl backdrop-blur-sm">
                    <Wrench className="w-10 h-10 text-violet-500 animate-pulse" />
                </div>

                <h1 className="text-4xl md:text-5xl font-bold text-white mb-6">
                    Under Maintenance
                </h1>

                <p className="text-xl text-gray-400 mb-8 leading-relaxed">
                    We are currently updating our systems to give you a better experience.
                    We'll be back online shortly.
                </p>

                <div className="p-4 bg-gray-900/50 border border-gray-800/50 rounded-xl backdrop-blur-sm">
                    <p className="text-sm text-gray-500 font-mono">
                        System update in progress...
                    </p>
                </div>

                <p className="text-sm text-gray-600 mt-12">
                    NexNum Team
                </p>
            </div>
        </div>
    )
}
