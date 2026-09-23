#!/usr/bin/env node
// EntradaNFT, probado y medido.
//
// Uso: npm run contrato:nft
//
// Tres cosas en un comando:
//
//   Tests      las reglas del contrato, cada una probada rompiendola. La que
//              manda es la negativa: un tercero NO puede enviar el compromiso de
//              un token ajeno.
//   Gas        cuanto cuesta emitir una entrada y cuanto enviar un compromiso.
//              Los numeros salen de transacciones de verdad, no de estimaciones.
//   El punto   lo que la cadena deja ver de todo esto: la tabla billetera <->
//              compromiso, armada leyendo los logs y nada mas. Emitir un NFT no da
//              privacidad, y aca se ve por que.
//
// Parte de una cadena nueva en cada corrida: si no, el gas de la primera escritura
// seria el de pisar la de la corrida anterior.
//
// Ver docs/09-entrada-nft.md.

import { ethers } from "ethers";

import { P, secretoDeterminista } from "../lib/campo.mjs";
import { construirHashes } from "../lib/merkle.mjs";
import { abiDelContrato, clientes, compilarSiHaceFalta, motivoDeRevert, reiniciarCadena } from "../lib/cadena.mjs";

// La frase de la cadena local de Hardhat. Es publica y es la misma en todas las
// maquinas: la imprime el nodo cada vez que arranca. De aca salen la cuenta #0
// (el organizador) y las tres que hacen de compradores.
const FRASE_LOCAL = "test test test test test test test test test test test junk";

const SEMILLA = "tpf211-hito1-compradores";

const corto = (direccion) => `${direccion.slice(0, 6)}...${direccion.slice(-4)}`;
const recorte = (n) => (String(n).length > 24 ? `${String(n).slice(0, 24)}...` : String(n));
const miles = (n) => n.toLocaleString("es-AR");

function cuentaLocal(indice, proveedor) {
  return ethers.HDNodeWallet.fromPhrase(FRASE_LOCAL, "", `m/44'/60'/0'/0/${indice}`).connect(proveedor);
}

