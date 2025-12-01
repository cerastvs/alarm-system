/**
 * EWMS - Employee Wellbeing Monitoring System
 * Core Logic
 */

// --- Configuration ---
const CONFIG = {
    WORK_DURATION_MS: 2 * 60 * 60 * 1000, // 2 Hours
    // WORK_DURATION_MS: 5 * 1000, // DEBUG: 5 Seconds for testing
    BREAK_DURATION_DEFAULT_MS: 10 * 60 * 1000, // 10 Minutes
};

// --- State Management ---
const state = {
    currentView: 'login-view',
    timerInterval: null,
    remainingTime: 0,
    isWorkSession: false,
    currentActivity: null,
    currentUser: { name: '', dept: '' },
    logs: JSON.parse(localStorage.getItem('ewms_logs')) || [],
};

// --- DOM Elements ---
const views = {
    login: document.getElementById('login-view'),
    dashboard: document.getElementById('dashboard-view'),
    modal: document.getElementById('break-modal'),
    activity: document.getElementById('activity-view'),
    breakTimer: document.getElementById('break-timer-view'),
    compliance: document.getElementById('compliance-view'),
    admin: document.getElementById('admin-view'),
};

const elements = {
    workTimerDisplay: document.getElementById('work-timer'),
    breakTimerDisplay: document.getElementById('break-timer'),
    activityNameDisplay: document.getElementById('current-activity-name'),
    logsList: document.getElementById('activity-logs-list'),
    totalBreaksStat: document.getElementById('total-breaks-stat'),
    complianceRateStat: document.getElementById('compliance-rate-stat'),
    userDisplay: document.getElementById('user-display'),
    loginForm: document.getElementById('login-form'),
    nameInput: document.getElementById('employee-name'),
    deptInput: document.getElementById('employee-dept'),
    proofInput: document.getElementById('break-proof'),
    feedbackInput: document.getElementById('break-feedback'),
    startWorkBtn: document.getElementById('start-work-btn'),
    logoutBtn: document.getElementById('logout-btn'),
    timerStatus: document.getElementById('timer-status'),
    debugBreakBtn: document.getElementById('debug-break-btn'),
};

// ... (AlarmService, NotificationService, ViewManager remain the same) ...

// --- Audio Service (Alarm) ---
const AlarmService = {
    audioContext: null,
    oscillator: null,

    init() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
    },

    playAlarm() {
        this.init();
        const ctx = this.audioContext;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, ctx.currentTime); // A4
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.1); // Sweep up

        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start();
        osc.stop(ctx.currentTime + 0.5);

        // Loop for a few beeps
        let count = 0;
        const interval = setInterval(() => {
            count++;
            if (count > 5) {
                clearInterval(interval);
                return;
            }
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.type = 'sine';
            o.frequency.setValueAtTime(440, ctx.currentTime);
            o.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.1);
            g.gain.setValueAtTime(0.1, ctx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
            o.connect(g);
            g.connect(ctx.destination);
            o.start();
            o.stop(ctx.currentTime + 0.5);
        }, 800);
    }
};

// --- Notification Service ---
const NotificationService = {
    requestPermission() {
        if ('Notification' in window) {
            Notification.requestPermission();
        }
    },

    show(title, body) {
        // 1. Browser Notification
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(title, { body, icon: 'favicon.ico' }); // Icon is optional
        }

        // 2. In-App Toast
        this.showToast(title, body);
    },

    showToast(title, body) {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerHTML = `
            <div class="toast-icon">🔔</div>
            <div class="toast-content">
                <h4>${title}</h4>
                <p>${body}</p>
            </div>
        `;
        container.appendChild(toast);

        // Remove after 5 seconds (matches CSS animation)
        setTimeout(() => {
            toast.remove();
        }, 5000);
    }
};

