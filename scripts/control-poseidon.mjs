#!/usr/bin/env node
// Compara el Poseidon que corre adentro del circuito (circomlib, compilado por
// circom) con el que corre en JavaScript (circomlibjs). Si difieren en algun
// vector, sale con codigo 1 y dice cual.
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

function compilar() {
  mkdirSync(build, { recursive: true });
  try {
    execFileSync(
      "circom",
      [circuito, "--r1cs", "--wasm", "-o", build, "-l", join(raiz, "node_modules")],
      {
        encoding: "utf8",
        shell: process.platform === "win32",
        stdio: ["ignore", "pipe", "pipe"],
      }
    );
  } catch (e) {
    console.error("\nNo se pudo compilar el circuito de control.");
    console.error(e.stderr || e.message);
    console.error("Corre 'npm run verificar:entorno' primero.\n");
    process.exit(1);
  }
  if (!existsSync(wasm)) {
    console.error(`\nEl compilador no dejo el wasm en ${wasm}.\n`);
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

async function main() {
  console.log("\nCompilando circuitos/control_poseidon.circom");
  compilar();

  const poseidonJs = await buildPoseidon();
  const F = poseidonJs.F;

  // Chequeo previo: las dos implementaciones tienen que estar sobre el mismo
  // campo. Si esto falla, comparar hashes no tiene sentido.
  const infoR1cs = await snarkjs.r1cs.info(r1cs);
  const problemas = [];
  if (F.p !== P) {
    problemas.push(`circomlibjs trabaja sobre p = ${F.p}, no sobre BN254`);
  }
  if (BigInt(infoR1cs.prime) !== P) {
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

  if (problemas.length) {
    console.error("CONTROL FALLIDO. El Poseidon de JS y el del circuito NO son el mismo.");
    console.error("No sigas con el resto de la PoC hasta resolverlo: el arbol que arme");
    console.error("el organizador no va a verificar nunca y el error no se ve de atras.\n");
    for (const p of problemas) console.error(`  - ${p}`);
    console.error("\nVer docs/01-poseidon.md.\n");
    process.exit(1);
  }

  console.log(
    `Control pasado: ${vectores.length} vectores, mismo hash en circuito y en JS.`
  );
  console.log("Ver docs/01-poseidon.md.\n");
  process.exit(0);
}

main().catch((e) => {
  console.error("\nError inesperado en el control:");
  console.error(e);
  process.exit(1);
});
