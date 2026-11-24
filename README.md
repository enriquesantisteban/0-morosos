# 0 morosos

**Las cuentas claras, la convivencia larga.**

0 morosos es una aplicación web para organizar los gastos de un piso compartido. Permite registrar recibos, repartirlos entre sus habitantes, consultar quién ha pagado y mantener la información del piso en un único lugar.

> Proyecto en español, diseñado para escritorio y móvil. La aplicación desplegada necesita servicios externos configurados; las instrucciones de este documento explican cómo preparar una instancia propia.

## Capturas de pantalla

Las capturas se pueden guardar en `docs/screenshots/`. Al añadir cada imagen, quita los comentarios HTML que la rodean para que aparezca en GitHub.

<!-- Añade una captura del panel y descomenta esta línea cuando exista el archivo. -->
<!-- ![Panel principal de 0 morosos](docs/screenshots/panel-principal.png) -->

<!-- Añade una captura de la lista de gastos y descomenta esta línea cuando exista el archivo. -->
<!-- ![Listado de gastos](docs/screenshots/gastos.png) -->

<!-- Añade una captura de los informes o el perfil y descomenta esta línea cuando exista el archivo. -->
<!-- ![Informes y herramientas](docs/screenshots/informes.png) -->

## Para qué sirve

La aplicación está pensada para que las personas que comparten vivienda puedan registrar gastos y entender fácilmente cómo se distribuyen. Cada piso tiene sus miembros y datos separados. La primera persona que crea una cuenta para un piso pasa a ser su administrador; puede invitar al resto mediante un enlace.

### Funciones principales

- **Cuentas y acceso:** registro e inicio de sesión con usuario y contraseña, acceso con Google cuando se configuran las credenciales OAuth, vinculación de Google desde una cuenta existente y recuperación de contraseña por correo.
- **Piso y miembros:** nombre e información del piso, invitaciones y roles de administración y miembro.
- **Gastos compartidos:** registro, edición y consulta de gastos con concepto, categoría, importe, fecha, nota opcional y factura adjunta.
- **Reparto flexible:** distribución por partes iguales, por número de partes o mediante importes asignados. La aplicación calcula la parte correspondiente a cada miembro.
- **Aprobaciones:** las propuestas de nuevos gastos o cambios enviados por miembros quedan pendientes de revisión por la administración.
- **Seguimiento de pagos:** cada miembro puede indicar que ha pagado su parte y la administración puede confirmar o rechazar el aviso.
- **Resumen y actividad:** totales, desglose por categoría, evolución mensual y movimientos recientes.
- **Notificaciones e historial:** avisos del piso y registro de acciones y cambios relevantes.
- **Informes:** exportación de gastos a CSV, creación de un informe imprimible que se puede guardar como PDF desde el navegador y resumen para compartir por WhatsApp.
- **Perfil y contrato:** nombre y foto de perfil, y almacenamiento del contrato del piso con visibilidad seleccionable por la administración.
- **Diseño adaptable:** navegación y presentación ajustadas a pantallas de escritorio y móvil.

## Tecnologías

- **Next.js 16** con App Router y **React 19** para la aplicación web y sus rutas de servidor.
- **TypeScript** para el código de la aplicación.
- **Better Auth** para las sesiones, credenciales, integración opcional con Google y recuperación de contraseña.
- **PostgreSQL** para usuarios, pisos, miembros, gastos, pagos, solicitudes, notificaciones, invitaciones e historial.
- **Drizzle ORM** para consultar la base de datos y describir el esquema.
- **Vercel Blob** para guardar archivos como facturas, fotos de perfil y contratos.
- **Resend** como proveedor opcional de correo para restablecer contraseña y verificación de correo.
- **Vercel Analytics** para analítica cuando la aplicación se ejecuta en producción.
- **pnpm** para instalar dependencias y ejecutar comandos.

## Cómo está organizado

```text
app/
  actions/       Operaciones de servidor del panel y los gastos
  acceso/        Registro, inicio de sesión y recuperación de contraseña
  api/           Rutas de autenticación y gestión de archivos
  dashboard-client.tsx
                 Interfaz interactiva del panel
  globals.css    Estilos globales y componentes visuales
  page.tsx       Comprueba la sesión y carga el panel
components/      Componentes reutilizables
lib/
  auth.ts        Configuración de Better Auth y conexión PostgreSQL
  auth-client.ts Cliente de autenticación para la interfaz
  db/            Conexión y esquema de Drizzle
  utils.ts       Utilidades compartidas
drizzle/
  0000_initial.sql
                 Esquema inicial de PostgreSQL
scripts/
  migrate.mjs    Aplica el esquema inicial a la base de datos
public/          Iconos e imágenes estáticas
docs/
  screenshots/   Capturas para la documentación del proyecto
```

Las operaciones de la aplicación que modifican información se ejecutan en el servidor y comprueban la sesión y los permisos del usuario. Los datos del panel se obtienen desde el servidor para el piso asociado a la cuenta.

## Requisitos

- Node.js compatible con Next.js 16.
- pnpm (la versión declarada por el proyecto es `12.3.4`).
- Una base de datos PostgreSQL accesible desde la aplicación.
- Para usar cargas de archivos, un almacén Vercel Blob.
- Para habilitar acceso Google o envío de correo, sus respectivas credenciales.

## Puesta en marcha local

### 1. Clonar e instalar

```bash
git clone https://github.com/TU-USUARIO/0-morosos.git
cd 0-morosos
pnpm install
```

