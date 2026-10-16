import { z } from 'zod';

export const companyInput = { companyId: z.uuid() };
export const resultSchema = z.object({ data: z.object({ operation: z.string(), result: z.json() }) });
export const proposalSchema = z.object({ data: z.object({ proposalId: z.string(), status: z.literal('approval_required'), moduleKey: z.string(), operation: z.string(), preview: z.object({ title: z.string(), fields: z.array(z.object({ label: z.string(), value: z.string(), before: z.string().optional() })) }), proposed: z.json(), expiresIn: z.number(), approvalUrl: z.url() }) });

// Convert the deliberately small, explicit MirAI parameter vocabulary; domain
// prepare/services remain the authoritative validators. Unsupported schemas fail
// closed at startup rather than exposing an arbitrary object argument.
export function parameterSchema(definition) {
  let schema;
  if (definition.enum) schema = z.enum(definition.enum);
  else if (definition.type === 'object') {
    const required = new Set(definition.required ?? []);
    schema = z.object(Object.fromEntries(Object.entries(definition.properties ?? {}).map(([key, value]) => {
      const field = parameterSchema(value);
      return [key, required.has(key) ? field : field.optional()];
    }))).strict();
  } else if (definition.type === 'array') schema = z.array(parameterSchema(definition.items)).max(100);
  else if (definition.type === 'integer') schema = z.number().int();
  else if (definition.type === 'number') schema = z.number().finite();
  else if (definition.type === 'boolean') schema = z.boolean();
  else if (definition.type === 'string') schema = z.string().max(20000);
  else throw new Error(`Unsupported MCP parameter type: ${definition.type}`);
  return definition.description ? schema.describe(definition.description) : schema;
}

export function operationRequest(operations) {
  return z.discriminatedUnion('operation', operations.map(operation => z.object({
    operation: z.literal(operation.name ?? operation.key),
    input: operation.inputSchema ?? parameterSchema(operation.definition?.parameters ?? operation.parameters),
  }).strict().describe(operation.definition?.description ?? operation.description ?? operation.label ?? operation.key)));
}
