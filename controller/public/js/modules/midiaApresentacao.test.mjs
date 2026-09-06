import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectarKindApresentacaoPorMimeOuNome,
  ehArquivoPowerPointLocal,
  rotuloTipoMidiaApresentacao,
  srcImagemApresentacaoSeguro,
  fmtTempoAudio,
  obterThumbVideoApresentacao,
  reescreverUrlVideoParaTelas,
  urlMidiaApresentacaoHttpPorId,
  normalizarItemApresentacao,
  normalizarCorHexCard6Aviso,
  normalizarCfgAvisoCard6,
  cfgAvisoCard6TemPersonalizacao,
  clonarCfgAvisoCard6Padrao,
} from './midiaApresentacao.js';

test('detectarKind: MIME manda; sem type no Windows usa a extensão', () => {
  assert.equal(detectarKindApresentacaoPorMimeOuNome('image/png', 'x.bin'), 'image');
  assert.equal(detectarKindApresentacaoPorMimeOuNome('', 'foto.JPG'), 'image');
  assert.equal(detectarKindApresentacaoPorMimeOuNome('', 'clipe.mp4'), 'video');
  assert.equal(detectarKindApresentacaoPorMimeOuNome('', 'louvor.mp3'), 'audio');
  assert.equal(detectarKindApresentacaoPorMimeOuNome('application/pdf', 'a.pdf'), 'pdf');
  assert.equal(detectarKindApresentacaoPorMimeOuNome('', 'slides.html'), 'iframe');
});

test('ehArquivoPowerPointLocal cobre ppt/pptx/odp e MIME de apresentação', () => {
  assert.equal(ehArquivoPowerPointLocal('', 'culto.pptx'), true);
  assert.equal(ehArquivoPowerPointLocal('', 'culto.odp'), true);
  assert.equal(ehArquivoPowerPointLocal('application/vnd.ms-powerpoint', 'x'), true);
  assert.equal(ehArquivoPowerPointLocal('', 'letra.pdf'), false);
});

test('rotuloTipoMidiaApresentacao tem nomes em pt-BR e fallback', () => {
  assert.equal(rotuloTipoMidiaApresentacao('video'), 'Vídeo');
  assert.equal(rotuloTipoMidiaApresentacao('aviso'), 'Aviso');
  assert.equal(rotuloTipoMidiaApresentacao(''), 'Arquivo');
  assert.equal(rotuloTipoMidiaApresentacao('webm'), 'Webm');
});

test('srcImagemApresentacaoSeguro rejeita script e não-imagem', () => {
  assert.equal(srcImagemApresentacaoSeguro('javascript:alert(1)', 'image'), '');
  assert.equal(srcImagemApresentacaoSeguro('data:image/png;base64,AAA', 'image'), 'data:image/png;base64,AAA');
  assert.equal(srcImagemApresentacaoSeguro('blob:https://x/1', 'video'), '');
  assert.equal(
    srcImagemApresentacaoSeguro('http://127.0.0.1:3001/api/apresentacao/media/ap_1', 'image'),
    'http://127.0.0.1:3001/api/apresentacao/media/ap_1'
  );
  assert.equal(
    srcImagemApresentacaoSeguro('http://127.0.0.1:3001/api/apresentacao/media/ap_1', 'video'),
    ''
  );
});

test('fmtTempoAudio formata mm:ss e trata lixo', () => {
  assert.equal(fmtTempoAudio(0), '00:00');
  assert.equal(fmtTempoAudio(65), '01:05');
  assert.equal(fmtTempoAudio(-3), '00:00');
  assert.equal(fmtTempoAudio('x'), '00:00');
});

test('obterThumbVideoApresentacao só aceita data:image', () => {
  assert.equal(obterThumbVideoApresentacao({ thumb: 'data:image/jpeg;base64,x' }), 'data:image/jpeg;base64,x');
  assert.equal(obterThumbVideoApresentacao({ thumb: 'http://x/thumb.jpg' }), '');
  assert.equal(obterThumbVideoApresentacao(null), '');
});

test('reescreverUrlVideoParaTelas troca :3001 local por :5510 do servidor remoto', () => {
  const local = 'http://127.0.0.1:3001/api/apresentacao/midia/ap_1';
  assert.equal(reescreverUrlVideoParaTelas(local, { local: true, ip: '10.0.0.8' }), local);
  assert.equal(
    reescreverUrlVideoParaTelas(local, { local: false, ip: '10.0.0.8' }),
    'http://10.0.0.8:5510/api/apresentacao/midia/ap_1'
  );
  assert.equal(reescreverUrlVideoParaTelas(local, { local: false, ip: '' }), local);
  assert.equal(reescreverUrlVideoParaTelas('https://cdn.exemplo/v.mp4', { ip: '10.0.0.8' }), 'https://cdn.exemplo/v.mp4');
});

test('urlMidiaApresentacaoHttpPorId e normalizarItemApresentacao', () => {
  const base = 'http://127.0.0.1:3001';
  assert.equal(urlMidiaApresentacaoHttpPorId('ap 1', base), `${base}/api/apresentacao/midia/ap%201`);
  assert.equal(normalizarItemApresentacao(null, base), null);
  assert.equal(normalizarItemApresentacao({ id: 'a', name: '' }, base), null);
  const legado = normalizarItemApresentacao(
    { id: 'ap_1', name: 'foto.png', kind: 'iframe', src: 'data:image/png;base64,xx' },
    base
  );
  assert.equal(legado.kind, 'image');
  assert.equal(legado.src, 'data:image/png;base64,xx');
  const daApi = normalizarItemApresentacao(
    { id: 'ap_2', name: 'v.mp4', kind: 'video', src: 'http://old:9/api/apresentacao/video/ap_2' },
    base
  );
  assert.equal(daApi.src, `${base}/api/apresentacao/midia/ap_2`);
  const semSrc = normalizarItemApresentacao(
    { id: 'ap_3', name: 'a.mp3', kind: 'audio', src: '', filePath: 'C:\\\\a.mp3' },
    base
  );
  assert.equal(semSrc.src, `${base}/api/apresentacao/midia/ap_3`);
  assert.equal(semSrc.filePath, 'C:\\\\a.mp3');
});

test('aviso card 6: hex, limites de fonte e personalização', () => {
  assert.equal(normalizarCorHexCard6Aviso('#AABBCC', '#000000'), '#aabbcc');
  assert.equal(normalizarCorHexCard6Aviso('red', '#000000'), '#000000');
  const cfg = normalizarCfgAvisoCard6({ fontSize: 99, textColor: '#FF0000', verticalPosition: 'lado' });
  assert.equal(cfg.fontSize, 40);
  assert.equal(cfg.textColor, '#ff0000');
  assert.equal(cfg.verticalPosition, 'center');
  assert.equal(cfgAvisoCard6TemPersonalizacao(clonarCfgAvisoCard6Padrao()), false);
  assert.equal(cfgAvisoCard6TemPersonalizacao({ italic: true }), true);
});
