import type { Page, BrowserContext, Browser } from 'playwright'
import { registerKiroWithGoogle } from './register'
import { generateOpenRouterApiKey } from './openrouter'
import { launchBrowser } from './browser'
import type { KiroSession } from './google-login'

type LogCallback = (message: string) => void

export type RegisterWithOpenRouterOptions = {
  email: string
  password: string
  log: LogCallback
  proxyUrl?: string
  engine?: 'camoufox' | 'chromium-stealth' | 'chromium-vanilla'
  headless?: boolean
  useFingerprint?: boolean
  humanize?: boolean
  geoip?: boolean
}

export type RegisterWithOpenRouterResult = {
  success: boolean
  email: string
  error?: string
  reason?: string
  session?: KiroSession
  openrouterApiKey?: string
  openrouterError?: string
}

export async function registerKiroWithOpenRouter(
  options: RegisterWithOpenRouterOptions
): Promise<RegisterWithOpenRouterResult> {
  const { email, password, log } = options

  log(`========== Kiro + OpenRouter Registration ==========`)
  log(`account: ${email}`)

  try {
    // Step 1: Register Kiro
    log('[kiro] registering account...')
    const kiroResult = await registerKiroWithGoogle({
      email,
      password,
      log,
      proxyUrl: options.proxyUrl,
      engine: options.engine,
      headless: options.headless,
      useFingerprint: options.useFingerprint,
      humanize: options.humanize,
      geoip: options.geoip
    })

    if (!kiroResult.success) {
      return {
        success: false,
        email,
        error: kiroResult.error,
        reason: kiroResult.reason
      }
    }

    log('[kiro] ✓ registration successful')

    // Step 2: Generate OpenRouter API key
    // Create new browser session for OpenRouter
    log('[openrouter] launching browser for API key generation...')
    
    let browser: Browser | null = null
    try {
      browser = await launchBrowser({
        engine: options.engine || 'camoufox',
        headless: options.headless !== false,
        proxyUrl: options.proxyUrl,
        useFingerprint: options.useFingerprint !== false,
        humanize: options.humanize !== false,
        geoip: options.geoip !== false
      })

      const context = await browser.createIncognitoBrowserContext()
      const page = await context.newPage()

      const openrouterResult = await generateOpenRouterApiKey(page, context, {
        email,
        password,
        log,
        proxyUrl: options.proxyUrl,
        headless: options.headless !== false,
        outputPath: 'show/openrouter-keys.json'
      })

      await context.close()

      if (!openrouterResult.success) {
        log(`[openrouter] failed: ${openrouterResult.error}`)
        return {
          success: true, // Kiro succeeded, OpenRouter failed
          email,
          session: kiroResult.session,
          openrouterError: openrouterResult.error
        }
      }

      log('[openrouter] ✓ API key generated')
      return {
        success: true,
        email,
        session: kiroResult.session,
        openrouterApiKey: openrouterResult.apiKey
      }
    } catch (orError) {
      const msg = orError instanceof Error ? orError.message : String(orError)
      log(`[openrouter] error: ${msg}`)
      return {
        success: true, // Kiro succeeded, OpenRouter failed
        email,
        session: kiroResult.session,
        openrouterError: msg
      }
    } finally {
      if (browser) {
        await browser.close().catch(() => {})
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    log(`[fatal] ${msg}`)
    return {
      success: false,
      email,
      error: msg,
      reason: 'fatal'
    }
  }
}
