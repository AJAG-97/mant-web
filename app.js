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

/* ============ Render checklist de equipos ============ */
function renderEquipGrid() {
  const grid = document.getElementById("equipGrid");
  grid.innerHTML = "";
  EQUIPOS.forEach((eq) => {
    const chip = document.createElement("label");
    chip.className = "equip-chip";
    chip.innerHTML = `<input type="checkbox" data-id="${eq.id}" /> ${eq.icon} ${eq.label}`;
    const cb = chip.querySelector("input");
    cb.addEventListener("change", () => {
      chip.classList.toggle("active", cb.checked);
      if (cb.checked) {
        equipState[eq.id] = equipState[eq.id] || {
          activo: true, foto: null, actividad: "", paraCambio: false, detalleCambio: "",
        };
      } else {
        delete equipState[eq.id];
      }
      renderEquipDetails();
    });
    grid.appendChild(chip);
  });
}

function renderEquipDetails() {
  const wrap = document.getElementById("equipDetails");
  wrap.innerHTML = "";
  EQUIPOS.filter((eq) => equipState[eq.id]).forEach((eq) => {
    const st = equipState[eq.id];
    const card = document.createElement("div");
    card.className = "card equip-card";
    card.innerHTML = `
      <h3>${eq.icon} ${eq.label}</h3>
      <div class="photo-row">
        <label class="photo-btn">
          ${st.foto ? `<img src="${st.foto}" />` : "📷"}
          <input type="file" accept="image/*" capture="environment" data-role="foto" />
        </label>
        <div class="photo-meta">Foto del equipo</div>
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
    card.querySelector('[data-role="foto"]').addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      st.foto = await compressImage(file);
      renderEquipDetails();
    });
    card.querySelector('[data-role="actividad"]').addEventListener("input", (e) => {
      st.actividad = e.target.value;
    });
    const toggle = card.querySelector('[data-role="toggle"]');
    toggle.addEventListener("click", () => {
      st.paraCambio = !st.paraCambio;
      renderEquipDetails();
    });
    const detalleTa = card.querySelector('[data-role="detalle"]');
    if (detalleTa) {
      detalleTa.addEventListener("input", (e) => {
        st.detalleCambio = e.target.value;
      });
    }
    wrap.appendChild(card);
  });
}

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
  const end = () => (drawing = false);

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
  document.getElementById("f-pdv").value = "";
  document.getElementById("f-tecnico").value = "";
  document.getElementById("f-fecha").valueAsDate = new Date();
  equipState = {};
  firmaFotoPapel = null;
  selloFoto = null;
  document.querySelectorAll(".equip-chip").forEach((c) => {
    c.classList.remove("active");
    c.querySelector("input").checked = false;
  });
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
}
async function handleSelloChange(e) {
  const file = e.target.files[0];
  if (!file) return;
  selloFoto = await compressImage(file);
  document.getElementById("btnFotoSello").innerHTML = `<img src="${selloFoto}" /><input type="file" accept="image/*" capture="environment" id="inpFotoSello" />`;
  document.getElementById("inpFotoSello").addEventListener("change", handleSelloChange);
}

document.getElementById("btnGuardar").addEventListener("click", async () => {
  const pdv = document.getElementById("f-pdv").value.trim();
  const fecha = document.getElementById("f-fecha").value;
  const tecnico = document.getElementById("f-tecnico").value.trim();
  const equipos = Object.keys(equipState);

  if (!pdv) return toast("Falta el nombre del PDV");
  if (!fecha) return toast("Falta la fecha");
  if (equipos.length === 0) return toast("Marca al menos un equipo");

  const report = {
    id: uid(),
    creado: Date.now(),
    pdv, fecha, tecnico,
    equipos: equipos.map((id) => ({ id, ...equipState[id] })),
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
async function trySync(report) {
  const url = getScriptUrl();
  if (!url || !navigator.onLine) return;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" }, // evita preflight CORS
      body: JSON.stringify(report),
    });
    if (res.ok) {
      report.synced = true;
      await dbPut(report);
      renderReportsList();
    }
  } catch (err) {
    // se queda pendiente, se reintenta luego
  }
}
async function syncPending() {
  const all = await dbAll();
  const pending = all.filter((r) => !r.synced);
  for (const r of pending) await trySync(r);
  document.getElementById("syncInfo").textContent =
    pending.length ? `Sincronizando ${pending.length} reporte(s) pendiente(s)...` : "Todo sincronizado.";
}

/* ============ Lista de reportes + exportar PDF ============ */
async function renderReportsList() {
  const list = document.getElementById("reportsList");
  const all = await dbAll();
  if (all.length === 0) {
    list.innerHTML = `<div class="empty-state">Aún no hay reportes guardados.</div>`;
    return;
  }
  list.innerHTML = "";
  all.forEach((r) => {
    const item = document.createElement("div");
    item.className = "report-item";
    item.innerHTML = `
      <div class="info">
        <b>${r.pdv}</b>
        <span>${r.fecha} · ${r.equipos.length} equipo(s)</span>
      </div>
      <span class="status-pill ${r.synced ? "synced" : "pending"}">${r.synced ? "Sincronizado" : "Pendiente"}</span>
    `;
    item.addEventListener("click", () => exportPDF(r));
    list.appendChild(item);
  });
}

function exportPDF(r) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const marginX = 40;
  let y = 50;

  doc.setFontSize(16);
  doc.text("Reporte de mantenimiento", marginX, y);
  y += 24;
  doc.setFontSize(11);
  doc.text(`PDV: ${r.pdv}`, marginX, y); y += 16;
  doc.text(`Fecha: ${r.fecha}`, marginX, y); y += 16;
  doc.text(`Técnico: ${r.tecnico || "-"}`, marginX, y); y += 24;

  r.equipos.forEach((eq) => {
    if (y > 700) { doc.addPage(); y = 50; }
    const meta = EQUIPOS.find((e) => e.id === eq.id);
    doc.setFontSize(13);
    doc.text(`${meta ? meta.label : eq.id}`, marginX, y);
    y += 16;
    doc.setFontSize(10);
    const actividad = doc.splitTextToSize(`Actividad: ${eq.actividad || "-"}`, 500);
    doc.text(actividad, marginX, y);
    y += actividad.length * 12 + 4;
    if (eq.paraCambio) {
      const cambio = doc.splitTextToSize(`Para cambio: ${eq.detalleCambio || "sí"}`, 500);
      doc.text(cambio, marginX, y);
      y += cambio.length * 12 + 4;
    }
    if (eq.foto) {
      if (y > 620) { doc.addPage(); y = 50; }
      try { doc.addImage(eq.foto, "JPEG", marginX, y, 140, 105); y += 115; } catch (e) {}
    }
    y += 10;
  });

  if (y > 600) { doc.addPage(); y = 50; }
  doc.setFontSize(13);
  doc.text("Firma y sello", marginX, y);
  y += 12;
  if (r.firmaDibujo) {
    try { doc.addImage(r.firmaDibujo, "PNG", marginX, y, 160, 70); } catch (e) {}
  }
  if (r.selloFoto) {
    try { doc.addImage(r.selloFoto, "JPEG", marginX + 180, y, 100, 70); } catch (e) {}
  }
  y += 80;
  if (r.firmaFotoPapel) {
    if (y > 600) { doc.addPage(); y = 50; }
    try { doc.addImage(r.firmaFotoPapel, "JPEG", marginX, y, 200, 140); } catch (e) {}
  }

  doc.save(`mantenimiento_${r.pdv.replace(/\s+/g, "_")}_${r.fecha}.pdf`);
}

/* ============ Navegación por pestañas ============ */
document.querySelectorAll("nav.tabbar button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("nav.tabbar button").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("view-" + btn.dataset.view).classList.add("active");
    if (btn.dataset.view === "reportes") renderReportsList();
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
document.getElementById("f-fecha").valueAsDate = new Date();
document.getElementById("dateNow").textContent = new Date().toLocaleDateString("es-CO", {
  weekday: "long", day: "numeric", month: "long",
});
renderEquipGrid();
initSigPad();
updateNetStatus();
renderReportsList();
document.getElementById("inpFotoFirmaPapel").addEventListener("change", handleFirmaPapelChange);
document.getElementById("inpFotoSello").addEventListener("change", handleSelloChange);
setInterval(() => { if (navigator.onLine) syncPending(); }, 60000);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
