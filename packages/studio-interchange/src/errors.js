import { StudioError } from './studio/document.js'

// Stable machine codes (the contract). Messages are Spanish, for people.
export const REASONS = Object.freeze([
  'zip_invalid', 'zip_limit_exceeded', 'zip_unsafe_entry', 'manifest_invalid', 'format_unsupported', 'checksum_mismatch', 'undeclared_entry',
  'image_invalid', 'image_limit', 'font_unavailable', 'license_forbidden', 'document_invalid', 'page_count_mismatch',
])

// Still a StudioError with the historical HTTP code, so the existing Studio
// services keep answering exactly as before; `reason` is the stable diagnostic.
export class PackageError extends StudioError {
  constructor(reason, message, extra = {}) {
    super(message ?? 'El paquete Studio no es válido.', 400, 'STUDIO_PACKAGE_INVALID')
    this.reason = reason
    Object.assign(this, extra)
  }
}
export const packageError = (reason, message, extra) => new PackageError(reason, message, extra)
