# Mantenimientos PDV — App

App para reemplazar el papel: registra mantenimientos por PDV (teclado, computador,
impresora, mouse, escáner, UPS, cámaras, DVR), toma fotos, captura firma y sello, y
sincroniza todo a un Google Sheet + Google Drive tuyo. Genera además un PDF del reporte
en el celular.

Funciona **sin Play Store**: es una PWA que empaquetas como APK para instalar directo
(sideload) en cualquier equipo Android.

## Qué incluye esta carpeta

```
index.html, app.js, styles.css, manifest.json, sw.js, jspdf.umd.min.js, icons/
    -> la app en sí (funciona offline, sin instalar nada, ya vendorizada)
apps-script/Code.gs
    -> el backend gratuito (Google Apps Script) que recibe los reportes
```

## Paso 1 — Backend (Google Sheets + Drive), 10 minutos

1. Crea una Google Sheet nueva (sheets.new). Copia su ID: es la parte de la URL entre
   `/d/` y `/edit`.
2. Crea una carpeta en Google Drive para las fotos. Copia su ID: la parte de la URL
   después de `/folders/`.
3. En la Sheet: **Extensiones → Apps Script**. Borra lo que haya y pega el contenido
   completo de `apps-script/Code.gs`.
4. Reemplaza `SPREADSHEET_ID` y `DRIVE_FOLDER_ID` con los IDs que copiaste.
5. **Implementar → Nueva implementación → tipo "Aplicación web"**:
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier usuario**
6. Autoriza los permisos que pida (es tu propio script, es seguro). Copia la URL que
   termina en `/exec` — esa es la que va en la app.

## Paso 2 — Publicar la app (para poder generar el APK)

Necesitas que la app viva en una URL https pública (PWABuilder la necesita para
empaquetar). La forma más simple y gratis es GitHub Pages:

1. Crea un repositorio en GitHub, sube todos los archivos de esta carpeta **excepto**
   `apps-script/` (ese código va solo en Apps Script, no en la web).
2. En el repo: **Settings → Pages → Branch: main → /root**. Guarda.
3. En un par de minutos tendrás una URL tipo `https://tuusuario.github.io/turepo/`.

## Paso 3 — Generar el APK (sin Play Store)

1. Entra a **pwabuilder.com**.
2. Pega la URL de GitHub Pages del paso anterior y dale a analizar.
3. Ve a la pestaña **Android** → **Generate Package**. Elige el paquete "APK firmado"
   (Signed APK / genera su propio keystore automáticamente si no tienes uno).
4. Descarga el `.apk`.
5. Pásalo a los celulares (por USB, WhatsApp, un link de descarga, etc.). En el celular,
   al instalarlo por primera vez Android pedirá activar **"Instalar apps de orígenes
   desconocidos"** para esa fuente — es normal, es lo que reemplaza a la Play Store.

Eso es todo — no necesitas Android Studio ni saber programar apps nativas.

## Paso 4 — Configurar la app en cada celular

1. Abre la app, ve a **Ajustes**, pega la URL de Apps Script (la que termina en
   `/exec`) y toca **Guardar URL**.
2. Listo. Cada reporte que se guarde se sube solo cuando hay señal; si no hay señal,
   queda "Pendiente" y se reintenta automáticamente.

## Cómo queda organizada la información

- **Google Sheet**: una fila por cada equipo revisado (PDV, fecha, técnico, actividad,
  si está para cambio, y links a las fotos).
- **Google Drive**: una subcarpeta por reporte (`PDV - fecha - id`) con todas las fotos,
  la firma y el sello.
- **En el celular**: cada técnico puede tocar un reporte en la pestaña "Reportes" para
  exportar el PDF con el formato de siempre (para imprimir o enviar si algún PDV lo pide
  en papel).

## Actualizaciones futuras

Como es una PWA, para corregir algo o agregar un campo solo actualizas los archivos en
GitHub Pages — los celulares que ya tienen la app instalada la actualizan solos la
próxima vez que abran con señal. Solo tendrías que volver a generar el APK en
PWABuilder si cambias íconos/nombre de la app.

## Ideas para más adelante (no incluidas todavía)

- Lista desplegable de PDVs (en vez de escribir el nombre) alimentada desde el Sheet.
- Reporte fotográfico de "antes / después".
- Notificación cuando un equipo queda marcado "para cambio" (con Apps Script + Gmail es
  fácil de agregar).
- Dashboard en el propio Sheet con tablas dinámicas por PDV / técnico / mes.

Si quieres, puedo agregar cualquiera de estas después de que pruebes la versión base.
