#!/usr/bin/env node
// La cadena local: levantarla, bajarla, y decir que hay adentro.
//
// Uso: npm run cadena:arriba
//      npm run cadena:abajo
//      npm run cadena:estado
//
// Ningun comando del proyecto necesita que la cadena este levantada de antes:
// el organizador, el prover y el provisionador la levantan solos si hace falta.
// Estos tres comandos estan para mirarla y para bajarla cuando terminaste.
//
// Ver docs/08-contrato-raiz.md.

import { RPC, bajarCadena, cadenaViva, leerEstadoLocal, levantarCadena } from "../lib/cadena.mjs";

function leerArgumentos(argv) {
  const conocidos = ["--arriba", "--abajo", "--estado"];
  const elegidos = argv.filter((a) => conocidos.includes(a));
  const desconocidos = argv.filter((a) => !conocidos.includes(a));
  if (desconocidos.length || elegidos.length !== 1) {
    console.error("\nUso: npm run cadena:arriba | cadena:abajo | cadena:estado\n");
    process.exit(1);
  }
  return elegidos[0].slice(2);
}

async function estado() {
  const chainId = await cadenaViva();
  const { nodo, despliegue, publicaciones } = leerEstadoLocal();

  console.log("\nCadena local - estado\n");
  console.log(`  rpc               ${RPC}`);
  console.log(`  viva              ${chainId === null ? "no" : `si (chainId ${chainId}, pid ${nodo?.pid ?? "?"})`}`);

  if (chainId === null) {
    console.log("\n  No hay ninguna cadena contestando. Un nodo de Hardhat guarda su mundo en");
    console.log("  memoria: cuando el proceso muere no queda ni el contrato ni las raices.");
    console.log("\n  Levantala con:  npm run cadena:arriba\n");
    process.exit(0);
  }

  console.log(
    `  contrato          ${despliegue ? `RegistroDeRaiz en ${despliegue.direccion}` : "ninguno desplegado todavia"}`
  );
  if (despliegue) {
    console.log(`  organizador       ${despliegue.organizador}  (la unica cuenta que puede escribir)`);
    console.log(`  gas de desplegar  ${despliegue.gas_despliegue.toLocaleString("es-AR")}`);
  }

  console.log(`\nRaices publicadas en esta cadena  (${publicaciones.length})\n`);
  if (publicaciones.length === 0) {
    console.log("  ninguna todavia. Corre:  npm run organizador\n");
  } else {
    console.log("  scope                 gas      bloque  raiz");
    for (const p of publicaciones) {
      console.log(
        `  ${p.scope.padEnd(20).slice(0, 20)}  ${String(p.gas).padStart(6)}  ${String(p.bloque).padStart(6)}  ${p.raiz.slice(0, 24)}...`
      );
    }
    console.log("\n  Escribir cuesta gas; leer no cuesta nada. Por que, en docs/08-contrato-raiz.md.\n");
  }
}

async function main() {
  const que = leerArgumentos(process.argv.slice(2));

  if (que === "estado") return estado();

  if (que === "arriba") {
    console.log("\nCadena local\n");
    const r = await levantarCadena();
    if (r.reusada) console.log(`  cadena local      ya estaba levantada en ${RPC} (chainId ${r.chainId})`);
    console.log("\n  Nada mas la necesita de antes: el organizador la levanta solo si esta baja.");
    console.log("  Cuando termines:  npm run cadena:abajo\n");
    return;
  }

  console.log("\nCadena local\n");
  const r = await bajarCadena();
  if (!r.bajada) console.log(`  cadena local      ${r.motivo}`);
  console.log("\n  Con el nodo se fue todo: el contrato desplegado y las raices publicadas.");
  console.log("  Eso es propio de esta cadena de juguete, no de una cadena de verdad.\n");
}

main().catch((e) => {
  console.error(`\nError:\n${e.message || e}\n`);
  process.exit(1);
});
