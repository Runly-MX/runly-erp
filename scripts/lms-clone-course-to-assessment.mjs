// Controlled clone of a runly.lms course into a standalone evaluation (spec 2026-11-21 section 10).
// The source course, its share link, enrollments, attempts and submissions are never written.
//
//   Dry run (default, read-only):  node --env-file=.env scripts/lms-clone-course-to-assessment.mjs --source <courseId> [--map map.json] [--write-map map.json]
//   Apply (one transaction):       node --env-file=.env scripts/lms-clone-course-to-assessment.mjs --source <courseId> --apply [--map map.json] [--out report.json]
//   Rollback (archive the copy):   node --env-file=.env scripts/lms-clone-course-to-assessment.mjs --rollback <assessmentId>
//
// --apply creates a DRAFT evaluation (same FileAsset ids, no file copies), reads it back inside the
// transaction and aborts if its content checksum differs from the source plan. The source fingerprint is
// taken before and after. Prints titles and counts only: no candidate data.
import { readFileSync, writeFileSync } from 'node:fs'
import pkg from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import { activityPoints, canonical, contentChecksum, defaultMap, planClone, sha256 } from '../apps/api/src/routes/lms/lms-clone-core.js'

const args = process.argv.slice(2)
const flag = (name) => args.includes(`--${name}`)
const value = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const fail = (message, code = 1) => { console.error(`ERROR: ${message}`); process.exit(code) }

const url = process.env.DIRECT_URL || process.env.DATABASE_URL
if (!url) fail('DIRECT_URL or DATABASE_URL is required.', 2)
const sourceId = value('source')
const rollbackId = value('rollback')
if (!rollbackId && !UUID.test(sourceId ?? '')) fail('Usage: --source <courseId> [--apply] [--map file] [--write-map file] [--out file] | --rollback <assessmentId>', 2)
if (rollbackId && !UUID.test(rollbackId)) fail('--rollback needs an evaluation id.', 2)

const pool = new pg.Pool({ connectionString: url, max: 2 })
const prisma = new pkg.PrismaClient({ adapter: new PrismaPg(pool) })
const done = async (code = 0) => { await prisma.$disconnect(); await pool.end(); process.exit(code) }

// ---- rollback: archive a copy that nobody has taken yet ---------------------------------
if (rollbackId) {
  const copy = await prisma.lmsCourse.findFirst({ where: { id: rollbackId, kind: 'assessment' } })
  if (!copy?.settings?.sourceCourseId) { console.error('ERROR: not an evaluation created by this script.'); await done(1) }
  const sessions = await prisma.lmsAssessmentSession.count({ where: { courseId: copy.id } })
  if (sessions) { console.error(`REFUSED: the evaluation has ${sessions} session(s); archive it from the app instead.`); await done(1) }
  await prisma.lmsCourse.update({ where: { id: copy.id }, data: { enabled: false, status: 'archived' } })
  console.log(`Rolled back: evaluation ${copy.id} archived (enabled = false). Source ${copy.settings.sourceCourseId} untouched.`)
  await done(0)
}

