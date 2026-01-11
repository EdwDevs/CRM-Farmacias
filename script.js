/**
 * ═══════════════════════════════════════════════════════════════
 * 🏥 CRM FARMACIAS - SISTEMA CORREGIDO v2.2.0
 * Nueva funcionalidad: Control de días laborales y objetivos diarios
 * ═══════════════════════════════════════════════════════════════
 */

// === IMPORTS FIREBASE V9 ===
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
    query, 
    orderBy,
    writeBatch
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// === CONFIGURACIÓN FIREBASE ===
const firebaseConfig = {
    apiKey: "AIzaSyB2glK3jtje7juBG7gMl4bzh6xG_Zz2YNU",
    authDomain: "crm-farmacias.firebaseapp.com",
    projectId: "crm-farmacias",
    storageBucket: "crm-farmacias.appspot.com",
    messagingSenderId: "251276216502",
    appId: "1:251276216502:web:374f708e2ff040192d3e17"
};

// === INICIALIZACIÓN FIREBASE ===
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const pharmaciesCollection = collection(db, 'pharmacies');

// === CONSTANTES ===
const MONTHLY_GOAL = 120;
const DEFAULT_PHARMACIES_PER_DAY = 16;

// === CONFIGURACIÓN DE DÍAS LABORALES ===
let dailyConfig = {
    currentWorkDay: 1,
    pharmaciesPerDay: DEFAULT_PHARMACIES_PER_DAY,
    get totalDailyGoal() {
        return this.currentWorkDay * this.pharmaciesPerDay;
    }
};

// === FUNCIONES DE NORMALIZACIÓN ===
function normalizeStatus(status) {
    if (!status) return 'Pendiente';
    const cleaned = status.toString().trim();
    // Normalizar variaciones comunes
    if (cleaned.toLowerCase() === 'realizado' || cleaned.toLowerCase() === 'completed' || cleaned.toLowerCase() === 'done') {
        return 'Realizado';
    }
    if (cleaned.toLowerCase() === 'pendiente' || cleaned.toLowerCase() === 'pending') {
        return 'Pendiente';
    }
    // Si no reconoce el estado, defaultear a Pendiente
    console.warn('Estado no reconocido:', status, '- Defaulteando a Pendiente');
    return 'Pendiente';
}

// === REFERENCIAS DOM ===
const loginContainer = document.getElementById('login-container');
const crmContainer = document.getElementById('crm-container');
const loginForm = document.getElementById('login-form');
const loginEmail = document.getElementById('login-email');
const loginPassword = document.getElementById('login-password');
const loginError = document.getElementById('login-error');
const passwordToggle = document.querySelector('.password-toggle');
const logoutBtn = document.getElementById('logout-btn');
const tableBody = document.getElementById('pharmacy-table-body');
const loadingIndicator = document.getElementById('loading');
const emptyState = document.getElementById('empty-state');
const searchBox = document.getElementById('search-box');
const filterVisitado = document.getElementById('filter-visitado');
const filterTransferencia = document.getElementById('filter-transferencia');
const filterCadena = document.getElementById('filter-cadena');
const recordCount = document.getElementById('record-count');
const btnResetFilters = document.getElementById('btn-reset-filters');
const refreshBtn = document.getElementById('refresh-btn');
const uploadSection = document.getElementById('upload-section');
const btnUpload = document.getElementById('upload-initial-data');
const themeToggle = document.getElementById('theme-toggle');
const toastContainer = document.getElementById('toast-container');

// === REFERENCIAS PARA MÉTRICAS ===
const resetIndicatorsBtn = document.getElementById('reset-indicators-btn');
const resetModal = document.getElementById('reset-modal');
const confirmResetBtn = document.getElementById('confirm-reset');
const cancelResetBtn = document.getElementById('cancel-reset');

// Elementos de métricas
const visitsPercentage = document.getElementById('visits-percentage');
const visitsCount = document.getElementById('visits-count');
const visitsProgress = document.getElementById('visits-progress');
const visitsCard = document.getElementById('visits-card');
const visitsStatusBadge = document.getElementById('visits-status');
const transfersPercentage = document.getElementById('transfers-percentage');
const transfersCount = document.getElementById('transfers-count');
const transfersProgress = document.getElementById('transfers-progress');
const transfersCard = document.getElementById('transfers-card');
const transfersStatusBadge = document.getElementById('transfers-status');
const goalRemaining = document.getElementById('goal-remaining');
const goalProgress = document.getElementById('goal-progress');
const goalStatus = document.getElementById('goal-status');
const goalPercentage = document.getElementById('goal-percentage');
const goalCard = document.getElementById('goal-card');
const goalStatusBadge = document.getElementById('goal-status-badge');
const totalPharmacies = document.getElementById('total-pharmacies');
const pendingVisits = document.getElementById('pending-visits');
const pendingTransfers = document.getElementById('pending-transfers');

// === NUEVAS REFERENCIAS PARA CONFIGURACIÓN DIARIA ===
const currentWorkDayInput = document.getElementById('current-work-day');
const pharmaciesPerDayInput = document.getElementById('pharmacies-per-day');
const updateDailyConfigBtn = document.getElementById('update-daily-config');
const totalDailyGoalElement = document.getElementById('total-daily-goal');
const displayWorkDaysElement = document.getElementById('display-work-days');
const dailyStatusElement = document.getElementById('daily-status');
const visitsDailyTargetElement = document.getElementById('visits-daily-target');
const transfersDailyTargetElement = document.getElementById('transfers-daily-target');

// === VARIABLES GLOBALES ===
let allPharmacies = [];
let unsubscribe = null;
let hasShownWelcome = false;

// ═══════════════════════════════════════════════════════════════
// 📅 SISTEMA DE CONFIGURACIÓN DE DÍAS LABORALES
// ═══════════════════════════════════════════════════════════════

function loadDailyConfig() {
    const saved = localStorage.getItem('crm-daily-config');
    if (saved) {
        try {
            const parsedConfig = JSON.parse(saved);
            dailyConfig.currentWorkDay = parsedConfig.currentWorkDay || 1;
            dailyConfig.pharmaciesPerDay = parsedConfig.pharmaciesPerDay || DEFAULT_PHARMACIES_PER_DAY;
        } catch (error) {
            console.warn('Error cargando configuración:', error);
        }
    }
    
    updateDailyConfigUI();
    console.log('📅 Configuración diaria cargada:', dailyConfig);
}

function saveDailyConfig() {
    localStorage.setItem('crm-daily-config', JSON.stringify({
        currentWorkDay: dailyConfig.currentWorkDay,
        pharmaciesPerDay: dailyConfig.pharmaciesPerDay,
        lastUpdated: new Date().toISOString()
    }));
    console.log('💾 Configuración diaria guardada');
}

function updateDailyConfigUI() {
    if (currentWorkDayInput) currentWorkDayInput.value = dailyConfig.currentWorkDay;
    if (pharmaciesPerDayInput) pharmaciesPerDayInput.value = dailyConfig.pharmaciesPerDay;
    if (totalDailyGoalElement) totalDailyGoalElement.textContent = dailyConfig.totalDailyGoal;
    if (displayWorkDaysElement) displayWorkDaysElement.textContent = dailyConfig.currentWorkDay;
    if (visitsDailyTargetElement) visitsDailyTargetElement.textContent = dailyConfig.totalDailyGoal;
    if (transfersDailyTargetElement) transfersDailyTargetElement.textContent = dailyConfig.totalDailyGoal;
}

function updateDailyStatus(visitedCount, transferredCount) {
    if (!dailyStatusElement) return;
    
    const dailyGoal = dailyConfig.totalDailyGoal;
    const isVisitsOnTrack = visitedCount >= dailyGoal;
    const isTransfersOnTrack = transferredCount >= dailyGoal;
    
    let status = '';
    let className = '';
    
    if (isVisitsOnTrack && isTransfersOnTrack) {
        status = '🎉 ¡Objetivo cumplido!';
        className = 'status-success';
    } else if (visitedCount >= dailyGoal * 0.8 || transferredCount >= dailyGoal * 0.8) {
        status = '⚡ En buen camino';
        className = 'status-progress';
    } else {
        status = '🔥 Necesita impulso';
        className = 'status-behind';
    }
    
    dailyStatusElement.textContent = status;
    dailyStatusElement.className = `summary-status ${className}`;
}

// Event listener para actualizar configuración diaria
updateDailyConfigBtn?.addEventListener('click', () => {
    const newWorkDay = parseInt(currentWorkDayInput?.value) || 1;
    const newPharmaciesPerDay = parseInt(pharmaciesPerDayInput?.value) || DEFAULT_PHARMACIES_PER_DAY;
    
    // Validaciones
    if (newWorkDay < 1 || newWorkDay > 30) {
        showToast('El día laboral debe estar entre 1 y 30', 'warning');
        return;
    }
    
    if (newPharmaciesPerDay < 1 || newPharmaciesPerDay > 50) {
        showToast('Las farmacias por día deben estar entre 1 y 50', 'warning');
        return;
    }
    
    dailyConfig.currentWorkDay = newWorkDay;
    dailyConfig.pharmaciesPerDay = newPharmaciesPerDay;
    
    saveDailyConfig();
    updateDailyConfigUI();
    
    // Actualizar métricas con nueva configuración
    updateMetrics();
    
    showToast(`📅 Configuración actualizada: Día ${newWorkDay}, ${newPharmaciesPerDay} farmacias/día`, 'success');
});

// ═══════════════════════════════════════════════════════════════
// 🎨 SISTEMA DE TEMA
// ═══════════════════════════════════════════════════════════════

function initializeTheme() {
    const savedTheme = localStorage.getItem('crm-theme') || 'light';
    setTheme(savedTheme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
}

function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('crm-theme', theme);
    
    const icon = themeToggle?.querySelector('.theme-icon');
    if (icon) {
        icon.textContent = theme === 'light' ? '🌙' : '☀️';
    }
    
    showToast(`Tema ${theme === 'light' ? 'claro' : 'oscuro'} activado`, 'info', 2000);
}

// ═══════════════════════════════════════════════════════════════
// 🔔 SISTEMA DE NOTIFICACIONES
// ═══════════════════════════════════════════════════════════════

