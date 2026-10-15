import { describe, expect, it } from 'vitest'
import { ACCESSIBILITY_URL, ACCESSIBILITY_URL_VENTURA, privacyUrlAttempts } from './privacyLinks.ts'

describe('privacyUrlAttempts', () => {
  it('prefers the classic Accessibility deep link on macOS 12', () => {
    expect(privacyUrlAttempts('accessibility', 21)[0]).toBe(ACCESSIBILITY_URL)
  })

  it('uses the Ventura settings URL first on recent macOS and keeps the classic link', () => {
    const urls = privacyUrlAttempts('accessibility', 24)
    expect(urls[0]).toBe(ACCESSIBILITY_URL_VENTURA)
    expect(urls).toContain(ACCESSIBILITY_URL)
    expect(privacyUrlAttempts('screen', 25)[0]).toContain('Privacy_ScreenCapture')
  })
})
