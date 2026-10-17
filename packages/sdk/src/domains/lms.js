const id = (value) => encodeURIComponent(value)

export function createLmsDomain({ request, withAuthHeaders, toQueryString }) {
  const send = (method, path, data, token) => request(path, {
    method,
    headers: withAuthHeaders(token),
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  })
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

    // Enrollments
    listEnrollments: (courseId, token) => send('GET', `/lms/courses/${id(courseId)}/enrollments`, undefined, token),
    assign: (courseId, data, token) => send('POST', `/lms/courses/${id(courseId)}/enrollments`, data, token),
    updateEnrollment: (enrollmentId, data, token) => send('PATCH', `/lms/enrollments/${id(enrollmentId)}`, data, token),
  }
}
