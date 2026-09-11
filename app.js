/* ============ Config ============ */
const EQUIPOS = [
  { id: "teclado", label: "Teclado", icon: "⌨️" },
  { id: "computador", label: "Computador", icon: "🖥️" },
  { id: "impresora", label: "Impresora", icon: "🖨️" },
  { id: "mouse", label: "Mouse", icon: "🖱️" },
  { id: "scanner", label: "Escáner", icon: "🔦" },
  { id: "ups", label: "UPS", icon: "🔋" },
  { id: "camaras", label: "Cámaras", icon: "🎥" },
  { id: "dvr", label: "DVR", icon: "📼" },
];
const DB_NAME = "mant_pdv_db";
const STORE = "reportes";
const LS_URL_KEY = "mant_pdv_script_url";
const LS_DRAFT_KEY = "mant_pdv_draft";

/* ============ IndexedDB helper ============ */
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function dbPut(report) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(report);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function dbAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result.sort((a, b) => b.creado - a.creado));
    req.onerror = () => reject(req.error);
  });
}
async function dbDelete(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/* ============ Utilidades ============ */
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2200);
}
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function compressImage(file, maxW = 900, quality = 0.6) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => (img.src = e.target.result);
    reader.onerror = reject;
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ============ Estado del formulario ============ */
let equipState = {}; // { teclado: { activo, foto, actividad, paraCambio, detalleCambio } }
let firmaFotoPapel = null;
let selloFoto = null;

/* ============ Borrador automático (protege contra recargas accidentales) ============ */
let draftTimer = null;
function saveDraft() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    try {
      const draft = {
        pdv: document.getElementById("f-pdv").value,
        fecha: document.getElementById("f-fecha").value,
        fechaLabel: document.getElementById("fechaLabel").textContent,
        tecnico: document.getElementById("f-tecnico").value,
        equipState,
        firmaDibujo: getSigDataUrl(),
        firmaFotoPapel,
        selloFoto,
      };
      const vacio = !draft.pdv && Object.keys(equipState).length === 0 && !firmaFotoPapel && !selloFoto && !draft.firmaDibujo;
      if (vacio) {
        localStorage.removeItem(LS_DRAFT_KEY);
      } else {
        localStorage.setItem(LS_DRAFT_KEY, JSON.stringify(draft));
      }
    } catch (e) {
      // si el borrador no cabe (demasiadas fotos pesadas), no rompe la app
    }
  }, 400);
}
function clearDraft() {
  clearTimeout(draftTimer);
  localStorage.removeItem(LS_DRAFT_KEY);
}
function restoreDraft(draft) {
  document.getElementById("f-pdv").value = draft.pdv || "";
  document.getElementById("f-tecnico").value = draft.tecnico || "";
  if (draft.fecha) {
    document.getElementById("f-fecha").value = draft.fecha;
    document.getElementById("fechaLabel").textContent = draft.fechaLabel || draft.fecha;
  }
  equipState = draft.equipState || {};
  firmaFotoPapel = draft.firmaFotoPapel || null;
  selloFoto = draft.selloFoto || null;
  normalizeEquipState();

  updateEquipSummary();
  renderEquipDetails();

  if (firmaFotoPapel) {
    document.getElementById("btnFotoFirmaPapel").innerHTML =
      `<img src="${firmaFotoPapel}" /><input type="file" accept="image/*" capture="environment" id="inpFotoFirmaPapel" />`;
    document.getElementById("inpFotoFirmaPapel").addEventListener("change", handleFirmaPapelChange);
  }
  if (selloFoto) {
    document.getElementById("btnFotoSello").innerHTML =
      `<img src="${selloFoto}" /><input type="file" accept="image/*" capture="environment" id="inpFotoSello" />`;
    document.getElementById("inpFotoSello").addEventListener("change", handleSelloChange);
  }
  if (draft.firmaDibujo) {
    const img = new Image();
    img.onload = () => {
      const canvas = document.getElementById("sigPad");
      sigCtx.drawImage(img, 0, 0, canvas.width / (window.devicePixelRatio || 1), canvas.height / (window.devicePixelRatio || 1));
      sigHasContent = true;
    };
    img.src = draft.firmaDibujo;
  }
  toast("Se restauró el reporte que tenías sin guardar");
}
function checkForDraft() {
  let raw;
  try { raw = localStorage.getItem(LS_DRAFT_KEY); } catch (e) { return; }
  if (!raw) return;
  let draft;
  try { draft = JSON.parse(raw); } catch (e) { localStorage.removeItem(LS_DRAFT_KEY); return; }
  const tieneAlgo = draft.pdv || (draft.equipState && Object.keys(draft.equipState).length) || draft.firmaFotoPapel || draft.selloFoto || draft.firmaDibujo;
  if (!tieneAlgo) return;
  const continuar = window.confirm("Tenías un reporte sin guardar (parece que la app se recargó). ¿Quieres continuar donde lo dejaste?");
  if (continuar) {
    restoreDraft(draft);
  } else {
    localStorage.removeItem(LS_DRAFT_KEY);
  }
}

