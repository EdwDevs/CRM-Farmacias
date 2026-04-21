// ===== FIREBASE IMPORTS =====
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { 
    getAuth, 
    signInWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut 
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    onSnapshot, 
    doc, 
    updateDoc, 
    addDoc,
    deleteDoc,
    query, 
    orderBy,
    writeBatch,
    enableIndexedDbPersistence,
    getDocs
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// ===== CONFIG =====
const firebaseConfig = {
    apiKey: "AIzaSyB2glK3jtje7juBG7gMl4bzh6xG_Zz2YNU",
    authDomain: "crm-farmacias.firebaseapp.com",
    projectId: "crm-farmacias",
    storageBucket: "crm-farmacias.appspot.com",
    messagingSenderId: "251276216502",
    appId: "1:251276216502:web:374f708e2ff040192d3e17"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

enableIndexedDbPersistence(db).catch(console.warn);

// ===== CONSTANTS =====
const MONTHLY_GOAL = 120;
const DEFAULT_DAILY_GOAL = 16;

// ===== STATE =====
const state = {
    pharmacies: [],
    filteredPharmacies: [],
    config: {
        currentWorkDay: 1,
        pharmaciesPerDay: DEFAULT_DAILY_GOAL
    },
    user: null,
    loading: true
};

// ===== UTILS =====
const TOAST_ICONS = {
    success: '<svg class="icon icon-sm"><use href="#i-check-circle"/></svg>',
    error:   '<svg class="icon icon-sm"><use href="#i-x-circle"/></svg>',
    warning: '<svg class="icon icon-sm"><use href="#i-alert"/></svg>',
    info:    '<svg class="icon icon-sm"><use href="#i-info"/></svg>'
};
window.showToast = (title, message, type = 'info', options = {}) => {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const duration = options.duration || (options.action ? 6000 : 4000);
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const actionHtml = options.action
        ? `<div class="toast-actions"><button class="toast-btn" type="button" data-toast-action>${options.action.label || 'Deshacer'}</button></div>`
        : '';
    toast.innerHTML = `
        <div class="toast-icon">${TOAST_ICONS[type] || TOAST_ICONS.info}</div>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
            ${actionHtml}
        </div>
        <div class="toast-progress" style="animation-duration:${duration}ms"></div>
    `;
    container.appendChild(toast);
    let dismissed = false;
    const dismiss = () => {
        if (dismissed) return;
        dismissed = true;
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    };
    if (options.action) {
        const btn = toast.querySelector('[data-toast-action]');
        if (btn) {
            btn.addEventListener('click', () => {
                try { options.action.onClick(); } catch (e) { console.warn(e); }
                dismiss();
            });
        }
    }
    setTimeout(dismiss, duration);
};

window.togglePassword = () => {
    const input = document.getElementById('login-password');
    input.type = input.type === 'password' ? 'text' : 'password';
};

// ===== AUTH =====
onAuthStateChanged(auth, user => {
    if (user) {
        state.user = user;
        document.getElementById('login-page').style.display = 'none';
        document.getElementById('dashboard').style.display = 'grid';
        document.getElementById('dashboard').classList.add('fade-in');
        const _el_user_name = document.getElementById('user-name'); if (_el_user_name) _el_user_name.textContent = user.email.split('@')[0]; else console.error('Missing ID: user-name');
        const _el_user_avatar = document.getElementById('user-avatar'); if (_el_user_avatar) _el_user_avatar.textContent = user.email[0].toUpperCase(); else console.error('Missing ID: user-avatar');
        loadConfig();
        initPharmacyListener();
        window.showToast('Bienvenido', `Hola ${user.email}`, 'success');
    } else {
        document.getElementById('login-page').style.display = 'grid';
        document.getElementById('dashboard').style.display = 'none';
    }
});

document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    const errorEl = document.getElementById('login-error');
    
    btn.classList.add('loading');
    btn.disabled = true;
    errorEl.classList.remove('show');
    
    try {
        await signInWithEmailAndPassword(
            auth,
            document.getElementById('login-email').value,
            document.getElementById('login-password').value
        );
    } catch (err) {
        errorEl.classList.add('show');
        console.error(err);
    } finally {
        btn.classList.remove('loading');
        btn.disabled = false;
    }
});

window.logout = () => signOut(auth);

// ===== CONFIG =====
function loadConfig() {
    const saved = localStorage.getItem('pharma-config');
    if (saved) {
        state.config = JSON.parse(saved);
        document.getElementById('current-work-day').value = state.config.currentWorkDay;
    }
    updateConfigDisplay();
}

window.updateConfig = () => {
    state.config.currentWorkDay = parseInt(document.getElementById('current-work-day').value) || 1;
    localStorage.setItem('pharma-config', JSON.stringify(state.config));
    updateConfigDisplay();
    updateStats();
    window.showToast('Configuración guardada', 'Los objetivos se han actualizado', 'success');
};

function updateConfigDisplay() {
    const total = state.config.currentWorkDay * state.config.pharmaciesPerDay;
    const _el_config_total = document.getElementById('config-total'); if (_el_config_total) _el_config_total.textContent = total; else console.error('Missing ID: config-total');
    
    const visited = state.pharmacies.filter(p => p.visitado === 'Realizado').length;
    const transferred = state.pharmacies.filter(p => p.transferencia === 'Realizado').length;
    const completed = visited >= total && transferred >= total;
    
    const _el_config_status = document.getElementById('config-status');
    if (_el_config_status) {
        _el_config_status.innerHTML = completed
            ? '<svg class="icon icon-lg" style="stroke:var(--success-600)"><use href="#i-check-circle"/></svg>'
            : '<svg class="icon icon-lg" style="stroke:var(--brand-600)"><use href="#i-target"/></svg>';
    } else console.error('Missing ID: config-status');
}

// ===== PHARMACY DATA =====
function initPharmacyListener() {
    const q = query(collection(db, 'pharmacies'), orderBy('nombre'));
    
    onSnapshot(q, (snapshot) => {
        state.pharmacies = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            cadena: doc.data().cadena || 'General',
            visitado: normalizeStatus(doc.data().visitado),
            transferencia: normalizeStatus(doc.data().transferencia)
        }));
        
        state.loading = false;
        
        if (state.pharmacies.length === 0) {
            document.getElementById('upload-banner').style.display = 'flex';
        } else {
            document.getElementById('upload-banner').style.display = 'none';
        }
        
        updateChainFilter();
        applyFilters();
        updateStats();
    }, (err) => {
        console.error('Firestore error:', err);
        window.showToast('Error de conexión', 'No se pudieron cargar los datos', 'error');
    });
}


window.escapeHtmlAttr = function(str) {
    return (str || '').replace(/'/g, "&#39;").replace(/"/g, "&quot;");
};
function normalizeStatus(status) {
    if (!status) return 'Pendiente';
    const s = status.toString().trim().toLowerCase();
    const map = { 'realizado': 'Realizado', 'completed': 'Realizado', 'done': 'Realizado', 'justificada': 'Justificada', 'justified': 'Justificada' };
    return map[s] || 'Pendiente';
}

// ===== STATS =====

// ===== STATS TOGGLE =====
window.toggleStats = () => {
    const stats = document.getElementById('quick-stats');
    const mini = document.getElementById('mini-stats');
    const chartsSection = document.getElementById('charts-section');
    const btn = document.getElementById('toggle-stats-btn');

    if (stats.style.display === 'none') {
        stats.style.display = 'grid';
        mini.style.display = 'none';
        // Mostrar gráficos cuando se muestran estadísticas completas
        if (chartsSection) {
            chartsSection.style.display = 'block';
            setTimeout(() => window.initCharts(), 100);
        }
        btn.innerHTML = '<span>Ocultar detalles</span><svg class="icon icon-sm"><use href="#i-chevron-up"/></svg>';
        localStorage.setItem('pharma-stats-view', 'full');
    } else {
        stats.style.display = 'none';
        mini.style.display = 'flex';
        // Ocultar gráficos cuando se ocultan estadísticas
        if (chartsSection) {
            chartsSection.style.display = 'none';
        }
        btn.innerHTML = '<span>Ver detalles</span><svg class="icon icon-sm"><use href="#i-chevron-down"/></svg>';
        localStorage.setItem('pharma-stats-view', 'mini');
    }
};

// Initialize stats view based on saved preference
const savedStatsView = localStorage.getItem('pharma-stats-view');
if (savedStatsView === 'mini') {
    document.getElementById('quick-stats').style.display = 'none';
    document.getElementById('mini-stats').style.display = 'flex';
    document.getElementById('toggle-stats-btn').innerHTML = '<span>Ver detalles</span><svg class="icon icon-sm"><use href="#i-chevron-down"/></svg>';
}

function updateStats() {
    const dailyGoal = state.config.currentWorkDay * state.config.pharmaciesPerDay;
    
    const visited = state.pharmacies.filter(p => p.visitado === 'Realizado').length;
    const transferred = state.pharmacies.filter(p => p.transferencia === 'Realizado').length;
    const pendingVisit = state.pharmacies.filter(p => p.visitado === 'Pendiente').length;
    const justified = state.pharmacies.filter(p => p.visitado === 'Justificada' || p.transferencia === 'Justificada').length;
    const pendingTransfer = state.pharmacies.filter(p => p.visitado === 'Realizado' && p.transferencia === 'Pendiente').length;
    
    // Calculated Metrics
    const effectiveness = visited > 0 ? Math.round((transferred / visited) * 100) : 0;
    const totalWorkDays = 22; // Asumiendo un mes de 22 dias laborables tipicos
    const projection = state.config.currentWorkDay > 0 ? Math.round((transferred / state.config.currentWorkDay) * totalWorkDays) : 0;

    // Update core cards
    updateStatCard('visits', visited, dailyGoal, pendingVisit);
    updateStatCard('transfers', transferred, dailyGoal, state.pharmacies.filter(p => p.transferencia === 'Pendiente').length);
    updateStatCard('month', transferred, MONTHLY_GOAL, MONTHLY_GOAL - transferred, true);

    // Update new cards
    const _el_effect_value = document.getElementById('effect-value'); if (_el_effect_value) setAnimatedNumber(_el_effect_value, effectiveness); else console.error('Missing ID: effect-value');
    const _el2_effect_bar = document.getElementById('effect-bar'); if (_el2_effect_bar) _el2_effect_bar.style.width = `${effectiveness}%`; else console.error('Missing ID: effect-bar');
    const _el_pending_v_value = document.getElementById('pending-v-value'); if (_el_pending_v_value) _el_pending_v_value.textContent = pendingVisit; else console.error('Missing ID: pending-v-value');
    const _el_total_pharmacies = document.getElementById('total-pharmacies'); if (_el_total_pharmacies) _el_total_pharmacies.textContent = state.pharmacies.length; else console.error('Missing ID: total-pharmacies');

    const projectionPct = Math.min(100, Math.round((projection / MONTHLY_GOAL) * 100));
    const _el_proj_value = document.getElementById('proj-value'); if (_el_proj_value) setAnimatedNumber(_el_proj_value, projection); else console.error('Missing ID: proj-value');
    const _el2_proj_bar = document.getElementById('proj-bar'); if (_el2_proj_bar) _el2_proj_bar.style.width = `${projectionPct}%`; else console.error('Missing ID: proj-bar');
    const _el_proj_diff = document.getElementById('proj-diff'); if (_el_proj_diff) _el_proj_diff.textContent = `${Math.abs(projection - MONTHLY_GOAL)} ${projection >= MONTHLY_GOAL ? 'por encima de la meta' : 'por debajo de la meta'}`; else console.error('Missing ID: proj-diff');

    const _el_justified_value = document.getElementById('justified-value'); if (_el_justified_value) _el_justified_value.textContent = justified; else console.error('Missing ID: justified-value');
    const _el_pending_t_value = document.getElementById('pending-t-value'); if (_el_pending_t_value) _el_pending_t_value.textContent = pendingTransfer; else console.error('Missing ID: pending-t-value');

    // Línea de estado en tiempo real para tarjetas que no pasan por updateStatCard.
    updateDynamicBadge('effect-badge', effectiveness, [
        { min: 35, className: 'success', text: 'Óptimo' },
        { min: 20, className: 'warning', text: 'Mejorable' },
        { min: 0, className: 'danger', text: 'Bajo' }
    ]);
    updateDynamicBadge('proj-badge', projectionPct, [
        { min: 100, className: 'success', text: 'Meta Superada' },
        { min: 75, className: 'success', text: 'Excelente' },
        { min: 45, className: 'warning', text: 'En Ruta' },
        { min: 0, className: 'danger', text: 'En Riesgo' }
    ]);
    updateDynamicBadge('pending-v-badge', pendingVisit, [
        { min: 30, className: 'danger', text: 'Urgente' },
        { min: 10, className: 'warning', text: 'Atención' },
        { min: 0, className: 'success', text: 'Controlado' }
    ]);
    updateDynamicBadge('pending-t-badge', pendingTransfer, [
        { min: 20, className: 'danger', text: 'Crítico' },
        { min: 8, className: 'warning', text: 'Atención' },
        { min: 0, className: 'success', text: 'Bajo' }
    ]);
    updateDynamicBadge('justified-badge', justified, [
        { min: 10, className: 'warning', text: 'Revisar' },
        { min: 1, className: 'warning', text: 'Info' },
        { min: 0, className: 'success', text: 'Sin casos' }
    ]);

    // Metadatos de apoyo para hacer la lectura más ejecutiva.
    setTrendText('effect-trend', `${effectiveness}%`);
    setTrendText('proj-trend', `${projectionPct}%`);
    setTrendText('stats-last-update', new Date().toLocaleTimeString('es-ES'));
    
    // Update Mini Stats
    const _el_mini_efectividad = document.getElementById('mini-efectividad'); if (_el_mini_efectividad) _el_mini_efectividad.textContent = `${effectiveness}%`; else console.error('Missing ID: mini-efectividad');
    const _el_mini_faltantes = document.getElementById('mini-faltantes'); if (_el_mini_faltantes) _el_mini_faltantes.textContent = Math.max(0, MONTHLY_GOAL - transferred); else console.error('Missing ID: mini-faltantes');
    const _el_mini_proyeccion = document.getElementById('mini-proyeccion'); if (_el_mini_proyeccion) _el_mini_proyeccion.textContent = projection; else console.error('Missing ID: mini-proyeccion');
    const _el_mini_urgentes = document.getElementById('mini-urgentes'); if (_el_mini_urgentes) _el_mini_urgentes.textContent = pendingVisit; else console.error('Missing ID: mini-urgentes');
    
    updateConfigDisplay();
}

function updateStatCard(type, current, goal, secondary, isMonth = false) {
    const safeGoal = Number(goal) > 0 ? Number(goal) : 1;
    const pct = Math.min(100, Math.round((current / safeGoal) * 100));
    
    const _el_value = document.getElementById(`${type}-value`); if (_el_value) setAnimatedNumber(_el_value, current);
    const _el_goal = document.getElementById(`${type}-goal`); if (_el_goal) _el_goal.textContent =  goal;
    const _el_bar_bar = document.getElementById(`${type}-bar`); if (_el_bar_bar) _el_bar_bar.style.width =  `${pct}%`;
    setTrendText(`${type}-trend`, `${pct}%`);
    
    if (!isMonth) {
        const _el_pending = document.getElementById(`${type}-pending`); if (_el_pending) _el_pending.textContent =  `${secondary} pendientes`;
    } else {
        const _el_remaining = document.getElementById(`${type}-remaining`); if (_el_remaining) _el_remaining.textContent =  `${Math.max(0, secondary)} restantes`;
    }
    
    const badge = document.getElementById(`${type}-badge`);
    if (pct >= 80) {
        badge.className = 'stat-badge success';
        badge.textContent = 'Completado';
    } else if (pct >= 50) {
        badge.className = 'stat-badge warning';
        badge.textContent = 'En Progreso';
    } else {
        badge.className = 'stat-badge danger';
        badge.textContent = type === 'month' ? 'En Progreso' : 'Urgente';
    }
}

function setAnimatedNumber(element, value) {
    const nextValue = String(value);
    if (element.textContent !== nextValue) {
        // Resaltado breve para que el usuario vea qué KPI cambió sin recargar.
        element.classList.remove('value-updated');
        void element.offsetWidth;
        element.classList.add('value-updated');
    }
    element.textContent = nextValue;
}

function setTrendText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function updateDynamicBadge(id, metric, levels) {
    const badge = document.getElementById(id);
    if (!badge) return;
    const level = levels.find(item => metric >= item.min) || levels[levels.length - 1];
    badge.className = `stat-badge ${level.className}`;
    badge.textContent = level.text;
}

// ===== TABLE & FILTERS =====
function updateChainFilter() {
    const chains = [...new Set(state.pharmacies.map(p => p.cadena))].sort();
    const select = document.getElementById('filter-chain');
    const current = select.value;
    
    select.innerHTML = '<option value="">Todas las cadenas</option>';
    chains.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        select.appendChild(opt);
    });
    select.value = current;
    // Also update the datalist for the modal
    const datalist = document.getElementById('chain-options');
    if (datalist) {
        datalist.innerHTML = '';
        chains.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c;
            datalist.appendChild(opt);
        });
    }
}