function showToast(message, type = 'info', duration = 4000) {
    if (!toastContainer) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icons = {
        success: '✅',
        error: '❌', 
        warning: '⚠️',
        info: 'ℹ️'
    };
    
    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || icons.info}</span>
        <span class="toast-message">${escapeHtml(message)}</span>
    `;
    
    toastContainer.appendChild(toast);
    
    const timeoutId = setTimeout(() => {
        removeToast(toast);
    }, duration);
    
    toast.addEventListener('click', () => {
        clearTimeout(timeoutId);
        removeToast(toast);
    });
}

function removeToast(toast) {
    if (!toast || !toast.parentNode) return;
    
    toast.style.animation = 'toast-slide-out 0.3s ease-in forwards';
    setTimeout(() => {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, 300);
}

// ═══════════════════════════════════════════════════════════════
// 🔐 SISTEMA DE AUTENTICACIÓN
// ═══════════════════════════════════════════════════════════════

onAuthStateChanged(auth, user => {
    if (user) {
        console.log('✅ Usuario autenticado:', user.email);
        showLoginInterface(false);
        showCRMInterface(true);
        initializeCRM();
        
        if (!hasShownWelcome) {
            showToast(`¡Bienvenido ${user.email}! 👋`, 'success');
            hasShownWelcome = true;
        }
    } else {
        console.log('❌ Usuario no autenticado');
        showLoginInterface(true);
        showCRMInterface(false);
        cleanupCRM();
        hasShownWelcome = false;
    }
});

// LOGIN HANDLER
loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = loginEmail.value.trim();
    const password = loginPassword.value;
    
    if (!email || !password) {
        showLoginError('Todos los campos son requeridos');
        return;
    }
    
    if (!isValidEmail(email)) {
        showLoginError('Formato de email inválido');
        return;
    }
    
    setLoginLoading(true);
    clearLoginError();
    
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        console.error('❌ Error de login:', error);
        handleLoginError(error);
    } finally {
        setLoginLoading(false);
    }
});

function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function handleLoginError(error) {
    const errorMessages = {
        'auth/invalid-credential': 'Credenciales inválidas',
        'auth/user-not-found': 'Usuario no encontrado',
        'auth/wrong-password': 'Contraseña incorrecta',
        'auth/too-many-requests': 'Demasiados intentos. Espera un momento'
    };
    
    const message = errorMessages[error.code] || 'Error al iniciar sesión';
    showLoginError(message);
    showToast(message, 'error');
}

function setLoginLoading(loading) {
    const submitBtn = loginForm?.querySelector('button[type="submit"]');
    if (submitBtn) {
        submitBtn.disabled = loading;
        if (loading) {
            submitBtn.classList.add('loading');
        } else {
            submitBtn.classList.remove('loading');
        }
    }
}

function showLoginError(message) {
    if (loginError) loginError.textContent = message;
}

function clearLoginError() {
    if (loginError) loginError.textContent = '';
}

// PASSWORD TOGGLE
passwordToggle?.addEventListener('click', () => {
    const isPassword = loginPassword.type === 'password';
    loginPassword.type = isPassword ? 'text' : 'password';
    passwordToggle.textContent = isPassword ? '🙈' : '👁️';
});

// LOGOUT
logoutBtn?.addEventListener('click', async () => {
    try {
        await signOut(auth);
        showToast('Sesión cerrada', 'info');
        if (loginEmail) loginEmail.value = '';
        if (loginPassword) loginPassword.value = '';
        clearLoginError();
    } catch (error) {
        console.error('Error logout:', error);
        showToast('Error al cerrar sesión', 'error');
    }
});

// ═══════════════════════════════════════════════════════════════
// 📊 INICIALIZACIÓN DEL CRM
// ═══════════════════════════════════════════════════════════════

function initializeCRM() {
    console.log('🚀 Inicializando CRM...');
    
    // Cargar configuración diaria
    loadDailyConfig();
    
    const q = query(pharmaciesCollection, orderBy('nombre'));
    
    if (unsubscribe) {
        unsubscribe();
    }
    
    unsubscribe = onSnapshot(q, (snapshot) => {
        console.log('📡 Snapshot recibido, documentos:', snapshot.size);
        handlePharmaciesSnapshot(snapshot);
    }, (error) => {
        console.error('❌ Error snapshot:', error);
        handleSnapshotError(error);
    });
}

function handlePharmaciesSnapshot(snapshot) {
    showLoading(true);
    
    try {
        // CORRECCIÓN: Procesar y normalizar datos
        allPharmacies = snapshot.docs.map(doc => {
            const data = doc.data();
            const normalizedData = {
                id: doc.id,
                nombre: data.nombre || '',
                cadena: data.cadena || '',
                direccion: data.direccion || '',
                visitado: normalizeStatus(data.visitado),
                transferencia: normalizeStatus(data.transferencia),
                createdAt: data.createdAt,
                updatedAt: data.updatedAt
            };
            
            console.log(`📋 Farmacia ${normalizedData.nombre}: visitado=${normalizedData.visitado}, transferencia=${normalizedData.transferencia}`);
            return normalizedData;
        });
        
        console.log(`📊 Total farmacias procesadas: ${allPharmacies.length}`);
        
        // CORRECCIÓN: Actualizar métricas con datos normalizados
        updateMetrics();
        populateCadenaFilter();
        applyFilters();
        updateUploadSectionVisibility();
        
        if (allPharmacies.length > 0) {
            showToast(`${allPharmacies.length} farmacias cargadas`, 'success', 3000);
        }
        
    } catch (error) {
        console.error('❌ Error procesando snapshot:', error);
        showToast('Error procesando datos', 'error');
    } finally {
        showLoading(false);
    }
}

function handleSnapshotError(error) {
    console.error('❌ Error snapshot:', error);
    showLoading(false);
    showToast('Error de conexión con Firebase', 'error');
    if (recordCount) {
        recordCount.textContent = 'Error cargando datos';
    }
}

function cleanupCRM() {
    if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
    }
    allPharmacies = [];
    if (tableBody) tableBody.innerHTML = '';
    if (recordCount) recordCount.textContent = 'Cargando...';
    resetMetricsDisplay();
    console.log('🧹 CRM limpiado');
}

// ═══════════════════════════════════════════════════════════════
// 📈 SISTEMA DE MÉTRICAS ACTUALIZADO CON DÍAS LABORALES
// ═══════════════════════════════════════════════════════════════

function updateMetrics() {
    console.log('📊 Actualizando métricas con configuración diaria...');
    
    if (!allPharmacies.length) {
        console.log('⚠️ No hay farmacias para calcular métricas');
        resetMetricsDisplay();
        return;
    }
    
    const totalCount = allPharmacies.length;
    const dailyGoal = dailyConfig.totalDailyGoal;
    
    // Contar con logging detallado
    let visitedCount = 0;
    let transferredCount = 0;
    let pendingVisitsCount = 0;
    let pendingTransfersCount = 0;
    
    allPharmacies.forEach((pharmacy, index) => {
        if (pharmacy.visitado === 'Realizado') {
            visitedCount++;
        } else {
            pendingVisitsCount++;
        }
        
        if (pharmacy.transferencia === 'Realizado') {
            transferredCount++;
        } else {
            pendingTransfersCount++;
        }
        
        // Log cada 50 farmacias para no saturar
        if (index % 50 === 0) {
            console.log(`📋 Farmacia ${index}: ${pharmacy.nombre} - V:${pharmacy.visitado}, T:${pharmacy.transferencia}`);
        }
    });
    
    console.log(`📊 RESULTADOS: Total=${totalCount}, Visitadas=${visitedCount}, Transferidas=${transferredCount}`);
    console.log(`🎯 OBJETIVO DIARIO: ${dailyGoal} (Día ${dailyConfig.currentWorkDay} × ${dailyConfig.pharmaciesPerDay})`);
    
    // Calcular porcentajes basados en objetivo diario
    const visitsPercentageValue = dailyGoal > 0 ? Math.round((visitedCount / dailyGoal) * 100) : 0;
    const transfersPercentageValue = dailyGoal > 0 ? Math.round((transferredCount / dailyGoal) * 100) : 0;
    const goalPercentageValue = Math.min(Math.round((transferredCount / MONTHLY_GOAL) * 100), 100);
    const goalRemainingValue = Math.max(MONTHLY_GOAL - transferredCount, 0);
    
    console.log(`📊 PORCENTAJES: Visitas=${visitsPercentageValue}% (${visitedCount}/${dailyGoal}), Transferencias=${transfersPercentageValue}% (${transferredCount}/${dailyGoal})`);
    
    // Actualizar elementos de visitas
    updateMetricElement(visitsPercentage, `${Math.min(visitsPercentageValue, 100)}%`);
    updateMetricElement(visitsCount, `${visitedCount} de ${dailyGoal}`);
    updateMetricElement(visitsProgress, null, `${Math.min(visitsPercentageValue, 100)}%`);
    applyMetricStatus(visitsCard, visitsStatusBadge, visitsPercentageValue);
    
    // Actualizar elementos de transferencias
    updateMetricElement(transfersPercentage, `${Math.min(transfersPercentageValue, 100)}%`);
    updateMetricElement(transfersCount, `${transferredCount} de ${dailyGoal}`);
    updateMetricElement(transfersProgress, null, `${Math.min(transfersPercentageValue, 100)}%`);
    applyMetricStatus(transfersCard, transfersStatusBadge, transfersPercentageValue);
    
    // Actualizar objetivo mensual (120)
    updateMetricElement(goalRemaining, goalRemainingValue);
    updateMetricElement(goalProgress, null, `${goalPercentageValue}%`);
    updateMetricElement(goalPercentage, `${goalPercentageValue}%`);
    applyMetricStatus(goalCard, goalStatusBadge, goalPercentageValue);
    
    // Estado del objetivo
    if (goalStatus) {
        const statusText = transferredCount >= MONTHLY_GOAL 
            ? '🎉 ¡Objetivo mensual completado!' 
            : `${goalPercentageValue}% del objetivo mensual`;
        goalStatus.innerHTML = statusText;
    }
    
    // Actualizar resumen general
    updateMetricElement(totalPharmacies, totalCount);
    updateMetricElement(pendingVisits, pendingVisitsCount);
    updateMetricElement(pendingTransfers, pendingTransfersCount);
    
    // Actualizar estado diario
    updateDailyStatus(visitedCount, transferredCount);
    
    console.log('✅ Métricas actualizadas completamente con objetivos diarios');
}

function updateMetricElement(element, textContent, width = null) {
    if (!element) return;
    
    if (width !== null) {
        element.style.width = width;
    } else if (textContent !== null) {
        element.textContent = textContent;
    }
}

function applyMetricStatus(cardElement, badgeElement, percentageValue) {
    if (!cardElement || !badgeElement) return;

    const normalizedPercentage = Number.isFinite(percentageValue) ? percentageValue : 0;
    let statusClass = 'status-danger';
    if (normalizedPercentage >= 90) {
        statusClass = 'status-success';
    } else if (normalizedPercentage >= 60) {
        statusClass = 'status-warning';
    }

    cardElement.classList.remove('status-success', 'status-warning', 'status-danger');
    cardElement.classList.add(statusClass);

    badgeElement.textContent = normalizedPercentage >= 100 ? 'Cumplido' : 'En progreso';
}

function resetMetricsDisplay() {
    console.log('🔄 Reseteando display de métricas');
    const dailyGoal = dailyConfig.totalDailyGoal;
    
    updateMetricElement(visitsPercentage, '0%');
    updateMetricElement(visitsCount, `0 de ${dailyGoal}`);
    updateMetricElement(visitsProgress, null, '0%');
    applyMetricStatus(visitsCard, visitsStatusBadge, 0);
    
    updateMetricElement(transfersPercentage, '0%');
    updateMetricElement(transfersCount, `0 de ${dailyGoal}`);
    updateMetricElement(transfersProgress, null, '0%');
    applyMetricStatus(transfersCard, transfersStatusBadge, 0);
    
    updateMetricElement(goalRemaining, MONTHLY_GOAL);
    updateMetricElement(goalProgress, null, '0%');
    updateMetricElement(goalPercentage, '0%');
    if (goalStatus) goalStatus.innerHTML = '0% del objetivo mensual';
    applyMetricStatus(goalCard, goalStatusBadge, 0);
    
    updateMetricElement(totalPharmacies, '0');
    updateMetricElement(pendingVisits, '0');
    updateMetricElement(pendingTransfers, '0');
    
    if (dailyStatusElement) {
        dailyStatusElement.textContent = 'En progreso';
        dailyStatusElement.className = 'summary-status status-progress';
    }
}

// ═══════════════════════════════════════════════════════════════
// 🔄 SISTEMA DE REINICIO ACTUALIZADO
// ═══════════════════════════════════════════════════════════════

resetIndicatorsBtn?.addEventListener('click', () => {
    if (resetModal) {
        resetModal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }
});

cancelResetBtn?.addEventListener('click', hideResetModal);

confirmResetBtn?.addEventListener('click', async () => {
    hideResetModal();
    await resetAllIndicators();
});

resetModal?.addEventListener('click', (e) => {
    if (e.target === resetModal) {
        hideResetModal();
    }
});

function hideResetModal() {
    if (resetModal) {
        resetModal.style.display = 'none';
        document.body.style.overflow = '';
    }
}

async function resetAllIndicators() {
    if (!allPharmacies.length) {
        showToast('No hay farmacias para reiniciar', 'warning');
        return;
    }
    
    console.log(`🔄 INICIANDO REINICIO de ${allPharmacies.length} farmacias`);
    showToast(`Reiniciando ${allPharmacies.length} indicadores...`, 'info');
    
    if (resetIndicatorsBtn) {
        resetIndicatorsBtn.disabled = true;
        resetIndicatorsBtn.innerHTML = '<span>Reiniciando...</span>';
    }
    
    try {
        // Procesar en lotes más pequeños
        const BATCH_SIZE = 500; // Firebase tiene límite de 500 operaciones por batch
        let totalProcessed = 0;
        
        for (let i = 0; i < allPharmacies.length; i += BATCH_SIZE) {
            const batch = writeBatch(db);
            const batchPharmacies = allPharmacies.slice(i, i + BATCH_SIZE);
            
            console.log(`🔄 Procesando lote ${Math.floor(i/BATCH_SIZE) + 1}, farmacias ${i} a ${i + batchPharmacies.length}`);
            
            batchPharmacies.forEach(pharmacy => {
                const docRef = doc(db, 'pharmacies', pharmacy.id);
                batch.update(docRef, {
                    visitado: 'Pendiente',
                    transferencia: 'Pendiente',
                    updatedAt: new Date().toISOString(),
                    resetDate: new Date().toISOString()
                });
            });
            
            await batch.commit();
            totalProcessed += batchPharmacies.length;
            
            console.log(`✅ Lote completado. Total procesado: ${totalProcessed}/${allPharmacies.length}`);
            
            // Mostrar progreso cada lote
            if (resetIndicatorsBtn) {
                resetIndicatorsBtn.innerHTML = `<span>Reiniciando... ${totalProcessed}/${allPharmacies.length}</span>`;
            }
        }
        
        // Reiniciar configuración diaria
        dailyConfig.currentWorkDay = 1;
        dailyConfig.pharmaciesPerDay = DEFAULT_PHARMACIES_PER_DAY;
        saveDailyConfig();
        updateDailyConfigUI();
        
        console.log(`🎉 REINICIO COMPLETADO: ${totalProcessed} farmacias reiniciadas`);
        showToast(`🎉 ${totalProcessed} indicadores reiniciados exitosamente`, 'success', 5000);
        showToast('📅 Configuración de días laborales reiniciada', 'info', 3000);
        
    } catch (error) {
        console.error('❌ Error en reinicio:', error);
        showToast('Error al reiniciar indicadores: ' + error.message, 'error');
    } finally {
        if (resetIndicatorsBtn) {
            resetIndicatorsBtn.disabled = false;
            resetIndicatorsBtn.innerHTML = '<span>Nuevo Mes</span><span>🔄</span>';
        }
    }
}

// ═══════════════════════════════════════════════════════════════
// 📋 RENDERIZADO Y FILTROS (Sin cambios)
// ═══════════════════════════════════════════════════════════════

function renderTable(pharmacies) {
    if (!tableBody) return;
    
    tableBody.innerHTML = '';
    
    if (pharmacies.length === 0) {
        showEmptyState(true);
        updateRecordCount(0);
        return;
    }
    
    showEmptyState(false);
    
    const fragment = document.createDocumentFragment();
    
    pharmacies.forEach((pharmacy, index) => {
        const tr = createPharmacyRow(pharmacy, index);
        fragment.appendChild(tr);
    });
    
    tableBody.appendChild(fragment);
    updateRecordCount(pharmacies.length);
    animateTableRows();
}

function createPharmacyRow(pharmacy, index) {
    const tr = document.createElement('tr');
    tr.style.opacity = '0';
    tr.style.transform = 'translateY(10px)';
    
    const nombreCell = `<td><strong title="${escapeHtml(pharmacy.nombre)}">${escapeHtml(pharmacy.nombre)}</strong></td>`;
    const cadenaCell = `<td><span class="cadena-badge">${escapeHtml(pharmacy.cadena)}</span></td>`;
    const direccionCell = `<td><div class="address-text" title="${escapeHtml(pharmacy.direccion)}">${escapeHtml(pharmacy.direccion)}</div></td>`;
    
    const visitadoCell = `
        <td>
            <button class="status-btn ${pharmacy.visitado.toLowerCase()}" 
                    data-id="${pharmacy.id}" 
                    data-field="visitado" 
                    data-current-status="${pharmacy.visitado}"
                    title="Click para cambiar estado de visita">
                <span class="status-text">${pharmacy.visitado}</span>
                <span class="status-icon">${pharmacy.visitado === 'Realizado' ? '✅' : '⏳'}</span>
            </button>
        </td>
    `;
    
    const transferenciaCell = `
        <td>
            <button class="status-btn ${pharmacy.transferencia.toLowerCase()}" 
                    data-id="${pharmacy.id}" 
                    data-field="transferencia" 
                    data-current-status="${pharmacy.transferencia}"
                    title="Click para cambiar estado de transferencia">
                <span class="status-text">${pharmacy.transferencia}</span>
                <span class="status-icon">${pharmacy.transferencia === 'Realizado' ? '📥' : '📤'}</span>
            </button>
        </td>
    `;
    
    tr.innerHTML = nombreCell + cadenaCell + direccionCell + visitadoCell + transferenciaCell;
    return tr;
}

function animateTableRows() {
    const rows = tableBody?.querySelectorAll('tr') || [];
    rows.forEach((row, index) => {
        setTimeout(() => {
            row.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
            row.style.opacity = '1';
            row.style.transform = 'translateY(0)';
        }, index * 20);
    });
}

function populateCadenaFilter() {
    if (!filterCadena) return;
    
    const cadenas = [...new Set(allPharmacies.map(p => p.cadena))].sort();
    const currentSelection = filterCadena.value;
    
    filterCadena.innerHTML = '<option value="">Todas las Cadenas</option>';
    
    cadenas.forEach(cadena => {
        const option = document.createElement('option');
        option.value = cadena;
        option.textContent = cadena;
        filterCadena.appendChild(option);
    });
    
    if (currentSelection && cadenas.includes(currentSelection)) {
        filterCadena.value = currentSelection;
    }
}

function applyFilters() {
    if (!allPharmacies.length) {
        renderTable([]);
        return;
    }
    
    const searchTerm = searchBox?.value.toLowerCase().trim() || '';
    const visitadoStatus = filterVisitado?.value || '';
    const transferenciaStatus = filterTransferencia?.value || '';
    const cadenaFilter = filterCadena?.value || '';
    
    const filteredPharmacies = allPharmacies.filter(pharmacy => {
        const matchesSearch = !searchTerm || 
            pharmacy.nombre.toLowerCase().includes(searchTerm) || 
            pharmacy.direccion.toLowerCase().includes(searchTerm) ||
            pharmacy.cadena.toLowerCase().includes(searchTerm);
        
        const matchesVisitado = !visitadoStatus || pharmacy.visitado === visitadoStatus;
        const matchesTransferencia = !transferenciaStatus || pharmacy.transferencia === transferenciaStatus;
        const matchesCadena = !cadenaFilter || pharmacy.cadena === cadenaFilter;
        
        return matchesSearch && matchesVisitado && matchesTransferencia && matchesCadena;
    });
    
    renderTable(filteredPharmacies);
}

function updateRecordCount(filteredCount) {
    if (!recordCount) return;
    
    const total = allPharmacies.length;
    if (filteredCount === total) {
        recordCount.textContent = `${total} farmacia${total !== 1 ? 's' : ''} en total`;
    } else {
        recordCount.textContent = `${filteredCount} de ${total} farmacias`;
    }
}

function updateUploadSectionVisibility() {
    if (uploadSection) {
        const shouldShow = allPharmacies.length === 0;
        uploadSection.style.display = shouldShow ? 'block' : 'none';
    }
}

// ═══════════════════════════════════════════════════════════════
// 🎯 EVENT LISTENERS (Sin cambios)
// ═══════════════════════════════════════════════════════════════

searchBox?.addEventListener('input', debounce(applyFilters, 300));
filterVisitado?.addEventListener('change', applyFilters);
filterTransferencia?.addEventListener('change', applyFilters);
filterCadena?.addEventListener('change', applyFilters);

btnResetFilters?.addEventListener('click', () => {
    if (searchBox) searchBox.value = '';
    if (filterVisitado) filterVisitado.value = '';
    if (filterTransferencia) filterTransferencia.value = '';
    if (filterCadena) filterCadena.value = '';
    applyFilters();
    showToast('Filtros limpiados', 'info', 2000);
});

refreshBtn?.addEventListener('click', () => {
    showToast('Datos actualizados', 'info', 2000);
    if (refreshBtn) {
        refreshBtn.style.transform = 'rotate(360deg)';
        refreshBtn.style.transition = 'transform 0.5s ease';
        setTimeout(() => {
            refreshBtn.style.transform = 'rotate(0deg)';
        }, 500);
    }
});

themeToggle?.addEventListener('click', toggleTheme);

// ═══════════════════════════════════════════════════════════════
// 🖱️ CLICKS EN TABLA (Sin cambios)
// ═══════════════════════════════════════════════════════════════

tableBody?.addEventListener('click', async (e) => {
    const button = e.target.closest('.status-btn');
    if (!button) return;
    
    const id = button.dataset.id;
    const field = button.dataset.field;
    const currentStatus = button.dataset.currentStatus;
    
    if (button.disabled || !id || !field || !currentStatus) return;
    
    const newStatus = currentStatus === 'Pendiente' ? 'Realizado' : 'Pendiente';
    
    console.log(`🔄 Actualizando ${field} de farmacia ${id}: ${currentStatus} → ${newStatus}`);
    
    const originalContent = button.innerHTML;
    button.disabled = true;
    button.style.opacity = '0.6';
    button.innerHTML = '<span>...</span>';
    
    try {
        const docRef = doc(db, 'pharmacies', id);
        await updateDoc(docRef, { 
            [field]: newStatus,
            updatedAt: new Date().toISOString()
        });
        
        console.log(`✅ Estado actualizado exitosamente`);
        showToast(`${field === 'visitado' ? 'Visita' : 'Transferencia'}: ${newStatus}`, 'success', 2000);
        
    } catch (error) {
        console.error('❌ Error actualizando:', error);
        showToast('Error al actualizar: ' + error.message, 'error');
        button.innerHTML = originalContent;
    } finally {
        button.disabled = false;
        button.style.opacity = '1';
    }
});

// ═══════════════════════════════════════════════════════════════
// ☁️ CARGA DE DATOS INICIALES (SECCIÓN MODIFICADA)
// ═══════════════════════════════════════════════════════════════

btnUpload?.addEventListener('click', async () => {
    if (!confirm('¿Cargar datos iniciales? Solo hazlo una vez.')) return;
    
    console.log('☁️ Iniciando carga...');
    setUploadLoading(true);
    
    try {
        const pharmaciesToUpload = parseInitialData();
        
        if (pharmaciesToUpload.length === 0) {
            throw new Error('No se encontraron datos válidos');
        }
        
        console.log(`📤 Cargando ${pharmaciesToUpload.length} farmacias...`);
        
        const batch = writeBatch(db);
        pharmaciesToUpload.forEach(pharmacy => {
            const docRef = doc(pharmaciesCollection);
            batch.set(docRef, {
                ...pharmacy,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
        });
        
        await batch.commit();
        
        console.log('✅ Carga completada');
        showToast(`🎉 ${pharmaciesToUpload.length} farmacias cargadas`, 'success', 5000);
        
        if (uploadSection) {
            uploadSection.style.display = 'none';
        }
        
    } catch (error) {
        console.error('❌ Error cargando:', error);
        showToast('Error: ' + error.message, 'error');
    } finally {
        setUploadLoading(false);
    }
});

function setUploadLoading(loading) {
    if (!btnUpload) return;
    
    btnUpload.disabled = loading;
    if (loading) {
        btnUpload.innerHTML = '<span>Cargando...</span>';
    } else {
        btnUpload.innerHTML = '<span>Cargar Datos Iniciales</span><span>☁️</span>';
    }
}

function parseInitialData() {
    const rawData = `Farmacia	Cadena	Direccion
