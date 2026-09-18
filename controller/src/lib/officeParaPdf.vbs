' Converte um documento do Office num PDF, usando o Office instalado na maquina.
'
' Chamado por `officeParaPdf.js`:
'   cscript //Nologo officeParaPdf.vbs <origem> <destino> <word|powerpoint>
'
' Porque VBScript e nao PowerShell: nesta maquina o PowerShell cria o objeto COM do Office
' mas recebe-o vazio (Version em branco, Presentations nulo, sem erro nenhum) e o Windows
' regista "o servidor nao se registou no DCOM dentro do tempo limite". Pelo Windows Script
' Host o mesmo pedido funciona a primeira. O WSH existe em qualquer Windows, por isso a
' troca nao custa compatibilidade.
'
' As janelas do Office ficam escondidas sempre que possivel: o Word aceita Visible=False e
' a apresentacao abre com WithWindow=0. Se o PowerPoint se recusar a entrega-la sem janela,
' ha uma segunda tentativa com a aplicacao visivel.
'
' Codigos de saida: 0 converteu, 2 argumentos, 3 falha do Office, 4 sem PDF no fim.
' A mensagem de erro vai para "<destino>.erro.txt" em UTF-16 (o Node le como utf16le): o
' stdout do cscript sai na pagina de codigo da consola e estragaria os acentos.

Option Explicit

Const PP_SALVAR_PDF = 32
Const WD_EXPORTAR_PDF = 17
Const MSO_TRUE = -1
Const MSO_FALSE = 0
Const ESPERA_MAX_MS = 30000
Const ESPERA_PASSO_MS = 400

Dim gDestino
gDestino = ""

Sub Falhar(mensagem, codigo)
  On Error Resume Next
  Dim fso, ficheiro
  If gDestino <> "" Then
    Set fso = CreateObject("Scripting.FileSystemObject")
    Set ficheiro = fso.CreateTextFile(gDestino & ".erro.txt", True, True)
    ficheiro.Write mensagem
    ficheiro.Close
  End If
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

Dim args, origem, destino, tipo, fso2
Dim app, col2, documento, motivo

Set args = WScript.Arguments
If args.Count < 3 Then Falhar "Parametros insuficientes.", 2
origem = args(0)
destino = args(1)
tipo = LCase(args(2))
gDestino = destino

Set fso2 = CreateObject("Scripting.FileSystemObject")
If Not fso2.FileExists(origem) Then Falhar "Arquivo de origem nao encontrado: " & origem, 2

On Error Resume Next

If tipo = "word" Then
  Set app = CreateObject("Word.Application")
  If Err.Number <> 0 Then Falhar "Falha ao iniciar o Word: " & Err.Description, 3
  app.Visible = False
  app.DisplayAlerts = 0
  Err.Clear

  Set col2 = EsperarColeccao(app, "Documents")
  If col2 Is Nothing Then
    app.Quit 0
    Falhar "O Word iniciou mas nao aceitou abrir documentos.", 3
  End If

  Err.Clear
  Set documento = col2.Open(origem, False, True, False)
  If Err.Number <> 0 Or documento Is Nothing Then
    motivo = Err.Description
    app.Quit 0
    Falhar "Falha ao abrir o documento: " & motivo, 3
  End If

  documento.ExportAsFixedFormat destino, WD_EXPORTAR_PDF
  If Err.Number <> 0 Then
    motivo = Err.Description
    documento.Close 0
    app.Quit 0
    Falhar "Falha ao gravar o PDF: " & motivo, 3
  End If
  documento.Close 0
  app.Quit 0
Else
  Set app = CreateObject("PowerPoint.Application")
  If Err.Number <> 0 Then Falhar "Falha ao iniciar o PowerPoint: " & Err.Description, 3
  app.DisplayAlerts = 1
  Err.Clear

  Set col2 = EsperarColeccao(app, "Presentations")
  If col2 Is Nothing Then
    Err.Clear
    app.Visible = MSO_TRUE
    Err.Clear
    Set col2 = EsperarColeccao(app, "Presentations")
  End If
  If col2 Is Nothing Then
    app.Quit
    Falhar "O PowerPoint iniciou mas nao aceitou abrir apresentacoes.", 3
  End If

  Err.Clear
  Set documento = col2.Open(origem, MSO_TRUE, MSO_FALSE, MSO_FALSE)
  If Err.Number <> 0 Or documento Is Nothing Then
    Err.Clear
    app.Visible = MSO_TRUE
    Set documento = col2.Open(origem, MSO_TRUE, MSO_FALSE, MSO_FALSE)
  End If
  If Err.Number <> 0 Or documento Is Nothing Then
    motivo = Err.Description
    app.Quit
    Falhar "Falha ao abrir a apresentacao: " & motivo, 3
  End If

  documento.SaveAs destino, PP_SALVAR_PDF
  If Err.Number <> 0 Then
    motivo = Err.Description
    documento.Close
    app.Quit
    Falhar "Falha ao gravar o PDF: " & motivo, 3
  End If
  documento.Close
  app.Quit
End If

Err.Clear
If Not fso2.FileExists(destino) Then Falhar "A conversao terminou sem gerar o PDF.", 4
WScript.Quit 0
