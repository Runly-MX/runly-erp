const id = (value) => encodeURIComponent(value)

// Public guest client for /public/lms/share/:shareToken/*. Every call is online only.
function createGuestApi(request) {
  const base = (shareToken) => `/public/lms/share/${id(shareToken)}`
  const call = (method, path, guestToken, data) => request(path, {
    method,
    onlineOnly: true,
    headers: guestToken ? { Authorization: `Guest ${guestToken}` } : {},
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  })
  return {
    getCourse: (shareToken) => call('GET', base(shareToken)),
    join: (shareToken, data, guestToken) => call('POST', `${base(shareToken)}/join`, guestToken, data ?? {}),
    // Invite-only links: { i: linkToken } or { email }, plus { code }; the first
    // entry answers { needsProfile } until { name, answers } come along.
    access: (shareToken, data) => call('POST', `${base(shareToken)}/access`, null, data ?? {}),
    me: (shareToken, guestToken) => call('GET', `${base(shareToken)}/me`, guestToken),
    openLesson: (shareToken, lessonId, guestToken) => call('GET', `${base(shareToken)}/lessons/${id(lessonId)}`, guestToken),
    saveProgress: (shareToken, lessonId, data, guestToken) => call('POST', `${base(shareToken)}/lessons/${id(lessonId)}/progress`, guestToken, data ?? {}),
    getQuiz: (shareToken, lessonId, guestToken) => call('GET', `${base(shareToken)}/lessons/${id(lessonId)}/quiz`, guestToken),
    startAttempt: (shareToken, lessonId, guestToken) => call('POST', `${base(shareToken)}/lessons/${id(lessonId)}/attempts`, guestToken, {}),
    getAttempt: (shareToken, attemptId, guestToken) => call('GET', `${base(shareToken)}/attempts/${id(attemptId)}`, guestToken),
    saveAnswers: (shareToken, attemptId, answers, guestToken) => call('PUT', `${base(shareToken)}/attempts/${id(attemptId)}/answers`, guestToken, { answers }),
    submitAttempt: (shareToken, attemptId, answers, guestToken) => call('POST', `${base(shareToken)}/attempts/${id(attemptId)}/submit`, guestToken, answers === undefined ? {} : { answers }),
    // Assignments (when the link allows them). data: { text, fileIds }.
    listSubmissions: (shareToken, lessonId, guestToken) => call('GET', `${base(shareToken)}/lessons/${id(lessonId)}/submissions`, guestToken),
    submitAssignment: (shareToken, lessonId, data, guestToken) => call('POST', `${base(shareToken)}/lessons/${id(lessonId)}/submissions`, guestToken, data ?? {}),
    // Submission files: presign ({ fileName, mimeType, sizeBytes }) -> PUT uploadUrl -> confirm.
    presignUpload: (shareToken, data, guestToken) => call('POST', `${base(shareToken)}/uploads/presign`, guestToken, data ?? {}),
    confirmUpload: (shareToken, fileId, guestToken) => call('POST', `${base(shareToken)}/uploads/${id(fileId)}/confirm`, guestToken, {}),
  }
}

