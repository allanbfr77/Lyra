const fs = require("fs");
const path = require("path");
const {
  parsePares,
  TONS_OK,
} = require("../controller/src/lib/invbTonsFromSupabase");

const rawPath = path.join(__dirname, "_raw-supabase-musicas.json");
const outPath = path.join(__dirname, "import-tons-invb-louvores.json");

async function carregarRaw() {
  if (fs.existsSync(rawPath)) {
    let txt = fs.readFileSync(rawPath, "utf8");
    if (txt.charCodeAt(0) === 0xfeff) txt = txt.slice(1);
    return JSON.parse(txt);
  }
  const url =
    process.env.INVB_SUPABASE_URL ||
    "https://rosvseljurczmzdycbxs.supabase.co/rest/v1/musicas?select=*&order=nome.asc";
  const key = String(process.env.INVB_SUPABASE_ANON_KEY || "").trim();
  if (!key) {
    throw new Error(
      "INVB_SUPABASE_ANON_KEY não definido. Use o arquivo _raw-supabase-musicas.json ou configure a variável de ambiente."
    );
  }
  const res = await fetch(url, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`Supabase HTTP ${res.status}`);
  return res.json();
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
      "Exportado do Tom Louvores (INVB). Artista preenchido quando havia link do Cifra Club. Inclui ORIG. quando o site marca tom original. Importe em Ajustes → Ministrantes → Importar tons do site.",
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