function updatePharmacyChainOptions(selectedValue = 'General') {
    const select = document.getElementById('pharmacy-chain-input');
    const chains = [...new Set(state.pharmacies.map(p => (p.cadena || 'General').trim()))]
        .filter(Boolean)
        .sort();

    const options = chains.includes('General') ? chains : ['General', ...chains];

    if (selectedValue && !options.includes(selectedValue)) {
        options.push(selectedValue);
    }

    select.innerHTML = '';
    options.forEach(chain => {
        const option = document.createElement('option');
        option.value = chain;
        option.textContent = chain;
        select.appendChild(option);
    });

    select.value = selectedValue || 'General';
}

function applyFilters() {
    const search = document.getElementById('search-input').value.toLowerCase().trim();
    const visitFilter = document.getElementById('filter-visit').value;
    const transferFilter = document.getElementById('filter-transfer').value;
    const chainFilter = document.getElementById('filter-chain').value;
    
    const searchTerms = search.split(/\s+/).filter(t => t);
    
    state.filteredPharmacies = state.pharmacies.filter(p => {
        const content = `${p.nombre} ${p.direccion} ${p.cadena}`.toLowerCase();
        const matchSearch = searchTerms.length === 0 || searchTerms.every(t => content.includes(t));
        const matchVisit = !visitFilter || p.visitado === visitFilter;
        const matchTransfer = !transferFilter || p.transferencia === transferFilter;
        const matchChain = !chainFilter || p.cadena === chainFilter;

        return matchSearch && matchVisit && matchTransfer && matchChain;
    });

    if (state.pagination) state.pagination.page = 1;
    renderTable();
}

