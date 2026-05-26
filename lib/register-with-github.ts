import type { Page, BrowserContext, Browser } from 'playwright'
import { registerKiroWithGoogle } from './register'
import { loginGitHub, type GitHubSession } from './github-login'
import { launchBrowser } from './browser'
import type { KiroSession } from './google-login'

type LogCallback = (message: string) => void

export type RegisterWithGitHubOptions = {
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

export type RegisterWithGitHubResult = {
  success: boolean
  email: string
  error?: string
  reason?: string
  session?: KiroSession
  githubSession?: GitHubSession
  githubError?: string
}

export async function registerKiroWithGitHub(
  options: RegisterWithGitHubOptions
): Promise<RegisterWithGitHubResult> {
  const { email, password, log } = options

  log(`========== Kiro + GitHub Registration ==========`)
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

    // Step 2: GitHub login (new browser session)
    log('[github] launching browser for GitHub login...')
    
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

      const githubResult = await loginGitHub(page, context, email, password, log)

      await context.close()

      if (!githubResult.success) {
        log(`[github] failed: ${githubResult.error}`)
        return {
          success: true, // Kiro succeeded, GitHub failed
          email,
          session: kiroResult.session,
          githubError: githubResult.error
        }
      }

      log('[github] ✓ login successful')
      return {
        success: true,
        email,
        session: kiroResult.session,
        githubSession: githubResult.session
      }
    } catch (ghError) {
      const msg = ghError instanceof Error ? ghError.message : String(ghError)
      log(`[github] error: ${msg}`)
      return {
        success: true, // Kiro succeeded, GitHub failed
        email,
        session: kiroResult.session,
        githubError: msg
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
