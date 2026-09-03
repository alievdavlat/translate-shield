import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { chromium, type BrowserContext } from '@playwright/test'

interface ProfileOptions {
  channel: 'chrome' | 'msedge'
  from: string
  to: string
}

/**
 * Seeds a throwaway Chrome or Edge profile that auto-translates without showing
 * the bubble, then launches the real branded browser against it. This is the only
 * way to observe the browser's own built-in translator rather than a widget.
 */
export const launchWithAutoTranslate = async ({
  channel,
  from,
  to,
}: ProfileOptions): Promise<{ context: BrowserContext; profileDir: string }> => {
  const profileDir = join(tmpdir(), `ts-profile-${channel}-${to}-${process.pid}`)
  const defaultDir = join(profileDir, 'Default')
  mkdirSync(defaultDir, { recursive: true })

  const preferences = {
    translate: { enabled: true },
    translate_whitelists: { [from]: to },
    translate_allowlists: { [from]: to },
    translate_site_blacklist: [],
    translate_site_blocklist: [],
    translate_blocked_languages: [],
    translate_recent_target: to,
    intl: { accept_languages: `${to},${from}`, selected_languages: `${to},${from}` },
    edge: { translate: { enabled: true, auto_translate_languages: { [from]: to } } },
    settings: { language: { preferred_languages: `${to},${from}` } },
    browser: { enabled_labs_experiments: [] },
    profile: { exit_type: 'Normal', exited_cleanly: true },
  }
  writeFileSync(join(defaultDir, 'Preferences'), JSON.stringify(preferences))

  const context = await chromium.launchPersistentContext(profileDir, {
    channel,
    headless: false,
    args: [
      `--lang=${to}`,
      '--no-first-run',
      '--no-default-browser-check',
      ...(channel === 'msedge'
        ? ['--enable-features=msEdgeTranslate', '--force-enable-translate']
        : []),
    ],
    locale: to,
  })

  return { context, profileDir }
}

export const disposeProfile = (profileDir: string): void => {
  rmSync(profileDir, { recursive: true, force: true })
}
