
export type GenerateOpenRouterOptions = {
  email: string
  password: string
  log: LogCallback
  proxyUrl?: string
  headless?: boolean
  outputPath?: string
}

export async function generateOpenRouterApiKey(
  page: Page,
  context: BrowserContext,
  options: GenerateOpenRouterOptions
): Promise<OpenRouterResult> {
  const { email, password, log, proxyUrl, headless = true, outputPath = 'show/openrouter-keys.json' } = options

  log(`========== OpenRouter API Key Generation ==========`)
  log(`account: ${email}`)

  try {
    // Step 1: Navigate to signin with redirect to keys page
    log('[openrouter] navigating to signin...')
    await page.goto(OPENROUTER_SIGNIN_URL, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(1000)

    // Step 2: Handle Google login (reuse from google-login.ts logic)
    log('[openrouter] logging in with Google...')
    const googleLoginSuccess = await handleGoogleLoginForOpenRouter(page, email, password, log)
    if (!googleLoginSuccess) {
      return {
        success: false,
        email,
        error: 'Google login failed',
        reason: 'google_login_failed'
      }
    }

    // Step 3: Handle Turnstile challenge
    log('[openrouter] handling Turnstile challenge...')
    const turnstileSuccess = await handleTurnstile(page, log, 60000)
    if (!turnstileSuccess) {
      return {
        success: false,
        email,
        error: 'Turnstile challenge failed or timed out',
        reason: 'turnstile_timeout'
      }
    }

    // Step 4: Wait for redirect to keys page
    log('[openrouter] waiting for keys page...')
    await page.waitForURL('**/workspaces/default/keys', { timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(2000)

    // Step 5: Dismiss any popup
    await dismissPopup(page, log)

    // Step 6: Click New Key button
    const newKeySuccess = await clickNewKeyButton(page, log)
    if (!newKeySuccess) {
      return {
        success: false,
        email,
        error: 'Failed to click New Key button',
        reason: 'new_key_button_failed'
      }
    }

    // Step 7: Fill key name (use email as name)
    const keyName = `kiro-${email.split('@')[0]}-${Date.now()}`
    const fillSuccess = await fillKeyName(page, keyName, log)
    if (!fillSuccess) {
      return {
        success: false,
        email,
        error: 'Failed to fill key name',
        reason: 'fill_name_failed'
      }
    }

    // Step 8: Click Create button
    const createSuccess = await clickCreateButton(page, log)
    if (!createSuccess) {
      return {
        success: false,
        email,
        error: 'Failed to click Create button',
        reason: 'create_button_failed'
      }
    }

    // Step 9: Extract API key from modal
    const apiKey = await extractApiKey(page, log)
    if (!apiKey) {
      return {
        success: false,
        email,
        error: 'Failed to extract API key from modal',
        reason: 'extract_key_failed'
      }
    }

    // Step 10: Save to file
    const session: OpenRouterSession = {
      email,
      apiKey,
      createdAt: new Date().toISOString()
    }

    await saveOpenRouterSession(outputPath, session, log)

    log(`[openrouter] ✓ API key generated successfully`)
    return {
      success: true,
      email,
      apiKey,
      createdAt: session.createdAt
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    log(`[openrouter] fatal: ${msg}`)
    return {
      success: false,
      email,
      error: msg,
      reason: 'fatal'
    }
  }
}

async function handleGoogleLoginForOpenRouter(
  page: Page,
  email: string,
  password: string,
  log: LogCallback
): Promise<boolean> {
  try {
    // Find Google login button
    const googleButton = page.locator('button:has-text("Google"), a:has-text("Google"), [data-testid*="google"]').first()
    const visible = await googleButton.isVisible({ timeout: 5000 }).catch(() => false)

    if (!visible) {
      log('[openrouter] Google login button not found')
      return false
    }

    await googleButton.click({ timeout: 5000 })
    log('[openrouter] clicked Google login button')

    // Wait for Google login page
    await page.waitForURL('**/accounts.google.com/**', { timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(1000)

    // Fill email
    const emailInput = page.locator('input[type="email"]').first()
    await emailInput.fill(email, { timeout: 5000 })
    await page.keyboard.press('Enter')
    await page.waitForTimeout(1500)

    // Fill password
    const passwordInput = page.locator('input[type="password"]').first()
    await passwordInput.fill(password, { timeout: 5000 })
    await page.keyboard.press('Enter')
    await page.waitForTimeout(2000)

    log('[openrouter] Google login completed')
    return true
  } catch (e) {
    log(`[openrouter] Google login error: ${e instanceof Error ? e.message : String(e)}`)
    return false
  }
}
