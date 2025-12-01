
const CONFIG = {
    WORK_DURATION_MS: 2 * 60 * 60 * 1000, 
    BREAK_DURATION_DEFAULT_MS: 10 * 60 * 1000,
};

const MOCK_USERS = [
    { username: 'admin', password: '123', name: 'Admin User', dept: 'IT', role: 'admin' },
    { username: 'user1', password: '123', name: 'John Doe', dept: 'Sales', role: 'user' },
    { username: 'user2', password: '123', name: 'Jon Snow', dept: 'Human Resource', role: 'user' }
];

const state = {
    currentView: 'login-view',
    timerInterval: null,
    remainingTime: 0,
    isWorkSession: false,
    isPaused: false, 
    workTimerStatus: 'Ready', 
    currentActivity: null,
    currentUser: null, 
    logs: JSON.parse(localStorage.getItem('ewms_logs')) || [],
    workStartTime: null, 
    breakStartTime: null, 
};

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
    totalSkipsStat: document.getElementById('total-skips-stat'),
    complianceRateStat: document.getElementById('compliance-rate-stat'),
    userDisplay: document.getElementById('user-display'),
    loginForm: document.getElementById('login-form'),
    usernameInput: document.getElementById('username'),
    passwordInput: document.getElementById('password'),
    proofInput: document.getElementById('break-proof'),
    feedbackInput: document.getElementById('break-feedback'),
    startWorkBtn: document.getElementById('start-work-btn'),
    pauseBtn: document.getElementById('pause-btn'), // New
    resumeBtn: document.getElementById('resume-btn'), // New
    logoutBtn: document.getElementById('logout-btn'),
    viewLogsBtn: document.getElementById('view-logs-btn'),
    closeAdminBtn: document.getElementById('close-admin-btn'),
    timerStatus: document.getElementById('timer-status'),
    debugBreakBtn: document.getElementById('debug-break-btn'),
    skipBreakBtn: document.getElementById('skip-break-btn'),
};

function updateDashboardForRole() {
    elements.viewLogsBtn.style.display = 'block';
}


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
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.1); 

        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start();
        osc.stop(ctx.currentTime + 0.5);

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

const NotificationService = {
    requestPermission() {
        if ('Notification' in window) {
            Notification.requestPermission();
        }
    },

    show(title, body) {
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(title, { body, icon: 'favicon.ico' }); 
        }

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

        setTimeout(() => {
            toast.remove();
        }, 5000);
    }
};

function switchView(viewId) {
    Object.values(views).forEach(el => {
        if (el && !el.classList.contains('modal')) { 
            el.classList.remove('active');
            el.classList.add('hidden');
        }
    });

    if (viewId === 'break-modal') {
        views.modal.classList.remove('hidden');
        return;
    } else {
        views.modal.classList.add('hidden');
    }

    const target = document.getElementById(viewId);
    if (target) {
        target.classList.remove('hidden');
        setTimeout(() => {
            target.classList.add('active');
        }, 10);
    }
    state.currentView = viewId;
}

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
    state.isPaused = false;
    state.remainingTime = CONFIG.WORK_DURATION_MS;
    state.workStartTime = new Date();
    updateTimerDisplay(elements.workTimerDisplay);
    elements.workTimerDisplay.classList.add('active-timer'); 

    elements.startWorkBtn.style.display = 'none';
    elements.pauseBtn.style.display = 'block';
    elements.resumeBtn.style.display = 'none';
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

function pauseWorkTimer() {
    if (state.timerInterval) clearInterval(state.timerInterval);
    state.isPaused = true;
    elements.workTimerDisplay.classList.remove('active-timer'); 

    elements.pauseBtn.style.display = 'none';
    elements.resumeBtn.style.display = 'block';
    elements.timerStatus.textContent = "Timer paused";
}

function resumeWorkTimer() {
    state.isPaused = false;
    elements.workTimerDisplay.classList.add('active-timer'); 

    elements.pauseBtn.style.display = 'block';
    elements.resumeBtn.style.display = 'none';
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
    state.isPaused = false;
    state.remainingTime = CONFIG.WORK_DURATION_MS;
    updateTimerDisplay(elements.workTimerDisplay);
    elements.workTimerDisplay.classList.remove('active-timer');

    elements.startWorkBtn.style.display = 'block';
    elements.pauseBtn.style.display = 'none';
    elements.resumeBtn.style.display = 'none';
    elements.debugBreakBtn.style.display = 'none';
    elements.timerStatus.textContent = "Ready to start?";
}

function startBreakTimer(durationMs) {
    state.isWorkSession = false;
    state.remainingTime = durationMs;
    state.breakStartTime = new Date(); 
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
    AlarmService.playAlarm();
    NotificationService.show("Break Complete!", "Time to get back to work. You're refreshed and ready!");
    switchView('compliance-view');
}


