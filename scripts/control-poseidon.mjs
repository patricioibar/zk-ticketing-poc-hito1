#!/usr/bin/env node
// Compara el Poseidon que corre adentro del circuito (circomlib, compilado por
// circom) con el que corre en JavaScript (circomlibjs). Cubre las dos aridades
// que usa la PoC: 1 para la hoja del arbol, 2 para los nodos internos y el
// nulificador. Si difieren en algun vector, sale con codigo 1 y dice cual.
// Uso: npm run control:poseidon

import { execFileSync } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import * as snarkjs from "snarkjs";
import { buildPoseidon } from "circomlibjs";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const build = join(raiz, "build");
const circuito = join(raiz, "circuitos", "control_poseidon.circom");
const r1cs = join(build, "control_poseidon.r1cs");
const wasm = join(build, "control_poseidon_js", "control_poseidon.wasm");
const wtns = join(build, "control_poseidon.wtns");
const circuito2 = join(raiz, "circuitos", "control_poseidon2.circom");
const r1cs2 = join(build, "control_poseidon2.r1cs");
const wasm2 = join(build, "control_poseidon2_js", "control_poseidon2.wasm");
const wtns2 = join(build, "control_poseidon2.wtns");

// Modulo del campo primo de BN254, el mismo sobre el que trabajan circom y
// circomlibjs. Esta escrito a mano aca a proposito: si alguna de las dos
// librerias cambiara de curva, este valor deja de coincidir y el script avisa.
const P =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

// Vectores: los tres primeros son valores comunes; los ultimos son los bordes
// del campo, que es donde las dos implementaciones podrian diferir sin que nadie
// se de cuenta hasta mucho despues.
const vectores = [
  { nombre: "cero", x: 0n },
  { nombre: "uno", x: 1n },
  { nombre: "dos", x: 2n },
  { nombre: "valor del medio", x: 1234567890123456789012345678901234567890n },
  { nombre: "p - 1 (maximo del campo)", x: P - 1n },
  { nombre: "p (el modulo exacto)", x: P },
  { nombre: "p + 1", x: P + 1n },
  { nombre: "2^253 (adentro del campo)", x: 2n ** 253n },
  { nombre: "2^256 - 1 (maximo uint256)", x: 2n ** 256n - 1n },
];

// Los mismos criterios para dos entradas. El par (secreto, scope) del
// nulificador y el par (izquierdo, derecho) de un nodo del arbol pasan por aca.
const vectores2 = [
  { nombre: "cero y cero", a: 0n, b: 0n },
  { nombre: "uno y dos", a: 1n, b: 2n },
  { nombre: "dos y uno (orden invertido)", a: 2n, b: 1n },
  {
    nombre: "dos valores del medio",
    a: 1234567890123456789012345678901234567890n,
    b: 9876543210987654321098765432109876543210n,
  },
  { nombre: "p - 1 en las dos", a: P - 1n, b: P - 1n },
  { nombre: "p y p + 1", a: P, b: P + 1n },
  { nombre: "2^256 - 1 en las dos", a: 2n ** 256n - 1n, b: 2n ** 256n - 1n },
];

function compilar(fuente, wasmEsperado) {
  mkdirSync(build, { recursive: true });
  try {
    execFileSync(
      "circom",
      [fuente, "--r1cs", "--wasm", "-o", build, "-l", join(raiz, "node_modules")],
      {
        encoding: "utf8",
        shell: process.platform === "win32",
        stdio: ["ignore", "pipe", "pipe"],
      }
    );
  } catch (e) {
    console.error(`\nNo se pudo compilar ${fuente}.`);
    console.error(e.stderr || e.message);
    console.error("Corre 'npm run verificar:entorno' primero.\n");
    process.exit(1);
  }
  if (!existsSync(wasmEsperado)) {
    console.error(`\nEl compilador no dejo el wasm en ${wasmEsperado}.\n`);
    process.exit(1);
  }
}

// Calcula el hash adentro del circuito. El witness es el vector de todas las
// señales: la posicion 0 es la constante 1, despues vienen las salidas y despues
// las entradas. Con una salida y una entrada: w[1] = h, w[2] = x ya reducido
// modulo p por el propio calculador de witness.
async function hashDelCircuito(x) {
  await snarkjs.wtns.calculate({ x: x.toString() }, wasm, wtns);
  const w = await snarkjs.wtns.exportJson(wtns);
  return { h: BigInt(w[1]), xReducido: BigInt(w[2]) };
}

// Igual que la anterior, con dos entradas: w[1] = h, w[2] = a, w[3] = b.
async function hashDelCircuito2(a, b) {
  await snarkjs.wtns.calculate(
    { a: a.toString(), b: b.toString() },
    wasm2,
    wtns2
  );
  const w = await snarkjs.wtns.exportJson(wtns2);
  return { h: BigInt(w[1]), aReducido: BigInt(w[2]), bReducido: BigInt(w[3]) };
}