10680 - ALTAMIRA	COOPIDROGAS	CR 5 # 94 - 62 - FLORIDABLANCA
109_CRUZ_VERDE_CALLE_56	DROGUERIAS CRUZ VERDE SAS	Calle 56 # 32 - 67 Cabecera BUCARAMANGA
11684 - DROG.GRANADOS II	COOPIDROGAS	CL L35 # 16 A - 65 RINCON DE GIRON - GIRON
12049 - DROG.Y PERF.FELIX	COOPIDROGAS	BUCARAMANGA/ 04 /CR 10 OCC # 45 A
12494 - SKALA	COOPIDROGAS	GIRON / 10. BRR. CAMPESTRE /AV LOS CANEYES # 25
13695 - DROG. Y PERF. OLIMPICA	COOPIDROGAS	BUCARAMANGA/06 (B.SAN RAFAEL) /CR.14 # 3
16201 - DROG.GRANADOS PABLO VI	COOPIDROGAS	CL 11 # 68 - 24 CENTRO - BUCARAMANGA
16603 - DROG.LUZMABE	COOPIDROGAS	FLORIDABLANCA/05(B.SANTA ANA) /CL.8 # 9
16882 - LA COLOMBIA	COOPIDROGAS	BUCARAMANGA/ 07 /CL 33 # 15
17892 - DROG.VITAL	COOPIDROGAS	CL 20 C # 24 - 68 SANTA CRUZ - GIRON
18049 - DROG.PERFUMERIA GRANADOS	COOPIDROGAS	CL 104 B # 42 A - 48 BRR SAN BERNARDO - FLORIDABLANCA
18519 - DROG.LA 16 DE SAN CARLOS	COOPIDROGAS	CR 16 # 1 N - 14 BRR SAN CARLOS - PIEDECUESTA
18745 - DROG.JACOME Y MISCELANEA	COOPIDROGAS	CR 33 # 52 - 145 - BUCARAMANGA
19178 - SUPERDROGAS PIEDECUESTA	COOPIDROGAS	CR 15 # 3 - 34 PUERTO MADERO - PIEDECUESTA
19327 - DROG.EL REFUGIO	COOPIDROGAS	CL 3 AN # 3 B - 22 - PIEDECUESTA
19337 - DROG.EL GALENO DE FLORIDA	COOPIDROGAS	CR 7 # 3 - 50 - FLORIDABLANCA
19545 - DROG.UMEFA	COOPIDROGAS	CR 6 # 8 - 40 - PIEDECUESTA
19643- DROGAS CENTRAL DESCUENTOS BUCARAMAN	COOPIDROGAS	CL 34 # 34 C - 61 BRR ALVAREZ - BUCARAMANGA
19786 - DROG.GRANADOS REPOSO	COOPIDROGAS	CL.56 # 14-83 (B.EL REPOSO) - FLORIDABLANCA
20251 - DROG.GRANADOS VIVERO	COOPIDROGAS	FLORIDABLANCA/ 10 BRR CALDAS /CR 33 # 95
20524 - DROG.SAN RAFAEL	COOPIDROGAS	PIEDECUESTA/ 09 BRR SAN RAFAEL /CL 9 # 13
20525 - DROG.LICO	COOPIDROGAS	CL 7 # 9 - 86 BRR SAN RAFAEL - PIEDECUESTA
20771 - DROG. UNIFARMA	COOPIDROGAS	PIEDECUESTA/ 10 BRR HOYO GRANDE /CR 6 # 14
20828 - DROG.NUEVO SOL	COOPIDROGAS	CL 4 # 7 - 34 - FLORIDABLANCA
21551 - DROG.Y PERFUMERIA EL LAGO	COOPIDROGAS	AV Floridablanca #147-18 EDIF. EQUILIBRIO DE FLORIDABLANCA
21680 - DROGUERIA LA SEPTIMA DE LEBRIJA	COOPIDROGAS	CR 7 # 10 - 44 LEBRIJA
21681 - DROG.DIAMANTE II	COOPIDROGAS	AV.89 # 23-135(B.DIAMANTE II) - BUCARAMANGA
22534 - DROG.LA 62 DISANCOL	COOPIDROGAS	BUCARAMANGA/ 10 BRR. CONUCOS /CL 62 # 30
23250 - DROG.Y PERFUMERIA JAEL	COOPIDROGAS	CL 7 # 10 - 58 - FLORIDABLANCA
23353 - DROG.PINZON Y CIA. LIMITADA	COOPIDROGAS	CR 17 # 35 - 62 - BUCARAMANGA
235 - LA CUMBRE	COOPIDROGAS	FLORIDABLANCA/ 06 BRR LA CUMBRE /CR 9 E # 31
23551 - DROG.COMVIDA	COOPIDROGAS	CL 35 # 2 A - 77 LA CUMBRE - FLORIDABLANCA
23859 - DROG.Y MISCELANEA DROMISALUD	COOPIDROGAS	CL 12 # 9 - 32 LEBRIJA
23876 - DROG.UNIFARMA PLUS	COOPIDROGAS	CL.2 # 16-28 MZ.K LC.5 (B.SAN FRANC PIEDECUESTA
24165 - DROG.PAOLA	COOPIDROGAS	CR.27 # 19-04(B.SANTA CRUZ) GIRON
24807 - DROG.LA RECETA PLUS	COOPIDROGAS	BUCARAMANGA/ 08 /CL 33 # 29
24925 - DROG.FARMISALUD FLORIDA	COOPIDROGAS	TV 127 # 62A - 14 AP 101 P 1 BRR CIUDAD VALENCIA - FLORIDABLANCA
25382 - DROG.Y PERFUMERIA LA VIRTUD SUCURSA	COOPIDROGAS	CL 30 # 10 E - 23 - FLORIDABLANCA
25491 - DROG.NUEVA MULTICLI.DE BUCARAMANGA	COOPIDROGAS	CR 29 # 17 - 72 BUCARAMANGA
26043 - DROG. FARMAMESA	COOPIDROGAS	SECT.MIRADOR BRISAS DE LA ACUARELA - LOS SANTOS
26121 - DROGUERIA NUEVA AVENIDA	COOPIDROGAS	BUCARAMANGA/04 (B.CAMPOHERMOSO) /CL.45 # 3 OCC
26397 - DROGUERIA INTERMUNDIAL	COOPIDROGAS	CR 11 # 12 - 63 LEBRIJA
26428 - DROG.Y MISCELANEA D Y J PLUS	COOPIDROGAS	CL 30 # 7 - 81 BRR LA CUMBRE FLORIDABLANCA
26778 - DROGUERIAS GLOBALFARMA LA CUMBRE	COOPIDROGAS	CR 9 E # 28 - 90 BRR LA CUMBRE - FLORIDABLANCA
26880 - DROGAS CHICAMOCHA	COOPIDROGAS	CR 27 A # 40 - 35 BRR MEJORAS PUBLICAS - BUCARAMANGA
26881 - DROGUERIA FAMIPLUS	COOPIDROGAS	CR 37 # 42 - 111 BRR. CABECERA - BUCARAMANGA
26915 - FARMA CITY LA 12	COOPIDROGAS	SRCT C To.10 APTO 101 bellavista-FLORIDABLANCA
27116 - FARMACIA BOTICA EXPRESS	COOPIDROGAS	CR 9 # 8 - 75 LC 101 FLORIDABLANCA
27134 - DROGUERIA PERFUMERIA ECONOMICA	COOPIDROGAS	DG.105 # 31-16 LC. 13 PLAZA SATELITE - FLORIDABLANCA
27134 - DROGUERIA PERFUMERIA ECONOMICA	COOPIDROGAS	CR 26 # 33-96 ESQ. BUCARAMANGA
27262 - DROGUERIA Y MISCELANEA ALISFA	COOPIDROGAS	CR.24 # 85-29(B.DIAMANTE II) - BUCARAMANGA
27508 - DROGUERIA LA CAMPINA	COOPIDROGAS	CL 28A # 30 - 33-GIRON
27525 - DROGUERIA PHARMALUC	COOPIDROGAS	FLORIDABLANCA/ 11 BRR LA CUMBRE /CL 28 # 5 E
27700 - DROGUERIA FARMAKOS	COOPIDROGAS	CR 33 # 41 - 24 BUCARAMANGA
27726 - DROGUERIA GRANADOS BUCARIA	COOPIDROGAS	FLORIDABLANCA/4 local 101/BLOQUE 14
27978 - DROGUERIA Y MICELANEA CARACOLI	COOPIDROGAS	CR 6 # 1 - 17 BRR CARACOLI FLORIDABLANCA
28053 - DROGUERIA GRANADOS NUEVO SOTO MAYOR	COOPIDROGAS	CL 50 # 23 - 08
28558 - DROGUERIA SANTA CRUZ PLUS	COOPIDROGAS	CR.26 # 17-27 (B.SANTA CRUZ) GIRON
28616 - DROGUERIA LOS ALTOS DEL CACIQUE II	COOPIDROGAS	FLORIDABLANCA/ 03 BRR ALTOS DEL CACIQUE /CL 85 # 56
28819 - DROGUERIA RIVERA PHARMA M	COOPIDROGAS	PIEDECUESTA/ 04 BRR PASEO DEL PUENTE II /CR 4 # 21
29398 - DROG.FARMATOTAL MAS FARMACIA MAS SA	COOPIDROGAS	BUCARAMANGA/ 02 BRR DELICIAS ALTAS /CR 16 # 104 B
29838 - DROGUERIA MISCELANEA ESPANOLA #2	COOPIDROGAS	CR.24 # 87-14(B.DIAMANTE) - BUCARAMANGA
29931 - SU SALUD JB DROGUERIA	COOPIDROGAS	CR 24 # 24 - 11 BRR ALARCON BUCARAMANGA
30058 - DROGUERIA OSORIO SUAREZ	COOPIDROGAS	BUCARAMANGA/ 11 BRR EL PRADO /CL 33 # 33A
30105 - DROGUERIA Y MISCELANEA LORCE	COOPIDROGAS	CL 30 # 1 - 219 BRR LA CUMBRE - FLORIDABLANCA
30212 - DROGUERIAS LEON S.A.S	COOPIDROGAS	CL 105 15B-45 - BUCARAMANGA
30250 - DROGUERIA MOLINOS DEL VIENTO	COOPIDROGAS	CR.16 # 14-68(B.MOLINOS DEL VIENTO)
30338 - DROGUERIA DAFARMA	COOPIDROGAS	GIRON/12/CL 43 # 22
30465 - DROGUERIA Y MISCELANEA CARIOS	COOPIDROGAS	FLORIDABLANCA/11 loc 102 bucarica/BL 18
30644 - DROGUERIA FAMY SALUD	COOPIDROGAS	AV GUAYACANES BL 9 CD REAL DE MINAS - BUCARAMANGA
31209 - DROGUERIA CLER FLORIDA BLANCA	COOPIDROGAS	CR 10A 42-04 EL CARMEN FLORIDABLANCA
31292 - DROGUERIA UNIDAD ASITENCIAL ECOMED	COOPIDROGAS	CL 30 # 9 A E - 35 - FLORIDABLANCA
31355 - DROGUERIA EL SEMBRADOR	COOPIDROGAS	CR 33 # 86-144 T 1 LC 3 CACIQUE C - BUCARAMANGA
31359 - DROGUERIA Y MISCELANIA SALBE	COOPIDROGAS	AV17 # 15A-16 BRR BARRO BLANCO - PIEDECUESTA
31407 - DROGAS ESQUINA DE LA 56	COOPIDROGAS	CLL 56 # 30-122
31618 - DROGUERIA GRANADOS CENTRO	COOPIDROGAS	BUCARAMANGA/ 03 LC 7 ED UNIDAD RES /CL 37 # 22
31903 - FARMAHOGAR CENTRAL	COOPIDROGAS	MESA DE LOS SANTOS GUAYABAL LC.9 VD MESA DE LOS SANTOS
31996 - DROGUERIA RIONEGRO PLAZA	COOPIDROGAS	CL.12 # 10-10 (B. CENTRO) RIONEGRO
32542 - DROGUERIAS GRANADOS DIAMANTE	COOPIDROGAS	AV 89 # 23 - 35 - BUCARAMANGA
32717 - FARMACIA LA LUZ DEL PORVENIR	COOPIDROGAS	CL 104 F # 8 B - 24 LOCAL 8 BLOQUE 3 B - BUCARAMANGA
32718 - DROGUERIA CAMARGO	COOPIDROGAS	CR 2 N # 21 - 16 BRR PASEO DEL PUENTE 2 - PIEDECUESTA
32815 - DROGUERIA SUPREMA LA PAZ	COOPIDROGAS	CR.8 # 13-77 (B. VIA AL MAR CENTRO) EL PLAYON
32820 - DROGUERIA SALUD Y BELLEZA	COOPIDROGAS	AV 17 #2W-144 BRR BARRO BLANCO - PIEDECUESTA
33062 - DROGUERIA FARMAVILLAS SAS 3	COOPIDROGAS	CR. 13 A # 50-65 (B. VILLA LUZ) - FLORIDABLANCA
33063 - DROGUERIA FARMAVILLAS 2	COOPIDROGAS	BUCARAMANGA/ ESQ BRR ALVAREZ /CL 32 # 38
33231 - DROGUERIA VGA	COOPIDROGAS	CL 113 # 32 - 79 COND T DEL BICENTENARIO - FLORIDABLANCA
33243 - DROGUERIA Y MINIMARKET GRAND BOULEV	COOPIDROGAS	CR.20 # 16-56 ET.2 TORRE 2 LC.24 BRR. SAN FRANCISCO BUCRAMANGA
33395 - FARMACIUDADELA	COOPIDROGAS	CL 57 # 16 - 60 BRR GOMEZ NINO - BUCARAMANGA
33433 - DROGUERIA SANTAFE SALUD	COOPIDROGAS	FLORIDABLANCA/ 08 BRR SANTA FE /CR 42 # 107
34098 - DROGUERIA FARMASED	COOPIDROGAS	CL 14C #11-98 ALMENARES DE SAN GIRON - GIRON
34192 - DROGUERIA GRANADOS 5	COOPIDROGAS	BUCARAMANGA/ 06 /CR 27 # 18
34290 - DROGUERIA JEREZ PASEO DEL PUENTE II	COOPIDROGAS	PIEDECUESTA/04 /CR 5B # 22
34317 - DROGUERIA FARMASED 2	COOPIDROGAS	GIRON/02 LC 2 /CR 13 # 13C
34519 - FAMIRSALUD OASIS	COOPIDROGAS	FLORIDABLANCA/06 BARRIO EL OASIS /DG 17 #55
34632 - DROGUERIA Y PERFUMERIA FAMAVILLAS	COOPIDROGAS	BUCARAMANGA/04 /Cl. 105 #15B
34842 - DROGUERIA GRANADOS MUTIS 2	COOPIDROGAS	BUCARAMANGA/04 /CL 59 # 3W
34847 - DROGUERIA SUPER DROGUERIA S.C	COOPIDROGAS	CR.22 # 32-03 (B. ANTONIA SANTOS) BUCARAMANGA
34853 - PHARMALIS DROGUERIA	COOPIDROGAS	BUCARAMANGA/02 BRR EL GIRARDOT /CR 5 # 28
34867 - DROGUERIA CLER	COOPIDROGAS	CL 197 # 28 - 62 BRR RECREO - FLORIDABLANCA
34870 - DROGUERIA FARMA GOMEZ MATIAS	COOPIDROGAS	FLORIDABLANCA/ 09 BRR VALENCIA /CR 12 # 8
34876 - DROGUERIAFAMYSALUD	COOPIDROGAS	CR 3 # 61 - 27 - BUCARAMANGA
35015 - FARMACLUB 2	COOPIDROGAS	CL 52 # 35 A - 40 - BUCARAMANGA
35266 - DROGUERIA MEDICAM PLUS	COOPIDROGAS	CR 6 # 14 - 90 - PIEDECUESTA
35280 - DROGUERIA GRANADOS SAN FRANCISCO PL	COOPIDROGAS	CL 13 # 21 - 48 SAN FRANCISCO - BUCARAMANGA
35286 - DROGUERIA NUEVA LUZ	COOPIDROGAS	Dg. 45 # 109A-26 - FLORIDABLANCA
35540 - DROGUERIA GRANADOS EL PUENTE	COOPIDROGAS	CR 6 # 19-13 - PIEDECUESTA
36127 - DROGUERIA ECOVIDA	COOPIDROGAS	CR 15 # 8 - 22 - PIEDECUESTA
36217 - DROGUERIA SUPERDROGAS LEBRIJA	COOPIDROGAS	CL 12 # 8 - 12 LEBRIJA
36385 - DROGUERIA Y PERFUMERIA VIVIR	COOPIDROGAS	CL 32 # 33 A - 54 - BUCARAMANGA
36557 - DROG. PHARMADESCUENTOS LA UNIVERSID	COOPIDROGAS	BUCARAMANGA/ 02 BRR LA UNIVERSIDAD /CR 25 # 9
36861 - HIPERFARMACIA AG	COOPIDROGAS	CR 11 67 -93 - BUCARAMANGA
36881 - DROGUERIA UNICENTRO	COOPIDROGAS	CL.18 # 25-114 (B.PORTAL CAMPESTRE) GIRON
36979 - DROGUERIA Y PERFUMERIA SAN FELIPE	COOPIDROGAS	CL.117 # 27-60 (B.NIZZA) - FLORIDABLANCA
37652 - DROGUERIA ZAMBRANO PLUS	COOPIDROGAS	CL. 31 # 20 -17 (B. CENTRO) BUCARAMANGA
37753 - DROGUERIA FARMACLARO	COOPIDROGAS	CR 3 # 58-17 LOS NARANJOS - BUCARAMANGA
38008 - DROGUERIA EL DEPOSITO CENTRO	COOPIDROGAS	CL 36 # 13 - 27 BRR CENTRO - BUCARAMANGA
38009 - DROGUERIA EL DEPOSITO	COOPIDROGAS	CR 21 # 54-34 LA CONCORDIA - BUCARAMANGA
38812 - DROG.Y PERF.SOTOMAYOR	COOPIDROGAS	BUCARAMANGA/03(B.SOTOMAYOR) /CL.48 # 26
39199 - SUPERDROGUERIA LA MEJOR	COOPIDROGAS	CL 11 # 7 - 11 LEBRIJA
39216 - DROGUERIA GRANADOS LA OCTAVA	COOPIDROGAS	CL.6 # 8-10(B.CASCO ANTIGUO FLORIDA FLORIDABLANCA
40369 - FARMACIA Y DROGUERIA SAN JUAN DE GI	COOPIDROGAS	CR 26 # 28 - 05 GIRON
40622 - DROGUERIA GRANADOS AMIGA	COOPIDROGAS	CL 10 # 5 - 57 - PIEDECUESTA
41878 - DROGUERIA FARMATECUIDA	COOPIDROGAS	CL. 20 C # 19 - 03 (B. PORTAL CAMPE) GIRON
634_CRUZ_VERDE_CABECERA DEL LLANO	DROGUERIAS CRUZ VERDE SAS	Carrera 33 # 46 - 61 BUCARAMANGA
831_CRUZ_VERDE_CC_CACIQUE	DROGUERIAS CRUZ VERDE SAS	Transversal 93 # 34 -99 Local 371 y 372 BUCARAMANGA
983_FARMACIA_INTERNA_CRUZ_VERDE_CLINICA SAN LUIS	DROGUERIAS CRUZ VERDE SAS	CL 48 # 25 - 56 BUCARAMANGA
ALBA LUZ	DROSAN LTDA	CR 33 109-36 FLORIDABLANCA
ALEMANA 08	UNIDROGAS S.A.S.	CL 60 # 9 - 109 T 4 L 7 - 8 TO SAN REMO BUCARAMANGA
ALEMANA 160	UNIDROGAS S.A.S.	CL 200 # 13 - 08 LC 3 ED MONTESOL FLORIDABLANCA
ALEMANA 178	UNIDROGAS S.A.S.	CR 33 # 52 B - ESQ BRR CABECERA BUCARAMANGA
ALEMANA 26 LA FOSCAL	UNIDROGAS S.A.S.	TV 154 # 150 - 207 BRR BOSQUE FLORIDABLANCA
ALEMANA 356	UNIDROGAS S.A.S.	CR. 26 # 42-29 GIRON
ALEMANA 58	UNIDROGAS S.A.S.	CR 6 # 9 - 40 piedecuesta
COOFARMA 5	UNIDROGAS S.A.S.	CR 33 # 52 B - 18 BUCARAMANGA
DMAX	DROSAN LTDA	CL 1 W #5AN -15 BRR REFUGIO PIEDECUESTA
DROGUERIA AHORRA MAX	INDEPENDIENTE	CL 3 AN # 30 - 09 BRR EL REFUGIO
DROGUERIA AHORRAMEDIC	INDEPENDIENTE	CL 52 # 31 - 104 BRR CABECERA
DROGUERIA ALEMANA 32 CACIQUE	UNIDROGAS S.A.S.	TV ORIENTAL # 35 - 254 MIRADOR DEL CACIQUE BUCARAMANGA
DROGUERIA ALVAREZ	INDEPENDIENTE	CR 38 # 32 - 121
DROGUERIA ANGY MAR	DROSAN LTDA	AV GUAYACANES T-19 L101 CIUDAD BOLIVAR BUCARAMANGA
DROGUERIA ANTOLINEZ	INDEPENDIENTE	CR 2W # 59 - 23 MUTIS - BUCARAMANGA
DROGUERIA BLANTONY	INDEPENDIENTE	CL 60 # 9 - 103 BRR CIUDADELA
DROGUERIA CAMPO HERMOSO	DROSAN LTDA	CL 45 # 5 OCC - 10 BUCARAMANGA
DROGUERIA CARMENCITA	DROSAN LTDA	CL 30 # 29 B - 11 FLORIDABLANCA
DROGUERIA CENTRAL DESCUENTOS	INDEPENDIENTE	CL 67 # 17 - 14 BRR LA VICTORIA - BUCARAMANGA
DROGUERIA CONSULTORIO 2 CONSULTORIO ALIRIO LOPEZ NO. 2	UNIDROGAS S.A.S.	CL 30 # 7 E - 95 LA CUMBRE FLORIDABLANCA
DROGUERIA CRUZ VERDE CAÑAVERAL	DROGUERIAS CRUZ VERDE SAS	CL 30 # 25-71 CENTRO COMERCIAL CAÑAVERAL LOCAL 31 FLORIDABLANCA
DROGUERIA DANNYS	INDEPENDIENTE	SANANDRESITO ISLA LC 7 - 31 P 3
DROGUERIA DISERVAL	DROSAN LTDA	CL 31 #28-74 B. LA AURORA BUCARAMANGA
DROGUERIA DISTRIBUIDORA EL NILO	INDEPENDIENTE	CC SAN ANDRESITO ISLA P 1 L 7 - 28 Y 7 - 29
DROGUERIA DISTRIBUIDORA SANDRA C	INDEPENDIENTE	CC SAN ANDRESITO ISLA P 3 L 8 - 35 Y 8 - 33
DROGUERIA ECOFARMA	DROSAN LTDA	CR 2 C # 21 - 04 BRR PASEO DEL PUENTE II PIEDECUESTA
DROGUERIA ECOFARMA PLUS	DROSAN LTDA	CR 1W #5AN-15 REFUGIO PIEDECUESTA
DROGUERIA EL CARMEN - BUCARAMANGA	DROSAN LTDA	BUCARAMANGA/02 BRR EL GIRARDOT /CL 28 #6
DROGUERIA EL DUENDE	DROSAN LTDA	KILOMETRO 9 VIA CUROS - LOS SANTOS (MUNICIPIO LOS SANTOS)
DROGUERIA EL PAISA	DROSAN LTDA	CRA 15 # 56 CC SANADRESITO ISLA LC 7 - 8 BUCARAMANGA
DROGUERIA EL SEGURO	DROSAN LTDA	CR 31 # 27 - 48 BUCARAMANGA
DROGUERIA FARMA EXPRESS	DROSAN LTDA	CR 6 #27-02 BRR EL GIRARDOT BUCARAMANGA
DROGUERIA FARMA GOMEZ	DROSAN LTDA	CR 7#29-15 BRR EL GIRARDOT BUCARAMANGA
DROGUERIA FARMACIA SALUD FAMILIAR	DROSAN LTDA	CL 33 # 16 - 34 PLAZA DE MERCADO CENTRO BUCARAMANGA
DROGUERIA FARMAMEDICA MUTIS	DROSAN LTDA	CR 7W#59-22 BUCARAMANGA
DROGUERIA FARMAMETROPOLIS	DROSAN LTDA	CR 8 # 61 - 137 L7 BRR METROPOLIS-BUCARAMANGA
DROGUERIA FARMASOLANO	DROSAN LTDA	CL 59 # 18 - 31 BRR TRINIDAD FLORIDABLANCA
DROGUERIA FIORELLA	INDEPENDIENTE	CR 21 B # 111 - 124
DROGUERIA FLORIDA	DROSAN LTDA	CR 8 # 7 - 53 BRR CENTRO FLORIDABLANCA
DROGUERIA FOSCAL	INDEPENDIENTE	CR 24 # 154 - 106 URB EL BOSQUE - FLORIDABLANCA
DROGUERIA JEREZ SAN RAFAEL	DROSAN LTDA	CR 15 # 7 - 14 SAN RAFAEL PIEDECUESTA
DROGUERIA KOLSUDROGAS	DROSAN LTDA	CL 39 # 22 - 30 GIRON
DROGUERIA LA GENERICA	UNIDROGAS S.A.S.	CL 113 #32-43 LC 17 T0RRES DEL BICENTENARIO FLORIDABLANCA
DROGUERIA LA SEPTIMA PIEDECUESTA	DROSAN LTDA	CL 7 # 10 - 99 PIEDECUESTA
DROGUERIA LAS PRIMICIAS	DROSAN LTDA	CL 14B # 12A-76 VILLAS DE DON JUAN GIRON
DROGUERIA LAS VILLAS	DROSAN LTDA	CL 10B # 22 - 09 GIRON
DROGUERIA LAS VILLAS DE SAN JUAN	DROSAN LTDA	CL 10b # 24A - 16 BRR. SAN JUAN DE GIRON GIRON
DROGUERIA LEBRI FARMA	DROSAN LTDA	CL 12 # 13 A - 25 LEBRIJA
DROGUERIA LINEAVITAL	DROSAN LTDA	CR 10E # 67 - 42 PABLO VI BUCARAMANGA
DROGUERIA LORENA	DROSAN LTDA	CR 7 # 10 - 38 PIEDECUESTA
DROGUERIA M Y D	DROSAN LTDA	CR # 53 - 03 BRR EL RECREO FLORIDABLANCA
DROGUERIA MARIA REYNA	DROSAN LTDA	CL 27 #6-44 BRR EL GIRARDOT BUCARAMANGA
DROGUERIA MEDIEXPREESS	DROSAN LTDA	CR 15 # 3 - 166 BRR PUERTO MADERO PIEDECUESTA
DROGUERIA MEDIFARMA	DROSAN LTDA	CR 4 # 1 B -28 CAMPO VERDE PIEDECUESTA
DROGUERIA MULTIFARMA #1	DROSAN LTDA	CL 105 # 29A - 21-FLORIDABLANCA
DROGUERIA MX ALKOSTO	DROSAN LTDA	CR 13 # 103 B - 46 BRR SAN FERMIN BUCARAMANGA
DROGUERIA NAYIBE	DROSAN LTDA	CLL 4 #8-31 FLORIDABLANCA
DROGUERIA NUEVA SAN CARLOS	INDEPENDIENTE	CR 25 # 13 - 28 BRR SAN FRANCISCO
DROGUERIA PAGUE MENOS CABECERA	INDEPENDIENTE	CR 35 # 52 - 88
DROGUERIA PAGUE MENOS GIRON	INDEPENDIENTE	CL 43 # 22 - 92
DROGUERIA PAGUE MENOS PIEDECUESTA	INDEPENDIENTE	CR 8 # 7 - 77
DROGUERIA PAGUE MENOS PROVENZA	INDEPENDIENTE	CL 105 # 21 - 139
DROGUERIA PAGUE MENOS SOTOMAYOR	INDEPENDIENTE	CL 54 # 24 - 03
DROGUERIA PALENQUE	INDEPENDIENTE	CR 19 # 56 - 58. BRR EL PALENQUE
DROGUERIA PHARMACY	DROSAN LTDA	AV EL BOSQUE # 54 - 52 FLORIDABLANCA
DROGUERIA PROVIDA	INDEPENDIENTE	CR 22 # 110 - 44
DROGUERIA QUINTA REAL LAS PALMAS	INDEPENDIENTE	CR 15 # 6 N - 03
DROGUERIA SAN LUIS - BUCARAMANGA	DROSAN LTDA	CL 48 # 26 - 19 BRR SOTOMAYOR - BUCARAMANGA
DROGUERIA SAN PABLO	INDEPENDIENTE	CR 22 # 11 - 81 BRR SAN FRANCISCO
DROGUERIA SANA SANAR	INDEPENDIENTE	CL 10B # 20 - 04 -LAS VILLAS - GIRON
DROGUERIA SANTA CECILIA	DROSAN LTDA	CL 21 # 23 - 75 BUCARAMANGA
DROGUERIA SERVIFARMA	DROSAN LTDA	SECTOR 9 BL 16 - 7 FLORIDABLANCA
DROGUERIA SILVA	DROSAN LTDA	FLORIDABLANCA/09/Cl. 57 #3
DROGUERIA SOLETH	DROSAN LTDA	CR. 6 #28-65(B.GIRARDOT) BUCARAMANGA
DROGUERIA SUPERDROGAS CONUCOS	DROSAN LTDA	CL 58 # 29 - 31 LOCAL 5 BUCARAMANGA
DROGUERIA SUPERVIDA	INDEPENDIENTE	CR 8 # 3 - 49 AGUACHICA
DROGUERIA UNICA	INDEPENDIENTE	CR 15 # 3 - 34 PUERTO MADERO PIEDECUESTA
DROGUERIA UNIVERSIDAD	DROSAN LTDA	CR 26 A # 10 - 18 BUCARAMANGA
DROGUERIA VALERY	DROSAN LTDA	CR 23 # 7A-04 BR. MIRADOR ARENALES GIRON
DROGUERIA VIDA LTDA	INDEPENDIENTE	CR 32 # 30A - 20 BRR. AURORA-BUCARAMANGA
DROGUERIA VIRTUAL	DROSAN LTDA	CL 106 # 49 - 19- FLORIDABLANCA
DROGUERIA Y CACHARRERIA AYS	INDEPENDIENTE	CC SAN ANDRESITO ISLA P 3 L 8 - 36
DROGUERIA Y DISTRIBUCIONES ABASTOS XIMENA	INDEPENDIENTE	DG 15 # 55 - 56 L F - 02 CC SAN ANDRESITO LA ISLA
DROGUERIA Y PERFUMERIA ANTIOQUEÑA	INDEPENDIENTE	DG 105 # 30B - 13 SATELITE-FLORIDABLANCA
EKONOFARMA	DROSAN LTDA	CR 4 No- 0-20 LOC 1 PALERMO 1- PIEDECUESTA
EL FARMACEUTA	DROSAN LTDA	CL 103 NO. 13B-79-BUCARAMANGA
FARMACIA 1A	DROSAN LTDA	BUCARAMANGA/04 LOC 1/CR 15 103
FARMACIA SAN MIGUEL	DROSAN LTDA	VIA PIEDECUESTA LOS SANTOS CONDOMINIO MESA DE LOS SANTOS LOCAL 3 - LOS SANTOS
FARMASAY	DROSAN LTDA	CR 33 # 111-13 FLORIDABLANCA
FIN DE LABOR 10	LAB. CHALVER	LABORATORIOS CHALVER
FIN DE LABOR 11	LAB. CHALVER	LABORATORIOS CHALVER
FIN DE LABOR 12	LAB. CHALVER	LABORATORIOS CHALVER
FIN DE LABOR 13	LAB. CHALVER	LABORATORIOS CHALVER
FIN DE LABOR 14	LAB. CHALVER	LABORATORIOS CHALVER
FIN DE LABOR 15	LAB. CHALVER	LABORATORIOS CHALVER
FIN DE LABOR 16	LAB. CHALVER	LABORATORIOS CHALVER
FIN DE LABOR 17	LAB. CHALVER	LABORATORIOS CHALVER
FIN DE LABOR 18	LAB. CHALVER	LABORATORIOS CHALVER
FIN DE LABOR 19	LAB. CHALVER	LABORATORIOS CHALVER
FIN DE LABOR 20	LAB. CHALVER	LABORATORIOS CHALVER
FIN DE LABOR 4	LAB. CHALVER	LABORATORIOS CHALVER
FIN DE LABOR 5	LAB. CHALVER	LABORATORIOS CHALVER
FIN DE LABOR 6	LAB. CHALVER	LABORATORIOS CHALVER
FIN DE LABOR 7	LAB. CHALVER	LABORATORIOS CHALVER
FIN DE LABOR 8	LAB. CHALVER	LABORATORIOS CHALVER
FIN DE LABOR 9	LAB. CHALVER	LABORATORIOS CHALVER
INICIO DE LABOR 10	LAB. CHALVER	LABORATORIOS CHALVER
INICIO DE LABOR 11	LAB. CHALVER	LABORATORIOS CHALVER
INICIO DE LABOR 12	LAB. CHALVER	LABORATORIOS CHALVER
INICIO DE LABOR 13	LAB. CHALVER	LABORATORIOS CHALVER
INICIO DE LABOR 14	LAB. CHALVER	LABORATORIOS CHALVER
INICIO DE LABOR 15	LAB. CHALVER	LABORATORIOS CHALVER
INICIO DE LABOR 16	LAB. CHALVER	LABORATORIOS CHALVER
INICIO DE LABOR 17	LAB. CHALVER	LABORATORIOS CHALVER
INICIO DE LABOR 18	LAB. CHALVER	LABORATORIOS CHALVER
INICIO DE LABOR 19	LAB. CHALVER	LABORATORIOS CHALVER
INICIO DE LABOR 20	LAB. CHALVER	LABORATORIOS CHALVER
INICIO DE LABOR 5	LAB. CHALVER	LABORATORIOS CHALVER
INICIO DE LABOR 6	LAB. CHALVER	LABORATORIOS CHALVER
INICIO DE LABOR 7	LAB. CHALVER	LABORATORIOS CHALVER
INICIO DE LABOR 8	LAB. CHALVER	LABORATORIOS CHALVER
INICIO DE LABOR 9	LAB. CHALVER	LABORATORIOS CHALVER
JEREZ	DROSAN LTDA	CR 15 E No. 105-61-BUCARAMANGA
LA VICTORIA	DROSAN LTDA	BUCARAMANGA/07/CL 67 13
MANUELA BELTRAN	DROSAN LTDA	CR 13 #104C-34-BUCARAMANGA
PHARMA PROVENZA	DROSAN LTDA	CL 105 # 23-135 BUCARAMANGA
PUNTO FARMACEUTICO	INDEPENDIENTE	CLL 63 #17E-01B
REBAJA No. 11 BUCARAMANGA RICAURTE	COPSERVIR	CL 56 # 17 C - 12 BUCARAMANGA
REBAJA PLUS No. 1 BUCARAMANGA PROVENZA	COPSERVIR	CL 105 # 22 - 83 BRR PROVENZA BUCARAMANGA
REBAJA PLUS No. 11 BUCARAMANGA SEDE ADMINISTRATIVA BUCARAMANGA	COPSERVIR	Carrera 16 No. 47-82 BUCARAMANGA
REBAJA PLUS No. 14 BUCARAMANGA DIAMANTE II	COPSERVIR	Carrera 26 No. 85-44 BUCARAMANGA
REBAJA PLUS No. 2 BUCARAMANGA CIUDADELA REAL DE MINAS	COPSERVIR	AV SAMANES # 9 - 75 BUCARAMANGA
REBAJA PLUS No. 3 BUCARAMANGA SOTOMAYOR	COPSERVIR	CR 27 # 41 - 02 BUCARAMANGA
REBAJA PLUS No. 4 BUCARAMANGA GUARIN	COPSERVIR	CR 33 # 30 A - 09 BUCARAMANGA
REBAJA PLUS No. 6 BUCARAMANGA SAN ALONSO	COPSERVIR	CR 30 # 14 - 06 BUCARAMANGA
REBAJA PLUS No. 8 BUCARAMANGA LAS DELICIAS	COPSERVIR	CL 105 # 15 D - 03 BUCARAMANGA
TODO SALUD	DROSAN LTDA	CR 26 #31-70 BUCARAMANGA
VICTORIA DE LOS REYES	DROSAN LTDA	CL 67 18-25-BUCARAMANGA
INICIO DE LABOR 1	LAB. CHALVER	LABORATORIOS CHALVER
174_CRUZ_VERDE_PARQUE_TURBAY	DROGUERIAS CRUZ VERDE SAS	CR 28 # 48-60 BUCARAMANGA
444_DROGUERIA_CRUZ_VERDE_CARRERA_33	DROGUERIAS CRUZ VERDE SAS	Carrera 33 # 41 - 45 BUCARAMANGA
24583 - DROG.SUPERVIT LOS PINOS	COOPIDROGAS	CL 14 # 34 - 85 BRR PINOS - BUCARAMANGA
SUPERNOVA	DROSAN LTDA	CR 40 203-28-FLORIDABLANCA
DROGERIA TAYSOFI	INDEPENDIENTE	CR 7 # 5 - 06 AV CARACOLI
34965 - DROGUERIA BUCARICA	COOPIDROGAS	FLORIDABLANCA/3 LOC 101 SECTOR 12 BUCARICA/BL 20
LA Y	DROSAN LTDA	AV BUCARICA T8-1 FLORIDABLANCA
26915 - FARMA CITY LA 12	COOPIDROGAS	SRCT C To.10 APTO 101 bellavista-FLORIDABLANCA
DROGUERIA PHARMALAGOS	DROSAN LTDA	CL 29 # 7 - 08 LAGOS 3 FLORIDABLANCA
30986 - MAFCONT DROGUERIAS EL LAGO I	COOPIDROGAS	Cl. 29 #11-126 FLORIDABLANCA
1022_CRUZ_VERDE_CARACOLÍ	DROGUERIAS CRUZ VERDE SAS	Carrera 27 # 29 – 145 Local 408 FLORIDABLANCA
DROGUERIA PAGUE MENOS CAÑAVERAL	INDEPENDIENTE	CL 33 # 26 - 27 CAÑAVERAL
FIN DE LABOR 1	LAB. CHALVER	LABORATORIOS CHALVER
INICIO DE LABOR 2	LAB. CHALVER	LABORATORIOS CHALVER
40535 - DROGUERIA FARMASAYE	COOPIDROGAS	CR.8 # 8-43 (B. CASCO ANTIGUO) FLORIDABLANCA
ALEMANA 60	UNIDROGAS S.A.S.	CR 26 # 30 - 28 BRR CAÑAVERAL FLORIDABLANCA
31786 - DROGUERIA MEGAMODERNA PLUS 24 - 7	COOPIDROGAS	CR 4 # 48 - 07 BRR LAGOS II FLORIDABLANCA
DROGUERIA BLANCO	DROSAN LTDA	CR 6 # 39 - 26 LAGOS II FLORIDABLANCA
DROGUERIA SANTA LUCIA	DROSAN LTDA	CR 6 # 42 - 13 LAGOS II FLORIDABLANCA
29094 - DROGUERIA GRANADOS MENDOZA	COOPIDROGAS	CR 6 # 43 - 18 LOCAL 2 BRR LAGOS II FLORIDABLANCA
29736 - DROGUERIA CAMARGO VALENCIA	COOPIDROGAS	CR 12 # 14 - 34 .3 ESQ BRR CUIDAD VALENCIA-FLORIDABLANCA
DROGUERIAS JEREZ VILLABEL	DROSAN LTDA	CR 12 # 7 - 11 FLORIDABLANCA
DROGUERIA VILLABEL	DROSAN LTDA	FLORIDABLANCA/ 04/CR 11 # 12
ALEMANA 355	UNIDROGAS S.A.S.	CALLE 30 # 25-71 CC CAÑAVERAL LOC 106 FLORIDABLANCA
REBAJA PLUS No. 1 FLORIDABLANCA CANAVERAL	COPSERVIR	CL 30 # 26 - 10 FLORIDABLANCA
DROGUERIA PAGUE MENOS FLORIDABLANCA	INDEPENDIENTE	CR 8 # 4 - 48 Y 52 FLORIDABLANCA
DROGUERIA GRANADOS CAFASAN	DROSAN LTDA	FLORIDABLANCA/ 02 CALDAS/CR 37 # 109
DROGUERIA REBAJA PLUS 9 CACIQUE	COPSERVIR	AV CRV # 35 - 95 FLORIDABLANCA
DROGUERIA PINZON 2	DROSAN LTDA	CR 38 # 49 - 15 BUCARAMANGA
294_CRUZ_VERDE_JUMBO_CABECERA_TIENDA	DROGUERIAS CRUZ VERDE SAS	CR 33 # 41 - 34 BUCARAMANGA
27727 - DROGUERIA GRANADOS SAN PIO	COOPIDROGAS	CR 29 # 44 - 80 - BUCARAMANGA
26177 - GRANADOS LIMONCITO	COOPIDROGAS	FLORIDABLANCA/09 /CR 15 # 6
FIN DE LABOR 2	LAB. CHALVER	LABORATORIOS CHALVER
INICIO DE LABOR 3	LAB. CHALVER	LABORATORIOS CHALVER
REBAJA PLUS 5 FLORIDABLANCA	COPSERVIR	CR 8 # 4 - 76 FLORIDABLANCA
34840 - DROGUERIA SANEDIL	COOPIDROGAS	CR.24 # 31-04 (B. ANTONIA SANTOS) BUCARAMANGA
34847 - DROGUERIA SUPER DROGUERIA S.C	COOPIDROGAS	CR.22 # 32-03 (B. ANTONIA SANTOS) BUCARAMANGA
37652 - DROGUERIA ZAMBRANO PLUS	COOPIDROGAS	CL. 31 # 20 -17 (B. CENTRO) BUCARAMANGA
25024 - DROG.J.E.ORTIZ	COOPIDROGAS	CR 22 # 35 - 51 - BUCARAMANGA
20816 - DROG.NUEVO MILENIO II	COOPIDROGAS	CR.12 # 19-30(B.KENNEDY) BUCARAMANGA
29153 - DROGUERIA GRANADOS KENNEDY	COOPIDROGAS	CL.12 # 17N-05(B.KENEDY) BUCARAMANGA
26348 - DROG Y PERFUMERIA HERFRAN	COOPIDROGAS	CR 14 A # 1- 40 - BUCARAMANGA
DROGUERIA ASILO	DROSAN LTDA	CALLE 2 # 14A-123 BUCARAMANGA
ALEMANA 12	UNIDROGAS S.A.S.	CR 18 # 34 - 01 BUCARAMANGA
19159 - DROG.Y PERFUMERIA DROGFARMA	COOPIDROGAS	BUCARAMANGA/ 12 BRR ALARCON /CL 28 # 19
26700 - DROGUERIA DORENA	COOPIDROGAS	CR.19 # 21-78(B.ALARCON) - BUCARAMANGA
DROGUERIA 306 FARMASOLANO	DROSAN LTDA	CR 22 # 21 - 79 BUCARAMANGA
DROGUERIA BULEVAR	DROSAN LTDA	CL 18 # 21 - 74 BUCARAMANGA
DROGUERIA PAGUE MENOS SAN FRANCISCO	INDEPENDIENTE	BLV # 23 - 03
27725 - DROG.Y CACHARRERIA GRANADOS SAN FRA	COOPIDROGAS	BUCARAMANGA/ 09 /CL 11 # 23
29931 - SU SALUD JB DROGUERIA	COOPIDROGAS	CR 24 # 24 - 11 BRR ALARCON BUCARAMANGA
FIN DE LABOR 3	LAB. CHALVER	LABORATORIOS CHALVER
INICIO DE LABOR 4	LAB. CHALVER	LABORATORIOS CHALVER
DROGUERIA CAMELOT	DROSAN LTDA	CLL 8N #3 -190 LOCAL 4 GUATIGUARA PIEDECUESTA
36779 - DROGUERIA EL ATRIO	COOPIDROGAS	CR. 3A # 7N-36(B. JUNIN 1) PIEDECUESTA
10933 - DROGUERIA SAN JORGE - AGUACHICA	COOPIDROGAS	CL 5 # 15 - 90 - AGUACHICA
18202 - DROGUERIA SUPERDROGAS PARRA	COOPIDROGAS	Cra 8 # 9-51 - PELAYA
21812 - DROGUERIA OCAÑA	COOPIDROGAS	CL 11 # 13 - 69 - OCAÑA
21821 - DROGUERIA AVENIDA OCAÑA	COOPIDROGAS	CL 7 # 28 - 55 BRR PRIMAVERA - OCAÑA
23127 - DROGUERIA VALERY SOFIA	COOPIDROGAS	PELAYA/04(B.ALFONSO LOPEZ) /CL.8 # 8
25113 - DROGUERIA CENTRAL OCAÑA	COOPIDROGAS	CR 12 # 9 - 60 - OCAÑA
25211 - DROGUERIA SERVIC D	COOPIDROGAS	CR 7 # 14 - 26 (B. CENTRO) - SAN MARTIN
26367 - DROGUERIA LA DOCE	COOPIDROGAS	CL 12 # 6 - 119
26797 - DROGUERIA LA CURITA PLUS 2	COOPIDROGAS	CL 5 # 22 - 85 - AGUACHICA
27760 - DROGUERIA PAGUE MENOS OCANA	COOPIDROGAS	CR 11 # 12 - 02
27900 - DROGUERIA LA 10 OCAÑA	COOPIDROGAS	CL 10 # 14 - 81- OCAÑA
28998 - DROGUERIA PERFUMERIA HL	COOPIDROGAS	CR 4 # 4 - 39
29088 - DROGUERIA PAGUE MENOS LA QUINTA	COOPIDROGAS	CL 5 # 17 - 90 - AGUACHICA
29388 - DROGUERIA BENDITA PLUS	COOPIDROGAS	CL.6 # 8-04 (B.ARAUJO) GAMARRA
29567 - DROGUERIA FARMAPAEZ	COOPIDROGAS	CR 5 # 12-73J (B.CALLE REAL) - ABREGO
30494 - DROGUERIA BETEL	COOPIDROGAS	Cl. 11 #16a 21 local 3 - OCAÑA
32268 - DROGUERIA PHARMAKOS	COOPIDROGAS	CR 6 # 12-14 (B. CALLE CENTRAL) - ABREGO
33137 - DROGUERIA VELEÑO	COOPIDROGAS	SAN ALBERTO/04 (B. VILLA FANNY) /CL 2 # 4
34567 - DROGUERIA LA 13 OCAÑA	COOPIDROGAS	CR 13 # 11 - 56 - OCAÑA
36061 - MAS X MENOS	COOPIDROGAS	CL 5 # 29-52 - AGUACHICA
37491 - DROGUERIA MAXIDROGAS	COOPIDROGAS	CL.6 # 16-66 LC.3 (B.OLYA HERRERA) - AGUACHICA
37955 - DROGUERIA LUPITA	COOPIDROGAS	OCAÑA/07 SANTA CLARA /CR 49 N° 4
37992 -DROGUERIA LA FLORESTA PLUS	UNIDROGAS S.A.	CR 22#54-50 BUCARAMANGA
39778 - DROGUERIA CLAVIJO	COOPIDROGAS	CR 13 # 9 - 34 - OCAÑA
40159 - DROGUERIA LA X 5	COOPIDROGAS	OCAÑA/03(B.LAS LLAMADAS) /CL 7 # 26
40336 - DROGUERIA X SANTA CLARA	COOPIDROGAS	CL 5A # 48-75 SANTA CLARA
40337 - DROGUERIA X SAN AGUSTIN	COOPIDROGAS	CL. 11 # 15 -10 (B. SAN AGUSTIN)
40459 - DROGUERIA SANTA ISABEL	COOPIDROGAS	CR.6 # 13 - 64 (B. CENTRO)
40811 - DROG SANTA CLARA	COOPIDROGAS	CR.55B # 24-49 (B.SAN ANTONIO) RIONEGRO
40952 - DROGUERIA PINEDA	COOPIDROGAS	CR.15 A # 11 - 02 (B. SAN AGUSTIN)
42088 - CURITA PLUS DROGUERIA	COOPIDROGAS	CR 15 # 5 - 02
42179 - DROGUERIA MAXIDROGAS ABREGO	COOPIDROGAS	CL. 18 # 4 - 02 (B. SANTA BARBARA)
42213 - DROGUERIA UNIDROGAS EDGOSA SAFME	COOPIDROGAS	CR 6 # 15-31 ESQUINA ABREGO ABRERO
DROGUERIA CASTILLO	UNIDROGAS S.A.S.	CR 7 # 14-12 SAN MARTIN
DROGUERIA DROGAS SALUD	DROSAN LTDA	Calle 7 #29 143 OCAÑA
DROGUERIA FARMASALUD UNIVERSAL	INDEPENDIENTE	CR 8 #16-02 SAN MARTIN
DROGUERIA JUSTY MORENO	DROSAN LTDA	Cl. 12 #10-1, Pelaya, Cesar
DROGUERIA LA NUEVA	UNIDROGAS S.A.S.	CR 14 # 8 A - 25 OCAÑA
DROGUERIA MEGAFARMA OCANA	INDEPENDIENTE	CR.14 # 8-18(B.MERCADO) OCAÑA
DROGUERIA PAGUE MENOS	DROSAN LTDA	CR 6 CL 13 Abrego, Norte de Santander
DROGUERIA PHARMATODO	DROSAN LTDA	Cl 4 # 4-1, San Alberto, Cesar
DROGUERIA RIAÑO	DROSAN LTDA	CR 49 N° 5-06 SANTA CLARA OCAÑA
DROGUERIA SALUD Y BELLEZA AGUACHICA	DROSAN LTDA	CL 5 # 19-43 AGUACHICA
DROGUERIA SAN AGUSTIN	DROSAN LTDA	CL 11 # 16-12 OCAÑA
DROGUERIA SANTA ANA	UNIDROGAS S.A.S.	CR 13 # 10 - 71 OCAÑA
DROGUERIA TOTAL CONFIANZA	DROSAN LTDA	Cl. 12 #10-24 SANTA CLARA OCAÑA
DROGUERIA Y AUTOSERVICIO 20-20	INDEPENDIENTE	CR.13 # 8-47 (B.DULCE NOMBRE) OCAÑA
PROVEEDORA RICHARD	UNIDROGAS S.A.	CL 5#24A-54 AGUACHICA
13695 - DROG. Y PERF. OLIMPICA	COOPIDROGAS	BUCARAMANGA/06 (B.SAN RAFAEL) /CR.14 # 3`;
    
    const lines = rawData.trim().split('\n');
    const uniqueEntries = new Set();
    const processedData = [];
    
    // Procesar cada línea (saltar header)
    lines.slice(1).forEach((line, index) => {
        const parts = line.split('\t').map(part => part.trim());
        
        if (parts.length >= 2) { // Asegurarse de que haya al menos nombre y cadena
            const nombre = parts[0];
            const cadena = parts[1];
            
            // Reconstruir la dirección a partir de la 3ra o 4ta columna, dependiendo del formato
            let direccion = '';
            if (parts.length > 3 && /^\d+$/.test(parts[2])) {
                // Formato: Nombre, Cadena, Número, Dirección...
                direccion = parts.slice(3).join(' ');
            } else if (parts.length > 2) {
                // Formato: Nombre, Cadena, Dirección...
                direccion = parts.slice(2).join(' ');
            }

            // Crear clave única para evitar duplicados
            const uniqueKey = `${nombre.toLowerCase()}-${cadena.toLowerCase()}`;
            
            if (!uniqueEntries.has(uniqueKey) && nombre && cadena && direccion) {
                uniqueEntries.add(uniqueKey);
                processedData.push({
                    nombre: nombre,
                    cadena: cadena,
                    direccion: direccion,
                    visitado: 'Pendiente',
                    transferencia: 'Pendiente'
                });
            }
        }
    });
    
    console.log(`✅ ${processedData.length} farmacias procesadas correctamente`);
    return processedData;
}

