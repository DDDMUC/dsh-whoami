/**
 * Pure fact composition for the whoami contributor: turn raw process facts into
 * the `DSH_*` values the model-facing shells receive.
 *
 * No cordis, no filesystem, no clock — everything arrives as an argument, so the
 * whole module is deterministic and testable with plain `node --test`.
 *
 * Omission rule: a fact that cannot be established is **omitted**, never
 * invented. An absent `DSH_MODEL` tells the agent "this host does not publish
 * it"; a placeholder value would tell it something false.
 *
 * @module dsh-whoami/lib/identity
 */

/** The complete set of environment keys this plugin may publish. */
export const WHOAMI_KEYS = Object.freeze([
  'DSH_DEVICE',
  'DSH_APP',
  'DSH_PROVIDER',
  'DSH_MODEL',
  'DSH_EFFORT',
])

/** Model-visible descriptions for the managed variables (the registry lists them). */
export const WHOAMI_VARIABLES = Object.freeze({
  DSH_DEVICE: { description: 'Machine running this agent: hostname (OS version, CPU arch).' },
  DSH_APP: { description: 'Application serving this session: label (dsh version, profile, URL).' },
  DSH_PROVIDER: { description: 'LLM provider route serving this session, e.g. cline-pass.' },
  DSH_MODEL: { description: 'Exact model id serving this session, e.g. cline-pass/deepseek-v4.1-flash.' },
  DSH_EFFORT: { description: 'Reasoning effort configured for this session, when the route exposes one.' },
})

/** Trim and drop empty strings, so a blank fact counts as absent. */
const clean = value => {
  if (value === undefined || value === null) return undefined
  const text = String(value).trim()
  return text === '' ? undefined : text
}

/**
 * Compose the device fact.
 * @param {{hostname?: string, platform?: string, release?: string, arch?: string}} raw - process facts.
 * @returns {string|undefined} e.g. `mudeMacBook-Air.local (darwin 25.0.0, arm64)`.
 */
export function deviceFact(raw = {}) {
  const host = clean(raw.hostname)
  const system = [clean(raw.platform), clean(raw.release)].filter(Boolean).join(' ')
  const arch = clean(raw.arch)
  const detail = [system, arch].filter(Boolean).join(', ')
  if (host === undefined) return detail === '' ? undefined : `(${detail})`
  return detail === '' ? host : `${host} (${detail})`
}

/**
 * Compose the application fact.
 * @param {{label?: string, dshVersion?: string, profile?: string, webUrl?: string}} raw - application facts.
 * @returns {string|undefined} e.g. `DeepSeek Harness Web GUI (dsh 0.2.0-rc.2, profile web, http://127.0.0.1:3080)`.
 */
export function appFact(raw = {}) {
  const label = clean(raw.label)
  const detail = [
    clean(raw.dshVersion) === undefined ? undefined : `dsh ${clean(raw.dshVersion)}`,
    clean(raw.profile) === undefined ? undefined : `profile ${clean(raw.profile)}`,
    clean(raw.webUrl),
  ].filter(Boolean).join(', ')
  if (label === undefined) return detail === '' ? undefined : detail
  return detail === '' ? label : `${label} (${detail})`
}

/**
 * Normalize one model-selection value. Both projection shapes are accepted: the
 * host registry's durable state (`{lastUsed, pending}`) and its wire view
 * (`{lastUsed, next}`).
 * @param {unknown} value - projection value.
 * @returns {{provider: string, model: string, reasoningEffort?: string}|undefined} normalized selection.
 */
export function selectionFact(value) {
  if (value === null || typeof value !== 'object') return undefined
  const candidate = value.lastUsed ?? value.next ?? value.pending
  if (candidate === null || typeof candidate !== 'object') return undefined
  const provider = clean(candidate.provider)
  const model = clean(candidate.model)
  if (provider === undefined || model === undefined) return undefined
  const effort = clean(candidate.reasoningEffort)
  return effort === undefined ? { provider, model } : { provider, model, reasoningEffort: effort }
}

/**
 * Compose the complete environment contribution.
 * @param {{device?: object, app?: object, selection?: unknown}} input - raw facts and the session's selection value.
 * @returns {Record<string, string>} only the facts that could be established.
 */
export function identityFacts(input = {}) {
  const facts = {}
  const device = deviceFact(input.device)
  if (device !== undefined) facts.DSH_DEVICE = device
  const app = appFact(input.app)
  if (app !== undefined) facts.DSH_APP = app
  const selection = selectionFact(input.selection)
  if (selection !== undefined) {
    facts.DSH_PROVIDER = selection.provider
    facts.DSH_MODEL = selection.model
    if (selection.reasoningEffort !== undefined) facts.DSH_EFFORT = selection.reasoningEffort
  }
  return facts
}
