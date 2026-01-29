import { NextRequest, NextResponse } from 'next/server'
import { NormalizationDiscoveryService } from '@/lib/ai/discovery-service'

import { AuthGuard } from '@/lib/auth/guard'

/**
 * Administrative AI Generation Route
 * 
 * Delegates documentation analysis and provider configuration generation
 * to the NormalizationDiscoveryService (Universal AI Brain).
 */
export async function POST(req: NextRequest) {
  const auth = await AuthGuard.requireAdmin()
  if (auth.error) return auth.error

  try {
    const body = await req.json()
    const { prompt, step, mode, supplements, providerType } = body

    // Handle Analysis Mode
    if (mode === 'analyze') {
      const report = await NormalizationDiscoveryService.analyzeDocumentation(prompt)
      return NextResponse.json({ result: report })
    }

    // Handle Generation Mode
    // delegates all generation logic to the service
    const config = await NormalizationDiscoveryService.generateConfiguration({
      docPrompt: prompt,
      providerType: providerType || 'json_api',
      supplements,
      step
    })

    return NextResponse.json({ result: config })

  } catch (error: any) {
    console.error("[Admin:AIGen] Route failure:", error)
    return NextResponse.json(
      { error: "AI Generation failed", details: error.message },
      { status: 500 }
    )
  }
}