// ═══════════════════════════════════════════════════════════════
// 🔧 FUNCIONES DE UI Y UTILIDADES
// ═══════════════════════════════════════════════════════════════

function showLoginInterface(show) {
    if (loginContainer) {
        loginContainer.style.display = show ? 'block' : 'none';
    }
}

function showCRMInterface(show) {
    if (crmContainer) {
        crmContainer.style.display = show ? 'block' : 'none';
    }
}

function showLoading(show) {
    if (loadingIndicator) {
        loadingIndicator.style.display = show ? 'block' : 'none';
    }
}

function showEmptyState(show) {
    if (emptyState) {
        emptyState.style.display = show ? 'block' : 'none';
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

// ═══════════════════════════════════════════════════════════════
// ⚡ FUNCIONES DE UTILIDAD
// ═══════════════════════════════════════════════════════════════

function debounce(func, delay) {
    let timeoutId;
    return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
}

// ═══════════════════════════════════════════════════════════════
// 🎨 ESTILOS ADICIONALES DINÁMICOS
// ═══════════════════════════════════════════════════════════════

const additionalStyles = `
/* Animaciones adicionales */
@keyframes toast-slide-out {
    to {
        opacity: 0;
        transform: translateY(-100%);
    }
}

@keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
}

@keyframes slideInUp {
    from {
        opacity: 0;
        transform: translateY(30px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

/* Estilos para la nueva sección de configuración diaria */
.daily-config-section {
    margin-bottom: 2rem;
}

.daily-config-card {
    background: var(--card-bg);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    padding: 1.5rem;
    box-shadow: var(--shadow-sm);
    transition: all 0.2s ease;
}

.daily-config-card:hover {
    box-shadow: var(--shadow-md);
}

.config-header {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1.5rem;
}

.config-icon {
    font-size: 2rem;
    background: linear-gradient(135deg, var(--primary-color), var(--primary-dark));
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
}

.config-title h3 {
    margin: 0;
    color: var(--text-primary);
    font-size: 1.25rem;
    font-weight: 600;
}

.config-title p {
    margin: 0;
    color: var(--text-secondary);
    font-size: 0.875rem;
}

.config-content {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 2rem;
    align-items: start;
}

.config-inputs {
    display: flex;
    gap: 1.5rem;
    align-items: end;
    flex-wrap: wrap;
}

.input-group.compact {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 140px;
}

.input-group.compact label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-primary);
}

.input-group.compact input {
    padding: 0.75rem 1rem;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    background: var(--input-bg);
    color: var(--text-primary);
    font-size: 0.875rem;
    transition: all 0.2s ease;
}

.input-group.compact input:focus {
    outline: none;
    border-color: var(--primary-color);
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.input-helper {
    font-size: 0.75rem;
    color: var(--text-tertiary);
    margin-top: 0.25rem;
}

.btn-primary.compact {
    padding: 0.75rem 1.5rem;
    font-size: 0.875rem;
    height: fit-content;
    margin-top: 1.5rem;
}

.daily-summary {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    min-width: 200px;
}

.summary-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    background: var(--bg-secondary);
    border-radius: var(--radius-md);
    border: 1px solid var(--border-light);
}

.summary-item.status {
    border-color: var(--primary-color);
    background: rgba(59, 130, 246, 0.05);
}

.summary-label {
    font-size: 0.875rem;
    color: var(--text-secondary);
    font-weight: 500;
}

.summary-value {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--primary-color);
}

.summary-unit {
    font-size: 0.75rem;
    color: var(--text-tertiary);
    margin-left: 0.25rem;
}

.summary-status {
    font-size: 0.875rem;
    font-weight: 600;
    padding: 0.25rem 0.75rem;
    border-radius: var(--radius-full);
}

.summary-status.status-success {
    background: rgba(34, 197, 94, 0.1);
    color: rgb(34, 197, 94);
}

.summary-status.status-progress {
    background: rgba(251, 191, 36, 0.1);
    color: rgb(251, 191, 36);
}

.summary-status.status-behind {
    background: rgba(239, 68, 68, 0.1);
    color: rgb(239, 68, 68);
}

/* Mejoras en métricas */
.metric-extra {
    margin-top: 0.5rem;
    padding-top: 0.5rem;
    border-top: 1px solid var(--border-light);
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.metric-extra-label {
    font-size: 0.75rem;
    color: var(--text-tertiary);
    font-weight: 500;
}

.metric-extra span:last-child {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--primary-color);
}

/* Estilos mejorados */
.cadena-badge {
    background: var(--primary-color);
    color: white;
    padding: 0.25rem 0.75rem;
    border-radius: var(--radius-full);
    font-size: 0.75rem;
    font-weight: 600;
    white-space: nowrap;
}

.address-text {
    max-width: 300px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: help;
}

.status-btn {
    transition: all 0.2s ease;
    border: none !important;
    outline: none !important;
}

.status-btn:focus {
    box-shadow: 0 0 0 2px var(--primary-color) !important;
}

.status-btn:disabled {
    cursor: not-allowed;
    opacity: 0.6;
}

/* Efectos hover mejorados */
.modern-table tbody tr {
    transition: all 0.2s ease;
}

.modern-table tbody tr:hover {
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

/* Loading spinner mejorado */
.loader-spinner {
    border-width: 3px;
    animation-duration: 0.8s;
}

/* Toast mejorados */
.toast {
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255,255,255,0.1);
}

.toast-icon {
    font-size: 1.2rem;
    flex-shrink: 0;
}

.toast-message {
    font-weight: 500;
}

/* Responsive improvements */
@media (max-width: 768px) {
    .config-content {
        grid-template-columns: 1fr;
        gap: 1.5rem;
    }
    
    .config-inputs {
        flex-direction: column;
        align-items: stretch;
    }
    
    .daily-summary {
        min-width: auto;
    }
    
    .summary-item {
        flex-direction: column;
        align-items: stretch;
        text-align: center;
        gap: 0.5rem;
    }
}

@media (max-width: 640px) {
    .cadena-badge {
        font-size: 0.6875rem;
        padding: 0.125rem 0.5rem;
    }
    
    .address-text {
        max-width: 200px;
    }
    
    .status-btn {
        min-width: 70px;
        font-size: 0.6875rem;
        padding: 0.25rem 0.5rem;
    }
    
    .toast {
        min-width: 280px;
        margin: 0 1rem;
    }
    
    .daily-config-card {
        padding: 1rem;
    }
    
    .config-inputs {
        gap: 1rem;
    }
}

/* Accesibilidad mejorada */
@media (prefers-reduced-motion: reduce) {
    * {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
    }
}

/* Focus visible mejorado */
button:focus-visible,
input:focus-visible,
select:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: 2px;
}
`;

// Inyectar estilos adicionales
const styleSheet = document.createElement('style');
styleSheet.textContent = additionalStyles;
document.head.appendChild(styleSheet);

// ═══════════════════════════════════════════════════════════════
// 🚀 INICIALIZACIÓN FINAL
// ═══════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
    console.log('🎉 CRM Farmacias v2.2.0 iniciado correctamente');
    console.log('📱 Dispositivo:', /Mobile|Android|iPhone|iPad/.test(navigator.userAgent) ? 'Móvil' : 'Desktop');
    console.log('📅 Nueva funcionalidad: Control de días laborales activada');
    
    // Inicializar tema
    initializeTheme();
    
    // Mostrar mensaje de bienvenida
    setTimeout(() => {
        if (!auth.currentUser) {
            showToast('¡Bienvenido al CRM de Farmacias! 💊', 'info', 3000);
        }
    }, 1000);
    
    // Detectar si es PWA
    if (window.navigator && window.navigator.standalone) {
        console.log('📱 Ejecutándose como PWA');
    }
});

