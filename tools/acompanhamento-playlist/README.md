# Acompanhamento da playlist (somente leitura)

Aplicação pequena e independente para o PC do servidor/controlador. Mostra a playlist do culto em modo Slide e marca as músicas já executadas — **sem enviar comandos ao Lyra**.

## Como abrir

1. Deixe o **Controlador** (modo local) ou o **Servidor** de projeção aberto (porta `5510`).
2. Dê duplo clique em `abrir.bat`, ou abra `index.html` no navegador.

Host padrão: `127.0.0.1`. Se a projeção estiver noutro PC, use **Servidor (avançado)** ou abra com `?host=IP`.

## O que faz

- Lê o evento Socket.IO `estado` (música/slide atuais).
- Lê as playlists com `solicitar_playlists_controlador` / `playlists_do_controlador` (fallback: `GET :3001/api/playlists`).
- Destaca a **música atual** (badge “Agora”).
- Marca com **check verde** só quando o operador **avança para a próxima** (a atual ainda não fica concluída).
- Mostra **última concluída** e progresso `N / total`.

## O que não faz

- Não controla slides, playlists nem o painel.
- Não altera dados no Lyra.
- Não se registra como controlador.

## Culto

Por padrão escolhe a playlist que contém a música projetada (**Auto**). Dá para fixar um culto no seletor.
