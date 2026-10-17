import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildThreads, canReview, normalizeAnnouncementInput, normalizeCommentBody, normalizeCommentPatch,
  normalizeReviewInput, normalizeReviewModeration, ratingAggregate, replyRecipients, rootIdFor,
} from '../lms-social-core.js'

const at = (minute) => new Date(Date.UTC(2026, 9, 17, 10, minute))
const author = (kind, id) => ({ kind, id, displayName: id, avatarUrl: null })
function row(id, { parentId = null, learner = null, profile = null, minute = 0, deleted = false, pinned = false } = {}) {
  return {
    id, lessonId: 'l1', parentId, authorLearnerId: learner, authorProfileId: profile, body: `body ${id}`,
    isInstructor: Boolean(profile), resolved: false, pinned, editedAt: null, deletedAt: deleted ? at(59) : null, createdAt: at(minute),
    author: learner ? author('learner', learner) : author('staff', profile),
  }
}

test('normalizeCommentBody trims and enforces 1..5000', () => {
  assert.equal(normalizeCommentBody('  hola  '), 'hola')
  assert.throws(() => normalizeCommentBody('   '), (e) => e.status === 400)
  assert.throws(() => normalizeCommentBody(null), (e) => e.status === 400)
  assert.equal(normalizeCommentBody('a'.repeat(5000)).length, 5000)
  assert.throws(() => normalizeCommentBody('a'.repeat(5001)), (e) => e.status === 400)
})

test('rootIdFor collapses reply-to-reply onto the root', () => {
  assert.equal(rootIdFor(null), null)
  assert.equal(rootIdFor({ id: 'r1', parentId: null }), 'r1')
  assert.equal(rootIdFor({ id: 'c2', parentId: 'r1' }), 'r1')
})

test('buildThreads orders roots pinned first then newest, replies oldest first', () => {
  const rows = [
    row('old', { learner: 'L1', minute: 1 }),
    row('new', { learner: 'L2', minute: 5 }),
    row('pin', { profile: 'P9', minute: 0, pinned: true }),
    row('r2', { parentId: 'old', profile: 'P9', minute: 8 }),
    row('r1', { parentId: 'old', learner: 'L2', minute: 7 }),
  ]
  const threads = buildThreads(rows, { learnerId: 'L1', profileId: 'P1' })
  assert.deepEqual(threads.map((t) => t.id), ['pin', 'new', 'old'])
  assert.deepEqual(threads[2].replies.map((r) => r.id), ['r1', 'r2'])
  assert.equal(threads[2].replies[0].replies, undefined)
  assert.equal(threads[2].createdAt, at(1).toISOString())
})

test('buildThreads drops deleted roots without visible replies and nulls deleted bodies', () => {
  const rows = [
    row('gone', { learner: 'L1', deleted: true, minute: 1 }),
    row('kept', { learner: 'L1', deleted: true, minute: 2 }),
    row('reply', { parentId: 'kept', learner: 'L2', minute: 3 }),
    row('lonely', { learner: 'L1', minute: 4 }),
    row('deadReply', { parentId: 'lonely', learner: 'L2', minute: 5, deleted: true }),
  ]
  const threads = buildThreads(rows, { learnerId: 'L1', profileId: 'P1' })
  assert.deepEqual(threads.map((t) => t.id), ['lonely', 'kept'])
  const kept = threads[1]
  assert.equal(kept.deleted, true)
  assert.equal(kept.body, null)
  assert.equal(kept.canEdit, false)
  assert.equal(kept.canDelete, false)
  assert.deepEqual(threads[0].replies, [])
})

test('buildThreads sets canEdit/canDelete by author, manager and read-only', () => {
  const rows = [row('mine', { learner: 'L1' }), row('staff', { profile: 'P2', minute: 1 })]
  let [staff, mine] = buildThreads(rows, { learnerId: 'L1', profileId: 'P1' })
  assert.deepEqual([mine.canEdit, mine.canDelete, staff.canEdit, staff.canDelete], [true, true, false, false])
  ;[staff, mine] = buildThreads(rows, { learnerId: null, profileId: 'P2', canManage: true })
  assert.deepEqual([staff.canEdit, staff.canDelete, mine.canEdit, mine.canDelete], [true, true, false, true])
  const own = buildThreads(rows, { learnerId: 'L1', profileId: 'P1', readOnly: true, onlyOwn: true })
  assert.deepEqual(own.map((t) => [t.id, t.canEdit, t.canDelete]), [['mine', false, false]])
})

