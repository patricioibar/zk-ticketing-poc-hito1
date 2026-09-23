// fuenteDeRaiz respaldada por un archivo JSON local. Es el primer escalon de la
// escalera: T09 va a poner un contrato en este mismo lugar (fuentes/contrato-raiz.mjs)
// y T12 otro (fuentes/contrato-nft.mjs), sin tocar el organizador, el prover ni
// los validadores. El contrato que las tres tienen que cumplir esta en la
// seccion 3 de docs/04-organizador.md.
//
//   nombre                              string, para los mensajes
//   async leerCompromisos(scope)        BigInt[] | null
//   async publicarRaiz({scope, raiz, profundidad})  { referencia }
//   async leerRaiz(scope)               BigInt | null

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";

import { exigirEnCampo } from "../lib/campo.mjs";

export function fuenteJson({ ruta, etiqueta = ruta }) {
  function leerDocumento() {
    if (!existsSync(ruta)) return null;
    return JSON.parse(readFileSync(ruta, "utf8"));
  }

  return {
    nombre: `json (${etiqueta})`,

    // Esta fuente no origina compromisos: en la parte base la lista la inventa
    // el organizador. Devolver los compromisos que el propio organizador
    // escribio seria un espejo, no una fuente. La que si los va a originar es
    // fuentes/contrato-nft.mjs en T12, leyendo los que enviaron los compradores.
    async leerCompromisos() {
      return null;
    },

    async publicarRaiz({ scope, raiz, profundidad }) {
      exigirEnCampo(raiz, "publicarRaiz: raiz");
      exigirEnCampo(scope, "publicarRaiz: scope");
      mkdirSync(dirname(ruta), { recursive: true });
      // JSON no tiene BigInt: todo elemento de campo se guarda como string
      // decimal. Guardarlo como number perderia precision arriba de 2^53 y el
      // error seria silencioso.
      const documento = {
        formato: "fuente-de-raiz/json@1",
        scope: scope.toString(),
        profundidad,
        raiz: raiz.toString(),
        publicado: new Date().toISOString().slice(0, 10),
      };
      writeFileSync(ruta, `${JSON.stringify(documento, null, 2)}\n`);
      return { referencia: ruta };
    },

    async leerRaiz(scope) {
      const documento = leerDocumento();
      // Ausente no es lo mismo que cero: un contrato sin raiz publicada devuelve
      // 0, y ese 0 no puede llegar al prover disfrazado de raiz valida.
      if (!documento) return null;
      if (documento.scope !== scope.toString()) return null;
      return exigirEnCampo(BigInt(documento.raiz), `leerRaiz: raiz de ${ruta}`);
    },
  };
}
