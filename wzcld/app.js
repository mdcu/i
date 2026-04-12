import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

// Initialize Supabase
const supabase = (typeof window.supabase !== 'undefined') 
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

// --- Utilities ---
const generateHex = (length) => {
    return Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join('');
};

const getResponderId = (accessId) => {
    const key = `cloudwave_responder_${accessId}`;
    let rid = localStorage.getItem(key);
    if (!rid) {
        rid = generateHex(12);
        localStorage.setItem(key, rid);
    }
    return rid;
};

// --- App State ---
let state = {
    accessId: null,
    responderId: null,
    session: null,
    responses: [],
    loading: true
};

// --- DOM Elements ---
const el = {
    app: document.getElementById('app'),
    mainHeader: document.getElementById('main-header'),
    cloudContainer: document.getElementById('cloud-container'),
    inputSection: document.getElementById('input-section'),
    loginScreen: document.getElementById('login-screen'),
    hostScreen: document.getElementById('host-screen'),
    detonatorModal: document.getElementById('detonator-modal'),
    successModal: document.getElementById('success-modal'),
    loadingOverlay: document.getElementById('loading-overlay'),
    
    questionDisplay: document.getElementById('session-question'),
    wordCloud: document.getElementById('word-cloud'),
    wordInput: document.getElementById('word-input'),
    submitBtn: document.getElementById('submit-btn'),
    statsBadge: document.getElementById('stats-badge'),
    allowanceMsg: document.getElementById('allowance-msg'),
    
    accessIdInput: document.getElementById('access-id-input'),
    joinBtn: document.getElementById('join-btn'),
    showHostLink: document.getElementById('show-host-modal'),
    closeHostBtn: document.getElementById('close-host'),
    
    hostQuestion: document.getElementById('host-question'),
    hostAllowance: document.getElementById('host-allowance'),
    createSessionBtn: document.getElementById('create-session-btn'),
    
    newIdDisplay: document.getElementById('new-id-display'),
    newDetonatorDisplay: document.getElementById('new-detonator-display'),
    startViewingBtn: document.getElementById('start-viewing-btn'),
    
    detonatorBtn: document.getElementById('detonator-btn'),
    detonatorCodeInput: document.getElementById('detonator-code-input'),
    confirmDetonation: document.getElementById('confirm-detonation'),
    cancelDetonation: document.getElementById('cancel-detonation')
};

// --- Core Functions ---

async function init() {
    const urlParams = new URLSearchParams(window.location.search);
    const idFromUrl = urlParams.get('accessid')?.toLowerCase();

    if (idFromUrl) {
        await joinSession(idFromUrl);
    } else {
        showScreen('login');
        hideLoading();
    }
}

async function joinSession(id) {
    showLoading();
    try {
        const { data: session, error } = await supabase
            .from('sessions')
            .select('*')
            .eq('access_id', id)
            .eq('status', 'active')
            .single();

        if (error || !session) {
            alert('Invalid or Obsolete Access ID');
            showScreen('login');
            hideLoading();
            return;
        }

        state.accessId = id;
        state.session = session;
        state.responderId = getResponderId(id);
        
        // Update URL without reload if needed
        const url = new URL(window.location);
        url.searchParams.set('accessid', id);
        window.history.pushState({}, '', url);

        await fetchResponses();
        setupRealtime();
        
        renderApp();
        showScreen('app');
    } catch (err) {
        console.error(err);
        alert('Error joining session');
    } finally {
        hideLoading();
    }
}

async function fetchResponses() {
    const { data, error } = await supabase
        .from('responses')
        .select('*')
        .eq('session_id', state.accessId);
    
    if (!error) {
        state.responses = data;
    }
}