// ---- read the source -----------------------------------------------------------------
async function readSource(db, id) {
  const course = await db.lmsCourse.findFirst({ where: { id } })
  if (!course) throw new Error('The source course does not exist.')
  const [sections, allLessons] = await Promise.all([
    db.lmsSection.findMany({ where: { courseId: id }, orderBy: { position: 'asc' } }),
    db.lmsLesson.findMany({ where: { courseId: id }, orderBy: { position: 'asc' } }),
  ])
  const lessonIds = allLessons.map((l) => l.id)
  const [allQuestions, resources, enrollments, attempts, submissions] = await Promise.all([
    db.lmsQuizQuestion.findMany({ where: { lessonId: { in: lessonIds } }, orderBy: { position: 'asc' } }),
    db.lmsLessonResource.findMany({ where: { lessonId: { in: lessonIds } }, orderBy: { position: 'asc' } }),
    db.lmsEnrollment.aggregate({ where: { courseId: id }, _count: { _all: true }, _max: { updatedAt: true } }),
    db.lmsQuizAttempt.aggregate({ where: { lessonId: { in: lessonIds } }, _count: { _all: true }, _max: { updatedAt: true } }),
    db.lmsSubmission.aggregate({ where: { lessonId: { in: lessonIds } }, _count: { _all: true }, _max: { updatedAt: true } }),
  ])
  const activity = { enrollments: enrollments._count._all, attempts: attempts._count._all, submissions: submissions._count._all }
  // Content this script must leave untouched (disabled rows included). Learner activity can legitimately
  // move while the script runs on a live instance, so it is fingerprinted apart and only reported.
  const fingerprint = sha256(JSON.parse(JSON.stringify({ course, sections, allLessons, allQuestions, resources })))
  const activityFingerprint = sha256(JSON.parse(JSON.stringify({ enrollments, attempts, submissions })))
  return {
    course, sections, resources, activity, fingerprint, activityFingerprint,
    lessons: allLessons.filter((l) => l.enabled),
    questions: allQuestions.filter((q) => q.enabled),
  }
}

let src
try { src = await readSource(prisma, sourceId) } catch (error) { console.error(`ERROR: ${error.message}`); await done(1) }
let map = {}
if (value('map')) map = JSON.parse(readFileSync(value('map'), 'utf8'))
let plan
try { plan = planClone(src, map) } catch (error) { console.error(`ERROR (mapping): ${error.message}`); await done(1) }

const fileIds = [...new Set(plan.activities.flatMap((a) => a.resources.map((r) => r.fileId)))]
const files = await prisma.fileAsset.findMany({ where: { id: { in: fileIds } }, select: { id: true, originalName: true, mimeType: true, sizeBytes: true, enabled: true } })
const fileById = new Map(files.map((f) => [f.id, f]))
const missingFiles = fileIds.filter((id) => !fileById.get(id)?.enabled)

// ---- dry-run report ------------------------------------------------------------------
console.log(`Source course ${src.course.id} · status ${src.course.status} · ${src.lessons.length} lessons · ${src.questions.length} questions`)
console.log(`Learner activity (kept in the course): ${src.activity.enrollments} enrollments, ${src.activity.attempts} quiz attempts, ${src.activity.submissions} submissions`)
console.log(`Source fingerprint ${src.fingerprint}`)
console.log(`\nPlanned evaluation "${plan.assessment.title}" (draft) · ${plan.assessment.settings.timeLimitMinutes} min · ${plan.assessment.settings.maxSessions} session(s) · ${plan.totalPoints} points`)
for (const [i, a] of plan.activities.entries()) {
  console.log(`  ${i + 1}. [${a.type}] ${a.title} — ${activityPoints(a)} points`)
  if (a.kind === 'quiz') console.log(`     ${a.questions.length} questions (${[...new Set(a.questions.map((q) => q.kind))].join(', ')}); points ${a.questions.map((q) => q.points).join(' + ')}`)
  else console.log(`     files ${a.settings.acceptedTypes?.join(', ') ?? 'any'} · up to ${a.settings.maxFiles} · rubric ${a.settings.rubric.length ? a.settings.rubric.map((c) => c.points).join(' + ') : 'none (points by hand)'}`)
  for (const r of a.resources) { const f = fileById.get(r.fileId); console.log(`     material: ${r.title ?? '(no title)'} → ${f ? `${f.originalName} · ${f.mimeType} · ${f.sizeBytes} B${f.enabled ? '' : ' · DISABLED'}` : 'FILE NOT FOUND'}`) }
  for (const adj of a.adjustments) console.log(`     adjustment: ${adj.setting} ${canonical(adj.from)} → ${canonical(adj.to)}`)
}
for (const s of plan.skipped) console.log(`  not carried: [${s.kind}] ${s.title} (${s.lessonId})`)
console.log(`Content checksum ${plan.checksum}`)
if (missingFiles.length) console.log(`WARNING: ${missingFiles.length} material file(s) missing or disabled.`)
if (value('write-map')) { writeFileSync(value('write-map'), JSON.stringify(defaultMap(plan), null, 2)); console.log(`Mapping written to ${value('write-map')} (edit it and pass --map).`) }

