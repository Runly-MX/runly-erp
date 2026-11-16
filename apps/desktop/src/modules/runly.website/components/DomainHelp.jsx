import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@runly/ui'
import { BookOpen } from 'lucide-react'

// Plain-language help for people who have never touched DNS. Copy only: every decision stays on the server.
const Code = ({ children }) => <code className="rounded bg-[hsl(var(--muted))] px-1 py-0.5 font-mono text-xs text-[hsl(var(--foreground))]">{children}</code>
const Steps = ({ items }) => <ol className="list-decimal space-y-1.5 pl-5">{items.map((item, i) => <li key={i}>{item}</li>)}</ol>
const Bullets = ({ items }) => <ul className="list-disc space-y-1.5 pl-5">{items.map((item, i) => <li key={i}>{item}</li>)}</ul>

const PROVIDERS = [
  ['IONOS', 'Dominios y SSL → junto a tu dominio, el engranaje → DNS → Añadir registro.'],
  ['GoDaddy', 'Mis productos → tu dominio → DNS → Administrar DNS → Agregar nuevo registro.'],
  ['Cloudflare', 'Tu dominio → DNS → Registros → Agregar registro. Deja la nube en gris («Solo DNS»): con la nube naranja Runly no puede comprobar que el dominio apunta aquí.'],
  ['Hostinger', 'Dominios → tu dominio → DNS / Nameservers → Administrar registros DNS.'],
  ['Namecheap', 'Domain List → Manage → Advanced DNS → Add new record.'],
  ['Google / Squarespace', 'Domains → tu dominio → DNS → Registros personalizados → Administrar registros.'],
]

function CustomDomainTopics({ zone }) {
  const z = zone ?? 'tudominio.mx'
  return (
    <>
      <AccordionItem value="before">
        <AccordionTrigger>Qué necesito antes de empezar</AccordionTrigger>
        <AccordionContent>
          <Bullets items={[
            <>Un dominio que ya sea tuyo (lo compraste en IONOS, GoDaddy, Cloudflare u otro proveedor).</>,
            <>Acceso al panel de ese proveedor: el usuario y la contraseña con los que compraste el dominio.</>,
            <>Unos 10 minutos. Runly no cambia nada en tu proveedor: tú copias dos datos y Runly comprueba que estén ahí.</>,
          ]} />
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="where">
        <AccordionTrigger>Dónde encuentro la configuración DNS de mi dominio</AccordionTrigger>
        <AccordionContent className="space-y-2">
          <p>Busca una sección llamada «DNS», «Zona DNS» o «Registros DNS». En los proveedores más comunes:</p>
          <ul className="space-y-1.5">{PROVIDERS.map(([name, path]) => <li key={name}><strong>{name}:</strong> {path}</li>)}</ul>
          <p>Si no la encuentras, busca en la ayuda de tu proveedor «agregar registro DNS» o pídele a su soporte que agregue los registros que ves arriba.</p>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="how">
        <AccordionTrigger>Cómo agrego cada registro</AccordionTrigger>
        <AccordionContent>
          <Steps items={[
            <>Pulsa «Añadir registro» (o «Agregar»).</>,
            <>En <strong>Tipo</strong> elige el que indica Runly: <Code>TXT</Code>, <Code>A</Code> o <Code>CNAME</Code>.</>,
            <>En <strong>Host</strong> (a veces «Nombre» o «Nombre de host») pega lo que muestra Runly, por ejemplo <Code>www</Code> o <Code>@</Code>. No escribas «{z}» al final: el proveedor lo agrega solo. Si tu panel pide el nombre completo, usa el que aparece debajo del host.</>,
            <>En <strong>Valor</strong> (a veces «Apunta a», «Destino» o «Contenido») pega el valor de Runly tal cual, sin comillas ni espacios.</>,
            <>Deja el <strong>TTL</strong> como venga (o «1 hora») y guarda.</>,
            <>Repite con el siguiente registro y vuelve aquí para pulsar «Verificar ahora».</>,
          ]} />
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="existing">
        <AccordionTrigger>Ya existe un registro con ese nombre</AccordionTrigger>
        <AccordionContent className="space-y-2">
          <p>Si ya hay un registro <Code>A</Code> o <Code>CNAME</Code> con el mismo host (por ejemplo <Code>www</Code> apuntando a otro servidor), <strong>edítalo</strong> y cambia su valor por el de Runly. No dejes dos registros para el mismo host: el navegador elegiría uno al azar.</p>
          <p>El registro <Code>TXT</Code> de Runly sí puede convivir con otros TXT.</p>
          <p><strong>No borres</strong> los registros <Code>MX</Code> ni los TXT de correo (SPF, DKIM): son los de tu correo electrónico y no tienen nada que ver con el sitio.</p>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="time">
        <AccordionTrigger>Cuánto tarda y cómo sé si ya funciona</AccordionTrigger>
        <AccordionContent className="space-y-2">
          <p>Normalmente entre 5 y 30 minutos; algunos proveedores tardan hasta 24-48 horas. Puedes cerrar esta ventana y volver cuando quieras: Runly guarda el avance.</p>
          <p>Pulsa «Verificar ahora». Si todavía no aparece, Runly te dice qué falta. Al verificarse, el dominio queda como «Verificado» y tu sitio empieza a responder en esa dirección.</p>
          <p>Si pasaron varias horas, revisa que el host no tenga «{z}» repetido y que el valor no tenga espacios ni comillas de más.</p>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="www">
        <AccordionTrigger>Con www, sin www y subdominios</AccordionTrigger>
        <AccordionContent className="space-y-2">
          <p><Code>www.{z}</Code> y <Code>{z}</Code> son dos direcciones distintas. Si quieres que la gente llegue escribiendo cualquiera de las dos, conecta ambas y en Dominios elige una como principal: la otra redirigirá a ella.</p>
          <p>Un subdominio como <Code>tienda.{z}</Code> es una sola dirección: no necesita versión con www.</p>
          <p>Algunos proveedores no permiten <Code>CNAME</Code> en el dominio sin www (<Code>@</Code>); en ese caso usa el registro <Code>A</Code> que indica Runly o un registro ALIAS si tu proveedor lo ofrece.</p>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="https">
        <AccordionTrigger>El candado (HTTPS) y «Certificado no válido»</AccordionTrigger>
        <AccordionContent className="space-y-2">
          <p>Para que el navegador muestre el candado, el servidor necesita un certificado de seguridad para tu dominio. Runly comprueba si existe, pero no lo emite.</p>
          <Bullets items={[
            <><strong>HTTPS listo:</strong> todo bien, tu sitio abre con candado.</>,
            <><strong>Certificado no válido</strong> o <strong>HTTPS sin configurar:</strong> el dominio ya está conectado, pero falta el certificado. Pide a quien administra tu instalación de Runly que lo emita para este dominio y después pulsa «Comprobar HTTPS».</>,
          ]} />
          <p>Mientras falte el certificado, algunos navegadores mostrarán «No seguro» o una advertencia antes de abrir el sitio.</p>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="email">
        <AccordionTrigger>Afecta a mi correo o a otros servicios</AccordionTrigger>
        <AccordionContent>
          <p>No, si solo agregas los registros que indica Runly y no borras otros. El correo usa registros <Code>MX</Code> distintos. Si el host que usas (por ejemplo <Code>www</Code>) ya mostraba otra página, al cambiar su valor esa página dejará de verse y se verá tu sitio de Runly.</p>
        </AccordionContent>
      </AccordionItem>
    </>
  )
}

