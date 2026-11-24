import { describe, expect, it } from 'vitest'
import { memoryPersist, type Snapshot } from './persist'
import { sqlitePersist } from './persist-sqlite'
import { getInitialState } from '../src/store/initial-state'

const createMockSnapshot = (): Snapshot => ({
  state: getInitialState(1700000000000),
  sessions: {
    'token-doctor-1': { role: 'doctor', doctorId: 'meera' },
    'token-patient-1': { role: 'patient', patientId: 'p1' },
  },
})

describe('Memory Persistence (memoryPersist)', () => {
  it('loads null on initial empty store', async () => {
    const store = memoryPersist()
    expect(store.name).toBe('memory')
    const { snap, version } = await store.load()
    expect(snap).toBeNull()
    expect(version).toBeNull()
  })

  it('saves initial snapshot and increments version', async () => {
    const store = memoryPersist()
    const mockSnap = createMockSnapshot()

    const v1 = await store.save(mockSnap, null)
    expect(v1).toBe('1')

    const { snap, version } = await store.load()
    expect(version).toBe('1')
    expect(snap?.sessions['token-doctor-1']).toEqual({ role: 'doctor', doctorId: 'meera' })
  })

  it('prevents concurrent overwrites when version does not match', async () => {
    const store = memoryPersist()
    const mockSnap = createMockSnapshot()

    const v1 = await store.save(mockSnap, null)
    expect(v1).toBe('1')

    // Conflict: trying to save against outdated version null
    const conflictRes = await store.save(mockSnap, null)
    expect(conflictRes).toBeNull()

    // Valid update: saving with current version 1
    const v2 = await store.save(mockSnap, '1')
    expect(v2).toBe('2')
  })

  it('correctly tracks changed() freshness', async () => {
    const store = memoryPersist()
    const mockSnap = createMockSnapshot()

    expect(await store.changed(null)).toBe(false)
    expect(await store.changed('1')).toBe(true)

    await store.save(mockSnap, null)
    expect(await store.changed('1')).toBe(false)
    expect(await store.changed(null)).toBe(true)
  })
})

describe('SQLite Persistence (sqlitePersist)', () => {
  it('loads null on initial database state', async () => {
    const store = sqlitePersist(':memory:')
    expect(store.name).toContain('sqlite:')
    const { snap, version } = await store.load()
    expect(snap).toBeNull()
    expect(version).toBeNull()
  })

  it('persists state with consultation cards and sessions across loads', async () => {
    const store = sqlitePersist(':memory:')
    const mockSnap = createMockSnapshot()
    mockSnap.state.consultations = [
      {
        id: 'sess-test-1',
        patientId: 'p1',
        doctorId: 'meera',
        status: 'completed',
        startedAt: 1700000000000,
        startedBy: 'patient',
        durationMs: 45000,
      },
    ]
    mockSnap.state.consultationCards = [
      {
        id: 'card-test-1',
        sessionId: 'sess-test-1',
        patientId: 'p1',
        doctorId: 'meera',
        consultedAt: 1700000000000,
        transcript: 'Doctor and patient dialogue',
        doctorName: 'Dr Meera Iyer',
        doctorSpecialty: 'Cardiology',
        summary: {
          chiefComplaint: 'Morning dizziness',
          symptoms: [{ description: 'Dizziness', duration: '4 days', severity: 'moderate' }],
          observations: ['BP 134/84 mmHg'],
          medicationsDiscussed: [{ name: 'Amlong 5', action: 'adjusted' }],
          plan: ['Reduce dose to 2.5mg'],
          patientSummary: 'Dose reduced.',
        },
      },
    ]

    const v1 = await store.save(mockSnap, null)
    expect(v1).toBe('1')

    const { snap, version } = await store.load()
    expect(version).toBe('1')
    expect(snap?.state.consultations).toHaveLength(1)
    expect(snap?.state.consultationCards).toHaveLength(1)
    expect(snap?.state.consultationCards[0]?.summary.chiefComplaint).toBe('Morning dizziness')
    expect(snap?.sessions['token-doctor-1']?.role).toBe('doctor')
  })

  it('rejects concurrent write conflicts with outdated version', async () => {
    const store = sqlitePersist(':memory:')
    const mockSnap = createMockSnapshot()

    await store.save(mockSnap, null)

    // Stale version update attempt
    const conflict = await store.save(mockSnap, '0')
    expect(conflict).toBeNull()

    // Up-to-date version update
    const v2 = await store.save(mockSnap, '1')
    expect(v2).toBe('2')

    const v3 = await store.save(mockSnap, '2')
    expect(v3).toBe('3')
  })

  it('detects changes correctly with changed()', async () => {
    const store = sqlitePersist(':memory:')
    const mockSnap = createMockSnapshot()

    expect(await store.changed(null)).toBe(false)
    await store.save(mockSnap, null)
    expect(await store.changed('1')).toBe(false)
    expect(await store.changed('0')).toBe(true)
  })
})