test('normalizeCommentPatch enforces author, staff and root rules', () => {
  const root = { isRoot: true }
  assert.deepEqual(normalizeCommentPatch({ body: ' x ' }, { ...root, isAuthor: true }), { body: 'x' })
  assert.throws(() => normalizeCommentPatch({ body: 'x' }, { ...root, isStaff: true }), (e) => e.status === 403)
  assert.deepEqual(normalizeCommentPatch({ pinned: true, resolved: true }, { ...root, isStaff: true }), { pinned: true, resolved: true })
  assert.throws(() => normalizeCommentPatch({ pinned: true }, { ...root, isAuthor: true }), (e) => e.status === 403)
  assert.deepEqual(normalizeCommentPatch({ resolved: true }, { ...root, isAuthor: true }), { resolved: true })
  assert.throws(() => normalizeCommentPatch({ resolved: true }, { isRoot: false, isStaff: true }), (e) => e.status === 400)
  assert.throws(() => normalizeCommentPatch({}, { ...root, isAuthor: true }), (e) => e.status === 400)
})

test('canReview needs completion or 30 % progress, never dropped', () => {
  assert.equal(canReview(null), false)
  assert.equal(canReview({ status: 'active', progressPct: 29 }), false)
  assert.equal(canReview({ status: 'active', progressPct: 30 }), true)
  assert.equal(canReview({ status: 'completed', progressPct: 0 }), true)
  assert.equal(canReview({ status: 'dropped', progressPct: 90 }), false)
})

test('ratingAggregate ignores hidden reviews and rounds to 2 decimals', () => {
  assert.deepEqual(ratingAggregate([]), { ratingAvg: null, ratingCount: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } })
  const agg = ratingAggregate([{ rating: 5 }, { rating: 4 }, { rating: 4 }, { rating: 1, hidden: true }])
  assert.deepEqual(agg, { ratingAvg: 4.33, ratingCount: 3, distribution: { 1: 0, 2: 0, 3: 0, 4: 2, 5: 1 } })
})

test('review, moderation and announcement normalizers', () => {
  assert.deepEqual(normalizeReviewInput({ rating: 4, body: '  bien ' }), { rating: 4, body: 'bien' })
  assert.deepEqual(normalizeReviewInput({ rating: '5' }), { rating: 5, body: null })
  assert.throws(() => normalizeReviewInput({ rating: 6 }), (e) => e.status === 400)
  assert.throws(() => normalizeReviewInput({ rating: 3.5 }), (e) => e.status === 400)
  assert.throws(() => normalizeReviewInput({ rating: 3, body: 'a'.repeat(2001) }), (e) => e.status === 400)
  assert.deepEqual(normalizeReviewModeration({ hidden: true, replyBody: '  ' }), { hidden: true, replyBody: null })
  assert.throws(() => normalizeReviewModeration({}), (e) => e.status === 400)
  assert.deepEqual(normalizeAnnouncementInput({ title: ' T ', body: ' B ' }), { title: 'T', body: 'B' })
  assert.deepEqual(normalizeAnnouncementInput({ body: 'B2' }, { partial: true }), { body: 'B2' })
  assert.throws(() => normalizeAnnouncementInput({ title: 'T', body: '' }), (e) => e.status === 400)
})

test('replyRecipients: root author and earlier repliers, deduped, actor and contacts excluded', () => {
  const learner = (id, userProfileId) => ({ authorLearnerId: id, authorProfileId: null, authorLearner: { userProfileId } })
  const staff = (id) => ({ authorLearnerId: null, authorProfileId: id })
  const root = learner('L1', 'P1')
  const replies = [staff('P2'), learner('L1', 'P1'), learner('L3', null), staff('ACTOR'), { ...staff('P4'), deletedAt: new Date() }]
  assert.deepEqual(replyRecipients({ root, replies, actor: 'ACTOR' }), ['P1', 'P2'])
  assert.deepEqual(replyRecipients({ root: learner('L1', 'ACTOR'), replies: [], actor: 'ACTOR' }), [])
})