Activa pnpm si todavía no está disponible en tu terminal:

```bash
corepack enable
corepack prepare pnpm@12.3.4 --activate
```

### 2. Configurar las variables de entorno

Crea `.env.local` en la raíz del proyecto. No subas este archivo a GitHub: está excluido por `.gitignore`.

```dotenv
# Obligatoria: cadena de conexión PostgreSQL
DATABASE_URL="postgresql://USUARIO:CONTRASENA@HOST:5432/BASE_DE_DATOS?sslmode=require"

# Obligatoria: secreto largo, aleatorio y privado
BETTER_AUTH_SECRET="REEMPLAZAR_POR_UN_SECRETO_ALEATORIO_LARGO"

# URL base de la aplicación en desarrollo
BETTER_AUTH_URL="http://localhost:3000"

# Opcionales: habilitan el inicio de sesión con Google
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""

# Opcionales: habilitan el correo de recuperación/verificación
RESEND_API_KEY=""
EMAIL_FROM="0 morosos <cuentas@tu-dominio.com>"

# Necesaria para las cargas de archivos en Vercel Blob
BLOB_READ_WRITE_TOKEN=""

# Recordatorios push mensuales en dispositivos
NEXT_PUBLIC_VAPID_PUBLIC_KEY=""
VAPID_PRIVATE_KEY=""
CRON_SECRET=""
```

Usa una base de datos de desarrollo independiente de producción. Genera `BETTER_AUTH_SECRET` con un gestor de secretos o un generador criptográfico; no reutilices el ejemplo. En Vercel, configura las variables en **Project → Settings → Environment Variables** para los entornos que vayas a desplegar.

**Google OAuth:** crea un cliente OAuth de tipo aplicación web en Google Cloud. Añade el origen de tu aplicación como origen autorizado y la URL de retorno de Better Auth (`/api/auth/callback/google`) como URI de redirección autorizada. Después copia el identificador y el secreto en las dos variables correspondientes. Sin ellas, el resto de la aplicación puede funcionar, pero no se ofrece el acceso con Google.

**Correo:** configura una clave de Resend y un remitente permitido en Resend. El correo es necesario para los flujos de recuperación y verificación.

**Archivos:** conecta un almacén Vercel Blob y configura su token para subir y servir los archivos privados que utiliza la aplicación.

**Recordatorios de pago:** el día 1, el cron de `vercel.json` crea automáticamente una notificación en el centro de notificaciones de cada miembro y envía un correo si Resend está configurado. Obt?n `CRON_SECRET` ejecutando `pnpm generate:vapid` y config?ralo en Vercel. Ejecuta `pnpm db:migrate` para crear las tablas de control. Los avisos push del navegador son opcionales: tambi?n requieren configurar las claves VAPID que imprime ese comando y permiso en cada dispositivo; en iPhone, la webapp debe estar añadida a la pantalla de inicio.

### 3. Crear las tablas

Con `DATABASE_URL` definido en `.env.local`, ejecuta:

```bash
pnpm db:migrate
```

El comando aplica `drizzle/0000_initial.sql`. El esquema inicial usa `CREATE TABLE IF NOT EXISTS`, por lo que se puede volver a ejecutar para crear tablas que falten sin borrar las existentes.

### 4. Arrancar la aplicación

```bash
pnpm dev
```

Abre [http://localhost:3000](http://localhost:3000). Crea una cuenta: si no utilizas una invitación, esa cuenta inicia un piso nuevo y su usuario queda como administrador. Desde la aplicación se puede generar una invitación para los demás habitantes.

### Otros comandos

```bash
pnpm build    # Genera la versión de producción
pnpm start    # Sirve la versión generada
pnpm db:migrate # Aplica el esquema inicial de la base de datos
```

## Despliegue

El proyecto está preparado para desplegarse en Vercel. Conecta el repositorio, configura las variables de entorno indicadas y despliega. Antes de usar una base de datos nueva, ejecuta la migración contra esa base de datos con `DATABASE_URL` del entorno correspondiente. Al cambiar variables en Vercel, crea un nuevo despliegue para que surtan efecto.

Se puede usar un proveedor PostgreSQL compatible, por ejemplo Neon, siempre que la cadena de conexión sea accesible desde el entorno de ejecución. Las cargas de archivos requieren configurar Vercel Blob. Google y Resend son integraciones opcionales según los flujos que quieras habilitar.

## Privacidad y seguridad

- No compartas ni publiques `.env.local`, cadenas de conexión, secretos OAuth ni claves de proveedores.
- No incluyas en capturas datos personales, facturas reales, tokens de invitación ni información privada del piso.
- Los datos de gastos, miembros y contratos pueden contener información personal. Configura y administra la base de datos y el almacenamiento conforme a las necesidades de privacidad de las personas que utilicen tu instancia.
- Antes de abrir el repositorio al público, comprueba que no contiene secretos ni exportaciones de datos reales.

## Estado del proyecto

La aplicación incluye el flujo principal de gestión del piso y los gastos descrito arriba. Las integraciones externas (Google, correo, base de datos y archivos) necesitan credenciales propias para cada instancia. Las contribuciones y mejoras son bienvenidas.

## Licencia

Este repositorio todavía no incluye un archivo `LICENSE`. La visibilidad pública en GitHub no concede automáticamente permiso para reutilizar, modificar o distribuir el código. Añade una licencia explícita si quieres definir esos permisos.
