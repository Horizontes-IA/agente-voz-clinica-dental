# Sonrisa Norte · Agente de voz y dashboard

Proyecto educativo de Horizontes IA: recepción por voz en navegador, agenda persistente y dashboard privado. Negocio, clientes y precios ficticios. El código del tutorial es completo; cada persona utiliza sus propias cuentas y paga su consumo de proveedores.

## Qué puedes hacer

- Consultar servicios y conocimiento del negocio.
- Reservar, reprogramar y cancelar con preparación, confirmación y control de disponibilidad.
- Ver personas, agenda, conversaciones, solicitudes y actividad.
- Editar la knowledge base y publicar cambios del agente en ElevenLabs.
- Elegir una identidad ficticia desde administración para probar la voz.

## Requisitos

Node.js 22.22+, npm, cuenta de Cloudflare con Workers/D1 y cuenta de ElevenLabs con acceso a Agents y una voz compatible. Primero puedes probar el dashboard sin conectar ElevenLabs.

## Arranque local

```sh
npm ci
npm run setup
npm run db:local
npm run build
npm run preview
```

Abre http://127.0.0.1:8787. Lee tu contraseña local en `.secrets/admin-password.txt`; no la compartas. El primer inicio de sesión crea los datos sintéticos. En otra terminal puedes ejecutar `npm run dev` para desarrollo del frontend.

```sh
npm run doctor
npm test
npx playwright test
```

Las pruebas utilizan D1 local; `npm test` requiere que `npm run preview` siga activo. Las pruebas de navegador necesitan Chrome. No apuntes estas pruebas a un despliegue con datos reales.

## Tu despliegue

1. Escoge un nombre único para `name` y `database_name` en `wrangler.jsonc`. Si cambias el nombre de la base, cambia también `db:local` y `db:remote` en package.json.
2. Autentícate y crea tu base:

```sh
npx wrangler login
npx wrangler d1 create sonrisa-demo
```

3. Copia el `database_id` devuelto a `wrangler.jsonc` en sustitución del UUID de ceros. No copies IDs de otra persona. Si tienes varias cuentas, establece tu propio `account_id`.
4. Aplica migraciones y despliega:

```sh
npm run db:remote
npm run deploy
npx wrangler secret bulk .secrets/worker-secrets.json
```

No abras sesiones hasta subir los secretos. La URL HTTPS la devuelve Wrangler. El dashboard remoto usa la contraseña generada en tu copia local.

5. Entra al dashboard remoto, abre **Agente de voz**, conecta tu propia API key desde la pestaña de integraciones, elige una voz y publica. Alternativamente, configura la key mediante el prompt privado:

```sh
npx wrangler secret put ELEVENLABS_API_KEY
```

6. Usa **Probar agente**, selecciona una persona ficticia y permite el micrófono. Verifica una reserva en la agenda y una conversación en el historial. Esto consume tu cuenta de ElevenLabs.

Las herramientas de ElevenLabs llaman al Worker público. Una sesión local no funciona contra herramientas conectadas a otra base de datos: prueba la voz en tu despliegue HTTPS. La publicación crea recursos dedicados en ElevenLabs y no modifica agentes ajenos.

## Arquitectura

Navegador → React → API Hono en Cloudflare Workers → D1.
Navegador → sesión firmada de ElevenLabs → herramientas del Worker → D1.
ElevenLabs → webhook firmado del agente → historial de conversaciones.

Los secretos permanecen en el backend. Las herramientas reciben un token de sesión con acceso a una sola identidad ficticia. El modelo selecciona horarios opacos y el servidor confirma la reserva de forma atómica. El conocimiento explica políticas; la disponibilidad y los precios provienen de herramientas.

## Alcance

Dos puestos compartidos. Domingo cerrado, días laborales 09–19 y sábado 09–14, además del horario de cada profesional. Los servicios tienen duración y buffer. En la plantilla de estética un paquete ocupa un único profesional y puesto durante toda su duración; no planifica equipos distintos. El taller agrega órdenes con notas públicas, consulta por propietario y edición desde administración.

Esta demo usa una contraseña de administración y una identidad elegida desde el panel. Antes de uso real faltan usuarios y roles, verificación del cliente, política de retención aprobada y validación de procesos del negocio. SMS, OTP, telefonía, pagos y transferencia en vivo no están conectados. No anuncia envíos o cobros que no ocurrieron.

## Personalización

`business.config.json` documenta la configuración usada para generar esta copia. El código y las semillas ya fueron generados: editar solo ese JSON después de crear el proyecto no actualiza la UI ni datos existentes. Para regenerar usa Voice Agent Studio en una carpeta nueva. En esta copia puedes modificar código y datos semilla directamente antes del primer arranque. Los cambios de conocimiento y estilo se hacen en el dashboard y se publican explícitamente.

## Fuentes técnicas

- [D1 y comandos de Wrangler](https://developers.cloudflare.com/d1/wrangler-commands/)
- [Secretos de Workers](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Herramientas webhook de ElevenLabs](https://elevenlabs.io/docs/eleven-agents/customization/tools/webhook-tools)

## Sigue construyendo

En la comunidad Horizontes IA, Voice Agent Studio incluye el generador, skill de adaptación, tres casos de negocio, taller en vivo y documentos para preparar una propuesta de implementación. [Conoce la comunidad Horizontes IA](https://www.skool.com/horizontes-ia-9992/about). La fecha y el acceso al taller se anuncian dentro de Skool.
