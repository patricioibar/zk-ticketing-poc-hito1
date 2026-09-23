#!/usr/bin/env node
// Prover / asistente: toma una identidad del padron y un evento, arma el camino
// de Merkle, calcula el witness, genera la prueba Groth16 y la serializa. Mide,
// sobre varias corridas, el tiempo de generacion y el tamano real en bytes.
//
// Uso: npm run probar -- --identidad 3 --scope evento-A
//      npm run probar -- --identidad 0 --scope 1234 --corridas 20
//
// Los dos numeros que imprime son una COTA DE REFERENCIA EN ESCRITORIO. No son
// MED-001: esa medicion pregunta por telefonos de gama media. Ver docs/05-prover.md.

import { mkdirSync, writeFileSync, existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import os from "node:os";

import * as snarkjs from "snarkjs";

import { exigirEnCampo, elementoDeScope } from "../lib/campo.mjs";
import { construirHashes, armarArbol, caminoDe, raizDesdeCamino } from "../lib/merkle.mjs";
import { fuenteDeRaiz } from "../fuentes/seleccion.mjs";
import {
  serializarPrueba,
  deserializarPrueba,
  serializarSenales,
  deserializarSenales,
  cerrarCurva,
  BYTES_ELEMENTO,
} from "../lib/prueba-binaria.mjs";

const raizRepo = join(dirname(fileURLToPath(import.meta.url)), "..");
const datos = join(raizRepo, "datos");
const build = join(raizRepo, "build");
const salidas = join(raizRepo, "salidas");

const wasm = join(build, "pertenencia_js", "pertenencia.wasm");
const zkey = join(build, "setup", "pertenencia.zkey");
const vkey = join(build, "setup", "verification_key.json");

// El limite que fija ADR-011 en ../zk-ticketing-docs: capacidad util de un QR
// version 40 con correccion de errores L en modo binario.
const LIMITE_QR_BINARIO = 2953;

const CORRIDAS_POR_DEFECTO = 10;

// Leida del paquete instalado, no escrita a mano: un numero de version copiado a
// mano envejece sin avisar y deja de describir lo que se midio.
const versionSnarkjs = JSON.parse(
  readFileSync(join(raizRepo, "node_modules", "snarkjs", "package.json"), "utf8")
).version;

const rel = (p) => relative(raizRepo, p).replaceAll("\\", "/");

function leerArgumentos(argv) {
  const opciones = { identidad: null, scope: null, corridas: CORRIDAS_POR_DEFECTO };
  for (let i = 0; i < argv.length; i++) {
    const valor = argv[i + 1];
    if (argv[i] === "--identidad") {
      opciones.identidad = Number(valor);
      i++;
    } else if (argv[i] === "--scope") {
      opciones.scope = valor;
      i++;
    } else if (argv[i] === "--corridas") {
      opciones.corridas = Number(valor);
      i++;
    } else {
      console.error(`\nArgumento desconocido: ${argv[i]}`);
      console.error("Uso: npm run probar -- --identidad N [--scope etiqueta] [--corridas N]\n");
      process.exit(1);
    }
  }
  if (!Number.isInteger(opciones.identidad) || opciones.identidad < 0) {
    console.error("\nFalta --identidad N (la posicion en el padron, empezando en 0).");
    console.error("Uso: npm run probar -- --identidad 3 --scope evento-A\n");
    process.exit(1);
  }
  if (!Number.isInteger(opciones.corridas) || opciones.corridas < 1) {
    console.error("\n--corridas tiene que ser un entero >= 1.\n");
    process.exit(1);
  }
  return opciones;
}

function exigirArtefacto(ruta, comando) {
  if (!existsSync(ruta)) {
    console.error(`\nFalta ${rel(ruta)}.\nCorre primero:  ${comando}\n`);
    process.exit(1);
  }
}

function estadisticas(muestras) {
  const n = muestras.length;
  const ordenadas = [...muestras].sort((a, b) => a - b);
  const media = muestras.reduce((a, b) => a + b, 0) / n;
  // Desvio muestral (n-1): son una muestra de las corridas posibles, no la
  // poblacion entera.
  const desvio = n > 1 ? Math.sqrt(muestras.reduce((a, x) => a + (x - media) ** 2, 0) / (n - 1)) : 0;
  const mediana = n % 2 ? ordenadas[(n - 1) / 2] : (ordenadas[n / 2 - 1] + ordenadas[n / 2]) / 2;
  return { n, media, desvio, mediana, min: ordenadas[0], max: ordenadas[n - 1] };
}

const ms = (x) => `${x.toFixed(1)} ms`;
const linea = (etiqueta, e) =>
  `  ${etiqueta.padEnd(18)}${ms(e.media).padStart(10)} +/- ${ms(e.desvio).padEnd(9)}` +
  `  mediana ${ms(e.mediana).padStart(9)}   [${ms(e.min)} .. ${ms(e.max)}]`;

function entradaDelCircuito({ secreto, camino, indices, raiz, scope }) {
  // snarkjs quiere strings decimales, no BigInt.
  return {
    secreto: secreto.toString(),
    camino: camino.map(String),
    indices: indices.map(String),
    raiz: raiz.toString(),
    scope: scope.toString(),
  };
}

async function main() {
  const opciones = leerArgumentos(process.argv.slice(2));
  const fallas = [];

  console.log("\nProver / asistente - una prueba de pertenencia\n");

  exigirArtefacto(wasm, "npm run circuito:pertenencia");
  exigirArtefacto(zkey, "npm run setup");
  exigirArtefacto(vkey, "npm run setup");
  exigirArtefacto(join(datos, "arbol.json"), "npm run organizador");
  exigirArtefacto(join(datos, "secretos.json"), "npm run organizador");

  // --- El padron, que es publico ---
  const padron = JSON.parse(readFileSync(join(datos, "arbol.json"), "utf8"));
  const compromisos = padron.compromisos.map((c, i) =>
    exigirEnCampo(BigInt(c), `compromiso ${i} del padron`)
  );
  const PROFUNDIDAD = padron.profundidad;

  // El scope: la etiqueta del evento se convierte a elemento de campo con la
  // misma funcion que usa el organizador. Si no se pasa ninguno, se usa el del
  // padron, para que el comando ande sin adivinar nada.
  const etiquetaScope = opciones.scope ?? padron.scope;
  const scope = exigirEnCampo(elementoDeScope(etiquetaScope), "scope del evento");

  const fuente = await fuenteDeRaiz({ silencioso: true });

  console.log(`  padron publico    ${rel(join(datos, "arbol.json"))} (${compromisos.length} compromisos, profundidad ${PROFUNDIDAD})`);
  console.log(`  fuente de raiz    ${fuente.nombre}`);
  console.log(
    `  evento (scope)    ${etiquetaScope}${String(scope) === String(etiquetaScope) ? "" : ` -> ${scope}`}`
  );
  console.log(`  identidad         ${opciones.identidad}`);

  if (opciones.identidad >= compromisos.length) {
    console.error(
      `\nLa identidad ${opciones.identidad} no existe: el padron tiene ${compromisos.length} hojas (0..${compromisos.length - 1}).\n`
    );
    process.exit(1);
  }

  // --- La raiz sale de la fuente, no del padron ---
  // El padron tambien trae una raiz, pero esa es la que escribio el propio
  // organizador: usarla seria creerle al mismo que la calculo. La autoridad es
  // la fuente (hoy un JSON, en T09 un contrato), y lo que el prover hace es
  // recalcular el arbol desde los compromisos y exigir que coincida.
  const raizPublicada = await fuente.leerRaiz(scope);
  if (raizPublicada === null) {
    console.error(`\nLa fuente no tiene ninguna raiz publicada para el scope ${scope}.`);
    console.error(`Corre primero:  npm run organizador -- --scope ${etiquetaScope}\n`);
    process.exit(1);
  }

  const { hash1, hash2 } = await construirHashes();
  const { niveles, raiz } = armarArbol(compromisos, hash2);
  const raizCoincide = raiz === raizPublicada;
  console.log(`\nArbol\n`);
  console.log(`  raiz recalculada  ${raiz}`);
  console.log(`  raiz publicada    ${raizPublicada}`);
  console.log(`  coinciden         ${raizCoincide ? "si" : "NO"}`);
  if (!raizCoincide) {
    // Cortar aca y no seguir es deliberado. El prover podria generar igual una
    // prueba contra la raiz que recalculo: seria una prueba perfectamente
    // valida, y perfectamente inutil, porque el validador de la puerta compara
    // contra la raiz publicada y la rechazaria sin decir por que. Es mejor
    // fallar en el unico lugar donde la causa es visible.
    console.error("\nEL PADRON NO CORRESPONDE A LA RAIZ PUBLICADA.\n");
    console.error("  Los compromisos de datos/arbol.json no producen la raiz que devolvio la fuente.");
    console.error("  Alguien edito el padron, o el padron y la raiz son de corridas distintas.");
    console.error("  Corre  npm run organizador  y volve a intentar. Ver docs/05-prover.md.\n");
    process.exit(1);
  }

  // --- El secreto: lo unico privado ---
  // En la parte base sale de datos/secretos.json, que existe solo porque el
  // organizador genero las identidades. En T12 este archivo desaparece y el
  // secreto lo tiene cada comprador.
  const bolsa = JSON.parse(readFileSync(join(datos, "secretos.json"), "utf8"));
  const entrada = bolsa.identidades.find((i) => i.posicion === opciones.identidad);
  if (!entrada) {
    console.error(`\ndatos/secretos.json no tiene la posicion ${opciones.identidad}.\n`);
    process.exit(1);
  }
  const secreto = exigirEnCampo(BigInt(entrada.secreto), `secreto de la posicion ${opciones.identidad}`);

  // El control que ata el secreto al padron: Poseidon(secreto) tiene que ser
  // exactamente la hoja que el padron publica en esa posicion.
  const compromiso = hash1(secreto);
  const compromisoCoincide = compromiso === compromisos[opciones.identidad];
  console.log(`\nIdentidad ${opciones.identidad}\n`);
  console.log(`  compromiso padron ${compromisos[opciones.identidad]}`);
  console.log(`  Poseidon(secreto) ${compromiso}`);
  console.log(`  coinciden         ${compromisoCoincide ? "si" : "NO"}`);
  if (!compromisoCoincide) {
    console.error("\nESTE SECRETO NO ES EL DE ESTA POSICION DEL PADRON.\n");
    console.error("  Poseidon(secreto) tendria que ser la hoja que el padron publica y no lo es.");
    console.error("  Sin eso no hay camino de Merkle posible: el circuito rechazaria el witness.");
    console.error("  Ver docs/05-prover.md.\n");
    process.exit(1);
  }

  const { camino, indices } = caminoDe(niveles, opciones.identidad);
  const raizPorCamino = raizDesdeCamino(compromiso, camino, indices, hash2);
  console.log(`  indices           [${indices.join(", ")}]`);
  console.log(`  camino llega      ${raizPorCamino === raiz ? "si" : "NO"}`);
  if (raizPorCamino !== raiz) fallas.push("el camino de esta hoja no llega a la raiz");

  // El nulificador calculado en JavaScript, para contrastarlo despues con el
  // que saca el circuito. Son dos implementaciones distintas de Poseidon.
  const nulificadorEsperado = hash2(secreto, scope);

  console.log(`\nQue entra y que sale del circuito\n`);
  console.log(`  privadas  secreto, camino[${PROFUNDIDAD}], indices[${PROFUNDIDAD}]   (nadie las ve)`);
  console.log(`  publicas  raiz, scope                        (el verificador tiene que estar de acuerdo)`);
  console.log(`  salida    nulificador = Poseidon(secreto, scope)  (publico, no revela el secreto)`);

  // --- Generacion medida ---
  mkdirSync(salidas, { recursive: true });
  const wtns = join(salidas, "prueba.wtns");
  const input = entradaDelCircuito({ secreto, camino, indices, raiz, scope });

  console.log(`\nGeneracion\n`);
  console.log(`  1 corrida de calentamiento + ${opciones.corridas} medidas`);

  // La primera corrida se descarta a proposito: paga la compilacion JIT del
  // wasm y el primer acceso a la zkey en disco, y por eso no representa ni el
  // caso frio de una app ni el caliente. Se reporta aparte.
  const cronometrar = async (fn) => {
    const t0 = process.hrtime.bigint();
    const r = await fn();
    return { r, ms: Number(process.hrtime.bigint() - t0) / 1e6 };
  };

  const calentamientoW = await cronometrar(() => snarkjs.wtns.calculate(input, wasm, wtns));
  const calentamientoP = await cronometrar(() => snarkjs.groth16.prove(zkey, wtns, null));

  const tWitness = [];
  const tPrueba = [];
  const tTotal = [];
  const tamanosJson = [];
  const pruebasDistintas = new Set();
  let proof = null;
  let publicSignals = null;

  for (let i = 0; i < opciones.corridas; i++) {
    const w = await cronometrar(() => snarkjs.wtns.calculate(input, wasm, wtns));
    const p = await cronometrar(() => snarkjs.groth16.prove(zkey, wtns, null));
    tWitness.push(w.ms);
    tPrueba.push(p.ms);
    tTotal.push(w.ms + p.ms);
    proof = p.r.proof;
    publicSignals = p.r.publicSignals;
    const json = JSON.stringify(proof);
    tamanosJson.push(Buffer.byteLength(json, "utf8"));
    pruebasDistintas.add(json);
  }

  const eW = estadisticas(tWitness);
  const eP = estadisticas(tPrueba);
  const eT = estadisticas(tTotal);

  console.log(`  calentamiento     witness ${ms(calentamientoW.ms)} + prueba ${ms(calentamientoP.ms)} (descartada)\n`);
  console.log(linea("witness", eW));
  console.log(linea("prueba Groth16", eP));
  console.log(linea("total", eT));

  // Groth16 es aleatorizado: cada corrida usa un r y un s nuevos, asi que las N
  // pruebas son distintas entre si y todas validas. Que lo sean es una
  // propiedad, no un accidente: dos pruebas iguales filtrarian informacion.
  console.log(
    `\n  las ${opciones.corridas} pruebas son distintas entre si   ${pruebasDistintas.size === opciones.corridas ? "si" : "NO"}`
  );
  if (pruebasDistintas.size !== opciones.corridas) {
    fallas.push("dos corridas produjeron la misma prueba: Groth16 tendria que aleatorizar cada una");
  }

  // --- Senales publicas y verificacion ---
  const vk = JSON.parse(readFileSync(vkey, "utf8"));
  const verifica = await snarkjs.groth16.verify(vk, publicSignals, proof, null);

  console.log(`\nSenales publicas [nulificador, raiz, scope]\n`);
  for (const s of publicSignals) console.log(`  ${s}`);

  const nulificador = BigInt(publicSignals[0]);
  const nulificadorCoincide = nulificador === nulificadorEsperado;
  console.log(`\n  nulificador == Poseidon(secreto, scope) en JS   ${nulificadorCoincide ? "si" : "NO"}`);
  console.log(`  senal publica 1 == raiz publicada              ${BigInt(publicSignals[1]) === raizPublicada ? "si" : "NO"}`);
  console.log(`  senal publica 2 == scope                       ${BigInt(publicSignals[2]) === scope ? "si" : "NO"}`);
  console.log(`  la prueba verifica contra la vkey              ${verifica ? "si" : "NO"}`);
  if (!nulificadorCoincide) fallas.push("el nulificador del circuito no es el de circomlibjs");
  if (BigInt(publicSignals[1]) !== raizPublicada) fallas.push("la senal publica de la raiz no es la publicada");
  if (BigInt(publicSignals[2]) !== scope) fallas.push("la senal publica del scope no es la pedida");
  if (!verifica) fallas.push("la prueba no verifica contra la verification key");

  // --- Tamano: las dos serializaciones ---
  const jsonPrueba = JSON.stringify(proof);
  const jsonSenales = JSON.stringify(publicSignals);
  const jsonPruebaBonito = JSON.stringify(proof, null, 2);
  const jsonSenalesBonito = JSON.stringify(publicSignals, null, 2);

  const binSinComprimir = await serializarPrueba(proof, { comprimida: false });
  const binComprimida = await serializarPrueba(proof, { comprimida: true });
  const binSenales = serializarSenales(publicSignals);

  // La comprobacion que vale: reconstruir la prueba desde los bytes y volver a
  // verificarla. Si el binario perdiera algo, esto daria "no".
  const pruebaVuelta = await deserializarPrueba(binComprimida, { comprimida: true });
  const senalesVueltas = deserializarSenales(binSenales);
  const verificaVuelta = await snarkjs.groth16.verify(vk, senalesVueltas, pruebaVuelta, null);
  const pruebaVueltaU = await deserializarPrueba(binSinComprimir, { comprimida: false });
  const verificaVueltaU = await snarkjs.groth16.verify(vk, publicSignals, pruebaVueltaU, null);
  if (!verificaVuelta || !verificaVueltaU) {
    fallas.push("la prueba reconstruida desde los bytes no verifica: la serializacion pierde algo");
  }

  const b = (n) => `${String(n).padStart(6)} bytes`;
  const nSenales = publicSignals.length;

  console.log(`\nTamano\n`);
  console.log(`  JSON de snarkjs, como lo escribe el script (indentado)`);
  console.log(`    prueba.json                   ${b(Buffer.byteLength(jsonPruebaBonito, "utf8"))}`);
  console.log(`    senales-publicas.json         ${b(Buffer.byteLength(jsonSenalesBonito, "utf8"))}`);
  console.log(`    sobre completo                ${b(Buffer.byteLength(jsonPruebaBonito, "utf8") + Buffer.byteLength(jsonSenalesBonito, "utf8"))}`);
  console.log(`  JSON minimizado (sin espacios), que es lo mejor que da el JSON`);
  console.log(`    prueba                        ${b(Buffer.byteLength(jsonPrueba, "utf8"))}`);
  console.log(`    senales                       ${b(Buffer.byteLength(jsonSenales, "utf8"))}`);
  console.log(`    sobre completo                ${b(Buffer.byteLength(jsonPrueba, "utf8") + Buffer.byteLength(jsonSenales, "utf8"))}`);
  console.log(`  Binario, elementos de campo crudos`);
  console.log(`    prueba sin comprimir          ${b(binSinComprimir.length)}   (3 puntos: G1 64 + G2 128 + G1 64)`);
  console.log(`    prueba comprimida             ${b(binComprimida.length)}   (solo x, el signo de y en un bit)`);
  console.log(`    ${nSenales} senales publicas            ${b(binSenales.length)}   (${nSenales} x ${BYTES_ELEMENTO})`);
  console.log(`    sobre comprimido completo     ${b(binComprimida.length + binSenales.length)}`);
  console.log(`    solo prueba + nulificador     ${b(binComprimida.length + BYTES_ELEMENTO)}   (raiz y scope los sabe el validador)`);
  console.log(`\n  el JSON varia de corrida en corrida: entre ${Math.min(...tamanosJson)} y ${Math.max(...tamanosJson)} bytes`);
  console.log(`  el binario no varia nunca: los puntos son de ancho fijo`);
  console.log(`\n  la prueba reconstruida desde los bytes verifica   ${verificaVuelta && verificaVueltaU ? "si (comprimida y sin comprimir)" : "NO"}`);

  // --- El veredicto del QR ---
  const sobreBin = binComprimida.length + binSenales.length;
  const sobreJson = Buffer.byteLength(jsonPrueba, "utf8") + Buffer.byteLength(jsonSenales, "utf8");
  const base64 = Math.ceil(sobreBin / 3) * 4;
  console.log(`\nQR estatico (limite ${LIMITE_QR_BINARIO} bytes en modo binario, ADR-011)\n`);
  console.log(`  sobre binario comprimido      ${b(sobreBin)}   ${sobreBin <= LIMITE_QR_BINARIO ? `entra, con ${(LIMITE_QR_BINARIO / sobreBin).toFixed(1)}x de margen` : "NO entra"}`);
  console.log(`  el mismo en base64            ${b(base64)}   ${base64 <= LIMITE_QR_BINARIO ? "entra igual" : "NO entra"}`);
  console.log(`  sobre JSON minimizado         ${b(sobreJson)}   ${sobreJson <= LIMITE_QR_BINARIO ? "entra" : "NO entra"}`);

  // --- Hardware, porque un numero sin hardware no es una medicion ---
  const cpu = os.cpus();
  console.log(`\nHardware de esta corrida\n`);
  console.log(`  cpu               ${cpu[0].model.trim()} (${cpu.length} hilos logicos)`);
  console.log(`  memoria           ${(os.totalmem() / 1024 ** 3).toFixed(1)} GB`);
  console.log(`  sistema           ${os.platform()} ${os.release()} (${os.arch()})`);
  console.log(`  node              ${process.version}, snarkjs ${versionSnarkjs}`);
  console.log(`\n  ESTO NO ES MED-001. MED-001 pregunta por telefonos de gama media; esto es`);
  console.log(`  una cota de referencia en una PC de escritorio. Ver docs/05-prover.md.`);

  // --- Artefactos ---
  const escribir = (nombre, contenido) => {
    const ruta = join(salidas, nombre);
    writeFileSync(ruta, contenido);
    return `${rel(ruta).padEnd(34)}${String(statSync(ruta).size).padStart(6)} bytes`;
  };

  console.log(`\nArtefactos\n`);
  console.log(`  ${escribir("prueba.json", `${jsonPruebaBonito}\n`)}`);
  console.log(`  ${escribir("senales-publicas.json", `${jsonSenalesBonito}\n`)}`);
  console.log(`  ${escribir("prueba-comprimida.bin", Buffer.from(binComprimida))}`);
  console.log(`  ${escribir("prueba-sin-comprimir.bin", Buffer.from(binSinComprimir))}`);
  console.log(`  ${escribir("senales-publicas.bin", Buffer.from(binSenales))}`);
  console.log(
    `  ${escribir(
      "medicion.json",
      `${JSON.stringify(
        {
          formato: "medicion-prover@1",
          advertencia:
            "Cota de referencia en hardware de escritorio. NO es MED-001, que pregunta por " +
            "telefonos de gama media. El trusted setup que respalda estas pruebas no es seguro.",
          fecha: new Date().toISOString().slice(0, 10),
          evento: { etiqueta: String(etiquetaScope), scope: scope.toString() },
          identidad: opciones.identidad,
          circuito: { profundidad: PROFUNDIDAD, hojas: compromisos.length, restricciones: 2513 },
          hardware: {
            cpu: cpu[0].model.trim(),
            hilos: cpu.length,
            memoria_gb: Number((os.totalmem() / 1024 ** 3).toFixed(1)),
            sistema: `${os.platform()} ${os.release()} ${os.arch()}`,
            node: process.version,
          },
          tiempos_ms: {
            corridas: opciones.corridas,
            calentamiento_descartado: {
              witness: calentamientoW.ms,
              prueba: calentamientoP.ms,
            },
            witness: eW,
            prueba: eP,
            total: eT,
            // Los datos crudos, corrida por corrida, en orden. Un promedio sin
            // la serie no se puede auditar: no deja ver si la dispersion es
            // ruido parejo o una sola corrida que se fue al doble.
            crudos_witness: tWitness,
            crudos_prueba: tPrueba,
          },
          tamanos_bytes: {
            json_indentado: {
              prueba: Buffer.byteLength(jsonPruebaBonito, "utf8"),
              senales: Buffer.byteLength(jsonSenalesBonito, "utf8"),
            },
            json_minimizado: {
              prueba_min: Math.min(...tamanosJson),
              prueba_max: Math.max(...tamanosJson),
              senales: Buffer.byteLength(jsonSenales, "utf8"),
            },
            binario: {
              prueba_sin_comprimir: binSinComprimir.length,
              prueba_comprimida: binComprimida.length,
              senales: binSenales.length,
              sobre_comprimido: sobreBin,
            },
          },
          qr: { limite_binario: LIMITE_QR_BINARIO, entra: sobreBin <= LIMITE_QR_BINARIO },
        },
        null,
        2
      )}\n`
    )}`
  );

  await cerrarCurva();

  if (fallas.length) {
    console.error("\nPRUEBA NO VALIDADA.\n");
    for (const f of fallas) console.error(`  - ${f}`);
    console.error("\nVer docs/05-prover.md.\n");
    process.exit(1);
  }

  console.log(
    `\nPrueba generada y verificada. El validador de la puerta (T07) solo va a ver\n` +
      `el nulificador, la raiz y el scope: cual de las ${compromisos.length} hojas es, no.\n` +
      `Ver docs/05-prover.md.\n`
  );
  process.exit(0);
}

main().catch(async (e) => {
  await cerrarCurva().catch(() => {});
  console.error(`\n${e.name === "RangeError" || e.name === "TypeError" ? "VALOR INVALIDO" : "Error inesperado"}:`);
  console.error(e.message || e);
  if (e.name !== "RangeError" && e.name !== "TypeError") console.error(e);
  console.error("");
  process.exit(1);
});
