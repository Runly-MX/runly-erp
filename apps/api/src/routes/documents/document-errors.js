// Errors shared by the documents hub (kinds, file templates, engine, routes).
export class DocumentProviderError extends Error {
  constructor(message, status = 400, code = "document_provider_error") {
    super(message);
    this.name = "DocumentProviderError";
    this.status = status;
    this.code = code;
  }
}

export class DocumentTemplateServiceError extends Error {
  constructor(message, status = 400, code = "document_template_error", details) {
    super(message);
    this.name = "DocumentTemplateServiceError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
