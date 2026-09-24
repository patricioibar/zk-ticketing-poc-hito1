// Los ocho compradores: el lado del sistema que en la parte base no existia.
//
// Este modulo es el "afuera" del organizador. Cada comprador tiene su propia
// billetera, deriva su propio secreto sin preguntarle nada a nadie, calcula
// Poseidon(secreto) en su maquina y manda ESE numero al contrato firmando con su
// propia cuenta. El organizador emite los NFT y despues solo lee.
//
// La linea que importa esta en `secretoDelComprador`: el secreto sale de la clave
// privada del comprador, que el organizador no tiene. En la parte base salia de una
// semilla que el organizador elegia (lib/campo.mjs, secretoDeterminista, llamado
// desde scripts/organizador.mjs): ahi podia generar la prueba de cualquiera de sus
// compradores. Aca no puede generar ninguna.
//
// Lo que este modulo NO hace: no arma el arbol, no calcula la raiz y no la publica.
// Eso sigue siendo del organizador, que trabaja con lo que encuentra en la cadena.
// Ver docs/10-flujo-completo.md.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { ethers } from "ethers";

import { exigirEnCampo, secretoDeterminista } from "./campo.mjs";
import { construirHashes } from "./merkle.mjs";
import { RAIZ_REPO, abiDelContrato, clientes, conectar, cuentaLocal } from "./cadena.mjs";

export const ENTRADAS = 8;

// El contrato se despliega con estos dos argumentos y EntradaNFT los guarda como
// nombre y simbolo del ERC-721. No cambian entre corridas: si cambiaran, cambiaria
// el bytecode del constructor y la direccion del contrato.
export const NOMBRE_NFT = "Entrada TPF211";
export const SIMBOLO_NFT = "ENT211";

// El orden en que los ocho compradores mandan su compromiso, por numero de token.
// NO es 0,1,2,...,7 a proposito: la posicion de una hoja en el arbol la decide el
// orden en que llegaron las transacciones, y con este orden salteado eso se ve en
// la tabla que imprime `npm run flujo` en vez de haber que creerlo. La lista es fija
// para que la corrida sea reproducible; en el sistema real la deciden ocho personas
// que compran cuando se les da la gana. La seccion 3 del documento discute si el
// orden de llegada es una buena eleccion o no.
export const ORDEN_DE_ENVIO = [5, 0, 7, 2, 6, 1, 4, 3];

const rutaSecretos = join(RAIZ_REPO, "datos", "secretos.json");

// El secreto de un comprador, derivado de su propia clave privada y de nada mas.
//
// Que sea derivado y no aleatorio es una decision de la PoC y tiene dos razones: la
// corrida entera es reproducible —los mismos ocho compromisos, el mismo arbol y la
// misma raiz en cualquier maquina— y ningun comprador necesita guardar un archivo
// para no perder su entrada. El precio: quien tenga la clave privada tiene el
// secreto. En esta PoC las claves son las de la cadena local, que son publicas, asi
// que estos "secretos" son publicos: lo que la corrida demuestra es el RECORRIDO de
// la informacion —quien calcula que, y que viaja— y no su confidencialidad.
// La alternativa (aleatorio y persistido) esta en la seccion 4 del documento.
export function secretoDelComprador(billetera) {
  const { secreto } = secretoDeterminista(billetera.privateKey, "compromiso-de-entrada");
  return exigirEnCampo(secreto, `secreto del comprador ${billetera.address}`);
}

// Los compromisos que llegaron a la cadena, en el orden en que llegaron.
//
// Se leen del log del evento CompromisoEnviado y se ordenan por bloque y, dentro
// del bloque, por indice del log: ese par es el unico orden total que la cadena
// define entre dos transacciones. El organizador no aporta ni elige nada aca.
export async function compromisosEnCadena(contrato) {
  const logs = await contrato.queryFilter(contrato.filters.CompromisoEnviado());
  const ordenados = [...logs].sort((a, b) => a.blockNumber - b.blockNumber || a.index - b.index);
  return ordenados.map((log, posicion) => ({
    posicion,
    tokenId: Number(log.args.tokenId),
    compromiso: exigirEnCampo(BigInt(log.args.compromiso), `compromiso del token ${log.args.tokenId}`),
    de: log.args.duenio,
    bloque: log.blockNumber,
    indice: log.index,
  }));
}

// La bolsa de secretos: ocho archivos de ocho telefonos, juntados en uno solo
// porque esta PoC corre en una sola computadora. El organizador no la escribe y no
// la lee: la escriben los compradores y la lee el prover, que es el asistente que
// corre del lado de cada uno de ellos.
function guardarBolsa(llegados, porToken) {
  const documento = {
    formato: "secretos-de-compradores@1",
    advertencia:
      "Esto NO es un archivo del organizador. Cada entrada la genero su comprador en su " +
      "dispositivo, a partir de su propia clave privada, y el organizador nunca vio ninguno " +
      "de estos valores: lo unico que salio de cada dispositivo fue el compromiso. Que los " +
      "ocho esten en un archivo es una comodidad de la PoC, que corre en una sola maquina. " +
      "Ver docs/10-flujo-completo.md.",
    origen: "cada comprador, localmente (lib/compradores.mjs)",
    identidades: llegados.map((l) => ({
      posicion: l.posicion,
      secreto: porToken.get(l.tokenId).secreto.toString(),
      compromiso: l.compromiso.toString(),
      token: l.tokenId,
      billetera: l.de,
    })),
  };
  mkdirSync(join(RAIZ_REPO, "datos"), { recursive: true });
  writeFileSync(rutaSecretos, `${JSON.stringify(documento, null, 2)}\n`);
  return rutaSecretos;
}