function AddressTopics() {
  return (
    <>
      <AccordionItem value="kinds">
        <AccordionTrigger>Qué tipos de dirección puede tener mi sitio</AccordionTrigger>
        <AccordionContent className="space-y-2">
          <p><strong>Dirección gratuita de Runly:</strong> eliges un nombre (por ejemplo «mi-negocio»), se le agrega la dirección de tu instalación y queda lista al momento. No necesitas configurar nada.</p>
          <p><strong>Dominio propio:</strong> usa un dominio que ya compraste, como <Code>www.minegocio.mx</Code>. Requiere agregar un par de registros en el panel de tu proveedor; Runly te guía paso a paso.</p>
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="several">
        <AccordionTrigger>Por qué puedo tener varias direcciones y cuál se usa</AccordionTrigger>
        <AccordionContent className="space-y-2">
          <p>Todas las direcciones activas muestran el mismo sitio publicado. Es útil para no perder visitas cuando cambias de nombre o cuando conectas tu dominio propio después de usar la gratuita.</p>
          <p>Para que visitantes y buscadores vean una sola, elige una <strong>dirección principal</strong>: las demás redirigirán a ella automáticamente.</p>
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="release">
        <AccordionTrigger>Qué pasa si libero una dirección</AccordionTrigger>
        <AccordionContent className="space-y-2">
          <p>El sitio deja de verse en esa dirección de inmediato. Una dirección gratuita queda apartada para tu sitio durante 15 días y puedes recuperarla con «Recuperar»; después cualquier otro sitio podrá usarla.</p>
          <p>Un dominio propio liberado se desconecta de tu sitio; para volver a usarlo, conéctalo de nuevo y verifica el DNS.</p>
        </AccordionContent>
      </AccordionItem>
    </>
  )
}

export function DomainHelp({ variant = 'custom', zone, className }) {
  return (
    <section className={className} aria-label="Ayuda">
      <p className="mb-2 flex items-center gap-2 text-sm font-semibold"><BookOpen className="h-4 w-4 text-[hsl(var(--muted-foreground))]" aria-hidden />{variant === 'custom' ? 'Guía paso a paso' : 'Preguntas frecuentes'}</p>
      <Accordion type="single" collapsible className="space-y-2 text-sm text-[hsl(var(--muted-foreground))] [&_button]:text-left [&_button]:text-[hsl(var(--foreground))] [&_strong]:text-[hsl(var(--foreground))]">
        {variant === 'custom' ? <CustomDomainTopics zone={zone} /> : <AddressTopics />}
      </Accordion>
    </section>
  )
}
