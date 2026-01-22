import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Smartphone, Check, Copy, AlertTriangle, Loader2, Lock } from 'lucide-react'
import { toast } from 'sonner'
import Image from 'next/image'
import { useAuthStore } from '@/stores/authStore'

interface TwoFactorSetupProps {
    enabled: boolean
    onStatusChange: (enabled: boolean) => void
}

export function TwoFactorSetup({ enabled, onStatusChange }: TwoFactorSetupProps) {
    const { token } = useAuthStore()
    const [isOpen, setIsOpen] = useState(false)
    const [step, setStep] = useState<'intro' | 'qr' | 'verify' | 'backup' | 'disable'>('intro')
    const [isLoading, setIsLoading] = useState(false)

    // Setup Data
    const [qrCode, setQrCode] = useState<string>('')
    const [secret, setSecret] = useState<string>('')
    const [verifyCode, setVerifyCode] = useState('')
    const [backupCodes, setBackupCodes] = useState<string[]>([])

    // Disable Data
    const [disablePassword, setDisablePassword] = useState('')
    const [disableCode, setDisableCode] = useState('')

    const startSetup = async () => {
        setIsLoading(true)
        try {
            const res = await fetch('/api/auth/2fa/setup', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            })
            const data = await res.json()
            if (res.ok) {
                setQrCode(data.data.qrCode)
                setSecret(data.data.secret)
                setStep('qr')
            } else {
                toast.error(data.error || 'Failed to start setup')
                setIsOpen(false)
            }
        } catch (e) {
            toast.error('Network error')
        } finally {
            setIsLoading(false)
        }
    }

    const verifyAndEnable = async () => {
        setIsLoading(true)
        try {
            const res = await fetch('/api/auth/2fa/verify', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ token: verifyCode })
            })
            const data = await res.json()
            if (res.ok) {
                setBackupCodes(data.data.backupCodes)
                setStep('backup')
                onStatusChange(true)
                toast.success('2FA Enabled Successfully')
            } else {
                toast.error(data.error || 'Invalid code')
            }
        } catch (e) {
            toast.error('Network error')
        } finally {
            setIsLoading(false)
        }
    }

    const disableTwoFactor = async () => {
        setIsLoading(true)
        try {
            const res = await fetch('/api/auth/2fa/disable', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ password: disablePassword, token: disableCode })
            })
            if (res.ok) {
                onStatusChange(false)
                setIsOpen(false)
                toast.success('2FA Disabled')
            } else {
                const data = await res.json()
                toast.error(data.error || 'Failed to disable')
            }
        } catch (e) {
            toast.error('Network error')
        } finally {
            setIsLoading(false)
        }
    }

    const handleSwitch = (checked: boolean) => {
        if (checked) {
            setStep('intro')
            setIsOpen(true)
            startSetup()
        } else {
            setStep('disable')
            setIsOpen(true)
        }
    }

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text)
        toast.success('Copied to clipboard')
    }

    return (
        <div className="flex items-center justify-between p-6">
            <div className="space-y-1">
                <h3 className="font-semibold flex items-center gap-2">
                    <Smartphone className="h-4 w-4 text-emerald-400" />
                    Two-Factor Authentication
                </h3>
                <p className="text-sm text-muted-foreground">Add an extra layer of security to your account</p>
            </div>

            <Switch checked={enabled} onCheckedChange={handleSwitch} />

            <Dialog open={isOpen} onOpenChange={(open) => { if (!open && step === 'backup') { /* allow close only if done */ } else { setIsOpen(open) } }}>
                <DialogContent className="bg-zinc-900 border-white/10 text-white sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>
                            {step === 'disable' ? 'Disable 2FA' : 'Setup Two-Factor Authentication'}
                        </DialogTitle>
                        <DialogDescription className="text-gray-400">
                            {step === 'qr' && 'Scan the QR code with your authenticator app.'}
                            {step === 'backup' && 'Save these recovery codes in a safe place.'}
                            {step === 'disable' && 'Enter your password to confirm.'}
                        </DialogDescription>
                    </DialogHeader>

                    {/* STEPS */}
                    <div className="py-4">
                        {step === 'qr' && (
                            <div className="space-y-6">
                                <div className="flex justify-center p-4 bg-white rounded-xl w-fit mx-auto">
                                    {qrCode ? (
                                        <Image src={qrCode} alt="QR Code" width={180} height={180} />
                                    ) : (
                                        <div className="w-[180px] h-[180px] flex items-center justify-center"><Loader2 className="animate-spin text-black" /></div>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-xs text-gray-400 uppercase tracking-wider">Manual Entry Code</Label>
                                    <div className="flex items-center gap-2">
                                        <code className="flex-1 bg-black/40 p-3 rounded-lg border border-white/10 font-mono text-center tracking-[0.2em] text-emerald-400">
                                            {secret || 'Loading...'}
                                        </code>
                                        <Button size="icon" variant="outline" onClick={() => copyToClipboard(secret)} disabled={!secret}>
                                            <Copy className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label>Verification Code</Label>
                                    <Input
                                        placeholder="Enter 6-digit code"
                                        className="text-center text-lg tracking-widest bg-black/20 border-white/10"
                                        maxLength={6}
                                        value={verifyCode}
                                        onChange={(e) => setVerifyCode(e.target.value.replace(/[^0-9]/g, ''))}
                                    />
                                </div>
                            </div>
                        )}

                        {step === 'backup' && (
                            <div className="space-y-4">
                                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-3">
                                    <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                                    <div className="space-y-1">
                                        <p className="text-sm font-medium text-amber-500">Important</p>
                                        <p className="text-xs text-amber-500/80">
                                            If you lose your device, these codes are the only way to access your account.
                                        </p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    {backupCodes.map((code, i) => (
                                        <div key={i} className="bg-black/40 border border-white/5 rounded p-2 text-center font-mono text-xs text-gray-300">
                                            {code}
                                        </div>
                                    ))}
                                </div>

                                <Button variant="outline" className="w-full gap-2 border-white/10" onClick={() => copyToClipboard(backupCodes.join('\n'))}>
                                    <Copy className="h-4 w-4" /> Copy All Codes
                                </Button>
                            </div>
                        )}

                        {step === 'disable' && (
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label>Current Password</Label>
                                    <Input
                                        type="password"
                                        className="bg-black/20 border-white/10"
                                        value={disablePassword}
                                        onChange={(e) => setDisablePassword(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>2FA Code (Optional but recommended)</Label>
                                    <Input
                                        placeholder="000 000"
                                        className="bg-black/20 border-white/10 text-center tracking-widest"
                                        maxLength={6}
                                        value={disableCode}
                                        onChange={(e) => setDisableCode(e.target.value)}
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        {step === 'qr' && (
                            <Button onClick={verifyAndEnable} disabled={verifyCode.length !== 6 || isLoading} className="w-full bg-emerald-500 hover:bg-emerald-600">
                                {isLoading ? <Loader2 className="animate-spin" /> : 'Verify & Enable'}
                            </Button>
                        )}
                        {step === 'backup' && (
                            <Button onClick={() => setIsOpen(false)} className="w-full bg-white text-black hover:bg-gray-200">
                                I have saved these codes
                            </Button>
                        )}
                        {step === 'disable' && (
                            <Button onClick={disableTwoFactor} disabled={!disablePassword || isLoading} variant="destructive" className="w-full">
                                {isLoading ? <Loader2 className="animate-spin" /> : 'Disable 2FA'}
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