/* ============ Selector desplegable de equipos (modal con contador) ============ */
function renderEquipModalList() {
  const list = document.getElementById("equipModalList");
  list.innerHTML = "";
  EQUIPOS.forEach((eq) => {
    const qty = equipState[eq.id] ? equipState[eq.id].length : 0;
    const row = document.createElement("div");
    row.className = "equip-option";
    row.innerHTML = `
      <span class="equip-option-label">${eq.icon} ${eq.label}</span>
      <div class="qty-stepper">
        <button type="button" data-action="dec" data-id="${eq.id}">−</button>
        <span data-role="qty" data-id="${eq.id}">${qty}</span>
        <button type="button" data-action="inc" data-id="${eq.id}">+</button>
      </div>
    `;
    list.appendChild(row);
  });
  list.querySelectorAll('[data-action="inc"]').forEach((btn) => {
    btn.addEventListener("click", () => changeEquipQty(btn.dataset.id, 1));
  });
  list.querySelectorAll('[data-action="dec"]').forEach((btn) => {
    btn.addEventListener("click", () => changeEquipQty(btn.dataset.id, -1));
  });
}
function changeEquipQty(id, delta) {
  if (!equipState[id]) equipState[id] = [];
  if (delta > 0) {
    equipState[id].push(defaultEquipItem());
  } else if (delta < 0 && equipState[id].length > 0) {
    equipState[id].pop(); // quita la última instancia agregada de ese tipo
  }
  if (equipState[id].length === 0) delete equipState[id];
  renderEquipModalList(); // refresca el número dentro del mismo modal
  updateEquipSummary();
  renderEquipDetails();
  saveDraft();
}
function openEquipModal() {
  renderEquipModalList();
  document.getElementById("equipModalBackdrop").classList.add("show");
}
function closeEquipModal() {
  document.getElementById("equipModalBackdrop").classList.remove("show");
}
function defaultEquipItem() {
  return { fotos: [], activoFijo: "", actividad: "", paraCambio: false, detalleCambio: "" };
}
function normalizeEquipState() {
  Object.keys(equipState).forEach((id) => {
    if (!Array.isArray(equipState[id])) {
      equipState[id] = [equipState[id]]; // compatibilidad con borradores/reportes viejos
    }
    equipState[id].forEach((item) => {
      if (!item.fotos) item.fotos = item.foto ? [item.foto] : [];
    });
  });
}
function updateEquipSummary() {
  const ids = Object.keys(equipState);
  const totalInstancias = ids.reduce((sum, id) => sum + equipState[id].length, 0);
  const label = document.getElementById("equipSelectLabel");
  label.textContent = totalInstancias === 0
    ? "Seleccionar equipos"
    : `${totalInstancias} equipo(s) seleccionado(s)`;

  const tagsWrap = document.getElementById("equipTags");
  tagsWrap.innerHTML = "";
  ids.forEach((id) => {
    const meta = EQUIPOS.find((e) => e.id === id);
    const cantidad = equipState[id].length;
    const tag = document.createElement("span");
    tag.className = "equip-tag";
    tag.innerHTML = `${meta.icon} ${meta.label}${cantidad > 1 ? ` ×${cantidad}` : ""} <button type="button" data-id="${id}">✕</button>`;
    tag.querySelector("button").addEventListener("click", () => {
      delete equipState[id];
      updateEquipSummary();
      renderEquipDetails();
      saveDraft();
    });
    tagsWrap.appendChild(tag);
  });
}
document.getElementById("btnAbrirEquipos").addEventListener("click", openEquipModal);
document.getElementById("equipModalClose").addEventListener("click", closeEquipModal);
document.getElementById("equipModalBackdrop").addEventListener("click", (e) => {
  if (e.target.id === "equipModalBackdrop") closeEquipModal();
});
document.getElementById("equipModalAceptar").addEventListener("click", closeEquipModal);

