const http = require("http");
const url = require("url");
const axios = require("axios");

const cache = new Map();

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*"
  });
  res.end(body);
}

async function queryTDK(word, baseUri) {
  const uri = baseUri || "https://sozluk.gov.tr/";
  const datas = {
    word: null,
    lisan: null,
    canonical: null,
    means: null,
    compounds: null,
    proverbs: [],
    compilation: [],
    glossaryOfScienceAndArtTerms: [],
    westOpposite: [],
    guide: [],
    etymological: []
  };
  const lower = word.toLocaleLowerCase("tr");
  try {
    console.log("[TDK-QUERY] yazim?ara=" + lower);
    try {
      const yz = await axios.get(uri + "yazim?ara=" + encodeURI(lower));
      if (yz.data && !yz.data.error && Array.isArray(yz.data) && yz.data[0] && yz.data[0].madde) {
        const cand = yz.data[0].madde;
        const candLower = cand.toLocaleLowerCase("tr");
        if (!lower.includes("l") || candLower.includes("l")) {
          datas.canonical = cand;
          console.log("[TDK-RESULT] yazim madde:", datas.canonical);
        } else {
          console.log("[TDK-RESULT] yazim madde (yoksayildi):", cand);
        }
      }
    } catch (e) {
      console.log("[TDK-ERROR] yazim", word, String(e));
    }
    const gtsKey = (datas.canonical || lower).toLocaleLowerCase("tr");
    console.log("[TDK-QUERY] gts?ara=" + lower);
    const gts = await axios.get(uri + "gts?ara=" + encodeURI(gtsKey));
    if (!gts.data || gts.data.error) {
      console.log("[TDK-RESULT] gts: kelime bulunamadı veya hata:", word);
    } else {
      const [result] = gts.data;
      if (!result) {
        console.log("[TDK-RESULT] gts: sonuç yok:", word);
      } else {
        const anlamlarListe = result.anlamlarListe;
        const birlesikler = result.birlesikler;
        const lisan = result.lisan || null;
        const means = anlamlarListe;
        const compounds = birlesikler ? birlesikler.split(", ") : [];
        datas.word = result.madde || datas.word;
        datas.lisan = lisan;
        datas.means = means || datas.means;
        datas.compounds = compounds || datas.compounds;
      }
    }

    // Türemiş biçimler için (belalı, lâkinli vb.) kök kelimenin lisanını bulmayı dene.
    if (!datas.lisan && datas.word) {
      const suffixes = [
        "lı",
        "li",
        "lu",
        "lü",
        "lısı",
        "lisi",
        "lusu",
        "lüsü"
      ];
      let root = null;
      for (const suf of suffixes) {
        if (lower.endsWith(suf) && lower.length > suf.length + 1) {
          root = lower.slice(0, lower.length - suf.length);
          break;
        }
      }
      if (root) {
        const candidates = [root];
        if (root.endsWith("l") && root.length > 1) {
          candidates.push(root.slice(0, root.length - 1));
        }
        for (const cand of candidates) {
          try {
            console.log("[TDK-QUERY] gts(kok)?ara=" + cand);
            const gtsRoot = await axios.get(uri + "gts?ara=" + encodeURI(cand));
            if (gtsRoot.data && !gtsRoot.data.error && Array.isArray(gtsRoot.data) && gtsRoot.data[0]) {
              const r0 = gtsRoot.data[0];
              if (r0.lisan) {
                datas.lisan = r0.lisan;
                if (!datas.canonical) {
                  datas.canonical = r0.madde || datas.canonical;
                }
                console.log("[TDK-RESULT] kok lisan aktarildi:", cand, "→", datas.lisan);
                break;
              }
            }
          } catch (e) {
            console.log("[TDK-ERROR] gts(kok)", cand, String(e));
          }
        }
      }
    }

    console.log("[TDK-QUERY] atasozu?ara=" + lower);
    const atasozu = await axios.get(uri + "atasozu?ara=" + encodeURI(lower));
    if (atasozu.data && !atasozu.data.error) {
      datas.proverbs = atasozu.data;
    }

    console.log("[TDK-QUERY] derleme?ara=" + lower);
    const derleme = await axios.get(uri + "derleme?ara=" + encodeURI(lower));
    if (derleme.data && !derleme.data.error) {
      datas.compilation = derleme.data;
    }

    console.log("[TDK-QUERY] terim?eser_ad=tümü&ara=" + lower);
    const eserAd = await axios.get(
      uri + "terim?eser_ad=t%C3%BCm%C3%BC&ara=" + encodeURI(lower)
    );
    if (eserAd.data && !eserAd.data.error) {
      datas.glossaryOfScienceAndArtTerms = eserAd.data;
    }

    console.log("[TDK-QUERY] bati?ara=" + lower);
    const bati = await axios.get(uri + "bati?ara=" + encodeURI(lower));
    if (bati.data && !bati.data.error) {
      datas.westOpposite = bati.data;
    }

    console.log("[TDK-QUERY] kilavuz?prm=ysk&ara=" + lower);
    const kilavuz = await axios.get(
      uri + "kilavuz?prm=ysk&ara=" + encodeURI(lower)
    );
    if (kilavuz.data && !kilavuz.data.error) {
      datas.guide = kilavuz.data;
    }

    console.log("[TDK-QUERY] etms?ara=" + lower);
    const etms = await axios.get(uri + "etms?ara=" + encodeURI(lower));
    if (etms.data && !etms.data.error) {
      datas.etymological = etms.data;
    }

    console.log(
      "[TDK-RESULT] kelime:",
      datas.word || word,
      "| lisan:",
      datas.lisan || "bilinmiyor",
      "| yazim:",
      datas.canonical || "-",
      "| bati:",
      Array.isArray(datas.westOpposite) ? datas.westOpposite.length : 0,
      "| kilavuz:",
      Array.isArray(datas.guide) ? datas.guide.length : 0,
      "| etms:",
      Array.isArray(datas.etymological) ? datas.etymological.length : 0
    );
    return datas;
  } catch (e) {
    console.log("[TDK-ERROR]", word, String(e));
    return datas;
  }
}

