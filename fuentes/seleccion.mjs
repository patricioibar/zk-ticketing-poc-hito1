// Quien elige que implementacion de fuenteDeRaiz se enchufa.
//
// Este archivo no existia hasta T09, y que haya hecho falta crearlo es un
// hallazgo de esa tarea: la interfaz `fuenteDeRaiz` definia muy bien el
// *contrato* (que metodos, que tipos, que devuelve cuando no hay nada) pero no
// definia el *mecanismo de seleccion*. El organizador, el prover y el
// provisionador de puertas importaban `fuentes/json.mjs` por su nombre, cada uno
// por su cuenta, asi que cambiar de fuente no era cambiar una pieza: era editar
// tres archivos. Esta indireccion es la pieza que faltaba. Ver la seccion 3 de
// docs/08-contrato-raiz.md y bitacora/T09-contrato-raiz.md.
//
// La variable de entorno FUENTE elige:
//
//   contrato  (por defecto)  la raiz vive en RegistroDeRaiz, en la cadena local
//   json                     la raiz vive en datos/raiz.json, como en la fase 1
//   contrato-nft             la raiz vive en EntradaNFT y los compromisos tambien:
//                            los mandaron los compradores, no el organizador (T12)
//
//   FUENTE=json npm run organizador
//   FUENTE=contrato-nft npm test

import { join } from "node:path";

import { RAIZ_REPO } from "../lib/puerta.mjs";
import { fuenteJson } from "./json.mjs";
import { fuenteContratoRaiz } from "./contrato-raiz.mjs";
import { fuenteContratoNft } from "./contrato-nft.mjs";

export const FUENTE_POR_DEFECTO = "contrato";

export async function fuenteDeRaiz({ silencioso = false } = {}) {
  const elegida = process.env.FUENTE?.trim() || FUENTE_POR_DEFECTO;

  if (elegida === "json") {
    return fuenteJson({ ruta: join(RAIZ_REPO, "datos", "raiz.json"), etiqueta: "datos/raiz.json" });
  }
  if (elegida === "contrato") {
    return fuenteContratoRaiz({ silencioso });
  }
  if (elegida === "contrato-nft") {
    return fuenteContratoNft({ silencioso });
  }

  throw new Error(
    `FUENTE="${elegida}" no es ninguna fuente conocida. Las que hay son "contrato", "contrato-nft" y "json". ` +
      "Ver fuentes/seleccion.mjs."
  );
}
