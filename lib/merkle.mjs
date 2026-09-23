// El lado JavaScript del arbol de Merkle: se arma entero afuera del circuito,
// porque es trabajo de servidor y meterlo adentro costaria restricciones sin
// ganar nada. El circuito solo recalcula el camino de una hoja. Que las dos
// implementaciones de Poseidon den el mismo numero es lo que establece
// 'npm run control:poseidon'.
//
// Hasta T04 estas funciones estaban duplicadas en dos scripts. T05 las unifico
// aca: son la misma definicion de arbol para el organizador, para el banco de
// pruebas del circuito y para el setup, y una sola definicion es lo unico que
// garantiza que las tres calculen la misma raiz.

import { buildPoseidon } from "circomlibjs";

// circomlibjs devuelve los hashes como Uint8Array en representacion de
// Montgomery; F.toObject los pasa a BigInt. Todo lo que sale de aca es BigInt.
export async function construirHashes() {
  const poseidon = await buildPoseidon();
  const F = poseidon.F;
  return {
    F,
    hash1: (x) => F.toObject(poseidon([x])),
    hash2: (a, b) => F.toObject(poseidon([a, b])),
  };
}

// Devuelve todos los niveles, de las hojas hacia arriba, y la raiz.
export function armarArbol(hojas, hash2) {
  if (hojas.length === 0 || (hojas.length & (hojas.length - 1)) !== 0) {
    throw new RangeError(
      `armarArbol: se esperaba una potencia de dos de hojas y llegaron ${hojas.length}. ` +
        "Un arbol incompleto necesita una hoja de relleno definida, y eso es una decision, no un default."
    );
  }
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
export function caminoDe(niveles, posicion) {
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

// Lo mismo que hace el circuito adentro: subir desde la hoja con el camino y los
// indices. Sirve para comprobar en JavaScript que un camino lleva a la raiz que
// se publico, sin generar ninguna prueba.
export function raizDesdeCamino(hoja, camino, indices, hash2) {
  let actual = hoja;
  for (let nivel = 0; nivel < camino.length; nivel++) {
    const bit = BigInt(indices[nivel]);
    actual = bit === 0n ? hash2(actual, camino[nivel]) : hash2(camino[nivel], actual);
  }
  return actual;
}
