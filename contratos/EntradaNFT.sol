// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

import {RegistroDeRaiz} from "./RegistroDeRaiz.sol";

/// @title EntradaNFT
/// @notice La entrada como token ERC-721, y el buzon por el que su duenio deja el
///         compromiso que va a entrar al arbol de Merkle. Son dos capas distintas y
///         el contrato existe para que se vean separadas:
///
///           quien es duenio del token   publico, consultable con ownerOf, y es lo
///                                       que hace posible la reventa y las regalias
///           que compromiso se envio     tambien publico aca, pero el SECRETO que lo
///                                       produce nunca sale del telefono del comprador
///
/// @dev    Emitir un NFT no da ninguna privacidad: `ownerOf` devuelve una billetera y
///         cualquiera la puede consultar. Lo unico que sostiene el anonimato en la
///         puerta es que la prueba Groth16 no revela CUAL de las hojas del arbol es la
///         que esta entrando. Que el vinculo billetera <-> compromiso quede a la vista
///         en la cadena es un problema real y abierto: esta planteado en la seccion 3
///         de docs/09-entrada-nft.md y se responde en T13.
///
///         Se hereda de RegistroDeRaiz —no se copia— para conservar la raiz de la V1:
///         este contrato es, ademas de las entradas, el mismo registro de raices que
///         T09 puso a andar, con la misma cuenta organizadora y las mismas reglas.
contract EntradaNFT is ERC721, RegistroDeRaiz {
    /// @dev Misma forma y misma razon que `Publicacion` en RegistroDeRaiz: la bandera
    ///      `enviado` existe porque 0 es un elemento de campo valido y un mapping vacio
    ///      de Solidity tambien contesta 0. Sin ella, "este token no envio compromiso" y
    ///      "el compromiso de este token vale 0" serian el mismo dato.
    struct Compromiso {
        uint256 valor;
        bool enviado;
    }

    /// @dev Arranca en 0 para que el tokenId coincida con la posicion de la hoja en el
    ///      arbol, que tambien se numera desde 0. Como se arma ese arbol es T12.
    uint256 private _proximoToken;

    mapping(uint256 tokenId => Compromiso) private _compromisos;

    event EntradaEmitida(uint256 indexed tokenId, address indexed comprador);

    /// @notice Queda en el log de la cadena, con el numero de token y quien lo mando.
    ///         Es informacion publica: ver la advertencia del encabezado.
    event CompromisoEnviado(uint256 indexed tokenId, uint256 compromiso, address duenio);

    error SoloElDuenio(uint256 tokenId, address quien, address duenio);
    error CompromisoYaEnviado(uint256 tokenId);

    constructor(string memory nombre, string memory simbolo) ERC721(nombre, simbolo) {}

    /// @notice Emite una entrada a nombre de `comprador`. Solo el organizador.
    function emitir(address comprador) external returns (uint256 tokenId) {
        if (msg.sender != organizador) revert SoloElOrganizador(msg.sender, organizador);
        tokenId = _proximoToken++;
        _safeMint(comprador, tokenId);
        emit EntradaEmitida(tokenId, comprador);
    }

    /// @notice El duenio de `tokenId` deja el compromiso que quiere que entre al arbol.
    /// @dev    El compromiso es Poseidon(secreto) y lo calcula el comprador en su
    ///         dispositivo: el contrato recibe un numero y no tiene forma de saber —ni
    ///         de comprobar— que secreto lo produjo. Eso es correcto y es el punto:
    ///         si el contrato pudiera verificarlo, el secreto tendria que haber salido
    ///         del telefono.
    function enviarCompromiso(uint256 tokenId, uint256 compromiso) external {
        // Un token que no existe revierte aca, con el ERC721NonexistentToken de
        // OpenZeppelin: no hace falta un chequeo propio ni un error propio.
        address duenio = ownerOf(tokenId);
        if (duenio != msg.sender) revert SoloElDuenio(tokenId, msg.sender, duenio);
        // Ojo: `compromiso == 0` es valido. Lo que se rechaza es un valor que no entre
        // en el campo, porque el arbol lo reduciria modulo P y la hoja guardada no
        // seria la enviada. Mismo criterio que setRaiz.
        if (compromiso >= P) revert FueraDelCampo(compromiso, P);
        if (_compromisos[tokenId].enviado) revert CompromisoYaEnviado(tokenId);

        _compromisos[tokenId] = Compromiso({valor: compromiso, enviado: true});
        emit CompromisoEnviado(tokenId, compromiso, msg.sender);
    }

    /// @notice El compromiso de `tokenId`. Es una lectura: no cuesta gas a nadie.
    /// @return compromiso el valor enviado, o 0 si no se envio ninguno
    /// @return enviado    false si este token nunca envio compromiso. Mirar esto
    ///                    primero: `compromiso == 0` no significa ausente.
    function compromisoDe(uint256 tokenId) external view returns (uint256 compromiso, bool enviado) {
        Compromiso storage c = _compromisos[tokenId];
        return (c.valor, c.enviado);
    }

    /// @notice Cuantas entradas se emitieron. Los tokenId van de 0 a emitidos() - 1.
    function emitidos() external view returns (uint256) {
        return _proximoToken;
    }
}
