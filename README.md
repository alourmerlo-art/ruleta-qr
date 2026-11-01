# 🎡 Ruleta en vivo con código QR

El organizador proyecta la ruleta y un código QR. Cada persona lo escanea con el celular, escribe su nombre y aparece al instante en la ruleta. Cuando el organizador toca **GIRAR**, la ruleta elige un ganador al azar.

## Cómo se usa

1. Abrí la dirección de tu sitio en la notebook (la pantalla del organizador).
2. Mostrá el QR en el proyector o la tele (botón **⛶ Pantalla completa**).
3. La gente escanea el QR, escribe su nombre y toca **ANOTARME**.
4. Cuando quieras, tocá **GIRAR** (o la barra espaciadora).
5. Aparece el ganador con confeti. Con **Continuar** seguís jugando.

Opciones del panel:
- **Quitar al ganador de la ruleta**: para que no pueda ganar dos veces.
- **Cerrar inscripción**: nadie más puede anotarse (se puede reabrir).
- **×** al lado de cada nombre: quita a esa persona.
- **Vaciar**: saca a todos para empezar una ronda nueva con el mismo QR.
- **Crear una sala nueva**: genera otro código y otro QR.

La sala se guarda en el navegador del organizador: si recarga la página, no pierde nada. Las salas se borran solas a las 48 horas.

## Publicar en Netlify (paso a paso)

La ruleta necesita una función del lado del servidor para guardar los participantes (usa *Netlify Blobs*, que viene incluido y no requiere configurar nada). Por eso hay que publicarla desde **GitHub** o con la **línea de comandos**, no arrastrando la carpeta.

### Opción A: con GitHub (recomendada)

1. Creá un repositorio nuevo en GitHub (por ejemplo `ruleta-qr`).
2. Subí **todo el contenido de esta carpeta** (`public`, `netlify`, `netlify.toml`, `package.json`, etc.).
3. En Netlify: **Add new site → Import an existing project → GitHub** y elegí el repositorio.
4. Dejá la configuración que detecta solo (ya está en `netlify.toml`) y tocá **Deploy**.
5. Cuando termine, abrí la URL que te da Netlify. Esa es la pantalla del organizador.

### Opción B: con la línea de comandos

```bash
npm install -g netlify-cli
npm install
netlify login
netlify init        # crea o vincula el sitio
netlify deploy --prod
```

## Probar en tu computadora

```bash
npm install
npx netlify dev     # abre http://localhost:8888
```

Para que el celular pueda escanear el QR en una prueba local, la notebook y el celular tienen que estar en la misma red, y el QR tiene que apuntar a la IP de la notebook en lugar de `localhost`. Lo más simple es probar directamente con el sitio ya publicado.

## Estructura

```
public/index.html            Pantalla del organizador: ruleta, QR y lista
public/unirse.html           Página que abre el celular al escanear el QR
public/vendor/qrcode.js      Generador de QR (incluido, no usa internet externo)
netlify/functions/api.mjs    API: crear sala, anotarse, listar, quitar, cerrar
test/api.test.mjs            Pruebas de la API (npm test)
netlify.toml                 Configuración de Netlify
```

## Detalles técnicos

- Los nombres se limpian y se recortan a 24 caracteres. No se permiten dos nombres iguales en la misma sala.
- Máximo de 300 participantes por sala.
- La elección del ganador usa `crypto.getRandomValues` y se decide antes de empezar a girar; la animación solo frena en ese lugar.
- Solo el organizador (que tiene el token guardado en su navegador) puede quitar participantes, cerrar la inscripción o vaciar la sala.
