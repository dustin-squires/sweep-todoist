import { describe, expect, it } from 'vitest'
import { getSweepReason } from './sweep.js'

const task = (overrides: Record<string, unknown> = {}) => ({ due: null, addedAt: new Date('2026-01-01T00:00:00Z'), ...overrides } as any)
const now = new Date('2026-01-31T00:00:00Z')

describe('getSweepReason', () => {
  it('accepts overdue non-recurring tasks', () => expect(getSweepReason(task({ due: { date: '2026-01-30', isRecurring: false } }), now)).toEqual({ type: 'overdue' }))
  it('rejects future and today tasks', () => {
    expect(getSweepReason(task({ due: { date: '2026-02-01', isRecurring: false } }), now)).toBeNull()
    expect(getSweepReason(task({ due: { date: '2026-01-31', isRecurring: false } }), now)).toBeNull()
  })
  it('rejects recurring overdue tasks', () => expect(getSweepReason(task({ due: { date: '2026-01-01', isRecurring: true } }), now)).toBeNull())
  it('uses a 30-day inclusive boundary for undated tasks', () => {
    expect(getSweepReason(task(), now)).toEqual({ type: 'old-undated' })
    expect(getSweepReason(task({ addedAt: new Date('2026-01-21T00:00:01Z') }), now)).toBeNull()
  })
})
