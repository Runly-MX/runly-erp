import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, mkdtemp, mkdir, copyFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import nodemailer from 'nodemailer'
import { createSmtpService } from '../smtp-service.js'
import { buildCompanyDeletionEmail } from '../email-templates.js'

const root = fileURLToPath(new URL('../../../../../', import.meta.url))
const logo = 'apps/desktop/public/runly/runly-logo-horizontal-light.png'

for (const image of ['api', 'worker']) {
  test(`${image} image packages the inline logo and renders deletion mail without SMTP`, async t => {
    const directory = await mkdtemp(join(tmpdir(), 'runly-mail-assets-'))
    try {
      const dockerfile = await readFile(join(root, `infra/docker/${image}.Dockerfile`), 'utf8')
      // Reproduce the explicit asset COPY in an otherwise empty image root.
      const copy = dockerfile.split(/\r?\n/).find(line => line === `COPY ${logo} ${logo}`)
      assert.ok(copy, `${image} must include the SMTP inline asset`)
      await mkdir(dirname(join(directory, logo)), { recursive: true })
      await copyFile(join(root, logo), join(directory, logo))
      const renderer = nodemailer.createTransport({ streamTransport: true, buffer: true })
      let message
      t.mock.method(nodemailer, 'createTransport', () => ({
        sendMail: async mail => {
          const rendered = await renderer.sendMail({ ...mail, attachments: mail.attachments.map(asset => ({
            ...asset, path: join(directory, relative(root, asset.path)),
          })) })
          message = rendered.message.toString()
          return rendered
        },
      }))
      const prisma = { instanceConfig: { findMany: async () => [
        { key: 'smtp.host', value: 'smtp.example.test' },
        { key: 'smtp.user', value: 'sender@example.test' },
      ] } }
      await createSmtpService({ prisma }).sendEmail({
        to: 'member@example.test',
        ...buildCompanyDeletionEmail({ companyName: 'Example', purgeAfter: '2099-01-01' }),
      })
      assert.match(message, /Content-ID: <runly-email-logo@runly.mx>/)
      assert.match(message, /Content-Type: image\/png/)
    } finally {
      if (dirname(resolve(directory)) !== resolve(tmpdir())) throw new Error('Unexpected test directory')
      await rm(directory, { recursive: true, force: true })
    }
  })
}