if (!flag('apply')) { console.log('\nDry run: nothing was written.'); await done(0) }
if (missingFiles.length) { console.error('REFUSED: fix the missing material before --apply.'); await done(1) }

// ---- apply: one transaction, verified before commit ---------------------------------------
const { course } = src
let created
try {
  created = await prisma.$transaction(async (tx) => {
    const row = await tx.lmsCourse.create({
      data: { companyId: course.companyId, kind: 'assessment', status: 'draft', title: plan.assessment.title, summary: plan.assessment.summary, description: plan.assessment.description, settings: plan.assessment.settings },
    })
    for (const [index, a] of plan.activities.entries()) {
      const lesson = await tx.lmsLesson.create({
        data: { companyId: course.companyId, courseId: row.id, sectionId: null, kind: a.kind, title: a.title, body: a.body, settings: a.settings, required: true, position: index + 1 },
      })
      if (a.questions.length) {
        await tx.lmsQuizQuestion.createMany({ data: a.questions.map((q) => ({ companyId: course.companyId, lessonId: lesson.id, kind: q.kind, prompt: q.prompt, options: q.options ?? [], explanation: q.explanation, points: q.points, position: q.position })) })
      }
      if (a.resources.length) {
        await tx.lmsLessonResource.createMany({ data: a.resources.map((r, position) => ({ companyId: course.companyId, lessonId: lesson.id, fileId: r.fileId, title: r.title, position })) })
      }
    }
    // Read the copy back and compare its content with the plan built from the source.
    const lessons = await tx.lmsLesson.findMany({ where: { courseId: row.id }, orderBy: { position: 'asc' } })
    const copy = await Promise.all(lessons.map(async (l) => ({
      ...l,
      questions: await tx.lmsQuizQuestion.findMany({ where: { lessonId: l.id }, orderBy: { position: 'asc' } }),
      resources: await tx.lmsLessonResource.findMany({ where: { lessonId: l.id }, orderBy: { position: 'asc' } }),
    })))
    const checksum = contentChecksum(copy)
    if (checksum !== plan.checksum) throw new Error(`content checksum mismatch (${checksum} != ${plan.checksum}); rolled back`)
    return { id: row.id, lessons: lessons.map((l) => l.id), checksum }
  }, { maxWait: 20_000, timeout: 120_000 })
} catch (error) {
  console.error(`ERROR: ${error.message}. Nothing was written.`)
  await done(1)
}

const after = await readSource(prisma, sourceId)
const untouched = after.fingerprint === src.fingerprint
const report = {
  createdAt: new Date().toISOString(), sourceCourseId: course.id, assessmentId: created.id, status: 'draft',
  totalPoints: plan.totalPoints, contentChecksum: created.checksum, sourceFingerprintBefore: src.fingerprint, sourceFingerprintAfter: after.fingerprint, sourceUntouched: untouched,
  learnerActivityChangedDuringRun: after.activityFingerprint !== src.activityFingerprint, learnerActivity: after.activity,
  activities: plan.activities.map((a, i) => ({ id: created.lessons[i], from: a.from, type: a.type, title: a.title, points: activityPoints(a), questions: a.questions.length, material: a.resources.map((r) => r.fileId), adjustments: a.adjustments })),
  skipped: plan.skipped, map: defaultMap(plan),
}
const out = value('out') ?? `lms-clone-report-${course.id.slice(0, 8)}-${Date.now()}.json`
writeFileSync(out, JSON.stringify(report, null, 2))
console.log(`\nCreated draft evaluation ${created.id} · checksum verified · source ${untouched ? 'untouched' : 'CHANGED DURING THE RUN (check it)'} · report ${out}`)
console.log('Next, in the app: Compartir (registro y aviso), Evaluadores, then Publicar.')
await done(untouched ? 0 : 1)
