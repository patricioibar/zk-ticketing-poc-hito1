// El orden de las senales publicas de una prueba Groth16.
//
// snarkjs entrega las senales publicas como un array sin nombres: tres numeros
// pelados. Quien los recibe tiene que saber cual es cual, y ese orden no lo
// elige el que verifica: lo fija circom al compilar. La regla es que en el
// witness van primero las SALIDAS de `main` y despues las ENTRADAS declaradas
// publicas, cada grupo en orden de declaracion.
//
// Para pertenencia.circom eso da [nulificador, raiz, scope]. Pero "da" no es
// "asumimos": el compilador escribe el mapa completo en build/pertenencia.sym,
// y las posiciones 1..nPublic del witness son exactamente las senales publicas.
// ordenSegunSym lo lee de ahi y exigirOrdenCanonico falla si alguna vez no
// coincide con lo que este codigo cree.
//
// Por que importa tanto: si alguien agrega una salida al circuito, o reordena
// `public [raiz, scope]`, el orden cambia sin que nada se rompa a la vista. El
// validador compararia la raiz contra el nulificador, rechazaria todas las
// pruebas y el mensaje diria "la raiz no es la mia". Esa confusion puede costar
// horas; este chequeo cuesta un archivo de texto.

import { readFileSync } from "node:fs";

export const ORDEN_SENALES = ["nulificador", "raiz", "scope"];

export function indiceDe(nombre) {
  const i = ORDEN_SENALES.indexOf(nombre);
  if (i < 0) {
    throw new RangeError(
      `indiceDe: "${nombre}" no es una senal publica de este circuito (${ORDEN_SENALES.join(", ")}).`
    );
  }
  return i;
}

// Cada linea del .sym es  indice_de_witness,indice_de_simbolo,nodo,nombre
// y el witness arranca en 0 con la constante 1, asi que las senales publicas
// son las posiciones 1..cantidad.
export function ordenSegunSym(rutaSym, cantidad) {
  const nombres = new Array(cantidad).fill(null);
  for (const linea of readFileSync(rutaSym, "utf8").split("\n")) {
    const partes = linea.trim().split(",");
    if (partes.length < 4) continue;
    const posicion = Number(partes[0]);
    if (!Number.isInteger(posicion) || posicion < 1 || posicion > cantidad) continue;
    nombres[posicion - 1] = partes[3].trim().replace(/^main\./, "");
  }
  const faltante = nombres.indexOf(null);
  if (faltante >= 0) {
    throw new Error(
      `${rutaSym} no tiene nombre para la senal publica ${faltante + 1}. ` +
        "El .sym no corresponde al circuito compilado."
    );
  }
  return nombres;
}

// Se corre cuando hay acceso a build/ (es decir, al provisionar la puerta, no
// en la puerta offline). Tira si el circuito cambio de orden.
export function exigirOrdenCanonico(rutaSym, cantidad) {
  const real = ordenSegunSym(rutaSym, cantidad);
  const coincide =
    real.length === ORDEN_SENALES.length && real.every((n, i) => n === ORDEN_SENALES[i]);
  if (!coincide) {
    throw new Error(
      "EL ORDEN DE LAS SENALES PUBLICAS CAMBIO.\n" +
        `  este codigo espera  [${ORDEN_SENALES.join(", ")}]\n` +
        `  el circuito produce [${real.join(", ")}]  (segun ${rutaSym})\n` +
        "  Alguien toco las salidas o la lista `public` de circuitos/pertenencia.circom.\n" +
        "  Actualiza ORDEN_SENALES en lib/senales.mjs y revisa todo lo que lea\n" +
        "  publicSignals por posicion. Ver docs/06-validador.md."
    );
  }
  return real;
}

// La version offline: la puerta no tiene el .sym, tiene el orden que se le
// grabo al provisionarla. Si ese orden no es el que este codigo espera, la
// puerta esta desactualizada respecto del circuito y no puede validar nada.
export function exigirOrdenConfigurado(orden) {
  const coincide =
    Array.isArray(orden) &&
    orden.length === ORDEN_SENALES.length &&
    orden.every((n, i) => n === ORDEN_SENALES[i]);
  if (!coincide) {
    throw new Error(
      "EL ORDEN DE SENALES GRABADO EN ESTA PUERTA NO ES EL QUE ESPERA EL CODIGO.\n" +
        `  grabado  [${Array.isArray(orden) ? orden.join(", ") : orden}]\n` +
        `  esperado [${ORDEN_SENALES.join(", ")}]\n` +
        "  Volve a provisionar la puerta. Ver docs/06-validador.md."
    );
  }
  return orden;
}
