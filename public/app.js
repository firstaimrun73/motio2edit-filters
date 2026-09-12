const state = {
  sessionId: null,
  photoUrl: null,
  filters: [],
  categories: ["All"],
  category: "All",
  selectedId: "original",
  intensity: 100,
  comparing: false,
  tab: "filter",
  recipes: {},
  adjust: {
    brightness: 0, shadow: 0, saturation: 0, hue: 0,
    vignette: 0, sharpen: 0, grain: 0, fade: 0,
    highlightColor: null, shadowColor: null,
    highlightAmount: 40, shadowAmount: 40,
  },
  adjTool: "brightness",
  colorTab: "highlight",
  selectedColor: null,
  thumbUrl: null,
};

const $ = (id) => document.getElementById(id);

const adjMeta = [
  { id: "brightness", label: "Light", key: "brightness", min: -80, max: 80, ico: "☀" },
  { id: "shadow", label: "Shadow", key: "shadow", min: -60, max: 80, ico: "◐" },
  { id: "color", label: "Color", key: "saturation", min: -80, max: 80, ico: "💧" },
  { id: "hue", label: "Hue", key: "hue", min: -180, max: 180, ico: "◎" },
  { id: "vignette", label: "Vigne", key: "vignette", min: 0, max: 100, ico: "○" },
];

const COLOR_DOTS = [
  { id: "gray", hex: "#B0B0B0" },
  { id: "red", hex: "#E53935" },
  { id: "orange", hex: "#FB8C00" },
  { id: "yellow", hex: "#FDD835" },
  { id: "green", hex: "#43A047" },
  { id: "teal", hex: "#26A69A" },
  { id: "blue", hex: "#1E88E5" },
  { id: "purple", hex: "#8E24AA" },
];

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(n, a, b) { return Math.min(b, Math.max(a, n)); }

function applyRecipe(recipe, intensity, adjust) {
  const t = recipe.id === "original" ? 0 : clamp(intensity, 0, 100) / 100;
  const overlays = [];
  if (recipe.overlay && recipe.overlay.amount * t > 0.004) {
    overlays.push({ ...recipe.overlay, amount: recipe.overlay.amount * t });
  }
  if (recipe.overlay2 && recipe.overlay2.amount * t > 0.004) {
    overlays.push({ ...recipe.overlay2, amount: recipe.overlay2.amount * t });
  }
  const temp = (recipe.temperature || 0) * t;
  if (temp > 0.01) overlays.push({ color: "#FF9A4A", mix: "soft-light", amount: temp * 0.55 });
  else if (temp < -0.01) overlays.push({ color: "#4A8CFF", mix: "soft-light", amount: -temp * 0.55 });

  if (adjust.highlightColor && adjust.highlightAmount > 0) {
    overlays.push({
      color: adjust.highlightColor,
      mix: "soft-light",
      amount: (adjust.highlightAmount / 100) * 0.45,
    });
  }
  if (adjust.shadowColor && adjust.shadowAmount > 0) {
    overlays.push({
      color: adjust.shadowColor,
      mix: "multiply",
      amount: (adjust.shadowAmount / 100) * 0.35,
    });
  }

  return {
    brightness: lerp(1, recipe.brightness || 1, t) * (1 + (adjust.brightness || 0) / 180),
    contrast: lerp(1, recipe.contrast || 1, t) * (1 + (adjust.shadow || 0) / 220) * (1 + (adjust.sharpen || 0) / 400),
    saturate: lerp(1, recipe.saturate || 1, t) * (1 + (adjust.saturation || 0) / 120),
    hue: lerp(0, recipe.hue || 0, t) + (adjust.hue || 0),
    sepia: lerp(0, recipe.sepia || 0, t),
    grayscale: lerp(0, recipe.grayscale || 0, t),
    vignette: clamp(lerp(0, recipe.vignette || 0, t) + (adjust.vignette || 0) / 100, 0, 1),
    fade: clamp(lerp(0, recipe.fade || 0, t) + (adjust.fade || 0) / 100, 0, 1),
    grain: clamp(lerp(0, recipe.grain || 0, t) + (adjust.grain || 0) / 100, 0, 1),
    overlays,
  };
}

function cssFilter(look) {
  return [
    `brightness(${look.brightness})`,
    `contrast(${look.contrast})`,
    `saturate(${look.saturate})`,
    `hue-rotate(${look.hue}deg)`,
    `sepia(${look.sepia})`,
    `grayscale(${look.grayscale})`,
  ].join(" ");
}

