// Serializacion binaria compacta de una prueba Groth16 sobre BN254 y de sus
// senales publicas. Existe para contestar una pregunta concreta: cuanto pesa de
// verdad una prueba, que no es lo que pesa el JSON que imprime snarkjs.
//
// Una prueba Groth16 son tres puntos de curva elíptica: pi_a y pi_c en G1, pi_b
// en G2. Nada mas. El JSON los escribe como strings decimales dentro de una
// estructura anidada; eso es transporte legible, no el tamano del objeto.
//
// Las conversiones punto <-> bytes NO estan escritas a mano: son las de
// ffjavascript, la libreria que usa snarkjs por debajo para leer y escribir
// zkeys y ptau. Comprimir es facil; descomprimir exige una raiz cuadrada modular
// en Fq (y en Fq2 para G2), y eso es criptografia que no se escribe a mano.
//
// Formato de ffjavascript, que es el que se documenta acá porque es el que
// producen estos bytes:
//
//   - cada coordenada es un entero de Fq en big-endian sobre 32 bytes;
//   - sin comprimir, un punto de G1 son (x, y) = 64 bytes y uno de G2
//     ((x0, x1), (y0, y1)) = 128 bytes;
//   - comprimido, solo va x, y el bit 0x80 del primer byte dice cual de las dos
//     raices y es la correcta ("la mayor"). El bit 0x40 marca el punto en el
//     infinito. Los dos bits caben porque q < 2^254: los dos bits altos de la
//     codificacion de 32 bytes siempre estan libres.
//
// Ver docs/05-prover.md, seccion 3.

import { buildBn128 } from "ffjavascript";

import { exigirEnCampo } from "./campo.mjs";

export const BYTES_ELEMENTO = 32;
export const BYTES_G1_SIN_COMPRIMIR = 64;
export const BYTES_G2_SIN_COMPRIMIR = 128;
export const BYTES_PRUEBA_SIN_COMPRIMIR = 2 * BYTES_G1_SIN_COMPRIMIR + BYTES_G2_SIN_COMPRIMIR; // 256
export const BYTES_PRUEBA_COMPRIMIDA = 2 * 32 + 64; // 128

let curvaCacheada = null;

export async function curvaBn128() {
  if (!curvaCacheada) curvaCacheada = await buildBn128();
  return curvaCacheada;
}

export async function cerrarCurva() {
  if (curvaCacheada) {
    await curvaCacheada.terminate();
    curvaCacheada = null;
  }
}

// proof es el objeto que devuelve snarkjs.groth16.prove.
export async function serializarPrueba(proof, { comprimida = true } = {}) {
  const c = await curvaBn128();
  const nG1 = comprimida ? 32 : BYTES_G1_SIN_COMPRIMIR;
  const nG2 = comprimida ? 64 : BYTES_G2_SIN_COMPRIMIR;
  const bytes = new Uint8Array(2 * nG1 + nG2);

  const a = c.G1.fromObject(proof.pi_a.map(BigInt));
  const b = c.G2.fromObject(proof.pi_b.map((f) => f.map(BigInt)));
  const cc = c.G1.fromObject(proof.pi_c.map(BigInt));

  if (comprimida) {
    c.G1.toRprCompressed(bytes, 0, a);
    c.G2.toRprCompressed(bytes, nG1, b);
    c.G1.toRprCompressed(bytes, nG1 + nG2, cc);
  } else {
    c.G1.toRprUncompressed(bytes, 0, a);
    c.G2.toRprUncompressed(bytes, nG1, b);
    c.G1.toRprUncompressed(bytes, nG1 + nG2, cc);
  }
  return bytes;
}

// Reconstruye el objeto que espera snarkjs.groth16.verify. Que la prueba
// reconstruida verifique es la unica comprobacion que vale de que la
// serializacion no perdio nada: el tamano se mide, la equivalencia se prueba.
export async function deserializarPrueba(bytes, { comprimida = true } = {}) {
  const c = await curvaBn128();
  const nG1 = comprimida ? 32 : BYTES_G1_SIN_COMPRIMIR;
  const nG2 = comprimida ? 64 : BYTES_G2_SIN_COMPRIMIR;
  const esperado = 2 * nG1 + nG2;
  if (bytes.length !== esperado) {
    throw new RangeError(
      `deserializarPrueba: se esperaban ${esperado} bytes y llegaron ${bytes.length}.`
    );
  }
  const leerG1 = (o) =>
    comprimida ? c.G1.fromRprCompressed(bytes, o) : c.G1.fromRprUncompressed(bytes, o);
  const leerG2 = (o) =>
    comprimida ? c.G2.fromRprCompressed(bytes, o) : c.G2.fromRprUncompressed(bytes, o);

  const a = c.G1.toObject(c.G1.toAffine(leerG1(0)));
  const b = c.G2.toObject(c.G2.toAffine(leerG2(nG1)));
  const cc = c.G1.toObject(c.G1.toAffine(leerG1(nG1 + nG2)));

  // snarkjs espera coordenadas proyectivas con z = 1 (y [1, 0] en G2).
  return {
    pi_a: [a[0].toString(), a[1].toString(), "1"],
    pi_b: [
      [b[0][0].toString(), b[0][1].toString()],
      [b[1][0].toString(), b[1][1].toString()],
      ["1", "0"],
    ],
    pi_c: [cc[0].toString(), cc[1].toString(), "1"],
    protocol: "groth16",
    curve: "bn128",
  };
}

// Las senales publicas son elementos de Fr (el campo de lib/campo.mjs), no de
// Fq: son numeros, no coordenadas. Por eso aca si corresponde exigirEnCampo y en
// las coordenadas de la prueba no.
export function serializarSenales(senales) {
  const bytes = new Uint8Array(senales.length * BYTES_ELEMENTO);
  senales.forEach((senal, i) => {
    let valor = exigirEnCampo(BigInt(senal), `senal publica ${i}`);
    for (let j = BYTES_ELEMENTO - 1; j >= 0; j--) {
      bytes[i * BYTES_ELEMENTO + j] = Number(valor & 0xffn);
      valor >>= 8n;
    }
  });
  return bytes;
}

export function deserializarSenales(bytes) {
  if (bytes.length % BYTES_ELEMENTO !== 0) {
    throw new RangeError(
      `deserializarSenales: ${bytes.length} bytes no son un multiplo de ${BYTES_ELEMENTO}.`
    );
  }
  const senales = [];
  for (let i = 0; i < bytes.length; i += BYTES_ELEMENTO) {
    let valor = 0n;
    for (let j = 0; j < BYTES_ELEMENTO; j++) valor = (valor << 8n) | BigInt(bytes[i + j]);
    senales.push(exigirEnCampo(valor, `senal publica ${i / BYTES_ELEMENTO}`).toString());
  }
  return senales;
}
