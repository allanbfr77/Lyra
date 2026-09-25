' Converte um documento do Office num PDF, usando o Office instalado na maquina.
'
' Chamado por `officeParaPdf.js`:
'   cscript //Nologo officeParaPdf.vbs <origem> <destino> <word|powerpoint>
'
' Porque VBScript e nao PowerShell: nesta maquina o PowerShell cria o objeto COM do Office
' mas recebe-o vazio (Version em branco, Presentations nulo, sem erro nenhum) e o Windows
' regista "o servidor nao se registou no DCOM dentro do tempo limite". Pelo Windows Script
' Host o mesmo pedido funciona a primeira. O WSH existe em qualquer Windows, por isso a
' troca nao custa compatibilidade -- exceto que, a partir do Windows 11 24H2/25H2, a
' Microsoft passou a permitir desativar o VBScript como "recurso opcional" do sistema; se
' isso acontecer nesta maquina o cscript falha logo no arranque, antes de qualquer linha
' deste ficheiro correr. Essa falha especifica e detetada e explicada em
' `officeParaPdf.js`, que le o que o proprio WSH escreve quando isso acontece.
'
' As janelas do Office ficam escondidas sempre que possivel: o Word aceita Visible=False e
' a apresentacao abre com WithWindow=0. Se o PowerPoint se recusar a entrega-la sem janela,
' ha uma segunda tentativa com a aplicacao visivel.
'
' Se o Office ja estiver aberto (o operador estava a editar algo, ou uma conversao anterior
' deixou uma instancia presa), este script anexa-se a essa instancia com GetObject em vez
' de abrir uma segunda -- e so a fecha (Quit) no fim se foi ele proprio quem a abriu com
' CreateObject. Assim uma conversao nunca fecha trabalho do operador, e uma instancia
' deixada presa por uma queda anterior e reaproveitada em vez de se acumular.
'
' Codigos de saida: 0 converteu, 2 argumentos/arquivo, 3 falha do Office, 4 sem PDF no fim.
' A mensagem de erro vai para "<destino>.erro.txt" em UTF-16 (o Node le como utf16le): o
' stdout do cscript sai na pagina de codigo da consola e estragaria os acentos. As linhas
' "DIAG ..." vao para o stdout em ASCII simples -- servem só o log tecnico do Node, nunca
' aparecem ao operador.

Option Explicit

Const PP_SALVAR_PDF = 32
Const WD_EXPORTAR_PDF = 17
Const MSO_TRUE = -1
Const MSO_FALSE = 0
Const PP_ALERTAS_NENHUM = 1
Const PP_ALERTAS_TODOS = 2
Const ESPERA_MAX_MS = 30000
Const ESPERA_PASSO_MS = 400

Dim gDestino
gDestino = ""

Sub Diag(msg)
  On Error Resume Next
  WScript.StdOut.WriteLine "DIAG " & msg
End Sub

Sub Falhar(mensagem, codigo)
  On Error Resume Next
  Dim fso, ficheiro
  If gDestino <> "" Then
    Set fso = CreateObject("Scripting.FileSystemObject")
    Set ficheiro = fso.CreateTextFile(gDestino & ".erro.txt", True, True)
    ficheiro.Write mensagem
    ficheiro.Close
  End If
  Diag "falhou: " & mensagem
  WScript.Quit codigo
End Sub

Function EsperarColeccao(app, nome)
  Dim esperou, col
  esperou = 0
  Do
    Err.Clear
    Set col = Nothing
    If nome = "Presentations" Then
      Set col = app.Presentations
    Else
      Set col = app.Documents
    End If
    If Err.Number = 0 Then
      If Not (col Is Nothing) Then
        Set EsperarColeccao = col
        Exit Function
      End If
    End If
    WScript.Sleep ESPERA_PASSO_MS
    esperou = esperou + ESPERA_PASSO_MS
  Loop While esperou < ESPERA_MAX_MS
  Set EsperarColeccao = Nothing
End Function

' Anexa-se a uma instancia ja aberta do Office (GetObject); so cria uma nova (CreateObject)
' se nao houver nenhuma a correr. `criada` sai True quando fomos nos que a criamos -- e
' portanto quem deve fecha-la (Quit) no fim, nunca uma instancia que ja existia.
Function ObterAplicacao(progId, ByRef criada)
  Dim app
  criada = False
  On Error Resume Next
  Err.Clear
  Set app = GetObject(, progId)
  If Err.Number <> 0 Or app Is Nothing Then
    Err.Clear
    Set app = CreateObject(progId)
    criada = (Err.Number = 0) And Not (app Is Nothing)
  End If
  Set ObterAplicacao = app
End Function

' Fecha, na coleccao, um documento que ja esteja aberto com o mesmo caminho -- deixado por
' uma conversao anterior que nao terminou (o Lyra caiu, o Office ficou preso). Sem isto, um
' `Open` para o mesmo caminho pode devolver esse documento antigo, ja fechado pela metade,
' em vez do que se pede agora.
Sub FecharSeJaAberto(colecao, caminho)
  On Error Resume Next
  Dim item
  For Each item In colecao
    If LCase(item.FullName) = LCase(caminho) Then
      item.Close
    End If
  Next
  Err.Clear
End Sub