function vignetteShadow(a) {
  if (a <= 0) return "none";
  return `inset 0 0 ${Math.round(40 + a * 80)}px ${Math.round(20 + a * 70)}px rgb(0 0 0 / ${0.18 + a * 0.55})`;
}

async function loadCatalog() {
  const res = await fetch("/api/filters");
  const data = await res.json();
  state.filters = data.filters;
  state.categories = data.categories || ["All"];
  await Promise.all(
    state.filters.map(async (f) => {
      if (state.recipes[f.id]) return;
      try {
        const r = await fetch(`/api/filters/${f.id}`);
        state.recipes[f.id] = await r.json();
      } catch (_) {}
    })
  );
}

function showEditor(show) {
  $("upload-gate").classList.toggle("hidden", show);
  $("editor").classList.toggle("hidden", !show);
  $("btn-replace").classList.toggle("hidden", !show);
}

async function uploadFile(file) {
  if (!file || !file.type.startsWith("image/")) {
    alert("Choose a photo (JPG, PNG, WebP)");
    return;
  }
  $("busy")?.classList.remove("hidden");
  const fd = new FormData();
  fd.append("photo", file);
  try {
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Upload failed");
    state.sessionId = data.sessionId;
    state.photoUrl = data.url + "?t=" + Date.now();
    state.selectedId = "original";
    state.intensity = 100;
    Object.keys(state.adjust).forEach((k) => {
      if (typeof state.adjust[k] === "number") state.adjust[k] = 0;
      else state.adjust[k] = null;
    });
    state.adjust.highlightAmount = 40;
    state.adjust.shadowAmount = 40;
    state.thumbUrl = await makeThumb(state.photoUrl);
    showEditor(true);
    renderCats();
    renderStrip();
    renderMain();
    $("intensity").value = 100;
    $("intensity-val").textContent = "100";
  } catch (e) {
    alert(e.message || "Upload failed");
  } finally {
    $("busy")?.classList.add("hidden");
  }
}

function makeThumb(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const max = 220;
      const scale = Math.min(1, max / img.naturalWidth);
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.naturalWidth * scale));
      c.height = Math.max(1, Math.round(img.naturalHeight * scale));
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL("image/jpeg", 0.72));
    };
    img.onerror = reject;
    img.src = src;
  });
}

function currentRecipe() {
  return state.recipes[state.selectedId] || {
    id: "original", name: "Original", brightness: 1, contrast: 1, saturate: 1,
  };
}

function renderMain() {
  const img = $("main-photo");
  const wrap = $("overlays");
  if (!state.photoUrl) return;
  img.src = state.photoUrl;
  const recipe = currentRecipe();
  const look = state.comparing
    ? applyRecipe(
        { id: "original", brightness: 1, contrast: 1, saturate: 1 },
        0,
        { brightness: 0, shadow: 0, saturation: 0, hue: 0, vignette: 0, sharpen: 0, grain: 0, fade: 0 }
      )
    : applyRecipe(recipe, state.intensity, state.adjust);
  img.style.filter = cssFilter(look);
  wrap.innerHTML = "";
  if (state.comparing) return;
  look.overlays.forEach((o) => {
    const d = document.createElement("div");
    d.className = "layer";
    d.style.backgroundColor = o.color;
    d.style.mixBlendMode = o.mix;
    d.style.opacity = o.amount;
    wrap.appendChild(d);
  });
  if (look.fade > 0) {
    const d = document.createElement("div");
    d.className = "layer";
    d.style.backgroundColor = "#f4efe6";
    d.style.mixBlendMode = "screen";
    d.style.opacity = look.fade * 0.45;
    wrap.appendChild(d);
  }
  if (look.vignette > 0) {
    const d = document.createElement("div");
    d.className = "layer";
    d.style.boxShadow = vignetteShadow(look.vignette);
    wrap.appendChild(d);
  }
}

function filteredItems() {
  return state.filters.filter((f) => {
    if (state.category !== "All" && f.category !== state.category) return false;
    return true;
  });
}

function renderCats() {
  const el = $("cats");
  el.innerHTML = "";
  const preferred = ["All", "Natural", "Portrait", "Cinematic", "Film", "Mono", "Color", "Vintage", "Mood"];
  const cats = preferred.filter((c) => state.categories.includes(c) || c === "All");
  state.categories.forEach((c) => {
    if (!cats.includes(c)) cats.push(c);
  });
  cats.forEach((c) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip" + (state.category === c ? " active" : "");
    b.textContent = c;
    b.onclick = () => {
      state.category = c;
      renderCats();
      renderStrip();
    };
    el.appendChild(b);
  });
}

