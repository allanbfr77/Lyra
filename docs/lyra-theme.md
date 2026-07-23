# Lyra Theme — Guia de Integração

Sistema de tema **dark/light** consistente nos três módulos do Lyra (Lyra).

---

## Arquivos

| Arquivo | Para onde vai | Propósito |
|---------|--------------|-----------|
| `lyra-theme.css` | `server/public/` e `controller/public/` | Variáveis CSS + componentes base |
| `lyra-theme.js` | `server/public/` e `controller/public/` | Inicializa e troca o tema |
| `theme.js` | `mobile/src/theme/` (ou `mobile/theme/`) | Provider + hook React Native |

---

## 1 — Servidor e Controlador (HTML + CSS vanilla)

### Passo 1 — Copiar os arquivos

```
server/public/lyra-theme.css
server/public/lyra-theme.js

controller/public/lyra-theme.css
controller/public/lyra-theme.js
```

### Passo 2 — Incluir no HTML

```html
<head>
  <!-- Fonte DM Sans (já usada no projeto) -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">

  <!-- Tema Lyra (ANTES de qualquer outro CSS) -->
  <link rel="stylesheet" href="lyra-theme.css">
</head>
<body>
  <!-- ... conteúdo ... -->

  <!-- Script no fim do body -->
  <script src="lyra-theme.js"></script>
</body>
```

### Passo 3 — Usar as classes

```html
<!-- Layout estrutural -->
<div class="app-window">
  <div class="titlebar">
    <div class="win-controls">
      <div class="win-btn win-close"></div>
      <div class="win-btn win-min"></div>
      <div class="win-btn win-max"></div>
    </div>
    <div class="titlebar-tabs">
      <div class="tab active">Músicas</div>
      <div class="tab">Playlist</div>
    </div>
    <div class="titlebar-end">
      <button class="btn btn-ghost btn-icon" data-theme-toggle>
        <span data-theme-icon>🌙</span>
      </button>
    </div>
  </div>

  <div class="app-body">
    <nav class="sidebar">
      <div class="sidebar-section">Navegação</div>
      <div class="sidebar-item active">Músicas</div>
      <div class="sidebar-item">Playlists</div>
      <div class="sidebar-item">Bíblia</div>
      <div class="sidebar-item">Configurações</div>
    </nav>

    <main class="main-content">
      <!-- tabelas, cards, etc. -->
      <table class="table">
        <thead>
          <tr><th>Título</th><th>Tom</th><th>Status</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Oceans</td>
            <td>C</td>
            <td><span class="tag tag-green">Ativo</span></td>
          </tr>
        </tbody>
      </table>
    </main>
  </div>

  <div class="statusbar">
    <span>🎵 3 músicas na fila</span>
    <span>Servidor: conectado</span>
  </div>
</div>
```

### Passo 4 — Trocar tema via JS

O `lyra-theme.js` já faz tudo automaticamente para botões com `data-theme-toggle`.

Para controlar manualmente (por exemplo, recebendo via Socket.IO):

```js
// Trocar
LyraTheme.toggle();

// Aplicar específico
LyraTheme.apply('dark');

// Ler atual
LyraTheme.current(); // → 'dark' | 'light'

// Ouvir mudanças
document.addEventListener('lyra-theme-change', ({ detail }) => {
  console.log('Tema:', detail.theme);
});
```

---

## 2 — Mobile (React Native / Expo)

### Passo 1 — Copiar o arquivo

```
mobile/src/theme/theme.js
```

> Se o projeto usar alias `@/`, o caminho fica `@/theme/theme`.

### Passo 2 — Instalar dependência (se ainda não tiver)

```bash
npx expo install @react-native-async-storage/async-storage
```

### Passo 3 — Carregar a fonte DM Sans no Expo

No `app/_layout.jsx`:

```jsx
import { useFonts } from 'expo-font';
import { DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold } from '@expo-google-fonts/dm-sans';

export default function Layout() {
  const [fontsLoaded] = useFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold });
  if (!fontsLoaded) return null;
  // ...
}
```

Instalar o pacote:
```bash
npx expo install @expo-google-fonts/dm-sans expo-font
```

### Passo 4 — Envolver com ThemeProvider

