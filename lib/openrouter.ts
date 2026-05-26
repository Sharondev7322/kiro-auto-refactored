     1|import type { Page, BrowserContext } from 'playwright'
     2|
     3|type LogCallback = (message: string) => void
     4|
     5|export type OpenRouterSession = {
     6|  email: string
     7|  apiKey: string
     8|  createdAt: string
     9|}
    10|
    11|export type OpenRouterResult = {
    12|  success: boolean
    13|  email: string
    14|  apiKey?: string
    15|  createdAt?: string
    16|  error?: string
    17|  reason?: string
    18|}
    19|
    20|export type GenerateOpenRouterOptions = {
    21|  email: string
    22|  password: string
    23|  log: LogCallback
    24|  proxyUrl?: string
    25|  headless?: boolean
    26|  outputPath?: string
    27|}
    28|
    29|const OPENROUTER_SIGNIN_URL = 'https://openrouter.ai/sign-in?redirect_url=https%3A%2F%2Fopenrouter.ai%2Fworkspaces%2Fdefault%2Fkeys'
    30|
    31|// ============================================================================
    32|// MAIN EXPORT FUNCTION
    33|// ============================================================================
    34|
    35|export async function generateOpenRouterApiKey(
    36|  page: Page,
    37|  context: BrowserContext,
    38|  options: GenerateOpenRouterOptions
    39|): Promise<OpenRouterResult> {
    40|  const { email, password, log, proxyUrl, headless = true, outputPath = 'show/openrouter-keys.json' } = options
    41|
    42|  log(`========== OpenRouter API Key Generation ==========`)
    43|  log(`account: ${email}`)
    44|
    45|  try {
    46|    // Step 1: Navigate to signin with redirect to keys page
    47|    log('[openrouter] navigating to signin...')
    48|    await page.goto(OPENROUTER_SIGNIN_URL, { waitUntil: 'networkidle', timeout: 30000 })
    49|    await page.waitForTimeout(1000)
    50|
    51|    // Step 2: Handle Google login (with 2FA, device verification, consent)
    52|    log('[openrouter] logging in with Google...')
    53|    const googleLoginSuccess = await handleGoogleLoginForOpenRouter(page, email, password, log)
    54|    if (!googleLoginSuccess) {
    55|      return {
    56|        success: false,
    57|        email,
    58|        error: 'Google login failed',
    59|        reason: 'google_login_failed'
    60|      }
    61|    }
    62|
    63|    // Step 3: Handle Turnstile challenge
    64|    log('[openrouter] handling Turnstile challenge...')
    65|    const turnstileSuccess = await handleTurnstile(page, log, 60000)
    66|    if (!turnstileSuccess) {
    67|      return {
    68|        success: false,
    69|        email,
    70|        error: 'Turnstile challenge failed or timed out',
    71|        reason: 'turnstile_timeout'
    72|      }
    73|    }
    74|
    75|    // Step 4: Wait for redirect to keys page
    76|    log('[openrouter] waiting for keys page...')
    77|    await page.waitForURL('**/workspaces/default/keys', { timeout: 15000 }).catch(() => {})
    78|    await page.waitForTimeout(2000)
    79|
    80|    // Step 5: Dismiss any popup
    81|    await dismissPopup(page, log)
    82|
    83|    // Step 6: Click New Key button
    84|    const newKeySuccess = await clickNewKeyButton(page, log)
    85|    if (!newKeySuccess) {
    86|      return {
    87|        success: false,
    88|        email,
    89|        error: 'Failed to click New Key button',
    90|        reason: 'new_key_button_failed'
    91|      }
    92|    }
    93|
    94|    // Step 7: Fill key name (use email as name)
    95|    const keyName = `kiro-${email.split('@')[0]}-${Date.now()}`
    96|    const fillSuccess = await fillKeyName(page, keyName, log)
    97|    if (!fillSuccess) {
    98|      return {
    99|        success: false,
   100|        email,
   101|        error: 'Failed to fill key name',
   102|        reason: 'fill_name_failed'
   103|      }
   104|    }
   105|
   106|    // Step 8: Click Create button
   107|    const createSuccess = await clickCreateButton(page, log)
   108|    if (!createSuccess) {
   109|      return {
   110|        success: false,
   111|        email,
   112|        error: 'Failed to click Create button',
   113|        reason: 'create_button_failed'
   114|      }
   115|    }
   116|
   117|    // Step 9: Extract API key from modal
   118|    const apiKey = await extractApiKey(page, log)
   119|    if (!apiKey) {
   120|      return {
   121|        success: false,
   122|        email,
   123|        error: 'Failed to extract API key from modal',
   124|        reason: 'extract_key_failed'
   125|      }
   126|    }
   127|
   128|    // Step 10: Save to file
   129|    const session: OpenRouterSession = {
   130|      email,
   131|      apiKey,
   132|      createdAt: new Date().toISOString()
   133|    }
   134|
   135|    await saveOpenRouterSession(outputPath, session, log)
   136|
   137|    log(`[openrouter] ✓ API key generated successfully`)
   138|    return {
   139|      success: true,
   140|      email,
   141|      apiKey,
   142|      createdAt: session.createdAt
   143|    }
   144|  } catch (e) {
   145|    const msg = e instanceof Error ? e.message : String(e)
   146|    log(`[openrouter] fatal: ${msg}`)
   147|    return {
   148|      success: false,
   149|      email,
   150|      error: msg,
   151|      reason: 'fatal'
   152|    }
   153|  }
   154|}
   155|

