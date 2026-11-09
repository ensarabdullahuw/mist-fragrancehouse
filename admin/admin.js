/* ============================================================
   MIST — admin panel
   Edits data/catalog.json and publishes it to the GitHub repo
   behind mistfragrance.org (GitHub Pages redeploys in ~1 min).
   ============================================================ */
(() => {
  const OWNER = "ensarabdullahuw", REPO = "mist-fragrancehouse", BRANCH = "main";
  const API = `https://api.github.com/repos/${OWNER}/${REPO}`;
  const CAT_PATH = "data/catalog.json", PIN_PATH = "data/admin.json";
  // sha256("mist-admin:" + code) — default code until changed from Settings
  const DEFAULT_PIN = "12698a7aec55cddedd8d3a7aecabba5c10100a40d01d8ba39fed9f1244d4976a";
  const TOKEN_URL = "https://github.com/settings/personal-access-tokens/new?name=Mist+Admin&description=Paneli+i+dyqanit+mistfragrance.org&target_name=" + OWNER + "&expires_in=none&contents=write";
  const PAGE = 50;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const money = n => (+n || 0).toFixed(2) + " €";
  const num = v => { const n = parseFloat(String(v).replace(",", ".").replace(/[^\d.]/g, "")); return isFinite(n) ? Math.round(n * 100) / 100 : NaN; };
  const slug = s => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ë/g, "e").replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "x";
  const today = () => new Date().toISOString().slice(0, 10);
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };
  const ss = {
    get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch {} },
    del(k) { try { sessionStorage.removeItem(k); } catch {} },
  };
  async function sha256(s) {
    const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
    return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
  }
  const hashStr = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = (h * 33 ^ s.charCodeAt(i)) >>> 0; return h.toString(36) + ":" + s.length; };

  /* ---------- theme ---------- */
  const root = document.documentElement;
  $("#themeBtn").addEventListener("click", () => {
    const t = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = t; ls.set("mist_theme", t);
    $('meta[name="theme-color"]').content = t === "dark" ? "#0F0B22" : "#FAF7F0";
  });

  /* ---------- toast + confirm ---------- */
  let tt;
  function toast(msg, bad) {
    const t = $("#toast"); t.textContent = msg; t.classList.toggle("bad", !!bad); t.classList.add("show");
    clearTimeout(tt); tt = setTimeout(() => t.classList.remove("show"), bad ? 4500 : 2400);
  }
  function ask(title, html, yes = "Po", danger = false) {
    return new Promise(res => {
      const m = $("#qModal");
      $("#qTitle").textContent = title; $("#qBody").innerHTML = html;
      const y = $("#qYes"); y.textContent = yes; y.className = "btn " + (danger ? "btn--danger" : "btn--solid");
      m.hidden = false;
      const done = v => { m.hidden = true; y.onclick = $("#qNo").onclick = null; res(v); };
      y.onclick = () => done(true); $("#qNo").onclick = () => done(false);
    });
  }
  $$(".modal").forEach(m => {
    m.addEventListener("click", e => { if (e.target === m || e.target.closest("[data-dismiss]")) m.hidden = true; });
  });
  addEventListener("keydown", e => { if (e.key === "Escape") $$(".modal").forEach(m => { if (m.id !== "qModal") m.hidden = true; }); });

  /* ---------- github ---------- */
  let token = ls.get("mist_gh_token") || "";
  async function gh(path, opt = {}) {
    const r = await fetch(path.startsWith("http") ? path : API + path, {
      ...opt, cache: "no-store",
      headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28", ...(opt.body ? { "Content-Type": "application/json" } : {}) },
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.message || r.status); e.status = r.status; throw e; }
    return j;
  }
  const b64dec = b => new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\s/g, "")), c => c.charCodeAt(0)));
  async function ghFile(path) {
    const j = await gh(`/contents/${path}?ref=${BRANCH}&t=${Date.now()}`);
    return { text: b64dec(j.content), sha: j.sha };
  }

  /* ---------- lock ---------- */
  let pinHash = DEFAULT_PIN;
  const pinReady = fetch("../data/admin.json", { cache: "no-cache" }).then(r => r.ok ? r.json() : {}).then(j => { if (j.pin) pinHash = j.pin; }).catch(() => {});
  let fails = 0, waitUntil = 0;
  const unlocked = () => ss.get("mist_admin") === pinHash || ls.get("mist_admin") === pinHash;
  $("#lockForm").addEventListener("submit", async e => {
    e.preventDefault();
    const err = $("#pinErr"), inp = $("#pin");
    if (Date.now() < waitUntil) { err.textContent = `Shumë tentime. Prit ${Math.ceil((waitUntil - Date.now()) / 1000)} sekonda.`; err.hidden = false; return; }
    await pinReady;
    if (await sha256("mist-admin:" + inp.value.trim()) === pinHash) {
      ss.set("mist_admin", pinHash);
      if ($("#remember").checked) ls.set("mist_admin", pinHash);
      inp.value = ""; start();
    } else {
      fails++; if (fails >= 5) { waitUntil = Date.now() + 30000; fails = 0; }
      err.textContent = "Kodi është i gabuar."; err.hidden = false;
      inp.value = ""; inp.classList.remove("shake"); void inp.offsetWidth; inp.classList.add("shake");
    }
  });
  $("#lockBtn").addEventListener("click", () => { ss.del("mist_admin"); ls.del("mist_admin"); location.reload(); });

  /* ---------- state ---------- */
  let D = null;            // working catalogue {categories, settings, products}
  let ORIG = "";           // published catalogue text
  let origMap = {};        // id -> JSON of published product
  let origImgs = new Set();// image paths the published catalogue uses
  const newImgs = {};      // path -> dataURL (uploaded, not yet published)
  let newPin = null;       // pending passcode hash
  const ui = { tab: "overview", q: "", cat: "", brand: "", stock: "", sort: "", shown: PAGE, sel: new Set() };

  // fixed key order: id b n s c p o g a d i (brand, name, size, type, price, old price, category, in stock, date, image)
  const KEYS = ["id", "b", "n", "s", "c", "p", "o", "g", "a", "d", "i"];
  const canon = p => { const o = {}; KEYS.forEach(k => { if (p[k] !== undefined) o[k] = p[k]; }); Object.keys(p).forEach(k => { if (!(k in o)) o[k] = p[k]; }); return o; };
  const pj = p => JSON.stringify(canon(p));
  function serialize(d) {
    const head = { v: 1, updated: d.updated, categories: d.categories, settings: d.settings };
    return "{\n" + Object.entries(head).map(([k, v]) => `"${k}":${JSON.stringify(v)}`).join(",\n") +
      ',\n"products":[\n' + d.products.map(pj).join(",\n") + "\n]}\n";
  }
  const comparable = d => serialize({ ...d, updated: "" });
  function setOrig(text) {
    ORIG = text;
    const o = JSON.parse(text);
    origMap = Object.fromEntries(o.products.map(p => [p.id, pj(p)]));
    origImgs = new Set(o.products.map(p => p.i).filter(Boolean));
  }
  const origComparable = () => comparable(JSON.parse(ORIG));
  const isChanged = p => origMap[p.id] !== pj(p);
  const shownImgs = {};     // published uploads kept for preview until the site redeploys

  function changes() {
    const o = JSON.parse(ORIG), ids = new Set(D.products.map(p => p.id));
    let add = 0, edit = 0, del = 0;
    D.products.forEach(p => { if (!(p.id in origMap)) add++; else if (isChanged(p)) edit++; });
    o.products.forEach(p => { if (!ids.has(p.id)) del++; });
    const cats = JSON.stringify(o.categories) !== JSON.stringify(D.categories);
    const sets = JSON.stringify(o.settings) !== JSON.stringify(D.settings);
    return { add, edit, del, cats, sets, pin: !!newPin, n: add + edit + del + (cats ? 1 : 0) + (sets ? 1 : 0) + (newPin ? 1 : 0) };
  }

  let saveT;
  function dirty() {
    const c = changes();
    const pill = $("#changes");
    pill.hidden = !c.n;
    pill.textContent = c.n === 1 ? "1 ndryshim" : `${c.n} ndryshime`;
    $("#publishBtn").disabled = !c.n;
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      if (!c.n) { ls.del("mist_admin_draft"); return; }
      const draft = { base: hashStr(origComparable()), data: D, pin: newPin };
      if (!ls.set("mist_admin_draft", JSON.stringify({ ...draft, imgs: newImgs }))) ls.set("mist_admin_draft", JSON.stringify(draft));
    }, 300);
  }

  /* ---------- boot ---------- */
  async function load() {
    if (token) {
      try { const f = await ghFile(CAT_PATH); return f.text; } catch (e) { if (e.status === 401) toast("Tokeni i GitHub nuk vlen më — lidhu përsëri.", true); }
    }
    const r = await fetch(`../${CAT_PATH}?t=${Date.now()}`, { cache: "no-store" });
    return r.text();
  }

  async function start() {
    $("#lock").hidden = true; $("#app").hidden = false;
    try { setOrig(await load()); } catch { toast("Katalogu nuk u ngarkua. Rifresko faqen.", true); return; }
    D = JSON.parse(ORIG);
    D.settings = D.settings || {}; D.categories = D.categories || [];
    const draftRaw = ls.get("mist_admin_draft");
    if (draftRaw) {
      try {
        const dr = JSON.parse(draftRaw);
        let use = dr.base === hashStr(origComparable());
        if (!use) use = await ask("Ndryshime të paruajtura", "Ke ndryshime nga më parë që s’janë publikuar, por katalogu live ka ndryshuar që atëherë. Do t’i rikthesh? (Do të mbishkruajnë ndryshimet e reja live.)", "Rikthei");
        if (use) { D = dr.data; newPin = dr.pin || null; Object.assign(newImgs, dr.imgs || {}); toast("U rikthyen ndryshimet e papublikuara"); }
        else ls.del("mist_admin_draft");
      } catch { ls.del("mist_admin_draft"); }
    }
    ghUI(); fillSelects(); dirty(); showTab(location.hash.slice(1) || "overview");
  }

  /* ---------- tabs ---------- */
  function showTab(t) {
    if (!$(`[data-view="${t}"]`)) t = "overview";
    ui.tab = t;
    $$("#tabs button").forEach(b => b.classList.toggle("is-on", b.dataset.tab === t));
    $$(".view").forEach(v => v.hidden = v.dataset.view !== t);
    history.replaceState(null, "", "#" + t);
    ({ overview: renderOverview, products: renderProducts, categories: renderCats, brands: renderBrands, settings: renderSettings })[t]();
    scrollTo(0, 0);
  }
  $("#tabs").addEventListener("click", e => { const b = e.target.closest("button"); if (b) showTab(b.dataset.tab); });

  /* ---------- helpers on data ---------- */
  const catName = id => (D.categories.find(c => c.id === id) || {}).name || "— pa kategori —";
  const brandsOf = () => [...new Set(D.products.map(p => p.b))].sort((a, b) => a.localeCompare(b));
  const imgSrc = p => p.i ? (newImgs[p.i] || shownImgs[p.i] || "../" + p.i) : `../img/p/${p.id}.avif`;
  const off = p => p.o && p.o > p.p ? Math.round((1 - p.p / p.o) * 100) : 0;
  const catOptions = (sel, extra = "") => extra + D.categories.map(c => `<option value="${esc(c.id)}" ${c.id === sel ? "selected" : ""}>${esc(c.name)}</option>`).join("");

  function fillSelects() {
    $("#pCat").innerHTML = catOptions(ui.cat, `<option value="">Kategoria: të gjitha</option>`);
    const bs = brandsOf();
    $("#pBrand").innerHTML = `<option value="">Marka: të gjitha</option>` + bs.map(b => `<option ${b === ui.brand ? "selected" : ""}>${esc(b)}</option>`).join("");
    $("#brandList").innerHTML = bs.map(b => `<option value="${esc(b)}">`).join("");
    $("#bulkCat").innerHTML = catOptions("", `<option value="">Ndrysho kategorinë…</option>`);
  }

  /* ---------- overview ---------- */
  function renderOverview() {
    const P = D.products, inS = P.filter(p => p.a).length, sale = P.filter(p => off(p) >= 5).length;
    const avg = P.length ? P.reduce((s, p) => s + p.p, 0) / P.length : 0;
    $("#stats").innerHTML = [
      [P.length, "Produkte"], [inS, "Në stok"], [P.length - inS, "Jashtë stokut"], [sale, "Me zbritje"], [brandsOf().length, "Marka"], [money(avg), "Çmimi mesatar"],
    ].map(([b, s]) => `<div class="stat"><b>${b}</b><span>${s}</span></div>`).join("");
    const max = Math.max(1, ...D.categories.map(c => P.filter(p => p.g === c.id).length));
    $("#catBars").innerHTML = D.categories.map(c => {
      const n = P.filter(p => p.g === c.id).length;
      return `<li><span>${esc(c.name)}</span><i style="--w:${(n / max * 100).toFixed(1)}%"></i><em>${n}</em></li>`;
    }).join("") || `<li class="muted">Asnjë kategori</li>`;
    $("#recent").innerHTML = P.slice(0, 8).map(p => `<button data-edit="${esc(p.id)}"><img src="${esc(imgSrc(p))}" alt="" loading="lazy"><small>${esc(p.b)}</small><span>${esc(p.n)}</span></button>`).join("");
  }
  $("#recent").addEventListener("click", e => { const b = e.target.closest("[data-edit]"); if (b) openEdit(b.dataset.edit); });
  $$("[data-quick]").forEach(b => b.addEventListener("click", () => {
    const q = b.dataset.quick;
    if (q === "add") openEdit(null);
    if (q === "out") { ui.stock = "0"; $("#pStock").value = "0"; showTab("products"); }
    if (q === "cat") { showTab("categories"); $("#cName").focus(); }
  }));

  /* ---------- products ---------- */
  function filtered() {
    const words = ui.q.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/\s+/).filter(Boolean);
    let L = D.products.filter(p => {
      if (ui.cat && p.g !== ui.cat) return false;
      if (ui.brand && p.b !== ui.brand) return false;
      if (ui.stock === "1" && !p.a) return false;
      if (ui.stock === "0" && p.a) return false;
      if (ui.stock === "chg" && !isChanged(p)) return false;
      if (words.length) {
        const h = (p.b + " " + p.n + " " + (p.s || "") + " " + (p.c || "")).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
        if (!words.every(w => h.includes(w))) return false;
      }
      return true;
    });
    if (ui.sort === "az") L = L.slice().sort((a, b) => (a.b + a.n).localeCompare(b.b + b.n));
    if (ui.sort === "low") L = L.slice().sort((a, b) => a.p - b.p);
    if (ui.sort === "high") L = L.slice().sort((a, b) => b.p - a.p);
    return L;
  }
  const row = p => {
    const chg = isChanged(p), isNew = !(p.id in origMap), o = off(p);
    return `<div class="row ${chg ? "is-chg" : ""} ${p.a ? "" : "is-out"}" data-id="${esc(p.id)}">
      <label class="check"><input type="checkbox" data-sel ${ui.sel.has(p.id) ? "checked" : ""}></label>
      <img class="row__img" src="${esc(imgSrc(p))}" alt="" loading="lazy" data-open>
      <div class="row__name" data-open><small>${esc(p.b)}</small><b>${esc(p.n)}${isNew ? `<span class="tag">i ri</span>` : chg ? `<span class="tag">ndryshuar</span>` : ""}</b><span>${esc([p.s, p.c].filter(Boolean).join(" · "))}</span></div>
      <select class="inp" data-f="g">${catOptions(p.g, D.categories.some(c => c.id === p.g) ? "" : `<option value="${esc(p.g)}" selected>— pa kategori —</option>`)}</select>
      <div data-l="Çmimi €"><input class="inp" data-f="p" inputmode="decimal" value="${p.p}"></div>
      <div data-l="Para zbritjes €"><input class="inp" data-f="o" inputmode="decimal" value="${p.o || ""}" placeholder="—">${o ? `<span class="row__off">−${o}%</span>` : ""}</div>
      <div data-l="${p.a ? "Në stok" : "Jashtë stokut"}"><button class="sw ${p.a ? "on" : ""}" data-f="a" aria-label="Në stok" title="${p.a ? "Në stok" : "Jashtë stokut"}"></button></div>
      <div class="row__act"><button class="icon" data-open title="Ndrysho" aria-label="Ndrysho">✎</button><button class="icon del" data-del title="Fshi" aria-label="Fshi">🗑</button></div>
    </div>`;
  };
  function renderProducts() {
    const L = filtered();
    $("#rows").innerHTML = L.slice(0, ui.shown).map(row).join("") || `<p class="muted center">Asnjë produkt.</p>`;
    $("#pCount").textContent = L.length === D.products.length ? `${L.length} produkte` : `${L.length} nga ${D.products.length} produkte`;
    $("#pMore").hidden = ui.shown >= L.length;
    $("#pMore").textContent = `Shfaq më shumë (${L.length - Math.min(ui.shown, L.length)})`;
    bulkUI(L);
  }
  function bulkUI(L = filtered()) {
    [...ui.sel].forEach(id => { if (!D.products.some(p => p.id === id)) ui.sel.delete(id); });
    $("#bulk").hidden = !ui.sel.size;
    $("#bulkN").textContent = `${ui.sel.size} të zgjedhura`;
    $("#selAll").checked = L.length > 0 && L.every(p => ui.sel.has(p.id));
  }
  const byId = id => D.products.find(p => p.id === id);
  function refreshRow(id, soft) {
    const el = $(`.row[data-id="${CSS.escape(id)}"]`), p = byId(id);
    if (el && p) {
      if (!soft) el.outerHTML = row(p);
      else {
        // update markers only, so Tab keeps moving through the price fields
        const chg = isChanged(p), isNew = !(p.id in origMap);
        el.classList.toggle("is-chg", chg);
        const b = $(".row__name b", el); b.innerHTML = esc(p.n) + (isNew ? `<span class="tag">i ri</span>` : chg ? `<span class="tag">ndryshuar</span>` : "");
        const o = off(p), box = $('[data-f="o"]', el).parentNode;
        $(".row__off", box)?.remove();
        if (o) box.insertAdjacentHTML("beforeend", `<span class="row__off">−${o}%</span>`);
      }
    }
    dirty();
  }

  let qt;
  $("#pSearch").addEventListener("input", e => { clearTimeout(qt); qt = setTimeout(() => { ui.q = e.target.value.trim(); ui.shown = PAGE; renderProducts(); }, 150); });
  [["#pCat", "cat"], ["#pBrand", "brand"], ["#pStock", "stock"], ["#pSort", "sort"]].forEach(([s, k]) =>
    $(s).addEventListener("change", e => { ui[k] = e.target.value; ui.shown = PAGE; renderProducts(); }));
  $("#pMore").addEventListener("click", () => { ui.shown += PAGE; renderProducts(); });
  $("#addBtn").addEventListener("click", () => openEdit(null));
  $("#selAll").addEventListener("change", e => { filtered().forEach(p => e.target.checked ? ui.sel.add(p.id) : ui.sel.delete(p.id)); renderProducts(); });

  $("#rows").addEventListener("click", async e => {
    const r = e.target.closest(".row"); if (!r) return;
    const id = r.dataset.id, p = byId(id);
    if (e.target.closest("[data-sel]")) { e.target.checked ? ui.sel.add(id) : ui.sel.delete(id); bulkUI(); return; }
    if (e.target.closest('[data-f="a"]')) { p.a = p.a ? 0 : 1; refreshRow(id); return; }
    if (e.target.closest("[data-del]")) { if (await ask("Fshi produktin?", `<b>${esc(p.b)} – ${esc(p.n)}</b> do të hiqet nga dyqani pasi ta publikosh.`, "Fshi", true)) { removeProducts([id]); } return; }
    if (e.target.closest("[data-open]")) openEdit(id);
  });
  $("#rows").addEventListener("change", e => {
    const f = e.target.dataset.f; if (!f) return;
    const id = e.target.closest(".row").dataset.id, p = byId(id);
    if (f === "g") p.g = e.target.value;
    if (f === "p") { const v = num(e.target.value); if (!(v > 0)) { toast("Çmimi duhet të jetë numër mbi 0", true); e.target.value = p.p; return; } p.p = v; }
    if (f === "o") { const v = num(e.target.value); if (e.target.value.trim() === "" || !(v > 0)) { delete p.o; e.target.value = ""; } else p.o = v; }
    if (f !== "g") e.target.value = f === "p" ? p.p : (p.o || "");
    refreshRow(id, true);
  });
  $("#rows").addEventListener("keydown", e => { if (e.key === "Enter" && e.target.matches("input.inp")) e.target.blur(); });

  function removeProducts(ids) {
    const s = new Set(ids);
    D.products = D.products.filter(p => !s.has(p.id));
    ids.forEach(id => ui.sel.delete(id));
    fillSelects(); renderProducts(); dirty();
    toast(ids.length === 1 ? "Produkti u fshi (publiko për ta hequr nga faqja)" : `${ids.length} produkte u fshinë`);
  }

  $("#bulk").addEventListener("click", async e => {
    const b = e.target.closest("[data-bulk]"); if (!b) return;
    const act = b.dataset.bulk, P = D.products.filter(p => ui.sel.has(p.id));
    if (act === "clear") { ui.sel.clear(); renderProducts(); return; }
    if (act === "in" || act === "out") P.forEach(p => p.a = act === "in" ? 1 : 0);
    if (act === "pct") {
      const pct = num($("#bulkPct").value) * (/^\s*-/.test($("#bulkPct").value) ? -1 : 1);
      if (!pct) { toast("Shkruaj përqindjen, p.sh. -10 ose 5", true); return; }
      if (!await ask("Ndrysho çmimet?", `Çmimi i ${P.length} produkteve do të ${pct < 0 ? "ulet" : "rritet"} ${Math.abs(pct)}%.`)) return;
      P.forEach(p => { p.p = Math.max(0.01, Math.round(p.p * (1 + pct / 100) * 100) / 100); });
      $("#bulkPct").value = "";
    }
    if (act === "del") {
      if (!await ask("Fshi produktet?", `${P.length} produkte do të hiqen nga dyqani pasi ta publikosh.`, "Fshi", true)) return;
      removeProducts(P.map(p => p.id)); return;
    }
    renderProducts(); dirty();
  });
  $("#bulkCat").addEventListener("change", e => {
    const g = e.target.value; if (!g) return;
    D.products.forEach(p => { if (ui.sel.has(p.id)) p.g = g; });
    e.target.value = ""; renderProducts(); dirty(); toast(`Kategoria u ndryshua te ${ui.sel.size} produkte`);
  });

  /* ---------- product editor ---------- */
  let editId = null, pendingImg = null;
  const pf = $("#pForm");
  function openEdit(id) {
    editId = id; pendingImg = null;
    const p = id ? byId(id) : { b: "", n: "", s: "100 ML", c: "EDP", p: "", g: (D.categories[0] || {}).id, a: 1 };
    $("#pTitle").textContent = id ? "Ndrysho produktin" : "Produkt i ri";
    $("#pFormCat").innerHTML = catOptions(p.g);
    pf.b.value = p.b; pf.n.value = p.n; pf.s.value = p.s || ""; pf.c.value = p.c || "";
    pf.p.value = p.p || ""; pf.o.value = p.o || ""; pf.a.checked = !!p.a;
    const im = $("#pImg");
    if (id) { im.src = imgSrc(p); im.hidden = false; } else { im.removeAttribute("src"); im.hidden = true; }
    $("#pDel").hidden = !id; $("#pErr").hidden = true; $("#pFile").value = "";
    $$(".f", pf).forEach(f => f.classList.remove("err"));
    $("#pModal").hidden = false;
    setTimeout(() => (id ? pf.p : pf.b).focus(), 30);
  }

  async function shrink(file) {
    const url = URL.createObjectURL(file);
    const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const max = 900, k = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
    c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    let data = c.toDataURL("image/webp", 0.86), ext = "webp";
    if (!data.startsWith("data:image/webp")) {
      // Safari without WebP encoding: keep PNG for transparent images, JPEG otherwise
      const png = /png|gif|webp/.test(file.type);
      data = c.toDataURL(png ? "image/png" : "image/jpeg", 0.88); ext = png ? "png" : "jpg";
    }
    return { data, ext };
  }
  $("#pFile").addEventListener("change", async e => {
    const f = e.target.files[0]; if (!f) return;
    try { pendingImg = await shrink(f); const im = $("#pImg"); im.src = pendingImg.data; im.hidden = false; }
    catch { toast("Fotoja nuk u lexua. Provo një PNG ose JPG.", true); }
  });

  pf.addEventListener("submit", e => {
    e.preventDefault();
    const v = { b: pf.b.value.trim().replace(/\s+/g, " "), n: pf.n.value.trim().replace(/\s+/g, " "), s: pf.s.value.trim().toUpperCase().replace(/(\d)\s*ML$/, "$1 ML"), c: pf.c.value.trim(), p: num(pf.p.value), o: num(pf.o.value), g: pf.g.value, a: pf.a.checked ? 1 : 0 };
    const bad = [];
    if (!v.b) bad.push("b"); if (!v.n) bad.push("n"); if (!(v.p > 0)) bad.push("p"); if (!v.g) bad.push("g");
    if (pf.o.value.trim() && !(v.o > 0)) bad.push("o");
    $$(".f", pf).forEach(f => f.classList.toggle("err", bad.includes(f.querySelector("[name]").name)));
    if (bad.length) { $("#pErr").textContent = "Plotëso fushat e shënuara."; $("#pErr").hidden = false; return; }
    if (!editId && !pendingImg) { $("#pErr").textContent = "Ngarko një foto të produktit."; $("#pErr").hidden = false; return; }

    let p;
    if (editId) p = byId(editId);
    else {
      let id = slug([v.b, v.n, v.c, v.s].filter(Boolean).join(" ")), base = id, k = 2;
      while (D.products.some(x => x.id === id) || id in origMap) id = `${base}-${k++}`;
      p = { id }; D.products.unshift(p);
    }
    Object.assign(p, { b: v.b, n: v.n, s: v.s, c: v.c, p: v.p, g: v.g, a: v.a });
    if (v.o > 0) p.o = v.o; else delete p.o;
    if (!p.d) p.d = today();
    if (pendingImg) {
      if (p.i && newImgs[p.i]) delete newImgs[p.i];
      p.i = `img/u/${p.id}-${Date.now().toString(36)}.${pendingImg.ext}`;
      newImgs[p.i] = pendingImg.data;
    }
    // keep key order stable: id b n s c p o g a d i
    const ordered = {}; ["id", "b", "n", "s", "c", "p", "o", "g", "a", "d", "i"].forEach(k => { if (p[k] !== undefined) ordered[k] = p[k]; });
    D.products[D.products.indexOf(p)] = ordered;
    $("#pModal").hidden = true;
    fillSelects(); dirty();
    if (ui.tab === "products") renderProducts(); else showTab(ui.tab);
    toast(editId ? "Ndryshimet u ruajtën — shtyp “Publiko” për t’i nxjerrë live" : "Produkti u shtua — shtyp “Publiko” për ta nxjerrë live");
  });
  $("#pDel").addEventListener("click", async () => {
    const p = byId(editId);
    if (await ask("Fshi produktin?", `<b>${esc(p.b)} – ${esc(p.n)}</b> do të hiqet nga dyqani pasi ta publikosh.`, "Fshi", true)) {
      $("#pModal").hidden = true; removeProducts([editId]); if (ui.tab !== "products") showTab(ui.tab);
    }
  });

  /* ---------- categories ---------- */
  function renderCats() {
    const C = D.categories;
    $("#cList").innerHTML = C.map((c, i) => {
      const n = D.products.filter(p => p.g === c.id).length;
      return `<li data-i="${i}">
        <span class="ord"><button data-up ${i ? "" : "disabled"} aria-label="Lart">▲</button><button data-down ${i < C.length - 1 ? "" : "disabled"} aria-label="Poshtë">▼</button></span>
        <input class="inp" value="${esc(c.name)}" data-name aria-label="Emri i kategorisë">
        <span class="count">${n} produkte</span>
        <button class="icon del" data-del title="Fshi kategorinë" aria-label="Fshi">🗑</button>
      </li>`;
    }).join("");
  }
  $("#cList").addEventListener("click", async e => {
    const li = e.target.closest("li"); if (!li) return;
    const i = +li.dataset.i, C = D.categories, c = C[i];
    if (e.target.closest("[data-up]")) { [C[i - 1], C[i]] = [C[i], C[i - 1]]; }
    else if (e.target.closest("[data-down]")) { [C[i + 1], C[i]] = [C[i], C[i + 1]]; }
    else if (e.target.closest("[data-del]")) {
      const n = D.products.filter(p => p.g === c.id).length, others = C.filter(x => x !== c);
      if (n && !others.length) { toast("Krijo një kategori tjetër para se ta fshish këtë", true); return; }
      const html = n
        ? `${n} produkte janë në “${esc(c.name)}”. Ku t’i kalojmë?<select class="inp" id="moveTo">${others.map(x => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join("")}</select>`
        : `Kategoria “${esc(c.name)}” s’ka produkte.`;
      if (!await ask("Fshi kategorinë?", html, "Fshi", true)) return;
      if (n) { const to = $("#moveTo").value; D.products.forEach(p => { if (p.g === c.id) p.g = to; }); }
      C.splice(i, 1);
    } else return;
    renderCats(); fillSelects(); dirty();
  });
  $("#cList").addEventListener("change", e => {
    if (!e.target.matches("[data-name]")) return;
    const c = D.categories[+e.target.closest("li").dataset.i], v = e.target.value.trim();
    if (!v) { e.target.value = c.name; return; }
    c.name = v; fillSelects(); dirty();
  });
  $("#cAdd").addEventListener("submit", e => {
    e.preventDefault();
    const name = $("#cName").value.trim(); if (!name) return;
    if (D.categories.some(c => c.name.toLowerCase() === name.toLowerCase())) { toast("Kjo kategori ekziston", true); return; }
    let id = slug(name), base = id, k = 2;
    while (D.categories.some(c => c.id === id)) id = `${base}-${k++}`;
    D.categories.push({ id, name });
    $("#cName").value = ""; renderCats(); fillSelects(); dirty();
    toast(`Kategoria “${name}” u shtua. Vendos produkte në të nga “Produktet”.`);
  });

  /* ---------- brands ---------- */
  function renderBrands() {
    const q = $("#bSearch").value.trim().toLowerCase();
    $("#bList").innerHTML = brandsOf().filter(b => !q || b.toLowerCase().includes(q)).map(b =>
      `<li><input class="inp" value="${esc(b)}" data-b="${esc(b)}" aria-label="Emri i markës"><span class="count">${D.products.filter(p => p.b === b).length} produkte</span></li>`).join("");
  }
  $("#bSearch").addEventListener("input", renderBrands);
  $("#bList").addEventListener("change", async e => {
    const from = e.target.dataset.b, to = e.target.value.trim().replace(/\s+/g, " ");
    if (!from || !to || to === from) { e.target.value = from; return; }
    const merge = brandsOf().includes(to);
    if (merge && !await ask("Bashko markat?", `“${esc(from)}” ekziston si “${esc(to)}”. Produktet e të dyjave do të jenë nën “${esc(to)}”.`, "Bashkoji")) { e.target.value = from; return; }
    D.products.forEach(p => { if (p.b === from) p.b = to; });
    if (ui.brand === from) ui.brand = to;
    fillSelects(); renderBrands(); dirty(); toast("Marka u riemërua");
  });

  /* ---------- settings ---------- */
  function renderSettings() {
    const f = $("#sForm");
    ["instagram", "messenger"].forEach(k => f[k].value = D.settings[k] || "");
  }
  $("#sForm").addEventListener("change", e => {
    const k = e.target.name; if (!k) return;
    let v = e.target.value.trim();
    if (k === "instagram") v = v.replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/.*$/, "");
    e.target.value = v; D.settings[k] = v; dirty();
  });
  $("#sForm").addEventListener("submit", e => e.preventDefault());
  $("#pinForm").addEventListener("submit", async e => {
    e.preventDefault();
    const a = e.target.a.value.trim(), b = e.target.b.value.trim();
    if (!/^\d{4,12}$/.test(a)) { toast("Kodi duhet të ketë 4–12 shifra", true); return; }
    if (a !== b) { toast("Kodet nuk përputhen", true); return; }
    newPin = await sha256("mist-admin:" + a);
    e.target.reset(); dirty(); toast("Kodi i ri u vendos — publiko që të vlejë");
  });
  $("#dlBtn").addEventListener("click", () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([serialize({ ...D, updated: new Date().toISOString() })], { type: "application/json" }));
    a.download = `mist-katalogu-${today()}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $("#discardBtn").addEventListener("click", async () => {
    if (!changes().n) { toast("S’ka ndryshime të papublikuara"); return; }
    if (!await ask("Anulo ndryshimet?", "Të gjitha ndryshimet që s’janë publikuar do të humbin.", "Anuloji", true)) return;
    D = JSON.parse(ORIG); newPin = null; Object.keys(newImgs).forEach(k => delete newImgs[k]);
    ls.del("mist_admin_draft"); fillSelects(); dirty(); showTab(ui.tab); toast("Ndryshimet u anuluan");
  });

  /* ---------- github connection ---------- */
  function ghUI() {
    $("#ghNotice").hidden = !!token;
    $("#ghStatus").innerHTML = token
      ? `✓ E lidhur me <b>${OWNER}/${REPO}</b>. “Publiko” i nxjerr ndryshimet live.`
      : `Jo e lidhur. Ndryshimet ruhen vetëm në këtë pajisje derisa të lidhesh.`;
  }
  $("#tokLink").href = TOKEN_URL;
  $$("[data-open-connect]").forEach(b => b.addEventListener("click", openConnect));
  function openConnect() { $("#tok").value = ""; $("#tokErr").hidden = true; $("#cModal").hidden = false; setTimeout(() => $("#tok").focus(), 30); }
  $("#tokForm").addEventListener("submit", async e => {
    e.preventDefault();
    const t = $("#tok").value.trim(), err = $("#tokErr"), btn = $("#tokBtn");
    if (!t) return;
    btn.classList.add("is-busy"); err.hidden = true;
    const prev = token; token = t;
    try {
      const repo = await gh("");
      if (repo.permissions && !repo.permissions.push) throw Object.assign(new Error("push"), { status: 403 });
      ls.set("mist_gh_token", t);
      $("#cModal").hidden = true; ghUI(); toast("U lidh me GitHub ✓");
    } catch (x) {
      token = prev;
      err.textContent = x.status === 401 ? "Tokeni nuk vlen. Kopjoje përsëri të plotë." :
        x.status === 404 || x.status === 403 ? "Tokeni s’ka qasje në mist-fragrancehouse. Kontrollo “Repository access” dhe “Contents: Read and write”." :
        "Lidhja dështoi. Kontrollo internetin dhe provo përsëri.";
      err.hidden = false;
    }
    btn.classList.remove("is-busy");
  });
  $("#ghOff").addEventListener("click", async () => {
    if (!token) { toast("Kjo pajisje s’është e lidhur"); return; }
    if (!await ask("Shkëput GitHub?", "Tokeni fshihet nga kjo pajisje. Për të publikuar sërish duhet ta ngjitësh përsëri.", "Shkëpute", true)) return;
    token = ""; ls.del("mist_gh_token"); ghUI(); toast("U shkëput");
  });

  /* ---------- publish ---------- */
  let publishing = false;
  $("#publishBtn").addEventListener("click", publish);
  async function publish() {
    if (publishing) return;
    const c = changes(); if (!c.n) return;
    if (!token) { openConnect(); return; }
    const parts = [c.add && `${c.add} të shtuara`, c.edit && `${c.edit} të ndryshuara`, c.del && `${c.del} të fshira`, c.cats && "kategoritë", c.sets && "cilësimet", c.pin && "kodi i hyrjes"].filter(Boolean);
    if (!await ask("Publiko ndryshimet?", `Produkte: ${parts.join(", ")}.<br>Faqja përditësohet pas rreth 1 minute.`, "Publiko")) return;

    publishing = true; const btn = $("#publishBtn"); btn.classList.add("is-busy"); btn.textContent = "Duke publikuar…";
    try {
      // 1. someone else changed the catalogue meanwhile?
      const live = await ghFile(CAT_PATH);
      if (hashStr(comparable(JSON.parse(live.text))) !== hashStr(origComparable())) {
        if (!await ask("Katalogu ka ndryshuar", "Dikush (ose një pajisje tjetër) ka publikuar ndryshime pasi e hape panelin. Nëse vazhdon, ndryshimet e tua i zëvendësojnë ato.", "Vazhdo", true)) throw Object.assign(new Error("cancel"), { cancel: true });
      }
      // 2. build the commit
      const ref = await gh(`/git/ref/heads/${BRANCH}`);
      const head = await gh(`/git/commits/${ref.object.sha}`);
      const tree = await gh(`/git/trees/${head.tree.sha}?recursive=1`);
      const exists = new Set(tree.tree.map(t => t.path));
      const out = { ...D, updated: new Date().toISOString() };
      const text = serialize(out);
      const entries = [{ path: CAT_PATH, mode: "100644", type: "blob", content: text }];
      if (newPin) entries.push({ path: PIN_PATH, mode: "100644", type: "blob", content: JSON.stringify({ pin: newPin }) + "\n" });
      const used = new Set(D.products.map(p => p.i).filter(Boolean));
      for (const [path, data] of Object.entries(newImgs)) {
        if (!used.has(path)) continue;
        const blob = await gh("/git/blobs", { method: "POST", body: JSON.stringify({ content: data.split(",")[1], encoding: "base64" }) });
        entries.push({ path, mode: "100644", type: "blob", sha: blob.sha });
      }
      // remove pictures nobody uses any more
      const ids = new Set(D.products.map(p => p.id));
      const gone = [...origImgs].filter(x => !used.has(x));
      JSON.parse(ORIG).products.forEach(p => { if (!ids.has(p.id)) gone.push(`img/p/${p.id}.avif`); });
      [...new Set(gone)].filter(x => exists.has(x)).forEach(path => entries.push({ path, mode: "100644", type: "blob", sha: null }));

      const nt = await gh("/git/trees", { method: "POST", body: JSON.stringify({ base_tree: head.tree.sha, tree: entries }) });
      const who = { name: "Mist Admin", email: "342578943+ensarabdullahuw@users.noreply.github.com", date: out.updated };
      const msg = "Admin: " + parts.join(", ");
      const commit = await gh("/git/commits", { method: "POST", body: JSON.stringify({ message: msg, tree: nt.sha, parents: [head.sha], author: who, committer: who }) });
      await gh(`/git/refs/heads/${BRANCH}`, { method: "PATCH", body: JSON.stringify({ sha: commit.sha }) });

      // 3. this is now the published state
      setOrig(text);
      D = JSON.parse(text);
      Object.keys(newImgs).forEach(k => { shownImgs[k] = newImgs[k]; delete newImgs[k]; });
      if (newPin) { pinHash = newPin; ss.set("mist_admin", pinHash); if (ls.get("mist_admin")) ls.set("mist_admin", pinHash); }
      newPin = null;
      ls.del("mist_admin_draft"); dirty(); showTab(ui.tab);
      toast("U publikua ✓ — faqja përditësohet pas ~1 minute");
      watchLive(out.updated);
    } catch (e) {
      if (!e.cancel) toast(e.status === 401 ? "Tokeni nuk vlen më — lidhu përsëri te Cilësimet." : e.status === 409 || e.status === 422 ? "GitHub e refuzoi (ndryshim i njëkohshëm). Provo përsëri." : "Publikimi dështoi: " + e.message, true);
    }
    publishing = false; btn.classList.remove("is-busy"); btn.textContent = "Publiko"; dirty();
  }
  // tell the admin when the change is visible on the real site
  async function watchLive(stamp) {
    const pill = $("#changes");
    for (let i = 0; i < 40; i++) {
      if (changes().n) return;
      pill.hidden = false; pill.textContent = "Duke u nxjerrë live…";
      await new Promise(r => setTimeout(r, 6000));
      try {
        const j = await (await fetch(`../${CAT_PATH}?t=${Date.now()}`, { cache: "no-store" })).json();
        if (j.updated === stamp) { if (!changes().n) { pill.textContent = "Live ✓"; setTimeout(dirty, 4000); } toast("Ndryshimet janë live në mistfragrance.org ✓"); return; }
      } catch {}
    }
    if (!changes().n) dirty();
  }

  addEventListener("beforeunload", e => { if (D && changes().n && !token) { e.preventDefault(); e.returnValue = ""; } });

  /* ---------- go ---------- */
  pinReady.then(() => { if (unlocked()) start(); else $("#pin").focus(); });
})();
