(function checkAuthOnLoad() {
  const token = localStorage.getItem("admin_token");
  if (!token) { window.location.href = "index.html"; return; }
})();

// ── Initialisation ──────────────────────────────────────
let currentPage   = "dashboard";
let leafletMap    = null;
let allCollectes  = [];
let chartEvol     = null;
let allDemandes   = [];
let allEmployees  = [];
let currentServiceId = null;
let currentProfessionalServiceId = null;
let serviceReservationsMap = null;
let allProfessionals = [];
let allServicesForFilter = [];



// ── Helpers UI  ───────────────────────────
function loading(el) {
  if (typeof el === "string") el = document.getElementById(el);
  if (el) el.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;padding:32px;color:rgba(255,255,255,0.3);gap:10px"><span style="animation:spin 1s linear infinite;font-size:18px">⟳</span> Chargement...</div>`;
}
function statusBadge(s) {
  const m = {"reçue":"#4FC3F7","en_traitement":"#CE93D8","en_lavage":"#4FC3F7","en_repassage":"#FFCC80","prête":"#80CBC4","livrée":"#80CBC4","annulée":"#EF9A9A","en_attente":"#FFCC80","validée":"#80CBC4","rejetée":"#EF9A9A","confirmée":"#4FC3F7","en_route":"#CE93D8","collectée":"#80CBC4","soldée":"#80CBC4","ouverte":"#4FC3F7","offre_envoyee":"#FFCC80","acceptée":"#80CBC4","fermée":"#9E9E9E"};
  const c = m[s]||"#9E9E9E";
  return `<span style="background:${c}22;color:${c};border:1px solid ${c}55;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700">${s||"—"}</span>`;
}
function roleBadge(r) {
  const m = {"admin":"#CE93D8","super_admin":"#EF9A9A","client":"#4FC3F7"};
  const c = m[r]||"#9E9E9E";
  return `<span style="background:${c}22;color:${c};border:1px solid ${c}55;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700">${r||"—"}</span>`;
}
function updateBadge(id, n) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = n; el.style.display = n > 0 ? "inline" : "none";
}
function openModal(html) {
  let m = document.getElementById("_modal");
  if (!m) {
    m = document.createElement("div");
    m.id = "_modal";
    m.style.cssText = "position:fixed;inset:0;background:rgba(7,12,36,0.88);z-index:500;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px)";
    m.addEventListener("click", e => { if (e.target === m) closeModal(); });
    document.body.appendChild(m);
  }
  m.innerHTML = html; m.style.display = "flex";
}
function closeModal() {
  const m = document.getElementById("_modal");
  if (m) m.style.display = "none";
}
function setActiveNav(page) {
  document.querySelectorAll(".nav-item").forEach(el => el.classList.toggle("active", el.dataset.page === page));
}
function initUserInfo() {
  const u = getUser(); // fournie par api.js
  const n = document.getElementById("sidebar-user-name");
  const r = document.getElementById("sidebar-user-role");
  const a = document.getElementById("sidebar-user-avatar");
  if (n) n.textContent = u.name || "Admin";
  if (r) r.textContent = u.role === "super_admin" ? "Super Admin" : "Admin";
  if (a) a.textContent = (u.name||"A").substring(0,2).toUpperCase();
}
function logout() { localStorage.clear(); window.location.href = "index.html"; }
function escapeHtml(text) {
  if (!text) return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// ── Navigation ───────────────────────────────────────────
const PAGE_LOADERS = {
  dashboard: loadDashboard,
  commandes: loadCommandes,
  collectes: loadCollectes,
  depots: () => loadDepots("en_attente"),
  messagerie: loadMessagerie,
  clients: loadClients,
  tarifs: loadTarifs,
  parrainage: loadParrainage,
  rapports: loadRapport,
  carte: initMap,
  notifications: () => {},
  audit: loadAudit,
  "admin-services": loadAdminServices,
  "service-reservations": loadServiceReservations,
  "admin-professionals": loadProfessionals,
  "commandes-detail": loadCommandesDetail,
};

const PAGE_TITLES = {
  dashboard:"Tableau de bord",
  commandes:"Commandes",
  collectes:"Collectes",
  depots:"Dépôts & Paiements",
  messagerie:"Messagerie Négociation",
  clients:"Gestion Clients",
  tarifs:"Tarifs & Offres",
  parrainage:"Parrainage",
  rapports:"Rapports Financiers",
  carte:"Carte des Collectes",
  notifications:"Notifications",
  audit:"Journal d'Activité",
  "admin-services": "Gestion des services",
  "service-reservations": "Réservations de services",
  "admin-professionals": "Gestion des professionnels",
  "commandes-detail": "Commandes détaillées",
};

function showPage(page) {
  document.querySelectorAll("[id^='page-']").forEach(el => el.style.display = "none");
  const el = document.getElementById(`page-${page}`);
  if (el) el.style.display = "block";
  setActiveNav(page); currentPage = page;
  const t = document.getElementById("topbar-title");
  if (t) t.textContent = PAGE_TITLES[page] || page;
  if (PAGE_LOADERS[page]) PAGE_LOADERS[page]();
}
function refreshCurrent() {
  const ic = document.getElementById("refreshIcon");
  if (ic) ic.style.animation = "spin 1s linear infinite";
  setTimeout(() => { if (ic) ic.style.animation = ""; }, 1200);
  showPage(currentPage);
}


// 1. DASHBOARD

async function loadDashboard() {
  loading("stats-grid");
  try {
    const data = await apiGet("/admin/dashboard");
    if (!data) return;
    const s = data.stats || {};

    updateBadge("badge-depots",    s.depots_en_attente || 0);
    updateBadge("badge-msg",       s.messages_non_lus || 0);
    updateBadge("badge-commandes", s.commandes_en_cours || 0);
    const dot = document.getElementById("notif-dot");
    if (dot) dot.style.display = (s.depots_en_attente > 0 || s.messages_non_lus > 0) ? "block" : "none";

    const grid = document.getElementById("stats-grid");
    if (grid) grid.innerHTML = `
      ${sc("fa-users",          s.total_clients||0,         "Clients",           "",                     "#4FC3F7")}
      ${sc("fa-box",            s.total_commandes||0,       "Commandes",         `${s.commandes_en_cours||0} en cours`, "#CE93D8")}
      ${sc("fa-money-bill",     formatFCFA(s.ca_mois_fcfa||0), "CA du mois",    `Auj: ${formatFCFA(s.ca_jour_fcfa||0)}`, "#80CBC4")}
      ${sc("fa-truck",          s.collectes_aujourd_hui||0, "Collectes auj.",    "",                     "#FFCC80")}
      ${sc("fa-clock",          s.depots_en_attente||0,     "Dépôts en attente","À valider",             "#EF9A9A")}
      ${sc("fa-comments",       s.messages_non_lus||0,      "Messages non lus", "Négociations",          "#4FC3F7")}
      ${sc("fa-piggy-bank",     formatFCFA(s.depots_mois_fcfa||0), "Dépôts validés","Ce mois",           "#80CBC4")}
    `;

    buildEvolutionChart(data.evolution_7j || []);

    const depEl = document.getElementById("dash-depots");
    if (depEl) {
      const deps = data.depots_en_attente || [];
      depEl.innerHTML = deps.length === 0
        ? `<div style="color:rgba(255,255,255,0.3);padding:20px;text-align:center">✅ Aucun dépôt en attente</div>`
        : deps.map(d => `
          <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06)">
            <div style="flex:1">
              <div style="font-size:13px;font-weight:600">${d.client||"?"}</div>
              <div style="font-size:11px;color:rgba(255,255,255,0.4)">${(d.operateur||"").replace("_"," ")} · ${formatDate(d.created_at)}</div>
            </div>
            <div style="font-weight:700;color:#FFCC80">${formatFCFA(d.montant)}</div>
            <button class="btn btn-success btn-sm" onclick="validerDepot(${d.id})">✓</button>
            <button class="btn btn-danger btn-sm" onclick="rejeterDepot(${d.id})">✗</button>
          </div>`).join("");
    }

    const cmdEl = document.getElementById("dash-commandes");
    if (cmdEl) {
      const cmds = data.dernieres_commandes || [];
      cmdEl.innerHTML = cmds.length === 0
        ? `<div style="color:rgba(255,255,255,0.3);padding:20px;text-align:center">Aucune commande</div>`
        : cmds.map(c => `
          <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);cursor:pointer" onclick="openCmdModal(${c.id})">
            <div style="flex:1">
              <div style="font-size:13px;font-weight:600">${c.client||"?"}</div>
              <div style="font-size:11px;color:rgba(255,255,255,0.4)">#${c.id} · ${formatDate(c.created_at)}</div>
            </div>
            <div style="font-size:12px">${formatFCFA(c.montant)}</div>
            ${statusBadge(c.status)}
          </div>`).join("");
    }
  } catch(e) {
    toast(e.message, "error");
    const grid = document.getElementById("stats-grid");
    if (grid) grid.innerHTML = `<div style="color:#EF9A9A;padding:20px">❌ ${e.message}</div>`;
  }
}
function sc(icon, val, label, sub, color) {
  return `<div class="stat-card">
    <div class="stat-header">
      <div class="stat-icon" style="background:${color}22;color:${color}"><i class="fas ${icon}"></i></div>
      <div class="stat-label">${label}</div>
    </div>
    <div class="stat-value" style="color:${color}">${val}</div>
    ${sub ? `<div class="stat-sub">${sub}</div>` : ""}
  </div>`;
}
function buildEvolutionChart(data) {
  if (!window.Chart) return;
  const ctx = document.getElementById("chart-evolution");
  if (!ctx) return;
  if (chartEvol) { chartEvol.destroy(); chartEvol = null; }
  chartEvol = new Chart(ctx.getContext("2d"), {
    type: "line",
    data: {
      labels: data.map(d => (d.date||"").substring(5)),
      datasets: [
        { label:"CA (FCFA)", data: data.map(d => d.ca||0), borderColor:"#4FC3F7", backgroundColor:"rgba(79,195,247,0.1)", fill:true, tension:0.4 },
        { label:"Commandes", data: data.map(d => d.commandes||0), borderColor:"#CE93D8", backgroundColor:"rgba(206,147,216,0.1)", fill:true, tension:0.4, yAxisID:"y2" }
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ labels:{ color:"#fff", font:{ size:11 } } } },
      scales:{
        x:{ ticks:{ color:"#ffffff60" }, grid:{ color:"#ffffff10" } },
        y:{ ticks:{ color:"#ffffff60" }, grid:{ color:"#ffffff10" } },
        y2:{ position:"right", ticks:{ color:"#CE93D8" }, grid:{ display:false } }
      }
    }
  });
}


// 2. COMMANDES

async function loadCommandes() {
  const el = document.getElementById("table-commandes");
  loading(el);
  try {
    const status = document.getElementById("filter-cmd-status")?.value || "";
    const data = await apiGet(`/admin/commandes${status ? "?status=" + status : ""}`);
    if (!data) return;
    if (!data.length) { el.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i><p>Aucune commande</p></div>'; return; }
    el.innerHTML = `<table class="data-table">
      <thead>
        <tr><th>#</th><th>Client</th><th>Articles</th><th>Total</th><th>Statut</th><th>Facture</th><th>Date</th><th>Actions</th></tr>
      </thead>
      <tbody>${data.map(c => `
        <tr>
          <td><b>#${c.id}</b></td>
          <td>${c.client_name||"?"}<br><small style="color:#9E9E9E">${c.client_email||""}</small></td>
          <td>${c.nb_articles||0} art.</td>
          <td style="color:#4FC3F7">${formatFCFA(c.total||0)}</td>
          <td>${statusBadge(c.status)}</td>
          <td>${c.facture ? statusBadge(c.facture.status) : '<span style="color:#9E9E9E;font-size:11px">Aucune</span>'}</td>
          <td style="color:#9E9E9E;font-size:12px">${formatDate(c.created_at)}</td>
          <td style="display:flex;gap:6px">
            <button class="btn btn-outline btn-sm" onclick="openCmdModal(${c.id})">👁</button>
            ${!c.facture ? `<button class="btn btn-success btn-sm" onclick="genererFacture(${c.id})" title="Générer facture">🧾</button>` : ""}
           </td>
        </tr>
      `).join("")}</tbody>
    </table>`;
  } catch(e) { toast(e.message, "error"); }
}

async function openCmdModal(id) {
  openModal(`<div class="modal"><div style="padding:20px;text-align:center">Chargement...</div></div>`);
  try {
    const c = await apiGet(`/admin/commandes/${id}`);
    if (!c) { closeModal(); return; }
    openModal(`<div class="modal">
      <div class="modal-header">
        <div>
          <div class="modal-title">Commande #${c.id}</div>
          <div style="font-size:12px;color:#9E9E9E">${c.client?.name||"?"} · ${formatDateTime(c.created_at)}</div>
        </div>
        <button class="modal-close" onclick="closeModal()">✕</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
        <div>
          <div class="input-label">Changer le statut</div>
          <select id="cmd-status-sel" class="input">
            ${["reçue","en_traitement","en_lavage","en_repassage","prête","livrée","annulée"].map(s =>
              `<option value="${s}" ${s===c.status?"selected":""}>${s}</option>`).join("")}
          </select>
        </div>
        <div>
          <div class="input-label">Note admin</div>
          <input type="text" id="cmd-note-inp" class="input" value="${c.note_admin||""}" placeholder="Note interne...">
        </div>
      </div>
      <button class="btn btn-primary" onclick="updateCmdStatus(${c.id})" style="margin-bottom:16px">💾 Enregistrer</button>
      <div class="card-title" style="margin-bottom:8px">Articles (${c.items?.length||0})</div>
      ${(c.items||[]).map(item => `
        <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06)">
          <i class="fas fa-tshirt" style="color:#4FC3F7"></i>
          <div style="flex:1"><b>${item.designation||""}</b> × ${item.quantity||1}</div>
          <span style="color:#9E9E9E">${formatFCFA((item.price||0)*(item.quantity||1))}</span>
          <select onchange="updateArticleStatus(${c.id},${item.id},this.value)" class="input" style="width:130px;padding:4px 8px;font-size:11px">
            ${["collecté","en_lavage","en_repassage","prêt","livré"].map(s =>
              `<option value="${s}" ${s===item.status?"selected":""}>${s}</option>`).join("")}
          </select>
        </div>`).join("")}
      ${c.facture ? `
        <div style="margin-top:14px;padding:14px;background:rgba(79,195,247,0.08);border-radius:12px;border:1px solid rgba(79,195,247,0.2)">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
              <div style="font-weight:700">Facture ${statusBadge(c.facture.status)}</div>
              <div style="font-size:12px;color:#9E9E9E">
                Total: ${formatFCFA(c.facture.total)} · 
                Remise négo: ${formatFCFA(c.facture.remise_nego||0)}
              </div>
            </div>
          </div>
          ${c.facture.status !== "soldée" ? `
            <div style="margin-top:10px;display:flex;gap:8px">
              <button class="btn btn-outline btn-sm" onclick="ouvrirNegoAdmin(${c.facture.id})">💬 Ouvrir négociation</button>
            </div>` : ""}
        </div>` : `
        <div style="margin-top:12px">
          <button class="btn btn-primary" onclick="genererFacture(${c.id})">🧾 Générer la facture</button>
        </div>`}
      <div style="margin-top:14px">
        <div class="card-title" style="margin-bottom:6px">Historique</div>
        ${(c.historique||[]).map(h => `<div style="font-size:11px;color:#9E9E9E;padding:3px 0">${formatDateTime(h.date)}: ${h.old||"—"} → <b style="color:white">${h.new}</b></div>`).join("")||"<div style='color:#9E9E9E;font-size:11px'>Aucun</div>"}
      </div>
    </div>`);
  } catch(e) { toast(e.message, "error"); closeModal(); }
}