// --- View Manager ---
function switchView(viewId) {
    // Hide all views
    Object.values(views).forEach(el => {
        if (el && !el.classList.contains('modal')) { // Don't hide modal via this loop if it's separate
             el.classList.remove('active');
             el.classList.add('hidden');
        }
    });

    // Handle Modal separately
    if (viewId === 'break-modal') {
        views.modal.classList.remove('hidden');
        return;
    } else {
        views.modal.classList.add('hidden');
    }

    // Show target view
    const target = document.getElementById(viewId);
    if (target) {
        target.classList.remove('hidden');
        // Small delay to allow display:block to apply before opacity transition
        setTimeout(() => {
            target.classList.add('active');
        }, 10);
    }
    state.currentView = viewId;
}

// --- Timer Logic ---
function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function startWorkTimer() {
    state.isWorkSession = true;
    state.remainingTime = CONFIG.WORK_DURATION_MS;
    updateTimerDisplay(elements.workTimerDisplay);
    
    // UI Updates
    elements.startWorkBtn.style.display = 'none';
    elements.debugBreakBtn.style.display = 'block';
    elements.timerStatus.textContent = "Time until next wellness break";

    if (state.timerInterval) clearInterval(state.timerInterval);

    state.timerInterval = setInterval(() => {
        state.remainingTime -= 1000;
        updateTimerDisplay(elements.workTimerDisplay);

        if (state.remainingTime <= 0) {
            clearInterval(state.timerInterval);
            triggerBreak();
        }
    }, 1000);
}

function resetWorkDashboard() {
    if (state.timerInterval) clearInterval(state.timerInterval);
    state.isWorkSession = false;
    state.remainingTime = CONFIG.WORK_DURATION_MS;
    updateTimerDisplay(elements.workTimerDisplay);
    
    // UI Updates
    elements.startWorkBtn.style.display = 'block';
    elements.debugBreakBtn.style.display = 'none';
    elements.timerStatus.textContent = "Ready to start?";
}

function startBreakTimer(durationMs) {
    state.isWorkSession = false;
    state.remainingTime = durationMs;
    updateTimerDisplay(elements.breakTimerDisplay);

    if (state.timerInterval) clearInterval(state.timerInterval);

    state.timerInterval = setInterval(() => {
        state.remainingTime -= 1000;
        updateTimerDisplay(elements.breakTimerDisplay);

        if (state.remainingTime <= 0) {
            clearInterval(state.timerInterval);
            finishBreak();
        }
    }, 1000);
}

function updateTimerDisplay(element) {
    if (element) {
        element.textContent = formatTime(state.remainingTime);
    }
}

function triggerBreak() {
    AlarmService.playAlarm();
    NotificationService.show("Time for a Break!", "You've been working for 2 hours. It's time to recharge.");
    switchView('break-modal');
}

function finishBreak() {
    switchView('compliance-view');
}

// --- Event Handlers ---

// Login
elements.loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = elements.nameInput.value.trim();
    const dept = elements.deptInput.value.trim();

    if (name) {
        state.currentUser = { name, dept };
        elements.userDisplay.textContent = `Logged in as ${name}${dept ? ' (' + dept + ')' : ''}`;
        
        // Initialize Audio Context on user gesture
        AlarmService.init();
        // Request Notification Permission
        NotificationService.requestPermission();
        
        switchView('dashboard-view');
        resetWorkDashboard(); // Ensure dashboard is in "Ready" state
    }
});

// Start Work
elements.startWorkBtn.addEventListener('click', () => {
    startWorkTimer();
});

// Logout
elements.logoutBtn.addEventListener('click', () => {
    if (state.timerInterval) clearInterval(state.timerInterval);
    state.currentUser = { name: '', dept: '' };
    elements.nameInput.value = '';
    elements.deptInput.value = '';
    switchView('login-view');
});

// Debug: Trigger Break Immediately
document.getElementById('debug-break-btn').addEventListener('click', () => {
    if (state.timerInterval) clearInterval(state.timerInterval);
    triggerBreak();
});

// Modal: Start Break
document.getElementById('start-break-btn').addEventListener('click', () => {
    switchView('activity-view');
});

