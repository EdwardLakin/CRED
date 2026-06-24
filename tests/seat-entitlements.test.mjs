import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync('src/features/billing/seat-entitlements.ts', 'utf8')
const settingsAction = readFileSync('src/features/settings/actions.ts', 'utf8')

test('seat entitlement helpers include base seats and expansions', () => {
  assert.match(source, /essentials: 3/)
  assert.match(source, /professional: 10/)
  assert.match(source, /investigation: 20/)
  assert.match(source, /additional_seats/)
  assert.match(source, /seat_packs/)
  assert.match(source, /export function getEffectiveSeatLimit/)
  assert.match(source, /export function canAddUser/)
  assert.match(source, /export function getRemainingSeats/)
})

test('team invitations enforce centralized seat limits server-side', () => {
  assert.match(settingsAction, /canAddUser\(currentSeats, profile\.organization\)/)
  assert.doesNotMatch(settingsAction, /currentSeats >= getAllowedSeatCount/)
})
