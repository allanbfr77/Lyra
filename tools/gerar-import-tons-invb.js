const fs = require("fs");
const path = require("path");

const rawPath = path.join(__dirname, "_raw-supabase-musicas.json");
const outPath = path.join(__dirname, "import-tons-invb-louvores.json");

async function carregarRaw() {
  if (fs.existsSync(rawPath)) {
    let txt = fs.readFileSync(rawPath, "utf8");
    if (txt.charCodeAt(0) === 0xfeff) txt = txt.slice(1);
    return JSON.parse(txt);
  }
  const url =
    "https://rosvseljurczmzdycbxs.supabase.co/rest/v1/musicas?select=*&order=nome.asc";
  const key =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJvc3ZzZWxqdXJjem16ZHljYnhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4ODI0MTUsImV4cCI6MjA5NjQ1ODQxNX0.XbiVRQLFzWj7j7-KRXxdtT_3giO0TOsE5hRw86NYNVQ";
  const res = await fetch(url, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`Supabase HTTP ${res.status}`);
  return res.json();
}

/* Nomes como no site / cadastro Lyra (evitar duplicar "Cris" vs "Cris Medeiros"). */
const MAP_MIN = {
  cris: "Cris",
  "cris medeiros": "Cris",
  daniela: "Daniela",
  mirian: "Mirian",
  raphaela: "Raphaela",
  "pr. humberto": "Pr. Humberto",
  "pr humberto": "Pr. Humberto",
  humberto: "Pr. Humberto",
  vanessa: "Vanessa",
};

function normMin(n) {
  const k = String(n || "")
    .trim()
    .toLowerCase();
  return MAP_MIN[k] || String(n || "").trim();
}

function normTom(tom) {
  let t = String(tom || "").trim();
  const map = {
    Db: "C#",
    Eb: "D#",
    Gb: "F#",
    Ab: "G#",
    Bb: "A#",
    Dbm: "C#m",
    Ebm: "D#m",
    Gbm: "F#m",
    Abm: "G#m",
    Bbm: "A#m",
  };
  if (map[t]) t = map[t];
  return t;
}

const TONS_OK = new Set([
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
  "Cm",
  "C#m",
  "Dm",
  "D#m",
  "Em",
  "Fm",
  "F#m",
  "Gm",
  "G#m",
  "Am",
  "A#m",
  "Bm",
]);

function parsePares(tomField, ministranteField) {
  const out = [];
  let parsed = null;
  try {
    const t = typeof tomField === "string" ? JSON.parse(tomField) : tomField;
    if (Array.isArray(t)) parsed = t;
  } catch (_) {
    /* ignore */
  }
  if (parsed) {
    for (const p of parsed) {
      if (!p) continue;
      const tom = normTom(p.tom);
      const min = normMin(p.min || p.ministrante || "");
      if (tom && min) out.push({ tom, min });
    }
  }
  if (
    !out.length &&
    tomField &&
    typeof tomField === "string" &&
    !tomField.trim().startsWith("[")
  ) {
    const tom = normTom(tomField);
    const min = normMin(ministranteField);
    if (tom && min) out.push({ tom, min });
  }
  return out;
}

function artistFromObs(obs) {
  const s = String(obs || "");
  const m = s.match(/cifraclub\.com\.br\/([^/]+)\//i);
  if (!m) return "";
  return decodeURIComponent(m[1])
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

async function main() {
  const raw = await carregarRaw();
  const itens = [];
  let semTom = 0;
  let vinculos = 0;
  let origOnly = 0;
  const mins = new Set();

  for (const m of raw) {
    const titulo = String(m.nome || "").trim();
    if (!titulo) continue;
    const pares = parsePares(m.tom, m.ministrante);
    const valid = pares.filter((p) => TONS_OK.has(p.tom));
    if (!valid.length) {
      if (pares.some((p) => String(p.tom).toLowerCase().startsWith("orig"))) {
        origOnly++;
      } else {
        semTom++;
      }
      continue;
    }

    const byMin = new Map();
    for (const p of valid) {
      if (!byMin.has(p.min)) byMin.set(p.min, []);
      byMin.get(p.min).push(p.tom);
      mins.add(p.min);
      vinculos++;
    }

    const multi = [...byMin.values()].some((arr) => arr.length > 1);
    let tons;
    if (multi) {
      tons = [];
      for (const [min, toms] of byMin) {
        for (const tom of toms) tons.push({ ministrante: min, tom });
      }
    } else {
      tons = {};
      for (const [min, toms] of byMin) tons[min] = toms[0];
    }

    itens.push({
      titulo,
      artista: artistFromObs(m.observacoes),
      tons,
    });
  }

  itens.sort((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR"));

  const out = {
    versao: 1,
    fonte: "https://louvores.invbotafogo.com.br/",
    gerado_em: new Date().toISOString(),
    _comentario:
      "Exportado do Tom Louvores (INVB). Artista preenchido quando havia link do Cifra Club. Tons Orig. foram omitidos (não são notas). Importe em Ajustes → Ministrantes → Importar tons do site.",
    itens,
  };

  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), "utf8");
  console.log(
    JSON.stringify(
      {
        musicas_com_tom: itens.length,
        vinculos,
        sem_tom_ou_sem_min: semTom,
        so_orig: origOnly,
        ministrantes: [...mins].sort(),
        arquivo: outPath,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