// Deja la cadena con el contrato desplegado, las ocho entradas emitidas y los
// compromisos enviados, y no hace nada de lo que ya este hecho.
//
// Es idempotente por la misma razon que asegurarDespliegue: un nodo de Hardhat
// guarda su mundo en memoria, y cualquier comando que lo reinicie —npm test lo hace
// en cada corrida— se lleva puestos el contrato y los ocho compromisos. En un
// sistema real esto no existe: las ocho personas compraron una vez y la cadena se
// acuerda. Aca hay que poder rehacerlo, y rehacerlo es volver a mandar las mismas
// ocho transacciones desde las mismas ocho cuentas, cada una firmando la suya.
export async function asegurarCompradores({ silencioso = true, omitir = [], alHacer = null } = {}) {
  // FLUJO_SIN_ENVIAR=5 hace que el token 5 nunca mande su compromiso, en este
  // proceso y en los que arranque despues (el organizador es uno de ellos). Es la
  // unica forma de que la omision sobreviva al `spawn`, y es el mismo mecanismo que
  // FUENTE. Sirve para el caso incomodo de la seccion 3: un duenio que no envia.
  const omitidos = [
    ...omitir,
    // El filtro de vacios va ANTES del Number: Number("") es 0, asi que sin el, una
    // variable vacia deja afuera al token 0 y el sintoma aparece recien en el arbol.
    ...String(process.env.FLUJO_SIN_ENVIAR ?? "")
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean)
      .map(Number)
      .filter(Number.isInteger),
  ];
  const aviso = (texto) => {
    if (alHacer) alHacer(texto);
    else if (!silencioso) console.log(texto);
  };

  const { direccion, abi, nuevo } = await conectar({
    silencioso,
    nombre: "EntradaNFT",
    args: [NOMBRE_NFT, SIMBOLO_NFT],
  });
  const { proveedor, firmante: organizador } = clientes();
  const contrato = new ethers.Contract(direccion, abi, organizador);

  const { hash1 } = await construirHashes();
  // La cuenta 0 es el organizador; los compradores son la 1 a la 8. Cada uno arma su
  // secreto y su compromiso aca, del lado del comprador: lo unico que despues viaja
  // a la cadena es el compromiso.
  const compradores = [];
  for (let i = 0; i < ENTRADAS; i++) {
    const billetera = cuentaLocal(i + 1, proveedor);
    const secreto = secretoDelComprador(billetera);
    compradores.push({ tokenId: i, billetera, direccion: billetera.address, secreto, compromiso: hash1(secreto) });
  }

  // Emitir: lo hace el organizador, y es lo unico que hace. Un token por comprador,
  // en orden, asi que el tokenId i es del comprador i.
  const emitidos = Number(await contrato.emitidos());
  for (let i = emitidos; i < ENTRADAS; i++) {
    const recibo = await (await contrato.emitir(compradores[i].direccion)).wait();
    compradores[i].gasEmision = Number(recibo.gasUsed);
    aviso(`  emitir token ${i}     a ${compradores[i].direccion}   ${recibo.gasUsed} gas`);
  }

  // Enviar: lo hace cada comprador desde SU cuenta. `contrato.connect(billetera)`
  // es literalmente eso: la misma direccion de contrato, otra firma.
  for (const tokenId of ORDEN_DE_ENVIO) {
    if (omitidos.includes(tokenId)) continue;
    const [, enviado] = await contrato.compromisoDe(tokenId);
    if (enviado) continue;
    const comprador = compradores[tokenId];
    const como = contrato.connect(comprador.billetera);
    const recibo = await (await como.enviarCompromiso(tokenId, comprador.compromiso)).wait();
    comprador.gasCompromiso = Number(recibo.gasUsed);
    aviso(`  token ${tokenId} envia su compromiso   ${recibo.gasUsed} gas   (lo paga ${comprador.direccion})`);
  }

  const llegados = await compromisosEnCadena(contrato);
  const porToken = new Map(compradores.map((c) => [c.tokenId, c]));
  const bolsa = guardarBolsa(llegados, porToken);

  return { contrato, direccion, abi, proveedor, organizador, compradores, llegados, bolsa, nuevo };
}

// El ABI de EntradaNFT, para decodificar los errores propios del contrato sin tener
// que conectarse a nada.
export function abiEntradaNft() {
  return abiDelContrato("EntradaNFT").abi;
}
