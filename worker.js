const TDK_BASE = "https://sozluk.gov.tr/";

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    return null;
  }
  const data = await res.json();
  if (data && !data.error) {
    return data;
  }
  return null;
}

async function queryTDK(word) {
  const lower = word.toLocaleLowerCase("tr");
  const datas = {
    word: null,
    lisan: null,
    canonical: null,
    means: null
  };

  try {
    const yz = await fetchJson(TDK_BASE + "yazim?ara=" + encodeURI(lower));
    if (Array.isArray(yz) && yz[0] && yz[0].madde) {
      const cand = yz[0].madde;
      const candLower = cand.toLocaleLowerCase("tr");
      if (!lower.includes("l") || candLower.includes("l")) {
        datas.canonical = cand;
      }
    }
  } catch (e) {
    console.log("TDK yazim error", e);
  }

  const gtsKey = (datas.canonical || lower).toLocaleLowerCase("tr");
  try {
    const gts = await fetchJson(TDK_BASE + "gts?ara=" + encodeURI(gtsKey));
    if (Array.isArray(gts) && gts[0]) {
      const result = gts[0];
      datas.word = result.madde || datas.word;
      datas.lisan = result.lisan || datas.lisan;
      datas.means = result.anlamlarListe || datas.means;
    }
  } catch (e) {
    console.log("TDK gts error", e);
  }

  if (!datas.lisan && datas.word) {
    const suffixes = ["lı", "li", "lu", "lü", "lısı", "lisi", "lusu", "lüsü"];
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
          const gtsRoot = await fetchJson(TDK_BASE + "gts?ara=" + encodeURI(cand));
          if (Array.isArray(gtsRoot) && gtsRoot[0] && gtsRoot[0].lisan) {
            datas.lisan = gtsRoot[0].lisan;
            if (!datas.canonical) {
              datas.canonical = gtsRoot[0].madde || datas.canonical;
            }
            break;
          }
        } catch (e) {
          console.log("TDK gts root error", e);
        }
      }
    }
  }

  return datas;
}

function buildPayload(data) {
  if (!data.word && !data.lisan) {
    return null;
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
  return {
    aranan_kelime: data.word,
    madde_lisan: data.lisan,
    foreignHint,
    canonical: data.canonical,
    thinBySpelling,
    primary_meaning: primaryMeaning
  };
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*"
    }
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/api/sozluk") {
      const q = (url.searchParams.get("q") || "").trim().toLowerCase();
      if (!q) {
        return jsonResponse({ error: "Boş kelime sorgusu." }, 400);
      }
      try {
        const data = await queryTDK(q);
        const payload = buildPayload(data);
        if (!payload) {
          return jsonResponse({ error: "TDK yanıt vermedi veya kelime bulunamadı." }, 502);
        }
        return jsonResponse(payload, 200);
      } catch (e) {
        console.log("Worker error", e);
        return jsonResponse({ error: "Sunucu hatası." }, 500);
      }
    }
    if (url.pathname === "/health") {
      return jsonResponse({ status: "ok" }, 200);
    }
    return new Response("404", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
};