async function updateCmdStatus(id) {
  try {
    const status = document.getElementById("cmd-status-sel").value;
    const note   = document.getElementById("cmd-note-inp").value;
    await apiPut(`/admin/commandes/${id}/status`, { status, note_admin: note });
    toast("Statut mis à jour ✅"); closeModal(); loadCommandes();
  } catch(e) { toast(e.message, "error"); }
}
async function updateArticleStatus(cmdId, itemId, status) {
  try {
    await apiPut(`/admin/commandes/${cmdId}/articles/${itemId}/status?status=${encodeURIComponent(status)}`);
    toast("Article mis à jour");
  } catch(e) { toast(e.message, "error"); }
}
async function genererFacture(id) {
  try {
    const r = await apiPost(`/admin/commandes/${id}/facture`);
    toast(`✅ Facture générée — ${formatFCFA(r.total)}`);
    closeModal(); loadCommandes();
  } catch(e) { toast(e.message, "error"); }
}


// 3. COLLECTES

async function loadCollectes() {
  const el = document.getElementById("table-collectes");
  loading(el);
  try {
    const status = document.getElementById("filter-col-status")?.value || "";
    const data = await apiGet(`/admin/collectes${status ? "?status="+status : ""}`);
    if (!data) return;
    allCollectes = data;
    if (!data.length) { 
      el.innerHTML = '<div class="empty-state"><i class="fas fa-truck"></i><p>Aucune collecte</p></div>'; 
      return; 
    }
    
    el.innerHTML = `<table class="data-table">
      <thead>
        <tr><th>#</th><th>Client</th><th>Adresse</th><th>Articles</th><th>Créneau</th><th>Date</th><th>Statut</th><th>Actions</th></tr>
      </thead>
      <tbody>${data.map(c => `
        <tr>
          <td><b>#${c.id}</b></td>
          <td>${c.client?.name||"?"}<br><small style="color:#9E9E9E">${c.client?.phone||""}</small></td>
          <td>${c.adresse||"?"}<br><small style="color:#9E9E9E">${c.quartier||""}</small></td>
          <td style="font-size:11px;color:#80CBC4">${Array.isArray(c.articles_prevus) ? c.articles_prevus.join(", ") : (c.articles_prevus||"—")}</td>
          <td><span style="background:#4FC3F722;color:#4FC3F7;padding:2px 8px;border-radius:8px;font-size:11px">${c.creneau||"?"}</span></td>
          <td style="color:#9E9E9E;font-size:12px">${formatDate(c.scheduled_at)}</td>
          <td>${statusBadge(c.status)}</td>
          <td style="display:flex;gap:4px;flex-wrap:wrap">
            ${c.status === "en_attente" ? 
              `<button class="btn btn-success btn-sm" onclick="updateCollecte(${c.id},'confirmée')">✓ Confirmer</button>` : 
              ""}
            ${c.status === "confirmée" ? 
              `<button class="btn btn-outline btn-sm" onclick="updateCollecte(${c.id},'en_route')">🚐 En route</button>` : 
              ""}
            ${c.status === "en_route" ? 
              `<button class="btn btn-success btn-sm" onclick="updateCollecte(${c.id},'collectée')">📦 Collectée</button>` : 
              ""}
           </td>
        </tr>
      `).join("")}</tbody>
    </table>`;
  } catch(e) { 
    toast(e.message, "error"); 
  }
}

async function updateCollecte(id, status) {
  try {
    await apiPut(`/admin/collectes/${id}/status`, { status });
    toast(`Collecte → ${status} ✅`); loadCollectes();
  } catch(e) { toast(e.message, "error"); }
}


// 4. DÉPÔTS ET RETRAITS

async function loadDepots(status = "") {
  const el = document.getElementById("table-depots");
  loading(el);
  try {
    const data = await apiGet(`/admin/depots${status ? "?status="+status : ""}`);
    if (!data) return;
    allDemandes = data;
    if (!data.length) { el.innerHTML = '<div class="empty-state"><i class="fas fa-check-circle"></i><p>Aucune demande</p></div>'; return; }
    el.innerHTML = `<table class="data-table">
      <thead>
        <tr><th>#</th><th>Client</th><th>Montant</th><th>Opérateur</th><th>Type</th><th>Statut</th><th>Date</th><th>Actions</th></tr>
      </thead>
      <tbody>${data.map(d => `
        <tr>
          <td><b>#${d.id}</b></td>
          <td>${d.client?.name||"?"}<br><small style="color:#9E9E9E">${d.client?.phone||""}</small></td>
          <td style="color:#FFCC80;font-weight:700">${formatFCFA(d.montant)}</td>
          <td>${(d.operateur||"").replace("orange_money","🟠 Orange").replace("mtn_momo","🟡 MTN")}</td>
          <td><span style="background:${d.type === 'retrait' ? '#EF9A9A22' : '#80CBC422'};color:${d.type === 'retrait' ? '#EF9A9A' : '#80CBC4'};padding:2px 8px;border-radius:12px;font-size:11px">${d.type === 'retrait' ? 'Retrait' : 'Dépôt'}</span></td>
          <td>${statusBadge(d.status)}</td>
          <td style="color:#9E9E9E;font-size:12px">${formatDateTime(d.created_at)}</td>
          <td style="display:flex;gap:6px">
            ${d.status==="en_attente" ? `
              <button class="btn btn-success btn-sm" onclick="validerDepot(${d.id})">✓ Valider</button>
              <button class="btn btn-danger btn-sm" onclick="rejeterDepot(${d.id})">✗ Rejeter</button>
            ` : ""}
           </td>
        </tr>
      `).join("")}</tbody>
    </table>`;
  } catch(e) { toast(e.message, "error"); }
}

async function validerDepot(id) {
  if (!confirm("Valider cette demande ?")) return;
  const demande = allDemandes.find(d => d.id === id);
  const isRetrait = demande?.type === "retrait";
  let url;
  if (isRetrait) { url = `/admin/retrait/${id}/valider`; }
  else { url = `/admin/depots/${id}/valider`; }
  try {
    const r = await apiPut(url);
    toast(`✅ ${isRetrait ? "Retrait" : "Dépôt"} validé. Nouveau solde : ${formatFCFA(r.nouveau_solde)}`);
    loadDepots("en_attente");
    loadDashboard();
  } catch(e) { toast(e.message, "error"); }
}

async function rejeterDepot(id) {
  const note = prompt("Motif du rejet :") || "Non conforme";
  const demande = allDemandes.find(d => d.id === id);
  const isRetrait = demande?.type === "retrait";
  let url;
  if (isRetrait) { url = `/admin/retrait/${id}/rejeter?note=${encodeURIComponent(note)}`; }
  else { url = `/admin/depots/${id}/rejeter?note=${encodeURIComponent(note)}`; }
  try {
    await apiPut(url);
    toast("Demande rejetée");
    loadDepots("en_attente");
  } catch(e) { toast(e.message, "error"); }
}


// 5. MESSAGERIE

async function loadMessagerie() {
  const el = document.getElementById("conv-list");
  if (el) loading(el);
  try {
    const data = await apiGet("/admin/messagerie");
    if (!data) return;
    if (!el) return;
    if (!data.length) {
      el.innerHTML = '<div style="padding:20px;text-align:center;color:rgba(255,255,255,0.3)">Aucune conversation</div>';
      return;
    }
    el.innerHTML = data.map(c => `
      <div onclick="loadConvDetail(${c.id})" style="padding:12px;border-radius:12px;cursor:pointer;margin-bottom:8px;background:var(--card,rgba(255,255,255,0.04));border:1px solid ${c.admin_unread>0?"rgba(79,195,247,0.5)":"rgba(255,255,255,0.08)"};transition:background 0.2s" onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='var(--card,rgba(255,255,255,0.04))'">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div style="font-weight:600;font-size:13px">${c.client?.name||"?"}</div>
          ${c.admin_unread>0
            ? `<span style="background:#EF9A9A;color:#070C24;padding:2px 8px;border-radius:12px;font-size:10px;font-weight:700">${c.admin_unread} non lu</span>`
            : statusBadge(c.status)}
        </div>
        <div style="font-size:11px;color:#9E9E9E;margin-top:3px">
          Facture #${c.facture?.id||"?"} · ${formatFCFA(c.facture?.total||0)}
          ${c.remise_proposee>0 ? ` · Remise: ${formatFCFA(c.remise_proposee)}` : ""}
        </div>
        <div style="font-size:10px;color:#9E9E9E">${formatDate(c.created_at)}</div>
      </div>`).join("");
  } catch(e) { toast(e.message, "error"); }
}

async function loadConvDetail(id) {
  const det = document.getElementById("conv-detail");
  if (det) loading(det);
  try {
    const conv = await apiGet(`/admin/messagerie/${id}`);
    if (!conv || !det) return;
    det.innerHTML = `
      <div class="card-header" style="margin-bottom:14px">
        <div>
          <div class="card-title">💬 ${conv.client?.name||"?"}</div>
          <div style="font-size:12px;color:#9E9E9E">
            Facture #${conv.facture?.id} · ${formatFCFA(conv.facture?.total||0)} · ${statusBadge(conv.status)}
          </div>
        </div>
      </div>
      <div id="chat-msgs" style="height:280px;overflow-y:auto;padding:10px;background:rgba(0,0,0,0.2);border-radius:12px;margin-bottom:14px">
        ${(conv.messages||[]).map(m => {
          const isAdmin = m.sender_id !== conv.client?.id;
          const bg      = isAdmin ? "rgba(21,101,192,0.3)" : "rgba(255,255,255,0.06)";
          const align   = isAdmin ? "flex-end" : "flex-start";
          return `<div style="display:flex;justify-content:${align};margin-bottom:10px">
            <div style="max-width:75%;background:${bg};border-radius:12px;padding:10px 14px">
              ${m.type==="offre" ? `<div style="font-weight:700;color:#FFCC80;margin-bottom:4px">🎁 Offre: ${formatFCFA(m.montant_offre||0)}</div>` : ""}
              ${m.type==="refus" ? `<div style="color:#EF9A9A">❌ Offre refusée</div>` : ""}
              ${m.type==="acceptation" ? `<div style="color:#80CBC4">✅ Offre acceptée</div>` : ""}
              <div style="font-size:13px;color:white">${m.content||""}</div>
              <div style="font-size:10px;color:#9E9E9E;margin-top:4px">${isAdmin?"Admin":conv.client?.name} · ${formatDateTime(m.created_at)}</div>
            </div>
          </div>`;
        }).join("")}
      </div>
      <div style="background:rgba(255,204,128,0.08);border:1px solid rgba(255,204,128,0.2);border-radius:12px;padding:14px;margin-bottom:12px">
        <div style="font-size:12px;font-weight:700;color:#FFCC80;margin-bottom:8px">🎁 Proposer une réduction de prix</div>
        <div style="display:flex;gap:8px;align-items:center">
          <input type="number" id="offre-montant" class="input" placeholder="Montant de la réduction (FCFA)" style="flex:1">
          <button class="btn btn-primary" onclick="envoyerOffre(${conv.id})" style="white-space:nowrap">Envoyer l'offre</button>
        </div>
        <div style="font-size:11px;color:#9E9E9E;margin-top:6px">
          Total facture: ${formatFCFA(conv.facture?.total||0)} · 
          ${conv.remise_proposee>0 ? `Remise proposée: ${formatFCFA(conv.remise_proposee)}` : "Aucune remise proposée"}
        </div>
      </div>
      <div style="display:flex;gap:8px">
        <input type="text" id="msg-admin-txt" class="input" placeholder="Votre message..." style="flex:1" onkeydown="if(event.key==='Enter')envoyerMsgAdmin(${conv.id})">
        <button class="btn btn-outline" onclick="envoyerMsgAdmin(${conv.id})">📤</button>
      </div>
    `;
    const msgs = document.getElementById("chat-msgs");
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
    loadMessagerie();
  } catch(e) { toast(e.message, "error"); }
}

async function envoyerOffre(convId) {
  const montant = parseFloat(document.getElementById("offre-montant")?.value || "0");
  if (!montant || montant <= 0) { toast("Entrez un montant valide", "error"); return; }
  try {
    await apiPost(`/admin/messagerie/${convId}/offre`, {
      montant_offre: montant,
      content: `Je vous propose une réduction de ${formatFCFA(montant)} sur votre facture.`
    });
    toast(`✅ Offre de ${formatFCFA(montant)} envoyée`);
    loadConvDetail(convId);
  } catch(e) { toast(e.message, "error"); }
}

async function envoyerMsgAdmin(convId) {
  const inp = document.getElementById("msg-admin-txt");
  const content = inp?.value?.trim();
  if (!content) return;
  try {
    await apiPost(`/admin/messagerie/${convId}/message?content=${encodeURIComponent(content)}`);
    if (inp) inp.value = "";
    loadConvDetail(convId);
  } catch(e) { toast(e.message, "error"); }
}

async function ouvrirNegoAdmin(factureId) {
  const msg = prompt("Message pour ouvrir la négociation :") || "Bonjour, nous vous contactons concernant votre facture.";
  try {
    const r = await apiPost(`/messagerie/factures/${factureId}/ouvrir`, { content: msg });
    toast("✅ Conversation ouverte");
    closeModal();
    showPage("messagerie");
  } catch(e) { toast(e.message, "error"); }
}

// 6. CLIENTS

