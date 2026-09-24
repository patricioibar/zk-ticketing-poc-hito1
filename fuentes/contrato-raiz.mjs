// fuenteDeRaiz respaldada por el contrato RegistroDeRaiz, en la cadena local.
// Es el segundo escalon de la escalera: la raiz deja de ser un archivo que
// cualquiera edita y pasa a ser un dato con autoridad. El contrato que esta
// implementacion cumple esta en la seccion 3 de docs/04-organizador.md:
//
//   nombre                              string, para los mensajes
//   async leerCompromisos(scope)        BigInt[] | null
//   async publicarRaiz({scope, raiz, profundidad})  { referencia }
//   async leerRaiz(scope)               BigInt | null
//
// Las tres reglas que se vuelven concretas aca, y no eran mas que una nota
// mientras la fuente era un JSON:
//
//   1. Todo elemento de campo entra y sale como BigInt. ethers v6 devuelve
//      bigint nativo para uint256, pero el uint8 de la profundidad vuelve como
//      number y el scope hay que mandarlo como BigInt: la conversion es trabajo
//      de esta implementacion, no de quien la usa.
//   2. Todos los metodos son async. Una llamada a un nodo no puede no serlo.
//   3. Ausente es null, nunca cero. Un mapping vacio de Solidity devuelve 0 y 0
//      es un elemento de campo valido: por eso getRaiz devuelve tambien un
//      booleano `publicada`, y es ese booleano —no el valor— el que decide si
//      esta funcion contesta un BigInt o null.
//
// Ver docs/08-contrato-raiz.md.

import { exigirEnCampo } from "../lib/campo.mjs";
import { RPC, anotarPublicacion, conectar } from "../lib/cadena.mjs";

export async function fuenteContratoRaiz({ silencioso = false, yaConectado = null } = {}) {
  // La conexion se arma una vez, al construir la fuente: levanta la cadena si hace
  // falta, compila si hace falta y despliega si hace falta. `yaConectado` es para
  // quien ya tiene un contrato que hereda RegistroDeRaiz: T12 reusa estos metodos.
  const { contrato, direccion } = yaConectado ?? (await conectar({ silencioso }));

  return {
    nombre: `contrato (RegistroDeRaiz ${direccion} en ${RPC})`,

    // Este contrato guarda la raiz y nada mas: no sabe quien compro ni cuantos
    // son. Los compromisos los sigue originando el organizador. La fuente que va
    // a contestar que si es fuentes/contrato-nft.mjs en T12.
    async leerCompromisos() {
      return null;
    },

    async publicarRaiz({ scope, raiz, profundidad }) {
      exigirEnCampo(raiz, "publicarRaiz: raiz");
      exigirEnCampo(scope, "publicarRaiz: scope");

      // Aca esta la frontera: de este lado son BigInt de JavaScript, del otro son
      // uint256 de Solidity. ethers hace la conversion, pero el contrato vuelve a
      // validar el rango: dos chequeos del mismo invariante, uno a cada lado, es
      // lo correcto cuando el de enfrente no puede confiar en el de aca.
      const tx = await contrato.setRaiz(scope, raiz, profundidad);
      const recibo = await tx.wait();

      anotarPublicacion({
        scope: scope.toString(),
        raiz: raiz.toString(),
        profundidad,
        tx: recibo.hash,
        bloque: recibo.blockNumber,
        gas: Number(recibo.gasUsed),
        momento: new Date().toISOString(),
      });

      // La referencia de una raiz publicada on-chain es el hash de su
      // transaccion: es lo que permite ir a buscarla y ver quien la mando,
      // cuando y con que valor.
      return { referencia: recibo.hash, gas: Number(recibo.gasUsed), bloque: recibo.blockNumber };
    },

    async leerRaiz(scope) {
      // Una lectura no es una transaccion: ethers la manda como eth_call, el nodo
      // la ejecuta y contesta. No hay bloque, no hay firma y no hay gas.
      const [raiz, , publicada] = await contrato.getRaiz(scope);
      if (!publicada) return null;
      return exigirEnCampo(BigInt(raiz), `leerRaiz: raiz del contrato para el scope ${scope}`);
    },
  };
}
