#!/usr/bin/env node
// Compila circuitos/pertenencia.circom, reporta el numero real de restricciones
// y lo somete a un testigo valido y a cuatro invalidos. No genera ninguna prueba:
// eso necesita el trusted setup, que es T04. Acá alcanza con el witness.
// Uso: npm run circuito:pertenencia

import { execFileSync } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import * as snarkjs from "snarkjs";
import { buildPoseidon } from "circomlibjs";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const build = join(raiz, "build");
const fuente = join(raiz, "circuitos", "pertenencia.circom");
const r1cs = join(build, "pertenencia.r1cs");
const wasm = join(build, "pertenencia_js", "pertenencia.wasm");
const wtns = join(build, "pertenencia.wtns");

const PROFUNDIDAD = 3;
const HOJAS = 2 ** PROFUNDIDAD;

// Secretos de juguete, fijos para que la corrida sea reproducible. Los secretos
// de verdad los genera el comprador al azar dentro del campo; eso es T05/T06.
const secretos = [11n, 22n, 33n, 44n, 55n, 66n, 77n, 88n];
const POSICION = 5; // cual de las ocho identidades prueba pertenencia
const SCOPE = 1234n; // identificador del evento; fija el dominio del nulificador

function compilar() {
  mkdirSync(build, { recursive: true });
  try {
    // Dos rutas de librerias: node_modules para los includes con prefijo de
    // paquete, y circomlib/circuits porque el template de @zk-kit incluye
    // "poseidon.circom" a secas.
    const salida = execFileSync(
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
      {
        encoding: "utf8",
        shell: process.platform === "win32",
        stdio: ["ignore", "pipe", "pipe"],
      }
    );
    return salida;
  } catch (e) {
    console.error("\nNo se pudo compilar el circuito de pertenencia.");
    console.error(e.stderr || e.message);
    console.error("Corre 'npm run verificar:entorno' primero.\n");
    process.exit(1);
  }
}

// El arbol se arma en JavaScript, fuera del circuito: es trabajo de servidor y
// meterlo adentro no tendria sentido. El circuito solo recalcula el camino de
// una hoja. Que las dos implementaciones de Poseidon coincidan es lo que
// establece 'npm run control:poseidon'.
function armarArbol(hojas, hash2) {
  const niveles = [hojas];
  let actual = hojas;
  while (actual.length > 1) {
    const siguiente = [];
    for (let i = 0; i < actual.length; i += 2) {
      siguiente.push(hash2(actual[i], actual[i + 1]));
    }
    niveles.push(siguiente);
    actual = siguiente;
  }
  return { niveles, raiz: actual[0] };
}