async function loadClients() {
  const el = document.getElementById("table-clients");
  loading(el);
  try {
    const search = document.getElementById("search-client")?.value || "";
    const role   = document.getElementById("filter-role")?.value || "";
    let path = "/admin/users";
    const p = [];
    if (role)   p.push(`role=${role}`);
    if (search) p.push(`search=${encodeURIComponent(search)}`);
    if (p.length) path += "?" + p.join("&");
    const data = await apiGet(path);
    if (!data) return;
    if (!data.length) { el.innerHTML = '<div class="empty-state"><p>Aucun utilisateur</p></div>'; return; }
    el.innerHTML = `<table>
      <thead><tr><th>#</th><th>Nom</th><th>Email</th><th>Rôle</th><th>Solde</th><th>Cmds</th><th>Date</th><th>Actions</th></tr></thead>
      <tbody>${data.map(u => `<tr>
        <td>#${u.id}</td>
        <td><b>${u.name||"?"}</b><br><small style="color:#4FC3F7;font-size:10px">${u.referral_code||""}</small></td>
        <td style="color:#9E9E9E;font-size:12px">${u.email}</td>
        <td>${roleBadge(u.role)}</td>
        <td style="color:#FFCC80">${formatFCFA(u.solde)}</td>
        <td>${u.nb_commandes}</td>
        <td style="color:#9E9E9E;font-size:12px">${formatDate(u.created_at)}</td>
        <td style="display:flex;gap:6px">
          <button class="btn btn-outline btn-sm" onclick="openClientModal(${u.id})">👁</button>
          <button class="btn btn-success btn-sm" onclick="crediterClient(${u.id})">+</button>
        </td>
      </tr>`).join("")}</tbody></table>`;
  } catch(e) { toast(e.message, "error"); }
}

async function openClientModal(id) {
  openModal(`<div class="modal"><div style="padding:20px;text-align:center">Chargement...</div></div>`);
  try {
    const u = await apiGet(`/admin/users/${id}`);
    if (!u) { closeModal(); return; }
    openModal(`<div class="modal">
      <div class="modal-header">
        <div class="modal-title">👤 ${u.name||"?"}</div>
        <button class="modal-close" onclick="closeModal()">✕</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
        <div><div class="input-label">Email</div><div style="color:#4FC3F7">${u.email}</div></div>
        <div><div class="input-label">Téléphone</div><div>${u.phone||"—"}</div></div>
        <div><div class="input-label">Solde</div><div style="color:#FFCC80;font-weight:700">${formatFCFA(u.solde)}</div></div>
        <div><div class="input-label">Code parrainage</div><div style="color:#4FC3F7">${u.referral_code||"—"}</div></div>
        <div><div class="input-label">Commandes</div><div>${u.nb_commandes}</div></div>
        <div><div class="input-label">Collectes</div><div>${u.nb_collectes}</div></div>
      </div>
      <div class="input-group">
        <label class="input-label">Changer le rôle</label>
        <select id="new-role-sel" class="input">
          ${["client","admin"].map(r => `<option value="${r}" ${r===u.role?"selected":""}>${r}</option>`).join("")}
        </select>
      </div>
      <div style="display:flex;gap:10px;margin-bottom:14px">
        <button class="btn btn-primary" onclick="changerRole(${u.id})">💾 Enregistrer rôle</button>
        <button class="btn btn-danger" onclick="supprimerUser(${u.id})">🗑 Supprimer</button>
      </div>
      ${u.transactions_recentes?.length ? `
        <div><div class="card-title" style="margin-bottom:8px">Transactions récentes</div>
        ${u.transactions_recentes.map(t => `
          <div style="font-size:12px;display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.06)">
            <span style="color:#9E9E9E">${t.note||t.type}</span>
            <span style="color:${["depot","credit_parrainage","credit_admin"].includes(t.type)?"#80CBC4":"#EF9A9A"}">${formatFCFA(t.amount)}</span>
          </div>`).join("")}
        </div>` : ""}
    </div>`);
  } catch(e) { toast(e.message, "error"); closeModal(); }
}

async function changerRole(id) {
  try {
    await apiPut(`/admin/users/${id}/role?role=${document.getElementById("new-role-sel").value}`);
    toast("Rôle mis à jour ✅"); closeModal(); loadClients();
  } catch(e) { toast(e.message, "error"); }
}
async function supprimerUser(id) {
  if (!confirm("Supprimer cet utilisateur ?")) return;
  try { await apiDelete(`/admin/users/${id}`); toast("Supprimé"); closeModal(); loadClients(); }
  catch(e) { toast(e.message, "error"); }
}
async function crediterClient(id) {
  const m = parseFloat(prompt("Montant à créditer (FCFA) :") || 0);
  if (!m || m <= 0) return;
  const n = prompt("Note :") || "Crédit admin";
  try {
    const r = await apiPost(`/admin/users/${id}/crediter?montant=${m}&note=${encodeURIComponent(n)}`);
    toast(`✅ ${formatFCFA(m)} crédité. Solde: ${formatFCFA(r.nouveau_solde)}`); loadClients();
  } catch(e) { toast(e.message, "error"); }
}
function filterTarifs() {
  renderTarifsTable(currentTarifsCache);
}

function renderTarifsTable(tarifs) {
  const search = document.getElementById("search-tarif")?.value.toLowerCase() || "";
  const filtered = search
    ? tarifs.filter(t => (t.name||"").toLowerCase().includes(search) || (t.description||"").toLowerCase().includes(search))
    : tarifs;

  const tEl = document.getElementById("table-tarifs");
  if (!tEl) return;
  tEl.innerHTML = !filtered.length
    ? '<div class="empty-state"><p>Aucun article trouvé</p></div>'
    : `<table>
        <thead><tr><th>Article</th><th>Prix</th><th>Description</th><th>Actions</th></tr></thead>
        <tbody>${filtered.map(t => `<tr>
          <td><b>${t.name}</b></td>
          <td>
            <div style="display:flex;align-items:center;gap:6px">
              <button class="btn btn-outline btn-sm" onclick="adjustPrice(${t.id}, -100)">−</button>
              <input type="number"
                     id="price-inp-${t.id}"
                     value="${t.price}"
                     min="0"
                     class="input"
                     style="width:90px;text-align:center;color:#FFCC80;font-weight:700"
                     onblur="savePriceInline(${t.id}, this.value)"
                     onkeydown="if(event.key==='Enter'){this.blur()}">
              <button class="btn btn-outline btn-sm" onclick="adjustPrice(${t.id}, 100)">+</button>
              <span style="font-size:11px;color:#9E9E9E">FCFA</span>
            </div>
          </td>
          <td style="color:#9E9E9E;font-size:12px">${t.description||"—"}</td>
          <td style="display:flex;gap:6px">
            <button class="btn btn-outline btn-sm" onclick="modalEditTarif(${t.id},'${(t.name||"").replace(/'/g,"\\'")}',${t.price},'${(t.description||"").replace(/'/g,"\\'")}')">✏️</button>
            <button class="btn btn-danger btn-sm" onclick="deleteTarif(${t.id})">🗑</button>
           </td>
        </tr>`).join("")}</tbody></table>`;
}
// ══════════════════════════════════════════════════════════
// 7. TARIFS
// ══════════════════════════════════════════════════════════
async function loadTarifs() {
  try {
    const [tarifs, offres] = await Promise.all([apiGet("/admin/tarifs"), apiGet("/admin/offres")]);
    if (!tarifs) return;
    currentTarifsCache = tarifs;
    renderTarifsTable(tarifs);

    const oEl = document.getElementById("table-offres");
    if (oEl && offres) oEl.innerHTML = !offres.length
      ? '<div class="empty-state"><p>Aucune offre</p></div>'
      : `<table>
          <thead><tr><th>Service</th><th>Prix</th><th>Description</th><th>Actions</th></tr></thead>
          <tbody>${tarifs.map(t => `<tr>
            <td><b>${t.name}</b></td>
            <td style="color:#FFCC80;font-weight:700">${formatFCFA(t.price)}</td>
            <td style="color:#9E9E9E;font-size:12px">${t.description||"—"}</td>
            <td style="display:flex;gap:6px">
              <button class="btn btn-outline btn-sm" onclick="modalEditTarif(${t.id},'${(t.name||"").replace(/'/g,"\\'")}',${t.price},'${(t.description||"").replace(/'/g,"\\'")}')">✏️</button>
              <button class="btn btn-danger btn-sm" onclick="deleteTarif(${t.id})">🗑</button>
             </td>
          </tr>`).join("")}</tbody></table>`;
    if (oEl && offres) oEl.innerHTML = !offres.length
      ? '<div class="empty-state"><p>Aucune offre</p></div>'
      : `<table>
          <thead><tr><th>Offre</th><th>Remise</th><th>Période</th><th>Actif</th><th></th></tr></thead>
          <tbody>${offres.map(o => `<tr>
            <td>${o.title}<br><small style="color:#9E9E9E">${o.description||""}</small></td>
            <td style="color:#80CBC4;font-weight:700">${formatFCFA(o.discount)}</td>
            <td style="font-size:11px;color:#9E9E9E">${formatDate(o.start_date)} → ${formatDate(o.end_date)}</td>
            <td>${o.active ? '<span style="color:#80CBC4">✅</span>' : '<span style="color:#9E9E9E">❌</span>'}</td>
            <td><button class="btn btn-outline btn-sm" onclick="toggleOffre(${o.id})">${o.active?"Désactiver":"Activer"}</button></td>
          </tr>`).join("")}</tbody></table>`;
  } catch(e) { toast(e.message, "error"); }
}

function modalAddTarif() {
  openModal(`<div class="modal">
    <div class="modal-header"><div class="modal-title">➕ Ajouter un tarif</div><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="input-group"><label class="input-label">Nom du service *</label><input id="t-name" class="input" placeholder="Ex: Chemise avec boutons"></div>
    <div class="input-group"><label class="input-label">Prix (FCFA) *</label><input id="t-price" class="input" type="number" min="0" placeholder="1500"></div>
    <div class="input-group"><label class="input-label">Description</label><input id="t-desc" class="input" placeholder="Optionnel"></div>
    <button class="btn btn-primary" onclick="saveTarif()">💾 Enregistrer</button>
  </div>`);
}

function modalEditTarif(id, name, price, desc) {
  openModal(`<div class="modal">
    <div class="modal-header"><div class="modal-title">✏️ Modifier le tarif</div><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="input-group"><label class="input-label">Nom du service</label><input id="t-name" class="input" value="${name}"></div>
    <div class="input-group">
      <label class="input-label">Prix (FCFA)</label>
      <input id="t-price" class="input" type="number" min="0" value="${price}">
      <div style="font-size:11px;color:#9E9E9E;margin-top:4px">Prix actuel : ${formatFCFA(price)}</div>
    </div>
    <div class="input-group"><label class="input-label">Description</label><input id="t-desc" class="input" value="${desc}"></div>
    <button class="btn btn-primary" onclick="saveTarif(${id})">💾 Enregistrer les modifications</button>
  </div>`);
}

async function saveTarif(id = null) {
  const name  = document.getElementById("t-name")?.value?.trim();
  const price = parseFloat(document.getElementById("t-price")?.value || "0");
  const desc  = document.getElementById("t-desc")?.value?.trim();
  if (!name) { toast("Le nom est obligatoire", "error"); return; }
  if (!price || price <= 0) { toast("Entrez un prix valide", "error"); return; }
  try {
    if (id) await apiPut(`/admin/tarifs/${id}`, { name, price, description: desc });
    else    await apiPost("/admin/tarifs",       { name, price, description: desc });
    toast(`✅ Tarif ${id ? "modifié" : "ajouté"}`);
    closeModal(); loadTarifs();
  } catch(e) { toast(e.message, "error"); }
}

async function deleteTarif(id) {
  if (!confirm("Supprimer ce tarif ?")) return;
  try { await apiDelete(`/admin/tarifs/${id}`); toast("Supprimé"); loadTarifs(); }
  catch(e) { toast(e.message, "error"); }
}

function modalAddOffre() {
  const today = new Date().toISOString().split("T")[0];
  openModal(`<div class="modal">
    <div class="modal-header"><div class="modal-title">🎉 Créer une offre</div><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="input-group"><label class="input-label">Titre *</label><input id="o-title" class="input" placeholder="Ex: Offre Spéciale Mai"></div>
    <div class="input-group"><label class="input-label">Description</label><textarea id="o-desc" class="input" rows="2" placeholder="Détails de l'offre..."></textarea></div>
    <div class="input-group"><label class="input-label">Remise (FCFA) *</label><input id="o-discount" class="input" type="number" min="0" placeholder="2000"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div class="input-group"><label class="input-label">Date début</label><input id="o-start" class="input" type="date" value="${today}"></div>
      <div class="input-group"><label class="input-label">Date fin</label><input id="o-end" class="input" type="date"></div>
    </div>
    <button class="btn btn-primary" onclick="saveOffre()">📤 Créer et notifier tous les clients</button>
  </div>`);
}

async function saveOffre() {
  try {
    await apiPost("/admin/offres", {
      title:       document.getElementById("o-title")?.value,
      description: document.getElementById("o-desc")?.value,
      discount:    parseFloat(document.getElementById("o-discount")?.value||"0"),
      start_date:  document.getElementById("o-start")?.value,
      end_date:    document.getElementById("o-end")?.value,
    });
    toast("✅ Offre créée et clients notifiés"); closeModal(); loadTarifs();
  } catch(e) { toast(e.message, "error"); }
}

async function toggleOffre(id) {
  try { await apiPut(`/admin/offres/${id}/toggle`); loadTarifs(); }
  catch(e) { toast(e.message, "error"); }
}

// ═══════════════════════════════════════════════════════════════════════════
// 8. PARRAINAGE ENRICHIE 
// ═══════════════════════════════════════════════════════════════════════════

// Variables globales pour le parrainage
let allReferrals = [];
let allUsers = [];
let currentSponsorFilter = null;