// Activity Selection
document.querySelectorAll('.activity-card').forEach(card => {
    card.addEventListener('click', () => {
        const activity = card.dataset.activity;
        const name = card.querySelector('h3').textContent;
        state.currentActivity = name;
        elements.activityNameDisplay.textContent = name;
        
        let duration = CONFIG.BREAK_DURATION_DEFAULT_MS;
        if (activity === 'Air Quality Check') duration = 5 * 60 * 1000;
        if (activity === 'Walking' || activity === 'Socializing' || activity === 'Quick Nap') duration = 15 * 60 * 1000;

        switchView('break-timer-view');
        startBreakTimer(duration);
    });
});

// Finish Break Early
document.getElementById('finish-break-early-btn').addEventListener('click', () => {
    clearInterval(state.timerInterval);
    finishBreak();
});

// Compliance Form
document.getElementById('compliance-form').addEventListener('submit', (e) => {
    e.preventDefault();
    
    const file = elements.proofInput.files[0];
    const feedback = elements.feedbackInput.value.trim();
    
    if (file) {
        const reader = new FileReader();
        reader.onload = function(event) {
            const base64String = event.target.result;
            saveLog(file.name, base64String, feedback);
        };
        reader.readAsDataURL(file);
    } else {
        saveLog('No file', null, feedback);
    }
});

function saveLog(fileName, fileData, feedback) {
    // Log Data
    const log = {
        date: new Date().toISOString(),
        user: state.currentUser,
        activity: state.currentActivity,
        proof: fileName,
        proofData: fileData, // Store Base64 string
        feedback: feedback || 'No feedback',
        completed: true
    };
    
    try {
        state.logs.push(log);
        localStorage.setItem('ewms_logs', JSON.stringify(state.logs));
    } catch (err) {
        alert("Storage full! Could not save proof image. (LocalStorage limit reached)");
        // Fallback: save without image data
        log.proofData = null;
        log.proof = fileName + " (Storage Full)";
        state.logs.pop(); // Remove failed attempt
        state.logs.push(log);
        localStorage.setItem('ewms_logs', JSON.stringify(state.logs));
    }

    // Reset Form
    elements.proofInput.value = '';
    elements.feedbackInput.value = '';

    // Return to Work
    switchView('dashboard-view');
    startWorkTimer();
}

// Admin
document.getElementById('admin-toggle').addEventListener('click', () => {
    renderAdminStats();
    switchView('admin-view');
});

document.getElementById('close-admin-btn').addEventListener('click', () => {
    switchView(state.isWorkSession ? 'dashboard-view' : 'login-view');
});

function renderAdminStats() {
    elements.totalBreaksStat.textContent = state.logs.length;
    elements.logsList.innerHTML = state.logs.map(log => `
        <li style="flex-direction: column; gap: 0.5rem; align-items: flex-start;">
            <div style="display: flex; justify-content: space-between; width: 100%;">
                <span style="font-weight: bold; color: var(--primary-color)">${log.user.name} <small style="color: #94a3b8">(${log.user.dept || 'N/A'})</small></span>
                <span>${new Date(log.date).toLocaleString()}</span>
            </div>
            <div style="display: flex; justify-content: space-between; width: 100%; align-items: flex-start;">
                <div style="display: flex; flex-direction: column; gap: 0.2rem;">
                    <span>Activity: ${log.activity}</span>
                    <span style="font-size: 0.9rem; color: #cbd5e1; font-style: italic;">"${log.feedback}"</span>
                </div>
                <div style="text-align: right;">
                    <span style="color: #94a3b8; display: block;">Proof: ${log.proof}</span>
                    ${log.proofData ? `<img src="${log.proofData}" alt="Proof" style="max-width: 100px; max-height: 100px; border-radius: 4px; margin-top: 5px; border: 1px solid var(--glass-border);">` : ''}
                </div>
            </div>
        </li>
    `).join('');
}

// --- Init ---
// Start at Login
switchView('login-view');
