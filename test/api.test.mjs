import assert from "node:assert/strict";
import { crearManejador } from "../netlify/functions/api.mjs";

// Store en memoria con la misma interfaz que usa la API
const datos = new Map();
const store = {
  async get(k) { return datos.has(k) ? JSON.parse(datos.get(k)) : null; },
  async setJSON(k, v) { datos.set(k, JSON.stringify(v)); },
  async set(k, v) { datos.set(k, String(v)); },
  async delete(k) { datos.delete(k); },
  async list({ prefix }) { return { blobs: [...datos.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })) }; },
};
const h = crearManejador(store);
const call = async (method, path, body) => {
  const r = await h(new Request("http://x" + path, { method, body: body ? JSON.stringify(body) : undefined }));
  return { status: r.status, data: await r.json() };
};

// crear sala
let r = await call("POST", "/api/sala");
assert.equal(r.status, 200);
const { sala, token } = r.data;
assert.match(sala, /^[A-Z2-9]{5}$/);

// anotarse
r = await call("POST", "/api/unirse", { sala, nombre: "  María   José " });
assert.equal(r.status, 200); assert.equal(r.data.nombre, "María José");
r = await call("POST", "/api/unirse", { sala, nombre: "Ñandú & Co" });
assert.equal(r.status, 200);
// duplicado (sin importar mayúsculas)
r = await call("POST", "/api/unirse", { sala, nombre: "maría josé" });
assert.equal(r.status, 409);
// vacío / sala inexistente / inválida
assert.equal((await call("POST", "/api/unirse", { sala, nombre: "   " })).status, 400);
assert.equal((await call("POST", "/api/unirse", { sala: "ZZZZZ", nombre: "Ana" })).status, 404);
assert.equal((await call("POST", "/api/unirse", { sala: "x", nombre: "Ana" })).status, 400);
// nombre largo se recorta y se limpia HTML
r = await call("POST", "/api/unirse", { sala, nombre: "<b>" + "a".repeat(60) });
assert.equal(r.data.nombre.length, 24); assert.ok(!r.data.nombre.includes("<"));

// listar
r = await call("GET", `/api/participantes?sala=${sala}`);
assert.equal(r.data.total, 3);
assert.deepEqual(r.data.participantes.map(p => p.nombre).slice(0, 3).sort(), ["María José", "Ñandú & Co", r.data.participantes[2].nombre].sort());
assert.ok(r.data.participantes.some(p => p.nombre === "María José") && r.data.participantes.some(p => p.nombre === "Ñandú & Co"));

// quitar: sin token falla, con token funciona
const id = r.data.participantes[0].id;
assert.equal((await call("POST", "/api/quitar", { sala, id, token: "malo" })).status, 403);
assert.equal((await call("POST", "/api/quitar", { sala, id, token })).status, 200);
r = await call("GET", `/api/participantes?sala=${sala}`);
assert.equal(r.data.total, 2);

// cerrar inscripción
await call("POST", "/api/cerrar", { sala, token, cerrada: true });
assert.equal((await call("POST", "/api/unirse", { sala, nombre: "Tarde" })).status, 403);
await call("POST", "/api/cerrar", { sala, token, cerrada: false });
assert.equal((await call("POST", "/api/unirse", { sala, nombre: "Tarde" })).status, 200);

// vaciar
await call("POST", "/api/vaciar", { sala, token });
r = await call("GET", `/api/participantes?sala=${sala}`);
assert.equal(r.data.total, 0);

// concurrencia: 50 personas a la vez
await Promise.all(Array.from({ length: 50 }, (_, i) => call("POST", "/api/unirse", { sala, nombre: "Persona " + i })));
r = await call("GET", `/api/participantes?sala=${sala}`);
assert.equal(r.data.total, 50);

console.log("✔ API: todas las pruebas pasaron");
