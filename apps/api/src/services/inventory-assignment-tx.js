// Transactional assignment writes shared by the assign/return endpoints,
// custody completion (resguardos) and the data migrator. Callers run the
// business validations; these helpers only write, inside the given tx.

// Creates the assignment row and marks the item assigned.
export async function assignItemTx(tx, { itemId, employeeId, assignedById, notes = null, assignedAt = new Date(), include }) {
  const assignment = await tx.invAssignment.create({
    data: { itemId, employeeId, assignedById, notes: notes ?? null, assignedAt },
  });
  const item = await tx.invItem.update({
    where: { id: itemId },
    data: { status: 'assigned', assignedToId: employeeId, assignedAt },
    ...(include ? { include } : {}),
  });
  return { item, assignment };
}

// Closes the given active assignment and marks the item available.
export async function returnItemTx(tx, { assignmentId, itemId, notes, returnedAt = new Date(), include }) {
  const assignment = await tx.invAssignment.update({
    where: { id: assignmentId },
    data: { returnedAt, ...(notes !== undefined ? { notes } : {}) },
  });
  const item = await tx.invItem.update({
    where: { id: itemId },
    data: { status: 'available', assignedToId: null, assignedAt: null },
    ...(include ? { include } : {}),
  });
  return { item, assignment };
}
