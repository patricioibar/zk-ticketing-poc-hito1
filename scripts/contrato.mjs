#!/usr/bin/env node
// El contrato, medido y apretado.
//
// Uso: npm run contrato:medir
//
// Dos cosas en un comando, porque son la misma pregunta vista de los dos lados:
//
//   Gas       cuanto cuesta cada escritura y cuanto cuesta cada lectura. Los
//             numeros salen de transacciones de verdad en la cadena local, no de
//             una estimacion.
//   Controles las cuatro reglas que la interfaz fuenteDeRaiz y el contrato tienen
//             que cumplir, cada una probada rompiendola: ausente es null y no 0,
//             una raiz que vale 0 se publica y se lee como 0, el que no es el
//             organizador no escribe, y una raiz fuera del campo se rechaza.
//
// Parte de una cadena nueva en cada corrida: si no, la "primera" publicacion
// estaria pisando la de la corrida anterior y costaria un tercio.
//
// Ver docs/08-contrato-raiz.md.

import { ethers } from "ethers";

import { P } from "../lib/campo.mjs";
import { asegurarDespliegue, clientes, motivoDeRevert, reiniciarCadena } from "../lib/cadena.mjs";
import { fuenteContratoRaiz } from "../fuentes/contrato-raiz.mjs";

// La cuenta #1 de la cadena local. Publica, como todas: ver lib/cadena.mjs.
const CLAVE_AJENA = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

const RAIZ_A = 21742806920683719786915181996178546158207976983808212562412387320164881855720n;
const RAIZ_B = 12345678901234567890123456789012345678901234567890123456789012345678901234n;

const miles = (n) => n.toLocaleString("es-AR");

// Por que hace falta decodificar a mano el motivo de un revert esta explicado en
// lib/cadena.mjs, donde vive `motivoDeRevert`: lo usan este script y el de T11.