function renderStrip() {
  const items = filteredItems();
  $("count").textContent = `${items.length} looks · live preview of this photo`;
  const strip = $("strip");
  strip.innerHTML = "";
  const src = state.thumbUrl || state.photoUrl;
  items.forEach((f) => {
    const recipe = state.recipes[f.id] || f;
    const look = applyRecipe(
      recipe,
      f.id === state.selectedId ? state.intensity : 100,
      { brightness: 0, shadow: 0, saturation: 0, hue: 0, vignette: 0, sharpen: 0, grain: 0, fade: 0 }
    );
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "thumb" + (f.id === state.selectedId ? " selected" : "");
    btn.dataset.id = f.id;
    const isSel = f.id === state.selectedId;
    btn.innerHTML = `<div class="frame">
      <img alt="" />
      <div class="ov"></div>
      ${f.tier === "studio" && !isSel ? '<span class="pro">Pro</span>' : ""}
      ${isSel ? '<span class="check-mark">✓</span>' : ""}
      <span class="label">${f.name}</span>
    </div>`;
    const im = btn.querySelector("img");
    im.src = src;
    im.style.filter = cssFilter(look);
    const ov = btn.querySelector(".ov");
    look.overlays.forEach((o) => {
      const d = document.createElement("div");
      d.style.cssText = `position:absolute;inset:0;background:${o.color};mix-blend-mode:${o.mix};opacity:${o.amount}`;
      ov.appendChild(d);
    });
    btn.onclick = () => {
      state.selectedId = f.id;
      state.intensity = 100;
      $("intensity").value = 100;
      $("intensity-val").textContent = "100";
      renderStrip();
      renderMain();
    };
    strip.appendChild(btn);
  });
}

function renderAdjTools() {
  const el = $("adj-tools");
  el.innerHTML = "";
  adjMeta.forEach((t) => {
    const b = document.createElement("button");
    b.type = "button";
    const used = state.adjust[t.key] !== 0;
    b.className = (state.adjTool === t.id ? "active " : "") + (used ? "used" : "");
    b.innerHTML = `<span class="ico">${t.ico}</span>${t.label}<span class="dot"></span>`;
    b.onclick = () => {
      state.adjTool = t.id;
      const slider = $("adj-slider");
      slider.min = t.min;
      slider.max = t.max;
      slider.value = state.adjust[t.key];
      renderAdjTools();
      $("color-panel").classList.toggle("hidden", t.id !== "color");
      if (t.id === "color") renderColorPanel();
    };
    el.appendChild(b);
  });
  const cur = adjMeta.find((t) => t.id === state.adjTool) || adjMeta[0];
  const slider = $("adj-slider");
  slider.min = cur.min;
  slider.max = cur.max;
  slider.value = state.adjust[cur.key];
  $("color-panel").classList.toggle("hidden", state.adjTool !== "color");
}

function renderColorPanel() {
  const dots = $("color-dots");
  dots.innerHTML = "";
  COLOR_DOTS.forEach((c) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "color-dot" + (state.selectedColor === c.id ? " selected" : "");
    b.style.background = c.hex;
    b.onclick = () => {
      state.selectedColor = c.id;
      if (state.colorTab === "highlight") {
        state.adjust.highlightColor = c.hex;
      } else {
        state.adjust.shadowColor = c.hex;
      }
      renderColorPanel();
      renderMain();
    };
    dots.appendChild(b);
  });
  document.querySelectorAll(".ctab").forEach((t) => {
    t.classList.toggle("active", t.dataset.ctab === state.colorTab);
  });
  const amt =
    state.colorTab === "highlight"
      ? state.adjust.highlightAmount
      : state.adjust.shadowAmount;
  $("color-slider").value = amt;
}

