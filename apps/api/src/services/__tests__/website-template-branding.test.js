import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyTemplateBranding } from '../website-template-branding.js'

const doc = () => ({ blocks: {
  navbar: { type: 'NavbarBlock', props: { brand: 'Empresa' } },
  footer: { type: 'FooterBlock', props: { brand: 'Empresa', copyright: '© 2026 Empresa. Todos los derechos reservados.' } },
  hero: { type: 'HeadingBlock', props: { text: 'Empresa' } },
} })

test('brand name and logo reach the navbar, the name reaches the footer, other blocks stay untouched', () => {
  const result = applyTemplateBranding(doc(), { name: 'ServiTech', logoFileId: 'abc', logoHeight: 50 })
  assert.equal(result.blocks.navbar.props.brand, 'ServiTech')
  assert.equal(result.blocks.navbar.props.logoSrc, 'file:abc')
  assert.equal(result.blocks.navbar.props.logoHeight, '48')
  assert.equal(result.blocks.footer.props.brand, 'ServiTech')
  assert.equal(result.blocks.footer.props.copyright, '© 2026 ServiTech. Todos los derechos reservados.')
  assert.equal(result.blocks.footer.props.logoSrc, undefined)
  assert.equal(result.blocks.hero.props.text, 'Empresa')
})

test('the Mercado header takes the logo without a logoHeight prop it does not declare', () => {
  const result = applyTemplateBranding({ blocks: { header: { type: 'MercadoHeaderBlock', props: { brand: 'Brote', logoSrc: '' } } } }, { name: 'ServiTech', logoFileId: 'abc' })
  assert.deepEqual(result.blocks.header.props, { brand: 'ServiTech', logoSrc: 'file:abc' })
})

test('without a logo the navbar keeps no image', () => {
  const result = applyTemplateBranding(doc(), { name: 'ServiTech' })
  assert.equal(result.blocks.navbar.props.logoSrc, undefined)
})
