# 0-morosos

> Alquiler, luz, agua e internet bajo control. Marcador: **0 morosos**.

Webapp pensada para pisos compartidos que quieren llevar las cuentas claras sin hojas de cálculo eternas ni discusiones por quién pagó el último recibo.

## ✨ ¿Qué hace?

- **Registro rápido de gastos:** Añade alquiler, luz, agua, gas, internet o compras del piso en segundos.
- **Reparto automático:** Calcula quién debe qué a quién de forma transparente (a partes iguales o ajustado si hace falta).
- **Vista de saldos al día:** Sabe de un vistazo quién va adelantado y quién tiene pendiente pasar por caja.
- **Historial de movimientos:** Revisa qué se pagó, cuándo y quién lo registró.

## 🛠️ Stack tecnológico

> Sustituye esta sección por las herramientas que uses en tu proyecto.

- **Frontend:** [React / Next.js / Vue / Svelte / HTML+CSS+JS]
- **Estilos:** [Tailwind CSS / CSS Modules / etc.]
- **Backend / Persistencia:** [Supabase / Firebase / localStorage / Node / etc.]
- **Despliegue:** [Vercel / Netlify / GitHub Pages]

## 🚀 Puesta en marcha en local

```bash
# 1. Clona el repositorio
git clone [https://github.com/](https://github.com/)[tu-usuario]/0-morosos.git

# 2. Entra en la carpeta del proyecto
cd 0-morosos

# 3. Instala dependencias
[npm install / pnpm install / yarn]

# 4. Arranca el servidor de desarrollo
[npm run dev]
```

## Base de datos en Vercel

La primera instalación (o una base de datos vacía) necesita crear las tablas de autenticación y de la aplicación. En la terminal local, copia `DATABASE_URL` desde **Vercel → Project → Settings → Environment Variables** para el entorno que estás reparando y ejecuta:

```bash
pnpm db:migrate
```

La migración `drizzle/0000_initial.sql` es repetible y no borra datos. No pegues ni guardes la URL de conexión en el repositorio. Después, vuelve a desplegar el proyecto.

Configura en Vercel, como mínimo, `DATABASE_URL`, `BETTER_AUTH_SECRET` (secreto aleatorio largo) y `BETTER_AUTH_URL` (origen público canónico, por ejemplo `https://tu-dominio.com`). Aplica las variables al entorno del despliegue afectado y crea un nuevo deployment.
