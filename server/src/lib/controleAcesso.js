'use strict';

/**
 * Shim de compatibilidade — a logica real migrou para @lyra/projection-core.
 *
 * Passou para o Core quando o Controlador ganhou modo local: quem hospeda a porta 5510
 * precisa da mesma guarda, e o celular tem de se autenticar da mesma maneira nos dois
 * modos. Duas implementacoes divergentes de controlo de acesso seria o pior sitio para
 * ter uma copia.
 */
module.exports = require('@lyra/projection-core').controleAcesso;