function setupRealtime() {
    // Listen for responses
    supabase.channel('responses-channel')
        .on('postgres_changes', { 
            event: '*', 
            schema: 'public', 
            table: 'responses',
            filter: `session_id=eq.${state.accessId}`
        }, payload => {
            if (payload.eventType === 'INSERT') {
                state.responses.push(payload.new);
            } else if (payload.eventType === 'DELETE') {
                state.responses = state.responses.filter(r => r.id !== payload.old.id);
            }
            renderWordCloud();
        })
        .subscribe();

    // Listen for session resets/obsoletion
    supabase.channel('sessions-channel')
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'sessions',
            filter: `access_id=eq.${state.accessId}`
        }, payload => {
            if (payload.new.status === 'obsolete') {
                alert('This session has been closed by the host.');
                window.location.href = window.location.pathname;
            } else {
                // Check if it was a reset (we can't easily detect "responses cleared" via session table, 
                // but the response realtime handler will cover the deletions anyway).
            }
        })
        .subscribe();
}

// --- Hosting ---

async function hostNewSession() {
    const question = el.hostQuestion.value.trim();
    const allowance = parseInt(el.hostAllowance.value) || 0;
    
    if (!question) return alert('Please enter a question');
    
    showLoading();
    
    let accessId = '';
    let isUnique = false;
    
    // Check for collisions (retry up to 5 times)
    for(let i=0; i<5; i++) {
        const testId = generateHex(4);
        const { data } = await supabase.from('sessions').select('access_id').eq('access_id', testId);
        if (data.length === 0) {
            accessId = testId;
            isUnique = true;
            break;
        }
    }
    
    if (!isUnique) {
        alert('Failed to generate a unique ID. Try again.');
        hideLoading();
        return;
    }
    
    const detonatorCode = generateHex(4);
    
    const { error } = await supabase.from('sessions').insert({
        access_id: accessId,
        question: question,
        allowance: allowance,
        detonator_code: detonatorCode,
        status: 'active'
    });
    
    if (error) {
        alert('Error creating session: ' + error.message);
        hideLoading();
    } else {
        el.newIdDisplay.innerText = accessId;
        el.newDetonatorDisplay.innerText = detonatorCode;
        showScreen('success');
        hideLoading();
    }
}

// --- Detonation ---

async function detonate() {
    const code = el.detonatorCodeInput.value.trim();
    if (code !== state.session.detonator_code) {
        alert('Incorrect Detonation Code');
        return;
    }
    
    if (!confirm('Are you sure? This will WIPED all current data.')) return;
    
    showLoading();
    
    const action = confirm('Click OK to RESET (polling restart) or CANCEL to CLOSE (obsolete ID)') ? 'reset' : 'obsolete';
    
    if (action === 'reset') {
        // Delete all responses
        const { error } = await supabase
            .from('responses')
            .delete()
            .eq('session_id', state.accessId);
            
        if (error) alert('Error resetting: ' + error.message);
    } else {
        // Obsolete session
        const { error } = await supabase
            .from('sessions')
            .update({ status: 'obsolete' })
            .eq('access_id', state.accessId);
            
        if (error) alert('Error obsoleting: ' + error.message);
        else window.location.href = window.location.pathname;
    }
    
    el.detonatorModal.classList.add('hidden');
    el.detonatorCodeInput.value = '';
    hideLoading();
}

// --- Interactions ---

async function submitWord() {
    const word = el.wordInput.value.trim();
    if (!word) return;
    
    if (!canRespondMore()) {
        alert('Allowance reached!');
        return;
    }
    
    el.submitBtn.disabled = true;
    
    const { error } = await supabase.from('responses').insert({
        session_id: state.accessId,
        word: word,
        responder_id: state.responderId
    });
    
    if (error) {
        alert('Error: ' + error.message);
    } else {
        el.wordInput.value = '';
    }
    el.submitBtn.disabled = false;
}

async function toggleEngagement(word) {
    const myResponse = state.responses.find(r => r.word === word && r.responder_id === state.responderId);
    
    if (myResponse) {
        // Cancel
        await supabase.from('responses').delete().eq('id', myResponse.id);
    } else {
        // Engage
        if (!canRespondMore()) {
            alert('Allowance reached!');
            return;
        }
        await supabase.from('responses').insert({
            session_id: state.accessId,
            word: word,
            responder_id: state.responderId
        });
    }
}

