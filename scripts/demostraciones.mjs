#!/usr/bin/env node
// Demostraciones: las siete corridas que cierran la fase 1.
//
// Uso: npm test
//
// Esta suite no reimplementa ningun chequeo. Corre los comandos de verdad
// —organizador, prover, provisionar-puerta, validador— como procesos separados,
// igual que los correria una persona, y se limita a comparar el resultado
// obtenido contra el esperado. Si los chequeos vivieran aca, la suite se
// estaria probando a si misma en vez de probar el sistema.
//
// Parte de cero en cada corrida: las dos puertas de la demo son suyas
// (puertas/puerta-demo-a1 y -a2), las borra al arrancar y las provisiona de
// nuevo. Por eso `npm test` da lo mismo corrido dos veces seguidas, que es
// justamente lo que fallaba cuando la demo usaba las puertas 1 y 2 a mano: la
// lista de nulificadores sobrevive entre corridas y el caso 1 pasaba el primer
// dia y fallaba el segundo por doble ingreso.
//
// Ver docs/07-demostraciones.md.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

import * as snarkjs from "snarkjs";

import { exigirEnCampo, elementoDeScope } from "../lib/campo.mjs";
import { construirHashes, armarArbol, caminoDe } from "../lib/merkle.mjs";
import { escribirSobreJson, escribirSobreBinario } from "../lib/sobre.mjs";
import { cerrarCurva, BYTES_ELEMENTO, BYTES_PRUEBA_COMPRIMIDA } from "../lib/prueba-binaria.mjs";
import { indiceDe } from "../lib/senales.mjs";
import { RAIZ_REPO, directorioPuerta, leerUsados } from "../lib/puerta.mjs";

const datos = join(RAIZ_REPO, "datos");
const build = join(RAIZ_REPO, "build");
const salidas = join(RAIZ_REPO, "salidas");
const demo = join(salidas, "demostraciones");

const rel = (p) => relative(RAIZ_REPO, p).replaceAll("\\", "/");

// Las puertas de la demo son de la demo. Las puertas 1 y 2 son las que Patricio
// usa a mano siguiendo docs/06-validador.md, y esta suite no las toca: ni les
// borra la lista, ni les cambia el evento.
const PUERTA_A1 = "demo-a1";
const PUERTA_A2 = "demo-a2";

const IDENTIDAD = 3;
const EVENTO_A = "evento-A";
const EVENTO_B = "evento-B";

const SALIDA_ACEPTADA = 0;
const SALIDA_RECHAZADA = 2;

// --- Correr los comandos de verdad ---