async function loadParrainage() {
  try {
    // Charger toutes les données nécessaires
    const [cfg, stats, referrals, users] = await Promise.all([
      apiGet("/admin/parrainage/config"),
      apiGet("/admin/parrainage/stats"),
      apiGet("/admin/parrainage/referrals"),
      apiGet("/admin/users?role=client")
    ]);
    
    if (!cfg || !stats) return;
    
    allReferrals = referrals || [];
    allUsers = users || [];
    
    // === SECTION CONFIGURATION ===
    const cfgEl = document.getElementById("parrainage-config");
    if (cfgEl) {
      cfgEl.innerHTML = `
        <div class="input-group">
          <label class="input-label">🎁 Récompense par filleul (FCFA)</label>
          <input id="cfg-bonus" class="input" type="number" value="${cfg.bonus_amount || 1000}" step="100">
        </div>
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:16px">
          <input type="checkbox" id="cfg-active" ${cfg.active ? "checked" : ""}> 
          <label style="font-size:13px">✅ Système de parrainage actif</label>
        </div>
        <button class="btn btn-primary" onclick="saveParrainageConfig()">💾 Enregistrer la configuration</button>
      `;
    }
    
    // === SECTION STATISTIQUES DÉTAILLÉES ===
    // Calculer les statistiques avancées
    const totalParrainages = allReferrals.filter(r => r.referred_id !== null).length;
    const rewardedCount = allReferrals.filter(r => r.rewarded === true).length;
    const pendingCount = allReferrals.filter(r => r.rewarded === false && r.referred_id !== null).length;
    const totalVersed = stats.total_verse_fcfa || 0;
    const totalPending = (allReferrals.filter(r => !r.rewarded && r.referred_id !== null).length * (cfg.bonus_amount || 1000));
    
    // Calculer les parrains les plus actifs
    const topSponsors = {};
    allReferrals.forEach(r => {
      if (r.sponsor_id) {
        topSponsors[r.sponsor_id] = (topSponsors[r.sponsor_id] || 0) + 1;
      }
    });
    const topSponsorsList = Object.entries(topSponsors)
      .sort((a,b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, count]) => {
        const user = allUsers.find(u => u.id == id);
        return { name: user?.name || `#${id}`, count };
      });
    
    const statsEl = document.getElementById("parrainage-stats");
    if (statsEl) {
      statsEl.innerHTML = `
        <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:16px; margin-bottom:24px">
          <div class="stat-card" style="text-align:center">
            <div class="stat-value" style="color:#4FC3F7; font-size:32px">${totalParrainages}</div>
            <div class="stat-label">Total parrainages</div>
            <div style="font-size:11px; color:#9E9E9E; margin-top:4px">⬆️ ${rewardedCount} récompensés</div>
          </div>
          <div class="stat-card" style="text-align:center">
            <div class="stat-value" style="color:#80CBC4; font-size:32px">${formatFCFA(totalVersed)}</div>
            <div class="stat-label">Total versé</div>
            <div style="font-size:11px; color:#FFCC80">💸 ${formatFCFA(totalPending)} en attente</div>
          </div>
          <div class="stat-card" style="text-align:center">
            <div class="stat-value" style="color:#CE93D8; font-size:32px">${pendingCount}</div>
            <div class="stat-label">En attente</div>
            <div style="font-size:11px; color:#9E9E9E">⏳ ${rewardedCount} récompensés</div>
          </div>
        </div>
        
        <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:16px; margin-bottom:24px">
          <div class="card" style="padding:12px">
            <div style="font-size:12px; color:#9E9E9E; margin-bottom:8px">🏆 Taux de conversion</div>
            <div style="font-size:24px; font-weight:700; color:#4FC3F7">${totalParrainages ? Math.round((rewardedCount/totalParrainages)*100) : 0}%</div>
            <div style="font-size:11px; color:#9E9E9E">des filleuls ont été récompensés</div>
          </div>
          <div class="card" style="padding:12px">
            <div style="font-size:12px; color:#9E9E9E; margin-bottom:8px">💰 Montant moyen</div>
            <div style="font-size:24px; font-weight:700; color:#80CBC4">${formatFCFA(totalParrainages ? (totalVersed/totalParrainages) : 0)}</div>
            <div style="font-size:11px; color:#9E9E9E">par parrainage réussi</div>
          </div>
          <div class="card" style="padding:12px">
            <div style="font-size:12px; color:#9E9E9E; margin-bottom:8px">📈 Parrains actifs</div>
            <div style="font-size:24px; font-weight:700; color:#CE93D8">${Object.keys(topSponsors).length}</div>
            <div style="font-size:11px; color:#9E9E9E">ont parrainé au moins 1 personne</div>
          </div>
        </div>
        
        ${topSponsorsList.length ? `
          <div class="card" style="margin-bottom:24px">
            <div class="card-title" style="font-size:14px; margin-bottom:12px">🏅 Top 5 des meilleurs parrains</div>
            ${topSponsorsList.map((s, i) => `
              <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid rgba(255,255,255,0.06)">
                <div style="display:flex; align-items:center; gap:10px">
                  <span style="font-size:18px; font-weight:700; color:${i===0?'#FFD700':i===1?'#C0C0C0':i===2?'#CD7F32':'#9E9E9E'}">${i+1}</span>
                  <span style="font-weight:600">${s.name}</span>
                </div>
                <div style="color:#4FC3F7; font-weight:700">${s.count} filleul${s.count>1?'s':''}</div>
              </div>
            `).join('')}
          </div>
        ` : ''}
      `;
    }
    
    // === SECTION LISTE DÉTAILLÉE DES PARRAINAGES ===
    await renderReferralsList();
    
  } catch(e) { 
    toast(e.message, "error"); 
  }
}

async function renderReferralsList(filterSponsor = null) {
  currentSponsorFilter = filterSponsor;
  const container = document.getElementById("referrals-list");
  if (!container) {
    // Créer le conteneur s'il n'existe pas
    const parrainagePage = document.getElementById("page-parrainage");
    if (parrainagePage && !document.getElementById("referrals-list")) {
      const listSection = document.createElement("div");
      listSection.id = "referrals-list-section";
      listSection.innerHTML = `
        <div class="card" style="margin-top:20px">
          <div class="card-header">
            <div class="card-title">👥 Liste détaillée des parrainages</div>
            <div style="display:flex; gap:10px">
              <input type="text" id="referral-search" class="input" placeholder="🔍 Rechercher..." style="width:180px" oninput="filterReferrals()">
              <select id="referral-status-filter" class="input" style="width:140px" onchange="filterReferrals()">
                <option value="all">Tous les statuts</option>
                <option value="rewarded">✅ Récompensés</option>
                <option value="pending">⏳ En attente</option>
              </select>
            </div>
          </div>
          <div id="referrals-list" style="max-height:500px; overflow-y:auto"></div>
        </div>
      `;
      parrainagePage.appendChild(listSection);
    }
  }
  
  const listContainer = document.getElementById("referrals-list");
  if (!listContainer) return;
  
  let filtered = [...allReferrals];
  
  // Filtre par parrain spécifique
  if (filterSponsor) {
    filtered = filtered.filter(r => r.sponsor_id == filterSponsor);
  }
  
  // Filtre par recherche
  const searchTerm = document.getElementById("referral-search")?.value.toLowerCase() || "";
  if (searchTerm) {
    filtered = filtered.filter(r => {
      const sponsor = allUsers.find(u => u.id == r.sponsor_id);
      const referred = allUsers.find(u => u.id == r.referred_id);
      return (sponsor?.name?.toLowerCase().includes(searchTerm) ||
              sponsor?.email?.toLowerCase().includes(searchTerm) ||
              referred?.name?.toLowerCase().includes(searchTerm) ||
              r.referral_code?.toLowerCase().includes(searchTerm));
    });
  }
  
  // Filtre par statut
  const statusFilter = document.getElementById("referral-status-filter")?.value || "all";
  if (statusFilter === "rewarded") {
    filtered = filtered.filter(r => r.rewarded === true);
  } else if (statusFilter === "pending") {
    filtered = filtered.filter(r => r.rewarded === false && r.referred_id !== null);
  }
  
  if (!filtered.length) {
    listContainer.innerHTML = '<div class="empty-state"><i class="fas fa-gift"></i><p>Aucun parrainage trouvé</p></div>';
    return;
  }
  
  // Grouper par parrain (sponsor)
  const groupedBySponsor = {};
  filtered.forEach(r => {
    if (!groupedBySponsor[r.sponsor_id]) {
      groupedBySponsor[r.sponsor_id] = [];
    }
    groupedBySponsor[r.sponsor_id].push(r);
  });
  
  let html = '';
  for (const [sponsorId, referrals] of Object.entries(groupedBySponsor)) {
    const sponsor = allUsers.find(u => u.id == sponsorId);
    if (!sponsor) continue;
    
    const totalRewarded = referrals.filter(r => r.rewarded).length;
    const totalPending = referrals.filter(r => !r.rewarded && r.referred_id).length;
    const totalAmount = referrals.reduce((sum, r) => sum + (r.reward_amount || 0), 0);
    
    html += `
      <div class="card" style="margin-bottom:16px; background:rgba(79,195,247,0.03)">
        <div class="card-header" style="cursor:pointer" onclick="toggleSponsorGroup(${sponsorId})">
          <div style="display:flex; align-items:center; gap:12px">
            <i class="fas fa-chevron-right" id="sponsor-arrow-${sponsorId}" style="transition:transform 0.3s"></i>
            <div>
              <div style="font-weight:700; font-size:16px">${escapeHtml(sponsor.name)}</div>
              <div style="font-size:11px; color:#9E9E9E">
                📧 ${sponsor.email || '-'} | 📞 ${sponsor.phone || '-'} | 
                🔗 Code: <span style="color:#4FC3F7; font-family:monospace">${sponsor.referral_code || '-'}</span>
              </div>
            </div>
          </div>
          <div style="display:flex; gap:16px; align-items:center">
            <div style="text-align:center">
              <div style="font-size:20px; font-weight:700; color:#4FC3F7">${referrals.length}</div>
              <div style="font-size:10px; color:#9E9E9E">Total</div>
            </div>
            <div style="text-align:center">
              <div style="font-size:20px; font-weight:700; color:#80CBC4">${totalRewarded}</div>
              <div style="font-size:10px; color:#9E9E9E">Récompensés</div>
            </div>
            <div style="text-align:center">
              <div style="font-size:16px; font-weight:700; color:#FFCC80">${formatFCFA(totalAmount)}</div>
              <div style="font-size:10px; color:#9E9E9E">Gagné</div>
            </div>
          </div>
        </div>
        <div id="sponsor-group-${sponsorId}" style="display:none; padding:16px; border-top:1px solid rgba(255,255,255,0.06); margin-top:12px">
          <table class="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Filleul</th>
                <th>Contact</th>
                <th>Code utilisé</th>
                <th>Date parrainage</th>
                <th>Statut</th>
                <th>Récompense</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${referrals.map((r, idx) => {
                const referred = allUsers.find(u => u.id == r.referred_id);
                const status = r.rewarded ? 'rewarded' : (r.referred_id ? 'pending' : 'invalid');
                const statusText = r.rewarded ? '✅ Récompensé' : (r.referred_id ? '⏳ En attente' : '❌ Invalide');
                const statusColor = r.rewarded ? '#80CBC4' : (r.referred_id ? '#FFCC80' : '#EF9A9A');
                const rewardAmount = r.reward_amount || (r.rewarded ? (cfg.bonus_amount || 1000) : 0);
                
                return `
                  <tr>
                    <td style="width:50px">${idx+1}</td>
                    <td>
                      <div style="font-weight:600">${referred ? escapeHtml(referred.name) : 'Utilisateur inconnu'}</div>
                      ${referred ? `<div style="font-size:10px; color:#9E9E9E">ID: #${referred.id}</div>` : ''}
                    </td>
                    <td style="font-size:12px">
                      ${referred ? `
                        📧 ${referred.email || '-'}<br>
                        📞 ${referred.phone || '-'}
                      ` : '-'}
                    </td>
                    <td>
                      <code style="background:rgba(0,0,0,0.3); padding:2px 6px; border-radius:6px; font-size:11px">
                        ${r.referral_code || sponsor.referral_code || '-'}
                      </code>
                    </td>
                    <td style="font-size:12px">${formatDateTime(r.created_at)}</td>
                    <td>
                      <span style="background:${statusColor}22; color:${statusColor}; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:600">
                        ${statusText}
                      </span>
                    </td>
                    <td style="color:#FFCC80; font-weight:600">${formatFCFA(rewardAmount)}</td>
                    <td>
                      ${!r.rewarded && r.referred_id ? `
                        <button class="btn btn-success btn-sm" onclick="manuallyRewardReferral(${r.id}, ${rewardAmount})" title="Valider manuellement">
                          💰 Valider
                        </button>
                      ` : '-'}
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }
  
  listContainer.innerHTML = html;
}

function toggleSponsorGroup(sponsorId) {
  const group = document.getElementById(`sponsor-group-${sponsorId}`);
  const arrow = document.getElementById(`sponsor-arrow-${sponsorId}`);
  if (group) {
    if (group.style.display === 'none') {
      group.style.display = 'block';
      if (arrow) arrow.style.transform = 'rotate(90deg)';
    } else {
      group.style.display = 'none';
      if (arrow) arrow.style.transform = 'rotate(0deg)';
    }
  }
}

function filterReferrals() {
  renderReferralsList(currentSponsorFilter);
}

async function manuallyRewardReferral(referralId, amount) {
  if (!confirm(`Valider la récompense de ${formatFCFA(amount)} pour ce parrainage ?`)) return;
  try {
    await apiPost(`/admin/parrainage/referrals/${referralId}/reward`, { amount });
    toast("✅ Récompense validée et créditée");
    loadParrainage(); // Recharger toute la page
  } catch(e) { toast(e.message, "error"); }
}

async function saveParrainageConfig() {
  const bonus = parseFloat(document.getElementById("cfg-bonus")?.value || "1000");
  const active = document.getElementById("cfg-active")?.checked || false;
  try {
    await apiPut(`/admin/parrainage/config?bonus=${bonus}&active=${active}`);
    toast("✅ Configuration sauvegardée");
    loadParrainage();
  } catch(e) { toast(e.message, "error"); }
}
// ══════════════════════════════════════════════════════════
// 9. RAPPORTS
// ══════════════════════════════════════════════════════════
async function loadRapport() {
  const mois = document.getElementById("rapport-mois")?.value || (new Date().getMonth()+1);
  try {
    const r = await apiGet(`/admin/rapport?mois=${mois}`);
    if (!r) return;
    const el = document.getElementById("rapport-content");
    if (!el) return;
    el.innerHTML = `
      <div class="stats-grid" style="margin-top:20px;grid-template-columns:repeat(4,1fr)">
        ${sc("fa-chart-line", formatFCFA(r.ca_brut||0), "CA Brut", `Net: ${formatFCFA(r.ca_net||0)}`, "#4FC3F7")}
        ${sc("fa-percent", formatFCFA(r.remises_accordees||0), "Remises", "", "#EF9A9A")}
        ${sc("fa-box", r.nb_commandes||0, "Commandes", "", "#CE93D8")}
        ${sc("fa-user-plus", r.nb_nouveaux_clients||0, "Nouveaux clients", "", "#80CBC4")}
        ${sc("fa-money-bill", formatFCFA(r.total_depots_valides||0), "Dépôts validés", "", "#FFCC80")}
        ${sc("fa-gift", formatFCFA(r.total_recompenses_parrainage||0), "Parrainage versé", "", "#CE93D8")}
        ${sc("fa-wallet", formatFCFA(r.repartition_paiement?.wallet||0), "CA Wallet", "", "#4FC3F7")}
        ${sc("fa-money-bill-wave", formatFCFA(r.repartition_paiement?.liquide||0), "CA Liquide", "", "#80CBC4")}
      </div>`;
  } catch(e) { toast(e.message, "error"); }
}