function canRespondMore() {
    if (state.session.allowance === 0) return true;
    const myCount = state.responses.filter(r => r.responder_id === state.responderId).length;
    return myCount < state.session.allowance;
}

// --- UI Rendering ---

function renderApp() {
    el.questionDisplay.innerText = state.session.question;
    renderWordCloud();
    updateStats();
}

function renderWordCloud() {
    const counts = {};
    const myWords = new Set();
    
    state.responses.forEach(r => {
        counts[r.word] = (counts[r.word] || 0) + 1;
        if (r.responder_id === state.responderId) myWords.add(r.word);
    });
    
    const sortedWords = Object.keys(counts).sort((a,b) => counts[b] - counts[a]);
    const maxCount = sortedWords.length > 0 ? counts[sortedWords[0]] : 1;
    
    el.wordCloud.innerHTML = '';
    
    sortedWords.forEach(word => {
        const count = counts[word];
        const isMyWord = myWords.has(word);
        
        const item = document.createElement('div');
        item.className = `word-item ${isMyWord ? 'engaged' : ''}`;
        
        // Dynamic font size logic: base (1rem) + relative growth (up to 3rem additional)
        const size = 1 + (count / maxCount) * 3;
        item.style.fontSize = `${size}rem`;
        item.style.opacity = 0.5 + (count / maxCount) * 0.5;
        
        item.innerHTML = `
            ${word}
            ${isMyWord ? '<span class="checkmark">✓</span>' : ''}
        `;
        
        item.onclick = () => toggleEngagement(word);
        el.wordCloud.appendChild(item);
    });
    
    updateStats();
}

function updateStats() {
    const myCount = state.responses.filter(r => r.responder_id === state.responderId).length;
    const allowance = state.session.allowance;
    
    el.statsBadge.innerText = allowance === 0 ? `Total: ${myCount}` : `${myCount} / ${allowance}`;
    el.allowanceMsg.innerText = allowance === 0 ? 'Unrestricted allowance' : `You have ${allowance - myCount} responses left.`;
    
    el.submitBtn.disabled = (allowance !== 0 && myCount >= allowance);
}

// --- Navigation ---

function showScreen(screen) {
    el.loginScreen.classList.add('hidden');
    el.hostScreen.classList.add('hidden');
    el.successModal.classList.add('hidden');
    el.mainHeader.classList.add('hidden');
    el.cloudContainer.classList.add('hidden');
    el.inputSection.classList.add('hidden');
    
    if (screen === 'login') el.loginScreen.classList.remove('hidden');
    if (screen === 'host') el.hostScreen.classList.remove('hidden');
    if (screen === 'success') el.successModal.classList.remove('hidden');
    if (screen === 'app') {
        el.mainHeader.classList.remove('hidden');
        el.cloudContainer.classList.remove('hidden');
        el.inputSection.classList.remove('hidden');
    }
}

function showLoading() { el.loadingOverlay.style.opacity = '1'; el.loadingOverlay.classList.remove('hidden'); }
function hideLoading() { el.loadingOverlay.style.opacity = '0'; setTimeout(() => el.loadingOverlay.classList.add('hidden'), 500); }

// --- Event Listeners ---

el.joinBtn.onclick = () => {
    const id = el.accessIdInput.value.trim().toLowerCase();
    if (id) joinSession(id);
};

el.showHostLink.onclick = (e) => { e.preventDefault(); showScreen('host'); };
el.closeHostBtn.onclick = () => showScreen('login');
el.createSessionBtn.onclick = hostNewSession;

el.startViewingBtn.onclick = () => {
    const id = el.newIdDisplay.innerText;
    joinSession(id);
};

el.submitBtn.onclick = submitWord;
el.wordInput.onkeypress = (e) => { if (e.key === 'Enter') submitWord(); };

el.detonatorBtn.onclick = () => el.detonatorModal.classList.remove('hidden');
el.cancelDetonation.onclick = () => el.detonatorModal.classList.add('hidden');
el.confirmDetonation.onclick = detonate;

// Start the app
init();