function renderTable() {
    const tbody = document.getElementById('pharmacy-table');

    if (state.loading) return;

    const ensurePaginationState = () => {
        if (!state.pagination) state.pagination = { page: 1, size: 50 };
        if (!state.sort) state.sort = { field: null, dir: 'asc' };
    };
    ensurePaginationState();

    const showingEl = document.getElementById('showing-count');
    const totalEl = document.getElementById('total-count');
    const pageInfoEl = document.getElementById('page-info');
    const prevBtn = document.getElementById('page-prev');
    const nextBtn = document.getElementById('page-next');

    if (state.filteredPharmacies.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5">
                    <div class="empty-state">
                        <svg class="empty-illustration" viewBox="0 0 180 120" aria-hidden="true">
                            <defs>
                                <linearGradient id="empty-grad" x1="0" y1="0" x2="1" y2="1">
                                    <stop offset="0%" stop-color="#E5E1FF"/>
                                    <stop offset="100%" stop-color="#C7C2FE"/>
                                </linearGradient>
                            </defs>
                            <ellipse cx="90" cy="104" rx="62" ry="8" fill="#635BFF" opacity=".08"/>
                            <rect x="46" y="30" width="88" height="62" rx="10" fill="url(#empty-grad)" opacity=".35"/>
                            <rect x="54" y="40" width="40" height="5" rx="2.5" fill="#635BFF" opacity=".5"/>
                            <rect x="54" y="52" width="72" height="4" rx="2" fill="#635BFF" opacity=".3"/>
                            <rect x="54" y="62" width="58" height="4" rx="2" fill="#635BFF" opacity=".3"/>
                            <rect x="54" y="72" width="66" height="4" rx="2" fill="#635BFF" opacity=".3"/>
                            <circle cx="130" cy="44" r="18" fill="none" stroke="#635BFF" stroke-width="3"/>
                            <line x1="142" y1="56" x2="154" y2="68" stroke="#635BFF" stroke-width="3" stroke-linecap="round"/>
                            <path d="M122 36 L138 52 M138 36 L122 52" stroke="#635BFF" stroke-width="2.2" stroke-linecap="round"/>
                        </svg>
                        <h3 class="empty-title">Sin resultados</h3>
                        <p class="empty-text">No hay farmacias que coincidan con los filtros actuales. Prueba a ajustarlos o limpiarlos.</p>
                    </div>
                </td>
            </tr>
        `;
        if (showingEl) showingEl.textContent = 0;
        if (totalEl) totalEl.textContent = state.pharmacies.length;
        if (pageInfoEl) pageInfoEl.textContent = '0 / 0';
        if (prevBtn) prevBtn.disabled = true;
        if (nextBtn) nextBtn.disabled = true;
        renderFavSidebar();
        return;
    }

    const sorted = getSortedPharmacies(state.filteredPharmacies);
    const total = sorted.length;
    const size = state.pagination.size;
    const pageCount = Math.max(1, Math.ceil(total / size));
    if (state.pagination.page > pageCount) state.pagination.page = pageCount;
    const page = state.pagination.page;
    const start = (page - 1) * size;
    const end = Math.min(start + size, total);
    const toRender = sorted.slice(start, end);
    const favs = getFavorites();

    tbody.innerHTML = toRender.map(p => {
        const isFav = favs.has(p.id);
        const canQuick = p.transferencia !== 'Realizado';
        const quickAction = canQuick
            ? `<button class="quick-action" onclick="window.quickTransferPharmacy('${p.id}')" title="Marcar transferencia realizada" aria-label="Marcar transferencia realizada">
                    <svg class="icon"><use href="#i-transfer"/></svg>
                    <span>Transferir</span>
                </button>`
            : '';
        return `
        <tr data-id="${p.id}">
            <td>
                <div class="pharmacy-name">${p.nombre}</div>
                <span class="pharmacy-chain">${p.cadena}</span>
            </td>
            <td>
                <div class="pharmacy-address" title="${p.direccion}">${p.direccion}</div>
            </td>
            <td class="text-center">
                <select class="status-select ${getStatusClass(p.visitado)}" aria-label="Estado de visita" onchange="window.toggleStatus('${p.id}', 'visitado', this.value)">
                    <option value="Pendiente" ${p.visitado === 'Pendiente' ? 'selected' : ''}>Pendiente</option>
                    <option value="Realizado" ${p.visitado === 'Realizado' ? 'selected' : ''}>Realizado</option>
                    <option value="Justificada" ${p.visitado === 'Justificada' ? 'selected' : ''}>Justificada</option>
                </select>
            </td>
            <td class="text-center">
                <select class="status-select ${getStatusClass(p.transferencia)}" aria-label="Estado de transferencia" onchange="window.toggleStatus('${p.id}', 'transferencia', this.value)">
                    <option value="Pendiente" ${p.transferencia === 'Pendiente' ? 'selected' : ''}>Pendiente</option>
                    <option value="Realizado" ${p.transferencia === 'Realizado' ? 'selected' : ''}>Realizado</option>
                    <option value="Justificada" ${p.transferencia === 'Justificada' ? 'selected' : ''}>Justificada</option>
                </select>
            </td>
            <td class="text-center">
                <div class="row-actions">
                    ${quickAction}
                    <button class="row-fav-btn ${isFav ? 'is-fav' : ''}" onclick="window.toggleFavorite('${p.id}')" title="${isFav ? 'Quitar de favoritos' : 'Añadir a favoritos'}" aria-label="${isFav ? 'Quitar de favoritos' : 'Añadir a favoritos'}" aria-pressed="${isFav}">
                        <svg class="icon"><use href="#i-star"/></svg>
                    </button>
                    <button class="btn btn-secondary btn-sm" onclick="window.showPharmacyModal('${p.id}', '${window.escapeHtmlAttr(p.nombre)}', '${window.escapeHtmlAttr(p.cadena)}', '${window.escapeHtmlAttr(p.direccion)}')" title="Editar" aria-label="Editar">
                        <svg class="icon icon-sm"><use href="#i-edit"/></svg>
                    </button>
                    <button class="btn btn-danger-soft btn-sm" onclick="window.confirmDeletePharmacy('${p.id}', '${window.escapeHtmlAttr(p.nombre)}')" title="Eliminar" aria-label="Eliminar">
                        <svg class="icon icon-sm"><use href="#i-trash"/></svg>
                    </button>
                </div>
            </td>
        </tr>`;
    }).join('');

    if (showingEl) showingEl.textContent = `${start + 1}–${end}`;
    if (totalEl) totalEl.textContent = state.pharmacies.length;
    if (pageInfoEl) pageInfoEl.textContent = `${page} / ${pageCount}`;
    if (prevBtn) prevBtn.disabled = page <= 1;
    if (nextBtn) nextBtn.disabled = page >= pageCount;

    updateSortIndicators();
    renderFavSidebar();
}

function getSortedPharmacies(list) {
    const sort = state.sort || { field: null, dir: 'asc' };
    if (!sort.field) return list;
    const statusWeight = { Pendiente: 0, Realizado: 1, Justificada: 2 };
    const toKey = (p) => {
        if (sort.field === 'nombre') return (p.nombre || '').toLocaleLowerCase('es');
        if (sort.field === 'direccion') return (p.direccion || '').toLocaleLowerCase('es');
        if (sort.field === 'visitado') return statusWeight[p.visitado] ?? -1;
        if (sort.field === 'transferencia') return statusWeight[p.transferencia] ?? -1;
        return 0;
    };
    const sorted = [...list].sort((a, b) => {
        const ka = toKey(a);
        const kb = toKey(b);
        if (ka < kb) return sort.dir === 'asc' ? -1 : 1;
        if (ka > kb) return sort.dir === 'asc' ? 1 : -1;
        return 0;
    });
    return sorted;
}

function updateSortIndicators() {
    const sort = state.sort || {};
    document.querySelectorAll('.data-table th.sortable').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
        th.setAttribute('aria-sort', 'none');
        if (th.dataset.sort === sort.field) {
            th.classList.add(sort.dir === 'asc' ? 'sort-asc' : 'sort-desc');
            th.setAttribute('aria-sort', sort.dir === 'asc' ? 'ascending' : 'descending');
        }
    });
}

function getStatusClass(status) {
    return status === 'Realizado' ? 'completed' : status === 'Justificada' ? 'justified' : 'pending';
}

function getStatusIcon(status) {
    if (status === 'Realizado') return '<svg class="icon icon-sm"><use href="#i-check"/></svg>';
    if (status === 'Justificada') return '<svg class="icon icon-sm"><use href="#i-shield"/></svg>';
    return '<svg class="icon icon-sm" style="opacity:.5"><circle cx="12" cy="12" r="6" fill="none" stroke="currentColor"/></svg>';
}

window.toggleStatus = async (id, field, newValue) => {
    const current = state.pharmacies.find(p => p.id === id);
    const prevValue = current ? current[field] : null;
    try {
        await updateDoc(doc(db, 'pharmacies', id), { [field]: newValue });
        const label = field === 'visitado' ? 'Visita' : 'Transferencia';
        window.showToast(`${label} actualizada`, `Nuevo estado: ${newValue}`, 'success', {
            action: prevValue && prevValue !== newValue ? {
                label: `Deshacer (volver a "${prevValue}")`,
                onClick: async () => {
                    try {
                        await updateDoc(doc(db, 'pharmacies', id), { [field]: prevValue });
                        window.showToast('Cambio revertido', `${label} vuelto a "${prevValue}"`, 'info');
                    } catch (e) {
                        window.showToast('Error', 'No se pudo deshacer el cambio', 'error');
                    }
                }
            } : null
        });
    } catch (err) {
        console.error(err);
        window.showToast('Error', 'No se pudo actualizar el estado', 'error');
    }
};

// Filter events
document.getElementById('search-input').addEventListener('input', (e) => {
    clearTimeout(window.searchDebounce);
    window.searchDebounce = setTimeout(applyFilters, 300);
});

['filter-visit', 'filter-transfer', 'filter-chain'].forEach(id => {
    document.getElementById(id).addEventListener('change', applyFilters);
});

window.clearFilters = () => {
    document.getElementById('search-input').value = '';
    document.getElementById('filter-visit').value = '';
    document.getElementById('filter-transfer').value = '';
    document.getElementById('filter-chain').value = '';
    applyFilters();
};

window.refreshData = () => {
    window.showToast('Actualizando', 'Sincronizando datos...', 'info');
    // Force re-render
    applyFilters();
};


// ===== CREATE / EDIT PHARMACY MODAL =====
window.showPharmacyModal = (id = '', nombre = '', cadena = '', direccion = '') => {
    const selectedChain = (cadena || 'General').trim() || 'General';

    document.getElementById('pharmacy-id').value = id;
    document.getElementById('pharmacy-name-input').value = nombre;
    updatePharmacyChainOptions(selectedChain);
    document.getElementById('pharmacy-address-input').value = direccion;

    const title = id ? 'Editar Farmacia' : 'Nueva Farmacia';
    document.getElementById('pharmacy-modal-title').textContent = title;

    document.getElementById('pharmacy-modal').classList.add('show');
    if (window.__syncFloatingSelects) window.__syncFloatingSelects();
};

window.hidePharmacyModal = () => {
    document.getElementById('pharmacy-modal').classList.remove('show');
    document.getElementById('pharmacy-form').reset();
};

window.savePharmacy = async () => {
    const id = document.getElementById('pharmacy-id').value;
    const nombre = document.getElementById('pharmacy-name-input').value.trim();
    const cadena = document.getElementById('pharmacy-chain-input').value || 'General';
    const direccion = document.getElementById('pharmacy-address-input').value.trim();

    if (!nombre || !direccion) {
        window.showToast('Error', 'Nombre y Dirección son obligatorios', 'error');
        return;
    }

    window.showToast('Guardando', 'Procesando datos...', 'info');

    try {
        if (id) {
            // Update
            await updateDoc(doc(db, 'pharmacies', id), {
                nombre,
                cadena,
                direccion
            });
            window.showToast('Actualizado', 'Farmacia actualizada correctamente', 'success');
        } else {
            // Create
            await addDoc(collection(db, 'pharmacies'), {
                nombre,
                cadena,
                direccion,
                visitado: 'Pendiente',
                transferencia: 'Pendiente',
                createdAt: new Date().toISOString()
            });
            window.showToast('Creado', 'Nueva farmacia agregada correctamente', 'success');
        }
        window.hidePharmacyModal();
    } catch (err) {
        console.error(err);
        window.showToast('Error', 'No se pudo guardar la farmacia', 'error');
    }
};



// ===== DELETE PHARMACY =====
window.confirmDeletePharmacy = (id, nombre) => {
    document.getElementById('delete-pharmacy-id').value = id;
    document.getElementById('delete-pharmacy-name').textContent = nombre;
    document.getElementById('delete-modal').classList.add('show');
};

window.hideDeleteModal = () => {
    document.getElementById('delete-modal').classList.remove('show');
};

window.deletePharmacy = async () => {
    const id = document.getElementById('delete-pharmacy-id').value;
    if (!id) return;

    window.showToast('Eliminando', 'Borrando farmacia...', 'info');

    try {
        await deleteDoc(doc(db, 'pharmacies', id));
        window.showToast('Eliminado', 'Farmacia eliminada correctamente', 'success');
        window.hideDeleteModal();
    } catch (err) {
        console.error(err);
        window.showToast('Error', 'No se pudo eliminar la farmacia', 'error');
    }
};

// ===== RESET MODAL =====
window.showResetModal = () => {
    document.getElementById('reset-modal').classList.add('show');
};

window.hideResetModal = () => {
    document.getElementById('reset-modal').classList.remove('show');
};

window.confirmReset = async () => {
    hideResetModal();
    window.showToast('Procesando', 'Reiniciando indicadores...', 'info');
    
    try {
        const batch = writeBatch(db);
        const snapshot = await getDocs(collection(db, 'pharmacies'));
        
        snapshot.docs.forEach(docSnap => {
            batch.update(docSnap.ref, { visitado: 'Pendiente', transferencia: 'Pendiente' });
        });
        
        await batch.commit();
        window.showToast('Completado', 'Todos los indicadores han sido reiniciados', 'success');
    } catch (err) {
        window.showToast('Error', 'No se pudieron reiniciar los datos', 'error');
    }
};

// ===== UPLOAD DATA =====
window.uploadData = async () => {
    if (!confirm('¿Cargar el listado maestro de 329 farmacias?')) return;
    
    const rawData = `109_CRUZ_VERDE_CALLE_56	Calle 56 # 32 - 67 Cabecera BUCARAMANGA
11684 - DROG.GRANADOS II	CL L35 # 16 A - 65 RINCON DE GIRON - GIRON
12049 - DROG.Y PERF.FELIX	 BUCARAMANGA/ 04 /CR 10 OCC # 45 A 
12494 - SKALA	 GIRON / 10. BRR. CAMPESTRE /AV LOS CANEYES # 25 
13695 - DROG. Y PERF. OLIMPICA	 BUCARAMANGA/06 (B.SAN RAFAEL) /CR.14 # 3
16603 - DROG.LUZMABE	 FLORIDABLANCA/05(B.SANTA ANA) /CL.8 # 9
16882 - LA COLOMBIA	 BUCARAMANGA/ 07 /CL 33 # 15 
17892 - DROG.VITAL	CL 20 C # 24 - 68 SANTA CRUZ - GIRON
18049 - DROG.PERFUMERIA GRANADOS	CL 104 B # 42 A - 48 BRR SAN BERNARDO - FLORIDABLANCA
18519 - DROG.LA 16 DE SAN CARLOS	CR 16 # 1 N - 14 BRR SAN CARLOS - PIEDECUESTA
19327 - DROG.EL REFUGIO	CL 3 AN #  3 B - 22 - PIEDECUESTA
19337 - DROG.EL GALENO DE FLORIDA	CR 7 # 3 - 50 - FLORIDABLANCA
19545 - DROG.UMEFA	CR 6 # 8 - 40 - PIEDECUESTA
19786 - DROG.GRANADOS REPOSO	CL.56 # 14-83 (B.EL REPOSO) - FLORIDABLANCA
20251 - DROG.GRANADOS VIVERO	 FLORIDABLANCA/ 10 BRR CALDAS /CR 33 # 95 
20524 - DROG.SAN RAFAEL	 PIEDECUESTA/ 09 BRR SAN RAFAEL /CL 9 # 13 
20525 - DROG.LICO	CL 7 # 9 - 86 BRR SAN RAFAEL - PIEDECUESTA
20771 - DROG. UNIFARMA	 PIEDECUESTA/ 10 BRR HOYO GRANDE /CR 6 # 14 
20828 - DROG.NUEVO SOL	CL 4 # 7 - 34 - FLORIDABLANCA
21551 - DROG.Y PERFUMERIA EL LAGO	 AV Floridablanca #147-18 EDIF. EQUILIBRIO DE FLORIDABLANCA
21680 - DROGUERIA LA SEPTIMA DE LEBRIJA	CR 7 # 10 - 44 LEBRIJA
21681 - DROG.DIAMANTE II	AV.89 # 23-135(B.DIAMANTE II) - BUCARAMANGA
22534 - DROG.LA 62 DISANCOL	 BUCARAMANGA/ 10 BRR. CONUCOS /CL 62 # 30 
23353 - DROG.PINZON Y CIA. LIMITADA	CR 17 # 35 - 62 - BUCARAMANGA
235 - LA CUMBRE	 FLORIDABLANCA/ 06 BRR LA CUMBRE /CR 9 E # 31 
23551 - DROG.COMVIDA	CL 35 # 2 A - 77 LA CUMBRE - FLORIDABLANCA
23859 - DROG.Y MISCELANEA DROMISALUD	CL 12 # 9 - 32 LEBRIJA
23876 - DROG.UNIFARMA PLUS	CL.2 # 16-28 MZ.K LC.5 (B.SAN FRANC PIEDECUESTA
24165 - DROG.PAOLA	CR.27 # 19-04(B.SANTA CRUZ) GIRON
24583 - DROG.SUPERVIT LOS PINOS	CL 14 # 34 - 85 BRR PINOS - BUCARAMANGA
24807 - DROG.LA RECETA PLUS	 BUCARAMANGA/ 08 /CL 33 # 29 
24925 - DROG.FARMISALUD FLORIDA	TV 127 # 62A - 14 AP 101 P 1 BRR CIUDAD VALENCIA - FLORIDABLANCA
25024 - DROG.J.E.ORTIZ	CR 22 # 35 - 51 - BUCARAMANGA
25382 - DROG.Y PERFUMERIA LA VIRTUD SUCURSA	CL 30 # 10 E - 23 - FLORIDABLANCA
25491 - DROG.NUEVA MULTICLI.DE BUCARAMANGA	CR 29 # 17 - 72 BUCARAMANGA
26043 - DROG. FARMAMESA	SECT.MIRADOR BRISAS DE LA ACUARELA - LOS SANTOS
26121 - DROGUERIA NUEVA AVENIDA	 BUCARAMANGA/04 (B.CAMPOHERMOSO) /CL.45 # 3 OCC
26348 - DROG Y PERFUMERIA HERFRAN	CR 14 A  # 1- 40 - BUCARAMANGA
26397 - DROGUERIA INTERMUNDIAL	CR 11 # 12 - 63 LEBRIJA
26428 - DROG.Y MISCELANEA D Y J PLUS	CL 30 # 7 - 81 BRR LA CUMBRE FLORIDABLANCA
26700 - DROGUERIA DORENA	CR.19 # 21-78(B.ALARCON) - BUCARAMANGA
26778 - DROGUERIAS GLOBALFARMA LA CUMBRE	CR 9 E # 28 - 90 BRR LA CUMBRE - FLORIDABLANCA
26881 - DROGUERIA FAMIPLUS	CR 37 # 42 - 111 BRR. CABECERA - BUCARAMANGA
26915 - FARMA CITY LA 12	SRCT C  To.10 APTO 101  bellavista-FLORIDABLANCA
27116 - FARMACIA BOTICA EXPRESS	CR 9 # 8 - 75 LC 101 FLORIDABLANCA
27262 - DROGUERIA Y MISCELANEA ALISFA	CR.24 # 85-29(B.DIAMANTE II) - BUCARAMANGA
27508 - DROGUERIA LA CAMPINA	CL 28A # 30 - 33-GIRON
27525 - DROGUERIA PHARMALUC	 FLORIDABLANCA/ 11 BRR LA CUMBRE /CL 28 # 5 E 
27725 - DROG.Y CACHARRERIA GRANADOS SAN FRA	 BUCARAMANGA/ 09 /CL 11 # 23 
27727 - DROGUERIA GRANADOS SAN PIO	CR 29 # 44 - 80 - BUCARAMANGA
27978 - DROGUERIA Y MICELANEA CARACOLI	CR 6 # 1 - 17 BRR CARACOLI FLORIDABLANCA
28053 - DROGUERIA GRANADOS NUEVO SOTO MAYOR	CL 50 # 23 - 08 BUCARAMANGA
28558 - DROGUERIA SANTA CRUZ PLUS	CR.26 # 17-27 (B.SANTA CRUZ) GIRON
28616 - DROGUERIA LOS ALTOS DEL CACIQUE II	 FLORIDABLANCA/ 03 BRR ALTOS DEL CACIQUE /CL 85 # 56 
29153 - DROGUERIA GRANADOS KENNEDY	CL.12 # 17N-05(B.KENEDY) BUCARAMANGA
29398 - DROG.FARMATOTAL MAS FARMACIA MAS SA	 BUCARAMANGA/ 02 BRR DELICIAS ALTAS /CR 16 # 104 B 
29736 - DROGUERIA CAMARGO VALENCIA	CR 12 # 14 - 34 .3 ESQ BRR CUIDAD VALENCIA-FLORIDABLANCA
29838 - DROGUERIA MISCELANEA ESPANOLA #2	CR.24 # 87-14(B.DIAMANTE) - BUCARAMANGA
29931 - SU SALUD JB DROGUERIA	CR 24 # 24 - 11 BRR ALARCON BUCARAMANGA
30058 - DROGUERIA OSORIO SUAREZ	 BUCARAMANGA/ 11 BRR EL PRADO /CL 33 # 33A 
30105 - DROGUERIA Y MISCELANEA LORCE	CL 30 # 1 - 219 BRR LA CUMBRE - FLORIDABLANCA
30212 - DROGUERIAS LEON S.A.S	CL 105 15B-45 - BUCARAMANGA
30338 - DROGUERIA DAFARMA	GIRON/12/CL 43 # 22
30465 - DROGUERIA Y MISCELANEA CARIOS	FLORIDABLANCA/11 loc 102 bucarica/BL 18
30644 - DROGUERIA FAMY SALUD	AV GUAYACANES BL 9 CD REAL DE MINAS - BUCARAMANGA
31209 - DROGUERIA CLER FLORIDA BLANCA	CR 10A 42-04 EL CARMEN FLORIDABLANCA
31292 - DROGUERIA UNIDAD ASITENCIAL ECOMED	CL 30 # 9 A E - 35 - FLORIDABLANCA
31355 - DROGUERIA EL SEMBRADOR	CR 33 # 86-144 T 1 LC 3 CACIQUE C - BUCARAMANGA
31407 - DROGAS ESQUINA DE LA 56	CLL 56 # 30-122 BUCARAMANGA
31618 - DROGUERIA GRANADOS CENTRO	 BUCARAMANGA/ 03 LC 7 ED UNIDAD RES /CL 37 # 22 
31786 - DROGUERIA MEGAMODERNA PLUS 24 - 7	CR 4 # 48 - 07 BRR LAGOS II FLORIDABLANCA
31903 - FARMAHOGAR CENTRAL	MESA DE LOS SANTOS GUAYABAL LC.9 VD MESA DE LOS SANTOS
31996 - DROGUERIA RIONEGRO PLAZA	CL.12 # 10-10 (B. CENTRO) RIONEGRO
32542 - DROGUERIAS GRANADOS DIAMANTE	AV 89 # 23 - 35 - BUCARAMANGA
32717 - FARMACIA LA LUZ DEL PORVENIR	CL 104 F # 8 B - 24 LOCAL 8 BLOQUE 3 B - BUCARAMANGA
32815 - DROGUERIA SUPREMA LA PAZ	CR.8 # 13-77 (B. VIA AL MAR CENTRO) EL PLAYON
33062 - DROGUERIA FARMAVILLAS SAS 3	CR. 13 A # 50-65 (B. VILLA LUZ) - FLORIDABLANCA
33137 - DROGUERIA VELEÑO	 SAN ALBERTO/04 (B. VILLA FANNY) /CL 2 # 4
33243 - DROGUERIA Y MINIMARKET GRAND BOULEV	CR.20 # 16-56 ET.2 TORRE 2 LC.24 BRR. SAN FRANCISCO BUCRAMANGA
33395 - FARMACIUDADELA	CL 57 # 16 - 60 BRR GOMEZ NINO - BUCARAMANGA
33433 - DROGUERIA SANTAFE SALUD	 FLORIDABLANCA/ 08  BRR SANTA FE /CR 42 # 107 
34192 - DROGUERIA GRANADOS 5	 BUCARAMANGA/ 06 /CR 27 # 18 
34290 - DROGUERIA JEREZ PASEO DEL PUENTE II	 PIEDECUESTA/04 /CR 5B # 22
34519 - FAMIRSALUD OASIS	 FLORIDABLANCA/06 BARRIO EL OASIS /DG 17 #55
34632 - DROGUERIA Y PERFUMERIA FAMAVILLAS	 BUCARAMANGA/04 /Cl. 105 #15B
34840 - DROGUERIA SANEDIL	CR.24 # 31-04 (B. ANTONIA SANTOS) BUCARAMANGA
34842 - DROGUERIA GRANADOS MUTIS 2	 BUCARAMANGA/04 /CL 59 # 3W
34847 - DROGUERIA SUPER DROGUERIA S.C	CR.22 # 32-03 (B. ANTONIA SANTOS) BUCARAMANGA
34853 - PHARMALIS DROGUERIA	 BUCARAMANGA/02  BRR EL GIRARDOT /CR 5 # 28
34867 - DROGUERIA CLER	CL 197 # 28 - 62 BRR RECREO - FLORIDABLANCA
34870 - DROGUERIA FARMA GOMEZ MATIAS	 FLORIDABLANCA/ 09 BRR VALENCIA /CR 12 # 8 
34876 - DROGUERIAFAMYSALUD 	CR 3 # 61 - 27 - BUCARAMANGA
34965 - DROGUERIA BUCARICA	 FLORIDABLANCA/3 LOC 101 SECTOR 12 BUCARICA/BL 20
35015 - FARMACLUB 2	CL 52 # 35 A - 40 - BUCARAMANGA
35266 - DROGUERIA MEDICAM PLUS	CR 6 # 14 - 90 - PIEDECUESTA
35280 - DROGUERIA GRANADOS SAN FRANCISCO PL	CL 13 # 21 - 48 SAN FRANCISCO - BUCARAMANGA
35286 - DROGUERIA NUEVA LUZ	Dg. 45 # 109A-26 - FLORIDABLANCA
35540 - DROGUERIA GRANADOS EL PUENTE	CR 6 # 19-13 - PIEDECUESTA
36127 - DROGUERIA ECOVIDA	CR 15 # 8 - 22 - PIEDECUESTA
36217 - DROGUERIA SUPERDROGAS LEBRIJA	CL 12 # 8 - 12 LEBRIJA
36557 - DROG. PHARMADESCUENTOS LA UNIVERSID	 BUCARAMANGA/ 02 BRR LA UNIVERSIDAD /CR 25 # 9 
36779 - DROGUERIA EL ATRIO	CR. 3A # 7N-36(B. JUNIN 1) PIEDECUESTA
36881 - DROGUERIA UNICENTRO	CL.18 # 25-114 (B.PORTAL CAMPESTRE) GIRON
37652 - DROGUERIA ZAMBRANO PLUS	CL. 31 # 20 -17 (B. CENTRO) BUCARAMANGA
37753 - DROGUERIA FARMACLARO	CR 3 # 58-17 LOS NARANJOS - BUCARAMANGA
37992 -DROGUERIA LA FLORESTA PLUS	CR 22#54-50 BUCARAMANGA
38008 - DROGUERIA EL DEPOSITO CENTRO	CL 36 # 13 - 27 BRR CENTRO - BUCARAMANGA
38009 - DROGUERIA EL DEPOSITO	CR 21 # 54-34  LA CONCORDIA - BUCARAMANGA
38812 - DROG.Y PERF.SOTOMAYOR	 BUCARAMANGA/03(B.SOTOMAYOR) /CL.48 # 26
39199 - SUPERDROGUERIA LA MEJOR	CL 11 # 7 - 11 LEBRIJA
39216 - DROGUERIA GRANADOS LA OCTAVA	CL.6 # 8-10(B.CASCO ANTIGUO FLORIDA FLORIDABLANCA
40369 - FARMACIA Y DROGUERIA SAN JUAN DE GI	CR 26 # 28 - 05 GIRON
40535 - DROGUERIA FARMASAYE	CR.8 # 8-43 (B. CASCO ANTIGUO) FLORIDABLANCA
40622 - DROGUERIA GRANADOS AMIGA	CL 10 # 5 - 57 - PIEDECUESTA
40961 - DROGUERIA J - MAX	CR 1W # 5AN - 15 MZ 31(B. REFUGIO) PIEDECUESTA
41806- DROGUERIA BOSQUES DE ARANJUEZ	CR 4 # 1 N B - 10 (B. BOSQUES DE ARANJUEZ) PIEDECUESTA
983_FARMACIA_INTERNA_CRUZ_VERDE_CLINICA SAN LUIS	CL 48 # 25 - 56 BUCARAMANGA
ALEMANA 08	CL 60 # 9 - 109 T 4 L 7 - 8 TO SAN REMO BUCARAMANGA
ALEMANA 12	CR 18 # 34 - 01 BUCARAMANGA
ALEMANA 26 LA FOSCAL	TV 154 # 150 - 207 BRR BOSQUE FLORIDABLANCA
ALEMANA 355	CALLE 30 # 25-71 CC CAÑAVERAL LOC 106 FLORIDABLANCA
ALEMANA 356	CR. 26 # 42-29 GIRON
ALEMANA 58	CR 6 # 9 - 40 piedecuesta
DROGUERIA 306 FARMASOLANO	CR 22 # 21 - 79 BUCARAMANGA
DROGUERIA AHORRA MAX	CL 3 AN # 30 - 09 BRR EL REFUGIO - PIEDECUESTA
DROGUERIA AHORRAMEDIC	CL 52 # 31 - 104 BRR CABECERA - BUCARAMANGA
DROGUERIA ANGY MAR	AV GUAYACANES T-19 L101 CIUDAD BOLIVAR BUCARAMANGA
DROGUERIA ANTOLINEZ	CR 2W # 59 - 23 MUTIS - BUCARAMANGA
DROGUERIA BLANTONY	CL 60 # 9 - 103 BRR CIUDADELA - BUCARAMANGA
DROGUERIA BULEVAR	CL 18 # 21 - 74 BUCARAMANGA
DROGUERIA CAMELOT	CLL 8N #3 -190 LOCAL 4 GUATIGUARA PIEDECUESTA
DROGUERIA CAMPO HERMOSO	CL 45 # 5 OCC - 10 BUCARAMANGA
DROGUERIA CARMENCITA	CL 30 # 29 B - 11 FLORIDABLANCA
DROGUERIA CONSULTORIO 2 CONSULTORIO ALIRIO LOPEZ NO. 2	CL 30 # 7 E - 95 LA CUMBRE FLORIDABLANCA
DROGUERIA CRUZ VERDE CAÑAVERAL	CL 30 # 25-71 CENTRO COMERCIAL CAÑAVERAL LOCAL 31 FLORIDABLANCA
DROGUERIA DANNYS	SANANDRESITO ISLA LC 7 - 31 P 3 - BUCARAMANGA
DROGUERIA DISERVAL	CL 31 #28-74 B. LA AURORA BUCARAMANGA
DROGUERIA DISTRIBUIDORA EL NILO	CC SAN ANDRESITO ISLA P 1 L 7 - 28 Y 7 - 29 - BUCARAMANGA
DROGUERIA DISTRIBUIDORA SANDRA C	CC SAN ANDRESITO ISLA P 3 L 8 - 35 Y 8 - 33 - BUCARAMANGA
DROGUERIA EL CARMEN - BUCARAMANGA	 BUCARAMANGA/02  BRR EL GIRARDOT /CL 28 #6
DROGUERIA EL DUENDE	 KILOMETRO 9 VIA CUROS - LOS SANTOS (MUNICIPIO LOS SANTOS)
DROGUERIA EL PAISA	CRA 15 # 56 CC SANADRESITO ISLA LC 7 - 8 BUCARAMANGA
DROGUERIA EL SEGURO	CR 31 # 27 - 48 BUCARAMANGA
DROGUERIA FARMA EXPRESS	CR 6 #27-02  BRR EL GIRARDOT BUCARAMANGA
DROGUERIA FARMA GOMEZ	CR 7#29-15 BRR EL GIRARDOT BUCARAMANGA
DROGUERIA FARMACIA SALUD FAMILIAR	CL 33 # 16 - 34  PLAZA DE MERCADO CENTRO BUCARAMANGA
DROGUERIA FARMAMEDICA MUTIS	CR 7W#59-22 BUCARAMANGA
DROGUERIA FARMAMETROPOLIS 	CR 8 # 61 - 137 L7 BRR METROPOLIS-BUCARAMANGA
DROGUERIA FARMASOLANO	CL 59 # 18 - 31 BRR TRINIDAD FLORIDABLANCA
DROGUERIA FIORELLA	CR 21 B # 111 - 124 - BUCARAMANGA
DROGUERIA GRANADOS CAFASAN 	 FLORIDABLANCA/ 02 CALDAS/CR 37 # 109 
DROGUERIA KOLSUDROGAS	CL 39 # 22 - 30 GIRON
DROGUERIA LA SEPTIMA PIEDECUESTA	CL 7 # 10 - 99 PIEDECUESTA
DROGUERIA LEBRI FARMA	CL 12 # 13 A - 25 LEBRIJA
DROGUERIA LORENA	CR 7 # 10 - 38 PIEDECUESTA
DROGUERIA M Y D	CR #  53 - 03  BRR EL RECREO FLORIDABLANCA
DROGUERIA MARIA REYNA	CL 27 #6-44  BRR EL GIRARDOT BUCARAMANGA
DROGUERIA MULTIFARMA #1	CL 105 # 29A - 21-FLORIDABLANCA
DROGUERIA MX ALKOSTO	CR 13 # 103 B - 46 BRR SAN FERMIN BUCARAMANGA
DROGUERIA NAYIBE	CLL 4 #8-31 FLORIDABLANCA
DROGUERIA NUEVA SAN CARLOS	CR 25 # 13 - 28 BRR SAN FRANCISCO
DROGUERIA PAGUE MENOS GIRON	CL 43 # 22 - 92 - GIRON
DROGUERIA PAGUE MENOS PIEDECUESTA	CR 8 # 7 - 77 - PIEDECUESTA
DROGUERIA PAGUE MENOS SAN FRANCISCO	BLV # 23 - 03 - BUCARAMANGA
DROGUERIA PAGUE MENOS SOTOMAYOR	CL 54 # 24 - 03 - BUCARAMANGA
DROGUERIA PALENQUE	CR 19 # 56 - 58. BRR EL PALENQUE - GIRON
DROGUERIA PHARMACY	AV EL BOSQUE # 54 - 52 FLORIDABLANCA
DROGUERIA PINZON 2	CR 38 # 49 - 15 BUCARAMANGA
DROGUERIA PROVIDA	CR 22 # 110 - 44 - BUCARAMANGA
DROGUERIA QUINTA REAL LAS PALMAS	CR 15 # 6 N - 03 - PIEDECUESTA
DROGUERIA REBAJA PLUS 9 CACIQUE	AV CRV # 35 - 95 FLORIDABLANCA
DROGUERIA SAN LUIS - BUCARAMANGA	CL 48 # 26 - 19 BRR SOTOMAYOR - BUCARAMANGA
DROGUERIA SAN PABLO	CR 22 # 11 - 81 BRR SAN FRANCISCO - BUCARAMANGA
DROGUERIA SANTA CECILIA	CL 21 # 23 - 75 BUCARAMANGA
DROGUERIA SILVA 	FLORIDABLANCA/09/Cl. 57 #3
DROGUERIA SOLETH	CR. 6 #28-65(B.GIRARDOT) BUCARAMANGA
DROGUERIA SUPERDROGAS CONUCOS	CL 58 # 29 - 31 LOCAL 5 BUCARAMANGA
DROGUERIA VIDA LTDA	CR 32 # 30A - 20 BRR. AURORA-BUCARAMANGA
DROGUERIA VILLABEL 	FLORIDABLANCA/ 04/CR 11 # 12 
DROGUERIA Y CACHARRERIA AYS	CC SAN ANDRESITO ISLA P 3 L 8 - 36 - BUCARAMANGA
DROGUERIA Y DISTRIBUCIONES ABASTOS XIMENA	DG 15 # 55 - 56 L F - 02 CC SAN ANDRESITO LA ISLA - BUCARAMANGA
DROGUERIA Y PERFUMERIA ANTIOQUEÑA	DG 105 # 30B - 13 SATELITE-FLORIDABLANCA
DROGUERIAS JEREZ VILLABEL	CR 12 # 7 - 11 FLORIDABLANCA
EL FARMACEUTA	CL 103 NO. 13B-79-BUCARAMANGA
FARMACIA 1A	BUCARAMANGA/04 LOC 1/CR 15 103
FARMACIA SAN MIGUEL	VIA PIEDECUESTA LOS SANTOS CONDOMINIO MESA DE LOS SANTOS LOCAL 3 - LOS SANTOS
JEREZ	CR 15 E No. 105-61-BUCARAMANGA
MANUELA BELTRAN	CR 13 #104C-34-BUCARAMANGA
PUNTO FARMACEUTICO	CLL 63 #17E-01B - BUCARAMANGA
REBAJA No. 11 BUCARAMANGA RICAURTE	CL 56 # 17 C - 12 BUCARAMANGA
REBAJA PLUS No. 12 BUCARAMANGA PASAJE DE COMERCIO	CR 17 # 35 - 13 - BUCARAMANGA
REBAJA PLUS No. 2 BUCARAMANGA CIUDADELA REAL DE MINAS	AV SAMANES # 9 - 75 BUCARAMANGA
REBAJA PLUS No. 8 BUCARAMANGA LAS DELICIAS	CL 105 # 15 D - 03 BUCARAMANGA
DROGUERIA SANTA LUCIA	CR 6 # 42 - 13 LAGOS II FLORIDABLANCA
29094 - DROGUERIA GRANADOS MENDOZA	CR 6 # 43 - 18 LOCAL 2 BRR LAGOS II FLORIDABLANCA
DROGUERIA PHARMALAGOS	CL 29 # 7 - 08 LAGOS 3 FLORIDABLANCA
30986 - MAFCONT DROGUERIAS EL LAGO I	Cl. 29 #11-126 FLORIDABLANCA
1022_CRUZ_VERDE_CARACOLÍ	Carrera 27 # 29 – 145 Local 408 FLORIDABLANCA
10680 - ALTAMIRA	CR 5 # 94 - 62 - FLORIDABLANCA
23250 - DROG.Y PERFUMERIA JAEL	CL 7 # 10 - 58 - FLORIDABLANCA
26177 - GRANADOS LIMONCITO	 FLORIDABLANCA/09 /CR 15 # 6
27726 - DROGUERIA GRANADOS BUCARIA	FLORIDABLANCA/4 local 101/BLOQUE 14
DROGERIA TAYSOFI	CR 7 # 5 - 06 AV CARACOLI - FLORIDABLANCA
SUPERNOVA	CR 40 203-28-FLORIDABLANCA
LA Y	AV BUCARICA T8-1 FLORIDABLANCA
DROGUERIA SERVIFARMA	SECTOR 9 BL 16 - 7 FLORIDABLANCA
DROGUERIA BLANCO	CR 6 # 39 - 26 LAGOS II FLORIDABLANCA
DROGUERIA FLORIDA	CR 8 # 7 - 53 BRR CENTRO FLORIDABLANCA
41878 - DROGUERIA FARMATECUIDA	CL. 20 C # 19 - 03 (B. PORTAL CAMPE) GIRON
34098 - DROGUERIA FARMASED	CL 14C #11-98 ALMENARES DE SAN GIRON - GIRON
DROGUERIA LAS PRIMICIAS	CL 14B # 12A-76 VILLAS DE DON JUAN  GIRON
34317 - DROGUERIA FARMASED 2	 GIRON/02 LC 2 /CR 13 # 13C
DROGUERIA VALERY	CR 23 # 7A-04 BR. MIRADOR ARENALES GIRON
DROGUERIA SANA SANAR	CL 10B # 20 - 04 -LAS VILLAS - GIRON
DROGUERIA LAS VILLAS	CL 10B # 22 - 09 GIRON
DROGUERIA LAS VILLAS DE SAN JUAN	CL 10b # 24A - 16 BRR. SAN JUAN DE GIRON GIRON
36979 - DROGUERIA Y PERFUMERIA SAN FELIPE	CL.117 # 27-60 (B.NIZZA) - FLORIDABLANCA
DROGUERIA LA GENERICA	CL 113 #32-43 LC 17 T0RRES DEL BICENTENARIO FLORIDABLANCA
33231 - DROGUERIA VGA 	CL 113 # 32 - 79 COND T DEL BICENTENARIO - FLORIDABLANCA
FARMASAY	CR 33 # 111-13 FLORIDABLANCA
ALBA LUZ	CR 33 109-36 FLORIDABLANCA
27134 - DROGUERIA PERFUMERIA ECONOMICA	DG.105 # 31-16 LC. 13 PLAZA SATELITE - FLORIDABLANCA
PHARMA PROVENZA	CL 105 # 23-135 BUCARAMANGA
REBAJA PLUS No. 1 BUCARAMANGA PROVENZA	CL 105 # 22 - 83 BRR PROVENZA BUCARAMANGA
DROGUERIA PAGUE MENOS PROVENZA	CL 105 # 21 - 139 - BUCARAMANGA
REBAJA PLUS 5 FLORIDABLANCA	CR 8 # 4 - 76 FLORIDABLANCA
18745 - DROG.JACOME Y MISCELANEA	CR 33 # 52 - 145 - BUCARAMANGA
COOFARMA 5	CR 33 # 52 B - 18 BUCARAMANGA
ALEMANA 178	CR 33 # 52 B - ESQ BRR CABECERA BUCARAMANGA
DROGUERIA PAGUE MENOS CABECERA	CR 35 # 52 - 88 - BUCARAMANGA
634_CRUZ_VERDE_CABECERA DEL LLANO	Carrera 33 # 46 - 61 BUCARAMANGA
20816 - DROG.NUEVO MILENIO II	CR.12 # 19-30(B.KENNEDY) BUCARAMANGA
19159 - DROG.Y PERFUMERIA DROGFARMA	 BUCARAMANGA/ 12 BRR ALARCON /CL 28 # 19 
TODO SALUD	CR 26 #31-70 BUCARAMANGA
REBAJA PLUS No. 4 BUCARAMANGA GUARIN	CR 33 # 30 A - 09 BUCARAMANGA
REBAJA PLUS No. 6 BUCARAMANGA SAN ALONSO	CR 30 # 14 - 06 BUCARAMANGA
DROGUERIA UNIVERSIDAD	CR 26 A # 10 - 18 BUCARAMANGA
DROGUERIA PAGUE MENOS FLORIDABLANCA	CR 8 #  4 - 48 Y 52 FLORIDABLANCA
DROGUERIA SUPERVIDA	CR 8 # 3 - 49 AGUACHICA
DROGUERIA UNICA	CR 15 # 3 - 34 PUERTO MADERO PIEDECUESTA
19178 - SUPERDROGAS PIEDECUESTA	CR 15 # 3 - 34 PUERTO MADERO - PIEDECUESTA
DROGUERIA MEDIEXPREESS	CR 15 # 3 - 166 BRR PUERTO MADERO PIEDECUESTA
DROGUERIA MEDIFARMA	CR 4 # 1 B -28 CAMPO VERDE PIEDECUESTA
DROGUERIA JEREZ SAN RAFAEL	CR 15 # 7 - 14 SAN RAFAEL PIEDECUESTA
30250 - DROGUERIA MOLINOS DEL VIENTO	CR.16 # 14-68(B.MOLINOS DEL VIENTO) - PIEDECUESTA
28819 - DROGUERIA RIVERA PHARMA M	 PIEDECUESTA/ 04 BRR PASEO DEL PUENTE II /CR 4 # 21 
DROGUERIA ECOFARMA	CR 2 C # 21 - 04 BRR PASEO DEL PUENTE II PIEDECUESTA
32718 - DROGUERIA CAMARGO	CR 2 N # 21 - 16 BRR PASEO DEL PUENTE 2 - PIEDECUESTA
32820 - DROGUERIA SALUD Y BELLEZA	AV 17 #2W-144 BRR BARRO BLANCO - PIEDECUESTA
31359 - DROGUERIA Y MISCELANIA SALBE	AV17 # 15A-16 BRR BARRO BLANCO - PIEDECUESTA
EKONOFARMA	CR 4 No- 0-20 LOC 1 PALERMO 1- PIEDECUESTA 
ALEMANA 160	CL 200 # 13 - 08 LC 3 ED MONTESOL FLORIDABLANCA
DROGUERIA PAGUE MENOS CAÑAVERAL	CL 33 # 26 - 27 CAÑAVERAL - FLORIDABLANCA
ALEMANA 60	CR 26 # 30 - 28 BRR CAÑAVERAL FLORIDABLANCA
831_CRUZ_VERDE_CC_CACIQUE	Transversal 93 # 34 -99 Local 371 y 372 BUCARAMANGA
DROGUERIA ALEMANA 32 CACIQUE	TV ORIENTAL # 35  - 254 MIRADOR DEL CACIQUE BUCARAMANGA
174_CRUZ_VERDE_PARQUE_TURBAY	CR 28 # 48-60 BUCARAMANGA
26880 - DROGAS CHICAMOCHA	CR 27 A # 40 - 35 BRR MEJORAS PUBLICAS - BUCARAMANGA
27700 - DROGUERIA FARMAKOS	CR 33 # 41 - 24 BUCARAMANGA
294_CRUZ_VERDE_JUMBO_CABECERA_TIENDA	CR 33 # 41 - 34 BUCARAMANGA
444_DROGUERIA_CRUZ_VERDE_CARRERA_33	Carrera 33 # 41 - 45 BUCARAMANGA
36385 - DROGUERIA Y PERFUMERIA VIVIR	CL 32 # 33 A - 54 - BUCARAMANGA
33063 - DROGUERIA FARMAVILLAS 2	 BUCARAMANGA/ ESQ BRR ALVAREZ /CL 32 # 38 
DROGUERIA ALVAREZ	CR 38 # 32 - 121 - BUCARAMANGA
19643- DROGAS CENTRAL DESCUENTOS BUCARAMAN	CL 34 # 34 C - 61 BRR ALVAREZ - BUCARAMANGA
27134 - DROGUERIA PERFUMERIA ECONOMICA	CR 26 # 33-96 ESQ. BUCARAMANGA
REBAJA PLUS No. 3 BUCARAMANGA SOTOMAYOR	CR 27 # 41 - 02 BUCARAMANGA
REBAJA PLUS No. 14 BUCARAMANGA DIAMANTE II	Carrera 26 No. 85-44 BUCARAMANGA
REBAJA PLUS No. 1 FLORIDABLANCA CANAVERAL	CL 30 # 26 - 10  FLORIDABLANCA
DROGUERIA FOSCAL	CR 24 # 154 - 106 URB EL BOSQUE - FLORIDABLANCA
VICTORIA DE LOS REYES	CL 67 18-25-BUCARAMANGA
DROGUERIA CENTRAL DESCUENTOS	CL 67 # 17 - 14 BRR LA VICTORIA - BUCARAMANGA
LA VICTORIA	BUCARAMANGA/07/CL 67 13
36861 - HIPERFARMACIA AG	CR 11 67 -93 - BUCARAMANGA
16201 - DROG.GRANADOS PABLO VI	CL 11 # 68 - 24 CENTRO - BUCARAMANGA
DROGUERIA LINEAVITAL	CR 10E # 67 - 42 PABLO VI BUCARAMANGA
28998 - DROGUERIA PERFUMERIA HL	CR 4 # 4 - 39 - SAN ALBERTO
DROGUERIA PHARMATODO	Cl 4 # 4-1, San Alberto, Cesar
DROGUERIA FARMASALUD UNIVERSAL	CR 8 #16-02 SAN MARTIN
DROGUERIA CASTILLO	CR 7 # 14-12 SAN MARTIN
25211 - DROGUERIA SERVIC D	CR 7 # 14 - 26 (B. CENTRO) - SAN MARTIN
18202 - DROGUERIA SUPERDROGAS PARRA	Cra 8 # 9-51 - PELAYA
DROGUERIA JUSTY MORENO	Cl. 12 #10-1, Pelaya, Cesar
37491 - DROGUERIA MAXIDROGAS	CL.6 # 16-66 LC.3 (B.OLYA HERRERA) - AGUACHICA
26797 - DROGUERIA LA CURITA PLUS 2	CL 5 # 22 - 85 - AGUACHICA
36061 - MAS X MENOS	CL 5 # 29-52 - AGUACHICA
42088 - CURITA PLUS DROGUERIA	CR 15 # 5 - 02 - AGUACHICA
29388 - DROGUERIA BENDITA PLUS	CL.6 # 8-04 (B.ARAUJO) GAMARRA
10933 - DROGUERIA SAN JORGE - AGUACHICA	CL 5 # 15 - 90 - AGUACHICA
29088 - DROGUERIA PAGUE MENOS LA QUINTA	CL 5 # 17 - 90 - AGUACHICA
DROGUERIA SALUD Y BELLEZA AGUACHICA	CL 5 # 19-43 AGUACHICA
PROVEEDORA RICHARD	CL 5#24A-54 AGUACHICA
DROGUERIA TOTAL CONFIANZA	Cl. 12 #10-24 SANTA CLARA OCAÑA
DROGUERIA RIAÑO	CR 49 N° 5-06 SANTA CLARA OCAÑA
40811 - DROG SANTA CLARA 	CR.55B # 24-49 (B.SAN ANTONIO) RIONEGRO
40336 - DROGUERIA X SANTA CLARA	CL 5A # 48-75 SANTA CLARA
40159 - DROGUERIA LA X 5	 OCAÑA/03(B.LAS LLAMADAS) /CL 7 # 26
21821 - DROGUERIA AVENIDA OCAÑA	CL 7 # 28 - 55 BRR PRIMAVERA - OCAÑA
30494 - DROGUERIA BETEL	Cl. 11 #16a 21 local 3 - OCAÑA
DROGUERIA LA NUEVA	CR 14 # 8 A - 25 OCAÑA
DROGUERIA MEGAFARMA OCANA	CR.14 # 8-18(B.MERCADO) OCAÑA
DROGUERIA Y AUTOSERVICIO 20-20	CR.13 # 8-47 (B.DULCE NOMBRE) OCAÑA
27900 - DROGUERIA LA 10 OCAÑA	CL 10 # 14 - 81- OCAÑA
42179 - DROGUERIA MAXIDROGAS ABREGO	CL. 18 # 4 - 02 (B. SANTA BARBARA) - ABREGO
29567 - DROGUERIA FARMAPAEZ	CR 5 # 12-73J (B.CALLE REAL) - ABREGO
32268 - DROGUERIA PHARMAKOS	CR 6 # 12-14 (B. CALLE CENTRAL) - ABREGO
40459 - DROGUERIA SANTA ISABEL	CR.6 # 13 - 64 (B. CENTRO) - OCAÑA
DROGUERIA PAGUE MENOS	CR 6 CL 13  Abrego, Norte de Santander
42213 - DROGUERIA UNIDROGAS EDGOSA SAFME	CR 6 # 15-31 ESQUINA ABREGO ABRERO
27760 - DROGUERIA PAGUE MENOS OCAÑA	CR 11 # 12 - 02 - OCAÑA
34567 - DROGUERIA LA 13 OCAÑA	CR 13 # 11 - 56 - OCAÑA
21812 - DROGUERIA OCAÑA	CL 11 # 13 - 69 - OCAÑA
40952 - DROGUERIA PINEDA	CR.15 A # 11 - 02 (B. SAN AGUSTIN) - OCAÑA
DROGUERIA SAN AGUSTIN	CL 11 # 16-12 OCAÑA
40337 - DROGUERIA X SAN AGUSTIN	CL. 11 # 15 -10 (B. SAN AGUSTIN) - OCAÑA
26367 - DROGUERIA LA DOCE	CL 12 # 6 - 119 - OCAÑA
39778 - DROGUERIA CLAVIJO	CR 13 # 9 - 34 - OCAÑA
DROGUERIA SANTA ANA	CR 13 # 10 - 71 OCAÑA
DROGUERIA DROGAS SALUD	Calle 7 #29 143 OCAÑA
25113 - DROGUERIA CENTRAL OCAÑA	CR 12 # 9 - 60 - OCAÑA
37955 - DROGUERIA LUPITA	 OCAÑA/07 SANTA CLARA /CR 49 N° 4`;

    const lines = rawData.split('\n');
    const pharmacies = [];
    const seen = new Set();

    for (const line of lines) {
        if (!line.trim()) continue;
        
        let parts = line.split('\t');
        if (parts.length < 2) parts = line.split(/\s{2,}/);
        if (parts.length < 2) continue;

        const nombre = parts[0].trim();
        const direccion = parts[parts.length - 1].trim();
        
        let cadena = 'General';
        const upperName = nombre.toUpperCase();
        if (upperName.includes("CRUZ VERDE")) cadena = "Cruz Verde";
        else if (upperName.includes("ALEMANA")) cadena = "Alemana";
        else if (upperName.includes("PAGUE MENOS")) cadena = "Pague Menos";
        else if (upperName.includes("GRANADOS")) cadena = "Granados";
        else if (upperName.includes("REBAJA")) cadena = "Rebaja";
        else if (parts.length > 2) cadena = parts[1].trim();

        const key = nombre.toLowerCase().replace(/[^\w]/g, '');
        if (seen.has(key)) continue;
        seen.add(key);

        pharmacies.push({
            nombre,
            cadena,
            direccion,
            visitado: 'Pendiente',
            transferencia: 'Pendiente'
        });
    }

    try {
        const batch = writeBatch(db);
        for (const p of pharmacies) {
            const ref = doc(collection(db, 'pharmacies'));
            batch.set(ref, { ...p, createdAt: new Date().toISOString() });
        }
        await batch.commit();
        window.showToast('Datos cargados', `${pharmacies.length} farmacias importadas exitosamente`, 'success');
    } catch (err) {
        window.showToast('Error', 'No se pudieron cargar los datos: ' + err.message, 'error');
    }
};

window.showSection = (section) => {
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    if (typeof event !== 'undefined' && event && event.target) {
        const item = event.target.closest('.nav-item');
        if (item) item.classList.add('active');
    }
    updateBreadcrumb(section);
};

// ===== GRÁFICOS INTERACTIVOS CON CHART.JS =====
let progressChartInstance = null;
let trendChartInstance = null;
let chainChartInstance = null;
let goalChartInstance = null;

window.initCharts = () => {
    const chartsSection = document.getElementById('charts-section');
    if (!chartsSection) return;

    // Configuración común para modo oscuro/claro
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#e2e8f0' : '#475569';
    const gridColor = isDark ? '#334155' : '#e2e8f0';

    // 1. Gráfico de Progreso Diario (Doughnut)
    const progressCtx = document.getElementById('progressChart');
    if (progressCtx) {
        progressChartInstance = new Chart(progressCtx, {
            type: 'doughnut',
            data: {
                labels: ['Visitas Completadas', 'Transferencias', 'Pendientes'],
                datasets: [{
                    data: [0, 0, 16],
                    backgroundColor: [
                        getComputedStyle(document.documentElement).getPropertyValue('--primary-500').trim(),
                        getComputedStyle(document.documentElement).getPropertyValue('--success-500').trim(),
                        getComputedStyle(document.documentElement).getPropertyValue('--neutral-300').trim()
                    ],
                    borderWidth: 0,
                    hoverOffset: 10
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '65%',
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: isDark ? '#1e293b' : '#ffffff',
                        titleColor: textColor,
                        bodyColor: textColor,
                        borderColor: gridColor,
                        borderWidth: 1,
                        padding: 12,
                        displayColors: true,
                        callbacks: {
                            label: function(context) {
                                return context.label + ': ' + context.parsed;
                            }
                        }
                    }
                },
                animation: {
                    animateScale: true,
                    animateRotate: true
                }
            }
        });
    }

    // 2. Gráfico de Tendencia Semanal (Line)
    const trendCtx = document.getElementById('trendChart');
    if (trendCtx) {
        trendChartInstance = new Chart(trendCtx, {
            type: 'line',
            data: {
                labels: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
                datasets: [
                    {
                        label: 'Visitas',
                        data: [12, 14, 11, 15, 13, 8, 5],
                        borderColor: getComputedStyle(document.documentElement).getPropertyValue('--primary-500').trim(),
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        tension: 0.4,
                        fill: true,
                        pointRadius: 4,
                        pointHoverRadius: 6
                    },
                    {
                        label: 'Transferencias',
                        data: [8, 10, 9, 12, 10, 6, 4],
                        borderColor: getComputedStyle(document.documentElement).getPropertyValue('--success-500').trim(),
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        tension: 0.4,
                        fill: true,
                        pointRadius: 4,
                        pointHoverRadius: 6
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: isDark ? '#1e293b' : '#ffffff',
                        titleColor: textColor,
                        bodyColor: textColor,
                        borderColor: gridColor,
                        borderWidth: 1,
                        padding: 12,
                        mode: 'index',
                        intersect: false
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: textColor }
                    },
                    y: {
                        grid: { color: gridColor, borderDash: [5, 5] },
                        ticks: { color: textColor },
                        beginAtZero: true
                    }
                },
                interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false
                }
            }
        });
    }

    // 3. Gráfico de Distribución por Cadena (Bar Horizontal)
    const chainCtx = document.getElementById('chainChart');
    if (chainCtx) {
        chainChartInstance = new Chart(chainCtx, {
            type: 'bar',
            data: {
                labels: ['Cruz Verde', 'Alemana', 'Pague Menos', 'Granados', 'Rebaja', 'General'],
                datasets: [{
                    label: 'Transferencias',
                    data: [25, 18, 15, 12, 8, 22],
                    backgroundColor: [
                        'rgba(59, 130, 246, 0.8)',
                        'rgba(16, 185, 129, 0.8)',
                        'rgba(245, 158, 11, 0.8)',
                        'rgba(99, 102, 241, 0.8)',
                        'rgba(236, 72, 153, 0.8)',
                        'rgba(148, 163, 184, 0.8)'
                    ],
                    borderRadius: 6,
                    barThickness: 24
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: isDark ? '#1e293b' : '#ffffff',
                        titleColor: textColor,
                        bodyColor: textColor,
                        borderColor: gridColor,
                        borderWidth: 1,
                        padding: 12,
                        callbacks: {
                            label: function(context) {
                                return context.parsed.x + ' transferencias';
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: gridColor, borderDash: [5, 5] },
                        ticks: { color: textColor }
                    },
                    y: {
                        grid: { display: false },
                        ticks: { color: textColor }
                    }
                }
            }
        });
    }

    // 4. Gráfico de Metas (Polar Area)
    const goalCtx = document.getElementById('goalChart');
    if (goalCtx) {
        goalChartInstance = new Chart(goalCtx, {
            type: 'polarArea',
            data: {
                labels: ['Visitas Diarias', 'Transferencias Diarias', 'Meta Mensual', 'Proyección'],
                datasets: [{
                    data: [16, 12, 120, 145],
                    backgroundColor: [
                        'rgba(59, 130, 246, 0.7)',
                        'rgba(16, 185, 129, 0.7)',
                        'rgba(245, 158, 11, 0.7)',
                        'rgba(139, 92, 246, 0.7)'
                    ],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: isDark ? '#1e293b' : '#ffffff',
                        titleColor: textColor,
                        bodyColor: textColor,
                        borderColor: gridColor,
                        borderWidth: 1,
                        padding: 12
                    }
                },
                scales: {
                    r: {
                        grid: { color: gridColor },
                        ticks: { 
                            color: textColor,
                            backdropColor: 'transparent'
                        }
                    }
                },
                animation: {
                    animateRotate: true,
                    animateScale: true
                }
            }
        });
    }
};

window.updateCharts = (stats) => {
    // Actualizar gráfico de progreso
    if (progressChartInstance) {
        const visits = stats.visits || 0;
        const transfers = stats.transfers || 0;
        const pending = Math.max(0, 16 - visits);
        
        progressChartInstance.data.datasets[0].data = [visits, transfers, pending];
        progressChartInstance.update('active');
    }

    // Actualizar métricas de metas
    const dailyGoalEl = document.getElementById('goal-daily-display');
    const monthlyGoalEl = document.getElementById('goal-monthly-display');
    if (dailyGoalEl) dailyGoalEl.textContent = stats.dailyGoal || 16;
    if (monthlyGoalEl) monthlyGoalEl.textContent = stats.monthlyGoal || 120;
};

window.toggleChartsSection = (show) => {
    const chartsSection = document.getElementById('charts-section');
    if (chartsSection) {
        chartsSection.style.display = show ? 'block' : 'none';
        if (show && !progressChartInstance) {
            // Pequeño delay para asegurar que el DOM esté listo
            setTimeout(() => window.initCharts(), 100);
        }
    }
};

// ===== THEME TOGGLE =====
(function initTheme() {
    const THEME_KEY = 'pharma-theme';
    const root = document.documentElement;

    function applyTheme(t) {
        root.setAttribute('data-theme', t);
        try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
    }

    const stored = (() => {
        try { return localStorage.getItem(THEME_KEY); } catch (e) { return null; }
    })();
    if (!stored) {
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        applyTheme(prefersDark ? 'dark' : 'light');
    } else {
        applyTheme(stored);
    }

    function bind() {
        const btn = document.getElementById('theme-toggle-btn');
        if (!btn) return;
        btn.addEventListener('click', () => {
            const current = root.getAttribute('data-theme') || 'light';
            applyTheme(current === 'dark' ? 'light' : 'dark');
        });
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bind, { once: true });
    } else {
        bind();
    }
})();

// ===== TOPBAR SEARCH → table search (Cmd/Ctrl+K → command palette) =====
(function initTopbarSearch() {
    function bind() {
        const input = document.getElementById('topbar-search-input');
        const tableSearch = document.getElementById('search-input');
        if (input && tableSearch) {
            input.addEventListener('input', (e) => {
                tableSearch.value = e.target.value;
                tableSearch.dispatchEvent(new Event('input', { bubbles: true }));
            });
        }
        document.addEventListener('keydown', (e) => {
            const mod = e.metaKey || e.ctrlKey;
            if (mod && (e.key === 'k' || e.key === 'K')) {
                e.preventDefault();
                if (window.openCmdK) window.openCmdK();
            }
        });
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bind, { once: true });
    } else {
        bind();
    }
})();

/* ==========================================================
   v4.1 — Extensions: favorites, sparklines, pagination,
   column sort, breadcrumb, command palette, floating labels
   ========================================================== */

// ---------- Favoritos (localStorage) ----------
const FAV_KEY = 'pharma-favorites';
function getFavorites() {
    try {
        const raw = localStorage.getItem(FAV_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        return new Set(Array.isArray(arr) ? arr : []);
    } catch (e) { return new Set(); }
}
function saveFavorites(set) {
    try { localStorage.setItem(FAV_KEY, JSON.stringify([...set])); } catch (e) {}
}
window.toggleFavorite = (id) => {
    const favs = getFavorites();
    const pharmacy = state.pharmacies.find(p => p.id === id);
    const name = pharmacy ? pharmacy.nombre : 'Farmacia';
    if (favs.has(id)) {
        favs.delete(id);
        saveFavorites(favs);
        window.showToast('Favorito eliminado', name, 'info');
    } else {
        favs.add(id);
        saveFavorites(favs);
        window.showToast('Añadido a favoritos', name, 'success');
    }
    renderTable();
};

function renderFavSidebar() {
    const list = document.getElementById('fav-list');
    const counter = document.getElementById('fav-count');
    if (!list) return;
    const favs = getFavorites();
    const favPharmacies = state.pharmacies.filter(p => favs.has(p.id)).slice(0, 8);
    if (counter) {
        if (favs.size > 0) { counter.hidden = false; counter.textContent = favs.size; }
        else counter.hidden = true;
    }
    if (favPharmacies.length === 0) {
        list.innerHTML = '<div class="nav-fav-empty">Añade desde la tabla <svg class="icon" style="width:11px;height:11px;display:inline;vertical-align:-1px"><use href="#i-star"/></svg></div>';
        return;
    }
    list.innerHTML = favPharmacies.map(p => `
        <div class="nav-fav-item" role="button" tabindex="0" onclick="window.openPharmacyFromFav('${p.id}')" title="${window.escapeHtmlAttr(p.nombre)}">
            <span class="fav-dot"></span>
            <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.nombre}</span>
        </div>
    `).join('');
}

window.openPharmacyFromFav = (id) => {
    const p = state.pharmacies.find(x => x.id === id);
    if (!p) return;
    window.showSection('pharmacies');
    const searchBox = document.getElementById('search-input');
    if (searchBox) {
        searchBox.value = p.nombre;
        searchBox.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const pharmaciesSection = document.getElementById('pharmacies-section') || document.querySelector('.data-section');
    if (pharmaciesSection && pharmaciesSection.scrollIntoView) {
        pharmaciesSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
};

// ---------- Quick action: Transferir ----------
window.quickTransferPharmacy = async (id) => {
    const current = state.pharmacies.find(p => p.id === id);
    if (!current) return;
    const prev = current.transferencia;
    try {
        await updateDoc(doc(db, 'pharmacies', id), { transferencia: 'Realizado' });
        window.showToast('Transferencia realizada', current.nombre, 'success', {
            action: prev && prev !== 'Realizado' ? {
                label: 'Deshacer',
                onClick: async () => {
                    try {
                        await updateDoc(doc(db, 'pharmacies', id), { transferencia: prev });
                        window.showToast('Cambio revertido', `Volvió a "${prev}"`, 'info');
                    } catch (e) {
                        window.showToast('Error', 'No se pudo deshacer', 'error');
                    }
                }
            } : null
        });
    } catch (err) {
        window.showToast('Error', 'No se pudo marcar la transferencia', 'error');
    }
};

// ---------- Pending badge on Farmacias nav item ----------
function updatePendingBadge() {
    const badge = document.getElementById('nav-pharmacies-badge');
    if (!badge) return;
    const count = state.pharmacies.filter(p => p.visitado === 'Pendiente').length;
    if (count > 0) {
        badge.hidden = false;
        badge.textContent = count > 99 ? '99+' : String(count);
    } else {
        badge.hidden = true;
    }
}

// ---------- Breadcrumb ----------
const BREADCRUMB_LABELS = {
    dashboard: 'Panel de Control',
    pharmacies: 'Farmacias',
    settings: 'Ajustes'
};
function updateBreadcrumb(section) {
    const el = document.getElementById('breadcrumb-current');
    if (!el) return;
    el.textContent = BREADCRUMB_LABELS[section] || 'Panel de Control';
}

// ---------- Sparklines ----------
function buildSparklinePath(points, width = 120, height = 28, paddingY = 3) {
    if (!points || points.length === 0) return { path: '', area: '' };
    const max = Math.max(...points, 1);
    const min = Math.min(...points, 0);
    const range = max - min || 1;
    const stepX = width / Math.max(points.length - 1, 1);
    const coords = points.map((v, i) => {
        const x = i * stepX;
        const y = height - paddingY - ((v - min) / range) * (height - 2 * paddingY);
        return [x, y];
    });
    const d = coords.reduce((acc, [x, y], i) => acc + (i === 0 ? `M${x.toFixed(2)},${y.toFixed(2)}` : ` L${x.toFixed(2)},${y.toFixed(2)}`), '');
    const area = d + ` L${width.toFixed(2)},${height} L0,${height} Z`;
    return { path: d, area };
}

function sparkDataFor(kind, current, goal = 1) {
    // Synthetic 7-day variance around current / goal, shaped so the last point equals `current`.
    const seed = (kind || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) + Math.floor(current);
    const rand = (n) => {
        const x = Math.sin(seed + n) * 10000;
        return x - Math.floor(x);
    };
    const base = Math.max(current, goal * 0.15);
    const days = 7;
    const data = [];
    for (let i = 0; i < days - 1; i++) {
        const noise = (rand(i) - 0.5) * 0.45;
        const trendBoost = (i / (days - 1)) * 0.15;
        data.push(Math.max(0, Math.round(base * (0.6 + trendBoost + noise))));
    }
    data.push(Math.round(current));
    return data;
}

function renderSparkline(svgId, kind, current, goal = 1) {
    const svg = document.getElementById(svgId);
    if (!svg) return;
    const data = sparkDataFor(kind, current, goal);
    const { path, area } = buildSparklinePath(data);
    svg.innerHTML = `
        <path class="sparkline-area" d="${area}"/>
        <path class="sparkline-path" d="${path}"/>
    `;
}

function renderAllSparklines() {
    const dailyGoal = state.config.currentWorkDay * state.config.pharmaciesPerDay;
    const visited = state.pharmacies.filter(p => p.visitado === 'Realizado').length;
    const transferred = state.pharmacies.filter(p => p.transferencia === 'Realizado').length;
    const pendingVisit = state.pharmacies.filter(p => p.visitado === 'Pendiente').length;
    const justified = state.pharmacies.filter(p => p.visitado === 'Justificada' || p.transferencia === 'Justificada').length;
    const pendingTransfer = state.pharmacies.filter(p => p.visitado === 'Realizado' && p.transferencia === 'Pendiente').length;
    const effectiveness = visited > 0 ? Math.round((transferred / visited) * 100) : 0;
    const projection = state.config.currentWorkDay > 0 ? Math.round((transferred / state.config.currentWorkDay) * 22) : 0;

    renderSparkline('spark-visits', 'visits', visited, dailyGoal);
    renderSparkline('spark-transfers', 'transfers', transferred, dailyGoal);
    renderSparkline('spark-effect', 'effect', effectiveness, 100);
    renderSparkline('spark-pending', 'pending', pendingVisit, Math.max(pendingVisit, 10));
    renderSparkline('spark-month', 'month', transferred, MONTHLY_GOAL);
    renderSparkline('spark-proj', 'proj', projection, MONTHLY_GOAL);
    renderSparkline('spark-justified', 'just', justified, Math.max(justified, 5));
    renderSparkline('spark-pending-t', 'pendt', pendingTransfer, Math.max(pendingTransfer, 10));
}

// ---------- Hook: run post-stat visuals whenever data changes ----------
function runPostStatsVisuals() {
    try { renderAllSparklines(); } catch (e) { console.warn('sparklines', e); }
    try { updatePendingBadge(); } catch (e) { console.warn('badge', e); }
    try { renderFavSidebar(); } catch (e) { console.warn('fav', e); }
}

// Observe stat value changes (updateStats is module-local). Whenever visits-value
// mutates, refresh sparklines + pending badge + fav sidebar.
(function observeStatsChanges() {
    function attach() {
        const sentinel = document.getElementById('visits-value');
        if (!sentinel) {
            setTimeout(attach, 200);
            return;
        }
        let scheduled = false;
        const schedule = () => {
            if (scheduled) return;
            scheduled = true;
            requestAnimationFrame(() => {
                scheduled = false;
                runPostStatsVisuals();
            });
        };
        const mo = new MutationObserver(schedule);
        mo.observe(sentinel, { childList: true, subtree: true, characterData: true });
        // First render once data is in.
        schedule();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', attach, { once: true });
    } else {
        attach();
    }
})();

// ---------- Pagination + sort listeners ----------
(function initTableControls() {
    function bind() {
        const pageSize = document.getElementById('page-size');
        const prev = document.getElementById('page-prev');
        const next = document.getElementById('page-next');
        if (!state.pagination) state.pagination = { page: 1, size: 50 };
        if (!state.sort) state.sort = { field: null, dir: 'asc' };

        if (pageSize) {
            pageSize.value = String(state.pagination.size);
            pageSize.addEventListener('change', (e) => {
                const size = parseInt(e.target.value, 10) || 50;
                state.pagination.size = size;
                state.pagination.page = 1;
                renderTable();
            });
        }
        if (prev) prev.addEventListener('click', () => {
            if (state.pagination.page > 1) { state.pagination.page--; renderTable(); }
        });
        if (next) next.addEventListener('click', () => {
            state.pagination.page++; renderTable();
        });

        document.querySelectorAll('.data-table th.sortable').forEach(th => {
            th.addEventListener('click', () => {
                const field = th.dataset.sort;
                if (!field) return;
                if (state.sort.field === field) {
                    state.sort.dir = state.sort.dir === 'asc' ? 'desc' : 'asc';
                } else {
                    state.sort.field = field;
                    state.sort.dir = 'asc';
                }
                state.pagination.page = 1;
                renderTable();
            });
        });
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bind, { once: true });
    } else {
        bind();
    }
})();

// ---------- Floating labels: keep select's has-value in sync ----------
(function initFloatingSelects() {
    function sync() {
        document.querySelectorAll('.form-float select.form-input').forEach(sel => {
            if (sel.value && sel.value !== '') sel.classList.add('has-value');
            else sel.classList.remove('has-value');
        });
    }
    function bind() {
        document.querySelectorAll('.form-float select.form-input').forEach(sel => {
            sel.addEventListener('change', sync);
        });
        sync();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bind, { once: true });
    } else {
        bind();
    }
    window.__syncFloatingSelects = sync;
})();

// ---------- Command palette (Ctrl+K) ----------
(function initCmdK() {
    let activeIndex = 0;
    let items = [];

    function buildItems(query) {
        const q = (query || '').trim().toLowerCase();
        const actions = [
            { type: 'action', icon: 'i-dashboard', label: 'Ir al Dashboard', sub: 'Panel principal', run: () => scrollToSelector('#dashboard-section') },
            { type: 'action', icon: 'i-building', label: 'Ir a Farmacias', sub: 'Tabla de farmacias', run: () => scrollToSelector('.data-section') },
            { type: 'action', icon: 'i-plus', label: 'Nueva farmacia', sub: 'Añadir una farmacia', run: () => window.showPharmacyModal && window.showPharmacyModal() },
            { type: 'action', icon: 'i-moon', label: 'Cambiar tema', sub: 'Claro / oscuro', run: () => {
                const btn = document.getElementById('theme-toggle-btn');
                if (btn) btn.click();
            }},
            { type: 'action', icon: 'i-filter-x', label: 'Limpiar filtros', sub: 'Restablecer búsqueda', run: () => window.clearFilters && window.clearFilters() }
        ];

        const pharmacies = (state.pharmacies || [])
            .filter(p => {
                if (!q) return false;
                const blob = `${p.nombre} ${p.cadena} ${p.direccion}`.toLowerCase();
                return blob.includes(q);
            })
            .slice(0, 6)
            .map(p => ({
                type: 'pharmacy',
                icon: 'i-building',
                label: p.nombre,
                sub: `${p.cadena} · ${p.direccion}`,
                run: () => window.openPharmacyFromFav(p.id)
            }));

        let filteredActions = actions;
        if (q) {
            filteredActions = actions.filter(a => a.label.toLowerCase().includes(q) || (a.sub || '').toLowerCase().includes(q));
        }

        const result = [];
        if (filteredActions.length) result.push({ group: 'Acciones' }, ...filteredActions);
        if (pharmacies.length) result.push({ group: 'Farmacias' }, ...pharmacies);
        return result;
    }

    function scrollToSelector(selector) {
        const el = document.querySelector(selector);
        if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function render(list) {
        const el = document.getElementById('cmdk-list');
        if (!el) return;
        items = list.filter(x => !x.group);
        if (items.length === 0) {
            el.innerHTML = '<div class="cmdk-empty">Sin resultados. Prueba con otra palabra clave.</div>';
            return;
        }
        if (activeIndex >= items.length) activeIndex = 0;
        let currentGroup = null;
        let itemIdx = 0;
        el.innerHTML = list.map((entry) => {
            if (entry.group) {
                currentGroup = entry.group;
                return `<div class="cmdk-group-label">${entry.group}</div>`;
            }
            const isActive = itemIdx === activeIndex;
            const html = `
                <div class="cmdk-item ${isActive ? 'active' : ''}" role="option" data-idx="${itemIdx}" aria-selected="${isActive}">
                    <span class="cmdk-item-icon"><svg class="icon"><use href="#${entry.icon}"/></svg></span>
                    <div style="flex:1;min-width:0;">
                        <div class="cmdk-item-label" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${entry.label}</div>
                        ${entry.sub ? `<div class="cmdk-item-sub" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${entry.sub}</div>` : ''}
                    </div>
                    <span class="cmdk-item-kbd">↵</span>
                </div>
            `;
            itemIdx++;
            return html;
        }).join('');

        el.querySelectorAll('.cmdk-item').forEach((node) => {
            node.addEventListener('mouseenter', () => {
                activeIndex = parseInt(node.dataset.idx, 10);
                highlight();
            });
            node.addEventListener('click', () => {
                const idx = parseInt(node.dataset.idx, 10);
                activate(idx);
            });
        });
        highlight();
    }

    function highlight() {
        const el = document.getElementById('cmdk-list');
        if (!el) return;
        el.querySelectorAll('.cmdk-item').forEach(node => {
            const idx = parseInt(node.dataset.idx, 10);
            const on = idx === activeIndex;
            node.classList.toggle('active', on);
            node.setAttribute('aria-selected', String(on));
            if (on) node.scrollIntoView({ block: 'nearest' });
        });
    }

    function activate(idx) {
        const entry = items[idx];
        if (!entry) return;
        close();
        setTimeout(() => { try { entry.run(); } catch (e) { console.warn(e); } }, 10);
    }

    function open() {
        const overlay = document.getElementById('cmdk');
        const input = document.getElementById('cmdk-input');
        if (!overlay || !input) return;
        overlay.classList.add('show');
        input.value = '';
        activeIndex = 0;
        render(buildItems(''));
        setTimeout(() => input.focus(), 10);
    }
    function close() {
        const overlay = document.getElementById('cmdk');
        if (overlay) overlay.classList.remove('show');
    }

    window.openCmdK = open;
    window.closeCmdK = close;

    function bind() {
        const overlay = document.getElementById('cmdk');
        const input = document.getElementById('cmdk-input');
        if (!overlay || !input) return;
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        input.addEventListener('input', () => {
            activeIndex = 0;
            render(buildItems(input.value));
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') { e.preventDefault(); close(); }
            else if (e.key === 'ArrowDown') { e.preventDefault(); if (items.length) { activeIndex = (activeIndex + 1) % items.length; highlight(); } }
            else if (e.key === 'ArrowUp') { e.preventDefault(); if (items.length) { activeIndex = (activeIndex - 1 + items.length) % items.length; highlight(); } }
            else if (e.key === 'Enter') { e.preventDefault(); activate(activeIndex); }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bind, { once: true });
    } else {
        bind();
    }
})();
