#!/usr/bin/env node
// Ataque del arbol propio: por que los dos primeros chequeos son los criticos.
//
// El atacante no conoce ningun secreto del evento. Lo que hace es armar SU
// PROPIO arbol de Merkle, con ocho secretos que invento el, y generar una prueba
// Groth16 contra la raiz de ese arbol. Esa prueba es impecable: verifica contra
// la misma verification key del evento, porque demuestra un enunciado
// verdadero —"conozco un secreto cuyo compromiso esta en el arbol de raiz R"—.
// Lo unico que pasa es que R no es la raiz del evento.
//
// Un validador que confie en los valores publicos que le trae la prueba, en vez
// de compararlos con los suyos, acepta. Uno que compare primero, rechaza. Los
// dos corren EL MISMO codigo de lib/puerta.mjs: la unica diferencia es que al
// ingenuo se le omiten los chequeos 1 y 2.
//
// Uso: npm run ataque:raiz-propia
//      npm run ataque:raiz-propia -- --puerta 1
//
// Ver docs/06-validador.md, seccion 3.

import { mkdirSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

import * as snarkjs from "snarkjs";

import { exigirEnCampo, secretoDeterminista } from "../lib/campo.mjs";
import { construirHashes, armarArbol, caminoDe } from "../lib/merkle.mjs";
import { cerrarCurva } from "../lib/prueba-binaria.mjs";
import { escribirSobreJson, escribirSobreBinario } from "../lib/sobre.mjs";
import { indiceDe, ORDEN_SENALES } from "../lib/senales.mjs";
import { RAIZ_REPO, correrChequeos, leerConfiguracion, leerUsados, rutaConfiguracion } from "../lib/puerta.mjs";

const salidas = join(RAIZ_REPO, "salidas", "ataque");
const build = join(RAIZ_REPO, "build");
// Los tres artefactos que el atacante necesita son PUBLICOS: el .wasm y la zkey
// se distribuyen con la aplicacion del comprador, y la verification key es
// publica por definicion. Que los tenga no es una falla del sistema.
const wasm = join(build, "pertenencia_js", "pertenencia.wasm");
const zkey = join(build, "setup", "pertenencia.zkey");

const HOJAS = 8;
const PROFUNDIDAD = 3;
const SEMILLA_ATACANTE = "arbol-del-atacante";

const rel = (p) => relative(RAIZ_REPO, p).replaceAll("\\", "/");
const corto = (n) => `${String(n).slice(0, 12)}...${String(n).slice(-8)}`;

function leerArgumentos(argv) {
  const opciones = { puerta: "1" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--puerta") {
      opciones.puerta = argv[i + 1];
      i++;
    } else {
      console.error(`\nArgumento desconocido: ${argv[i]}`);
      console.error("Uso: npm run ataque:raiz-propia -- [--puerta 1]\n");
      process.exit(1);
    }
  }
  return opciones;
}

function mostrarChequeos(resultados) {
  for (const [i, r] of resultados.entries()) {
    if (r.omitido) {
      console.log(`    ${i + 1}  ${r.titulo.padEnd(48)}NO LO HACE`);
      continue;
    }
    console.log(`    ${i + 1}  ${r.titulo.padEnd(48)}${r.ok ? "OK" : "FALLA"}`);
  }
}

