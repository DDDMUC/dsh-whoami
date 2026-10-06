/**
 * Plugin wiring: what the host registers, and what one shell execution receives.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { apply, appLabel, inject, name, readSelection } from '../lib/index.js'

/** A fake host context that captures the registration and runs effects eagerly. */
function fakeContext(options = {}) {
  const registered = []
  const ctx = {
    sessionProjections: options.sessionProjections,
    shellEnv: {
      register(contributor) {
        registered.push(contributor)
        return () => {}
      },
    },
    effect(fn) {
      return fn()
    },
  }
  return { ctx, registered }
}

test('the plugin declares the shell environment registry as its one dependency', () => {
  // Given the plugin's cordis declaration
  // When it is inspected
  // Then the name and the injected registry are the documented ones
  assert.equal(name, 'whoami')
  assert.deepEqual(inject, ['shellEnv'])
})

test('one shell execution receives the device, application and model facts', () => {
  // Given a host whose session has a recorded model selection
  const session = { id: 'session-abc' }
  const { ctx, registered } = fakeContext({
    sessionProjections: {
      snapshot: (asked, keys) => {
        assert.equal(asked, session)
        assert.deepEqual(keys, ['modelSelection'])
        return { values: { modelSelection: { lastUsed: { provider: 'cline-pass', model: 'cline-pass/deepseek-v4.1-flash', reasoningEffort: 'high' } } } }
      },
    },
  })
  // When the plugin is applied and the contributor resolves for that execution
  apply(ctx, { appLabel: 'DeepSeek Harness Web GUI' })
  assert.equal(registered.length, 1)
  const contribution = registered[0].resolve({ agent: { session } })
  // Then the managed variables carry the facts, and only declared keys are returned
  assert.equal(contribution.DSH_PROVIDER, 'cline-pass')
  assert.equal(contribution.DSH_MODEL, 'cline-pass/deepseek-v4.1-flash')
  assert.equal(contribution.DSH_EFFORT, 'high')
  assert.match(contribution.DSH_DEVICE, /\(.+\)$/)
  // The dsh version is read from the running installation, so the label's shape is pinned
  // here and the exact composition (version included) is covered in identity.test.js.
  assert.match(contribution.DSH_APP, /^DeepSeek Harness Web GUI \(/)
  assert.match(contribution.DSH_APP, /http:\/\/127\.0\.0\.1:3080\)$/)
  for (const key of Object.keys(contribution)) assert.ok(key in registered[0].variables, key + ' must be declared')
})

test('a host without the projection registry still publishes device and application', () => {
  // Given a host that serves no projection registry
  const { ctx, registered } = fakeContext({ sessionProjections: undefined })
  // When the contributor resolves for a session
  apply(ctx, {})
  const contribution = registered[0].resolve({ agent: { session: { id: 'session-abc' } } })
  // Then no model key is invented
  assert.equal('DSH_MODEL' in contribution, false)
  assert.equal('DSH_PROVIDER' in contribution, false)
  assert.equal('DSH_EFFORT' in contribution, false)
  assert.ok(contribution.DSH_DEVICE.length > 0)
})

test('a shell execution without an agent still publishes the host facts', () => {
  // Given a contributor and an execution that owns no agent
  const { ctx, registered } = fakeContext({ sessionProjections: { snapshot: () => { throw new Error('must not be asked') } } })
  // When it resolves
  apply(ctx, {})
  const contribution = registered[0].resolve({})
  // Then the session-scoped facts are omitted and the host facts remain
  assert.equal('DSH_MODEL' in contribution, false)
  assert.ok(contribution.DSH_DEVICE.length > 0)
})

test('a projection shape this build cannot read is treated as absent', () => {
  // Given readers that throw, return null, or return the wire view
  const session = { id: 's' }
  const throwing = readSelection({ sessionProjections: { snapshot: () => { throw new Error('shape changed') } } }, session)
  const empty = readSelection({ sessionProjections: { snapshot: () => ({ values: {} }) } }, session)
  const view = readSelection({ sessionProjections: { snapshot: () => ({ values: { modelSelection: { lastUsed: null, next: { provider: 'zai', model: 'glm-5.3' } } } }) } }, session)
  const legacy = readSelection({ sessionProjections: { cachedSnapshot: () => ({ values: { modelSelection: { lastUsed: null, pending: { provider: 'openrouter', model: 'qwen3.8' } } } }) } }, session)
  // When each is normalized through the contributor's reader
  // Then a broken shape is absent, and both declared projection shapes are read
  assert.equal(throwing, undefined)
  assert.equal(empty, undefined)
  assert.deepEqual(view, { lastUsed: null, next: { provider: 'zai', model: 'glm-5.3' } })
  assert.deepEqual(legacy, { lastUsed: null, pending: { provider: 'openrouter', model: 'qwen3.8' } })
})

test('the application label prefers the row configuration, then the web URL', () => {
  // Given the three inputs the label can come from
  // When each is asked for a label
  // Then the explicit row config wins, a web URL names the web GUI, and the bare host gets the product name
  assert.equal(appLabel({ appLabel: 'Custom Shell' }), 'Custom Shell')
  assert.equal(appLabel({ webUrl: 'http://127.0.0.1:3080' }), 'DeepSeek Harness Web GUI')
  assert.equal(appLabel({ profile: 'headless' }), 'DeepSeek Harness')
  assert.equal(appLabel({ appLabel: '   ' }), 'DeepSeek Harness')
})
