#!/usr/bin/env node
// Organizador v0: genera 8 identidades sinteticas, arma el arbol de compromisos,
// publica la raiz a traves de una fuenteDeRaiz y guarda los secretos aparte.
// Determinista con semilla fija. Ver docs/04-organizador.md.
//
// Uso: npm run organizador                     (scope evento-A: el que esta en datos/)
//      npm run organizador -- --scope evento-B --semilla otra
//      npm run organizador -- --scope 1235     (solo digitos: se usa tal cual)
//      npm run organizador -- --romper rango     (rotura deliberada)

import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

import { P, exigirEnCampo, secretoDeterminista, elementoDeScope } from "../lib/campo.mjs";
import { construirHashes, armarArbol, caminoDe, raizDesdeCamino } from "../lib/merkle.mjs";
import { fuenteDeRaiz } from "../fuentes/seleccion.mjs";

const raizRepo = join(dirname(fileURLToPath(import.meta.url)), "..");
const datos = join(raizRepo, "datos");

// La profundidad la fija el circuito: circuitos/pertenencia.circom compila
// Pertenencia(3). Cambiarla aca sin recompilar el circuito produce caminos que
// no encajan, asi que es constante y no opcion de linea de comandos.
const PROFUNDIDAD = 3;
const HOJAS = 2 ** PROFUNDIDAD;

const SCOPE_POR_DEFECTO = "evento-A"; // el evento que esta commiteado en datos/
const SEMILLA_POR_DEFECTO = "tpf211-hito1-parte-base";

function leerArgumentos(argv) {
  const opciones = {
    scope: elementoDeScope(SCOPE_POR_DEFECTO),
    etiquetaScope: SCOPE_POR_DEFECTO,
    semilla: SEMILLA_POR_DEFECTO,
    romper: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const valor = argv[i + 1];
    if (argv[i] === "--scope") {
      // Un numero se usa tal cual; una etiqueta ("evento-A") se deriva con la
      // misma funcion que usa el prover. Los dos tienen que coincidir o el
      // nulificador de un lado no es el del otro. Ver lib/campo.mjs.
      opciones.scope = elementoDeScope(valor);
      if (String(opciones.scope) !== String(valor)) opciones.etiquetaScope = valor;
      i++;
    } else if (argv[i] === "--semilla") {
      opciones.semilla = valor;
      i++;
    } else if (argv[i] === "--romper") {
      opciones.romper = valor;
      i++;
    } else {
      console.error(`\nArgumento desconocido: ${argv[i]}`);
      console.error("Uso: npm run organizador -- [--scope N] [--semilla texto] [--romper rango]\n");
      process.exit(1);
    }
  }
  return opciones;
}

// Las ocho identidades de la parte base. El organizador las genera el: es la
// limitacion de este escalon y cambia en T12, donde cada comprador genera su
// secreto y solo envia el compromiso. Ver la seccion 6 del doc.
function generarIdentidades(semilla, hash1, romper) {
  const identidades = [];
  for (let posicion = 0; posicion < HOJAS; posicion++) {
    const { secreto, descartados } = secretoDeterminista(semilla, posicion);
    // Rotura deliberada de la seccion 5: un secreto corrido un multiplo exacto
    // de p. Poseidon lo reduce en silencio y daria el mismo compromiso que el
    // original; la validacion de rango es lo unico que lo ve.
    const valor = romper === "rango" && posicion === 3 ? secreto + P : secreto;
    exigirEnCampo(valor, `secreto de la posicion ${posicion}`);
    identidades.push({ posicion, secreto: valor, compromiso: hash1(valor), descartados });
  }
  return identidades;
}

function guardarJson(ruta, documento) {
  mkdirSync(dirname(ruta), { recursive: true });
  writeFileSync(ruta, `${JSON.stringify(documento, null, 2)}\n`);
  return relative(raizRepo, ruta).replaceAll("\\", "/");
}