' As duas linhas abaixo pareciam inofensivas como `If criamosNos Then app.Quit Else ...`
' numa unica linha, mas o VBScript nao aceita: chamada de metodo sem parentesis e sem
' argumentos (`app.Quit`) imediatamente antes de `Else` e ambigua para o parser -- ele
' nao sabe se `Else` seria mais um argumento -- e da erro de compilacao (nao de execucao,
' por isso nunca aparecia nos testes, so na maquina real). Em blocos `If/End If` normais,
' como aqui, nao ha essa ambiguidade.
Sub FecharWord(app, criamosNos, alertasOriginais)
  On Error Resume Next
  If criamosNos Then
    app.Quit 0
  Else
    app.DisplayAlerts = alertasOriginais
  End If
End Sub

Sub FecharPowerPoint(app, criamosNos, alertasOriginais)
  On Error Resume Next
  If criamosNos Then
    app.Quit
  Else
    app.DisplayAlerts = alertasOriginais
  End If
End Sub

Dim args, origem, destino, tipo, fso2
Dim app, col2, documento, motivo, criamosNos, alertasOriginais

Set args = WScript.Arguments
If args.Count < 3 Then Falhar "Parametros insuficientes.", 2
origem = args(0)
destino = args(1)
tipo = LCase(args(2))
gDestino = destino

Diag "inicio tipo=" & tipo & " origem=" & origem & " destino=" & destino

Set fso2 = CreateObject("Scripting.FileSystemObject")
If Not fso2.FileExists(origem) Then Falhar "Arquivo de origem nao encontrado: " & origem, 2

On Error Resume Next

If tipo = "word" Then
  Set app = ObterAplicacao("Word.Application", criamosNos)
  If app Is Nothing Then Falhar "Falha ao iniciar o Word: " & Err.Description, 3
  Diag "word versao=" & app.Version & " criado=" & criamosNos

  If criamosNos Then app.Visible = False
  Err.Clear
  alertasOriginais = app.DisplayAlerts
  If Err.Number <> 0 Then alertasOriginais = 0
  app.DisplayAlerts = 0
  Err.Clear

  Set col2 = EsperarColeccao(app, "Documents")
  If col2 Is Nothing Then
    FecharWord app, criamosNos, alertasOriginais
    Falhar "O Word iniciou mas nao aceitou abrir documentos.", 3
  End If

  FecharSeJaAberto col2, origem

  Err.Clear
  Set documento = col2.Open(origem, False, True, False)
  If Err.Number <> 0 Or documento Is Nothing Then
    motivo = Err.Description
    FecharWord app, criamosNos, alertasOriginais
    Falhar "Falha ao abrir o documento: " & motivo, 3
  End If

  Diag "documento aberto, a exportar"
  documento.ExportAsFixedFormat destino, WD_EXPORTAR_PDF
  If Err.Number <> 0 Then
    motivo = Err.Description
    documento.Close 0
    FecharWord app, criamosNos, alertasOriginais
    Falhar "Falha ao gravar o PDF: " & motivo, 3
  End If
  documento.Close 0
  FecharWord app, criamosNos, alertasOriginais
Else
  Set app = ObterAplicacao("PowerPoint.Application", criamosNos)
  If app Is Nothing Then Falhar "Falha ao iniciar o PowerPoint: " & Err.Description, 3
  Diag "powerpoint versao=" & app.Version & " criado=" & criamosNos

  Err.Clear
  alertasOriginais = app.DisplayAlerts
  If Err.Number <> 0 Then alertasOriginais = PP_ALERTAS_TODOS
  app.DisplayAlerts = PP_ALERTAS_NENHUM
  Err.Clear

  Set col2 = EsperarColeccao(app, "Presentations")
  If col2 Is Nothing Then
    Err.Clear
    app.Visible = MSO_TRUE
    Err.Clear
    Set col2 = EsperarColeccao(app, "Presentations")
  End If
  If col2 Is Nothing Then
    FecharPowerPoint app, criamosNos, alertasOriginais
    Falhar "O PowerPoint iniciou mas nao aceitou abrir apresentacoes.", 3
  End If

  FecharSeJaAberto col2, origem

  Err.Clear
  Set documento = col2.Open(origem, MSO_TRUE, MSO_FALSE, MSO_FALSE)
  If Err.Number <> 0 Or documento Is Nothing Then
    Err.Clear
    app.Visible = MSO_TRUE
    Set documento = col2.Open(origem, MSO_TRUE, MSO_FALSE, MSO_FALSE)
  End If
  If Err.Number <> 0 Or documento Is Nothing Then
    motivo = Err.Description
    FecharPowerPoint app, criamosNos, alertasOriginais
    Falhar "Falha ao abrir a apresentacao: " & motivo, 3
  End If

  Diag "apresentacao aberta, a exportar"
  documento.SaveAs destino, PP_SALVAR_PDF
  If Err.Number <> 0 Then
    motivo = Err.Description
    documento.Close
    FecharPowerPoint app, criamosNos, alertasOriginais
    Falhar "Falha ao gravar o PDF: " & motivo, 3
  End If
  documento.Close
  FecharPowerPoint app, criamosNos, alertasOriginais
End If

Err.Clear
If Not fso2.FileExists(destino) Then Falhar "A conversao terminou sem gerar o PDF.", 4
Diag "concluido"
WScript.Quit 0
