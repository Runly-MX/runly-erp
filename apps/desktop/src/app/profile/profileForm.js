export const EMPTY_FORM = {
  firstName: "",
  lastName: "",
  username: "",
  birthDate: "",
  gender: "",
  phone: "",
  country: "",
  state: "",
  city: "",
  colony: "",
  street: "",
  extNumber: "",
  intNumber: "",
  postalCode: "",
  bio: "",
};

export const GENDER_OPTIONS = [
  { value: "masculino", label: "Masculino" },
  { value: "femenino", label: "Femenino" },
  { value: "no_binario", label: "No binario" },
  { value: "prefiero_no_decir", label: "Prefiero no decir" },
];

export function toDateInputValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  // eslint-disable-next-line no-restricted-syntax -- deliberate UTC: birthDate is a calendar date (@db.Date, stored at UTC midnight)
  return date.toISOString().slice(0, 10);
}

export function formFromProfile(data) {
  return {
    firstName: data.firstName ?? "",
    lastName: data.lastName ?? "",
    username: data.username ?? "",
    birthDate: toDateInputValue(data.birthDate),
    gender: data.gender ?? "",
    phone: data.phone ?? "",
    country: data.country ?? "",
    state: data.state ?? "",
    city: data.city ?? "",
    colony: data.colony ?? "",
    street: data.street ?? "",
    extNumber: data.extNumber ?? "",
    intNumber: data.intNumber ?? "",
    postalCode: data.postalCode ?? "",
    bio: data.bio ?? "",
  };
}

// "2000-05-14" -> "14 de mayo de 2000" (parsed as a calendar date, no timezone shift).
export function formatBirthDate(value) {
  if (!value) return "";
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return value;
  return new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long", year: "numeric" }).format(new Date(y, m - 1, d));
}