async function main() {
  const fallas = [];
  let tests = 0;
  const anotar = (titulo, ok, detalle) => {
    tests++;
    console.log(`  ${titulo.padEnd(62)}${ok ? "OK   " : "FALLA"}  ${detalle}`);
    if (!ok) fallas.push(titulo);
  };

  console.log("\nContrato EntradaNFT - tests y gas\n");

  await reiniciarCadena({ silencioso: true });
  compilarSiHaceFalta({ silencioso: true });

  const { proveedor, firmante: organizador } = clientes();
  const { abi, bytecode } = abiDelContrato("EntradaNFT");

  const fabrica = new ethers.ContractFactory(abi, bytecode, organizador);
  const desplegado = await fabrica.deploy("Entrada TPF211", "ENT211");
  const reciboDespliegue = await desplegado.deploymentTransaction().wait();
  const direccion = await desplegado.getAddress();
  const contrato = new ethers.Contract(direccion, abi, organizador);

  // Tres compradores, cada uno con su billetera. Son cuentas de la cadena local:
  // publicas, con fondos y sin ningun secreto adentro.
  const compradores = [cuentaLocal(1, proveedor), cuentaLocal(2, proveedor), cuentaLocal(3, proveedor)];
  const comoA = contrato.connect(compradores[0]);
  const comoB = contrato.connect(compradores[1]);
  const comoC = contrato.connect(compradores[2]);

  console.log(`  contrato          EntradaNFT en ${direccion} (${miles(Number(reciboDespliegue.gasUsed))} gas)`);
  console.log(`  nombre / simbolo  ${await contrato.name()} / ${await contrato.symbol()}`);
  console.log(`  organizador       ${await organizador.getAddress()}`);
  for (const [i, c] of compradores.entries()) {
    console.log(`  comprador ${"ABC"[i]}       ${await c.getAddress()}`);
  }

  // Los compromisos. Cada comprador deriva su secreto en su dispositivo y calcula
  // Poseidon(secreto): al contrato le llega el resultado y nunca el secreto. Que la
  // cuenta se haga aca, en un solo proceso, es una comodidad de la PoC.
  const { hash1 } = await construirHashes();
  const secretos = [0, 1, 2].map((i) => secretoDeterminista(SEMILLA, i).secreto);
  const compromisos = secretos.map((s) => hash1(s));

  // --- Emitir ---

  console.log("\nEmitir entradas\n");
  const emisiones = [];
  for (const [i, comprador] of compradores.entries()) {
    const recibo = await (await contrato.emitir(await comprador.getAddress())).wait();
    emisiones.push(Number(recibo.gasUsed));
    console.log(`  token ${i}           a ${corto(await comprador.getAddress())}   ${miles(Number(recibo.gasUsed))} gas`);
  }
  // Una cuarta entrada, del comprador A, que se queda sin enviar compromiso: es la
  // que muestra la diferencia entre "no envio" y "envio un cero".
  const reciboCuarta = await (await contrato.emitir(await compradores[0].getAddress())).wait();
  emisiones.push(Number(reciboCuarta.gasUsed));
  console.log(`  token 3           a ${corto(await compradores[0].getAddress())}   ${miles(Number(reciboCuarta.gasUsed))} gas   <- se queda sin compromiso`);

  // --- Enviar compromisos ---

  console.log("\nEnviar compromisos\n");
  const gasCompromiso = [];
  for (const [i, como] of [comoA, comoB].entries()) {
    const recibo = await (await como.enviarCompromiso(i, compromisos[i])).wait();
    gasCompromiso.push(Number(recibo.gasUsed));
    console.log(`  token ${i}           ${recorte(compromisos[i])}   ${miles(Number(recibo.gasUsed))} gas`);
  }
  // El token 2 manda un compromiso que vale 0. Es un elemento de campo valido y el
  // contrato tiene que aceptarlo: la bandera `enviado` es la que dice si hay algo.
  const reciboCero = await (await comoC.enviarCompromiso(2, 0n)).wait();
  console.log(`  token 2           ${recorte(0n).padEnd(27)}   ${miles(Number(reciboCero.gasUsed))} gas   <- un compromiso que vale 0`);

  console.log(
    `\n  Enviar el compromiso de una entrada cuesta ${miles(gasCompromiso[0])} gas y lo paga el comprador,`
  );
  console.log("  no el organizador. Por que ese numero es el que es, en la seccion 3 del documento.");

  // --- Tests ---

  console.log("\nTests\n");

  // 1. El NFT es un ERC-721 de verdad, no algo parecido. El identificador de la
  //    interfaz esta en el estandar (EIP-721) y lo contesta ERC165.
  anotar(
    "es un ERC-721 segun ERC165 (0x80ac58cd)",
    await contrato.supportsInterface("0x80ac58cd"),
    "la implementacion es la de OpenZeppelin 5.6.1"
  );

  // 2. Lo que el NFT hace publico, dicho como test: ownerOf devuelve una billetera
  //    y la puede consultar cualquiera. Esto NO es una falla: es lo que permite la
  //    reventa y las regalias. Es una falla solo si se lo confunde con privacidad.
  const duenio0 = await contrato.ownerOf(0);
  anotar(
    "ownerOf(0) devuelve la billetera del comprador A",
    duenio0 === (await compradores[0].getAddress()),
    `${duenio0}  (publico: lo lee cualquiera)`
  );

  // 3. El compromiso quedo guardado y se lee tal cual se envio.
  const [valor0, enviado0] = await contrato.compromisoDe(0);
  anotar(
    "el duenio envio su compromiso y quedo guardado",
    enviado0 === true && valor0 === compromisos[0],
    `${recorte(valor0)} enviado=${enviado0}`
  );

  // 4. LA PRUEBA QUE MANDA. Un tercero no puede enviar el compromiso de un token
  //    que no es suyo. Sin esto, cualquiera podria meter su propia hoja en el arbol
  //    a nombre de una entrada ajena, y el dueno de verdad no entraria.
  let motivoTercero = "no reverti: el tercero escribio";
  try {
    await (await comoB.enviarCompromiso(3, compromisos[1])).wait();
  } catch (e) {
    motivoTercero = motivoDeRevert(e, abi);
  }
  const [, enviado3] = await contrato.compromisoDe(3);
  anotar("un tercero NO puede enviar el compromiso de un token ajeno", enviado3 === false, motivoTercero);

  // 5. Ni siquiera el organizador, que emitio el token, puede enviar por el.
  let motivoOrganizador = "no reverti: el organizador escribio";
  try {
    await (await contrato.enviarCompromiso(3, compromisos[2])).wait();
  } catch (e) {
    motivoOrganizador = motivoDeRevert(e, abi);
  }
  const [, enviado3Bis] = await contrato.compromisoDe(3);
  anotar("tampoco el organizador puede enviar por un comprador", enviado3Bis === false, motivoOrganizador);

  // 6. Una sola vez por token. La hoja que entra al arbol tiene que ser una y no
  //    un valor que cambia despues de que la raiz se publico.
  let motivoDosVeces = "no reverti: se envio dos veces";
  try {
    await (await comoA.enviarCompromiso(0, compromisos[2])).wait();
  } catch (e) {
    motivoDosVeces = motivoDeRevert(e, abi);
  }
  const [valor0Bis] = await contrato.compromisoDe(0);
  anotar("enviar dos veces el mismo token se rechaza", valor0Bis === compromisos[0], motivoDosVeces);

  // 7. El rango, del lado del contrato. lib/campo.mjs ya valida en JavaScript, pero
  //    el contrato no puede confiar en que quien lo llama sea nuestro script: un
  //    valor >= P lo reduciria el arbol en silencio y la hoja no seria la enviada.
  let motivoRango = "no reverti: acepto un valor fuera del campo";
  try {
    await (await comoA.enviarCompromiso(3, P)).wait();
  } catch (e) {
    motivoRango = motivoDeRevert(e, abi);
  }
  anotar("un compromiso >= p se rechaza on-chain", motivoRango.includes("FueraDelCampo"), motivoRango);

  // 8. Un token que no existe. No hace falta un chequeo propio: ownerOf revierte con
  //    el error de OpenZeppelin, que dice exactamente que paso.
  let motivoInexistente = "no reverti: acepto un token que no existe";
  try {
    await (await comoA.enviarCompromiso(99, compromisos[0])).wait();
  } catch (e) {
    motivoInexistente = motivoDeRevert(e, abi);
  }
  anotar("un token que no existe se rechaza", motivoInexistente.includes("ERC721NonexistentToken"), motivoInexistente);

  // 9. La otra mitad de la leccion de T09: ausente no es cero. El token 2 envio un
  //    compromiso que vale 0 y el token 3 no envio ninguno. El mapping contesta 0 a
  //    los dos: lo unico que los distingue es la bandera.
  const [valor2, enviado2] = await contrato.compromisoDe(2);
  const [valor3, enviado3Ter] = await contrato.compromisoDe(3);
  anotar(
    "un compromiso que vale 0 no es lo mismo que no haber enviado",
    valor2 === 0n && enviado2 === true && valor3 === 0n && enviado3Ter === false,
    `token 2: (0, ${enviado2}) | token 3: (0, ${enviado3Ter})`
  );

  // 10. La raiz de la V1 sigue viva en este contrato: es el mismo RegistroDeRaiz,
  //     heredado y no copiado. Y sigue escribiendolo solo el organizador.
  const RAIZ = 21742806920683719786915181996178546158207976983808212562412387320164881855720n;
  await (await contrato.setRaiz(1234n, RAIZ, 3)).wait();
  const [raizLeida, profundidad, publicada] = await contrato.getRaiz(1234n);
  let motivoRaizAjena = "no reverti: un comprador publico la raiz";
  try {
    await (await comoA.setRaiz(4242n, RAIZ, 3)).wait();
  } catch (e) {
    motivoRaizAjena = motivoDeRevert(e, abi);
  }
  anotar(
    "la raiz de la V1 sigue funcionando en este contrato",
    raizLeida === RAIZ && Number(profundidad) === 3 && publicada === true,
    `getRaiz(1234) = (${recorte(raizLeida)}, 3, true)`
  );
  anotar(
    "y la sigue escribiendo solo el organizador",
    (await contrato.getRaiz(4242n))[2] === false,
    motivoRaizAjena
  );

  // 11. La reventa, que es el caso que nadie ve venir. El comprador B vende su
  //     entrada: el token cambia de duenio y el compromiso NO. El que compro no
  //     puede meter su propio secreto en el arbol, y el que vendio todavia sabe el
  //     suyo. Esta contado en la seccion 6 del documento: es candidato a ADR.
  await (await comoB.transferFrom(await compradores[1].getAddress(), await compradores[2].getAddress(), 1)).wait();
  let motivoReventa = "no reverti: el comprador nuevo cambio el compromiso";
  try {
    await (await comoC.enviarCompromiso(1, compromisos[2])).wait();
  } catch (e) {
    motivoReventa = motivoDeRevert(e, abi);
  }
  const [valor1] = await contrato.compromisoDe(1);
  anotar(
    "una entrada revendida se lleva el compromiso del vendedor",
    (await contrato.ownerOf(1)) === (await compradores[2].getAddress()) && valor1 === compromisos[1],
    motivoReventa
  );

  // --- Lo que la cadena deja ver ---

  console.log("\nLo que cualquiera puede leer de esta cadena\n");
  const eventos = await contrato.queryFilter(contrato.filters.CompromisoEnviado());
  console.log("  token  billetera que lo envio                 compromiso");
  for (const evento of eventos) {
    const { tokenId, compromiso, duenio } = evento.args;
    console.log(`  ${String(tokenId).padStart(5)}  ${duenio}  ${recorte(compromiso)}`);
  }
  console.log("\n  Esa tabla se arma con los logs de la cadena y nada mas: sin el repositorio,");
  console.log("  sin hablar con el organizador y sin permiso de nadie. El NFT no oculta quien");
  console.log("  compro ni que compromiso mando. Lo unico que oculta el ZK es CUAL de las");
  console.log("  hojas del arbol es la que esta entrando por la puerta, y para que eso valga");
  console.log("  algo hay que romper este vinculo. Ese es el problema abierto de la seccion 3");
  console.log("  de docs/09-entrada-nft.md, y se responde en T13.");

  // --- Gas ---

  console.log("\nGas\n");
  console.log("  que                                              gas       quien paga");
  console.log(`  desplegar EntradaNFT (una sola vez)           ${String(miles(Number(reciboDespliegue.gasUsed))).padStart(9)}   el organizador`);
  console.log(`  emitir la primera entrada                     ${String(miles(emisiones[0])).padStart(9)}   el organizador`);
  console.log(`  emitir las siguientes                         ${String(miles(emisiones[1])).padStart(9)}   el organizador`);
  console.log(`  enviar un compromiso                          ${String(miles(gasCompromiso[0])).padStart(9)}   el comprador`);
  console.log(`  enviar un compromiso que vale 0               ${String(miles(Number(reciboCero.gasUsed))).padStart(9)}   el comprador`);
  console.log("\n  Son numeros de la cadena local de Hardhat, que aplica las mismas reglas de gas");
  console.log("  que la red principal pero no tiene precio. Miden trabajo, no plata.");

  if (fallas.length) {
    console.error("\nCONTRATO NO VALIDADO.\n");
    for (const f of fallas) console.error(`  - ${f}`);
    console.error("");
    process.exit(1);
  }

  console.log(`\n  Los ${tests} tests dan lo esperado.`);
  console.log("\n  La cadena queda levantada. Bajala con:  npm run cadena:abajo");
  console.log("\nVer docs/09-entrada-nft.md.\n");
  process.exit(0);
}

main().catch((e) => {
  console.error(`\n${e.name === "RangeError" || e.name === "TypeError" ? "VALOR INVALIDO" : "Error"}:`);
  console.error(e.message || e);
  if (e.name !== "RangeError" && e.name !== "TypeError") console.error(e);
  console.error("");
  process.exit(1);
});