```jsx
// app/_layout.jsx
import { ThemeProvider } from '@/theme/theme';
import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <ThemeProvider>
      <Stack />
    </ThemeProvider>
  );
}
```

### Passo 5 — Usar o hook nos componentes

```jsx
import { View, Text, TouchableOpacity } from 'react-native';
import { useTheme } from '@/theme/theme';

export default function SongCard({ title, key, isActive }) {
  const { colors, spacing, radius, typography } = useTheme();

  return (
    <View style={{
      backgroundColor: colors.bgSurface,
      borderColor:     colors.border,
      borderWidth:     0.5,
      borderRadius:    radius.lg,
      padding:         spacing.lg,
      marginBottom:    spacing.sm,
    }}>
      <Text style={{
        color:      colors.textPrimary,
        fontSize:   typography.sizeMd,
        fontWeight: typography.weightMedium,
        fontFamily: typography.fontSans,
      }}>
        {title}
      </Text>

      <Text style={{
        color:      colors.textSecondary,
        fontSize:   typography.sizeSm,
        marginTop:  spacing.xs,
      }}>
        Tom: {key}
      </Text>

      {isActive && (
        <View style={{
          backgroundColor: colors.tagGreenBg,
          borderRadius:    radius.pill,
          paddingHorizontal: spacing.sm,
          paddingVertical:   2,
          alignSelf: 'flex-start',
          marginTop: spacing.xs,
        }}>
          <Text style={{ color: colors.tagGreenText, fontSize: typography.sizeXs, fontWeight: '600' }}>
            Projetando
          </Text>
        </View>
      )}
    </View>
  );
}
```

### Passo 6 — Toggle nas configurações

```jsx
import { Switch } from 'react-native';
import { useTheme } from '@/theme/theme';

export default function Settings() {
  const { colors, isDark, toggleTheme } = useTheme();

  return (
    <Switch
      value={isDark}
      onValueChange={toggleTheme}
      trackColor={{ false: colors.border, true: colors.accentLight }}
      thumbColor={isDark ? colors.accent : colors.bgSurface}
    />
  );
}
```

---

## Variáveis CSS disponíveis (web)

| Variável | Descrição |
|----------|-----------|
| `--bg-app` | Fundo geral da aplicação |
| `--bg-surface` | Cards, painéis, modal |
| `--bg-surface-2` | Hover, linhas de tabela, inputs |
| `--bg-sidebar` | Fundo da barra lateral |
| `--text-primary` | Texto principal |
| `--text-secondary` | Texto de suporte |
| `--text-muted` | Labels, placeholders |
| `--accent` | Cor de destaque (azul) |
| `--border` | Borda padrão |
| `--tag-green-bg/text` | Status "ativo/concluído" |
| `--tag-amber-bg/text` | Status "em revisão/pausado" |
| `--tag-red-bg/text` | Status "erro/urgente" |
| `--tag-blue-bg/text` | Status "em progresso" |

---

## Sincronizar tema entre server e controller (opcional)

```js
// No server — emitir quando o tema mudar
document.addEventListener('lyra-theme-change', ({ detail }) => {
  socket.emit('theme-change', detail.theme);
});

// No controller — receber e aplicar
socket.on('theme-change', (theme) => {
  LyraTheme.apply(theme);
});
```

---

## Setup da Bíblia

Os arquivos `.sqlite` da Bíblia nao ficam no repositório e nao sao versionados. O projeto espera encontrar estes arquivos em `server/data/`:

- `ACF.sqlite`
- `ARA.sqlite`
- `ARC.sqlite`
- `NAA.sqlite`
- `NTLH.sqlite`
- `NVI.sqlite`

Para copiar os arquivos para o local esperado, rode na raiz do projeto:

```bash
node setup-biblia.js "caminho/para/Biblia"
```

Exemplo:

```bash
node setup-biblia.js "C:/Users/allan/OneDrive/Área de Trabalho/Projects/Biblia"
```

O script copia os arquivos encontrados para `server/data/` e informa sucesso ou erro para cada traducao.

Se voce precisar obter os `.sqlite`, eles nao acompanham este repositório. No ambiente atual, eles existem na pasta externa `C:/Users/allan/OneDrive/Área de Trabalho/Projects/Biblia`. Em outro ambiente, obtenha esses arquivos com quem mantem a base da Bíblia do projeto.
