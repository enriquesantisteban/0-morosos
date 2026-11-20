## Prompt
Crea desde cero una aplicación web llamada **0 morosos** para gestionar los gastos compartidos de pisos de estudiantes. No reutilices ni dependas de una aplicación existente: crea una experiencia nueva, con diseño visual, navegación, componentes y pantallas propios.

## Diseño y experiencia

Diseña una interfaz moderna, clara y fácil de usar, completamente en español y adaptable a móvil, tableta y escritorio. Debe tener una identidad visual propia para **0 morosos**, pensada para que convivir y llevar las cuentas del piso sea sencillo.

Crea todas las pantallas necesarias:

- Página de bienvenida y presentación.
- Registro de un piso y de su administrador.
- Inicio de sesión.
- Recuperación y restablecimiento de contraseña.
- Panel principal con resumen mensual, gráficos y actividad reciente.
- Listado de gastos con filtros.
- Formulario para crear y editar gastos.
- Detalle de un gasto, incluida la factura adjunta y el historial.
- Gestión de miembros y roles del piso.
- Bandeja de solicitudes de cambio.
- Centro de notificaciones.
- Vistas para exportar o compartir informes.
- Estados vacíos, de carga, de error y de éxito.

Mantén una navegación coherente entre pantallas y muestra a cada usuario solo las opciones que permite su rol.

## Pisos, cuentas y permisos

Cada piso debe ser un espacio privado e independiente. Los usuarios de un piso nunca deben poder consultar datos de otro.

Permite registrar pisos y crear cuentas con nombre de usuario y contraseña. Incluye inicio de sesión y recuperación de contraseña. El nombre de usuario deberá ser único.

Cada piso debe tener un administrador y puede tener varios usuarios:

- El administrador puede añadir o invitar usuarios, eliminarlos y gestionar los gastos.
- El administrador puede crear, editar y eliminar gastos.
- Los usuarios pueden consultar los gastos y enviar solicitudes de cambio.
- Solo el administrador puede aprobar o rechazar solicitudes.
- Al aprobar una solicitud, aplica el cambio al gasto correspondiente.

Verifica los permisos en el servidor para todas las operaciones; no basta con ocultar controles en la interfaz.

## Gastos y facturas

Permite registrar gastos con importe, fecha, tipo, usuario que lo registró y una nota opcional. Los tipos disponibles son:

- Alquiler
- Luz
- Agua
- Basura
- Comunidad
- Internet
- Otros, con un campo para especificar el concepto

Para los gastos de **luz y agua**, solicita las fechas de inicio y fin del periodo facturado. Para **alquiler**, solicita el mes al que corresponde el gasto.

Permite adjuntar opcionalmente una foto de la factura. Guarda las imágenes con Vercel Blob y su referencia en la base de datos. Valida el formato y tamaño de los archivos y permite ver la factura desde el detalle del gasto.

## Panel, filtros y gráficos

El panel principal debe mostrar un resumen claro de los gastos del piso y su actividad reciente.

Incluye gráficos interactivos para visualizar los gastos por tipo, mes y usuario. Añade filtros por tipo y por fecha o periodo. Los resúmenes deben mostrar los totales mensuales y los totales por tipo.

## Solicitudes, notificaciones e historial

Cuando un usuario solicite un cambio, permite al administrador revisar la propuesta y aprobarla o rechazarla. La solicitud debe indicar quién la envió, a qué gasto afecta, qué cambio propone y cuándo se envió.

Implementa notificaciones para informar a los miembros del piso sobre nuevos gastos, cambios en gastos y solicitudes pendientes.

Mantén un historial por gasto que muestre qué cambió, quién realizó la acción y cuándo. Guarda los valores anteriores y nuevos cuando haya una modificación. Registra también quién aprobó o rechazó cada solicitud y cuándo.

## Compartir y exportar

- Permite compartir por WhatsApp un resumen legible y ordenado de los gastos seleccionados o del periodo actual.
- Permite exportar los gastos filtrados a CSV.
- Permite generar y descargar informes en PDF con gastos y totales organizados por periodo y tipo.

## Datos y requisitos técnicos

- Usa Vercel Postgres para guardar pisos, usuarios y pertenencias, gastos, adjuntos, solicitudes, historial y notificaciones.
- Usa Vercel Blob para guardar las fotos de las facturas.
- Configura los servicios mediante las integraciones y variables de entorno necesarias en Vercel.
- Asegura que todas las consultas estén limitadas al piso del usuario autenticado.
- Valida los datos en el servidor y muestra mensajes de error claros en español.
- Implementa todas las pantallas y acciones de extremo a extremo; no dejes botones o flujos sin funcionalidad.
- Incluye instrucciones de configuración local y despliegue en Vercel, junto con las variables de entorno e integraciones necesarias.



## MEJORAS
[ ] Fecha del gasto, en vez de un calendario, un desplegable para elegir el mes y el año.
[ ] Cuando le doy a detalle del gasto, me aparece en formato JSON.
[ ] Quiero en el resumen, poder elegir el mes
[ ] Poder editar el nombre del piso, que no sea genérico a "Mi piso"
[ ] El miembro podrá añadir gastos, pero se quedará en modo pendiente hasta que lo acepte el administrador, tal y como se hace para editar un gasto.




## 0-MOROSOS v2
[ ] Que el admin pueda añadir el contrato del piso y sea visible para todos los usuarios en un apartado especial dentro de su perfil.
[ ] Cada perfil de usuario podrá ser personalizable en color, añadir foto suya, poner su nombre, apellidos.





## FUNCIONAMIENTO

- Quién se registra primero, es el administrador del piso.