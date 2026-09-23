// El campo primo de BN254 y las dos unicas cosas que hay que hacer con el fuera
// del circuito: exigir que un valor este adentro, y generar valores nuevos sin
// sesgarlos. T02 dejo establecido que las dos implementaciones de Poseidon
// reducen modulo p en silencio; la defensa vive aca. Ver docs/04-organizador.md.

import { createHash } from "node:crypto";

// Escrito a mano y no leido de ninguna libreria, por la misma razon que en
// scripts/control-poseidon.mjs: un valor leido de circomlibjs seguiria
// coincidiendo consigo mismo si la libreria cambiara de curva.
export const P =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

export function estaEnCampo(x) {
  return typeof x === "bigint" && x >= 0n && x < P;
}

// Falla ruidoso. Un valor fuera de [0, p) no es un error del circuito ni de
// Poseidon: es un valor que va a ser reducido sin que nadie se entere, y dos
// valores que difieran en un multiplo de p van a producir el mismo nulificador.
export function exigirEnCampo(x, contexto) {
  if (typeof x !== "bigint") {
    throw new TypeError(`${contexto}: se esperaba un BigInt y llego ${typeof x}.`);
  }
  if (x < 0n || x >= P) {
    const resto = ((x % P) + P) % P;
    throw new RangeError(
      `${contexto}: el valor esta fuera del campo.\n` +
        `  valor    ${x}\n` +
        `  p        ${P}\n` +
        `  valor%p  ${resto}\n` +
        `  Poseidon lo reduciria en silencio: este valor y ${resto} producirian\n` +
        `  el mismo compromiso y el mismo nulificador. Ver docs/04-organizador.md.`
    );
  }
  return x;
}

// Un secreto por indice, derivado de una semilla, con rechazo en vez de
// reduccion: si el candidato de 256 bits no entra en el campo se descarta y se
// prueba el siguiente, en lugar de tomarle el resto. Tomar el resto sesgaria la
// distribucion hacia los valores chicos (hay cinco preimagenes de 256 bits para
// cada uno de los primeros valores del campo y cuatro para el resto) y ademas
// ensenaria el habito equivocado. Como p es apenas menor que 2^254 y el
// candidato tiene 256 bits, la probabilidad de aceptar es p / 2^256 ~ 0,19: se
// esperan unos cuatro descartes por secreto, y eso es gratis a esta escala.
export function secretoDeterminista(semilla, indice) {
  for (let intento = 0; intento < 256; intento++) {
    const bytes = createHash("sha256")
      .update(`${semilla}|${indice}|${intento}`)
      .digest("hex");
    const candidato = BigInt(`0x${bytes}`);
    if (candidato < P) return { secreto: candidato, descartados: intento };
  }
  throw new Error(
    `No se pudo derivar un secreto en [0, p) para el indice ${indice} en 256 intentos. ` +
      "Con una probabilidad de aceptacion de ~0,19 por intento eso tiene probabilidad ~1e-23: " +
      "si pasa, algo esta mal en la derivacion, no en la suerte."
  );
}

// El scope de un evento es un elemento de campo, pero la gente lo nombra con una
// etiqueta ("evento-A"). Esta es la unica traduccion entre las dos cosas, y vive
// aca para que el organizador y el prover usen la misma: dos derivaciones
// distintas darian dos nulificadores distintos para el mismo evento, y el
// sintoma recien aparece en la puerta.
//
//   solo digitos    -> se interpreta como el elemento de campo, tal cual
//   cualquier otra  -> sha256("scope|etiqueta|intento") con rechazo, igual que
//                      secretoDeterminista: nunca se reduce modulo p
//
// Que el sistema real derive el scope asi, o de un identificador on-chain del
// evento, es una decision de diseno del TPF (candidata a ADR): tiene que quedar
// igual en el circuito, el organizador, el prover y el contrato, o nada verifica.
export function elementoDeScope(texto) {
  const etiqueta = String(texto);
  if (/^[0-9]+$/.test(etiqueta)) {
    return exigirEnCampo(BigInt(etiqueta), `scope ${etiqueta}`);
  }
  for (let intento = 0; intento < 256; intento++) {
    const bytes = createHash("sha256").update(`scope|${etiqueta}|${intento}`).digest("hex");
    const candidato = BigInt(`0x${bytes}`);
    if (candidato < P) return candidato;
  }
  throw new Error(
    `No se pudo derivar un scope en [0, p) para la etiqueta ${etiqueta} en 256 intentos.`
  );
}
