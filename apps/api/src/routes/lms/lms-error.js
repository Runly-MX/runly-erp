// Kept apart so lms-core and lms-eval-core can share it without an import cycle.
export class LmsError extends Error {
  constructor(message, status = 400, code = null) {
    super(message)
    this.name = 'LmsError'
    this.status = status
    this.code = code
  }
}
