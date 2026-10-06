/**
 * Plugin wiring: what the host registers, what one shell execution receives, and
 * the promise that a shell call is never failed by this plugin.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { apply, appLabel, inject, name, readSelection } from '../lib/index.js'

/**
 * A fake host context.
 *
 * `inject` mirrors cordis: the callback runs only when every named service is
 * actually available, and never with an undeclared service.
 */
function fakeContext(options = {}) {
  const registered = []
  const ctx = {
    inject(names, callback) {
      assert.deepEqual(names, ['sessionProjections'])
      const scope = {}
      if (options.sessionProjections !== undefined) scope.sessionProjections = options.sessionProjections
      else return () => {}
      const dispose = callback(scope)
      return typeof dispose === 'function' ? dispose : () => {}
    },
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

test('the plugin declares only the shell environment registry as required', () => {
  // Given the plugin's cordis declaration
  // When it is inspected
  // Then the optional projection registry is NOT a hard dependency
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

test('a throwing projection reader never fails the shell call', () => {
  // Given a registry whose reader throws and one whose getter throws
  const session = { id: 's' }
  const throwing = { snapshot: () => { throw new Error('shape changed') } }
  const hostile = {}
  Object.defineProperty(hostile, 'snapshot', { get() { throw new Error('unreadable') } })
  const { ctx, registered } = fakeContext({ sessionProjections: throwing })
  // When the contributor resolves, and when a hostile registry is read directly
  apply(ctx, {})
  const contribution = registered[0].resolve({ agent: { session } })
  const direct = readSelection([hostile, throwing], session)
  // Then the call still returns the host facts, and the unreadable value is absent
  assert.equal('DSH_MODEL' in contribution, false)
  assert.ok(contribution.DSH_DEVICE.length > 0)
  assert.equal(direct, undefined)
})

test('a projection shape this build cannot read is treated as absent', () => {
  // Given readers that return nothing useful, the wire view, and the legacy state view
  const session = { id: 's' }
  const empty = readSelection([{ snapshot: () => ({ values: {} }) }], session)
  const view = readSelection([{ snapshot: () => ({ values: { modelSelection: { lastUsed: null, next: { provider: 'zai', model: 'glm-5.3' } } } }) }], session)
  const legacy = readSelection([{ cachedSnapshot: () => ({ values: { modelSelection: { lastUsed: null, pending: { provider: 'openrouter', model: 'qwen3.8' } } } }) }], session)
  // When each is normalized through the contributor's reader
  // Then an empty projection is absent, and both declared shapes are read
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
