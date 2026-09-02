const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 560,
    backgroundColor: '#18181b',
  });
  await win.loadFile(path.join(__dirname, 'tmp-opcoes-triangulo.html'));
  await new Promise((r) => setTimeout(r, 500));
  const img = await win.webContents.capturePage();
  const saida = path.join(__dirname, 'tmp-opcoes-triangulo.png');
  fs.writeFileSync(saida, img.toPNG());
  console.log(saida);
  app.quit();
});
