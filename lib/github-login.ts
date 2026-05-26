import type { Page, BrowserContext } from 'playwright'

type LogCallback = (message: string) => void

export type GitHubSession = {
  email: string
  username: string
  accessToken?: string
  cookies: Array<{
    name: string
    value: string
    domain: string
    path: string
    expires?: number
    httpOnly?: boolean
    secure?: boolean
    sameSite?: string
  }>
  capturedAt: number
}

export type GitHubLoginResult = {
  success: boolean
  email?: string
  username?: string
  error?: string
  reason?: string
  session?: GitHubSession
}

const GITHUB_LOGIN_URL = 'https://github.com/login'
const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize'

// GitHub OAuth app redirect (generic - user can configure)
const GITHUB_CALLBACK_URL = 'http://localhost:3000/callback'

async function fileExists(path: string): Promise<boolean> {
  try {
    const { readFile } = await import('node:fs/promises')
    await readFile(path, 'utf-8')
    return true
  } catch {
    return false
  }
}

async function dismissPopup(page: Page, log: LogCallback): Promise<void> {
  try {
    const closeButtons = await page.locator('button[aria-label*="close" i], button[aria-label*="dismiss" i]').all()
    if (closeButtons.length > 0) {
      await closeButtons[0].click({ timeout: 2000 }).catch(() => {})
      log('[github] dismissed popup')
      await page.waitForTimeout(500)
    }
  } catch {
    // Ignore if no popup
  }
}

async function fillEmailOrUsername(page: Page, email: string, log: LogCallback): Promise<boolean> {
  try {
    const input = page.locator('input[name="login"], input[id="login_field"], input[placeholder*="email" i]').first()
    const visible = await input.isVisible({ timeout: 5000 }).catch(() => false)

    if (!visible) {
      log('[github] email/username input not found')
      return false
    }

    await input.fill(email, { timeout: 5000 })
    log(`[github] filled email/username: ${email}`)
    await page.waitForTimeout(500)
    return true
  } catch (e) {
    log(`[github] failed to fill email: ${e instanceof Error ? e.message : String(e)}`)
    return false
  }
}

async function fillPassword(page: Page, password: string, log: LogCallback): Promise<boolean> {
  try {
    const input = page.locator('input[name="password"], input[id="password"], input[type="password"]').first()
    const visible = await input.isVisible({ timeout: 5000 }).catch(() => false)

    if (!visible) {
      log('[github] password input not found')
      return false
    }

    await input.fill(password, { timeout: 5000 })
    log('[github] filled password')
    await page.waitForTimeout(500)
    return true
  } catch (e) {
    log(`[github] failed to fill password: ${e instanceof Error ? e.message : String(e)}`)
    return false
  }
}

async function clickSignInButton(page: Page, log: LogCallback): Promise<boolean> {
  try {
    const button = page.locator('button:has-text("Sign in"), input[type="submit"][value*="Sign in" i]').first()
    const visible = await button.isVisible({ timeout: 5000 }).catch(() => false)

    if (!visible) {
      log('[github] sign in button not found')
      return false
    }

    await button.click({ timeout: 5000 })
    log('[github] clicked sign in button')
    await page.waitForTimeout(2000)
    return true
  } catch (e) {
    log(`[github] failed to click sign in: ${e instanceof Error ? e.message : String(e)}`)
    return false
  }
}

async function handle2FA(page: Page, log: LogCallback, timeoutMs: number = 60000): Promise<boolean> {
  try {
    // Check if 2FA prompt appears
    const twoFAInput = page.locator('input[name="otp"], input[placeholder*="code" i], input[placeholder*="2FA" i]').first()
    const visible = await twoFAInput.isVisible({ timeout: 5000 }).catch(() => false)

    if (!visible) {
      log('[github] no 2FA detected')
      return true
    }

    log('[github] 2FA detected - waiting for user input...')
    // Wait for user to enter 2FA code (manual intervention)
    await page.waitForNavigation({ waitUntil: 'networkidle', timeout: timeoutMs }).catch(() => {})
    log('[github] 2FA completed')
    return true
  } catch (e) {
    log(`[github] 2FA error: ${e instanceof Error ? e.message : String(e)}`)
    return false
  }
}