elements.loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const username = elements.usernameInput.value.trim();
    const password = elements.passwordInput.value.trim();

    const user = MOCK_USERS.find(u => u.username === username && u.password === password);

    if (user) {
        state.currentUser = user;

        elements.userDisplay.textContent = user.name;
        document.querySelector('.user-role-label').textContent = user.role;

        const initials = user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        document.getElementById('user-avatar').textContent = initials;

        AlarmService.init();
        NotificationService.requestPermission();

        if (user.role === 'admin') {
            renderActivityLogs();
            switchView('admin-view');
        } else {
            switchView('dashboard-view');
            resetWorkDashboard(); 
            updateDashboardForRole();
        }
    } else {
        alert('Invalid credentials');
    }
});

elements.startWorkBtn.addEventListener('click', () => {
    startWorkTimer();
});

elements.pauseBtn.addEventListener('click', () => {
    pauseWorkTimer();
});

elements.resumeBtn.addEventListener('click', () => {
    resumeWorkTimer();
});

elements.logoutBtn.addEventListener('click', () => {
    if (state.timerInterval) clearInterval(state.timerInterval);
    state.currentUser = { name: '', dept: '' };
    elements.usernameInput.value = '';
    elements.passwordInput.value = '';
    switchView('login-view');
});

document.getElementById('debug-break-btn').addEventListener('click', () => {
    if (state.timerInterval) clearInterval(state.timerInterval);
    triggerBreak();
});

document.getElementById('start-break-btn').addEventListener('click', () => {
    switchView('activity-view');
});

elements.skipBreakBtn.addEventListener('click', () => {
    skipBreak();
});

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

document.getElementById('finish-break-early-btn').addEventListener('click', () => {
    clearInterval(state.timerInterval);
    finishBreak();
});

document.getElementById('compliance-form').addEventListener('submit', (e) => {
    e.preventDefault();

    const file = elements.proofInput.files[0];
    const feedback = elements.feedbackInput.value.trim();

    if (file) {
        const reader = new FileReader();
        reader.onload = function (event) {
            const base64String = event.target.result;
            saveLog(file.name, base64String, feedback);
        };
        reader.readAsDataURL(file);
    } else {
        saveLog('No file', null, feedback);
    }
});

function saveLog(fileName, fileData, feedback) {
    const breakEndTime = new Date();
    const workDurationMs = state.workStartTime ? (new Date() - state.workStartTime) : CONFIG.WORK_DURATION_MS;
    const breakDurationMs = state.breakStartTime ? (breakEndTime - state.breakStartTime) : 0;

    const log = {
        date: new Date().toISOString(),
        user: state.currentUser,
        activity: state.currentActivity,
        proof: fileName,
        proofData: fileData, 
        feedback: feedback || 'No feedback',
        completed: true,
        skipped: false,
        workDuration: formatTime(workDurationMs),
        breakDuration: formatTime(breakDurationMs),
        workDurationMs: workDurationMs,
        breakDurationMs: breakDurationMs 
    };

    try {
        state.logs.push(log);
        localStorage.setItem('ewms_logs', JSON.stringify(state.logs));
    } catch (err) {
        alert("Storage full! Could not save proof image. (LocalStorage limit reached)");
        log.proofData = null;
        log.proof = fileName + " (Storage Full)";
        state.logs.pop(); 
        state.logs.push(log);
        localStorage.setItem('ewms_logs', JSON.stringify(state.logs));
    }

    elements.proofInput.value = '';
    elements.feedbackInput.value = '';

    switchView('dashboard-view');
    resetWorkDashboard();
}

function skipBreak() {
    const workDurationMs = state.workStartTime ? (new Date() - state.workStartTime) : CONFIG.WORK_DURATION_MS;

    const log = {
        date: new Date().toISOString(),
        user: state.currentUser,
        activity: 'Skipped',
        proof: 'N/A',
        proofData: null,
        feedback: 'Break was skipped',
        completed: false,
        skipped: true,
        workDuration: formatTime(workDurationMs),
        breakDuration: '00:00',
        workDurationMs: workDurationMs,
        breakDurationMs: 0
    };

    state.logs.push(log);
    localStorage.setItem('ewms_logs', JSON.stringify(state.logs));

    switchView('dashboard-view');
    resetWorkDashboard();
}

function calculateComplianceRate(logs) {
    if (logs.length === 0) return 100;

    const completedBreaks = logs.filter(log => log.completed === true).length;
    const totalBreaks = logs.length;

    return Math.round((completedBreaks / totalBreaks) * 100);
}

elements.viewLogsBtn.addEventListener('click', () => {
    renderActivityLogs();
    switchView('admin-view');
});

elements.closeAdminBtn.addEventListener('click', () => {
    if (state.currentUser && state.currentUser.role === 'admin') {
        state.currentUser = null;
        elements.usernameInput.value = '';
        elements.passwordInput.value = '';
        switchView('login-view');
    } else {
        switchView(state.isWorkSession ? 'dashboard-view' : 'login-view');
        if (state.currentUser) {
            switchView('dashboard-view');
        } else {
            switchView('login-view');
        }
    }
});

