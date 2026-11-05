// Sets `subtitle` on user objects ({ id }) for pickers and access lists:
// "Puesto · Departamento" from the linked HR record, else the company role,
// so people with similar names can be told apart. Never throws away people.
export async function attachPersonSubtitles(people, { prisma, companyId }) {
  const list = (people ?? []).filter((p) => p?.id);
  if (!list.length || !companyId) return people;
  const ids = [...new Set(list.map((p) => p.id))];
  const [employees, memberships] = await Promise.all([
    prisma.hrEmployee.findMany({
      where: { companyId, userProfileId: { in: ids }, enabled: true },
      select: { userProfileId: true, jobTitle: true, department: true, jobTitleRef: { select: { name: true } }, departmentRef: { select: { name: true } } },
    }),
    prisma.membership.findMany({ where: { companyId, userId: { in: ids }, enabled: true }, select: { userId: true, role: { select: { name: true } } } }),
  ]);
  const byId = new Map(memberships.map((m) => [m.userId, m.role?.name ?? null]));
  for (const e of employees) {
    const text = [e.jobTitleRef?.name ?? e.jobTitle, e.departmentRef?.name ?? e.department].filter(Boolean).join(" · ");
    if (text) byId.set(e.userProfileId, text);
  }
  for (const person of list) person.subtitle = byId.get(person.id) ?? null;
  return people;
}
