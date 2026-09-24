// fuenteDeRaiz respaldada por EntradaNFT: el tercer y ultimo escalon.
//
// Lo que cambia respecto de fuentes/contrato-raiz.mjs es una sola linea de la
// interfaz, y es la que da sentido a toda la Variacion 2:
//
//   leerCompromisos(scope)   json.mjs          null  (los inventa el organizador)
//                            contrato-raiz.mjs null  (los inventa el organizador)
//                            contrato-nft.mjs  los que enviaron los compradores
//
// Cuando esta funcion deja de contestar null, scripts/organizador.mjs:106 toma la
// otra rama —la que esta escrita desde T05 y nunca se habia ejecutado— y no genera
// ningun secreto. El organizador pasa a ser lo que tiene que ser: alguien que
// resume en una raiz los compromisos que le llegaron, sin poder abrir ninguno.
//
// La raiz sigue viviendo en el mismo lugar que en T09, porque EntradaNFT hereda
// RegistroDeRaiz: por eso `publicarRaiz` y `leerRaiz` no estan escritas aca, sino
// reusadas de fuentes/contrato-raiz.mjs sobre el contrato de entradas.
//
// Ver docs/10-flujo-completo.md.

import { RPC } from "../lib/cadena.mjs";
import { asegurarCompradores, compromisosEnCadena } from "../lib/compradores.mjs";
import { fuenteContratoRaiz } from "./contrato-raiz.mjs";

export async function fuenteContratoNft({ silencioso = false } = {}) {
  // Construir la fuente deja la cadena en condiciones de ser leida: contrato
  // desplegado, ocho entradas emitidas y los compromisos enviados por sus duenios.
  // En un sistema real nada de esto pasa aca —la cadena ya se acuerda—, pero un
  // nodo de Hardhat guarda su mundo en memoria y cualquier reinicio lo borra. Que
  // sea idempotente es lo que hace que `npm test`, que reinicia la cadena en cada
  // corrida, siga siendo un solo comando. La seccion 3 del documento lo discute.
  const { contrato, direccion } = await asegurarCompradores({ silencioso });

  // Los dos metodos de la raiz son los de T09, apuntados a este contrato. No hay
  // una segunda version de las reglas de la raiz: hay una sola, la de la V1.
  const registro = await fuenteContratoRaiz({ silencioso, yaConectado: { contrato, direccion } });

  return {
    ...registro,
    nombre: `contrato-nft (EntradaNFT ${direccion} en ${RPC})`,

    // El scope no se usa, y eso no es un descuido: EntradaNFT no sabe de eventos.
    // Los tokens son una serie sola y las raices estan indexadas por scope, asi que
    // los mismos ocho compromisos son el padron de todos los eventos. Atar las dos
    // cosas —un contrato por evento, o un evento por token— es una decision del TPF
    // que esta PoC no toma. Esta anotada en la seccion 6 del documento.
    async leerCompromisos() {
      const llegados = await compromisosEnCadena(contrato);

      // Cero compromisos no es "esta fuente no origina compromisos": es "nadie
      // mando el suyo todavia". Si se devolviera null, el organizador tomaria la
      // rama de la parte base y se inventaria ocho secretos sin que nadie lo note,
      // que es exactamente lo que este escalon viene a impedir. Por eso corta.
      if (llegados.length === 0) {
        throw new Error(
          `El contrato ${direccion} no tiene ningun compromiso enviado.\n` +
            "  Sin compromisos no hay padron, y el organizador no puede inventarlos:\n" +
            "  esa es la diferencia entre este escalon y la parte base.\n" +
            "  Corre  npm run flujo  para que los ocho compradores manden el suyo."
        );
      }

      // El orden del array es el orden de las hojas (regla 4 de la interfaz, en la
      // seccion 3 de docs/04-organizador.md). Aca lo fija el orden en que llegaron
      // las transacciones, no el organizador: por que, y que se paga por eso, en la
      // seccion 3 de docs/10-flujo-completo.md.
      return llegados.map((l) => l.compromiso);
    },
  };
}