async function handleSozluk(req, res, query) {
  const raw = (query.q || "").toString().trim().toLowerCase();
  if (!raw) {
    sendJson(res, 400, { error: "Boş kelime sorgusu." });
    return;
  }
  if (cache.has(raw)) {
    sendJson(res, 200, cache.get(raw));
    return;
  }
  const data = await queryTDK(raw);
  if (!data.word && !data.lisan) {
    sendJson(res, 502, { error: "TDK yanıt vermedi veya kelime bulunamadı." });
    return;
  }
  let foreignHint = false;
  if (data.lisan && (data.lisan.startsWith("Arapça") || data.lisan.startsWith("Farsça"))) {
    foreignHint = true;
  }
  let thinBySpelling = false;
  if (data.canonical && /l[âÂ]/.test(data.canonical)) {
    thinBySpelling = true;
  }
  let primaryMeaning = null;
  if (Array.isArray(data.means) && data.means.length > 0) {
    const first = data.means[0];
    if (first && typeof first.anlam === "string") {
      primaryMeaning = first.anlam;
    }
  }
  const payload = {
    aranan_kelime: data.word,
    madde_lisan: data.lisan,
    foreignHint,
    canonical: data.canonical,
    thinBySpelling,
    primary_meaning: primaryMeaning
  };
  cache.set(raw, payload);
  sendJson(res, 200, payload);
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  if (parsed.pathname === "/api/sozluk") {
    handleSozluk(req, res, parsed.query);
    return;
  }
  if (parsed.pathname === "/health") {
    sendJson(res, 200, { status: "ok" });
    return;
  }
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("404");
});

const port = process.env.PORT || 3000;

server.listen(port, () => {
  console.log("Sözlük sunucusu port", port, "üzerinde çalışıyor.");
});