export function createLmsDomain({ request, requestBlob, withAuthHeaders, toQueryString }) {
  const send = (method, path, data, token) => request(path, {
    method,
    headers: withAuthHeaders(token),
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  })
  const blob = (path, token) => requestBlob(path, { headers: withAuthHeaders(token) })
  return {
    // Learner
    getCatalog: (token) => send('GET', '/lms/catalog', undefined, token),
    getMyCourses: (token) => send('GET', '/lms/my/courses', undefined, token),
    enroll: (courseId, token) => send('POST', `/lms/courses/${id(courseId)}/enroll`, {}, token),
    // options.preview: the course author's preview (ignores their own enrollment).
    getOutline: (courseId, token, options = {}) => send('GET', `/lms/learn/${id(courseId)}${options.preview ? '?preview=1' : ''}`, undefined, token),
    openLesson: (lessonId, token, options = {}) => send('GET', `/lms/learn/lessons/${id(lessonId)}${options.preview ? '?preview=1' : ''}`, undefined, token),
    saveProgress: (lessonId, data, token) => send('POST', `/lms/learn/lessons/${id(lessonId)}/progress`, data ?? {}, token),

    // Authoring
    listCourses: (query, token) => send('GET', `/lms/courses${toQueryString(query ?? {})}`, undefined, token),
    createCourse: (data, token) => send('POST', '/lms/courses', data, token),
    getCourse: (courseId, token) => send('GET', `/lms/courses/${id(courseId)}`, undefined, token),
    updateCourse: (courseId, data, token) => send('PATCH', `/lms/courses/${id(courseId)}`, data, token),
    archiveCourse: (courseId, token) => send('DELETE', `/lms/courses/${id(courseId)}`, undefined, token),
    createSection: (courseId, data, token) => send('POST', `/lms/courses/${id(courseId)}/sections`, data, token),
    updateSection: (sectionId, data, token) => send('PATCH', `/lms/sections/${id(sectionId)}`, data, token),
    deleteSection: (sectionId, token) => send('DELETE', `/lms/sections/${id(sectionId)}`, undefined, token),
    createLesson: (sectionId, data, token) => send('POST', `/lms/sections/${id(sectionId)}/lessons`, data, token),
    updateLesson: (lessonId, data, token) => send('PATCH', `/lms/lessons/${id(lessonId)}`, data, token),
    deleteLesson: (lessonId, token) => send('DELETE', `/lms/lessons/${id(lessonId)}`, undefined, token),
    getLessonMedia: (lessonId, token) => send('GET', `/lms/lessons/${id(lessonId)}/media`, undefined, token),
    reorder: (courseId, data, token) => send('POST', `/lms/courses/${id(courseId)}/reorder`, data, token),
    presignVideo: (data, token) => send('POST', '/lms/media/presign', data, token),
    confirmVideo: (fileId, token) => send('POST', `/lms/media/${id(fileId)}/confirm`, {}, token),
    presignVideoPackage: (data, token) => send('POST', '/lms/media/hls/presign', data, token),

    // Enrollments
    listEnrollments: (courseId, token) => send('GET', `/lms/courses/${id(courseId)}/enrollments`, undefined, token),
    assign: (courseId, data, token) => send('POST', `/lms/courses/${id(courseId)}/enrollments`, data, token),
    updateEnrollment: (enrollmentId, data, token) => send('PATCH', `/lms/enrollments/${id(enrollmentId)}`, data, token),

    // Quiz authoring
    listQuestions: (lessonId, token) => send('GET', `/lms/lessons/${id(lessonId)}/questions`, undefined, token),
    createQuestion: (lessonId, data, token) => send('POST', `/lms/lessons/${id(lessonId)}/questions`, data, token),
    updateQuestion: (questionId, data, token) => send('PATCH', `/lms/questions/${id(questionId)}`, data, token),
    deleteQuestion: (questionId, token) => send('DELETE', `/lms/questions/${id(questionId)}`, undefined, token),
    reorderQuestions: (lessonId, questionIds, token) => send('POST', `/lms/lessons/${id(lessonId)}/questions/reorder`, { questionIds }, token),

    // Learner evaluation
    getQuiz: (lessonId, token) => send('GET', `/lms/learn/lessons/${id(lessonId)}/quiz`, undefined, token),
    startAttempt: (lessonId, token) => send('POST', `/lms/learn/lessons/${id(lessonId)}/attempts`, {}, token),
    getAttempt: (attemptId, token) => send('GET', `/lms/learn/attempts/${id(attemptId)}`, undefined, token),
    saveAnswers: (attemptId, answers, token) => send('PUT', `/lms/learn/attempts/${id(attemptId)}/answers`, { answers }, token),
    submitAttempt: (attemptId, answers, token) => send('POST', `/lms/learn/attempts/${id(attemptId)}/submit`, answers === undefined ? {} : { answers }, token),
    listSubmissions: (lessonId, token) => send('GET', `/lms/learn/lessons/${id(lessonId)}/submissions`, undefined, token),
    submitAssignment: (lessonId, data, token) => send('POST', `/lms/learn/lessons/${id(lessonId)}/submissions`, data, token),
    presignUpload: (data, token) => send('POST', '/lms/learn/uploads/presign', data, token),
    confirmUpload: (fileId, token) => send('POST', `/lms/learn/uploads/${id(fileId)}/confirm`, {}, token),

    // Grading
    getReviewQueue: (query, token) => send('GET', `/lms/review${toQueryString(query ?? {})}`, undefined, token),
    getReviewAttempt: (attemptId, token) => send('GET', `/lms/review/attempts/${id(attemptId)}`, undefined, token),
    gradeAttempt: (attemptId, data, token) => send('POST', `/lms/review/attempts/${id(attemptId)}/grade`, data, token),
    getReviewSubmission: (submissionId, token) => send('GET', `/lms/review/submissions/${id(submissionId)}`, undefined, token),
    gradeSubmission: (submissionId, data, token) => send('POST', `/lms/review/submissions/${id(submissionId)}/grade`, data, token),
    grantExtraAttempt: (enrollmentId, lessonId, token) => send('POST', `/lms/enrollments/${id(enrollmentId)}/lessons/${id(lessonId)}/extra-attempt`, {}, token),

    // Discussion
    listComments: (lessonId, token) => send('GET', `/lms/lessons/${id(lessonId)}/comments`, undefined, token),
    createComment: (lessonId, data, token) => send('POST', `/lms/lessons/${id(lessonId)}/comments`, data, token),
    updateComment: (commentId, data, token) => send('PATCH', `/lms/comments/${id(commentId)}`, data, token),
    deleteComment: (commentId, token) => send('DELETE', `/lms/comments/${id(commentId)}`, undefined, token),

    // Reviews
    getReviews: (courseId, token) => send('GET', `/lms/courses/${id(courseId)}/reviews`, undefined, token),
    saveMyReview: (courseId, data, token) => send('PUT', `/lms/courses/${id(courseId)}/reviews/mine`, data, token),
    moderateReview: (reviewId, data, token) => send('PATCH', `/lms/reviews/${id(reviewId)}`, data, token),

    // Announcements
    listAnnouncements: (courseId, token) => send('GET', `/lms/courses/${id(courseId)}/announcements`, undefined, token),
    createAnnouncement: (courseId, data, token) => send('POST', `/lms/courses/${id(courseId)}/announcements`, data, token),
    updateAnnouncement: (announcementId, data, token) => send('PATCH', `/lms/announcements/${id(announcementId)}`, data, token),
    deleteAnnouncement: (announcementId, token) => send('DELETE', `/lms/announcements/${id(announcementId)}`, undefined, token),

    // Course page and lesson resources
    getCourseOverview: (courseId, token) => send('GET', `/lms/courses/${id(courseId)}/overview`, undefined, token),
    listLessonResources: (lessonId, token) => send('GET', `/lms/lessons/${id(lessonId)}/resources`, undefined, token),
    addLessonResource: (lessonId, data, token) => send('POST', `/lms/lessons/${id(lessonId)}/resources`, data, token),
    updateLessonResource: (resourceId, data, token) => send('PATCH', `/lms/resources/${id(resourceId)}`, data, token),
    deleteLessonResource: (resourceId, token) => send('DELETE', `/lms/resources/${id(resourceId)}`, undefined, token),
    reorderLessonResources: (lessonId, resourceIds, token) => send('POST', `/lms/lessons/${id(lessonId)}/resources/reorder`, { resourceIds }, token),

    // Certificates. The *Url helpers return the API path (prefix the API base URL).
    listCertificateTemplates: (token) => send('GET', '/lms/certificate-templates', undefined, token),
    createCertificateTemplate: (data, token) => send('POST', '/lms/certificate-templates', data, token),
    updateCertificateTemplate: (templateId, data, token) => send('PATCH', `/lms/certificate-templates/${id(templateId)}`, data, token),
    disableCertificateTemplate: (templateId, token) => send('DELETE', `/lms/certificate-templates/${id(templateId)}`, undefined, token),
    certificateTemplatePreviewUrl: (templateId) => `/lms/certificate-templates/${id(templateId)}/preview.pdf`,
    downloadCertificateTemplatePreview: (templateId, token) => blob(`/lms/certificate-templates/${id(templateId)}/preview.pdf`, token),
    // Word (.docx) templates. formData: file (+ name on upload).
    uploadCertificateDocxTemplate: (formData, token) => request('/lms/certificate-templates/docx', {
      method: 'POST', headers: withAuthHeaders(token), body: formData, onlineOnly: true,
    }),
    replaceCertificateTemplateFile: (templateId, formData, token) => request(`/lms/certificate-templates/${id(templateId)}/file`, {
      method: 'PUT', headers: withAuthHeaders(token), body: formData, onlineOnly: true,
    }),
    // Word / PowerPoint: { applied, missing, unplaced, fileName, contentBase64 }; nothing is saved.
    suggestCertificateTemplateTags: (templateId, token) => send('POST', `/lms/certificate-templates/${id(templateId)}/suggest`, {}, token),
    // Signed URL of the current uploaded file ({ url, expiresIn, fileName }).
    getCertificateTemplateFileUrl: (templateId, token) => send('GET', `/lms/certificate-templates/${id(templateId)}/file`, undefined, token),
    // format: 'docx' (default) or 'pptx'.
    downloadCertificateTemplateSample: (token, format = 'docx') => blob(`/lms/certificate-templates/sample.${format === 'pptx' ? 'pptx' : 'docx'}`, token),
    // Any uploaded template (.docx, .pptx or .pdf by extension). formData: file, name.
    uploadCertificateTemplateFile: (formData, token) => request('/lms/certificate-templates/upload', {
      method: 'POST', headers: withAuthHeaders(token), body: formData, onlineOnly: true,
    }),
    // PDF templates: field layout ({ fields }), detected fields, and a sample-data preview of an unsaved layout.
    saveCertificateTemplateLayout: (templateId, layout, token) => send('PUT', `/lms/certificate-templates/${id(templateId)}/layout`, layout, token),
    suggestCertificateTemplateLayout: (templateId, token) => send('POST', `/lms/certificate-templates/${id(templateId)}/suggest-layout`, {}, token),
    previewCertificateTemplateLayout: (templateId, layout, token) => requestBlob(`/lms/certificate-templates/${id(templateId)}/preview.pdf`, {
      method: 'POST', headers: withAuthHeaders(token, { 'Content-Type': 'application/json' }), body: JSON.stringify({ layout }),
    }),
    issueCertificate: (enrollmentId, token) => send('POST', `/lms/enrollments/${id(enrollmentId)}/certificate`, {}, token),
    revokeCertificate: (certificateId, reason, token) => send('POST', `/lms/certificates/${id(certificateId)}/revoke`, { reason }, token),
    listCourseCertificates: (courseId, token) => send('GET', `/lms/courses/${id(courseId)}/certificates`, undefined, token),
    downloadCertificate: (certificateId, token) => blob(`/lms/certificates/${id(certificateId)}/pdf`, token),
    listMyCertificates: (token) => send('GET', '/lms/my/certificates', undefined, token),
    downloadMyCertificate: (certificateId, token) => blob(`/lms/my/certificates/${id(certificateId)}/pdf`, token),
    getPublicCertificate: (certToken) => request(`/public/lms/certificates/${id(certToken)}`, { method: 'GET' }),

    // Course share links (manager, lms.course.manage).
    getCourseShare: (courseId, token) => send('GET', `/lms/courses/${id(courseId)}/share`, undefined, token),
    updateCourseShare: (courseId, data, token) => send('PUT', `/lms/courses/${id(courseId)}/share`, data, token),
    rotateCourseShare: (courseId, token) => send('POST', `/lms/courses/${id(courseId)}/share/rotate`, {}, token),
    // Guest email invitations (invite-only links). create/resend return the plain code once.
    listShareInvites: (courseId, token) => send('GET', `/lms/courses/${id(courseId)}/share/invites`, undefined, token),
    createShareInvites: (courseId, invites, token) => send('POST', `/lms/courses/${id(courseId)}/share/invites`, { invites }, token),
    resendShareInvite: (courseId, inviteId, token) => send('POST', `/lms/courses/${id(courseId)}/share/invites/${id(inviteId)}/resend`, {}, token),
    revokeShareInvite: (courseId, inviteId, token) => send('POST', `/lms/courses/${id(courseId)}/share/invites/${id(inviteId)}/revoke`, {}, token),

    // Guest player on a share link: no user session, only `Authorization: Guest <guestToken>`.
    guest: createGuestApi(request),
    publicCertificatePdfUrl: (certToken) => `/public/lms/certificates/${id(certToken)}/pdf`,
  }
}