// ============================================================
// VARIABLES CARTE
// ============================================================
let googleMap = null;
let mapMarkers = [];
let markerCluster = null;
let allMapCollectes = [];
let allMapLivreurs = [];

// Configuration des statuts avec couleurs vives
const statusConfigMap = {
    "en_attente": { bg: "#FF9800", icon: "⏳", label: "En attente", text: "#fff" },
    "confirmée": { bg: "#2196F3", icon: "✅", label: "Confirmée", text: "#fff" },
    "en_route": { bg: "#9C27B0", icon: "🚐", label: "En route", text: "#fff" },
    "collectée": { bg: "#4CAF50", icon: "📦", label: "Collectée", text: "#fff" },
    "annulée": { bg: "#f44336", icon: "❌", label: "Annulée", text: "#fff" }
};


// ============================================================
// CARTE COLLECTES - VERSION FINALE SIMPLIFIÉE
// ============================================================

let simpleMap = null;
let simpleMarkers = [];
let allSimpleCollectes = [];
let currentMapFilter = "all";

// Initialisation de la carte
function initSimpleMap() {
    console.log("📍 InitSimpleMap appelée");
    const mapDiv = document.getElementById("map");
    if (!mapDiv) {
        console.error("❌ Div map non trouvée");
        return;
    }
    if (simpleMap) {
        console.log("Carte déjà initialisée");
        return;
    }
    
    try {
        simpleMap = new google.maps.Map(mapDiv, {
            center: { lat: 3.8480, lng: 11.5021 },
            zoom: 12,
            zoomControl: true,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: true,
            styles: [
                { featureType: "all", elementType: "geometry", stylers: [{ color: "#0D1235" }] },
                { featureType: "water", elementType: "geometry", stylers: [{ color: "#1A237E" }] }
            ]
        });
        console.log("✅ Carte créée avec succès");
        loadSimpleCollectes();
    } catch(e) {
        console.error("❌ Erreur création carte:", e);
        toast("Erreur création carte: " + e.message, "error");
    }
}

// Charger les collectes
async function loadSimpleCollectes() {
    console.log("📡 Chargement des collectes...");
    const loadingDiv = document.getElementById("map-loading");
    if (loadingDiv) loadingDiv.style.display = "flex";
    
    try {
        const response = await apiGet("/admin/collectes");
        console.log("📦 Collectes reçues:", response?.length || 0);
        allSimpleCollectes = response || [];
        
        // Mettre à jour les compteurs
        updateSimpleCounters();
        
        // Afficher la liste
        renderSimpleCollectesList();
        
        // Placer les marqueurs
        placeSimpleMarkers();
        
        if (loadingDiv) loadingDiv.style.display = "none";
        
    } catch(e) {
        console.error("❌ Erreur:", e);
        toast("Erreur chargement: " + e.message, "error");
        if (loadingDiv) loadingDiv.style.display = "none";
    }
}

// Mettre à jour les compteurs
function updateSimpleCounters() {
    const total = allSimpleCollectes.length;
    const recues = allSimpleCollectes.filter(c => c.status === "reçue" || c.status === "en_attente").length;
    const enCours = allSimpleCollectes.filter(c => ["confirmée", "en_route"].includes(c.status)).length;
    const terminees = allSimpleCollectes.filter(c => c.status === "collectée").length;
    const refusees = allSimpleCollectes.filter(c => c.status === "annulée").length;
    
    const totalEl = document.getElementById("total-collectes");
    const recuesEl = document.getElementById("recues-count");
    const encoursEl = document.getElementById("encours-count");
    const termineesEl = document.getElementById("terminees-count");
    const refuseesEl = document.getElementById("refusees-count");
    
    if (totalEl) totalEl.textContent = total;
    if (recuesEl) recuesEl.textContent = recues;
    if (encoursEl) encoursEl.textContent = enCours;
    if (termineesEl) termineesEl.textContent = terminees;
    if (refuseesEl) refuseesEl.textContent = refusees;
}

// Filtrer la liste par statut
function filterCollectesByStatus(status) {
    currentMapFilter = status;
    
    // Mettre à jour l'apparence des boutons
    document.querySelectorAll(".filter-btn").forEach(btn => {
        btn.classList.remove("active");
        if (btn.getAttribute("data-status") === status) btn.classList.add("active");
    });
    
    renderSimpleCollectesList();
    placeSimpleMarkers();
}

// Rechercher un client
function searchCollectes() {
    const searchTerm = document.getElementById("simple-search-input")?.value.toLowerCase() || "";
    renderSimpleCollectesList(searchTerm);
    placeSimpleMarkers();
}

// Afficher la liste des collectes
function renderSimpleCollectesList(searchTerm = "") {
    const container = document.getElementById("simple-collectes-list");
    if (!container) return;
    
    let filtered = [...allSimpleCollectes];
    
    // Filtrer par statut
    if (currentMapFilter !== "all") {
        filtered = filtered.filter(c => {
            if (currentMapFilter === "recues") return c.status === "reçue" || c.status === "en_attente";
            if (currentMapFilter === "encours") return ["confirmée", "en_route"].includes(c.status);
            if (currentMapFilter === "terminees") return c.status === "collectée";
            if (currentMapFilter === "refusees") return c.status === "annulée";
            return true;
        });
    }
    
    // Filtrer par recherche
    if (searchTerm) {
        filtered = filtered.filter(c => 
            (c.client?.name || "").toLowerCase().includes(searchTerm) ||
            (c.client?.phone || "").includes(searchTerm) ||
            (c.adresse || "").toLowerCase().includes(searchTerm)
        );
    }
    
    if (filtered.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:40px; color:#aaa;">📭 Aucune collecte trouvée</div>';
        return;
    }
    
    container.innerHTML = filtered.map(c => `
        <div class="collecte-item" onclick="zoomOnCollecte(${c.id}, ${c.latitude || 0}, ${c.longitude || 0})" 
            style="padding: 12px; margin-bottom: 8px; background: ${c.latitude ? 'rgba(79,195,247,0.05)' : 'rgba(255,255,255,0.03)'}; border-radius: 10px; cursor: pointer; border-left: 3px solid ${getStatusColor(c.status)};">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div style="flex: 1;">
                    <div style="font-weight: 600;">${escapeHtml(c.client?.name || "Client")}</div>
                    <div style="font-size: 11px; color: #aaa;">📞 ${c.client?.phone || "-"}</div>
                    <div style="font-size: 11px; color: #888; margin-top: 4px;">📍 ${c.adresse?.substring(0, 40) || "Adresse inconnue"}${c.adresse?.length > 40 ? "..." : ""}</div>
                    <div style="font-size: 10px; color: #4FC3F7; margin-top: 4px;">📅 ${formatDate(c.scheduled_at)} · ${c.creneau || "-"}</div>
                </div>
                <div style="text-align: right; margin-left: 10px;">
                    <span style="background: ${getStatusColor(c.status)}20; color: ${getStatusColor(c.status)}; padding: 3px 8px; border-radius: 15px; font-size: 11px;">
                        ${getStatusLabel(c.status)}
                    </span>
                    ${!c.latitude ? '<div style="font-size: 10px; color: #f44336; margin-top: 5px;">⚠️ Pas de position</div>' : ''}
                </div>
            </div>
        </div>
    `).join('');
}

// Placer les marqueurs sur la carte
function placeSimpleMarkers() {
    if (!simpleMap) {
        console.log("Carte non initialisée");
        return;
    }
    
    // Supprimer les anciens marqueurs
    simpleMarkers.forEach(m => m.setMap(null));
    simpleMarkers = [];
    
    let filtered = [...allSimpleCollectes];
    if (currentMapFilter !== "all") {
        filtered = filtered.filter(c => {
            if (currentMapFilter === "recues") return c.status === "reçue" || c.status === "en_attente";
            if (currentMapFilter === "encours") return ["confirmée", "en_route"].includes(c.status);
            if (currentMapFilter === "terminees") return c.status === "collectée";
            if (currentMapFilter === "refusees") return c.status === "annulée";
            return true;
        });
    }
    
    const withCoords = filtered.filter(c => c.latitude && c.longitude && c.latitude !== 0);
    
    if (withCoords.length === 0) {
        console.log("Aucune collecte avec coordonnées");
        return;
    }
    
    withCoords.forEach(c => {
        const color = getStatusColor(c.status);
        
        const marker = new google.maps.Marker({
            position: { lat: parseFloat(c.latitude), lng: parseFloat(c.longitude) },
            map: simpleMap,
            title: c.client?.name || "Client",
            icon: {
                path: google.maps.SymbolPath.CIRCLE,
                fillColor: color,
                fillOpacity: 0.8,
                strokeColor: "white",
                strokeWeight: 2,
                scale: 10
            }
        });
        
        const infoWindow = new google.maps.InfoWindow({
            content: `
                <div style="padding: 8px; max-width: 200px;">
                    <strong>${escapeHtml(c.client?.name || "Client")}</strong><br>
                    📞 ${c.client?.phone || "-"}<br>
                    📍 ${c.adresse || "-"}<br>
                    📅 ${formatDate(c.scheduled_at)}<br>
                    <span style="color:${color}">● ${getStatusLabel(c.status)}</span>
                </div>
            `
        });
        
        marker.addListener("click", () => {
            infoWindow.open(simpleMap, marker);
        });
        
        simpleMarkers.push(marker);
    });
    
    // Ajuster la vue
    if (simpleMarkers.length > 0) {
        const bounds = new google.maps.LatLngBounds();
        simpleMarkers.forEach(m => bounds.extend(m.position));
        simpleMap.fitBounds(bounds);
    }
}

// Zoomer sur une collecte
function zoomOnCollecte(collecteId, lat, lng) {
    if (!lat || !lng || lat === 0) {
        toast("❌ Cette collecte n'a pas de position GPS", "error");
        return;
    }
    
    if (simpleMap) {
        simpleMap.setCenter({ lat: parseFloat(lat), lng: parseFloat(lng) });
        simpleMap.setZoom(17);
        
        // Mettre en évidence l'élément
        document.querySelectorAll(".collecte-item").forEach(el => {
            el.style.background = "rgba(255,255,255,0.03)";
        });
        
        // Trouver et surligner l'élément cliqué
        const items = document.querySelectorAll(".collecte-item");
        for (let i = 0; i < items.length; i++) {
            const onclick = items[i].getAttribute("onclick");
            if (onclick && onclick.includes(`zoomOnCollecte(${collecteId}`)) {
                items[i].style.background = "rgba(79,195,247,0.15)";
                break;
            }
        }
        
        toast(`📍 Centré sur la collecte #${collecteId}`, "info");
    }
}

// Helper couleurs
function getStatusColor(status) {
    const colors = {
        "reçue": "#FF9800",
        "en_attente": "#FF9800",
        "confirmée": "#2196F3",
        "en_route": "#9C27B0",
        "collectée": "#4CAF50",
        "annulée": "#f44336"
    };
    return colors[status] || "#FF9800";
}

function getStatusLabel(status) {
    const labels = {
        "reçue": "Reçue",
        "en_attente": "En attente",
        "confirmée": "Confirmée",
        "en_route": "En route",
        "collectée": "Collectée",
        "annulée": "Annulée"
    };
    return labels[status] || status;
}

// Rafraîchir la carte
function refreshSimpleMap() {
    loadSimpleCollectes();
}

