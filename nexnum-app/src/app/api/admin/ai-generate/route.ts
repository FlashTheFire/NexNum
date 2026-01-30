import { NextRequest, NextResponse } from 'next/server'
import { NormalizationDiscoveryService, DiscoveryType } from '@/lib/ai/discovery-service'
import { AuthGuard } from '@/lib/auth/guard'

/**
 * Administrative AI Generation Route (v2.0)
 * 
 * Delegates documentation analysis, provider configuration generation,
 * and runtime mapping discovery to the NormalizationDiscoveryService.
 * 
 * Modes:
 * - 'analyze': Scan documentation to detect API structure
 * - 'generate': Generate full or partial provider config
 * - 'discover': Self-healing mapping discovery from raw response
 */
export async function POST(req: NextRequest) {
  const auth = await AuthGuard.requireAdmin()
  if (auth.error) return auth.error

  try {
    const body = await req.json()
    const { prompt, step, mode, supplements, providerType, rawResponse, discoveryType, providerName } = body

    // ═══════════════════════════════════════════════════════════════════
    // MODE: ANALYZE - Documentation scanning
    // ═══════════════════════════════════════════════════════════════════
    if (mode === 'analyze') {
      const report = await NormalizationDiscoveryService.analyzeDocumentation(prompt)
      return NextResponse.json({
        success: true,
        mode: 'analyze',
        result: report
      })
    }

    // ═══════════════════════════════════════════════════════════════════
    // MODE: DISCOVER - Runtime mapping discovery (self-healing)
    // ═══════════════════════════════════════════════════════════════════
    if (mode === 'discover') {
      if (!rawResponse) {
        return NextResponse.json(
          { error: "rawResponse is required for discover mode" },
          { status: 400 }
        )
      }

      const mapping = await NormalizationDiscoveryService.discoverMapping(
        typeof rawResponse === 'string' ? rawResponse : JSON.stringify(rawResponse, null, 2),
        {
          type: (discoveryType || 'INV_SERVICE') as DiscoveryType,
          providerName: providerName || 'unknown'
        }
      )

      return NextResponse.json({
        success: true,
        mode: 'discover',
        result: mapping
      })
    }

    // ═══════════════════════════════════════════════════════════════════
    // MODE: GENERATE (default) - Full or partial config generation
    // ═══════════════════════════════════════════════════════════════════
    const config = await NormalizationDiscoveryService.generateConfiguration({
      docPrompt: prompt,
      providerType: providerType || 'json_api',
      supplements,
      step
    })

    return NextResponse.json({
      success: true,
      mode: 'generate',
      result: config
    })

  } catch (error: any) {
    console.error("[Admin:AIGen] Route failure:", error)
    return NextResponse.json(
      {
        success: false,
        error: "AI Generation failed",
        details: error.message
      },
      { status: 500 }
    )
  }
}
