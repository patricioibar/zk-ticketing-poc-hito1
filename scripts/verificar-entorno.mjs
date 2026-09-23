#!/usr/bin/env node
// Imprime la version real de cada herramienta que usa la PoC y falla si falta alguna.
// Uso: npm run verificar:entorno

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");

// Binarios: se les pregunta la version al propio programa. Es el unico dato que
// no puede mentir: si el binario no esta en el PATH, esto falla aca y no adentro
// de un comando de compilacion tres tareas mas adelante.
const binarios = [
  { nombre: "node", comando: "node", args: ["--version"] },
  { nombre: "npm", comando: "npm", args: ["--version"] },
  { nombre: "git", comando: "git", args: ["--version"] },
  { nombre: "rustc", comando: "rustc", args: ["--version"] },
  { nombre: "cargo", comando: "cargo", args: ["--version"] },
  { nombre: "circom", comando: "circom", args: ["--version"] },
];

// Paquetes de npm: la version instalada es la que dice el package.json que quedo
// en node_modules, no el rango que pide el nuestro. Son cosas distintas y la
// segunda es la que corre.
const paquetes = [
  "snarkjs",
  "circomlib",
  "circomlibjs",
  "ethers",
  "hardhat",
  "@openzeppelin/contracts",
];

const problemas = [];

function versionDeBinario({ nombre, comando, args }) {
  try {
    const salida = execFileSync(comando, args, {
      encoding: "utf8",
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return salida.trim().split("\n")[0].trim();
  } catch {
    problemas.push(`${nombre}: no esta instalado o no esta en el PATH`);
    return null;
  }
}

function versionDePaquete(nombre) {
  try {
    const manifiesto = join(raiz, "node_modules", nombre, "package.json");
    return JSON.parse(readFileSync(manifiesto, "utf8")).version;
  } catch {
    problemas.push(`${nombre}: no esta en node_modules (corre 'npm install')`);
    return null;
  }
}

function pragmaDeCircomlib() {
  try {
    const circuito = join(
      raiz,
      "node_modules",
      "circomlib",
      "circuits",
      "poseidon.circom"
    );
    const linea = readFileSync(circuito, "utf8")
      .split("\n")
      .find((l) => l.trim().startsWith("pragma circom"));
    return linea?.trim().replace(/;$/, "") ?? null;
  } catch {
    return null;
  }
}

function imprimir(etiqueta, valor) {
  const relleno = " ".repeat(Math.max(0, 24 - etiqueta.length));
  console.log(`  ${etiqueta}${relleno}${valor ?? "FALTA"}`);
}

console.log("\nHerramientas del sistema");
const versiones = {};
for (const bin of binarios) {
  versiones[bin.nombre] = versionDeBinario(bin);
  imprimir(bin.nombre, versiones[bin.nombre]);
}

console.log("\nPaquetes de Node (version instalada en node_modules)");
for (const paq of paquetes) {
  versiones[paq] = versionDePaquete(paq);
  imprimir(paq, versiones[paq]);
}

// Coherencia circom <-> circomlib. Los circuitos de circomlib declaran contra que
// serie del lenguaje estan escritos; compilarlos con un circom de otra serie mayor
// da errores de sintaxis que no parecen errores de version.
console.log("\nCoherencia circom <-> circomlib");
const pragma = pragmaDeCircomlib();
imprimir("pragma de circomlib", pragma);
const mayorCircom = versiones.circom?.match(/(\d+)\.\d+\.\d+/)?.[1];
const mayorPragma = pragma?.match(/(\d+)\.\d+\.\d+/)?.[1];
if (mayorCircom && mayorPragma && mayorCircom !== mayorPragma) {
  problemas.push(
    `circom ${versiones.circom} no coincide con el "${pragma}" de circomlib`
  );
}
imprimir("compatibles", mayorCircom && mayorPragma === mayorCircom ? "si" : "?");

if (problemas.length) {
  console.log("\nProblemas:");
  for (const p of problemas) console.log(`  - ${p}`);
  console.log("\nVer docs/00-entorno.md.\n");
  process.exit(1);
}

console.log("\nEntorno completo. Ver docs/00-entorno.md.\n");