// Se invoca el script con el mismo node que corre esta suite, en vez de pasar
// por `npm run`, porque npm agrega un proceso intermedio por comando y no
// aporta nada: los argumentos y el codigo de salida son los mismos.
function correr(script, args) {
  const r = spawnSync(process.execPath, [join(RAIZ_REPO, "scripts", script), ...args], {
    cwd: RAIZ_REPO,
    encoding: "utf8",
  });
  if (r.error) throw r.error;
  return { codigo: r.status, salida: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

function preparar(etiqueta, comandoNpm, script, args) {
  process.stdout.write(`  ${etiqueta.padEnd(36)}${comandoNpm}\n`);
  const r = correr(script, args);
  if (r.codigo !== 0) {
    console.error(`\nLa preparacion fallo en:  ${comandoNpm}\n`);
    console.error(r.salida);
    process.exit(1);
  }
  return r;
}

// --- Leer lo que dijo el validador ---
//
// El validador ya habla: imprime cada chequeo con OK o FALLA y termina con un
// veredicto de una linea. La suite lee eso y el codigo de salida (0 acepta,
// 2 rechaza, 1 no pudo trabajar) en vez de volver a decidir por su cuenta.
function parsearValidador({ codigo, salida }) {
  const chequeos = [];
  for (const linea of salida.split("\n")) {
    const m = linea.match(/^ {2}(\d)\s{2}(.+?)\s{2,}(OK|FALLA)\s*(.*)$/);
    if (m) chequeos.push({ n: Number(m[1]), titulo: m[2].trim(), ok: m[3] === "OK", detalle: m[4].trim() });
  }
  const rechazo = salida.match(/^RECHAZADA por el chequeo (\d+) \(([a-z]+)\)\./m);
  const veredicto = /^PASE\./m.test(salida) ? "PASE" : rechazo ? "RECHAZADA" : "?";
  return {
    codigo,
    salida,
    veredicto,
    fallo: rechazo ? rechazo[2] : null,
    numeroFallo: rechazo ? Number(rechazo[1]) : null,
    chequeos,
  };
}

const describir = (v) =>
  v.veredicto === "PASE"
    ? `PASE (codigo ${v.codigo})`
    : v.veredicto === "RECHAZADA"
      ? `RECHAZADA en el chequeo ${v.numeroFallo} (${v.fallo}), codigo ${v.codigo}`
      : `sin veredicto (codigo ${v.codigo})`;

// --- Preparacion: el estado de cero ---

function exigirArtefacto(ruta, comando) {
  if (!existsSync(ruta)) {
    console.error(`\nFalta ${rel(ruta)}.`);
    console.error(`Corre primero:  ${comando}`);
    console.error("\nUn clon recien bajado no trae build/ (esta en .gitignore): el circuito y el");
    console.error("setup se rehacen en la maquina. Ver docs/07-demostraciones.md, seccion 5.\n");
    process.exit(1);
  }
}

function sobreDesdeSalidas(nombre) {
  const prueba = JSON.parse(readFileSync(join(salidas, "prueba.json"), "utf8"));
  const senales = JSON.parse(readFileSync(join(salidas, "senales-publicas.json"), "utf8"));
  return {
    senales,
    json: escribirSobreJson(join(demo, `${nombre}.json`), {
      prueba,
      senales,
      nota: `Sobre de ${nombre} generado por npm test. Ver docs/07-demostraciones.md.`,
    }),
    prueba,
  };
}

async function prepararTodo() {
  console.log("\nDemostraciones - las siete corridas de la fase 1\n");
  console.log("Preparacion (parte de cero en cada corrida)\n");

  exigirArtefacto(join(build, "pertenencia_js", "pertenencia.wasm"), "npm run circuito:pertenencia");
  exigirArtefacto(join(build, "pertenencia.sym"), "npm run circuito:pertenencia");
  exigirArtefacto(join(build, "setup", "pertenencia.zkey"), "npm run setup");
  exigirArtefacto(join(build, "setup", "verification_key.json"), "npm run setup");

  // Lo unico que esta suite borra es lo que esta suite escribe. Sin esto, la
  // lista de nulificadores de la corrida de ayer hace fallar el caso 1 de hoy.
  for (const puerta of [PUERTA_A1, PUERTA_A2]) {
    rmSync(directorioPuerta(puerta), { recursive: true, force: true });
  }
  rmSync(demo, { recursive: true, force: true });
  mkdirSync(demo, { recursive: true });
  console.log(`  estado borrado                      puertas/puerta-{${PUERTA_A1},${PUERTA_A2}}/ y ${rel(demo)}/`);

  // El evento B primero: el organizador publica una raiz por vez en
  // datos/raiz.json, asi que se genera la prueba de B y despues se vuelve a
  // dejar publicado el evento A, que es como estaba el repo antes de correr.
  preparar("evento B: padron y raiz", `npm run organizador -- --scope ${EVENTO_B}`, "organizador.mjs", ["--scope", EVENTO_B]);
  preparar(
    "evento B: prueba de la identidad 3",
    `npm run probar -- --identidad ${IDENTIDAD} --scope ${EVENTO_B} --corridas 1`,
    "prover.mjs",
    ["--identidad", String(IDENTIDAD), "--scope", EVENTO_B, "--corridas", "1"]
  );
  const sobreB = sobreDesdeSalidas("sobre-evento-B");

  preparar("evento A: padron y raiz", `npm run organizador -- --scope ${EVENTO_A}`, "organizador.mjs", ["--scope", EVENTO_A]);
  preparar(
    "evento A: prueba de la identidad 3",
    `npm run probar -- --identidad ${IDENTIDAD} --scope ${EVENTO_A} --corridas 1`,
    "prover.mjs",
    ["--identidad", String(IDENTIDAD), "--scope", EVENTO_A, "--corridas", "1"]
  );
  const sobreA = sobreDesdeSalidas("sobre-evento-A");

  preparar(
    "dos puertas del evento A",
    `npm run puerta:provisionar -- --puerta ${PUERTA_A1},${PUERTA_A2} --scope ${EVENTO_A}`,
    "provisionar-puerta.mjs",
    ["--puerta", `${PUERTA_A1},${PUERTA_A2}`, "--scope", EVENTO_A]
  );

  // El sobre binario del caso 6. El byte que se altera es el ultimo del
  // nulificador: las senales van en big-endian, asi que tocar el byte 31 del
  // primer elemento cambia el valor en 1 y lo deja adentro del campo. Por que
  // no se toca un byte de la prueba esta en docs/07-demostraciones.md.
  const rutaBin = await escribirSobreBinario(join(demo, "sobre-evento-A.bin"), {
    prueba: sobreA.prueba,
    senales: sobreA.senales,
  });
  const crudo = readFileSync(rutaBin);
  const posicionByte = BYTES_PRUEBA_COMPRIMIDA + indiceDe("nulificador") * BYTES_ELEMENTO + (BYTES_ELEMENTO - 1);
  crudo[posicionByte] ^= 0x01;
  const rutaAlterada = join(demo, "sobre-evento-A-alterado.bin");
  writeFileSync(rutaAlterada, crudo);
  console.log(`  sobre con un byte alterado          ${rel(rutaAlterada)} (byte ${posicionByte} de ${crudo.length})`);

  console.log("");
  return { sobreA, sobreB, rutaAlterada, posicionByte };
}

// --- Los siete casos ---

function casos({ sobreA, sobreB, rutaAlterada, posicionByte }) {
  const validar = (puerta, archivo) =>
    parsearValidador(correr("validador.mjs", ["--puerta", puerta, "--prueba", rel(archivo)]));

  return [
    {
      titulo: "una entrada legitima entra por la puerta A1",
      muestra: "los cuatro chequeos dan bien y la puerta anota el nulificador sin saber de quien es",
      esperado: "PASE (codigo 0), los 4 chequeos OK",
      async ejecutar() {
        const v = validar(PUERTA_A1, sobreA.json);
        const usados = leerUsados(PUERTA_A1);
        return {
          ok:
            v.codigo === SALIDA_ACEPTADA &&
            v.veredicto === "PASE" &&
            v.chequeos.length === 4 &&
            v.chequeos.every((c) => c.ok) &&
            usados.length === 1 &&
            usados[0].nulificador === sobreA.senales[indiceDe("nulificador")],
          obtenido: `${describir(v)}, ${v.chequeos.filter((c) => c.ok).length}/${v.chequeos.length} chequeos OK`,
          notas: [`la lista de la puerta ${PUERTA_A1} quedo con ${usados.length} nulificador`],
          registro: v,
        };
      },
    },
    {
      titulo: "la misma prueba, otra vez, en la misma puerta",
      muestra: "el nulificador es lo que hace reconocible el segundo uso, sin identificar a nadie",
      esperado: "RECHAZADA en el chequeo 4 (nulificador), codigo 2",
      async ejecutar() {
        const v = validar(PUERTA_A1, sobreA.json);
        const usados = leerUsados(PUERTA_A1);
        return {
          ok:
            v.codigo === SALIDA_RECHAZADA &&
            v.fallo === "nulificador" &&
            v.numeroFallo === 4 &&
            usados.length === 1,
          obtenido: describir(v),
          notas: [`la lista de la puerta ${PUERTA_A1} sigue con ${usados.length} nulificador: un rechazo no anota nada`],
          registro: v,
        };
      },
    },
    {
      titulo: "la misma prueba entra por la puerta A2",
      muestra: "el agujero de coordinacion: dos listas locales sin canal no pueden saber lo que vio la otra (ADR-009)",
      esperado: "PASE (codigo 0). Es el resultado esperado, no un fallo de la suite",
      async ejecutar() {
        const v = validar(PUERTA_A2, sobreA.json);
        const a1 = leerUsados(PUERTA_A1);
        const a2 = leerUsados(PUERTA_A2);
        const mismoNulificador = a1[0]?.nulificador === a2[0]?.nulificador;
        return {
          ok: v.codigo === SALIDA_ACEPTADA && v.veredicto === "PASE" && mismoNulificador,
          obtenido: describir(v),
          notas: [
            `la misma entrada entro dos veces: ${a1.length} en ${PUERTA_A1} y ${a2.length} en ${PUERTA_A2}`,
            `y las dos listas tienen el mismo nulificador: ${mismoNulificador ? "si" : "NO"}`,
            "no lo resuelve el ZK: hace falta que alguien mire las dos puertas",
          ],
          registro: v,
        };
      },
    },
    {
      titulo: "la misma identidad con otro scope da otro nulificador",
      muestra: "el nulificador es Poseidon(secreto, scope): determinista por evento, distinto entre eventos",
      esperado: "dos nulificadores distintos, cada uno igual al Poseidon(secreto, scope) calculado en JS",
      async ejecutar() {
        const bolsa = JSON.parse(readFileSync(join(datos, "secretos.json"), "utf8"));
        const secreto = exigirEnCampo(
          BigInt(bolsa.identidades.find((i) => i.posicion === IDENTIDAD).secreto),
          `secreto de la identidad ${IDENTIDAD}`
        );
        const { hash2 } = await construirHashes();

        const nA = BigInt(sobreA.senales[indiceDe("nulificador")]);
        const nB = BigInt(sobreB.senales[indiceDe("nulificador")]);
        const esperadoA = hash2(secreto, elementoDeScope(EVENTO_A));
        const esperadoB = hash2(secreto, elementoDeScope(EVENTO_B));

        // Lo unico que se puede afirmar mirando dos numeros es que son
        // distintos y que no se parecen. Que sean imposibles de vincular es una
        // propiedad criptografica de Poseidon que esta PoC no demuestra.
        const hexA = nA.toString(16).padStart(64, "0");
        const hexB = nB.toString(16).padStart(64, "0");
        let prefijo = 0;
        while (prefijo < hexA.length && hexA[prefijo] === hexB[prefijo]) prefijo++;

        return {
          ok: nA !== nB && nA === esperadoA && nB === esperadoB,
          obtenido: `distintos, y cada uno coincide con Poseidon(secreto, scope) en JS`,
          notas: [
            `evento A  ${nA}`,
            `evento B  ${nB}`,
            `comparten ${prefijo} de 64 digitos hexadecimales de prefijo`,
            "sin relacion visible. No se afirma mas que eso: que sean invinculables es",
            "una propiedad de Poseidon, no algo que estas dos corridas demuestren",
          ],
        };
      },
    },
    {
      titulo: "una prueba del evento B en una puerta del evento A",
      muestra: "el chequeo 1 no la atrapa —el padron es el mismo— y el chequeo 2 si",
      esperado: "RECHAZADA en el chequeo 2 (scope), codigo 2, con el chequeo 1 en OK",
      async ejecutar() {
        const v = validar(PUERTA_A1, sobreB.json);
        const raizOk = v.chequeos.find((c) => c.n === 1)?.ok === true;
        return {
          ok: v.codigo === SALIDA_RECHAZADA && v.fallo === "scope" && v.numeroFallo === 2 && raizOk,
          obtenido: `${describir(v)}, chequeo 1 (raiz) ${raizOk ? "OK" : "FALLA"}`,
          notas: [
            "la raiz coincide porque las mismas ocho personas compraron para los dos eventos:",
            "sin el chequeo del scope, la misma identidad entraria una vez por evento",
          ],
          registro: v,
        };
      },
    },
    {
      titulo: "un sobre con un byte alterado",
      muestra: "verificar Groth16 es una ecuacion entre la prueba y sus senales: cambiar una rompe la igualdad",
      esperado: "RECHAZADA en el chequeo 3 (cripto), codigo 2, con los chequeos 1 y 2 en OK",
      async ejecutar() {
        const v = validar(PUERTA_A1, rutaAlterada);
        const previosOk = [1, 2].every((n) => v.chequeos.find((c) => c.n === n)?.ok === true);
        return {
          ok: v.codigo === SALIDA_RECHAZADA && v.fallo === "cripto" && v.numeroFallo === 3 && previosOk,
          obtenido: `${describir(v)}, chequeos 1 y 2 ${previosOk ? "OK" : "no"}`,
          notas: [
            `se altero el byte ${posicionByte}: el menos significativo del nulificador`,
            "la raiz y el scope siguen siendo los correctos, asi que los dos primeros pasan",
          ],
          registro: v,
        };
      },
    },
    {
      titulo: "un secreto que no esta en el arbol no llega a generar prueba",
      muestra: "este es el unico caso que no falla en la puerta: falla antes, en el telefono del atacante",
      esperado: "snarkjs.wtns.calculate tira: el circuito no encuentra un witness que satisfaga sus restricciones",
      async ejecutar() {
        const padron = JSON.parse(readFileSync(join(datos, "arbol.json"), "utf8"));
        const compromisos = padron.compromisos.map((c) => BigInt(c));
        const { hash2 } = await construirHashes();
        const { niveles, raiz } = armarArbol(compromisos, hash2);

        // El camino de la posicion 3 es el real y publico: cualquiera lo arma
        // desde datos/arbol.json. Lo unico que el atacante no tiene es el
        // secreto de esa hoja, asi que pone el suyo. El circuito calcula
        // Poseidon(secreto), sube por el camino y le da otra raiz: la
        // restriccion que compara con la raiz publica no cierra.
        const { camino, indices } = caminoDe(niveles, IDENTIDAD);
        const secretoIntruso = 424242424242424242424242n;
        const entrada = {
          secreto: secretoIntruso.toString(),
          camino: camino.map(String),
          indices: indices.map(String),
          raiz: raiz.toString(),
          scope: elementoDeScope(EVENTO_A).toString(),
        };

        // circom_runtime avisa del assert fallido con un console.log propio,
        // que saldria suelto en el medio del informe. Se captura para mostrarlo
        // como parte del caso: es evidencia, no ruido que convenga esconder.
        const rutaWtns = join(demo, "intruso.wtns");
        const dichoPorElCircuito = [];
        const previos = { log: console.log, error: console.error };
        console.log = console.error = (...partes) => dichoPorElCircuito.push(partes.join(" ").trim());

        let error = null;
        try {
          await snarkjs.wtns.calculate(entrada, join(build, "pertenencia_js", "pertenencia.wasm"), rutaWtns);
        } catch (e) {
          error = e;
        } finally {
          console.log = previos.log;
          console.error = previos.error;
        }

        // snarkjs abre el archivo de salida antes de calcular, asi que queda un
        // archivo de cero bytes. Que exista no significa que haya witness.
        const bytes = existsSync(rutaWtns) ? statSync(rutaWtns).size : null;
        return {
          ok: error !== null && bytes === 0,
          obtenido: error
            ? `tiro ${error.name}: ${String(error.message).replace(/^Error:\s*/, "").split("\n")[0].trim()}`
            : "NO tiro: se calculo el witness, que es exactamente lo que no tendria que pasar",
          notas: [
            ...dichoPorElCircuito.map((l) => `el circuito dijo: ${l}`),
            "la linea 57 de circuitos/pertenencia.circom es la que compara la raiz calculada",
            "con la raiz publica: es esa restriccion la que no cierra",
            `${rel(rutaWtns)} quedo en ${bytes} bytes: snarkjs abre el archivo antes de calcular`,
            "no hay prueba que presentar: el atacante no llega a la puerta",
            "el prover (npm run probar) lo corta todavia antes, comparando Poseidon(secreto)",
            "con la hoja del padron; la suite pasa por abajo de esa guarda para mostrar que",
            "quien rechaza es el circuito y no el script",
          ],
        };
      },
    },
  ];
}

// --- Main ---

async function main() {
  const preparado = await prepararTodo();
  const lista = casos(preparado);
  const resultados = [];

  for (const [i, caso] of lista.entries()) {
    const n = i + 1;
    console.log(`Caso ${n} - ${caso.titulo}\n`);
    const r = await caso.ejecutar();
    console.log(`  esperado    ${caso.esperado}`);
    console.log(`  obtenido    ${r.obtenido}`);
    for (const nota of r.notas ?? []) console.log(`              ${nota}`);
    console.log(`  muestra     ${caso.muestra}`);
    console.log(`\n  ${r.ok ? "OK" : "FALLA"}\n`);
    resultados.push({ n, titulo: caso.titulo, esperado: caso.esperado, obtenido: r.obtenido, ok: r.ok });
  }

  const bien = resultados.filter((r) => r.ok).length;

  console.log("Resumen\n");
  for (const r of resultados) {
    console.log(`  ${r.ok ? "OK   " : "FALLA"} ${String(r.n).padStart(2)}  ${r.titulo}`);
  }
  console.log(`\n  ${bien} de ${resultados.length} casos dan lo esperado.`);

  writeFileSync(
    join(demo, "resultado.json"),
    `${JSON.stringify(
      {
        formato: "demostraciones@1",
        fecha: new Date().toISOString(),
        identidad: IDENTIDAD,
        eventos: [EVENTO_A, EVENTO_B],
        puertas: [PUERTA_A1, PUERTA_A2],
        casos: resultados,
        todos_esperados: bien === resultados.length,
      },
      null,
      2
    )}\n`
  );

  console.log(`\n  detalle en ${rel(join(demo, "resultado.json"))}`);
  console.log("\n  Lo que el ZK NO resuelve: el caso 3. Dos puertas sin canal entre ellas dejan");
  console.log("  pasar la misma entrada dos veces, y eso es el frente ADR-009 del TPF.");
  console.log("  Lo que el ZK SI resuelve: en los siete casos la puerta decidio sin aprender");
  console.log("  cual de las ocho identidades tenia adelante.");
  console.log("\nVer docs/07-demostraciones.md.\n");

  await cerrarCurva();
  process.exit(bien === resultados.length ? 0 : 1);
}

main().catch(async (e) => {
  await cerrarCurva().catch(() => {});
  console.error(`\n${e.name === "RangeError" || e.name === "TypeError" ? "VALOR INVALIDO" : "Error inesperado"}:`);
  console.error(e.message || e);
  if (e.name !== "RangeError" && e.name !== "TypeError") console.error(e);
  console.error("");
  process.exit(1);
});
