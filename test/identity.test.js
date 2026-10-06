/**
 * Identity facts: composition, omission, and both projection shapes.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  WHOAMI_KEYS,
  WHOAMI_VARIABLES,
  appFact,
  deviceFact,
  identityFacts,
  selectionFact,
} from '../lib/identity.js'

test('app declares exactly the keys it may publish', () => {
  // Given the module's declared key set and the registry declaration
  const declared = Object.keys(WHOAMI_VARIABLES).sort()
  // When they are compared with the exported key list
  // Then both name the same five variables, so the registry cannot reject a resolved key
  assert.deepEqual(declared, [...WHOAMI_KEYS].sort())
  assert.equal(declared.length, 5)
})

test('device fact carries host, system and architecture', () => {
  // Given raw process facts
  const raw = { hostname: 'mudeMacBook-Air.local', platform: 'darwin', release: '25.0.0', arch: 'arm64' }
  // When the device fact is composed
  const fact = deviceFact(raw)
  // Then it reads host (system, arch)
  assert.equal(fact, 'mudeMacBook-Air.local (darwin 25.0.0, arm64)')
})

test('device fact omits whatever it cannot establish', () => {
  // Given facts with missing members
  // When each is composed
  // Then the blank members leave no empty parentheses behind
  assert.equal(deviceFact({ hostname: 'box', platform: 'linux' }), 'box (linux)')
  assert.equal(deviceFact({ platform: 'linux', arch: 'x64' }), '(linux, x64)')
  assert.equal(deviceFact({ hostname: 'box', platform: '  ' }), 'box')
  assert.equal(deviceFact({}), undefined)
})

test('application fact names the app, version, profile and URL', () => {
  // Given a web-profile host
  const raw = { label: 'DeepSeek Harness Web GUI', dshVersion: '0.2.0-rc.2', profile: 'web', webUrl: 'http://127.0.0.1:3080' }
  // When the application fact is composed
  const fact = appFact(raw)
  // Then every available member appears in a fixed order
  assert.equal(fact, 'DeepSeek Harness Web GUI (dsh 0.2.0-rc.2, profile web, http://127.0.0.1:3080)')
})

test('application fact keeps a bare label when no detail is available', () => {
  // Given only a label
  // When the application fact is composed
  // Then it stays the label alone rather than gaining empty parentheses
  assert.equal(appFact({ label: 'DeepSeek Harness' }), 'DeepSeek Harness')
  assert.equal(appFact({}), undefined)
})

test('selection fact reads the durable state shape', () => {
  // Given the host registry's state value
  const value = { lastUsed: { provider: 'cline-pass', model: 'cline-pass/deepseek-v4.1-flash', reasoningEffort: 'high' }, pending: null }
  // When it is normalized
  const selection = selectionFact(value)
  // Then provider, model and effort come through
  assert.deepEqual(selection, { provider: 'cline-pass', model: 'cline-pass/deepseek-v4.1-flash', reasoningEffort: 'high' })
})

test('selection fact reads the wire view shape and drops a missing effort', () => {
  // Given the wire view of the same projection without an effort
  const value = { lastUsed: { provider: 'zai', model: 'glm-5.3' }, next: null }
  // When it is normalized
  const selection = selectionFact(value)
  // Then the effort key is absent instead of empty
  assert.deepEqual(selection, { provider: 'zai', model: 'glm-5.3' })
  assert.equal('reasoningEffort' in selection, false)
})

test('selection fact refuses half a selection', () => {
  // Given values that cannot name a model route
  const unusable = [undefined, null, {}, { lastUsed: null }, { lastUsed: { provider: 'cline-pass' } }, { lastUsed: { model: 'x' } }]
  // When each is normalized
  const results = unusable.map(selectionFact)
  // Then every one of them is absent rather than guessed
  assert.deepEqual(results, [undefined, undefined, undefined, undefined, undefined, undefined])
})

test('identity facts publish only what exists', () => {
  // Given a web-profile session whose selection is recorded
  const complete = identityFacts({
    device: { hostname: 'box', platform: 'darwin', release: '25.0.0', arch: 'arm64' },
    app: { label: 'DeepSeek Harness Web GUI', dshVersion: '0.2.0-rc.2', profile: 'web', webUrl: 'http://127.0.0.1:3080' },
    selection: { lastUsed: { provider: 'cline-pass', model: 'cline-pass/deepseek-v4.1-flash', reasoningEffort: 'high' } },
  })
  // When the contribution is compared with its expected shape
  // Then all five facts are present
  assert.deepEqual(complete, {
    DSH_DEVICE: 'box (darwin 25.0.0, arm64)',
    DSH_APP: 'DeepSeek Harness Web GUI (dsh 0.2.0-rc.2, profile web, http://127.0.0.1:3080)',
    DSH_PROVIDER: 'cline-pass',
    DSH_MODEL: 'cline-pass/deepseek-v4.1-flash',
    DSH_EFFORT: 'high',
  })
  // And a host without a recorded selection publishes the device and application facts only
  const partial = identityFacts({ device: { hostname: 'box' }, app: { profile: 'headless' }, selection: undefined })
  assert.deepEqual(Object.keys(partial).sort(), ['DSH_APP', 'DSH_DEVICE'])
  // And a contributor with no facts at all publishes nothing
  assert.deepEqual(identityFacts({}), {})
})
