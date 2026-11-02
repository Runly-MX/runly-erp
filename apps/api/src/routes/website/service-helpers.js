export class WebsiteServiceError extends Error {
  constructor(message, status = 500, code = 'website_error') {
    super(message)
    this.name = 'WebsiteServiceError'
    this.status = status
    this.code = code
  }
}

export function notFound(entity) {
  return new WebsiteServiceError(`${entity} no encontrado.`, 404, 'resource_not_found')
}

export function conflict(message) {
  return new WebsiteServiceError(message, 409)
}
