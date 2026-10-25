export function createDocumentsDomain({
  request,
  requestBlob,
  withAuthHeaders,
  toQueryString,
}) {
  const templatePath = (templateId) =>
    `/documents/templates/${encodeURIComponent(templateId)}`;
  const versionPath = (templateId, versionId) =>
    `/documents/templates/${encodeURIComponent(templateId)}/versions/${encodeURIComponent(versionId)}`;
  const generatedPath = (generatedId) =>
    `/documents/generated/${encodeURIComponent(generatedId)}`;

  return {
    // ---- Template engine (kinds, file templates, generate) ----
    listKinds: (token) =>
      request("/documents/kinds", { headers: withAuthHeaders(token) }),

    listFileTemplates: (token, query = {}) =>
      request(`/documents/templates${toQueryString(query)}`, {
        headers: withAuthHeaders(token),
      }),

    // fields: { kind, file, scopeKey?, name?, isDefault?, publish?, visibility? }
    uploadTemplate: (fields, token) => {
      const formData = new FormData();
      Object.entries(fields).forEach(([key, value]) => {
        if (value !== undefined && value !== null) formData.append(key, value);
      });
      return request("/documents/templates/upload", {
        method: "POST",
        headers: withAuthHeaders(token),
        body: formData,
      });
    },

    createBlankTemplate: (payload, token) =>
      request("/documents/templates/blank", {
        method: "POST",
        headers: withAuthHeaders(token),
        body: JSON.stringify(payload),
      }),

    suggestTemplate: (templateId, versionId, token) =>
      request(`${versionPath(templateId, versionId)}/suggest`, {
        method: "POST",
        headers: withAuthHeaders(token),
      }),

    // file omitted: rescans the current file (after editing it in the office editor).
    replaceTemplateFile: (templateId, versionId, file, token) => {
      const formData = new FormData();
      if (file) formData.append("file", file);
      return request(`${versionPath(templateId, versionId)}/file`, {
        method: "PUT",
        headers: withAuthHeaders(token),
        body: formData,
      });
    },

    // payload: { mapping?, layout? }
    saveTemplateMapping: (templateId, versionId, payload, token) =>
      request(`${versionPath(templateId, versionId)}/mapping`, {
        method: "PATCH",
        headers: withAuthHeaders(token),
        body: JSON.stringify(payload),
      }),

    publishFileTemplate: (templateId, versionId, token) =>
      request(`${versionPath(templateId, versionId)}/publish`, {
        method: "POST",
        headers: withAuthHeaders(token),
        body: JSON.stringify({}),
      }),

    setTemplateDefault: (templateId, token) =>
      request(`${templatePath(templateId)}/default`, {
        method: "PATCH",
        headers: withAuthHeaders(token),
      }),

    // visibility: 'personal' (only the owner) | 'company' (shared with the company)
    setTemplateVisibility: (templateId, visibility, token) =>
      request(`${templatePath(templateId)}/visibility`, {
        method: "PATCH",
        headers: withAuthHeaders(token),
        body: JSON.stringify({ visibility }),
      }),

    getTemplateFile: (templateId, token, query = {}) =>
      request(`${templatePath(templateId)}/file${toQueryString(query)}`, {
        headers: withAuthHeaders(token),
      }),

    deleteTemplate: (templateId, token) =>
      request(templatePath(templateId), {
        method: "DELETE",
        headers: withAuthHeaders(token),
      }),

    // payload: { kind, templateId?, scopeKey?, data? | sourceId?, images?, output? }
    generateDocument: (payload, token) =>
      request("/documents/generate", {
        method: "POST",
        headers: withAuthHeaders(token),
        body: JSON.stringify(payload),
      }),

    previewDocument: (payload, token) =>
      requestBlob("/documents/preview", {
        method: "POST",
        headers: withAuthHeaders(token, {
          "Content-Type": "application/json",
        }),
        body: JSON.stringify(payload),
      }),

    listGenerated: (token, query = {}) =>
      request(`/documents/generated${toQueryString(query)}`, {
        headers: withAuthHeaders(token),
      }),

    getGenerated: (generatedId, token) =>
      request(generatedPath(generatedId), {
        headers: withAuthHeaders(token),
      }),

    getGeneratedDownload: (generatedId, token) =>
      request(`${generatedPath(generatedId)}/download`, {
        headers: withAuthHeaders(token),
      }),

    setGeneratedEnabled: (generatedId, enabledOrPayload, token) =>
      request(`${generatedPath(generatedId)}/enabled`, {
        method: "PATCH",
        headers: withAuthHeaders(token),
        body: JSON.stringify(
          typeof enabledOrPayload === "boolean"
            ? { enabled: enabledOrPayload }
            : enabledOrPayload,
        ),
      }),
  };
}