async function download() {
  if (!state.photoUrl) return;
  $("busy").classList.remove("hidden");
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = rej;
      img.src = state.photoUrl;
    });
    const max = 2400;
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    const look = applyRecipe(currentRecipe(), state.intensity, state.adjust);
    ctx.filter = cssFilter(look);
    ctx.drawImage(img, 0, 0, w, h);
    ctx.filter = "none";
    look.overlays.forEach((o) => {
      ctx.save();
      ctx.globalCompositeOperation = o.mix === "color" ? "color" : o.mix || "soft-light";
      ctx.globalAlpha = o.amount;
      ctx.fillStyle = o.color;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    });
    if (look.fade > 0) {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = look.fade * 0.45;
      ctx.fillStyle = "#f4efe6";
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
    if (look.vignette > 0) {
      const g = ctx.createRadialGradient(
        w / 2, h / 2, Math.min(w, h) * 0.25,
        w / 2, h / 2, Math.max(w, h) * 0.72
      );
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, `rgba(0,0,0,${0.15 + look.vignette * 0.7})`);
      ctx.save();
      ctx.globalCompositeOperation = "multiply";
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
    const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.92));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `motio2edit-${currentRecipe().name.toLowerCase().replace(/\s+/g, "-")}.jpg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  } catch (e) {
    alert("Export failed — try another photo");
  } finally {
    $("busy").classList.add("hidden");
  }
}

function wire() {
  const drop = $("dropzone");
  const input = $("file-input");
  const input2 = $("file-input-2");

  drop.addEventListener("click", () => input.click());
  input.addEventListener("change", () => uploadFile(input.files?.[0]));
  input2.addEventListener("change", () => uploadFile(input2.files?.[0]));
  $("btn-replace").addEventListener("click", () => input2.click());
  $("btn-back")?.addEventListener("click", () => {
    if (state.photoUrl) {
      showEditor(false);
      state.photoUrl = null;
      state.sessionId = null;
    } else {
      history.back();
    }
  });

  ["dragenter", "dragover"].forEach((ev) => {
    drop.addEventListener(ev, (e) => {
      e.preventDefault();
      drop.classList.add("drag");
    });
  });
  ["dragleave", "drop"].forEach((ev) => {
    drop.addEventListener(ev, (e) => {
      e.preventDefault();
      drop.classList.remove("drag");
      if (ev === "drop") uploadFile(e.dataTransfer.files?.[0]);
    });
  });

  const stage = $("stage");
  const setCmp = (v) => {
    state.comparing = v;
    $("btn-compare").classList.toggle("active", v);
    renderMain();
  };
  stage.addEventListener("pointerdown", () => setCmp(true));
  stage.addEventListener("pointerup", () => setCmp(false));
  stage.addEventListener("pointerleave", () => setCmp(false));
  $("btn-compare").addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    setCmp(true);
  });
  $("btn-compare").addEventListener("pointerup", () => setCmp(false));
  $("btn-compare").addEventListener("pointerleave", () => setCmp(false));

  $("btn-reset").onclick = () => {
    state.selectedId = "original";
    state.intensity = 100;
    Object.keys(state.adjust).forEach((k) => {
      if (typeof state.adjust[k] === "number") state.adjust[k] = 0;
      else state.adjust[k] = null;
    });
    state.adjust.highlightAmount = 40;
    state.adjust.shadowAmount = 40;
    state.selectedColor = null;
    $("intensity").value = 100;
    $("intensity-val").textContent = "100";
    renderStrip();
    renderMain();
    renderAdjTools();
  };
  $("btn-download").onclick = download;
  $("btn-check").onclick = download;

  document.querySelectorAll(".tab").forEach((t) => {
    t.onclick = () => {
      state.tab = t.dataset.tab;
      document.querySelectorAll(".tab").forEach((x) =>
        x.classList.toggle("active", x.dataset.tab === state.tab)
      );
      $("panel-filter").classList.toggle("hidden", state.tab !== "filter");
      $("panel-adjust").classList.toggle("hidden", state.tab !== "adjust");
      if (state.tab === "adjust") renderAdjTools();
    };
  });

  $("intensity").oninput = () => {
    state.intensity = +$("intensity").value;
    $("intensity-val").textContent = String(state.intensity);
    renderMain();
  };

  $("adj-slider").oninput = () => {
    const cur = adjMeta.find((t) => t.id === state.adjTool) || adjMeta[0];
    state.adjust[cur.key] = +$("adj-slider").value;
    renderMain();
    renderAdjTools();
  };

  document.querySelectorAll(".ctab").forEach((t) => {
    t.onclick = () => {
      state.colorTab = t.dataset.ctab;
      const hex =
        state.colorTab === "highlight"
          ? state.adjust.highlightColor
          : state.adjust.shadowColor;
      state.selectedColor = COLOR_DOTS.find((c) => c.hex === hex)?.id || null;
      renderColorPanel();
    };
  });
  $("color-slider").oninput = () => {
    const v = +$("color-slider").value;
    if (state.colorTab === "highlight") state.adjust.highlightAmount = v;
    else state.adjust.shadowAmount = v;
    renderMain();
  };
}

async function init() {
  wire();
  showEditor(false);
  try {
    await loadCatalog();
  } catch (e) {
    console.warn("Catalog load failed", e);
  }
}

init();
