#!/usr/bin/env node
// Ceremonia de trusted setup Groth16 para circuitos/pertenencia.circom.
// Fase 1 (Powers of Tau, universal): dos contribuciones y un beacon.
// Fase 2 (especifica del circuito): zkey, contribucion, beacon y verification key.
// Ademas arma una segunda zkey del mismo circuito para demostrar que una prueba
// hecha con una no verifica contra la verification key de la otra.
//
// ADVERTENCIA: esta ceremonia la corre una sola persona en una sola maquina.
// NO ES SEGURA: quien la corre conoce el residuo toxico y puede falsificar
// pruebas que verifican. Sirve para aprender y para medir. Ver docs/03-setup.md.
//
// Uso: npm run setup

import { execFileSync } from "node:child_process";
import { mkdirSync, existsSync, writeFileSync, statSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import * as snarkjs from "snarkjs";
import { buildPoseidon } from "circomlibjs";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const build = join(raiz, "build");
const setup = join(build, "setup");
const fuente = join(raiz, "circuitos", "pertenencia.circom");
const r1cs = join(build, "pertenencia.r1cs");
const wasm = join(build, "pertenencia_js", "pertenencia.wasm");

const f = (...p) => join(setup, ...p);
const wtns = f("prueba.wtns");

// Potencia del Powers of Tau. 2**12 = 4096 alcanza para las 2513 restricciones
// del circuito; el minimo real lo recalcula potenciaMinima() a partir del .r1cs
// con la misma formula que usa snarkjs, y el script aborta si no alcanza.
const POTENCIA = 12;

// Un beacon es una contribucion final hecha con aleatoriedad publica: no tiene
// secreto que guardar, por eso cierra la ceremonia. Para que sirva de verdad el
// valor tiene que venir de una fuente que nadie podia predecir ni elegir (el
// ejemplo canonico es el hash de un bloque de Bitcoin futuro). Este es una
// constante inventada: cumple la forma, no la funcion. Ver docs/03-setup.md.
const BEACON = "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20";
const BEACON_ITERACIONES = 10;

// Mismo arbol de juguete que T03, para tener una entrada valida con la que
// generar una prueba de verdad. Duplicado a proposito: docs/02-circuito.md cita
// por numero de linea el script de T03 y no conviene moverlo.
const PROFUNDIDAD = 3;
const secretos = [11n, 22n, 33n, 44n, 55n, 66n, 77n, 88n];
const POSICION = 5;
const SCOPE = 1234n;

const tiempos = [];

async function paso(nombre, fn) {
  const t0 = process.hrtime.bigint();
  const resultado = await fn();
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  tiempos.push({ nombre, ms });
  console.log(`  ${nombre.padEnd(44)} ${ms.toFixed(0).padStart(7)} ms`);
  return resultado;
}

function kb(ruta) {
  return `${(statSync(ruta).size / 1024).toFixed(0)} kB`;
}

// La entropia del contribuyente. snarkjs la mezcla con 64 bytes del generador
// del sistema (node_modules/snarkjs/src/misc.js:182) y de ahi deriva el secreto
// de la contribucion. No la escribimos a disco, pero eso no vuelve segura a la
// ceremonia: ver la seccion 3 del doc.
function entropia() {
  return randomBytes(32).toString("hex");
}

// Compila el circuito si no esta compilado, para que 'npm run setup' funcione
// sobre un clon limpio. Mismos argumentos que scripts/circuito-pertenencia.mjs.
function asegurarCircuito() {
  if (existsSync(r1cs) && existsSync(wasm)) return false;
  mkdirSync(build, { recursive: true });
  try {
    execFileSync(
      "circom",
      [
        fuente,
        "--r1cs",
        "--wasm",
        "--sym",
        "-o",
        build,
        "-l",
        join(raiz, "node_modules"),
        "-l",
        join(raiz, "node_modules", "circomlib", "circuits"),
      ],
      { encoding: "utf8", shell: process.platform === "win32", stdio: ["ignore", "pipe", "pipe"] }
    );
    return true;
  } catch (e) {
    console.error("\nNo se pudo compilar el circuito.");
    console.error(e.stderr || e.message);
    console.error("Corre 'npm run verificar:entorno' primero.\n");
    process.exit(1);
  }
}

// La misma cuenta que node_modules/snarkjs/src/zkey_new.js:59:
// floor(log2(nConstraints + nPubInputs + nOutputs)) + 1. El +1 es lo que hace
// que el dominio tenga que ser estrictamente mayor que el tamano del sistema,
// no igual.
function potenciaMinima(info) {
  const n = info.nConstraints + info.nPubInputs + info.nOutputs;
  return Math.floor(Math.log2(n)) + 1;
}

function armarArbol(hojas, hash2) {
  const niveles = [hojas];
  let actual = hojas;
  while (actual.length > 1) {
    const siguiente = [];
    for (let i = 0; i < actual.length; i += 2) siguiente.push(hash2(actual[i], actual[i + 1]));
    niveles.push(siguiente);
    actual = siguiente;
  }
  return { niveles, raiz: actual[0] };
}

function caminoDe(niveles, posicion) {
  const camino = [];
  const indices = [];
  let pos = posicion;
  for (let nivel = 0; nivel < niveles.length - 1; nivel++) {
    camino.push(niveles[nivel][pos ^ 1]);
    indices.push(BigInt(pos & 1));
    pos = pos >> 1;
  }
  return { camino, indices };
}

function aEntrada(o) {
  const salida = {};
  for (const [k, v] of Object.entries(o)) {
    salida[k] = Array.isArray(v) ? v.map(String) : String(v);
  }
  return salida;
}

async function main() {
  console.log("\nTrusted setup Groth16 para circuitos/pertenencia.circom");
  console.log("ADVERTENCIA: ceremonia de una sola persona en una sola maquina.");
  console.log("NO ES SEGURA. Sirve para aprender y para medir. Ver docs/03-setup.md.\n");

  mkdirSync(setup, { recursive: true });
  if (asegurarCircuito()) console.log("Circuito compilado (no estaba en build/).\n");

  const info = await snarkjs.r1cs.info(r1cs);
  const minima = potenciaMinima(info);
  console.log("Tamano del circuito");
  console.log(`  restricciones     ${info.nConstraints}`);
  console.log(`  entradas publicas ${info.nPubInputs}`);
  console.log(`  salidas           ${info.nOutputs}`);
  console.log(`  potencia minima   2**${minima} = ${2 ** minima}`);
  console.log(`  potencia usada    2**${POTENCIA} = ${2 ** POTENCIA}`);
  if (POTENCIA < minima) {
    console.error(`\nEl ptau de 2**${POTENCIA} no alcanza para este circuito.`);
    console.error(`Subi POTENCIA a ${minima} en scripts/setup-groth16.mjs.\n`);
    process.exit(1);
  }

  const fallas = [];
  const curva = await snarkjs.curves.getCurveFromName("bn128");

  // --- Fase 1: universal. No mira el circuito en ningun momento. ---
  console.log("\nFase 1 - Powers of Tau (universal: no sabe nada del circuito)\n");

  await paso("arranque sin contribuciones", () =>
    snarkjs.powersOfTau.newAccumulator(curva, POTENCIA, f("pot_0000.ptau"), null)
  );
  await paso("contribucion 1", () =>
    snarkjs.powersOfTau.contribute(f("pot_0000.ptau"), f("pot_0001.ptau"), "primera", entropia(), null)
  );
  await paso("contribucion 2", () =>
    snarkjs.powersOfTau.contribute(f("pot_0001.ptau"), f("pot_0002.ptau"), "segunda", entropia(), null)
  );
  await paso("beacon (cierre de la fase 1)", () =>
    snarkjs.powersOfTau.beacon(
      f("pot_0002.ptau"),
      f("pot_beacon.ptau"),
      "beacon",
      BEACON,
      BEACON_ITERACIONES,
      null
    )
  );
  const fase1Ok = await paso("verificacion de la cadena de la fase 1", () =>
    snarkjs.powersOfTau.verify(f("pot_beacon.ptau"), null)
  );
  if (!fase1Ok) fallas.push("la fase 1 no verifica");
  await paso("prepare phase2", () =>
    snarkjs.powersOfTau.preparePhase2(f("pot_beacon.ptau"), f("pot_final.ptau"), null)
  );
  console.log(`\n  ptau final: ${kb(f("pot_final.ptau"))} (sirve para cualquier circuito de hasta 2**${POTENCIA})`);

  // --- Fase 2: especifica de ESTE circuito. Depende del .r1cs. ---
  console.log("\nFase 2 - zkey (especifica de este circuito)\n");

  await paso("zkey inicial desde el .r1cs", () =>
    snarkjs.zKey.newZKey(r1cs, f("pot_final.ptau"), f("pertenencia_0000.zkey"), null)
  );
  await paso("contribucion 1", () =>
    snarkjs.zKey.contribute(
      f("pertenencia_0000.zkey"),
      f("pertenencia_0001.zkey"),
      "primera",
      entropia(),
      null
    )
  );
  await paso("beacon (cierre de la fase 2)", () =>
    snarkjs.zKey.beacon(
      f("pertenencia_0001.zkey"),
      f("pertenencia.zkey"),
      "beacon",
      BEACON,
      BEACON_ITERACIONES,
      null
    )
  );
  const fase2Ok = await paso("verificacion contra el .r1cs y el ptau", () =>
    snarkjs.zKey.verifyFromR1cs(r1cs, f("pot_final.ptau"), f("pertenencia.zkey"), null)
  );
  if (!fase2Ok) fallas.push("la zkey no verifica contra el r1cs");

  const vk = await paso("export de la verification key", () =>
    snarkjs.zKey.exportVerificationKey(f("pertenencia.zkey"), null)
  );
  writeFileSync(f("verification_key.json"), JSON.stringify(vk, null, 2));

  // Segunda ceremonia de fase 2, con otra entropia, sobre la MISMA zkey inicial
  // y el MISMO circuito. Sirve para la demostracion de mas abajo.
  await paso("segunda zkey (otra ceremonia, mismo circuito)", () =>
    snarkjs.zKey.contribute(
      f("pertenencia_0000.zkey"),
      f("pertenencia_otra.zkey"),
      "otra ceremonia",
      entropia(),
      null
    )
  );
  const vkOtra = await snarkjs.zKey.exportVerificationKey(f("pertenencia_otra.zkey"), null);
  writeFileSync(f("verification_key_otra.json"), JSON.stringify(vkOtra, null, 2));

  console.log(`\n  zkey:  ${kb(f("pertenencia.zkey"))}`);
  console.log(`  vkey:  ${kb(f("verification_key.json"))}`);

  // --- Control: una prueba de verdad, para que el setup sirva de algo. ---
  console.log("\nControl - una prueba generada con esta zkey\n");

  const poseidon = await buildPoseidon();
  const F = poseidon.F;
  const hash1 = (x) => F.toObject(poseidon([x]));
  const hash2 = (a, b) => F.toObject(poseidon([a, b]));
  const { niveles, raiz: raizArbol } = armarArbol(secretos.map(hash1), hash2);
  const { camino, indices } = caminoDe(niveles, POSICION);
  const entrada = aEntrada({
    secreto: secretos[POSICION],
    camino,
    indices,
    raiz: raizArbol,
    scope: SCOPE,
  });

  await paso("calculo del witness", () => snarkjs.wtns.calculate(entrada, wasm, wtns));
  const { proof, publicSignals } = await paso("generacion de la prueba", () =>
    snarkjs.groth16.prove(f("pertenencia.zkey"), wtns, null)
  );
  writeFileSync(f("prueba.json"), JSON.stringify(proof, null, 2));
  writeFileSync(f("senales_publicas.json"), JSON.stringify(publicSignals, null, 2));

  const propia = await paso("verificacion contra su propia vkey", () =>
    snarkjs.groth16.verify(vk, publicSignals, proof, null)
  );
  console.log(`\n  senales publicas [nulificador, raiz, scope]`);
  for (const s of publicSignals) console.log(`    ${s}`);
  console.log(`  prueba: ${kb(f("prueba.json"))}`);
  console.log(`  verifica contra su propia vkey   ${propia ? "si" : "NO"}`);
  if (!propia) fallas.push("la prueba no verifica contra su propia verification key");

  // --- Demostracion: la fase 2 no es intercambiable. ---
  console.log("\nDemostracion - la misma prueba contra la vkey de la otra ceremonia\n");
  console.log("  Mismo circuito, mismas senales publicas, otra ceremonia de fase 2.");
  const cruzada = await snarkjs.groth16.verify(vkOtra, publicSignals, proof, console);
  console.log(`\n  verifica contra la vkey ajena    ${cruzada ? "SI <- mal" : "no (correcto)"}`);
  if (cruzada) fallas.push("una prueba verifico contra la vkey de otra ceremonia");

  // Control adicional: la prueba esta atada a sus senales publicas.
  const senalesAlteradas = [...publicSignals];
  senalesAlteradas[0] = (BigInt(senalesAlteradas[0]) + 1n).toString();
  const alterada = await snarkjs.groth16.verify(vk, senalesAlteradas, proof, null);
  console.log(`  verifica con el nulificador +1   ${alterada ? "SI <- mal" : "no (correcto)"}`);
  if (alterada) fallas.push("una prueba verifico con las senales publicas alteradas");

  console.log("\nTiempos\n");
  let total = 0;
  for (const t of tiempos) total += t.ms;
  console.log(`  total de los pasos medidos       ${(total / 1000).toFixed(1)} s`);

  if (fallas.length) {
    console.error("\nSETUP NO VALIDADO.\n");
    for (const x of fallas) console.error(`  - ${x}`);
    console.error("\nVer docs/03-setup.md.\n");
    process.exit(1);
  }

  console.log("\nSetup completo en build/setup/. Recorda: esta ceremonia NO ES SEGURA.");
  console.log("Ver docs/03-setup.md.\n");
  process.exit(0);
}

main().catch((e) => {
  console.error("\nError inesperado:");
  console.error(e);
  process.exit(1);
});