function renderEquipDetails() {
  normalizeEquipState();
  const wrap = document.getElementById("equipDetails");
  wrap.innerHTML = "";
  EQUIPOS.filter((eq) => equipState[eq.id] && equipState[eq.id].length).forEach((eq) => {
    const items = equipState[eq.id];

    items.forEach((st, idx) => {
      const card = document.createElement("div");
      card.className = "card equip-card";
      const titulo = items.length > 1 ? `${eq.icon} ${eq.label} ${idx + 1}` : `${eq.icon} ${eq.label}`;

      const thumbsHtml = st.fotos.map((f, i) => `
        <div class="photo-thumb">
          <img src="${f}" />
          <button type="button" class="thumb-remove" data-idx="${i}">✕</button>
        </div>
      `).join("");

      card.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px">
          <h3 style="margin:0">${titulo}</h3>
          <button type="button" class="remove-x" data-role="quitarInstancia" title="Quitar este equipo">🗑</button>
        </div>
        <div class="field">
          <label>Número de activo fijo</label>
          <input type="text" data-role="activoFijo" placeholder="Ej: AF-00123" value="${st.activoFijo || ""}" />
        </div>
        <div class="field">
          <label>Fotos del equipo (${st.fotos.length})</label>
          <div class="photo-gallery">
            ${thumbsHtml}
            <label class="photo-btn">
              <span>📷</span>
              <input type="file" accept="image/*" capture="environment" data-role="foto" />
            </label>
          </div>
        </div>
        <div class="field">
          <label>Actividad realizada</label>
          <textarea data-role="actividad" placeholder="Ej: limpieza interna, cambio de pasta térmica, revisión de cables...">${st.actividad}</textarea>
        </div>
        <div class="switch-row">
          <label>Está para cambio</label>
          <div class="toggle ${st.paraCambio ? "on" : ""}" data-role="toggle"></div>
        </div>
        <div class="field" data-role="detalleWrap" style="${st.paraCambio ? "" : "display:none"}; margin-top:8px">
          <label>Detalle de lo que está para cambio</label>
          <textarea data-role="detalle" placeholder="Ej: teclado con teclas pegadas, requiere reemplazo">${st.detalleCambio}</textarea>
        </div>
      `;
      card.querySelector('[data-role="quitarInstancia"]').addEventListener("click", () => {
        items.splice(idx, 1);
        if (items.length === 0) delete equipState[eq.id];
        updateEquipSummary();
        renderEquipDetails();
        saveDraft();
      });
      card.querySelector('[data-role="activoFijo"]').addEventListener("input", (e) => {
        st.activoFijo = e.target.value;
        saveDraft();
      });
      card.querySelector('[data-role="foto"]').addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const compressed = await compressImage(file);
        st.fotos.push(compressed);
        renderEquipDetails();
        saveDraft();
      });
      card.querySelectorAll(".thumb-remove").forEach((btn) => {
        btn.addEventListener("click", () => {
          st.fotos.splice(Number(btn.dataset.idx), 1);
          renderEquipDetails();
          saveDraft();
        });
      });
      card.querySelector('[data-role="actividad"]').addEventListener("input", (e) => {
        st.actividad = e.target.value;
        saveDraft();
      });
      const toggle = card.querySelector('[data-role="toggle"]');
      toggle.addEventListener("click", () => {
        st.paraCambio = !st.paraCambio;
        renderEquipDetails();
        saveDraft();
      });
      const detalleTa = card.querySelector('[data-role="detalle"]');
      if (detalleTa) {
        detalleTa.addEventListener("input", (e) => {
          st.detalleCambio = e.target.value;
          saveDraft();
        });
      }
      wrap.appendChild(card);
    });
  });
}

/* ============ Calendario desplegable ============ */
const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
let calViewDate = new Date();

function pad2(n) { return String(n).padStart(2, "0"); }
function fechaToISO(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function fechaLabel(d) { return `${d.getDate()} de ${MESES[d.getMonth()].toLowerCase()} de ${d.getFullYear()}`; }

function setFecha(d) {
  document.getElementById("f-fecha").value = fechaToISO(d);
  document.getElementById("fechaLabel").textContent = fechaLabel(d);
}

function renderCalendar() {
  document.getElementById("calMonthLabel").textContent = `${MESES[calViewDate.getMonth()]} ${calViewDate.getFullYear()}`;
  const grid = document.getElementById("calGrid");
  grid.innerHTML = "";

  const year = calViewDate.getFullYear();
  const month = calViewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const selected = document.getElementById("f-fecha").value;
  const todayISO = fechaToISO(new Date());

  for (let i = 0; i < firstDay; i++) {
    grid.appendChild(document.createElement("span"));
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month, day);
    const iso = fechaToISO(d);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = day;
    btn.className = "cal-day" + (iso === selected ? " selected" : "") + (iso === todayISO ? " today" : "");
    btn.addEventListener("click", () => {
      setFecha(d);
      document.getElementById("calModalBackdrop").classList.remove("show");
      saveDraft();
    });
    grid.appendChild(btn);
  }
}
document.getElementById("f-fecha-btn").addEventListener("click", () => {
  const current = document.getElementById("f-fecha").value;
  calViewDate = current ? new Date(current + "T00:00:00") : new Date();
  renderCalendar();
  document.getElementById("calModalBackdrop").classList.add("show");
});
document.getElementById("calModalBackdrop").addEventListener("click", (e) => {
  if (e.target.id === "calModalBackdrop") e.currentTarget.classList.remove("show");
});
document.getElementById("calPrev").addEventListener("click", () => {
  calViewDate = new Date(calViewDate.getFullYear(), calViewDate.getMonth() - 1, 1);
  renderCalendar();
});
document.getElementById("calNext").addEventListener("click", () => {
  calViewDate = new Date(calViewDate.getFullYear(), calViewDate.getMonth() + 1, 1);
  renderCalendar();
});
document.getElementById("calHoy").addEventListener("click", () => {
  setFecha(new Date());
  document.getElementById("calModalBackdrop").classList.remove("show");
  saveDraft();
});

/* ============ Firma en pantalla ============ */
let sigCtx, drawing = false, sigHasContent = false;
function initSigPad() {
  const canvas = document.getElementById("sigPad");
  const ratio = window.devicePixelRatio || 1;
  canvas.width = canvas.offsetWidth * ratio;
  canvas.height = canvas.offsetHeight * ratio;
  sigCtx = canvas.getContext("2d");
  sigCtx.scale(ratio, ratio);
  sigCtx.lineWidth = 2.2;
  sigCtx.lineCap = "round";
  sigCtx.strokeStyle = "#12181f";

  const pos = (e) => {
    const rect = canvas.getBoundingClientRect();
    const p = e.touches ? e.touches[0] : e;
    return { x: p.clientX - rect.left, y: p.clientY - rect.top };
  };
  const start = (e) => { drawing = true; const p = pos(e); sigCtx.beginPath(); sigCtx.moveTo(p.x, p.y); };
  const move = (e) => {
    if (!drawing) return;
    e.preventDefault();
    const p = pos(e);
    sigCtx.lineTo(p.x, p.y);
    sigCtx.stroke();
    sigHasContent = true;
  };
  const end = () => { drawing = false; saveDraft(); };

  canvas.addEventListener("mousedown", start);
  canvas.addEventListener("mousemove", move);
  window.addEventListener("mouseup", end);
  canvas.addEventListener("touchstart", start, { passive: true });
  canvas.addEventListener("touchmove", move, { passive: false });
  canvas.addEventListener("touchend", end);

  document.getElementById("sigClear").addEventListener("click", () => {
    sigCtx.clearRect(0, 0, canvas.width, canvas.height);
    sigHasContent = false;
  });
}
function getSigDataUrl() {
  if (!sigHasContent) return null;
  return document.getElementById("sigPad").toDataURL("image/png");
}

/* ============ Guardar reporte ============ */
function resetForm() {
  clearDraft();
  document.getElementById("f-pdv").value = "";
  document.getElementById("f-tecnico").value = "";
  setFecha(new Date());
  equipState = {};
  firmaFotoPapel = null;
  selloFoto = null;
  updateEquipSummary();
  renderEquipDetails();
  document.getElementById("btnFotoFirmaPapel").innerHTML =
    `<span>📷</span><input type="file" accept="image/*" capture="environment" id="inpFotoFirmaPapel" />`;
  document.getElementById("btnFotoSello").innerHTML =
    `<span>📷</span><input type="file" accept="image/*" capture="environment" id="inpFotoSello" />`;
  document.getElementById("inpFotoFirmaPapel").addEventListener("change", handleFirmaPapelChange);
  document.getElementById("inpFotoSello").addEventListener("change", handleSelloChange);
  const canvas = document.getElementById("sigPad");
  sigCtx && sigCtx.clearRect(0, 0, canvas.width, canvas.height);
  sigHasContent = false;
}
async function handleFirmaPapelChange(e) {
  const file = e.target.files[0];
  if (!file) return;
  firmaFotoPapel = await compressImage(file);
  document.getElementById("btnFotoFirmaPapel").innerHTML = `<img src="${firmaFotoPapel}" /><input type="file" accept="image/*" capture="environment" id="inpFotoFirmaPapel" />`;
  document.getElementById("inpFotoFirmaPapel").addEventListener("change", handleFirmaPapelChange);
  saveDraft();
}
async function handleSelloChange(e) {
  const file = e.target.files[0];
  if (!file) return;
  selloFoto = await compressImage(file);
  document.getElementById("btnFotoSello").innerHTML = `<img src="${selloFoto}" /><input type="file" accept="image/*" capture="environment" id="inpFotoSello" />`;
  document.getElementById("inpFotoSello").addEventListener("change", handleSelloChange);
  saveDraft();
}

document.getElementById("btnGuardar").addEventListener("click", async () => {
  const pdv = document.getElementById("f-pdv").value.trim();
  const fecha = document.getElementById("f-fecha").value;
  const tecnico = document.getElementById("f-tecnico").value.trim();
  const equiposIds = Object.keys(equipState);
  const totalEquipos = equiposIds.reduce((sum, id) => sum + equipState[id].length, 0);

  if (!pdv) return toast("Falta el nombre del PDV");
  if (!fecha) return toast("Falta la fecha");
  if (totalEquipos === 0) return toast("Marca al menos un equipo");

  const report = {
    id: uid(),
    creado: Date.now(),
    pdv, fecha, tecnico,
    equipos: equiposIds.flatMap((id) => equipState[id].map((item) => ({ id, ...item }))),
    firmaDibujo: getSigDataUrl(),
    firmaFotoPapel,
    selloFoto,
    synced: false,
  };

  await dbPut(report);
  toast("Reporte guardado");
  resetForm();
  renderReportsList();
  trySync(report);
});

/* ============ Sincronización con Apps Script ============ */
function getScriptUrl() {
  return localStorage.getItem(LS_URL_KEY) || "";
}
const syncingIds = new Set(); // evita mandar el mismo reporte 2 veces a la vez

// Ya que un reporte se sincronizó, sus fotos quedaron a salvo en Drive/Sheet,
// así que se liberan del celular para no acumular espacio. Se conserva la
// cantidad y si tenía firma/sello, para que el Excel y la vista de detalle
// sigan mostrando esa info aunque la imagen en sí ya no esté en el celular.
function stripSyncedPhotos(report) {
  (report.equipos || []).forEach((eq) => {
    const fotos = eq.fotos || (eq.foto ? [eq.foto] : []);
    eq.fotosCount = fotos.length;
    eq.fotos = [];
    delete eq.foto;
  });
  report.firmaDibujoGuardada = !!report.firmaDibujo;
  report.firmaFotoPapelGuardada = !!report.firmaFotoPapel;
  report.selloFotoGuardada = !!report.selloFoto;
  report.firmaDibujo = null;
  report.firmaFotoPapel = null;
  report.selloFoto = null;
}

async function trySync(report) {
  const url = getScriptUrl();
  if (!url || !navigator.onLine) return;
  if (report.synced) return;
  if (syncingIds.has(report.id)) return; // ya se está enviando, no dupliques
  syncingIds.add(report.id);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" }, // evita preflight CORS
      body: JSON.stringify(report),
    });
    if (res.ok) {
      report.synced = true;
      stripSyncedPhotos(report);
      await dbPut(report);
      renderReportsList();
    }
  } catch (err) {
    // se queda pendiente, se reintenta luego
  } finally {
    syncingIds.delete(report.id);
  }
}
async function syncPending() {
  const all = await dbAll();
  const pending = all.filter((r) => !r.synced && !syncingIds.has(r.id));
  for (const r of pending) await trySync(r);
  document.getElementById("syncInfo").textContent =
    pending.length ? `Sincronizando ${pending.length} reporte(s) pendiente(s)...` : "Todo sincronizado.";
}

/* ============ Lista de reportes + vista previa ============ */
/* ============ Filtro de reportes ============ */
let activeFilter = null; // { pdv, desde, hasta } o null

function getFilteredReports(all) {
  if (!activeFilter) return all;
  return all.filter((r) => {
    if (activeFilter.pdv && !r.pdv.toLowerCase().includes(activeFilter.pdv.toLowerCase())) return false;
    if (activeFilter.desde && r.fecha < activeFilter.desde) return false;
    if (activeFilter.hasta && r.fecha > activeFilter.hasta) return false;
    return true;
  });
}
document.getElementById("btnAplicarFiltro").addEventListener("click", () => {
  const pdv = document.getElementById("filtroPdv").value.trim();
  const desde = document.getElementById("filtroDesde").value;
  const hasta = document.getElementById("filtroHasta").value;
  activeFilter = (pdv || desde || hasta) ? { pdv, desde, hasta } : null;
  renderReportsList();
  toast(activeFilter ? "Filtro aplicado" : "Sin filtro (no ingresaste nada)");
});
document.getElementById("btnLimpiarFiltro").addEventListener("click", () => {
  document.getElementById("filtroPdv").value = "";
  document.getElementById("filtroDesde").value = "";
  document.getElementById("filtroHasta").value = "";
  activeFilter = null;
  renderReportsList();
});

async function renderReportsList() {
  const list = document.getElementById("reportsList");
  const all = await dbAll();
  const filtrados = getFilteredReports(all);
  if (filtrados.length === 0) {
    list.innerHTML = `<div class="empty-state">${
      all.length === 0 ? "Aún no hay reportes guardados." : "No hay reportes que coincidan con el filtro."
    }</div>`;
    return;
  }
  list.innerHTML = "";
  filtrados.forEach((r) => {
    const item = document.createElement("div");
    item.className = "report-item";
    item.innerHTML = `
      <div class="info">
        <b>${r.pdv}</b>
        <span>${r.fecha} · ${r.equipos.length} equipo(s)</span>
      </div>
      <span class="status-pill ${r.synced ? "synced" : "pending"}">${r.synced ? "Sincronizado" : "Pendiente"}</span>
    `;
    item.addEventListener("click", () => showReportDetail(r));
    list.appendChild(item);
  });
}

function showReportDetail(r) {
  const counts = {};
  r.equipos.forEach((eq) => { counts[eq.id] = (counts[eq.id] || 0) + 1; });
  const seen = {};

  let html = `
    <div class="detail-block">
      <div class="detail-row"><b>PDV:</b> ${r.pdv}</div>
      <div class="detail-row"><b>Fecha:</b> ${r.fecha}</div>
      <div class="detail-row"><b>Técnico:</b> ${r.tecnico || "-"}</div>
      <div class="detail-row"><b>Estado:</b> ${r.synced ? "Sincronizado" : "Pendiente"}</div>
    </div>
  `;

  r.equipos.forEach((eq) => {
    const meta = EQUIPOS.find((e) => e.id === eq.id);
    seen[eq.id] = (seen[eq.id] || 0) + 1;
    const nombre = counts[eq.id] > 1
      ? `${meta ? meta.label : eq.id} ${seen[eq.id]}`
      : (meta ? meta.label : eq.id);
    const fotos = eq.fotos || (eq.foto ? [eq.foto] : []);
    const fotosCount = eq.fotosCount != null ? eq.fotosCount : fotos.length;
    let fotosHtml = "";
    if (fotos.length) {
      fotosHtml = `<div class="photo-gallery" style="margin-top:8px">${fotos.map((f) => `<div class="photo-thumb"><img src="${f}" /></div>`).join("")}</div>`;
    } else if (fotosCount > 0) {
      fotosHtml = `<p class="hint" style="margin:8px 0 0">📷 ${fotosCount} foto(s) — sincronizadas, ya se liberaron del celular (disponibles en Drive).</p>`;
    }

    html += `
      <div class="detail-equip-card">
        <h4>${meta ? meta.icon : ""} ${nombre}</h4>
        ${eq.activoFijo ? `<div class="detail-row"><b>Activo fijo:</b> ${eq.activoFijo}</div>` : ""}
        <div class="detail-row"><b>Actividad:</b> ${eq.actividad || "-"}</div>
        ${eq.paraCambio ? `<div class="detail-row warn"><b>Para cambio:</b> ${eq.detalleCambio || "Sí"}</div>` : ""}
        ${fotosHtml}
      </div>
    `;
  });

  html += `<div class="detail-block"><h4 style="margin:0 0 10px">Firma y sello</h4>`;
  if (r.firmaDibujo) html += `<div class="photo-thumb" style="width:140px; height:80px; background:#fff; display:inline-block; margin-right:8px"><img src="${r.firmaDibujo}" style="object-fit:contain" /></div>`;
  else if (r.firmaDibujoGuardada) html += `<p class="hint" style="margin:0 0 6px">✒️ Firma dibujada — sincronizada, ya no está en el celular.</p>`;
  if (r.firmaFotoPapel) html += `<div class="photo-thumb" style="width:100px; height:80px; display:inline-block; margin-right:8px"><img src="${r.firmaFotoPapel}" /></div>`;
  else if (r.firmaFotoPapelGuardada) html += `<p class="hint" style="margin:0 0 6px">📷 Foto de firma en papel — sincronizada, ya no está en el celular.</p>`;
  if (r.selloFoto) html += `<div class="photo-thumb" style="width:100px; height:80px; display:inline-block"><img src="${r.selloFoto}" /></div>`;
  else if (r.selloFotoGuardada) html += `<p class="hint" style="margin:0">📷 Foto del sello — sincronizada, ya no está en el celular.</p>`;
  if (!r.firmaDibujo && !r.firmaFotoPapel && !r.selloFoto && !r.firmaDibujoGuardada && !r.firmaFotoPapelGuardada && !r.selloFotoGuardada) {
    html += `<p class="hint" style="margin:0">Sin firma ni sello registrados.</p>`;
  }
  html += `</div>`;

  document.getElementById("detailModalTitle").textContent = `${r.pdv} — ${r.fecha}`;
  document.getElementById("detailModalBody").innerHTML = html;
  document.getElementById("detailModalBackdrop").classList.add("show");
}
document.getElementById("detailModalClose").addEventListener("click", () => {
  document.getElementById("detailModalBackdrop").classList.remove("show");
});
document.getElementById("detailModalBackdrop").addEventListener("click", (e) => {
  if (e.target.id === "detailModalBackdrop") e.currentTarget.classList.remove("show");
});

/* ============ Exportar reportes a Excel (día / todos) ============ */
function todayStr() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function reportsToRows(reportes) {
  const rows = [];
  reportes.forEach((r) => {
    const counts = {};
    r.equipos.forEach((eq) => { counts[eq.id] = (counts[eq.id] || 0) + 1; });
    const seen = {};
    r.equipos.forEach((eq) => {
      const meta = EQUIPOS.find((e) => e.id === eq.id);
      seen[eq.id] = (seen[eq.id] || 0) + 1;
      const nombreEquipo = counts[eq.id] > 1
        ? `${meta ? meta.label : eq.id} ${seen[eq.id]}`
        : (meta ? meta.label : eq.id);
      rows.push({
        "PDV": r.pdv,
        "Fecha": r.fecha,
        "Técnico": r.tecnico || "",
        "Equipo": nombreEquipo,
        "Activo fijo": eq.activoFijo || "",
        "Actividad realizada": eq.actividad || "",
        "Para cambio": eq.paraCambio ? "Sí" : "No",
        "Detalle de cambio": eq.detalleCambio || "",
        "Fotos tomadas": eq.fotosCount != null ? eq.fotosCount : (eq.fotos || (eq.foto ? [eq.foto] : [])).length,
        "Firma": (r.firmaDibujo || r.firmaFotoPapel || r.firmaDibujoGuardada || r.firmaFotoPapelGuardada) ? "Sí" : "No",
        "Sello": (r.selloFoto || r.selloFotoGuardada) ? "Sí" : "No",
        "Sincronizado": r.synced ? "Sí" : "Pendiente",
      });
    });
  });
  return rows;
}
function writeExcel(rows, filename) {
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [
    { wch: 16 }, { wch: 11 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 40 },
    { wch: 12 }, { wch: 30 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 13 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Reportes");
  XLSX.writeFile(wb, filename);
}
async function exportDayExcel() {
  const all = await dbAll();
  const hoy = todayStr();
  const deHoy = all.filter((r) => r.fecha === hoy);
  if (deHoy.length === 0) return toast("No hay reportes de hoy para exportar");
  writeExcel(reportsToRows(deHoy), `mantenimientos_${hoy}.xlsx`);
}
async function exportAllExcel() {
  const all = await dbAll();
  if (all.length === 0) return toast("No hay reportes guardados en este celular todavía");
  writeExcel(reportsToRows(all), `mantenimientos_TODOS_${todayStr()}.xlsx`);
}
async function exportFilterExcel() {
  if (!activeFilter) return toast("Aplica un filtro primero (PDV o fechas)");
  const all = await dbAll();
  const filtrados = getFilteredReports(all);
  if (filtrados.length === 0) return toast("No hay reportes que coincidan con el filtro");
  writeExcel(reportsToRows(filtrados), `mantenimientos_filtro_${todayStr()}.xlsx`);
}
document.getElementById("btnExportExcelDia").addEventListener("click", exportDayExcel);
document.getElementById("btnExportExcelFiltro").addEventListener("click", exportFilterExcel);
document.getElementById("btnExportExcelTodo").addEventListener("click", exportAllExcel);

/* ============ Navegación por pestañas ============ */
document.querySelectorAll("nav.tabbar button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("nav.tabbar button").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("view-" + btn.dataset.view).classList.add("active");
    if (btn.dataset.view === "reportes") renderReportsList();
    if (btn.dataset.view === "ajustes") updateStorageInfo();
  });
});

/* ============ Ajustes ============ */
document.getElementById("f-scripturl").value = getScriptUrl();
document.getElementById("btnGuardarUrl").addEventListener("click", () => {
  localStorage.setItem(LS_URL_KEY, document.getElementById("f-scripturl").value.trim());
  toast("URL guardada");
  syncPending();
});
document.getElementById("btnResync").addEventListener("click", syncPending);

document.getElementById("btnBorrarSincronizados").addEventListener("click", async () => {
  const all = await dbAll();
  const sincronizados = all.filter((r) => r.synced);
  if (sincronizados.length === 0) {
    return toast("No hay reportes sincronizados para borrar");
  }
  const confirmar = window.confirm(
    `Vas a borrar ${sincronizados.length} reporte(s) ya sincronizado(s) de este celular. ` +
    `Ya están seguros en tu Google Sheet y Drive; esto solo libera espacio local. ¿Continuar?`
  );
  if (!confirmar) return;
  for (const r of sincronizados) await dbDelete(r.id);
  toast(`${sincronizados.length} reporte(s) borrado(s) de este celular`);
  renderReportsList();
  updateStorageInfo();
});

async function updateStorageInfo() {
  const all = await dbAll();
  const pendientes = all.filter((r) => !r.synced).length;
  const sincronizados = all.length - pendientes;
  document.getElementById("storageInfo").textContent =
    `En este celular: ${all.length} reporte(s) guardado(s) — ${pendientes} pendiente(s), ${sincronizados} sincronizado(s).`;
}

/* ============ Estado de red ============ */
function updateNetStatus() {
  const el = document.getElementById("netStatus");
  const online = navigator.onLine;
  el.textContent = online ? "EN LÍNEA" : "SIN CONEXIÓN";
  el.className = "net " + (online ? "online" : "offline");
  if (online) syncPending();
}
window.addEventListener("online", updateNetStatus);
window.addEventListener("offline", updateNetStatus);

/* ============ Init ============ */
setFecha(new Date());
document.getElementById("dateNow").textContent = new Date().toLocaleDateString("es-CO", {
  weekday: "long", day: "numeric", month: "long",
});
updateEquipSummary();
initSigPad();
updateNetStatus();
renderReportsList();
document.getElementById("inpFotoFirmaPapel").addEventListener("change", handleFirmaPapelChange);
document.getElementById("inpFotoSello").addEventListener("change", handleSelloChange);
document.getElementById("f-pdv").addEventListener("input", saveDraft);
document.getElementById("f-tecnico").addEventListener("input", saveDraft);
setInterval(() => { if (navigator.onLine) syncPending(); }, 60000);
checkForDraft();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
