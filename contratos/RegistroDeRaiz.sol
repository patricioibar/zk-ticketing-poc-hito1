// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

/// @title RegistroDeRaiz
/// @notice La porcion minima del sistema que necesita estar on-chain: la raiz del
///         arbol de compromisos de cada evento, y nada mas.
/// @dev    Lo que este contrato NO ve nunca: el secreto de un comprador, la prueba
///         Groth16 y el nulificador. El secreto no sale del telefono; la prueba y el
///         nulificador van del telefono al molinete y mueren en la lista local de esa
///         puerta. Poner cualquiera de los tres aca no solo seria caro: el nulificador
///         on-chain convertiria el registro publico en la lista de quienes entraron.
///         Ver docs/08-contrato-raiz.md.
contract RegistroDeRaiz {
    /// @notice Orden del campo escalar de BN254. Todo elemento de campo vive en [0, P).
    /// @dev    Es el mismo numero que lib/campo.mjs llama `P`. Esta duplicado a proposito
    ///         y no leido de ningun lado: un contrato no puede importar JavaScript, y la
    ///         alternativa —confiar en que el llamador ya valido— es la que produce un
    ///         valor reducido en silencio. Que el chequeo este de los dos lados de la
    ///         frontera es el punto.
    uint256 public constant P =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;

    /// @dev La bandera `publicada` es la razon de ser de este struct. Un mapping vacio
    ///      de Solidity devuelve 0, y 0 es un elemento de campo perfectamente valido:
    ///      sin la bandera, "no hay raiz para este evento" y "la raiz de este evento es
    ///      0" son el mismo valor y no hay forma de distinguirlos desde afuera.
    struct Publicacion {
        uint256 raiz;
        uint8 profundidad;
        bool publicada;
    }

    /// @notice Quien despliega el contrato es el organizador, y es el unico que escribe.
    address public immutable organizador;

    mapping(uint256 scope => Publicacion) private _publicaciones;

    /// @notice Queda una entrada en el log por cada publicacion, tambien por las que
    ///         pisan una raiz anterior. El storage guarda la ultima; el log, todas.
    event RaizPublicada(uint256 indexed scope, uint256 raiz, uint8 profundidad, address publicador);

    error SoloElOrganizador(address quien, address organizador);
    error FueraDelCampo(uint256 valor, uint256 p);
    error ProfundidadInvalida(uint8 profundidad);

    constructor() {
        organizador = msg.sender;
    }

    /// @notice Publica (o repisa) la raiz del evento `scope`. Es la unica escritura del
    ///         sistema, y es la unica operacion que cuesta gas.
    function setRaiz(uint256 scope, uint256 raiz, uint8 profundidad) external {
        if (msg.sender != organizador) revert SoloElOrganizador(msg.sender, organizador);
        if (scope >= P) revert FueraDelCampo(scope, P);
        // Ojo: `raiz == 0` es valida. Lo que se rechaza es una raiz que no entre en el
        // campo, porque Poseidon la reduciria y el valor guardado no seria el enviado.
        if (raiz >= P) revert FueraDelCampo(raiz, P);
        if (profundidad == 0 || profundidad > 32) revert ProfundidadInvalida(profundidad);

        _publicaciones[scope] = Publicacion({raiz: raiz, profundidad: profundidad, publicada: true});
        emit RaizPublicada(scope, raiz, profundidad, msg.sender);
    }

    /// @notice Devuelve la raiz del evento `scope`. Es una lectura: no cuesta gas a nadie.
    /// @return raiz         la raiz publicada, o 0 si no hay ninguna
    /// @return profundidad  la profundidad del arbol, o 0 si no hay ninguna
    /// @return publicada    false si este evento nunca publico una raiz. Mirar esto
    ///                      primero: `raiz == 0` no significa ausente.
    function getRaiz(uint256 scope)
        external
        view
        returns (uint256 raiz, uint8 profundidad, bool publicada)
    {
        Publicacion storage p = _publicaciones[scope];
        return (p.raiz, p.profundidad, p.publicada);
    }
}