// ============================================================================
// GOOGLE LOGIN WITH 2FA, DEVICE VERIFICATION, CONSENT HANDLING
// ============================================================================

async function handleGoogleLoginForOpenRouter(
  page: Page,
  email: string,
  password: string,
  log: LogCallback
): Promise<boolean> {
  try {
    const googleButton = page.locator('button:has-text("Google"), a:has-text("Google"), [data-testid*="google"]').first()
    const visible = await googleButton.isVisible({ timeout: 5000 }).catch(() => false)

    if (!visible) {
      log('[openrouter] Google login button not found')
      return false
    }

    await googleButton.click({ timeout: 5000 })
    log('[openrouter] clicked Google login button')
    await page.waitForURL('**/accounts.google.com/**', { timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(1000)

    const emailInput = page.locator('input[type="email"]').first()
    const emailVisible = await emailInput.isVisible({ timeout: 5000 }).catch(() => false)
    if (!emailVisible) {
      log('[openrouter] email input not found')
      return false
    }
    await emailInput.fill(email, { timeout: 5000 })
    await page.keyboard.press('Enter')
    log('[openrouter] filled email')
    await page.waitForTimeout(2000)

    const passwordInput = page.locator('input[type="password"]').first()
    const passwordVisible = await passwordInput.isVisible({ timeout: 5000 }).catch(() => false)
    if (!passwordVisible) {
      log('[openrouter] password input not found')
      return false
    }
    await passwordInput.fill(password, { timeout: 5000 })
    await page.keyboard.press('Enter')
    log('[openrouter] filled password')
    await page.waitForTimeout(2000)

    const twoFAInput = page.locator('input[placeholder*="code" i], input[placeholder*="verification" i], input[aria-label*="code" i]').first()
    const twoFAVisible = await twoFAInput.isVisible({ timeout: 3000 }).catch(() => false)

    if (twoFAVisible) {
      log('[openrouter] 2FA detected - waiting for user input (60 seconds)...')
      await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 60000 }).catch(() => {})
      log('[openrouter] 2FA completed')
      await page.waitForTimeout(1000)
    }

    const verifyButton = page.locator('button:has-text("Yes, it's me"), button:has-text("Confirm"), button:has-text("Continue")').first()
    const verifyVisible = await verifyButton.isVisible({ timeout: 3000 }).catch(() => false)

    if (verifyVisible) {
      await verifyButton.click({ timeout: 5000 })
      log('[openrouter] clicked device verification')
      await page.waitForTimeout(2000)
    }

    const allowButton = page.locator('button:has-text("Allow"), button:has-text("Continue"), button:has-text("Accept")').first()
    const allowVisible = await allowButton.isVisible({ timeout: 3000 }).catch(() => false)

    if (allowVisible) {
      await allowButton.click({ timeout: 5000 })
      log('[openrouter] clicked consent allow')
      await page.waitForTimeout(2000)
    }

    const currentUrl = page.url()
    if (currentUrl.includes('openrouter.ai')) {
      log('[openrouter] ✓ Google login successful')
      return true
    } else {
      log(`[openrouter] unexpected URL after login: ${currentUrl}`)
      return false
    }
  } catch (e) {
    log(`[openrouter] Google login error: ${e instanceof Error ? e.message : String(e)}`)
    return false
  }
}

async function dismissPopup(page: Page, log: LogCallback): Promise<void> {
  try {
    const closeButtons = await page.locator('button[aria-label*="close" i], button[aria-label*="dismiss" i]').all()
    if (closeButtons.length > 0) {
      await closeButtons[0].click({ timeout: 2000 }).catch(() => {})
      log('[openrouter] dismissed popup')
      await page.waitForTimeout(500)
    }
  } catch {
    // Ignore
  }
}

async function handleTurnstile(page: Page, log: LogCallback, timeoutMs: number = 60000): Promise<boolean> {
  try {
    const turnstileCheckbox = page.locator('input[type="checkbox"][aria-label*="challenge" i], input[type="checkbox"][data-testid*="turnstile"], iframe[src*="challenges.cloudflare.com"]').first()
    const visible = await turnstileCheckbox.isVisible({ timeout: 5000 }).catch(() => false)

    if (!visible) {
      log('[openrouter] no Turnstile detected')
      return true
    }

    log('[openrouter] Turnstile detected - clicking checkbox...')
    await turnstileCheckbox.click({ timeout: 5000 })
    log('[openrouter] clicked Turnstile checkbox')
    await page.waitForNavigation({ waitUntil: 'networkidle', timeout: timeoutMs }).catch(() => {})
    log('[openrouter] Turnstile challenge completed')
    return true
  } catch (e) {
    log(`[openrouter] Turnstile error: ${e instanceof Error ? e.message : String(e)}`)
    return false
  }
}

async function clickNewKeyButton(page: Page, log: LogCallback): Promise<boolean> {
  try {
    const button = page.locator('button:has-text("New Key"), button:has-text("Create Key"), button:has-text("Add Key")').first()
    const visible = await button.isVisible({ timeout: 5000 }).catch(() => false)
    if (!visible) {
      log('[openrouter] New Key button not found')
      return false
    }
    await button.click({ timeout: 5000 })
    log('[openrouter] clicked New Key button')
    await page.waitForTimeout(1500)
    return true
  } catch (e) {
    log(`[openrouter] failed to click New Key: ${e instanceof Error ? e.message : String(e)}`)
    return false
  }
}

async function fillKeyName(page: Page, keyName: string, log: LogCallback): Promise<boolean> {
  try {
    const input = page.locator('input[placeholder*="name" i], input[placeholder*="key" i], input[aria-label*="name" i]').first()
    const visible = await input.isVisible({ timeout: 5000 }).catch(() => false)
    if (!visible) {
      log('[openrouter] key name input not found')
      return false
    }
    await input.fill(keyName, { timeout: 5000 })
    log(`[openrouter] filled key name: ${keyName}`)
    await page.waitForTimeout(500)
    return true
  } catch (e) {
    log(`[openrouter] failed to fill key name: ${e instanceof Error ? e.message : String(e)}`)
    return false
  }
}

async function clickCreateButton(page: Page, log: LogCallback): Promise<boolean> {
  try {
    const button = page.locator('button:has-text("Create"), button:has-text("Generate"), button:has-text("Save")').first()
    const visible = await button.isVisible({ timeout: 5000 }).catch(() => false)
    if (!visible) {
      log('[openrouter] Create button not found')
      return false
    }
    await button.click({ timeout: 5000 })
    log('[openrouter] clicked Create button')
    await page.waitForTimeout(2000)
    return true
  } catch (e) {
    log(`[openrouter] failed to click Create: ${e instanceof Error ? e.message : String(e)}`)
    return false
  }
}

async function extractApiKey(page: Page, log: LogCallback): Promise<string | null> {
  try {
    await page.waitForTimeout(1000)
    const pageContent = await page.content()
    const keyMatch = pageContent.match(/sk-[a-zA-Z0-9]{40,}/i)
    if (keyMatch) {
      log(`[openrouter] extracted API key via regex`)
      return keyMatch[0]
    }
    const keyInput = page.locator('input[value*="sk-"], input[readonly]').first()
    const keyValue = await keyInput.inputValue({ timeout: 3000 }).catch(() => null)
    if (keyValue && keyValue.includes('sk-')) {
      log(`[openrouter] extracted API key from input field`)
      return keyValue
    }
    const keyElements = await page.locator('code, pre, span, p').all()
    for (const el of keyElements) {
      const text = await el.textContent().catch(() => '')
      if (text && text.includes('sk-')) {
        const match = text.match(/sk-[a-zA-Z0-9]{40,}/i)
        if (match) {
          log(`[openrouter] extracted API key from element text`)
          return match[0]
        }
      }
    }
    log('[openrouter] could not extract API key')
    return null
  } catch (e) {
    log(`[openrouter] extraction error: ${e instanceof Error ? e.message : String(e)}`)
    return null
  }
}

async function saveOpenRouterSession(outputPath: string, session: OpenRouterSession, log: LogCallback): Promise<void> {
  try {
    const { mkdir, readFile, writeFile } = await import('node:fs/promises')
    const { dirname } = await import('node:path')
    const dir = dirname(outputPath)
    await mkdir(dir, { recursive: true })
    let existing: OpenRouterSession[] = []
    try {
      const content = await readFile(outputPath, 'utf-8')
      existing = JSON.parse(content)
    } catch {
      // File tidak ada
    }
    const idx = existing.findIndex((s) => s.email === session.email)
    if (idx >= 0) {
      existing[idx] = session
    } else {
      existing.push(session)
    }
    await writeFile(outputPath, JSON.stringify(existing, null, 2), 'utf-8')
    log(`[openrouter] saved to ${outputPath}`)
  } catch (e) {
    log(`[openrouter] save error: ${e instanceof Error ? e.message : String(e)}`)
  }
}