async function main() {
  const fallas = [];

  console.log("\nContrato RegistroDeRaiz - gas y controles\n");

  await reiniciarCadena();
  const despliegue = await asegurarDespliegue({ silencioso: true });
  const fuente = await fuenteContratoRaiz({ silencioso: true });
  const { proveedor } = clientes();

  console.log(`  contrato          RegistroDeRaiz en ${despliegue.direccion}`);
  console.log(`  organizador       ${despliegue.organizador}`);

  // --- Escribir ---

  const primera = await fuente.publicarRaiz({ scope: 1234n, raiz: RAIZ_A, profundidad: 3 });
  const pisando = await fuente.publicarRaiz({ scope: 1234n, raiz: RAIZ_B, profundidad: 3 });
  const igual = await fuente.publicarRaiz({ scope: 1234n, raiz: RAIZ_B, profundidad: 3 });
  const otroEvento = await fuente.publicarRaiz({ scope: 5678n, raiz: RAIZ_A, profundidad: 3 });

  console.log("\nEscribir cuesta\n");
  console.log("  que                                              gas");
  console.log(`  desplegar el contrato (una sola vez)          ${String(miles(despliegue.gas_despliegue)).padStart(8)}`);
  console.log(`  publicar la raiz de un evento nuevo           ${String(miles(primera.gas)).padStart(8)}   <- el numero que importa`);
  console.log(`  pisar esa raiz con otra                       ${String(miles(pisando.gas)).padStart(8)}`);
  console.log(`  volver a publicar exactamente la misma raiz   ${String(miles(igual.gas)).padStart(8)}`);
  console.log(`  publicar la raiz de un segundo evento         ${String(miles(otroEvento.gas)).padStart(8)}`);
  console.log(
    `\n  La diferencia entre la primera (${miles(primera.gas)}) y la que la pisa (${miles(pisando.gas)}) es de ${miles(primera.gas - pisando.gas)} gas:`
  );
  console.log("  estrenar un casillero de storage cuesta mucho mas que cambiarlo. Por que, en");
  console.log("  la seccion 3 del documento.");

  // --- Leer ---

  const t0 = process.hrtime.bigint();
  const leida = await fuente.leerRaiz(1234n);
  const msLectura = Number(process.hrtime.bigint() - t0) / 1e6;

  // Cuanto costaria la MISMA lectura si en vez de preguntar la ejecutara una
  // transaccion. No se paga: es lo que se ahorra por leer en vez de escribir.
  const contratoLectura = new ethers.Contract(despliegue.direccion, despliegue.abi, proveedor);
  const gasSiFueraTx = await contratoLectura.getRaiz.estimateGas(1234n);
  const bloqueAntes = await proveedor.getBlockNumber();
  await fuente.leerRaiz(1234n);
  const bloqueDespues = await proveedor.getBlockNumber();

  console.log("\nLeer no cuesta\n");
  console.log(`  leerRaiz(1234)                                       ${leida.toString().slice(0, 20)}...`);
  console.log(`  gas que paga quien lee                                      0`);
  console.log(`  bloques que produjo la lectura                              ${bloqueDespues - bloqueAntes}`);
  console.log(`  tardo                                                 ${msLectura.toFixed(1)} ms`);
  console.log(`  lo que costaria si fuera una transaccion              ${miles(Number(gasSiFueraTx))} gas`);
  console.log("\n  Una lectura es un eth_call: el nodo ejecuta la funcion en su copia del estado,");
  console.log("  contesta y no escribe nada. No hay bloque, no hay firma y no hay nadie a quien");
  console.log("  cobrarle. Por eso el prover y el provisionador de puertas leen la raiz gratis,");
  console.log("  y solo el organizador paga.");

  // --- Controles ---

  console.log("\nControles\n");

  const anotar = (titulo, ok, detalle) => {
    console.log(`  ${titulo.padEnd(56)}${ok ? "OK   " : "FALLA"}  ${detalle}`);
    if (!ok) fallas.push(titulo);
  };

  // 1. Ausente es null, nunca 0. Es la regla 3 de la interfaz y en un contrato deja
  //    de ser teorica: el mapping contesta 0 para cualquier scope que no se publico.
  const ausente = await fuente.leerRaiz(999_999n);
  const crudo = await contratoLectura.getRaiz(999_999n);
  anotar(
    "un scope sin publicar: el mapping devuelve 0...",
    crudo[0] === 0n && crudo[2] === false,
    `raiz=${crudo[0]}, publicada=${crudo[2]}`
  );
  anotar("...y la fuente lo traduce a null", ausente === null, `leerRaiz devolvio ${ausente}`);

  // 2. La otra mitad de la misma regla, y la que se olvida: una raiz que vale 0 es
  //    una raiz legitima. Si la fuente devolviera null cuando el valor es 0, este
  //    evento no tendria raiz aunque acabe de publicarla.
  await fuente.publicarRaiz({ scope: 4242n, raiz: 0n, profundidad: 3 });
  const cero = await fuente.leerRaiz(4242n);
  anotar(
    "una raiz que vale 0, publicada, se lee 0 y no null",
    cero === 0n && typeof cero === "bigint",
    `leerRaiz devolvio ${cero} (${typeof cero})`
  );

  // 3. Escribe el organizador y nadie mas. Es lo que hace que la raiz sea un dato
  //    con autoridad y no un archivo que cualquiera edita.
  const ajeno = new ethers.Contract(
    despliegue.direccion,
    despliegue.abi,
    new ethers.Wallet(CLAVE_AJENA, proveedor)
  );
  let motivoAjeno = "no reverti: escribio";
  try {
    await (await ajeno.setRaiz(7777n, RAIZ_A, 3)).wait();
  } catch (e) {
    motivoAjeno = motivoDeRevert(e, despliegue.abi);
  }
  const seguidaAusente = await fuente.leerRaiz(7777n);
  anotar("otra cuenta no puede publicar una raiz", seguidaAusente === null, motivoAjeno);

  // 4. El rango, del lado del contrato. lib/campo.mjs ya lo valida en JavaScript,
  //    pero el contrato no puede confiar en que quien lo llama sea nuestro script.
  let motivoRango = "no reverti: acepto un valor fuera del campo";
  try {
    const contratoOrganizador = new ethers.Contract(despliegue.direccion, despliegue.abi, despliegue.firmante);
    await (await contratoOrganizador.setRaiz(8888n, P, 3)).wait();
  } catch (e) {
    motivoRango = motivoDeRevert(e, despliegue.abi);
  }
  const rangoAusente = await fuente.leerRaiz(8888n);
  anotar("una raiz >= p se rechaza on-chain", rangoAusente === null, motivoRango);

  if (fallas.length) {
    console.error("\nCONTRATO NO VALIDADO.\n");
    for (const f of fallas) console.error(`  - ${f}`);
    console.error("");
    process.exit(1);
  }

  console.log("\n  Los cinco controles dan lo esperado.");
  console.log("\n  La cadena queda levantada. Bajala con:  npm run cadena:abajo");
  console.log("\nVer docs/08-contrato-raiz.md.\n");
  process.exit(0);
}

main().catch((e) => {
  console.error(`\n${e.name === "RangeError" || e.name === "TypeError" ? "VALOR INVALIDO" : "Error"}:`);
  console.error(e.message || e);
  if (e.name !== "RangeError" && e.name !== "TypeError") console.error(e);
  console.error("");
  process.exit(1);
});
