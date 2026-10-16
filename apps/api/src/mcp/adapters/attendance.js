import { createAttendanceMiraiCapabilities } from '../../routes/attendance/mirai-capabilities.js';

export function createAttendanceAdapter({ prisma }) {
  const capability = createAttendanceMiraiCapabilities({ prisma });
  return { moduleKey: capability.moduleKey, label: capability.label, queries: capability.tools, actions: [] };
}
