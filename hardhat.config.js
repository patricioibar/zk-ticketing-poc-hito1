// Configuracion de Hardhat 3. Ver docs/08-contrato-raiz.md.
//
// Hardhat 3 no lee la configuracion de Hardhat 2: cambia el formato (defineConfig),
// el nombre de los campos y como se declara una red. Este archivo es deliberadamente
// corto: de todo Hardhat, esta PoC usa dos cosas —compilar y levantar la cadena
// local— y nada mas. El despliegue y las llamadas al contrato los hace ethers,
// que es lo que el resto del proyecto ya sabe usar.

import { defineConfig } from "hardhat/config";

export default defineConfig({
  // Los fuentes de Solidity viven en contratos/, no en el contracts/ por defecto:
  // el resto del repo nombra sus carpetas en espanol.
  paths: { sources: "contratos" },
  solidity: { version: "0.8.28" },
});
