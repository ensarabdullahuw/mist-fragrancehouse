(async () => {
  // The catalogue lives in data/catalog.json (edited from /admin). no-cache = always revalidate,
  // so changes published from the admin show up as soon as the site redeploys.
  let DATA;
  try {
    const r = await fetch("data/catalog.json", { cache: "no-cache" });
    if (!r.ok) throw new Error(r.status);
    DATA = await r.json();
  } catch (e) {
    document.getElementById("grid").innerHTML = '<p class="none">Katalogu nuk u ngarkua. Rifresko faqen.</p>';
    return;
  }
  const CFG = window.MIST_CONFIG;
  Object.entries(DATA.settings || {}).forEach(([k, v]) => { if (v) CFG[k] = v; });
  const CATS = DATA.categories || [];
  const ALL = DATA.products.map(p => ({
    ...p,
    off: p.o ? Math.round((1 - p.p / p.o) * 100) : 0,
    q: (p.b + " " + p.n).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""),
  }));
  const byId = Object.fromEntries(ALL.map(p => [p.id, p]));
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const money = n => n.toFixed(2) + " " + CFG.currency;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const img = p => p.i || `img/p/${p.id}.avif`;
  const sizeLine = p => [p.s, p.c].filter(Boolean).join(" · ");

  const CITIES = ["Prishtinë","Prizren","Pejë","Gjakovë","Ferizaj","Gjilan","Mitrovicë","Podujevë","Vushtrri","Suharekë","Rahovec","Drenas","Lipjan","Malishevë","Kamenicë","Viti","Deçan","Istog","Klinë","Skenderaj","Dragash","Fushë Kosovë","Kaçanik","Shtime","Obiliq","Novobërdë","Junik","Mamushë","Hani i Elezit","Graçanicë","Shtërpcë"];

  /* ---------- storage (safe) ---------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };

  /* ---------- theme (light default) ---------- */
  const root = document.documentElement;
  const meta = $('meta[name="theme-color"]');
  function setTheme(t) {
    root.dataset.theme = t;
    meta.content = t === "dark" ? "#0F0B22" : "#FAF7F0";
    try { localStorage.setItem("mist_theme", t); } catch {}
  }
  $("#themeBtn").addEventListener("click", () => setTheme(root.dataset.theme === "dark" ? "light" : "dark"));
  setTheme(root.dataset.theme === "dark" ? "dark" : "light");

  /* ---------- social links ---------- */
  const isSet = v => v && !/^VENDOS_/.test(v);
  const igProfile = () => isSet(CFG.instagram) ? `https://instagram.com/${CFG.instagram}` : "https://instagram.com/";
  const msUrl = () => isSet(CFG.messenger) ? `https://m.me/${CFG.messenger}` : "https://www.messenger.com/";
  $$(".js-ig").forEach(a => a.href = igProfile());
  $$(".js-ms").forEach(a => a.href = msUrl());
  if (!isSet(CFG.instagram) || !isSet(CFG.messenger)) console.warn("[Mist] Vendos Instagram/Messenger te js/config.js");

  $("#year").textContent = new Date().getFullYear();
  const topH = () => root.style.setProperty("--top-h", $("#top").offsetHeight + "px");
  addEventListener("resize", topH); topH();
  const brands = [...new Set(ALL.map(p => p.b))].sort((a, b) => a.localeCompare(b));
  $("#statCount").textContent = ALL.length;
  $("#statBrands").textContent = brands.length;

  /* ---------- catalogue state ---------- */
  const state = {
    g: "all",
    brand: "",
    sort: "new",
    q: "",
    size: store.get("mist_size", "lg"),
    shown: CFG.pageSize,
  };
  const grid = $("#grid");
  const brandSel = $("#brandSel");
  brandSel.insertAdjacentHTML("beforeend", brands.map(b => `<option>${esc(b)}</option>`).join(""));

  function filtered() {
    const words = state.q.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/\s+/).filter(Boolean);
    let list = ALL.filter(p =>
      (state.g === "all" || p.g === state.g) &&
      (!state.brand || p.b === state.brand) &&
      words.every(w => p.q.includes(w)));
    const s = state.sort;
    if (s === "low") list = list.slice().sort((a, b) => a.p - b.p);
    if (s === "high") list = list.slice().sort((a, b) => b.p - a.p);
    if (s === "off") list = list.slice().sort((a, b) => b.off - a.off);
    if (s === "az") list = list.slice().sort((a, b) => (a.b + a.n).localeCompare(b.b + b.n));
    // in-stock first, keep order otherwise
    return list.filter(p => p.a).concat(list.filter(p => !p.a));
  }

  const card = p => `
    <article class="card">
      <div class="card__media">
        ${p.off >= 5 ? `<span class="card__off">−${p.off}%</span>` : ""}
        ${!p.a ? `<span class="card__soon">Së shpejti</span>` : ""}
        <img src="${img(p)}" alt="${esc(p.b + " " + p.n)}" loading="lazy" decoding="async" width="600" height="600">
      </div>
      <div class="card__body">
        <p class="card__brand">${esc(p.b)}</p>
        <h3 class="card__name">${esc(p.n)}</h3>
        <p class="card__size">${esc(sizeLine(p))}</p>
        <div class="card__foot">
          <div class="price"><b>${money(p.p)}</b>${p.o ? `<s>${money(p.o)}</s>` : ""}</div>
          <button class="add" data-add="${p.id}" aria-label="Shto ${esc(p.n)} në shportë" ${p.a ? "" : "disabled"}>
            <svg class="i-plus"><use href="#i-plus"/></svg><svg class="i-check"><use href="#i-check"/></svg>
          </button>
        </div>
      </div>
    </article>`;

  function render() {
    const list = filtered();
    grid.innerHTML = list.slice(0, state.shown).map(card).join("");
    const n = list.length;
    $("#count").textContent = n === ALL.length ? `${n} parfume` : `${n} nga ${ALL.length} parfume`;
    $("#none").hidden = n > 0;
    $(".more").hidden = state.shown >= n;
    $("#moreBtn").textContent = `Shfaq më shumë (${n - Math.min(state.shown, n)})`;
  }
  const reset = () => { state.shown = CFG.pageSize; render(); };

  const used = new Set(ALL.map(p => p.g));
  $(".chips").insertAdjacentHTML("beforeend", CATS.filter(c => used.has(c.id))
    .map(c => `<button class="chip" data-g="${esc(c.id)}" role="tab" aria-selected="false">${esc(c.name)}</button>`).join(""));
  $$(".chip").forEach(c => c.addEventListener("click", () => {
    $$(".chip").forEach(x => { x.classList.toggle("is-on", x === c); x.setAttribute("aria-selected", x === c); });
    state.g = c.dataset.g; reset();
  }));
  brandSel.addEventListener("change", () => { state.brand = brandSel.value; reset(); });
  $("#sortSel").addEventListener("change", e => { state.sort = e.target.value; reset(); });
  let st;
  $("#search").addEventListener("input", e => {
    clearTimeout(st);
    st = setTimeout(() => {
      state.q = e.target.value.trim(); reset();
      if (state.q && scrollY < $("#koleksioni").offsetTop - 80) $("#koleksioni").scrollIntoView({ behavior: "smooth" });
    }, 150);
  });
  $("#moreBtn").addEventListener("click", () => { state.shown += CFG.pageSize; render(); });

  function setSize(s) {
    state.size = s; grid.dataset.size = s; store.set("mist_size", s);
    $$(".view__btn").forEach(b => b.classList.toggle("is-on", b.dataset.size === s));
  }
  $$(".view__btn").forEach(b => b.addEventListener("click", () => setSize(b.dataset.size)));
  setSize(state.size === "sm" ? "sm" : "lg");

  /* ---------- cart ---------- */
  let cart = store.get("mist_cart", {});
  Object.keys(cart).forEach(id => { if (!byId[id]) delete cart[id]; });
  const count = () => Object.values(cart).reduce((a, b) => a + b, 0);
  const total = () => Object.entries(cart).reduce((s, [id, q]) => s + byId[id].p * q, 0);

  function renderCart() {
    store.set("mist_cart", cart);
    const n = count(), badge = $("#bagCount");
    badge.textContent = n; badge.classList.toggle("has", n > 0);
    const ids = Object.keys(cart);
    $("#bagList").innerHTML = ids.map(id => {
      const p = byId[id], q = cart[id];
      return `<li>
        <div class="bag__img"><img src="${img(p)}" alt=""></div>
        <div>
          <p class="bag__brand">${esc(p.b)}</p>
          <p class="bag__name">${esc(p.n)}</p>
          <div class="qty"><button data-dec="${id}" aria-label="Më pak">−</button><span>${q}</span><button data-inc="${id}" aria-label="Më shumë">+</button></div>
        </div>
        <div class="bag__right">
          <span class="bag__price">${money(p.p * q)}</span>
          <button class="bag__rm" data-rm="${id}">Hiqe</button>
        </div>
      </li>`;
    }).join("");
    $("#bagEmpty").hidden = ids.length > 0;
    $("#bagSum").hidden = ids.length === 0;
    $("#bagTotal").textContent = money(total());
    $("#formTotal").textContent = money(total());
  }

  grid.addEventListener("click", e => {
    const btn = e.target.closest("[data-add]");
    if (!btn || btn.disabled) return;
    const id = btn.dataset.add;
    cart[id] = (cart[id] || 0) + 1;
    renderCart();
    const b = $("#bagCount"); b.classList.add("bump"); setTimeout(() => b.classList.remove("bump"), 220);
    btn.classList.add("is-added"); setTimeout(() => btn.classList.remove("is-added"), 1200);
    toast(`${byId[id].n} u shtua në shportë`);
  });

  $("#bagList").addEventListener("click", e => {
    const t = e.target.closest("button"); if (!t) return;
    const { inc, dec, rm } = t.dataset;
    if (inc) cart[inc]++;
    if (dec) { cart[dec]--; if (cart[dec] <= 0) delete cart[dec]; }
    if (rm) delete cart[rm];
    renderCart();
  });

  /* ---------- drawer ---------- */
  const drawer = $("#drawer"), scrim = $("#scrim");
  const titles = { bag: "Shporta", form: "Të dhënat", done: "Porosia u dërgua" };
  function show(pane) {
    $$(".pane", drawer).forEach(p => p.hidden = p.dataset.pane !== pane);
    $("#drawerTitle").textContent = titles[pane];
    $(`[data-pane="${pane}"]`, drawer).scrollTop = 0;
  }
  function open(pane = "bag") {
    show(pane);
    scrim.hidden = false;
    void scrim.offsetWidth;
    scrim.classList.add("is-open"); drawer.classList.add("is-open");
    drawer.setAttribute("aria-hidden", "false");
    document.body.classList.add("lock");
  }
  function close() {
    scrim.classList.remove("is-open"); drawer.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
    document.body.classList.remove("lock");
    setTimeout(() => { if (!drawer.classList.contains("is-open")) scrim.hidden = true; }, 320);
  }
  $("#bagBtn").addEventListener("click", () => open("bag"));
  $("#drawerClose").addEventListener("click", close);
  scrim.addEventListener("click", close);
  addEventListener("keydown", e => { if (e.key === "Escape" && drawer.classList.contains("is-open")) close(); });
  $$("[data-close]").forEach(b => b.addEventListener("click", () => { close(); $("#koleksioni").scrollIntoView(); }));
  $("#toCheckout").addEventListener("click", () => show("form"));
  $("#backToBag").addEventListener("click", () => show("bag"));

  /* ---------- order form (sent straight to the shop's email) ---------- */
  const form = $("#orderForm");
  const citySel = $("#citySel");
  citySel.insertAdjacentHTML("beforeend", CITIES.map(c => `<option>${c}</option>`).join("") + `<option value="__other">Tjetër…</option>`);
  citySel.addEventListener("change", () => {
    const other = citySel.value === "__other";
    $("#cityOtherWrap").hidden = !other;
    form.qytetiTjeter.required = other;
  });

  const FIELDS = ["emri", "mbiemri", "tel", "email", "rruga", "nr"];
  const saved = store.get("mist_details", {});
  FIELDS.forEach(k => { if (saved[k]) form[k].value = saved[k]; });
  if (saved.qyteti) { citySel.value = saved.qyteti; citySel.dispatchEvent(new Event("change")); if (saved.qytetiTjeter) form.qytetiTjeter.value = saved.qytetiTjeter; }
  $$("input,select,textarea", form).forEach(el => el.addEventListener("input", () => { el.closest(".f")?.classList.remove("err"); $("#formErr").hidden = true; }));

  const emailOk = v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
  const phoneLink = () => `<a href="tel:${CFG.phone}">${CFG.phone.replace(/^\+383(\d{2})(\d{3})(\d{3})$/, "+383 $1 $2 $3")}</a>`;
  let sending = false;

  form.addEventListener("submit", async e => {
    e.preventDefault();
    if (sending) return;
    if (!count()) { show("bag"); return; }

    let firstBad = null;
    $$("[required]", form).forEach(el => {
      const v = el.value.trim();
      const bad = !v || (el.name === "tel" && v.replace(/\D/g, "").length < 8) || (el.name === "email" && !emailOk(v));
      el.closest(".f").classList.toggle("err", bad);
      if (bad && !firstBad) firstBad = el;
    });
    if (firstBad) { firstBad.focus(); toast("Plotëso fushat e shënuara"); return; }

    const d = Object.fromEntries(new FormData(form));
    if (d._honey) return; // bot
    store.set("mist_details", { ...d, shenim: "" });
    const city = d.qyteti === "__other" ? d.qytetiTjeter.trim() : d.qyteti;
    const code = "MIST-" + Math.floor(1000 + Math.random() * 9000);
    const items = Object.entries(cart).map(([id, q]) => {
      const p = byId[id];
      return `${q} × ${p.b} – ${p.n}${p.s ? ` (${p.s})` : ""} = ${money(p.p * q)}`;
    });
    const sum = money(total());
    const name = `${d.emri.trim()} ${d.mbiemri.trim()}`;

    const payload = {
      _subject: `Porosi e re ${code} — ${name} — ${sum}`,
      _template: "table",
      _captcha: "false",
      _replyto: d.email.trim(),
      _autoresponse: `Faleminderit, ${d.emri.trim()}! Porosia jote ${code} (${sum}) te Mist Fragrance House u pranua. Do të të telefonojmë sa më shpejt për ta konfirmuar.`,
      "Porosia": code,
      "Produktet": items.join("\n"),
      "Totali": `${sum} (pa transport)`,
      "Emri dhe mbiemri": name,
      "Telefoni": d.tel.trim(),
      "Email": d.email.trim(),
      "Qyteti": city,
      "Lagjja / rruga": d.rruga.trim(),
      "Nr. i objektit / shtëpisë": d.nr.trim(),
      "Shënime": d.shenim.trim() || "—",
    };

    const btn = $("#submitBtn");
    sending = true; btn.classList.add("is-busy"); btn.textContent = "Duke dërguar…";
    $("#formErr").hidden = true;
    let ok = false;
    try {
      const r = await fetch(`https://formsubmit.co/ajax/${CFG.orderEmail}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => ({}));
      ok = r.ok && String(j.success) === "true";
    } catch { ok = false; }
    sending = false; btn.classList.remove("is-busy"); btn.textContent = "Dërgo porosinë";

    if (!ok) {
      const err = $("#formErr");
      err.innerHTML = `Porosia nuk u dërgua — kontrollo internetin dhe provo përsëri, ose na telefono në ${phoneLink()}.`;
      err.hidden = false;
      return;
    }

    $("#orderCode").textContent = code;
    $("#orderText").textContent =
      `${items.join("\n")}\nTotali: ${sum}\n\n${name}\n${d.tel.trim()}\n${city}, ${d.rruga.trim()}, ${d.nr.trim()}`;
    show("done");
    cart = {}; renderCart();
    form.shenim.value = "";
  });

  /* ---------- helpers ---------- */
  let tt;
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(tt); tt = setTimeout(() => t.classList.remove("show"), 2000);
  }

  render();
  renderCart();
})();
