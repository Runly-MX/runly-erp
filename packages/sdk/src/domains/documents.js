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
    listTemplates: (token, query = {}) =>
      request(`/documents/templates${toQueryString(query)}`, {
        headers: withAuthHeaders(token),
      }),

    createTemplate: (payload, token) =>
      request("/documents/templates", {
        method: "POST",
        headers: withAuthHeaders(token),
        body: JSON.stringify(payload),
      }),

    getTemplate: (templateId, token) =>
      request(templatePath(templateId), {
        headers: withAuthHeaders(token),
      }),

    updateTemplate: (templateId, payload, token) =>
      request(templatePath(templateId), {
        method: "PATCH",
        headers: withAuthHeaders(token),
        body: JSON.stringify(payload),
      }),

    setTemplateEnabled: (templateId, enabledOrPayload, token, updatedAt) =>
      request(`${templatePath(templateId)}/enabled`, {
        method: "PATCH",
        headers: withAuthHeaders(token),
        body: JSON.stringify(
          typeof enabledOrPayload === "boolean"
            ? { enabled: enabledOrPayload, updatedAt }
            : enabledOrPayload,
        ),
      }),

    listVersions: (templateId, token) =>
      request(`${templatePath(templateId)}/versions`, {
        headers: withAuthHeaders(token),
      }),

    createVersion: (templateId, payload, token) =>
      request(`${templatePath(templateId)}/versions`, {
        method: "POST",
        headers: withAuthHeaders(token),
        body: JSON.stringify(payload),
      }),

    updateVersion: (templateId, versionId, payload, token) =>
      request(
        `${templatePath(templateId)}/versions/${encodeURIComponent(versionId)}`,
        {
          method: "PATCH",
          headers: withAuthHeaders(token),
          body: JSON.stringify(payload),
        },
      ),

    publishVersion: (templateId, versionId, payload, token) =>
      request(
        `${templatePath(templateId)}/versions/${encodeURIComponent(versionId)}/publish`,
        {
          method: "POST",
          headers: withAuthHeaders(token),
          body: JSON.stringify(payload),
        },
      ),

    // ---- Template engine (kinds, file templates, generate) ----
    listKinds: (token) =>
      request("/documents/kinds", { headers: withAuthHeaders(token) }),

    listFileTemplates: (token, query = {}) =>
      request(`/documents/templates${toQueryString(query)}`, {
        headers: withAuthHeaders(token),
      }),

    // fields: { kind, file, scopeKey?, name?, isDefault?, publish? }
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

    getProviderSchema: (sourceType, token) =>
      request(
        `/documents/providers/${encodeURIComponent(sourceType)}/schema`,
        { headers: withAuthHeaders(token) },
      ),

    preview: (templateId, payload, token) =>
      requestBlob(`${templatePath(templateId)}/preview`, {
        method: "POST",
        headers: withAuthHeaders(token, {
          "Content-Type": "application/json",
        }),
        body: JSON.stringify(payload),
      }),

    generate: (templateId, payload, token) =>
      request(`${templatePath(templateId)}/generate`, {
        method: "POST",
        headers: withAuthHeaders(token),
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
