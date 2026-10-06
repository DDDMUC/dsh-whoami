/**
 * dsh-whoami — publish this agent's runtime identity as managed `DSH_*`
 * variables on every model shell call.
 *
 * The plugin answers a question every agent eventually asks: *which device, in
 * which application, served by which provider and model am I?* It contributes
 * to `ctx.shellEnv` — the registry that rebuilds the trusted `DSH_*` namespace
 * for each model-facing shell execution — so the answer is one `env | grep DSH`
 * away, without touching the system prompt.
 *
 * Host-only plugin: there is no browser half, no route, and no setting. The
 * facts are free of secrets: a hostname, an OS string, a profile name, a route
 * and a model id.
 *
 * The model facts come from the session's durable `modelSelection` projection
 * (the same value the GUI's model card shows): `lastUsed` is the model of the
 * last committed request header, so it is what actually served the session, not
 * a hoped-for preference. The projection registry is wired **opportunistically**
 * (`ctx.inject`), so a composition without it still publishes the host facts.
 *
 * Failure policy: `resolve` runs inside every model shell call, so it never
 * throws. An unexpected service shape, a throwing reader, or a missing session
 * yields fewer facts — never a failed shell call.
 *
 * @module dsh-whoami
 */

import os from 'node:os'
import { createRequire } from 'node:module'
import { WHOAMI_VARIABLES, identityFacts } from './identity.js'

/** Cordis plugin name. */
export const name = 'whoami'

/** The registry this plugin contributes to; everything else is opportunistic. */
export const inject = ['shellEnv']

/** Default application label when the row does not configure one. */
const WEB_APP_LABEL = 'DeepSeek Harness Web GUI'
const DEFAULT_APP_LABEL = 'DeepSeek Harness'

/**
 * Read the harness version from the running installation.
 * @returns {string|undefined} version string, or undefined when unresolvable.
 */
function readDshVersion() {
  try {
    const require = createRequire(import.meta.url)
    const manifest = require('@deepseek-ai/dsh/package.json')
    const version = manifest?.version
    return typeof version === 'string' && version.trim() !== '' ? version.trim() : undefined
  } catch {
    return undefined
  }
}

/**
 * Label the application this host runs.
 * @param {{appLabel?: string, profile?: string, webUrl?: string}} input - configured label and environment facts.
 * @returns {string|undefined} application label.
 */
export function appLabel(input = {}) {
  const configured = input.appLabel
  if (typeof configured === 'string' && configured.trim() !== '') return configured.trim()
  if (typeof input.webUrl === 'string' && input.webUrl.trim() !== '') return WEB_APP_LABEL
  return DEFAULT_APP_LABEL
}

/**
 * Read one session's durable model selection from the registered projection readers.
 * @param {readonly object[]} registries - projection registries currently in scope.
 * @param {object|undefined} session - live session the execution belongs to.
 * @returns {unknown} the projection value, or undefined when unavailable.
 */
export function readSelection(registries, session) {
  if (session === undefined || session === null) return undefined
  for (const registry of registries) {
    if (registry === undefined || registry === null) continue
    for (const method of ['snapshot', 'cachedSnapshot']) {
      try {
        const read = registry[method]
        if (typeof read !== 'function') continue
        const snapshot = read.call(registry, session, ['modelSelection'])
        const value = snapshot?.values?.modelSelection
        if (value !== undefined && value !== null) return value
      } catch {
        // A shape this build cannot read is treated as "no fact available"; the
        // next reader (or omission) is the truthful outcome. The property read
        // itself is inside the guard: a service can expose a throwing getter.
      }
    }
  }
  return undefined
}

/**
 * Register the whoami contributor.
 * @param {object} ctx - host plugin context carrying `shellEnv`.
 * @param {{appLabel?: string}} [config] - optional row config.
 */
export function apply(ctx, config = {}) {
  const dshVersion = readDshVersion()
  /** Projection registries currently in scope (usually exactly one). */
  const registries = []
  ctx.inject(['sessionProjections'], scope => {
    registries.push(scope.sessionProjections)
    return () => {
      const index = registries.indexOf(scope.sessionProjections)
      if (index >= 0) registries.splice(index, 1)
    }
  })
  ctx.effect(() => ctx.shellEnv.register({
    name: 'whoami',
    variables: WHOAMI_VARIABLES,
    resolve: execution => {
      try {
        return identityFacts({
          device: {
            hostname: os.hostname(),
            platform: os.platform(),
            release: os.release(),
            arch: process.arch,
          },
          app: {
            label: appLabel({
              appLabel: config?.appLabel,
              profile: process.env.DSH_PROFILE,
              webUrl: process.env.DSH_WEB_URL,
            }),
            dshVersion,
            profile: process.env.DSH_PROFILE,
            webUrl: process.env.DSH_WEB_URL,
          },
          selection: readSelection(registries, execution?.agent?.session),
        })
      } catch {
        // A contributor that throws would fail the shell call it decorates;
        // publishing nothing is always better than publishing an error.
        return {}
      }
    },
  }), 'whoami: shell environment contributor')
}
