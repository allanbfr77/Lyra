/**
 * Interface do socket do painel: funções finas (conectar, IP lembrado, auto-conectar, papel do host) sobre
 * o `socketPainel` criado em `eventosProjecao.js`. Movido verbatim do núcleo (`controllerAppCore.js`); o
 * que o núcleo ainda possui entra por `registrarDependenciasSocketPainelApi`.
 */
import { socketPainel } from './eventosProjecao.js';

function iniciarSocket(ip) { socketPainel.iniciarSocket(ip); }
export function tentarAutoConectarSeDesconectado() { socketPainel.tentarAutoConectarSeDesconectado(); }
export function configurarAutoConectarAoAlternarJanelas() { socketPainel.configurarAutoConectarAoAlternarJanelas(); }
export function setStatusServidorRemoto(estado) { socketPainel.setStatusServidorRemoto(estado); }
export function recordarIpsDestaMaquina(lista, preferido) { socketPainel.recordarIpsDestaMaquina(lista, preferido); }
async function refrescarIpsDestaMaquina() { return socketPainel.refrescarIpsDestaMaquina(); }
function ipRemotoAlvo() { return socketPainel.ipRemotoAlvo(); }
export function persistirIpServidor(ip) { socketPainel.persistirIpServidor(ip); }
export function sincronizarUiLembrarIp() { socketPainel.sincronizarUiLembrarIp(); }
export function onCfgLembrarIpChange(ligado) { socketPainel.onCfgLembrarIpChange(ligado); }
export function sincronizarUiAutoConectar() { socketPainel.sincronizarUiAutoConectar(); }
export function onCfgAutoConectarChange(ligado) { socketPainel.onCfgAutoConectarChange(ligado); }
export async function tentarConectarAutomaticoAoIniciar() { return socketPainel.tentarConectarAutomaticoAoIniciar(); }
function ehEnderecoDestaMaquina(ip) { return socketPainel.ehEnderecoDestaMaquina(ip); }
async function consultarPapelHost5510(ip) { return socketPainel.consultarPapelHost5510(ip); }
function tratarFalhaLigacaoServidor(mensagem) { socketPainel.tratarFalhaLigacaoServidor(mensagem); }
export function interromperReconexaoSocket() { socketPainel.interromperReconexaoSocket(); }
async function reassumirProjecaoLocalAposQuedaRemota() { return socketPainel.reassumirProjecaoLocalAposQuedaRemota(); }
export function preferenciaLembrarIp() { return socketPainel.preferenciaLembrarIp(); }
export function preferenciaAutoConectar() { return socketPainel.preferenciaAutoConectar(); }
export function limparIpGuardado() { socketPainel.limparIpGuardado(); }
