import { useMemo } from "react";
import {
  Button,
  Card,
  ComboboxField,
  DateField,
  MarkdownField,
  MarkdownViewer,
  PhoneField,
  SelectField,
  TextField,
  useGeoData,
} from "@runly/ui";
import { AtSign, CalendarDays, Mail, MapPin, Pencil, Phone, User, VenusAndMars } from "lucide-react";
import { GENDER_OPTIONS, formatBirthDate } from "./profileForm.js";

function SectionTitle({ icon: Icon, children }) {
  return (
    <p className="mb-3 flex items-center gap-1.5 text-[13px] font-medium text-[hsl(var(--foreground))]/80">
      <Icon className="h-3.5 w-3.5 text-[hsl(var(--muted-foreground))]" />
      {children}
    </p>
  );
}

function InfoItem({ icon: Icon, label, value }) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-[hsl(var(--muted-foreground))]">{label}</p>
        <p className="truncate text-sm font-medium">{value || <span className="font-normal text-[hsl(var(--muted-foreground))]">Sin especificar</span>}</p>
      </div>
    </div>
  );
}

function joinAddress(parts) {
  return parts.filter(Boolean).join(", ");
}

// "Datos personales" + "Dirección" with a read-only view and an edit mode.
export function ProfileDataCard({
  profile,
  form,
  setForm,
  editing,
  onEdit,
  onCancel,
  onSave,
  saving,
  canSave,
  isDirty,
}) {
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const { Country, State, City } = useGeoData({ cities: Boolean(form.country && form.state) });

  const countryOptions = useMemo(
    () => (Country ? Country.getAllCountries().map((c) => ({ value: c.isoCode, label: c.name })) : []),
    [Country],
  );
  const stateOptions = useMemo(
    () => (State && form.country ? State.getStatesOfCountry(form.country).map((s) => ({ value: s.isoCode, label: s.name })) : []),
    [State, form.country],
  );
  const cityOptions = useMemo(
    () => (City && form.country && form.state ? City.getCitiesOfState(form.country, form.state).map((c) => ({ value: c.name, label: c.name })) : []),
    [City, form.country, form.state],
  );

  const countryLabel = countryOptions.find((o) => o.value === form.country)?.label ?? form.country;
  const stateLabel = stateOptions.find((o) => o.value === form.state)?.label ?? form.state;
  const genderLabel = GENDER_OPTIONS.find((o) => o.value === form.gender)?.label ?? "";
  const street = [form.street, form.extNumber && `#${form.extNumber}`, form.intNumber && `Int. ${form.intNumber}`].filter(Boolean).join(" ");

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center justify-between gap-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]/40 px-4 py-3">
        <div>
          <p className="text-sm font-semibold">Información personal</p>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            {editing ? "Edita tus datos y guarda los cambios." : "Así aparece tu información en la cuenta."}
          </p>
        </div>
        {editing ? null : (
          <Button type="button" variant="outline" size="sm" onClick={onEdit}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" />Editar
          </Button>
        )}
      </div>

      {editing ? (
        <div className="space-y-6 p-4 md:p-5">
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            <TextField label="Nombre" icon={User} value={form.firstName} onChange={set("firstName")} />
            <TextField label="Apellidos" icon={User} value={form.lastName} onChange={set("lastName")} />
            <TextField label="Correo electrónico" icon={Mail} value={profile?.email ?? ""} disabled />
            <TextField
              label="Nombre de usuario"
              icon={AtSign}
              value={form.username}
              placeholder="Opcional"
              hint="Puedes usarlo para iniciar sesión en lugar de tu correo."
              autoCapitalize="none"
              onChange={set("username")}
            />
            <DateField label="Fecha de nacimiento" icon={CalendarDays} value={form.birthDate} onChange={set("birthDate")} />
            <SelectField
              label="Sexo"
              icon={VenusAndMars}
              value={form.gender}
              placeholder="Seleccionar"
              options={GENDER_OPTIONS}
              onValueChange={(value) => setForm((f) => ({ ...f, gender: value }))}
            />
            <PhoneField label="Teléfono" icon={Phone} value={form.phone} onChange={set("phone")} />
          </div>

          <MarkdownField
            label="Biografía"
            value={form.bio}
            maxLength={500}
            placeholder="Escribe tu biografía aquí..."
            onChange={set("bio")}
          />

          <div>
            <SectionTitle icon={MapPin}>Dirección</SectionTitle>
            <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              <ComboboxField
                label="País"
                options={countryOptions}
                value={form.country}
                onChange={(val) => setForm((f) => ({ ...f, country: val, state: "", city: "", colony: "" }))}
                placeholder="Seleccionar país..."
                searchPlaceholder="Buscar país..."
              />
              {stateOptions.length > 0 ? (
                <ComboboxField
                  label="Estado / Provincia"
                  options={stateOptions}
                  value={form.state}
                  onChange={(val) => setForm((f) => ({ ...f, state: val, city: "", colony: "" }))}
                  placeholder="Seleccionar estado..."
                  searchPlaceholder="Buscar estado..."
                />
              ) : (
                <TextField label="Estado / Provincia" icon={MapPin} value={form.state} onChange={set("state")} />
              )}
              {form.country && cityOptions.length > 0 ? (
                <ComboboxField
                  label="Ciudad / Municipio"
                  options={cityOptions}
                  value={form.city}
                  onChange={(val) => setForm((f) => ({ ...f, city: val }))}
                  placeholder="Seleccionar ciudad..."
                  searchPlaceholder="Buscar ciudad..."
                  minSearchLength={2}
                />
              ) : (
                <TextField label="Ciudad / Municipio" icon={MapPin} value={form.city} onChange={set("city")} />
              )}
              <TextField label="Colonia / Fraccionamiento" icon={MapPin} value={form.colony} onChange={set("colony")} />
              <TextField label="Calle" icon={MapPin} value={form.street} onChange={set("street")} />
              <TextField label="Número exterior" value={form.extNumber} onChange={set("extNumber")} />
              <TextField label="Número interior" value={form.intNumber} onChange={set("intNumber")} />
              <TextField label="Código postal" value={form.postalCode} onChange={set("postalCode")} />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[hsl(var(--border))] pt-4">
            <Button type="button" variant="outline" disabled={saving} onClick={onCancel}>
              Cancelar
            </Button>
            <Button type="button" disabled={saving || !isDirty || !canSave} onClick={onSave}>
              {saving ? "Guardando..." : "Guardar cambios"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-6 p-4 md:p-5">
          <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 2xl:grid-cols-3">
            <InfoItem icon={User} label="Nombre completo" value={`${form.firstName} ${form.lastName}`.trim()} />
            <InfoItem icon={Mail} label="Correo electrónico" value={profile?.email} />
            <InfoItem icon={AtSign} label="Nombre de usuario" value={form.username} />
            <InfoItem icon={CalendarDays} label="Fecha de nacimiento" value={formatBirthDate(form.birthDate)} />
            <InfoItem icon={VenusAndMars} label="Sexo" value={genderLabel} />
            <InfoItem icon={Phone} label="Teléfono" value={form.phone} />
          </div>

          <div>
            <SectionTitle icon={User}>Biografía</SectionTitle>
            <MarkdownViewer value={form.bio} emptyText="Aún no has escrito tu biografía." />
          </div>

          <div>
            <SectionTitle icon={MapPin}>Dirección</SectionTitle>
            <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 2xl:grid-cols-3">
              <InfoItem icon={MapPin} label="País" value={countryLabel} />
              <InfoItem icon={MapPin} label="Estado / Provincia" value={stateLabel} />
              <InfoItem icon={MapPin} label="Ciudad / Municipio" value={form.city} />
              <InfoItem icon={MapPin} label="Colonia" value={form.colony} />
              <InfoItem icon={MapPin} label="Calle y número" value={street} />
              <InfoItem icon={MapPin} label="Código postal" value={form.postalCode} />
            </div>
            {!joinAddress([form.country, form.city, form.street]) ? (
              <p className="mt-3 text-xs text-[hsl(var(--muted-foreground))]">Aún no has agregado tu dirección.</p>
            ) : null}
          </div>
        </div>
      )}
    </Card>
  );
}