async function main() {
  const opciones = leerArgumentos(process.argv.slice(2));

  console.log("\nAtaque del arbol propio - contra un validador ingenuo\n");

  for (const [ruta, comando] of [
    [wasm, "npm run circuito:pertenencia"],
    [zkey, "npm run setup"],
  ]) {
    if (!existsSync(ruta)) {
      console.error(`\nFalta ${rel(ruta)}.\nCorre primero:  ${comando}\n`);
      process.exit(1);
    }
  }

  const configuracion = leerConfiguracion(opciones.puerta);
  if (!configuracion) {
    console.error(`\nLa puerta ${opciones.puerta} no esta provisionada: falta ${rel(rutaConfiguracion(opciones.puerta))}.`);
    console.error(`Corre primero:  npm run puerta:provisionar -- --puerta ${opciones.puerta} --scope evento-A\n`);
    process.exit(1);
  }

  // El scope es publico: el atacante sabe a que evento va. La raiz del evento
  // tambien es publica, y no le sirve de nada: no conoce ningun secreto cuyo
  // compromiso este adentro.
  const scope = exigirEnCampo(BigInt(configuracion.scope), "scope del evento atacado");
  const raizDelEvento = exigirEnCampo(BigInt(configuracion.raiz), "raiz del evento atacado");

  console.log(`  evento atacado    ${configuracion.evento?.etiqueta ?? "?"} -> ${scope}`);
  console.log(`  raiz del evento   ${raizDelEvento}`);
  console.log(`  el atacante conoce cero secretos de ese arbol.\n`);

  // --- Paso 1: el atacante arma su propio arbol ---
  const { hash1, hash2 } = await construirHashes();
  const secretos = [];
  const compromisos = [];
  for (let posicion = 0; posicion < HOJAS; posicion++) {
    const { secreto } = secretoDeterminista(SEMILLA_ATACANTE, posicion);
    secretos.push(secreto);
    compromisos.push(hash1(secreto));
  }
  const { niveles, raiz: raizFalsa } = armarArbol(compromisos, hash2);

  console.log("Paso 1 - el atacante arma su arbol\n");
  console.log(`  ${HOJAS} secretos inventados por el, profundidad ${PROFUNDIDAD}`);
  console.log(`  raiz propia       ${raizFalsa}`);
  console.log(`  es la del evento  ${raizFalsa === raizDelEvento ? "si" : "NO"}\n`);

  // --- Paso 2: genera una prueba perfectamente valida contra SU raiz ---
  const posicion = 3;
  const { camino, indices } = caminoDe(niveles, posicion);
  mkdirSync(salidas, { recursive: true });
  const wtns = join(salidas, "ataque.wtns");

  const t0 = process.hrtime.bigint();
  await snarkjs.wtns.calculate(
    {
      secreto: secretos[posicion].toString(),
      camino: camino.map(String),
      indices: indices.map(String),
      raiz: raizFalsa.toString(),
      scope: scope.toString(),
    },
    wasm,
    wtns
  );
  const { proof, publicSignals } = await snarkjs.groth16.prove(zkey, wtns, null);
  const msGeneracion = Number(process.hrtime.bigint() - t0) / 1e6;

  const vkey = configuracion.verification_key;
  const verifica = await snarkjs.groth16.verify(vkey, publicSignals, proof, null);

  console.log("Paso 2 - genera la prueba, con el mismo wasm y la misma zkey\n");
  console.log(`  tardo             ${msGeneracion.toFixed(1)} ms`);
  for (const [i, nombre] of ORDEN_SENALES.entries()) {
    console.log(`  ${nombre.padEnd(18)}${publicSignals[i]}`);
  }
  console.log(`\n  verifica contra la verification key DEL EVENTO   ${verifica ? "SI" : "no"}`);
  console.log("  No esta rota ni falsificada: demuestra un enunciado verdadero.");
  console.log("  El enunciado es 'conozco un secreto del arbol de raiz X'. Y es cierto:");
  console.log("  el arbol de raiz X lo armo el.\n");

  if (!verifica) {
    console.error("El ataque no llego a construirse: la prueba no verifica. Revisar el setup.\n");
    await cerrarCurva();
    process.exit(1);
  }

  const sobre = { prueba: proof, senales: publicSignals.map(String), bytes: 0, formato: "sobre del atacante" };
  const rutaJson = escribirSobreJson(join(salidas, "sobre-atacante.json"), {
    prueba: proof,
    senales: sobre.senales,
    nota:
      "Prueba Groth16 valida generada contra un arbol de Merkle que armo el atacante. " +
      "Verifica contra la verification key del evento. Sirve para pasar SOLO si el " +
      "validador no compara la raiz contra la suya. Ver docs/06-validador.md.",
  });
  const rutaBin = await escribirSobreBinario(join(salidas, "sobre-atacante.bin"), {
    prueba: proof,
    senales: sobre.senales,
  });

  // --- Paso 3: los dos validadores, con el mismo codigo ---
  const verificar = (vk, senales, prueba) => snarkjs.groth16.verify(vk, senales, prueba, null);
  // Copia en memoria de la lista de la puerta: el ataque no ensucia el estado
  // real. Si el ingenuo "acepta", no queremos que eso quede registrado en una
  // puerta de verdad.
  const usados = leerUsados(opciones.puerta).map((u) => ({ ...u }));
  const contexto = { configuracion, senales: sobre.senales, sobre, usados, verificar };

  console.log("Paso 3 - la misma prueba, contra dos validadores\n");

  // El ingenuo: tiene la vkey y lleva su lista de nulificadores, pero se cree
  // los valores publicos que vienen adentro del sobre.
  const ingenuo = await correrChequeos(contexto, { omitir: ["raiz", "scope"] });
  console.log("  Validador INGENUO (verifica la prueba y lleva la lista, nada mas)");
  mostrarChequeos(ingenuo.resultados);
  console.log(`    => ${ingenuo.aceptada ? "PASE. El atacante entra." : "rechazada"}\n`);

  const estricto = await correrChequeos(contexto);
  console.log(`  Validador de la puerta ${opciones.puerta} (los cuatro chequeos, en orden)`);
  mostrarChequeos(estricto.resultados);
  console.log(`    => ${estricto.aceptada ? "PASE" : `RECHAZADA en el chequeo 1 (${estricto.fallo}).`}\n`);

  const exito = ingenuo.aceptada && !estricto.aceptada;

  console.log("Que quedo demostrado\n");
  console.log("  La prueba es matematicamente valida y aun asi es inaceptable. La validez");
  console.log("  criptografica dice 'existe un witness que satisface el circuito con estas");
  console.log("  senales publicas'. No dice nada sobre si esas senales publicas son las");
  console.log("  correctas: eso lo tiene que decidir quien verifica, con datos propios.");
  console.log("");
  console.log(`  raiz que trae la prueba   ${corto(sobre.senales[indiceDe("raiz")])}`);
  console.log(`  raiz de la puerta         ${corto(configuracion.raiz)}`);
  console.log("");
  console.log("  Y el atacante no entra una vez: como los ocho secretos son suyos, puede");
  console.log("  generar ocho entradas, u ochocientas si arma un arbol mas grande. La lista");
  console.log("  de nulificadores no lo frena, porque cada secreto propio da un nulificador");
  console.log("  nuevo. Lo unico que lo frena es el chequeo 1.");
  console.log("");
  console.log("Artefactos\n");
  console.log(`  ${rel(rutaJson)}`);
  console.log(`  ${rel(rutaBin)}   (224 bytes: el mismo sobre que usa un comprador honesto)`);
  console.log("");
  console.log(`  Probalo contra la puerta de verdad, que no va a aceptarlo:`);
  console.log(`    npm run validar -- --puerta ${opciones.puerta} --prueba salidas/ataque/sobre-atacante.json\n`);

  await cerrarCurva();
  if (!exito) {
    console.error(
      "EL ATAQUE NO SE COMPORTO COMO DICE EL DOCUMENTO.\n" +
        `  ingenuo acepta: ${ingenuo.aceptada}   estricto rechaza: ${!estricto.aceptada}\n` +
        "  Si el ingenuo rechazo, algo cambio en lib/puerta.mjs; si el estricto acepto,\n" +
        "  la puerta esta provisionada con la raiz del atacante. Ver docs/06-validador.md.\n"
    );
    process.exit(1);
  }
  process.exit(0);
}

main().catch(async (e) => {
  await cerrarCurva().catch(() => {});
  console.error(`\n${e.name === "RangeError" || e.name === "TypeError" ? "VALOR INVALIDO" : "Error"}:`);
  console.error(e.message || e);
  if (e.name !== "RangeError" && e.name !== "TypeError") console.error(e);
  console.error("");
  process.exit(1);
});