// Manejo de errores globales
window.addEventListener('error', (event) => {
    console.error('❌ Error global capturado:', event.error);
    showToast('Ocurrió un error inesperado', 'error');
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('❌ Promesa rechazada:', event.reason);
    showToast('Error de conexión o datos', 'error');
    event.preventDefault();
});

// Exportar funciones para debugging (solo en desarrollo)
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    window.CRM_DEBUG = {
        allPharmacies: () => allPharmacies,
        dailyConfig: () => dailyConfig,
        showToast,
        setTheme,
        triggerAuth: () => auth,
        triggerDB: () => db,
        updateMetrics,
        resetAllIndicators,
        normalizeStatus,
        // NUEVA función de debug para métricas
        debugMetrics: () => {
            console.log('=== DEBUG MÉTRICAS ===');
            console.log('Total farmacias:', allPharmacies.length);
            console.log('Configuración diaria:', dailyConfig);
            
            const visitadas = allPharmacies.filter(p => p.visitado === 'Realizado');
            const transferidas = allPharmacies.filter(p => p.transferencia === 'Realizado');
            
            console.log('Visitadas:', visitadas.length, visitadas.map(p => p.nombre));
            console.log('Transferidas:', transferidas.length, transferidas.map(p => p.nombre));
            console.log('Objetivo diario total:', dailyConfig.totalDailyGoal);
            
            // Mostrar primeras 10 con estados
            allPharmacies.slice(0, 10).forEach(p => {
                console.log(`${p.nombre}: V=${p.visitado}, T=${p.transferencia}`);
            });
        },
        // Nueva función para probar configuración diaria
        debugDailyConfig: () => {
            console.log('=== DEBUG CONFIGURACIÓN DIARIA ===');
            console.log('Día laboral actual:', dailyConfig.currentWorkDay);
            console.log('Farmacias por día:', dailyConfig.pharmaciesPerDay);
            console.log('Objetivo total calculado:', dailyConfig.totalDailyGoal);
            console.log('LocalStorage:', localStorage.getItem('crm-daily-config'));
        }
    };
    console.log('🔧 Modo debug activado. Usa window.CRM_DEBUG para inspeccionar.');
    console.log('💡 Ejecuta CRM_DEBUG.debugMetrics() para ver estado de métricas');
    console.log('📅 Ejecuta CRM_DEBUG.debugDailyConfig() para ver configuración diaria');
}

console.log('✅ JavaScript del CRM cargado completamente con todas las funcionalidades');
console.log('🐛 Nuevas funcionalidades v2.2.0:');
console.log('  - ✅ Control de días laborales con persistencia');
console.log('  - ✅ Cálculo automático de objetivos diarios');
console.log('  - ✅ Métricas actualizadas con objetivos diarios');
console.log('  - ✅ Estado visual del progreso diario');
console.log('  - ✅ Validaciones y controles de entrada');
console.log('  - ✅ Integración completa con sistema existente');
