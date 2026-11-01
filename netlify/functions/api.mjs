// API de la ruleta. Guarda las salas y participantes en Netlify Blobs.
//
// Estructura de claves en el store "ruleta":
//   <SALA>/meta                       -> { creada, token, cerrada }
//   <SALA>/p/<ts>-<rand>~<nombre>     -> (vacío)  el nombre viaja en la clave,
//                                        así listar participantes es 1 sola llamada
//                                        y no hay carreras al anotarse varios a la vez.

import { getStore } from "@netlify/blobs";

const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin 0/O/1/I para evitar confusiones
const MAX_PARTICIPANTES = 300;
const MAX_NOMBRE = 24;
const VIDA_SALA_MS = 48 * 60 * 60 * 1000; // 48 horas

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

const error = (mensaje, status = 400) => json({ error: mensaje }, status);

function codigoSala(largo = 5) {
  const bytes = new Uint8Array(largo);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => ALFABETO[b % ALFABETO.length]).join("");
}

function limpiarNombre(valor) {
  return String(valor ?? "")
    .replace(/[\u0000-\u001f\u007f<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NOMBRE);
}

function normalizarSala(valor) {
  const s = String(valor ?? "").trim().toUpperCase();
  return /^[A-Z0-9]{4,8}$/.test(s) ? s : null;
}

async function leerMeta(store, sala) {
  const meta = await store.get(`${sala}/meta`, { type: "json" });
  if (!meta) return null;
  if (Date.now() - meta.creada > VIDA_SALA_MS) return null;
  return meta;
}

async function listarParticipantes(store, sala) {
  const prefijo = `${sala}/p/`;
  const { blobs } = await store.list({ prefix: prefijo });
  return blobs
    .map((b) => {
      const resto = b.key.slice(prefijo.length);
      const i = resto.indexOf("~");
      if (i < 0) return null;
      let nombre;
      try {
        nombre = decodeURIComponent(resto.slice(i + 1));
      } catch {
        return null;
      }
      return { id: resto.slice(0, i), nombre, clave: b.key };
    })
    .filter(Boolean)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function crearManejador(store) {
  return async (req) => {
    const url = new URL(req.url);
    const ruta = url.pathname.replace(/^\/api\/?/, "").replace(/\/+$/, "");

    try {
      // ---------- Crear sala ----------
      if (req.method === "POST" && ruta === "sala") {
        let sala;
        for (let i = 0; i < 10; i++) {
          const candidata = codigoSala();
          if (!(await leerMeta(store, candidata))) {
            sala = candidata;
            break;
          }
        }
        if (!sala) return error("No se pudo crear la sala, probá de nuevo", 500);
        const token = crypto.randomUUID().replace(/-/g, "");
        await store.setJSON(`${sala}/meta`, {
          creada: Date.now(),
          token,
          cerrada: false,
        });
        return json({ sala, token });
      }

      // ---------- Ver participantes (anfitrión y pantalla de unirse) ----------
      if (req.method === "GET" && ruta === "participantes") {
        const sala = normalizarSala(url.searchParams.get("sala"));
        if (!sala) return error("Código de sala inválido");
        const meta = await leerMeta(store, sala);
        if (!meta) return error("La sala no existe o ya venció", 404);
        const lista = await listarParticipantes(store, sala);
        return json({
          sala,
          cerrada: !!meta.cerrada,
          total: lista.length,
          participantes: lista.map(({ id, nombre }) => ({ id, nombre })),
        });
      }

      // ---------- Anotarse ----------
      if (req.method === "POST" && ruta === "unirse") {
        const cuerpo = await req.json().catch(() => ({}));
        const sala = normalizarSala(cuerpo.sala);
        const nombre = limpiarNombre(cuerpo.nombre);
        if (!sala) return error("Código de sala inválido");
        if (!nombre) return error("Escribí tu nombre para anotarte");

        const meta = await leerMeta(store, sala);
        if (!meta) return error("La sala no existe o ya venció", 404);
        if (meta.cerrada) return error("La inscripción ya está cerrada", 403);

        const lista = await listarParticipantes(store, sala);
        if (lista.length >= MAX_PARTICIPANTES)
          return error("La ruleta está completa", 403);
        if (lista.some((p) => p.nombre.toLowerCase() === nombre.toLowerCase()))
          return error(
            "Ya hay alguien anotado con ese nombre. Agregá tu apellido o una inicial.",
            409
          );

        const id = `${Date.now().toString().padStart(14, "0")}-${Math.random()
          .toString(36)
          .slice(2, 8)}`;
        await store.set(`${sala}/p/${id}~${encodeURIComponent(nombre)}`, "1");
        return json({ ok: true, id, nombre, total: lista.length + 1 });
      }

      // ---------- Acciones del anfitrión (requieren token) ----------
      if (
        req.method === "POST" &&
        ["quitar", "cerrar", "vaciar"].includes(ruta)
      ) {
        const cuerpo = await req.json().catch(() => ({}));
        const sala = normalizarSala(cuerpo.sala);
        if (!sala) return error("Código de sala inválido");
        const meta = await leerMeta(store, sala);
        if (!meta) return error("La sala no existe o ya venció", 404);
        if (!cuerpo.token || cuerpo.token !== meta.token)
          return error("No tenés permiso para administrar esta sala", 403);

        if (ruta === "quitar") {
          const lista = await listarParticipantes(store, sala);
          const objetivo = lista.find((p) => p.id === cuerpo.id);
          if (objetivo) await store.delete(objetivo.clave);
          return json({ ok: true });
        }

        if (ruta === "cerrar") {
          await store.setJSON(`${sala}/meta`, {
            ...meta,
            cerrada: !!cuerpo.cerrada,
          });
          return json({ ok: true, cerrada: !!cuerpo.cerrada });
        }

        if (ruta === "vaciar") {
          const lista = await listarParticipantes(store, sala);
          await Promise.all(lista.map((p) => store.delete(p.clave)));
          return json({ ok: true });
        }
      }

      return error("Ruta no encontrada", 404);
    } catch (e) {
      console.error("Error en la API de la ruleta:", e);
      return error("Error interno, probá de nuevo en unos segundos", 500);
    }
  };
}

export default async (req) => {
  const store = getStore({ name: "ruleta", consistency: "strong" });
  return crearManejador(store)(req);
};

export const config = { path: "/api/*" };
