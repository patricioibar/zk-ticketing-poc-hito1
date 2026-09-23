// El sobre: lo que el comprador le muestra al molinete.
//
// Una prueba Groth16 sola no sirve para nada. Verificar es una ecuacion entre
// la prueba y las senales publicas: sin las senales no hay nada que verificar,
// y con senales distintas la misma prueba da "no". Por eso lo que viaja es un
// par, y este archivo es lo unico que sabe como leerlo de un archivo.
//
// Formatos que acepta, porque el prover de T06 ya dejo escritos los dos:
//
//   salidas/prueba.json            objeto de snarkjs  + hermano senales-publicas.json
//   salidas/prueba-comprimida.bin  128 bytes          + hermano senales-publicas.bin
//   sobre-de-entrada@1 (JSON)      {prueba, senales} en un solo archivo
//   sobre binario                  224 bytes (128 + 3x32) o 352 (256 + 3x32)
//
// Los bytes no se reinterpretan aca: la conversion punto <-> bytes es la de
// lib/prueba-binaria.mjs, que es la de ffjavascript. Ver docs/05-prover.md.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, extname } from "node:path";

import {
  deserializarPrueba,
  deserializarSenales,
  serializarPrueba,
  serializarSenales,
  BYTES_ELEMENTO,
  BYTES_PRUEBA_COMPRIMIDA,
  BYTES_PRUEBA_SIN_COMPRIMIR,
} from "./prueba-binaria.mjs";

export const FORMATO_SOBRE = "sobre-de-entrada@1";

const SENALES_ESPERADAS = 3;
const BYTES_SENALES = SENALES_ESPERADAS * BYTES_ELEMENTO; // 96

function hermano(ruta, nombre) {
  const candidato = join(dirname(ruta), nombre);
  return existsSync(candidato) ? candidato : null;
}

function exigirSenales(senales, origen) {
  if (!Array.isArray(senales) || senales.length !== SENALES_ESPERADAS) {
    throw new RangeError(
      `${origen}: se esperaban ${SENALES_ESPERADAS} senales publicas y llegaron ` +
        `${Array.isArray(senales) ? senales.length : typeof senales}. ` +
        "Una prueba de otro circuito no la puede verificar esta verification key."
    );
  }
  return senales.map(String);
}

// Devuelve { prueba, senales, formato, bytes } con las senales como strings
// decimales, que es lo que espera snarkjs.groth16.verify.
export async function leerSobre(ruta) {
  if (!existsSync(ruta)) {
    throw new Error(`No existe el archivo de prueba ${ruta}.`);
  }
  const crudo = readFileSync(ruta);

  if (extname(ruta).toLowerCase() === ".json") {
    const documento = JSON.parse(crudo.toString("utf8"));

    if (Array.isArray(documento)) {
      throw new RangeError(
        `${ruta} es solo la lista de senales publicas, sin la prueba. ` +
          "Pasale el archivo de la prueba: --prueba salidas/prueba.json"
      );
    }
    if (documento.prueba && documento.senales) {
      return {
        prueba: documento.prueba,
        senales: exigirSenales(documento.senales, ruta),
        formato: documento.formato ?? FORMATO_SOBRE,
        bytes: crudo.length,
      };
    }
    if (documento.pi_a) {
      const rutaSenales = hermano(ruta, "senales-publicas.json");
      if (!rutaSenales) {
        throw new Error(
          `${ruta} trae la prueba pero no las senales publicas, y no hay un ` +
            "senales-publicas.json al lado. Sin las senales no hay nada que verificar."
        );
      }
      return {
        prueba: documento,
        senales: exigirSenales(JSON.parse(readFileSync(rutaSenales, "utf8")), rutaSenales),
        formato: "prueba.json + senales-publicas.json",
        bytes: crudo.length,
      };
    }
    throw new RangeError(`${ruta} no parece una prueba Groth16 ni un ${FORMATO_SOBRE}.`);
  }

  // Binario. El largo alcanza para saber que es: los puntos son de ancho fijo.
  const combinaciones = [
    { largo: BYTES_PRUEBA_COMPRIMIDA + BYTES_SENALES, prueba: BYTES_PRUEBA_COMPRIMIDA, comprimida: true },
    { largo: BYTES_PRUEBA_SIN_COMPRIMIR + BYTES_SENALES, prueba: BYTES_PRUEBA_SIN_COMPRIMIR, comprimida: false },
  ];
  const junto = combinaciones.find((c) => c.largo === crudo.length);
  if (junto) {
    return {
      prueba: await deserializarPrueba(crudo.subarray(0, junto.prueba), {
        comprimida: junto.comprimida,
      }),
      senales: exigirSenales(deserializarSenales(crudo.subarray(junto.prueba)), ruta),
      formato: `sobre binario ${junto.comprimida ? "comprimido" : "sin comprimir"}`,
      bytes: crudo.length,
    };
  }

  const suelta = [BYTES_PRUEBA_COMPRIMIDA, BYTES_PRUEBA_SIN_COMPRIMIR].includes(crudo.length);
  if (suelta) {
    const rutaSenales = hermano(ruta, "senales-publicas.bin");
    if (!rutaSenales) {
      throw new Error(
        `${ruta} son ${crudo.length} bytes de prueba sin senales publicas, y no hay un ` +
          "senales-publicas.bin al lado. Sin las senales no hay nada que verificar."
      );
    }
    return {
      prueba: await deserializarPrueba(crudo, {
        comprimida: crudo.length === BYTES_PRUEBA_COMPRIMIDA,
      }),
      senales: exigirSenales(deserializarSenales(readFileSync(rutaSenales)), rutaSenales),
      formato: `prueba binaria ${crudo.length === BYTES_PRUEBA_COMPRIMIDA ? "comprimida" : "sin comprimir"} + senales-publicas.bin`,
      bytes: crudo.length + BYTES_SENALES,
    };
  }

  throw new RangeError(
    `${ruta}: ${crudo.length} bytes no son ningun formato de sobre conocido ` +
      `(${BYTES_PRUEBA_COMPRIMIDA}, ${BYTES_PRUEBA_SIN_COMPRIMIR}, ` +
      `${BYTES_PRUEBA_COMPRIMIDA + BYTES_SENALES} o ${BYTES_PRUEBA_SIN_COMPRIMIR + BYTES_SENALES}).`
  );
}

export function escribirSobreJson(ruta, { prueba, senales, nota = null }) {
  const documento = {
    formato: FORMATO_SOBRE,
    ...(nota ? { nota } : {}),
    senales: senales.map(String),
    prueba,
  };
  writeFileSync(ruta, `${JSON.stringify(documento, null, 2)}\n`);
  return ruta;
}

export async function escribirSobreBinario(ruta, { prueba, senales }) {
  const bytes = new Uint8Array(BYTES_PRUEBA_COMPRIMIDA + BYTES_SENALES);
  bytes.set(await serializarPrueba(prueba, { comprimida: true }), 0);
  bytes.set(serializarSenales(senales), BYTES_PRUEBA_COMPRIMIDA);
  writeFileSync(ruta, Buffer.from(bytes));
  return ruta;
}
