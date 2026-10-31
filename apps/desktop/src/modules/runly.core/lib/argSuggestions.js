// Which data of the trigger and of earlier blocks make sense for one argument of
// a block. A title gets names and folios, a date gets dates, an email gets emails,
// an id gets ids; nobody wants a raw identifier pasted in the middle of a message.

const bare = (value) => String(value).replace(/^(paso\d+_|elemento_)/, "");

// What kind of value a data field holds, from its declared type and its key.
export function dataKindOf(option) {
  const type = String(option.type ?? "").toLowerCase();
  const key = bare(option.value);
  if (type === "person" || type === "user") return "person";
  if (["id", "uuid", "relation", "reference"].includes(type) || key === "id" || /Ids?$/.test(key)) return "id";
  if (type === "boolean" || type === "bool") return "boolean";
  if (type === "email" || /(^|[a-z])(email|Email|correo)/.test(key)) return "email";
  if (type === "phone" || /phone|Phone|telefono/.test(key)) return "phone";
  if (["date", "datetime", "timestamp"].includes(type) || /(At|Date|On)$/.test(key) || key === "fecha") return "date";
  if (["number", "integer", "decimal", "money", "currency"].includes(type)) return "number";
  if (/(^|_)(link|url)$/.test(key)) return "link";
  if (["json", "base64"].includes(type) || key === "data" || key === "contentBase64") return "raw";
  return "text";
}

// Short labels read best with names, folios and states; long texts take almost anything.
const SHORT_TEXT = new Set(["title", "subject", "name", "label", "nombre", "referencia", "concepto", "plate", "brand", "model", "color", "driver", "insurer", "policyNumber", "merchant", "category", "accountName", "wallet", "kind", "mimeType", "status"]);
const LONG_TEXT = new Set(["body", "text", "message", "description", "notes", "note", "justification", "search"]);

// The kinds of data an argument accepts, from its name and its contract type.
export function acceptedKinds(name, spec = {}) {
  const type = spec.type ?? "string";
  if (name === "channel") return ["channel"];
  if (type === "date" || type === "datetime" || /(At|Date|On|By)$/.test(name) || name === "fecha") return ["date"];
  if (type === "email" || name === "to" || /email$/i.test(name)) return ["email"];
  if (/phone/i.test(name)) return ["phone"];
  if (type === "number" || type === "integer" || ["deposito", "retiro", "amount", "premium"].includes(name)) return ["number"];
  if (type === "uuid" || type === "uuid[]" || name === "id" || /Ids?$/.test(name)) return ["id", "person"];
  if (name === "currency") return ["text"];
  if (SHORT_TEXT.has(name)) return ["text", "number", "date", "email", "phone"];
  if (LONG_TEXT.has(name) || type === "text") return ["text", "number", "date", "email", "phone", "link"];
  return ["text", "number", "date"];
}

// A field named like the argument goes first (callId for callId, the assignee for assigneeId).
const matchesName = (name, option) => {
  const key = bare(option.value).toLowerCase();
  const wanted = name.toLowerCase().replace(/ids?$/, "");
  return wanted.length > 1 && (key === name.toLowerCase() || key.startsWith(wanted));
};

export function suggestionsFor(name, spec, fieldOptions = []) {
  const kinds = acceptedKinds(name, spec);
  const fits = (option) => {
    const kind = dataKindOf(option);
    if (kinds.includes("channel")) return /channel|canal/i.test(`${option.value} ${option.label}`);
    return kinds.includes(kind);
  };
  const picked = fieldOptions.filter(fits);
  return [...picked.filter((option) => matchesName(name, option)), ...picked.filter((option) => !matchesName(name, option))];
}