async function main() {
  console.log("\nCompilando circuitos/control_poseidon.circom");
  compilar(circuito, wasm);
  console.log("Compilando circuitos/control_poseidon2.circom");
  compilar(circuito2, wasm2);

  const poseidonJs = await buildPoseidon();
  const F = poseidonJs.F;

  // Chequeo previo: las dos implementaciones tienen que estar sobre el mismo
  // campo. Si esto falla, comparar hashes no tiene sentido.
  const infoR1cs = await snarkjs.r1cs.info(r1cs);
  const infoR1cs2 = await snarkjs.r1cs.info(r1cs2);
  const problemas = [];
  if (F.p !== P) {
    problemas.push(`circomlibjs trabaja sobre p = ${F.p}, no sobre BN254`);
  }
  if (BigInt(infoR1cs.prime) !== P || BigInt(infoR1cs2.prime) !== P) {
    problemas.push(`el circuito trabaja sobre p = ${infoR1cs.prime}, no sobre BN254`);
  }
  console.log(`\nCampo primo (BN254 / Fr): p = ${P}`);
  console.log(`  circom (del .r1cs)      ${BigInt(infoR1cs.prime) === P ? "coincide" : "NO COINCIDE"}`);
  console.log(`  circomlibjs (poseidon.F) ${F.p === P ? "coincide" : "NO COINCIDE"}`);

  console.log("\nPoseidon(1) sobre cada vector\n");
  for (const { nombre, x } of vectores) {
    const { h: hCircuito, xReducido } = await hashDelCircuito(x);
    const hJs = BigInt(F.toString(poseidonJs([x])));
    const coinciden = hCircuito === hJs;
    if (!coinciden) {
      problemas.push(
        `${nombre}: circuito ${hCircuito} != circomlibjs ${hJs} (x = ${x})`
      );
    }
    console.log(`  ${nombre}`);
    console.log(`    x                 ${x}`);
    if (xReducido !== x) {
      console.log(`    x mod p           ${xReducido}   <- se redujo`);
    }
    console.log(`    h (circuito)      ${hCircuito}`);
    console.log(`    h (circomlibjs)   ${hJs}`);
    console.log(`    iguales           ${coinciden ? "si" : "NO"}`);
    console.log("");
  }

  console.log("Poseidon(2) sobre cada par\n");
  for (const { nombre, a, b } of vectores2) {
    const { h: hCircuito, aReducido, bReducido } = await hashDelCircuito2(a, b);
    const hJs = BigInt(F.toString(poseidonJs([a, b])));
    const coinciden = hCircuito === hJs;
    if (!coinciden) {
      problemas.push(
        `${nombre} (aridad 2): circuito ${hCircuito} != circomlibjs ${hJs} (a = ${a}, b = ${b})`
      );
    }
    console.log(`  ${nombre}`);
    console.log(`    a                 ${a}`);
    if (aReducido !== a) console.log(`    a mod p           ${aReducido}   <- se redujo`);
    console.log(`    b                 ${b}`);
    if (bReducido !== b) console.log(`    b mod p           ${bReducido}   <- se redujo`);
    console.log(`    h (circuito)      ${hCircuito}`);
    console.log(`    h (circomlibjs)   ${hJs}`);
    console.log(`    iguales           ${coinciden ? "si" : "NO"}`);
    console.log("");
  }

  // Separacion de dominio: el circuito de pertenencia usa Poseidon(1) para la
  // hoja y Poseidon(2) para el nulificador justamente porque son funciones
  // distintas. Esto lo comprueba en vez de darlo por sentado.
  console.log("Separacion de dominio: Poseidon(1)([x]) contra Poseidon(2)([x, 0])\n");
  for (const x of [0n, 1n, 1234567890123456789012345678901234567890n]) {
    const h1 = BigInt(F.toString(poseidonJs([x])));
    const h2 = BigInt(F.toString(poseidonJs([x, 0n])));
    if (h1 === h2) {
      problemas.push(
        `separacion de dominio rota: Poseidon(1)([${x}]) == Poseidon(2)([${x}, 0])`
      );
    }
    console.log(`  x = ${x}`);
    console.log(`    Poseidon(1)       ${h1}`);
    console.log(`    Poseidon(2)       ${h2}`);
    console.log(`    distintos         ${h1 !== h2 ? "si" : "NO"}`);
    console.log("");
  }

  if (problemas.length) {
    console.error("CONTROL FALLIDO. El Poseidon de JS y el del circuito NO son el mismo.");
    console.error("No sigas con el resto de la PoC hasta resolverlo: el arbol que arme");
    console.error("el organizador no va a verificar nunca y el error no se ve de atras.\n");
    for (const p of problemas) console.error(`  - ${p}`);
    console.error("\nVer docs/01-poseidon.md.\n");
    process.exit(1);
  }

  console.log(
    `Control pasado: ${vectores.length} vectores de aridad 1 y ${vectores2.length} de aridad 2,`
  );
  console.log("mismo hash en circuito y en JS. Las dos aridades son funciones distintas.");
  console.log("Ver docs/01-poseidon.md.\n");
  process.exit(0);
}

main().catch((e) => {
  console.error("\nError inesperado en el control:");
  console.error(e);
  process.exit(1);
});