// Point d'entrée pour la carte
function initMap() {
    console.log("📍 initMap appelée depuis le loader");
    // Attendre que Google Maps soit chargé
    if (typeof google !== 'undefined' && google.maps) {
        initSimpleMap();
    } else {
        console.log("⏳ Attente du chargement de Google Maps...");
        setTimeout(initMap, 500);
    }
}
// ============================================================
// AFFICHAGE DE LA LISTE DES CLIENTS
// ============================================================
function renderClientsList(filtered = null) {
    const container = document.getElementById("clients-list");
    const data = filtered || allMapCollectes;
    
    if (!data.length) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-map-marker-alt"></i><p>Aucune collecte trouvée</p></div>';
        return;
    }
    
    container.innerHTML = data.map(c => {
        const config = statusConfigMap[c.status] || statusConfigMap["en_attente"];
        const livreur = allMapLivreurs.find(l => l.id === c.livreur_id);
        const hasCoords = c.latitude && c.longitude;
        
        return `
            <div class="client-card" onclick="focusOnClient(${c.latitude || 0}, ${c.longitude || 0}, ${c.id})" style="${!hasCoords ? 'opacity:0.6;' : ''}">
                <div style="display:flex; align-items:center; gap:12px;">
                    <div class="client-avatar" style="background: ${config.bg}">
                        ${c.client?.name?.charAt(0) || "C"}
                    </div>
                    <div class="client-info" style="flex:1;">
                        <h4>${c.client?.name || "Client inconnu"}</h4>
                        <p><i class="fas fa-phone"></i> ${c.client?.phone || "—"} · <i class="fas fa-map-marker-alt"></i> ${c.quartier || "?"}</p>
                    </div>
                    <div class="status-badge" style="background:${config.bg}20; color:${config.bg};">${config.label}</div>
                </div>
                <div style="margin-top:8px; font-size:11px; color:#aaa; display:flex; gap:12px; flex-wrap:wrap;">
                    <span><i class="fas fa-calendar"></i> ${formatDate(c.scheduled_at)}</span>
                    <span><i class="fas fa-clock"></i> ${c.creneau || "—"}</span>
                    <span><i class="fas fa-truck"></i> ${livreur?.name || "Non assigné"}</span>
                </div>
                <div style="margin-top:8px; font-size:10px; color:${hasCoords ? '#4CAF50' : '#f44336'};">
                    ${hasCoords ? 
                        `<i class="fas fa-check-circle"></i> Coordonnées: ${c.latitude.toFixed(6)}, ${c.longitude.toFixed(6)}` : 
                        `<i class="fas fa-exclamation-triangle"></i> Position non disponible - Cliquez pour géocoder`}
                </div>
                <div style="margin-top:8px; display:flex; gap:6px;">
                    <button class="btn-export" style="flex:1;" onclick="event.stopPropagation(); sharePosition(${c.latitude || 0}, ${c.longitude || 0}, '${c.client?.name || 'Client'}')" ${!hasCoords ? 'disabled' : ''}>
                        📤 Partager
                    </button>
                    <button class="btn-export" style="flex:1;" onclick="event.stopPropagation(); getDirectionsTo(${c.latitude || 0}, ${c.longitude || 0})" ${!hasCoords ? 'disabled' : ''}>
                        🗺️ Itinéraire
                    </button>
                    <button class="btn-export" style="flex:1;" onclick="event.stopPropagation(); geocodeCollecte(${c.id}, '${c.adresse?.replace(/'/g, "\\'") || ""}')">
                        <i class="fas fa-map-pin"></i> Géocoder
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// ══════════════════════════════════════════════════════════
// 11. NOTIFICATIONS
// ══════════════════════════════════════════════════════════
async function sendBroadcast() {
  const titre   = document.getElementById("notif-titre")?.value?.trim();
  const message = document.getElementById("notif-message")?.value?.trim();
  if (!titre || !message) { 
    toast("Remplissez le titre et le message", "error"); 
    return; 
  }
  try {
    // ⚠️ URL CORRECTE : /notifications/admin/broadcast
    const r = await apiPost("/notifications/admin/broadcast", { titre, message });
    toast(`✅ ${r?.message || "Notification envoyée"}`);
    if (document.getElementById("notif-titre")) document.getElementById("notif-titre").value = "";
    if (document.getElementById("notif-message")) document.getElementById("notif-message").value = "";
  } catch(e) { 
    toast(e.message, "error"); 
  }
}
// ══════════════════════════════════════════════════════════
// 12. AUDIT
// ══════════════════════════════════════════════════════════
async function loadAudit() {
  const el = document.getElementById("table-audit");
  loading(el);
  try {
    const data = await apiGet("/admin/audit?limit=50");
    if (!data) return;
    if (!data.length) { el.innerHTML = '<div class="empty-state"><p>Aucune activité</p></div>'; return; }
    el.innerHTML = `<table>
      <thead><tr><th>#</th><th>Admin</th><th>Action</th><th>Date</th></tr></thead>
      <tbody>${data.map(l => `<tr>
        <td>#${l.id}</td>
        <td>Admin #${l.admin_id||"?"}</td>
        <td style="color:#9E9E9E">${l.action||""}</td>
        <td style="color:#9E9E9E;font-size:12px">${formatDateTime(l.created_at)}</td>
      </tr>`).join("")}</tbody></table>`;
  } catch(e) { toast(e.message, "error"); }
}

// ══════════════════════════════════════════════════════════
// 13. GESTION DES SERVICES
// ══════════════════════════════════════════════════════════
async function loadAdminServices() {
  const el = document.getElementById("table-admin-services");
  if (!el) return;
  loading(el);
  try {
    const data = await apiGet("/admin/services/");
    if (!data) return;
    if (!data.length) {
      el.innerHTML = '<div class="empty-state"><i class="fas fa-tools"></i><p>Aucun service</p></div>';
      return;
    }
    el.innerHTML = `
      <table class="data-table">
        <thead>
          <tr><th>ID</th><th>Service</th><th>Catégorie</th><th>Prix/heure</th><th>Statut</th><th>Actions</th></tr>
        </thead>
        <tbody>
          ${data.map(s => `
            <tr>
              <td>#${s.id}</td>
              <td><b>${escapeHtml(s.name)}</b><br><small>${escapeHtml(s.description || "")}</small></td>
              <td><span class="category-badge">${escapeHtml(s.category || "—")}</span></td>
              <td style="color:#FFCC80">${formatFCFA(s.price_per_hour)}/h</td>
              <td>${s.active ? '<span class="status-active">✅ Actif</span>' : '<span class="status-inactive">❌ Inactif</span>'}</td>
              <td style="display:flex; gap:6px; flex-wrap:wrap">
                <button class="btn btn-outline btn-sm" onclick="openEditServiceModal(${s.id})">✏️</button>
                <button class="btn btn-danger btn-sm" onclick="deleteService(${s.id})">🗑</button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  } catch(e) { toast(e.message, "error"); }
}

function openAddServiceModal() {
  currentServiceId = null;
  openModal(`
    <div class="modal" style="max-width:550px">
      <div class="modal-header">
        <div class="modal-title">➕ Ajouter un service</div>
        <button class="modal-close" onclick="closeModal()">✕</button>
      </div>
      <div class="input-group"><label class="input-label">Nom du service *</label><input id="service-name" class="input" placeholder="Ex: Plombier"></div>
      <div class="input-group"><label class="input-label">Description</label><textarea id="service-desc" class="input" rows="2" placeholder="Description"></textarea></div>
      <div class="input-group"><label class="input-label">Catégorie</label><input id="service-category" class="input" placeholder="Ex: 🔧 Maintenance"></div>
      <div class="input-group"><label class="input-label">Prix par heure (FCFA)</label><input id="service-price" class="input" type="number" placeholder="0"></div>
      <div class="input-group"><label class="input-label">Icône</label><input id="service-icon" class="input" value="construction_rounded"></div>
      <div class="input-group"><label class="input-label">Couleur (hex)</label><input id="service-color" class="input" value="#4FC3F7"></div>
      <div class="input-group"><label class="input-label">Statut</label>
        <select id="service-active" class="input">
          <option value="true">Actif</option>
          <option value="false">Inactif</option>
        </select>
      </div>
      <div style="display:flex; gap:10px; margin-top:20px">
        <button class="btn btn-primary" onclick="saveService()">💾 Enregistrer</button>
        <button class="btn btn-outline" onclick="closeModal()">Annuler</button>
      </div>
    </div>
  `);
}

async function openEditServiceModal(id) {
  currentServiceId = id;
  try {
    const services = await apiGet("/admin/services/");
    const service = services.find(s => s.id === id);
    if (!service) return;
    openModal(`
      <div class="modal" style="max-width:550px">
        <div class="modal-header">
          <div class="modal-title">✏️ Modifier le service</div>
          <button class="modal-close" onclick="closeModal()">✕</button>
        </div>
        <div class="input-group"><label class="input-label">Nom</label><input id="service-name" class="input" value="${escapeHtml(service.name)}"></div>
        <div class="input-group"><label class="input-label">Description</label><textarea id="service-desc" class="input" rows="2">${escapeHtml(service.description || "")}</textarea></div>
        <div class="input-group"><label class="input-label">Catégorie</label><input id="service-category" class="input" value="${escapeHtml(service.category || "")}"></div>
        <div class="input-group"><label class="input-label">Prix/heure</label><input id="service-price" class="input" type="number" value="${service.price_per_hour}"></div>
        <div class="input-group"><label class="input-label">Icône</label><input id="service-icon" class="input" value="${service.icon}"></div>
        <div class="input-group"><label class="input-label">Couleur</label><input id="service-color" class="input" value="${service.color}"></div>
        <div class="input-group"><label class="input-label">Statut</label>
          <select id="service-active" class="input">
            <option value="true" ${service.active ? "selected" : ""}>Actif</option>
            <option value="false" ${!service.active ? "selected" : ""}>Inactif</option>
          </select>
        </div>
        <div style="display:flex; gap:10px; margin-top:20px">
          <button class="btn btn-primary" onclick="updateService()">💾 Enregistrer</button>
          <button class="btn btn-outline" onclick="closeModal()">Annuler</button>
        </div>
      </div>
    `);
  } catch(e) { toast(e.message, "error"); }
}

async function saveService() {
  const data = {
    name: document.getElementById("service-name")?.value.trim(),
    description: document.getElementById("service-desc")?.value.trim(),
    category: document.getElementById("service-category")?.value.trim(),
    price_per_hour: parseFloat(document.getElementById("service-price")?.value) || 0,
    icon: document.getElementById("service-icon")?.value.trim() || "construction_rounded",
    color: document.getElementById("service-color")?.value.trim() || "#4FC3F7",
    active: document.getElementById("service-active")?.value === "true"
  };
  if (!data.name) { toast("Le nom est obligatoire", "error"); return; }
  try {
    await apiPost("/admin/services/", data);
    toast("✅ Service ajouté");
    closeModal();
    loadAdminServices();
  } catch(e) { toast(e.message, "error"); }
}

async function updateService() {
  const data = {
    name: document.getElementById("service-name")?.value.trim(),
    description: document.getElementById("service-desc")?.value.trim(),
    category: document.getElementById("service-category")?.value.trim(),
    price_per_hour: parseFloat(document.getElementById("service-price")?.value),
    icon: document.getElementById("service-icon")?.value.trim(),
    color: document.getElementById("service-color")?.value.trim(),
    active: document.getElementById("service-active")?.value === "true"
  };
  try {
    await apiPut(`/admin/services/${currentServiceId}`, data);
    toast("✅ Service modifié");
    closeModal();
    loadAdminServices();
  } catch(e) { toast(e.message, "error"); }
}

async function deleteService(id) {
  if (!confirm("Supprimer ce service définitivement ?")) return;
  try {
    await apiDelete(`/admin/services/${id}`);
    toast("🗑 Service supprimé");
    loadAdminServices();
  } catch(e) { toast(e.message, "error"); }
}

// ── GESTION DES PROFESSIONNELS ───────────────────────────────────
async function loadProfessionals() {
  const el = document.getElementById("table-professionals");
  if (!el) return;
  loading(el);
  try {
    const [pros, services] = await Promise.all([
      apiGet("/admin/professionals/all"),
      apiGet("/admin/services/")
    ]);
    allProfessionals = pros || [];
    allServicesForFilter = services || [];
    const filterSelect = document.getElementById("filter-pro-service");
    if (filterSelect) {
      filterSelect.innerHTML = '<option value="">Tous les services</option>' + 
        allServicesForFilter.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("");
    }
    if (!allProfessionals.length) {
      el.innerHTML = '<div class="empty-state"><i class="fas fa-users"></i><p>Aucun professionnel</p></div>';
      return;
    }
    renderProfessionalsTable(allProfessionals);
  } catch(e) { toast(e.message, "error"); }
}

function renderProfessionalsTable(pros) {
  const el = document.getElementById("table-professionals");
  if (!el) return;
  el.innerHTML = `
    <table class="data-table">
      <thead>
        <tr><th>ID</th><th>Service</th><th>Nom</th><th>Téléphone</th><th>Zone</th><th>Dispo</th><th>Actions</th></tr>
      </thead>
      <tbody>
        ${pros.map(p => `
          <tr>
            <td>#${p.id}</td>
            <td><span style="color:#4FC3F7">${escapeHtml(p.service_name || "-")}</span></td>
            <td><b>${escapeHtml(p.name)}</b><br><small>${escapeHtml(p.description || "")}</small></td>
            <td style="color:#80CBC4">${p.phone}</td>
            <td>${escapeHtml(p.zone || "-")}</td>
            <td>${p.disponible ? '<span style="color:#80CBC4">✅ Dispo</span>' : '<span style="color:#EF9A9A">❌ Indispo</span>'}</td>
            <td style="display:flex; gap:6px">
              <button class="btn btn-outline btn-sm" onclick='openEditProfessionalModal(${JSON.stringify(p)})'>✏️</button>
              <button class="btn btn-danger btn-sm" onclick="deleteProfessional(${p.id})">🗑</button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function filterProfessionals() {
  const search = document.getElementById("search-pro")?.value.toLowerCase() || "";
  const serviceId = document.getElementById("filter-pro-service")?.value || "";
  let filtered = allProfessionals;
  if (search) {
    filtered = filtered.filter(p => 
      p.name?.toLowerCase().includes(search) || 
      p.phone?.includes(search) ||
      p.zone?.toLowerCase().includes(search)
    );
  }
  if (serviceId) {
    filtered = filtered.filter(p => p.service_id == serviceId);
  }
  renderProfessionalsTable(filtered);
}

function openAddProfessionalFullModal() {
  openModal(`
    <div class="modal" style="max-width:550px">
      <div class="modal-header">
        <div class="modal-title">➕ Ajouter un professionnel</div>
        <button class="modal-close" onclick="closeModal()">✕</button>
      </div>
      <div class="input-group"><label class="input-label">Service *</label>
        <select id="pro-service-id" class="input">
          <option value="">-- Choisir --</option>
          ${allServicesForFilter.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("")}
        </select>
      </div>
      <div class="input-group"><label class="input-label">Nom *</label><input id="pro-name" class="input"></div>
      <div class="input-group"><label class="input-label">Téléphone *</label><input id="pro-phone" class="input" type="tel"></div>
      <div class="input-group"><label class="input-label">Zone/Quartier</label><input id="pro-zone" class="input"></div>
      <div class="input-group"><label class="input-label">Description</label><textarea id="pro-desc" class="input" rows="2"></textarea></div>
      <div class="input-group"><label class="input-label">Années expérience</label><input id="pro-years" class="input" type="number" value="0"></div>
      <div class="input-group"><label class="input-label">Disponible</label>
        <select id="pro-disponible" class="input"><option value="true">✅ Oui</option><option value="false">❌ Non</option></select>
      </div>
      <div style="display:flex; gap:10px; margin-top:20px">
        <button class="btn btn-primary" onclick="saveProfessionalFull()">💾 Enregistrer</button>
        <button class="btn btn-outline" onclick="closeModal()">Annuler</button>
      </div>
    </div>
  `);
}

async function saveProfessionalFull() {
  const data = {
    service_id: document.getElementById("pro-service-id")?.value,
    name: document.getElementById("pro-name")?.value.trim(),
    phone: document.getElementById("pro-phone")?.value.trim(),
    zone: document.getElementById("pro-zone")?.value.trim(),
    description: document.getElementById("pro-desc")?.value.trim(),
    years_experience: parseInt(document.getElementById("pro-years")?.value) || 0,
    disponible: document.getElementById("pro-disponible")?.value === "true"
  };
  if (!data.service_id) { toast("Choisissez un service", "error"); return; }
  if (!data.name) { toast("Le nom est obligatoire", "error"); return; }
  if (!data.phone) { toast("Le téléphone est obligatoire", "error"); return; }
  try {
    await apiPost("/admin/professionals/", data);
    toast("✅ Professionnel ajouté");
    closeModal();
    loadProfessionals();
  } catch(e) { toast(e.message, "error"); }
}

function openEditProfessionalModal(pro) {
  openModal(`
    <div class="modal" style="max-width:550px">
      <div class="modal-header">
        <div class="modal-title">✏️ Modifier - ${escapeHtml(pro.name)}</div>
        <button class="modal-close" onclick="closeModal()">✕</button>
      </div>
      <div class="input-group"><label class="input-label">Service</label>
        <select id="pro-service-id" class="input">
          ${allServicesForFilter.map(s => `<option value="${s.id}" ${s.id == pro.service_id ? "selected" : ""}>${escapeHtml(s.name)}</option>`).join("")}
        </select>
      </div>
      <div class="input-group"><label class="input-label">Nom</label><input id="pro-name" class="input" value="${escapeHtml(pro.name)}"></div>
      <div class="input-group"><label class="input-label">Téléphone</label><input id="pro-phone" class="input" type="tel" value="${pro.phone}"></div>
      <div class="input-group"><label class="input-label">Zone</label><input id="pro-zone" class="input" value="${escapeHtml(pro.zone || "")}"></div>
      <div class="input-group"><label class="input-label">Description</label><textarea id="pro-desc" class="input" rows="2">${escapeHtml(pro.description || "")}</textarea></div>
      <div class="input-group"><label class="input-label">Années expérience</label><input id="pro-years" class="input" type="number" value="${pro.years_experience || 0}"></div>
      <div class="input-group"><label class="input-label">Disponible</label>
        <select id="pro-disponible" class="input"><option value="true" ${pro.disponible ? "selected" : ""}>✅ Oui</option><option value="false" ${!pro.disponible ? "selected" : ""}>❌ Non</option></select>
      </div>
      <div style="display:flex; gap:10px; margin-top:20px">
        <button class="btn btn-primary" onclick="updateProfessionalFull(${pro.id})">💾 Enregistrer</button>
        <button class="btn btn-outline" onclick="closeModal()">Annuler</button>
      </div>
    </div>
  `);
}

async function updateProfessionalFull(id) {
  const data = {
    service_id: document.getElementById("pro-service-id")?.value,
    name: document.getElementById("pro-name")?.value.trim(),
    phone: document.getElementById("pro-phone")?.value.trim(),
    zone: document.getElementById("pro-zone")?.value.trim(),
    description: document.getElementById("pro-desc")?.value.trim(),
    years_experience: parseInt(document.getElementById("pro-years")?.value) || 0,
    disponible: document.getElementById("pro-disponible")?.value === "true"
  };
  try {
    await apiPut(`/admin/professionals/${id}`, data);
    toast("✅ Professionnel modifié");
    closeModal();
    loadProfessionals();
  } catch(e) { toast(e.message, "error"); }
}

async function deleteProfessional(id) {
  if (!confirm("Supprimer ce professionnel ?")) return;
  try {
    await apiDelete(`/admin/professionals/${id}`);
    toast("🗑 Professionnel supprimé");
    loadProfessionals();
  } catch(e) { toast(e.message, "error"); }
}

// ══════════════════════════════════════════════════════════
// 14. RÉSERVATIONS DE SERVICES AVEC CARTE
// ══════════════════════════════════════════════════════════
async function loadServiceReservations(status = "") {
  const el = document.getElementById("table-service-reservations");
  if (!el) return;
  loading(el);
  try {
    const url = status ? `/admin/services/reservations?status=${status}` : "/admin/services/reservations";
    const data = await apiGet(url);
    if (!data) return;
    serviceReservationsMap = data;
    if (!data.length) {
      el.innerHTML = '<div class="empty-state"><i class="fas fa-calendar-check"></i><p>Aucune réservation</p></div>';
      return;
    }
    el.innerHTML = `
      <table class="data-table">
        <thead>
          <tr><th>ID</th><th>Client</th><th>Service</th><th>Adresse</th><th>Date</th><th>Durée</th><th>Total</th><th>Statut</th><th>Actions</th></tr>
        </thead>
        <tbody>
          ${data.map(r => `
            <tr>
              <td>#${r.id}</td>
              <td>${r.user?.name || "?"}<br><small>📞 ${r.user?.phone || ""}</small></td>
              <td>${r.service?.name || "?"}</td>
              <td><i class="fas fa-map-marker-alt" style="color:#4FC3F7"></i> ${r.adresse?.substring(0, 30) || "—"}<br><small>📍 ${r.latitude?.toFixed(4) || "?"}, ${r.longitude?.toFixed(4) || "?"}</small></td>
              <td>${r.date}<br><small>${r.creneau}</small></td>
              <td>${r.duree_heures}h</td>
              <td style="color:#FFCC80">${formatFCFA(r.montant_total)}</td>
              <td>${statusBadge(r.status)}</td>
              <td style="display:flex; gap:6px; flex-wrap:wrap">
                <button class="btn btn-outline btn-sm" onclick="viewServiceReservationDetail(${r.id})">👁</button>
                <button class="btn btn-sm ${r.latitude ? 'btn-primary' : 'btn-outline'}" onclick="openServiceReservationMap(${r.id})" ${!r.latitude ? 'disabled' : ''}>🗺️</button>
                <select onchange="updateServiceReservationStatus(${r.id}, this.value)" class="input" style="width:110px; padding:4px; font-size:11px">
                  <option value="en_attente" ${r.status === "en_attente" ? "selected" : ""}>⏳ En attente</option>
                  <option value="confirmée" ${r.status === "confirmée" ? "selected" : ""}>✅ Confirmée</option>
                  <option value="terminée" ${r.status === "terminée" ? "selected" : ""}>🏁 Terminée</option>
                  <option value="annulée" ${r.status === "annulée" ? "selected" : ""}>❌ Annulée</option>
                </select>
               </td>
             </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  } catch(e) { toast(e.message, "error"); }
}

async function updateServiceReservationStatus(id, status) {
  const note = prompt("Note admin (optionnelle) :");
  try {
    await apiPut(`/admin/services/reservations/${id}/status`, { status, admin_notes: note });
    toast(`✅ Réservation mise à jour: ${status}`);
    loadServiceReservations();
  } catch(e) { toast(e.message, "error"); }
}

async function viewServiceReservationDetail(id) {
  try {
    const r = await apiGet(`/admin/services/reservations/${id}`);
    openModal(`
      <div class="modal" style="max-width:550px">
        <div class="modal-header">
          <div class="modal-title">📋 Réservation #${r.id}</div>
          <button class="modal-close" onclick="closeModal()">✕</button>
        </div>
        <div style="margin-bottom:16px">
          <div style="background:#1A237E20; padding:12px; border-radius:12px; margin-bottom:12px">
            <div><strong>👤 Client:</strong> ${r.user?.name} (${r.user?.phone || r.user?.email})</div>
            <div><strong>🔧 Service:</strong> ${r.service?.name}</div>
          </div>
          <div style="background:#0D1235; padding:12px; border-radius:12px; margin-bottom:12px">
            <div><strong>📍 Adresse:</strong> ${r.adresse}</div>
            <div><strong>🏘️ Quartier:</strong> ${r.quartier || "—"}</div>
            <div><strong>📌 Coordonnées:</strong> ${r.latitude?.toFixed(6) || "—"}, ${r.longitude?.toFixed(6) || "—"}</div>
          </div>
          <div style="background:#0D1235; padding:12px; border-radius:12px">
            <div><strong>📅 Date:</strong> ${r.date} à ${r.creneau}</div>
            <div><strong>⏱️ Durée:</strong> ${r.duree_heures}h</div>
            <div><strong>⚡ Urgence:</strong> ${r.urgence ? "Oui" : "Non"}</div>
            <div><strong>💰 Total:</strong> ${formatFCFA(r.montant_total)}</div>
          </div>
          ${r.description_probleme ? `<div class="info-text" style="margin-top:12px"><strong>📝 Description:</strong> ${escapeHtml(r.description_probleme)}</div>` : ""}
        </div>
        <div style="display:flex; gap:10px">
          <button class="btn btn-primary" onclick="openServiceReservationMap(${r.id})">🗺️ Voir carte</button>
          <button class="btn btn-outline" onclick="closeModal()">Fermer</button>
        </div>
      </div>
    `);
  } catch(e) { toast(e.message, "error"); }
}

function openServiceReservationMap(id) {
  const reservation = serviceReservationsMap?.find(r => r.id === id);
  if (!reservation || !reservation.latitude || !reservation.longitude) {
    toast("Cette réservation n'a pas de coordonnées GPS", "error");
    return;
  }
  openModal(`
    <div class="modal" style="max-width:800px">
      <div class="modal-header">
        <div class="modal-title">🗺️ Position - Réservation #${id}</div>
        <button class="modal-close" onclick="closeModal()">✕</button>
      </div>
      <div id="single-reservation-map" style="height:400px; width:100%; border-radius:12px"></div>
      <div style="margin-top:16px; padding:12px; background:#0D1235; border-radius:12px">
        <div><strong>📍 Adresse:</strong> ${reservation.adresse}</div>
        <div><strong>📌 Coordonnées:</strong> ${reservation.latitude.toFixed(6)}, ${reservation.longitude.toFixed(6)}</div>
        <div><strong>👤 Client:</strong> ${reservation.user?.name}</div>
      </div>
      <div style="display:flex; gap:10px; margin-top:16px">
        <a href="https://www.google.com/maps?q=${reservation.latitude},${reservation.longitude}" target="_blank" class="btn btn-primary">🗺️ Google Maps</a>
        <button class="btn btn-outline" onclick="closeModal()">Fermer</button>
      </div>
    </div>
  `);
  setTimeout(() => {
    if (window.L) {
      const mapDiv = document.getElementById("single-reservation-map");
      if (mapDiv) {
        const map = L.map(mapDiv).setView([reservation.latitude, reservation.longitude], 16);
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '© OpenStreetMap contributors'
        }).addTo(map);
        L.marker([reservation.latitude, reservation.longitude]).addTo(map)
          .bindPopup(`<b>${reservation.service?.name}</b><br>${reservation.adresse}`)
          .openPopup();
      }
    }
  }, 100);
}

// =====================================================
// COMMANDES DÉTAILLÉES AVEC PHOTOS
// =====================================================

let allCommandesDetail = [];

async function loadCommandesDetail() {
  const el = document.getElementById("commandes-detail-container");
  loading(el);
  try {
    const data = await apiGet("/admin/commandes/detail");
    allCommandesDetail = data;
    
    if (!data.length) {
      el.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i><p>Aucune commande</p></div>';
      return;
    }
    
    // Grouper par commande
    const grouped = {};
    data.forEach(item => {
      if (!grouped[item.commande_id]) {
        grouped[item.commande_id] = {
          id: item.commande_id,
          client_name: item.client_name,
          client_phone: item.client_phone,
          client_address: item.client_address,
          status: item.commande_status,
          date: item.commande_date,
          total: item.facture_total || 0,
          articles: []
        };
      }
      if (item.designation) {
        grouped[item.commande_id].articles.push({
          id: item.article_id,
          designation: item.designation,
          quantity: item.quantity,
          price: item.price,
          status: item.article_status,
          photo_avant: item.photo_avant,
          photo_apres: item.photo_apres,
          photo_avant_date: item.photo_avant_date,
          photo_apres_date: item.photo_apres_date
        });
      }
    });
    
    renderCommandesDetail(Object.values(grouped));
  } catch(e) { 
    toast(e.message, "error"); 
    el.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Erreur chargement</p></div>';
  }
}

function renderCommandesDetail(commandes) {
  const el = document.getElementById("commandes-detail-container");
  if (!el) return;
  
  const searchTerm = document.getElementById("search-commande")?.value.toLowerCase() || "";
  const statusFilter = document.getElementById("filter-cmd-detail-status")?.value || "";
  
  let filtered = commandes;
  if (searchTerm) {
    filtered = filtered.filter(c => 
      c.id.toString().includes(searchTerm) ||
      (c.client_name || "").toLowerCase().includes(searchTerm) ||
      c.articles.some(a => a.designation.toLowerCase().includes(searchTerm))
    );
  }
  if (statusFilter) {
    filtered = filtered.filter(c => c.status === statusFilter);
  }
  
  // Compter les commandes avec photos manquantes
  const missingPhotos = filtered.filter(c => 
    c.articles.some(a => !a.photo_avant || !a.photo_apres)
  ).length;
  updateBadge("badge-photos", missingPhotos);
  
  if (!filtered.length) {
    el.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i><p>Aucune commande trouvée</p></div>';
    return;
  }
  
  el.innerHTML = `
    <div style="display:flex; flex-direction: column; gap: 20px;">
      ${filtered.map(cmd => `
        <div class="card" style="margin-bottom:0">
          <div class="card-header">
            <div>
              <div class="card-title" style="font-size:16px">
                <span style="color:#4FC3F7">#${cmd.id}</span> - ${cmd.client_name || 'Client inconnu'}
              </div>
              <div style="font-size:12px; color:var(--text3); margin-top:4px">
                📞 ${cmd.client_phone || '-'} | 📍 ${cmd.client_address || '-'} | 📅 ${formatDate(cmd.date)}
              </div>
            </div>
            <div style="display:flex; gap:10px; align-items:center">
              <span class="task-badge ${getStatusBadgeClass(cmd.status)}">${getStatusLabel(cmd.status)}</span>
              <span style="color:#FFCC80; font-weight:700">${formatFCFA(cmd.total)}</span>
            </div>
          </div>
          
          <div style="margin-top:16px">
            <table class="data-table">
              <thead>
                <tr><th>Article</th><th>Qté</th><th>Prix</th><th>Statut</th><th colspan="2">Photos</th></tr>
              </thead>
              <tbody>
                ${cmd.articles.map(article => `
                  <tr>
                    <td><b>${escapeHtml(article.designation)}</b></td>
                    <td>${article.quantity}</td>
                    <td>${formatFCFA(article.price * article.quantity)}</td>
                    <td>${getStatusBadgeSmall(article.status)}</td>
                    <td style="width:120px">
                      ${article.photo_avant 
                        ? `<img src="${API_URL}${article.photo_avant}" class="photo-preview" onclick="openPhotoModal('${API_URL}${article.photo_avant}', 'Photo AVANT - ${escapeHtml(article.designation)}')" title="Photo AVANT">`
                        : '<div class="photo-placeholder" onclick="uploadPhoto(${cmd.id}, ${article.id}, \'avant\')">📷 AVANT</div>'}
                     </td>
                    <td style="width:120px">
                      ${article.photo_apres 
                        ? `<img src="${API_URL}${article.photo_apres}" class="photo-preview" onclick="openPhotoModal('${API_URL}${article.photo_apres}', 'Photo APRÈS - ${escapeHtml(article.designation)}')" title="Photo APRÈS">`
                        : '<div class="photo-placeholder" onclick="uploadPhoto(${cmd.id}, ${article.id}, \'apres\')">📷 APRÈS</div>'}
                     </td>
                   </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          
          <div class="task-actions" style="margin-top:16px">
            <button class="btn btn-outline btn-sm" onclick="generateValidationCode(${cmd.id})">🔑 Générer code validation</button>
            <button class="btn btn-primary btn-sm" onclick="openCmdModal(${cmd.id})">📋 Détails commande</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function getStatusBadgeClass(status) {
  const classes = {
    'reçue': 'badge-attente',
    'en_lavage': 'badge-en_cours',
    'en_repassage': 'badge-transit',
    'prête': 'badge-done',
    'livrée': 'badge-done'
  };
  return classes[status] || 'badge-attente';
}

function getStatusLabel(status) {
  const labels = {
    'reçue': 'Reçue',
    'en_lavage': 'En lavage',
    'en_repassage': 'En repassage',
    'prête': 'Prête',
    'livrée': 'Livrée'
  };
  return labels[status] || status;
}

function getStatusBadgeSmall(status) {
  const colors = {
    'collecté': '#FFCC80',
    'en_lavage': '#4FC3F7',
    'en_repassage': '#CE93D8',
    'prêt': '#80CBC4',
    'livré': '#00E676'
  };
  const color = colors[status] || '#9E9E9E';
  return `<span style="background:${color}22; color:${color}; padding:3px 8px; border-radius:12px; font-size:10px">${status}</span>`;
}

function filterCommandesDetail() {
  if (allCommandesDetail.length) {
    renderCommandesDetail(Object.values(allCommandesDetail.reduce((acc, item) => {
      if (!acc[item.commande_id]) {
        acc[item.commande_id] = {
          id: item.commande_id,
          client_name: item.client_name,
          client_phone: item.client_phone,
          client_address: item.client_address,
          status: item.commande_status,
          date: item.commande_date,
          total: item.facture_total || 0,
          articles: []
        };
      } 
      if (item.designation) {
        acc[item.commande_id].articles.push({
          designation: item.designation,
          quantity: item.quantity,
          price: item.price,
          status: item.article_status,
          photo_avant: item.photo_avant,
          photo_apres: item.photo_apres
        });
      }
      return acc;
    }, {})));
  }
}

function openPhotoModal(imageUrl, title) {
  openModal(`
    <div class="modal" style="max-width:600px">
      <div class="modal-header">
        <div class="modal-title">${escapeHtml(title)}</div>
        <button class="modal-close" onclick="closeModal()">✕</button>
      </div>
      <div style="padding:20px; text-align:center">
        <img src="${imageUrl}" style="max-width:100%; max-height:60vh; border-radius:12px">
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="window.open('${imageUrl}', '_blank')">🔍 Ouvrir</button>
        <button class="btn btn-primary" onclick="closeModal()">Fermer</button>
      </div>
    </div>
  `);
}

async function generateValidationCode(commandeId) {
  try {
    const data = await apiPost(`/admin/commandes/${commandeId}/generate-validation-code`, {});
    toast(`✅ Code envoyé: ${data.code}`);
  } catch(e) { toast(e.message, "error"); }
}

async function uploadPhoto(commandeId, articleId, type) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append('photo', file);
    formData.append('type', type);
    
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch(`${API_URL}/admin/commandes/${commandeId}/articles/${articleId}/photos`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      if (response.ok) {
        toast(`✅ Photo ${type} uploadée`);
        loadCommandesDetail();
      } else {
        toast('❌ Erreur upload');
      }
    } catch(e) { toast('❌ Erreur réseau'); }
  };
  input.click();
}
// ═══════════════════════════════════════════════════════════════════════════
// MESSAGERIE ADMIN - VERSION AMÉLIORÉE
// ═══════════════════════════════════════════════════════════════════════════

// Variables pour WebSocket admin
let adminWebSocket = null;
let currentConvId = null;
let lastMessageId = 0;

// Connexion WebSocket pour l'admin
function initAdminWebSocket() {
  const token = localStorage.getItem("admin_token");
  const adminId = getUser().id || 1;
  
  if (adminWebSocket && adminWebSocket.readyState === WebSocket.OPEN) return;
  
  const wsUrl = `ws://${window.location.hostname}:9000/ws/${adminId}`;
  adminWebSocket = new WebSocket(wsUrl);
  
  adminWebSocket.onopen = () => {
    console.log("✅ WebSocket admin connecté");
  };
  
  adminWebSocket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    
    if (data.type === "new_message") {
      // Nouveau message reçu en temps réel
      const msg = data.message;
      
      // Mettre à jour l'affichage si la conversation est ouverte
      if (currentConvId && msg.conversation_id === currentConvId) {
        appendMessageToChat(msg);
        updateBadge("badge-msg", getUnreadCount());
      }
      
      // Rafraîchir la liste des conversations
      loadMessagerie();
      
      // Notification sonore (optionnel)
      playNotificationSound();
    }
    
    if (data.type === "typing") {
      if (currentConvId && data.conversation_id === currentConvId) {
        showTypingIndicator(data.user_id);
      }
    }
  };
  
  adminWebSocket.onclose = () => {
    console.log("❌ WebSocket admin déconnecté, reconnexion dans 5s...");
    setTimeout(initAdminWebSocket, 5000);
  };
}

function playNotificationSound() {
  const audio = new Audio('/static/notification.mp3');
  audio.play().catch(e => console.log("Son non joué"));
}

function showTypingIndicator(userId) {
  const typingDiv = document.getElementById("typing-indicator");
  if (typingDiv) {
    typingDiv.style.display = "block";
    setTimeout(() => {
      if (typingDiv) typingDiv.style.display = "none";
    }, 2000);
  }
}

function appendMessageToChat(msg) {
  const chatContainer = document.getElementById("chat-msgs");
  if (!chatContainer) return;
  
  const isAdmin = msg.sender_id !== window.currentClientId;
  const bg = isAdmin ? "rgba(21,101,192,0.3)" : "rgba(255,255,255,0.06)";
  const align = isAdmin ? "flex-end" : "flex-start";
  
  const msgHtml = `
    <div style="display:flex; justify-content:${align}; margin-bottom:10px">
      <div style="max-width:75%; background:${bg}; border-radius:12px; padding:10px 14px">
        ${msg.type === "offre" ? `<div style="font-weight:700; color:#FFCC80; margin-bottom:4px">🎁 Offre: ${formatFCFA(msg.montant_offre||0)}</div>` : ""}
        <div style="font-size:13px; color:white">${escapeHtml(msg.content || "")}</div>
        <div style="font-size:10px; color:#9E9E9E; margin-top:4px">
          ${isAdmin ? "Admin" : "Client"} · ${formatDateTime(msg.created_at)}
        </div>
      </div>
    </div>
  `;
  
  chatContainer.insertAdjacentHTML('beforeend', msgHtml);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Surcharger loadConvDetail pour WebSocket
const originalLoadConvDetail = loadConvDetail;
loadConvDetail = async function(id) {
  currentConvId = id;
  
  // Marquer comme lu
  await apiPut(`/admin/messagerie/${id}/read`);
  
  // Appeler la fonction originale
  await originalLoadConvDetail(id);
  
  // Ajouter indicateur de typing
  const detailDiv = document.getElementById("conv-detail");
  if (detailDiv) {
    const typingHtml = `<div id="typing-indicator" style="display:none; font-size:11px; color:#4FC3F7; padding:5px 14px">✏️ Client en train d'écrire...</div>`;
    const chatMsgs = document.getElementById("chat-msgs");
    if (chatMsgs) {
      chatMsgs.insertAdjacentHTML('afterend', typingHtml);
    }
  }
};

// Surcharger envoyerMsgAdmin pour WebSocket
const originalEnvoyerMsgAdmin = envoyerMsgAdmin;
envoyerMsgAdmin = async function(convId) {
  const inp = document.getElementById("msg-admin-txt");
  const content = inp?.value?.trim();
  if (!content) return;
  
  // Envoyer via WebSocket
  if (adminWebSocket && adminWebSocket.readyState === WebSocket.OPEN) {
    adminWebSocket.send(JSON.stringify({
      type: "message",
      conversation_id: convId,
      content: content
    }));
  }
  
  // Appeler l'API normale
  await originalEnvoyerMsgAdmin(convId);
  if (inp) inp.value = "";
  
  // Délai pour laisser le temps au WebSocket
  setTimeout(() => loadConvDetail(convId), 500);
};

// Surcharger envoyerOffre pour WebSocket
const originalEnvoyerOffre = envoyerOffre;
envoyerOffre = async function(convId) {
  const montant = parseFloat(document.getElementById("offre-montant")?.value || "0");
  if (!montant || montant <= 0) { toast("Entrez un montant valide", "error"); return; }
  
  // Envoyer via API
  await originalEnvoyerOffre(convId);
  
  // Notifier via WebSocket
  if (adminWebSocket && adminWebSocket.readyState === WebSocket.OPEN) {
    adminWebSocket.send(JSON.stringify({
      type: "offre",
      conversation_id: convId,
      content: `Offre de ${formatFCFA(montant)}`,
      montant: montant
    }));
  }
};

// Initialiser WebSocket au chargement
document.addEventListener("DOMContentLoaded", () => {
  // ... code existant ...
  setTimeout(initAdminWebSocket, 2000);
});
// ══════════════════════════════════════════════════════════
// NOTIFICATIONS - CLIENT SPÉCIFIQUE
// ══════════════════════════════════════════════════════════

// Basculer entre les onglets
function switchNotifTab(tab) {
  const allDiv = document.getElementById("notif-all");
  const singleDiv = document.getElementById("notif-single");
  const tabs = document.querySelectorAll("#page-notifications .tab");
  
  if (tab === 'all') {
    allDiv.style.display = "block";
    singleDiv.style.display = "none";
    tabs[0].classList.add("active");
    tabs[1].classList.remove("active");
  } else {
    allDiv.style.display = "none";
    singleDiv.style.display = "block";
    tabs[0].classList.remove("active");
    tabs[1].classList.add("active");
    loadUsersList();
  }
}

// Charger la liste des clients
async function loadUsersList() {
  try {
    const users = await apiGet("/admin/users?role=client");
    const select = document.getElementById("notif-user-id");
    if (select) {
      select.innerHTML = '<option value="">-- Sélectionner un client --</option>' + 
        users.map(u => `<option value="${u.id}">${u.name || u.email} (${u.phone || '-'})</option>`).join('');
    }
  } catch(e) {
    console.error("Erreur chargement clients:", e);
  }
}

// Afficher les infos du client sélectionné
async function loadClientInfo() {
  const userId = document.getElementById("notif-user-id")?.value;
  const infoDiv = document.getElementById("notif-user-info");
  if (!userId) {
    infoDiv.value = "";
    return;
  }
  try {
    const user = await apiGet(`/admin/users/${userId}`);
    infoDiv.value = `${user.email || ''} | ${user.phone || 'Pas de téléphone'} | ${user.nb_commandes} commandes`;
  } catch(e) {
    infoDiv.value = "Erreur chargement";
  }
}

// Envoyer à un seul utilisateur
async function sendToSingleUser() {
  const userId = document.getElementById("notif-user-id")?.value;
  const titre = document.getElementById("notif-single-titre")?.value?.trim();
  const message = document.getElementById("notif-single-message")?.value?.trim();
  
  if (!userId) {
    toast("Sélectionnez un client", "error");
    return;
  }
  if (!titre || !message) {
    toast("Remplissez le titre et le message", "error");
    return;
  }
  
  try {
    const token = localStorage.getItem("admin_token");
    const response = await fetch(`${API_URL}/notifications/user/${userId}?title=${encodeURIComponent(titre)}&message=${encodeURIComponent(message)}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await response.json();
    
    if (data.push_sent) {
      toast(`✅ Notification envoyée à ${userId} (push reçu)`, "success");
    } else {
      toast(`⚠️ Notification envoyée mais push non reçu (client hors ligne)`, "info");
    }
    
    // Vider les champs
    document.getElementById("notif-single-titre").value = "";
    document.getElementById("notif-single-message").value = "";
    
    // Rafraîchir l'historique
    loadNotificationHistory();
  } catch(e) {
    toast(`❌ Erreur: ${e.message}`, "error");
  }
}

// Tester la notification sur l'admin lui-même
async function testNotification() {
  const titre = prompt("Titre de la notification test:", "Test Notification");
  if (!titre) return;
  const message = prompt("Message:", "Ceci est un test");
  if (!message) return;
  
  try {
    const user = getUser();
    const userId = user.id || 9;
    const token = localStorage.getItem("admin_token");
    const response = await fetch(`${API_URL}/notifications/user/${userId}?title=${encodeURIComponent(titre)}&message=${encodeURIComponent(message)}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await response.json();
    if (data.push_sent) {
      toast("✅ Notification test envoyée ! Regardez votre téléphone 📱", "success");
    } else {
      toast("⚠️ Envoyé mais push non reçu", "info");
    }
  } catch(e) {
    toast(`❌ Erreur: ${e.message}`, "error");
  }
}

// Charger l'historique des notifications
async function loadNotificationHistory() {
  const container = document.getElementById("notification-history");
  if (!container) return;
  
  try {
    // Récupérer les 20 dernières notifications de l'admin (ou de tous)
    const notifs = await apiGet("/notifications/?limit=20");
    
    if (!notifs.length) {
      container.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i><p>Aucune notification envoyée</p></div>';
      return;
    }
    
    container.innerHTML = `
      <table class="data-table">
        <thead>
          <tr><th>Date</th><th>Titre</th><th>Message</th><th>Type</th><th>Lu</th></tr>
        </thead>
        <tbody>
          ${notifs.map(n => `
            <tr>
              <td style="font-size:12px">${formatDateTime(n.created_at)}</td>
              <td><span class="badge-cyan" style="padding:2px 8px; border-radius:12px">${n.title || '-'}</span></td>
              <td>${n.message?.substring(0, 60) || '-'}${n.message?.length > 60 ? '...' : ''}</td>
              <td>${n.type || 'systeme'}</td>
              <td>${n.read ? '✅' : '⏳'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch(e) {
    container.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Erreur chargement: ${e.message}</p></div>`;
  }
}

// Surcharge de sendBroadcast existante
const originalSendBroadcast = sendBroadcast;
sendBroadcast = async function() {
  const titre = document.getElementById("notif-titre")?.value?.trim();
  const message = document.getElementById("notif-message")?.value?.trim();
  if (!titre || !message) {
    toast("Remplissez le titre et le message", "error");
    return;
  }
  try {
    const r = await apiPost("/notifications/admin/broadcast", { titre, message });
    toast(`✅ ${r?.message || "Notification envoyée"} - ${r.push_envoyes} push envoyés`, "success");
    document.getElementById("notif-titre").value = "";
    document.getElementById("notif-message").value = "";
    loadNotificationHistory();
  } catch(e) {
    toast(e.message, "error");
  }
};

// ══════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", () => {
  initUserInfo();
  const rapMois = document.getElementById("rapport-mois");
  if (rapMois) rapMois.value = new Date().getMonth()+1;
  showPage("dashboard");
  setInterval(() => { if (currentPage === "dashboard") loadDashboard(); }, 60000);
});