async function main() {
  const opciones = leerArgumentos(process.argv.slice(2));
  const fallas = [];

  console.log("\nOrganizador v0 - parte base\n");
  exigirEnCampo(opciones.scope, "scope del evento");

  const fuente = await fuenteDeRaiz();
  console.log(`  fuente de raiz    ${fuente.nombre}`);
  console.log(
    `  scope del evento  ${opciones.scope}${opciones.etiquetaScope ? `  (etiqueta ${opciones.etiquetaScope})` : ""}`
  );
  console.log(`  semilla           ${opciones.semilla}`);
  console.log(`  profundidad       ${PROFUNDIDAD} (${HOJAS} identidades)`);

  const { hash1, hash2 } = await construirHashes();

  // Primero se le pregunta a la fuente si ella sabe que compromisos hay. La
  // fuente JSON contesta que no y el organizador los inventa; el contrato de
  // T12 va a contestar con los que enviaron los compradores, y esta linea no
  // cambia. Ese es todo el mecanismo de la escalera.
  const compromisosDeLaFuente = await fuente.leerCompromisos(opciones.scope);
  let identidades = null;
  let compromisos;
  if (compromisosDeLaFuente) {
    compromisos = compromisosDeLaFuente;
    console.log(`\n  la fuente aporto ${compromisos.length} compromisos: el organizador no genera secretos`);
  } else {
    identidades = generarIdentidades(opciones.semilla, hash1, opciones.romper);
    compromisos = identidades.map((i) => i.compromiso);
    console.log("\n  la fuente no origina compromisos: los genera el organizador (limitacion de la parte base)");
  }

  console.log("\nIdentidades\n");
  console.log("  pos  compromiso = Poseidon(secreto)");
  for (const [posicion, compromiso] of compromisos.entries()) {
    console.log(`  ${String(posicion).padStart(3)}  ${compromiso}`);
  }
  if (identidades) {
    const descartados = identidades.reduce((n, i) => n + i.descartados, 0);
    console.log(`\n  candidatos descartados por caer fuera de [0, p): ${descartados}`);
  }

  // Dos compromisos iguales serian dos hojas iguales: la misma entrada contada
  // dos veces y un nulificador compartido. Con secretos derivados de la semilla
  // es practicamente imposible, pero es el control que cuesta una linea.
  if (new Set(compromisos.map(String)).size !== compromisos.length) {
    fallas.push("hay compromisos repetidos");
  }

  const { niveles, raiz } = armarArbol(compromisos, hash2);
  console.log(`\nArbol\n\n  raiz              ${raiz}`);

  // Control de determinismo: la misma semilla tiene que dar la misma raiz. Se
  // rehace el trabajo entero en vez de confiar en que el codigo es puro.
  if (identidades && !opciones.romper) {
    const repetido = generarIdentidades(opciones.semilla, hash1, null);
    const { raiz: raizRepetida } = armarArbol(repetido.map((i) => i.compromiso), hash2);
    const determinista = raizRepetida === raiz;
    console.log(`  determinista      ${determinista ? "si" : "NO"} (misma semilla, misma raiz)`);
    if (!determinista) fallas.push("dos corridas con la misma semilla dieron raices distintas");
  }

  // Cada hoja tiene que llegar a la raiz por su camino. Es lo mismo que va a
  // hacer el circuito adentro, hecho aca en JavaScript y sin ninguna prueba: si
  // esto no cierra, no tiene sentido intentar probar nada en T06.
  let caminosOk = true;
  for (let posicion = 0; posicion < compromisos.length; posicion++) {
    const { camino, indices } = caminoDe(niveles, posicion);
    if (raizDesdeCamino(compromisos[posicion], camino, indices, hash2) !== raiz) {
      caminosOk = false;
    }
  }
  console.log(`  caminos validos   ${caminosOk ? `si (${compromisos.length}/${compromisos.length})` : "NO"}`);
  if (!caminosOk) fallas.push("alguna hoja no llega a la raiz por su camino");

  console.log("\nArtefactos\n");

  // El padron: publico por definicion. Cualquiera tiene que poder armar su
  // camino de Merkle con esto, y que sea publico no revela quien es quien.
  const rutaArbol = guardarJson(join(datos, "arbol.json"), {
    formato: "arbol-de-compromisos@1",
    scope: opciones.scope.toString(),
    profundidad: PROFUNDIDAD,
    raiz: raiz.toString(),
    compromisos: compromisos.map(String),
    generado: new Date().toISOString().slice(0, 10),
  });
  console.log(`  padron publico    ${rutaArbol}`);

  // Los secretos, en un archivo aparte. Estan separados porque son cosas
  // distintas: el padron se publica, esto no. Que el organizador pueda
  // escribirlo es la limitacion de la parte base.
  if (identidades) {
    const rutaSecretos = guardarJson(join(datos, "secretos.json"), {
      formato: "secretos-de-compradores@1",
      advertencia:
        "En el sistema real el organizador NUNCA conoce estos valores: cada comprador " +
        "genera el suyo y solo envia el compromiso. Aca los genera el porque la parte " +
        "base no tiene compradores. Ver docs/04-organizador.md, seccion 6.",
      scope: opciones.scope.toString(),
      semilla: opciones.semilla,
      identidades: identidades.map((i) => ({
        posicion: i.posicion,
        secreto: i.secreto.toString(),
        compromiso: i.compromiso.toString(),
      })),
    });
    console.log(`  secretos          ${rutaSecretos}  <- lo que guardaria cada comprador`);
  }

  const { referencia } = await fuente.publicarRaiz({
    scope: opciones.scope,
    raiz,
    profundidad: PROFUNDIDAD,
  });
  console.log(`  raiz publicada    ${relative(raizRepo, referencia).replaceAll("\\", "/")}`);

  // Ida y vuelta por la interfaz: la raiz que devuelve la fuente tiene que ser
  // la misma que se publico, como BigInt. Es el control que cualquier
  // implementacion nueva de fuenteDeRaiz tiene que pasar.
  const raizLeida = await fuente.leerRaiz(opciones.scope);
  const ida = raizLeida === raiz;
  console.log(`\n  leerRaiz(scope) == raiz publicada   ${ida ? "si" : "NO"}`);
  if (!ida) fallas.push(`leerRaiz devolvio ${raizLeida} en vez de ${raiz}`);

  // Un scope que no se publico tiene que dar null, no 0 ni la raiz de otro
  // evento. El 0 es la trampa: es lo que devuelve un mapping vacio en Solidity.
  const otro = await fuente.leerRaiz(opciones.scope + 1n);
  console.log(`  leerRaiz(otro scope) == null        ${otro === null ? "si" : `NO (devolvio ${otro})`}`);
  if (otro !== null) fallas.push("la fuente devolvio una raiz para un scope que no se publico");

  if (fallas.length) {
    console.error("\nORGANIZADOR NO VALIDADO.\n");
    for (const f of fallas) console.error(`  - ${f}`);
    console.error("\nVer docs/04-organizador.md.\n");
    process.exit(1);
  }

  console.log("\nArbol publicado. El conjunto de anonimato de este evento es de 8 personas:");
  console.log("ridiculamente chico, y por que importa esta en docs/04-organizador.md.\n");
  process.exit(0);
}

main().catch((e) => {
  // Un secreto fuera de [0, p) llega aca: la validacion tira y el comando falla
  // con el detalle. Es a proposito que sea ruidoso y no una correccion callada.
  console.error(`\n${e.name === "RangeError" || e.name === "TypeError" ? "VALOR INVALIDO" : "Error inesperado"}:`);
  console.error(e.message || e);
  if (e.name !== "RangeError" && e.name !== "TypeError") console.error(e);
  console.error("");
  process.exit(1);
});