async function extractEmailFromProfile(page: Page, log: LogCallback): Promise<string | null> {
  try {
    // Navigate to settings/profile to get email
    await page.goto('https://github.com/settings/profile', { waitUntil: 'networkidle', timeout: 15000 })
    await page.waitForTimeout(1000)

    // Try to find email on profile page
    const emailElements = await page.locator('[data-test-id*="email"], [aria-label*="email" i]').all()
    for (const el of emailElements) {
      const text = await el.textContent().catch(() => '')
      if (text && text.includes('@')) {
        const email = text.match(/[\w\.-]+@[\w\.-]+\.\w+/)?.[0]
        if (email) {
          log(`[github] extracted email: ${email}`)
          return email
        }
      }
    }

    log('[github] could not extract email from profile')
    return null
  } catch (e) {
    log(`[github] failed to extract email: ${e instanceof Error ? e.message : String(e)}`)
    return null
  }
}

async function extractUsername(page: Page, log: LogCallback): Promise<string | null> {
  try {
    // Username is in the URL or page header
    const url = page.url()
    const match = url.match(/github\.com\/([^\/]+)/)
    if (match) {
      log(`[github] extracted username: ${match[1]}`)
      return match[1]
    }

    // Try to find in page content
    const userElements = await page.locator('[data-test-id="profile-name"], [itemprop="name"]').all()
    for (const el of userElements) {
      const text = await el.textContent().catch(() => '')
      if (text && text.length > 0) {
        log(`[github] extracted username: ${text}`)
        return text
      }
    }

    return null
  } catch (e) {
    log(`[github] failed to extract username: ${e instanceof Error ? e.message : String(e)}`)
    return null
  }
}

export async function loginGitHub(
  page: Page,
  context: BrowserContext,
  email: string,
  password: string,
  log: LogCallback
): Promise<GitHubLoginResult> {
  log(`========== GitHub Login ==========`)
  log(`account: ${email}`)

  try {
    // Step 1: Navigate to GitHub login
    log('[github] navigating to login page...')
    await page.goto(GITHUB_LOGIN_URL, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(1000)

    // Step 2: Dismiss any popup
    await dismissPopup(page, log)

    // Step 3: Fill email/username
    const emailFilled = await fillEmailOrUsername(page, email, log)
    if (!emailFilled) {
      return {
        success: false,
        email,
        error: 'Failed to fill email/username',
        reason: 'email_fill_failed'
      }
    }

    // Step 4: Fill password
    const passwordFilled = await fillPassword(page, password, log)
    if (!passwordFilled) {
      return {
        success: false,
        email,
        error: 'Failed to fill password',
        reason: 'password_fill_failed'
      }
    }

    // Step 5: Click sign in
    const signInClicked = await clickSignInButton(page, log)
    if (!signInClicked) {
      return {
        success: false,
        email,
        error: 'Failed to click sign in button',
        reason: 'signin_button_failed'
      }
    }

    // Step 6: Handle 2FA if present
    const twoFAPassed = await handle2FA(page, log, 120000)
    if (!twoFAPassed) {
      return {
        success: false,
        email,
        error: '2FA handling failed',
        reason: '2fa_failed'
      }
    }

    // Step 7: Extract username and email
    const username = await extractUsername(page, log)
    if (!username) {
      return {
        success: false,
        email,
        error: 'Failed to extract username',
        reason: 'username_extract_failed'
      }
    }

    const extractedEmail = await extractEmailFromProfile(page, log)

    // Step 8: Capture cookies
    const cookies = await context.cookies()

    const session: GitHubSession = {
      email: extractedEmail || email,
      username,
      cookies,
      capturedAt: Date.now()
    }

    log('[github] ✓ login successful')
    return {
      success: true,
      email: session.email,
      username,
      session
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    log(`[github] fatal: ${msg}`)
    return {
      success: false,
      email,
      error: msg,
      reason: 'fatal'
    }
  }
}
