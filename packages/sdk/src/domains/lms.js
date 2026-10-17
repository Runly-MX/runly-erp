const id = (value) => encodeURIComponent(value)

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
    getOutline: (courseId, token) => send('GET', `/lms/learn/${id(courseId)}`, undefined, token),
    openLesson: (lessonId, token) => send('GET', `/lms/learn/lessons/${id(lessonId)}`, undefined, token),
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

    // Certificates. The *Url helpers return the API path (prefix the API base URL).
    listCertificateTemplates: (token) => send('GET', '/lms/certificate-templates', undefined, token),
    createCertificateTemplate: (data, token) => send('POST', '/lms/certificate-templates', data, token),
    updateCertificateTemplate: (templateId, data, token) => send('PATCH', `/lms/certificate-templates/${id(templateId)}`, data, token),
    disableCertificateTemplate: (templateId, token) => send('DELETE', `/lms/certificate-templates/${id(templateId)}`, undefined, token),
    certificateTemplatePreviewUrl: (templateId) => `/lms/certificate-templates/${id(templateId)}/preview.pdf`,
    downloadCertificateTemplatePreview: (templateId, token) => blob(`/lms/certificate-templates/${id(templateId)}/preview.pdf`, token),
    issueCertificate: (enrollmentId, token) => send('POST', `/lms/enrollments/${id(enrollmentId)}/certificate`, {}, token),
    revokeCertificate: (certificateId, reason, token) => send('POST', `/lms/certificates/${id(certificateId)}/revoke`, { reason }, token),
    listCourseCertificates: (courseId, token) => send('GET', `/lms/courses/${id(courseId)}/certificates`, undefined, token),
    downloadCertificate: (certificateId, token) => blob(`/lms/certificates/${id(certificateId)}/pdf`, token),
    listMyCertificates: (token) => send('GET', '/lms/my/certificates', undefined, token),
    downloadMyCertificate: (certificateId, token) => blob(`/lms/my/certificates/${id(certificateId)}/pdf`, token),
    getPublicCertificate: (certToken) => request(`/public/lms/certificates/${id(certToken)}`, { method: 'GET' }),
    publicCertificatePdfUrl: (certToken) => `/public/lms/certificates/${id(certToken)}/pdf`,
  }
}