function renderActivityLogs() {
    let logsToShow = state.logs;

    if (state.currentUser.role !== 'admin') {
        logsToShow = state.logs.filter(log => log.user.username === state.currentUser.username);
        elements.closeAdminBtn.textContent = "Close";
    } else {
        elements.closeAdminBtn.textContent = "Log Out";
    }

    elements.totalBreaksStat.textContent = logsToShow.length;
    elements.totalSkipsStat.textContent = logsToShow.filter(log => log.skipped === true).length;
    elements.complianceRateStat.textContent = calculateComplianceRate(logsToShow) + '%';
    elements.logsList.innerHTML = logsToShow.map((log, index) => `
        <li class="activity-log-item" data-log-index="${index}" style="flex-direction: column; gap: 0.5rem; align-items: flex-start; cursor: pointer; transition: background 0.2s;">
            <div style="display: flex; justify-content: space-between; width: 100%;">
                <span style="font-weight: bold; color: var(--primary-color)">${log.user.name} <small style="color: #94a3b8">(${log.user.dept || 'N/A'})</small></span>
                <span>${new Date(log.date).toLocaleString()}</span>
            </div>
            <div style="display: flex; justify-content: space-between; width: 100%; align-items: flex-start;">
                <div style="display: flex; flex-direction: column; gap: 0.2rem;">
                    <span>Activity: ${log.activity} ${log.skipped ? '<span style="color: #ef4444; font-weight: bold;">(SKIPPED)</span>' : ''}</span>
                    <span style="font-size: 0.9rem; color: #cbd5e1; font-style: italic;">"${log.feedback}"</span>
                    ${log.workDuration ? `<span style="font-size: 0.85rem; color: #10b981;">⏱️ Work: ${log.workDuration}</span>` : ''}
                    ${log.breakDuration && !log.skipped ? `<span style="font-size: 0.85rem; color: #f59e0b;">☕ Break: ${log.breakDuration}</span>` : ''}
                </div>
                <div style="text-align: right;">
                    <span style="color: #94a3b8; display: block;">Proof: ${log.proof}</span>
                    ${log.proofData ? `<img src="${log.proofData}" alt="Proof" style="max-width: 100px; max-height: 100px; border-radius: 4px; margin-top: 5px; border: 1px solid var(--glass-border);">` : ''}
                </div>
            </div>
        </li>
    `).join('');

    document.querySelectorAll('.activity-log-item').forEach(item => {
        item.addEventListener('click', () => {
            const logIndex = parseInt(item.dataset.logIndex);
            showActivityDetail(logsToShow[logIndex]);
        });

        item.addEventListener('mouseenter', () => {
            item.style.background = 'rgba(255, 255, 255, 0.05)';
        });

        item.addEventListener('mouseleave', () => {
            item.style.background = '';
        });
    });
}

function showActivityDetail(log) {
    const detailBody = document.getElementById('activity-detail-body');
    const statusBadge = log.skipped ? '<span class="status-badge skipped">SKIPPED</span>' : '<span class="status-badge completed">COMPLETED</span>';

    detailBody.innerHTML = `
        <div class="detail-container">
            <div class="detail-header">
                <h2>${log.activity}</h2>
                <p>${new Date(log.date).toLocaleString()}</p>
                ${statusBadge}
            </div>
            
            <div class="detail-grid">
                <div class="detail-card">
                    <h4>Employee</h4>
                    <p class="detail-value">${log.user.name}</p>
                    <p class="detail-sub">${log.user.dept || 'N/A'}</p>
                </div>
                
                <div class="detail-card">
                    <h4>Role</h4>
                    <p class="detail-value" style="text-transform: capitalize;">${log.user.role}</p>
                </div>
            </div>
            
            ${!log.skipped ? `
            <div class="detail-grid">
                <div class="detail-card work-card">
                    <h4>⏱️ Work Duration</h4>
                    <p class="detail-value">${log.workDuration || 'N/A'}</p>
                </div>
                
                <div class="detail-card break-card">
                    <h4>☕ Break Duration</h4>
                    <p class="detail-value">${log.breakDuration || 'N/A'}</p>
                </div>
            </div>
            ` : ''}
            
            <div class="detail-card">
                <h4>Feedback</h4>
                <p class="detail-feedback">"${log.feedback}"</p>
            </div>
            
            <div class="detail-card">
                <h4>Proof of Activity</h4>
                <p class="detail-sub" style="margin-bottom: 0.5rem;">${log.proof}</p>
                ${log.proofData ? `<img src="${log.proofData}" alt="Proof" class="detail-image">` : '<p class="no-image">No image attached</p>'}
            </div>
        </div>
    `;

    document.getElementById('activity-detail-modal').classList.remove('hidden');
}

document.addEventListener('DOMContentLoaded', () => {
    const closeDetailBtn = document.getElementById('close-detail-modal');
    const detailModal = document.getElementById('activity-detail-modal');

    if (closeDetailBtn) {
        closeDetailBtn.addEventListener('click', () => {
            detailModal.classList.add('hidden');
        });
    }

    if (detailModal) {
        detailModal.addEventListener('click', (e) => {
            if (e.target === detailModal) {
                detailModal.classList.add('hidden');
            }
        });
    }
});

switchView('login-view');
