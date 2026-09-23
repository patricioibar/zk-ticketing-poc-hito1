#!/usr/bin/env node
// Provisionar una puerta: el unico momento en que un molinete esta conectado.
//
// Aca la puerta descarga lo que va a necesitar toda la noche —la raiz del
// evento, el scope y la verification key— y lo guarda en puertas/puerta-N/.
// Despues de esto se la puede desenchufar de la red: scripts/validador.mjs no
// vuelve a mirar ni datos/, ni build/, ni ninguna fuente.
//
// Uso: npm run puerta:provisionar -- --puerta 1 --scope evento-A
//      npm run puerta:provisionar -- --puerta 1,2 --scope evento-A
//
// Ver docs/06-validador.md.

import { readFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

import { exigirEnCampo, elementoDeScope } from "../lib/campo.mjs";
import { fuenteJson } from "../fuentes/json.mjs";
import { exigirOrdenCanonico, ORDEN_SENALES } from "../lib/senales.mjs";
import {
  RAIZ_REPO,
  FORMATO_CONFIGURACION,
  directorioPuerta,
  escribirConfiguracion,
  escribirUsados,
  leerUsados,
  rutaUsados,
} from "../lib/puerta.mjs";

const datos = join(RAIZ_REPO, "datos");
const build = join(RAIZ_REPO, "build");
const vkeyRuta = join(build, "setup", "verification_key.json");
const symRuta = join(build, "pertenencia.sym");

const rel = (p) => relative(RAIZ_REPO, p).replaceAll("\\", "/");

function leerArgumentos(argv) {
  const opciones = { puertas: [], scope: null };
  for (let i = 0; i < argv.length; i++) {
    const valor = argv[i + 1];
    if (argv[i] === "--puerta") {
      opciones.puertas = String(valor ?? "")
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
      i++;
    } else if (argv[i] === "--scope") {
      opciones.scope = valor;
      i++;
    } else {
      console.error(`\nArgumento desconocido: ${argv[i]}`);
      console.error("Uso: npm run puerta:provisionar -- --puerta 1 [--scope evento-A]\n");
      process.exit(1);
    }
  }
  if (opciones.puertas.length === 0) {
    console.error("\nFalta --puerta N (podes pasar varias: --puerta 1,2).\n");
    process.exit(1);
  }
  for (const p of opciones.puertas) {
    if (!/^[0-9A-Za-z_-]+$/.test(p)) {
      console.error(`\n--puerta ${p}: el nombre de una puerta es un numero o una palabra simple.\n`);
      process.exit(1);
    }
  }
  return opciones;
}

function exigirArtefacto(ruta, comando) {
  if (!existsSync(ruta)) {
    console.error(`\nFalta ${rel(ruta)}.\nCorre primero:  ${comando}\n`);
    process.exit(1);
  }
}

async function main() {
  const opciones = leerArgumentos(process.argv.slice(2));

  console.log("\nProvisionar puerta - el momento conectado\n");

  exigirArtefacto(vkeyRuta, "npm run setup");
  exigirArtefacto(symRuta, "npm run circuito:pertenencia");
  exigirArtefacto(join(datos, "arbol.json"), "npm run organizador");

  const padron = JSON.parse(readFileSync(join(datos, "arbol.json"), "utf8"));
  const etiquetaScope = opciones.scope ?? padron.scope;
  const scope = exigirEnCampo(elementoDeScope(etiquetaScope), "scope del evento");

  const fuente = fuenteJson({ ruta: join(datos, "raiz.json"), etiqueta: "datos/raiz.json" });
  const raiz = await fuente.leerRaiz(scope);
  if (raiz === null) {
    console.error(`\nLa fuente no tiene ninguna raiz publicada para el scope ${scope}.`);
    console.error(`Corre primero:  npm run organizador -- --scope ${etiquetaScope}\n`);
    process.exit(1);
  }

  const vkey = JSON.parse(readFileSync(vkeyRuta, "utf8"));
  if (vkey.protocol !== "groth16" || vkey.curve !== "bn128") {
    console.error(`\nLa verification key no es Groth16 sobre bn128 (${vkey.protocol}/${vkey.curve}).\n`);
    process.exit(1);
  }

  // El chequeo que el PLAN pide dejar anotado: el orden de las senales publicas
  // se verifica contra el .sym que escribio circom, no se asume. Si el circuito
  // cambiara de orden, esto tira aca —con el build a mano y el error visible— y
  // no en la puerta a las once de la noche.
  const orden = exigirOrdenCanonico(symRuta, vkey.nPublic);

  console.log(`  fuente de raiz    ${fuente.nombre}   (se consulta ahora, no en la puerta)`);
  console.log(
    `  evento (scope)    ${etiquetaScope}${String(scope) === String(etiquetaScope) ? "" : ` -> ${scope}`}`
  );
  console.log(`  raiz del evento   ${raiz}`);
  console.log(`  verification key  ${rel(vkeyRuta)} (${vkey.nPublic} senales publicas)`);
  console.log(`  orden verificado  [${orden.join(", ")}]   segun ${rel(symRuta)}`);

  for (const puerta of opciones.puertas) {
    const documento = {
      formato: FORMATO_CONFIGURACION,
      puerta,
      provisionado: new Date().toISOString().slice(0, 10),
      evento: { etiqueta: String(etiquetaScope) },
      scope: scope.toString(),
      raiz: raiz.toString(),
      // El orden que la puerta va a usar para leer las senales por posicion.
      // Queda grabado para que el validador pueda comprobarlo sin el .sym.
      orden_senales: orden,
      fuente: fuente.nombre,
      // La copia propia de la vkey. Es lo que hace posible validar sin
      // consultar nada: verificar Groth16 no necesita mas que esto.
      verification_key: vkey,
    };
    const ruta = escribirConfiguracion(puerta, documento);

    // La lista de nulificadores es de la puerta y del evento. Si la puerta
    // venia de otro evento, la lista vieja no sirve: sus nulificadores son de
    // otro scope y nunca van a repetirse en este.
    const previos = leerUsados(puerta);
    const documentoPrevio = existsSync(rutaUsados(puerta))
      ? JSON.parse(readFileSync(rutaUsados(puerta), "utf8"))
      : null;
    const mismoEvento = documentoPrevio && documentoPrevio.scope === scope.toString();
    if (!mismoEvento) {
      escribirUsados(puerta, { scope, usados: [] });
    }

    console.log(`\n  puerta ${puerta}`);
    console.log(`    ${rel(ruta)}`);
    console.log(
      `    ${rel(rutaUsados(puerta))}  ${
        mismoEvento
          ? `(se conservan ${previos.length} nulificadores de este mismo evento)`
          : "(lista vacia)"
      }`
    );
    console.log(`    esta puerta NO comparte nada con las demas: ni archivo, ni proceso.`);
  }

  console.log(`\nPuerta${opciones.puertas.length > 1 ? "s" : ""} lista${opciones.puertas.length > 1 ? "s" : ""}. Desde aca ya se puede validar sin conexion:`);
  console.log(`  npm run validar -- --puerta ${opciones.puertas[0]} --prueba salidas/prueba.json\n`);
  console.log(`  (las senales publicas se leen en el orden [${ORDEN_SENALES.join(", ")}])`);
  console.log(`  estado local en ${rel(directorioPuerta(opciones.puertas[0]))}\n`);
  process.exit(0);
}

main().catch((e) => {
  console.error(`\n${e.name === "RangeError" || e.name === "TypeError" ? "VALOR INVALIDO" : "Error"}:`);
  console.error(e.message || e);
  if (e.name !== "RangeError" && e.name !== "TypeError" && !String(e.message).includes("ORDEN")) {
    console.error(e);
  }
  console.error("");
  process.exit(1);
});