// Para cada nivel: el hermano que hay que hashear, y el bit que dice de que lado
// esta el nodo propio (0 = izquierda, 1 = derecha).
function caminoDe(niveles, posicion) {
  const camino = [];
  const indices = [];
  let pos = posicion;
  for (let nivel = 0; nivel < niveles.length - 1; nivel++) {
    const hermano = niveles[nivel][pos ^ 1];
    camino.push(hermano);
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

async function testigoValido(entrada) {
  await snarkjs.wtns.calculate(aEntrada(entrada), wasm, wtns);
  const w = await snarkjs.wtns.exportJson(wtns);
  // Orden del witness: [1, salidas..., entradas publicas..., privadas...].
  // Hay una sola salida, asi que w[1] es el nulificador.
  return BigInt(w[1]);
}

// Un circuito esta probado cuando rechaza lo que tiene que rechazar. Si el
// calculo del witness no explota, el testigo invalido paso: eso es un agujero.
async function testigoRechazado(nombre, entrada) {
  try {
    await snarkjs.wtns.calculate(aEntrada(entrada), wasm, wtns);
  } catch (e) {
    const motivo = (e.message || String(e)).split("\n")[0];
    console.log(`  ${nombre}`);
    console.log(`    rechazado         si (${motivo})`);
    console.log("");
    return true;
  }
  console.log(`  ${nombre}`);
  console.log("    rechazado         NO  <- el circuito acepto un testigo invalido");
  console.log("");
  return false;
}

async function main() {
  console.log("\nCompilando circuitos/pertenencia.circom\n");
  const salidaCompilador = compilar();
  console.log(salidaCompilador.trim());
  if (!existsSync(wasm)) {
    console.error(`\nEl compilador no dejo el wasm en ${wasm}.\n`);
    process.exit(1);
  }

  const info = await snarkjs.r1cs.info(r1cs);
  console.log("\nsnarkjs r1cs info");
  console.log(`  restricciones     ${info.nConstraints}`);
  console.log(`  cables            ${info.nVars}`);
  console.log(`  entradas privadas ${info.nPrvInputs}`);
  console.log(`  entradas publicas ${info.nPubInputs}`);
  console.log(`  salidas           ${info.nOutputs}`);

  const poseidon = await buildPoseidon();
  const F = poseidon.F;
  const hash1 = (x) => F.toObject(poseidon([x]));
  const hash2 = (a, b) => F.toObject(poseidon([a, b]));

  const hojas = secretos.map(hash1);
  const { niveles, raiz: raizArbol } = armarArbol(hojas, hash2);
  const { camino, indices } = caminoDe(niveles, POSICION);

  console.log(`\nArbol de ${HOJAS} identidades, profundidad ${PROFUNDIDAD}`);
  console.log(`  raiz              ${raizArbol}`);
  console.log(`  posicion probada  ${POSICION} (secreto ${secretos[POSICION]})`);
  console.log(`  indices           [${indices.join(", ")}]`);

  const entradaValida = {
    secreto: secretos[POSICION],
    camino,
    indices,
    raiz: raizArbol,
    scope: SCOPE,
  };

  const fallas = [];

  console.log("\nTestigo valido\n");
  const nulificadorCircuito = await testigoValido(entradaValida);
  const nulificadorJs = hash2(secretos[POSICION], SCOPE);
  const coincide = nulificadorCircuito === nulificadorJs;
  console.log(`  nulificador (circuito)    ${nulificadorCircuito}`);
  console.log(`  Poseidon(secreto, scope)  ${nulificadorJs}`);
  console.log(`  iguales                   ${coincide ? "si" : "NO"}`);
  if (!coincide) fallas.push("el nulificador del circuito no es Poseidon(secreto, scope)");

  // wtns.check no compara contra JS: comprueba que el witness satisface todas
  // las restricciones del .r1cs. Detecta un wasm desincronizado del r1cs.
  const satisface = await snarkjs.wtns.check(r1cs, wtns);
  console.log(`  satisface el r1cs         ${satisface ? "si" : "NO"}`);
  if (!satisface) fallas.push("el witness valido no satisface el r1cs");

  // El mismo secreto con otro scope da otro nulificador: es lo que permite que
  // una entrada sirva en dos eventos sin que se pueda cruzar quien es.
  const nulificadorOtroScope = hash2(secretos[POSICION], SCOPE + 1n);
  console.log(`  con scope ${SCOPE + 1n}           ${nulificadorOtroScope}`);
  if (nulificadorOtroScope === nulificadorJs) {
    fallas.push("el nulificador no depende del scope");
  }

  console.log("\nTestigos invalidos (tienen que ser rechazados)\n");
  const rechazos = [];
  rechazos.push(
    await testigoRechazado("raiz que no es la del arbol", {
      ...entradaValida,
      raiz: raizArbol + 1n,
    })
  );
  rechazos.push(
    await testigoRechazado("secreto que no esta en el arbol", {
      ...entradaValida,
      secreto: 999n,
    })
  );
  rechazos.push(
    await testigoRechazado("un hermano del camino cambiado", {
      ...entradaValida,
      camino: [camino[0] + 1n, camino[1], camino[2]],
    })
  );
  rechazos.push(
    await testigoRechazado("indices que apuntan a otra posicion", {
      ...entradaValida,
      indices: [indices[0] ^ 1n, indices[1], indices[2]],
    })
  );
  rechazos.push(
    await testigoRechazado("un indice que no es 0 ni 1", {
      ...entradaValida,
      indices: [2n, indices[1], indices[2]],
    })
  );
  if (rechazos.some((r) => r === false)) {
    fallas.push("algun testigo invalido fue aceptado");
  }

  if (fallas.length) {
    console.error("CIRCUITO NO VALIDADO.\n");
    for (const f of fallas) console.error(`  - ${f}`);
    console.error("\nVer docs/02-circuito.md.\n");
    process.exit(1);
  }

  console.log("Circuito compilado y validado: 1 testigo valido, 5 invalidos rechazados.");
  console.log("Ver docs/02-circuito.md.\n");
  process.exit(0);
}

main().catch((e) => {
  console.error("\nError inesperado:");
  console.error(e);
  process.exit(1);
});
