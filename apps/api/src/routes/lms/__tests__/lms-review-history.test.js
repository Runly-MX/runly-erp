import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createLmsReviewService } from '../lms-review-service.js'

const COMPANY = '01a104ec-6405-7281-87f3-5f80cef7a306'
const ctx = (id) => ({ lesson: { id: `l-${id}`, title: `Lección ${id}` }, enrollment: { learner: { id: 'u1', displayName: 'Ana', userProfileId: 'p1' }, course: { id: 'c1', title: 'Curso' } } })

function fakePrisma(calls) {
  return {
    lmsSubmission: { findMany: async (args) => { calls.submission = args; return [{ id: 's1', status: 'returned', grade: 60, late: false, fileIds: ['f'], gradedById: 'g1', gradedAt: new Date('2026-10-10'), submittedAt: new Date('2026-10-01'), ...ctx('s') }] } },
    lmsQuizAttempt: { findMany: async (args) => { calls.attempt = args; return [{ id: 'a1', status: 'graded', scorePct: 90, passed: true, gradedById: 'g1', gradedAt: new Date('2026-10-12'), submittedAt: new Date('2026-10-02'), ...ctx('a') }] } },
    userProfile: { findMany: async () => [{ id: 'g1', displayName: 'Profe' }] },
  }
}

test('review history lists graded work newest first with result and grader', async () => {
  const calls = {}
  const review = createLmsReviewService({ prisma: fakePrisma(calls), notifier: null })
  const items = await review.queue(COMPANY, { view: 'history' })
  assert.deepEqual(calls.submission.where.status, { in: ['approved', 'returned'] })
  assert.deepEqual(calls.attempt.where.gradedById, { not: null })
  assert.deepEqual(items.map((i) => i.id), ['a1', 's1'])
  assert.equal(items[0].grade, 90)
  assert.equal(items[0].passed, true)
  assert.equal(items[1].passed, false)
  assert.equal(items[1].graderName, 'Profe')
})

test('default review queue stays the pending list without history fields', async () => {
  const calls = {}
  const review = createLmsReviewService({ prisma: fakePrisma(calls), notifier: null })
  const items = await review.queue(COMPANY, {})
  assert.equal(calls.submission.where.status, 'submitted')
  assert.equal(items[0].gradedAt, undefined)
})
