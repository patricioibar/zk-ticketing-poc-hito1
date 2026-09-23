#!/usr/bin/env node
// Imprime el estado de ejecución del plan y cuál es la próxima tarea.
// Uso: node scripts/estado.mjs   (o: npm run estado)

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const est = JSON.parse(readFileSync(join(raiz, "estado.json"), "utf8"));

const simbolo = {
  hecha: "[x]",
  pendiente: "[ ]",
  "en-curso": "[~]",
  bloqueada: "[!]",
  opcional: "[o]",
};

const porId = Object.fromEntries(est.tareas.map((t) => [t.id, t]));
const hecha = (id) => porId[id]?.estado === "hecha";
const listaParaEmpezar = (t) =>
  t.estado === "pendiente" && t.depende.every(hecha);

console.log(`\n${est.proyecto}`);
console.log(`${est.stack}`);
console.log(`Plan: ${est.plan} · actualizado ${est.actualizado}\n`);

let faseActual = null;
for (const t of est.tareas) {
  if (t.fase !== faseActual) {
    faseActual = t.fase;
    console.log(`  --- Fase ${faseActual} ---`);
  }
  const marca = simbolo[t.estado] ?? "[?]";
  const bloqueo =
    t.estado === "pendiente" && !t.depende.every(hecha)
      ? `  (espera ${t.depende.filter((d) => !hecha(d)).join(", ")})`
      : "";
  console.log(`  ${marca} ${t.id}  ${t.titulo}${bloqueo}`);
}

const hechas = est.tareas.filter((t) => t.estado === "hecha").length;
const totales = est.tareas.filter((t) => t.estado !== "opcional").length;
console.log(`\n  Progreso: ${hechas}/${totales}`);

const bloqueadas = est.tareas.filter((t) => t.estado === "bloqueada");
if (bloqueadas.length) {
  console.log(`\n  BLOQUEADAS: ${bloqueadas.map((t) => t.id).join(", ")}`);
  console.log(`  Mirá su bitácora antes de seguir.`);
}

const siguiente = est.tareas.find(listaParaEmpezar);
if (siguiente) {
  console.log(`\n  Próxima tarea: ${siguiente.id} — ${siguiente.titulo}`);
  console.log(`  Encargo para un agente nuevo:\n`);
  console.log(
    `    Leé CONTEXTO.md y la sección ${siguiente.id} de PLAN.md, y ejecutá esa tarea.\n` +
      `    No leas el plan entero ni empieces la tarea siguiente.\n`
  );
} else {
  console.log(`\n  No hay tareas listas para empezar.\n`);
}
