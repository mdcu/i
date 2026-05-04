/**
 * WardStaff Vault - Secure Plain JS Implementation
 * No Frameworks. No Dependencies. Pure Web Standards.
 */

class CryptoVault {
    constructor() {
        this.salt = new TextEncoder().encode('wardstaff-secure-salt-2024');
    }

    async deriveKey(passcode) {
        const pbkdf2 = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(passcode),
            'PBKDF2',
            false,
            ['deriveKey']
        );

        return crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: this.salt,
                iterations: 100000,
                hash: 'SHA-256'
            },
            pbkdf2,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    async encrypt(data, passcode) {
        const key = await this.deriveKey(passcode);
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encoded = new TextEncoder().encode(JSON.stringify(data));
        
        const ciphertext = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            key,
            encoded
        );

        const combined = new Uint8Array(iv.length + ciphertext.byteLength);
        combined.set(iv);
        combined.set(new Uint8Array(ciphertext), iv.length);
        
        return btoa(String.fromCharCode(...combined));
    }

    async decrypt(encryptedBase64, passcode) {
        try {
            const combined = new Uint8Array(
                atob(encryptedBase64).split('').map(c => c.charCodeAt(0))
            );
            
            const iv = combined.slice(0, 12);
            const ciphertext = combined.slice(12);
            const key = await this.deriveKey(passcode);

            const decoded = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv },
                key,
                ciphertext
            );

            return JSON.parse(new TextDecoder().decode(decoded));
        } catch (e) {
            throw new Error('Invalid passcode');
        }
    }
}

class WardApp {
    constructor() {
        this.crypto = new CryptoVault();
        this.state = {
            passcode: null,
            patients: [],
            selectedId: null
        };

        this.init();
    }

    init() {
        // Elements
        this.loginView = document.getElementById('login-view');
        this.dashboardView = document.getElementById('dashboard-view');
        this.vaultForm = document.getElementById('vault-form');
        this.patientGrid = document.getElementById('patient-grid');
        this.detailCol = document.getElementById('detail-col');
        this.sidebarCol = document.getElementById('sidebar-col');
        this.modalContainer = document.getElementById('modal-container');
        this.modalContent = document.getElementById('modal-content');

        this.vaultForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.unlock(document.getElementById('passcode').value);
        });

        this.checkAuth();
    }

    async unlock(passcode) {
        try {
            const encryptedData = localStorage.getItem('ward_vault_data');
            if (encryptedData) {
                const data = await this.crypto.decrypt(encryptedData, passcode);
                this.state.patients = data.patients || [];
            } else {
                // First time setup - encrypt empty state
                this.state.patients = [];
                await this.save(passcode);
            }
            
            this.state.passcode = passcode;
            this.showView('dashboard');
            this.render();
        } catch (e) {
            alert('Incorrect passcode. Please try again.');
        }
    }

    async save(passcode = this.state.passcode) {
        if (!passcode) return;
        const encrypted = await this.crypto.encrypt({ patients: this.state.patients }, passcode);
        localStorage.setItem('ward_vault_data', encrypted);
    }

    checkAuth() {
        if (this.state.passcode) {
            this.showView('dashboard');
        } else {
            this.showView('login');
        }
    }

    showView(view) {
        if (view === 'dashboard') {
            this.loginView.classList.add('hidden');
            this.dashboardView.classList.remove('hidden');
        } else {
            this.loginView.classList.remove('hidden');
            this.dashboardView.classList.add('hidden');
        }
    }

    logout() {
        this.state.passcode = null;
        this.state.patients = [];
        this.state.selectedId = null;
        document.getElementById('passcode').value = '';
        this.showView('login');
    }

    // --- State Actions ---
    async admitPatient(data) {
        const newPatient = {
            id: crypto.randomUUID(),
            bed_no: data.bed_no,
            hn: data.hn,
            name: data.name,
            status: data.status || 'Admitted',
            emoji: data.emoji || '🏥',
            admit_date: new Date().toISOString().split('T')[0],
            course: [],
            problems: [],
            consults: []
        };
        this.state.patients.push(newPatient);
        await this.save();
        this.render();
    }

    async updatePatient(id, updates) {
        this.state.patients = this.state.patients.map(p => p.id === id ? { ...p, ...updates } : p);
        await this.save();
        this.render();
    }

    async deletePatient(id) {
        const patient = this.state.patients.find(p => p.id === id);
        if (!patient) return;

        this.showModal(`
            <div class="p-8 text-center animate-fade-in">
                <div class="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                    <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                </div>
                <h3 class="text-2xl font-black mb-2">Delete Patient Record?</h3>
                <p class="text-zinc-400 text-sm mb-8 leading-relaxed">This will permanently remove <b>${patient.name}</b> and all associated clinical data. This action is irreversible.</p>
                <div class="flex gap-4">
                    <button onclick="app.closeModal()" class="flex-1 py-4 font-bold text-zinc-400 hover:text-zinc-600 transition-colors">Cancel</button>
                    <button id="confirm-delete-btn" class="flex-1 bg-red-500 text-white font-black py-4 rounded-2xl shadow-xl shadow-red-100 hover:bg-red-600 transition-all active:scale-95">Delete Forever</button>
                </div>
            </div>
        `);

        document.getElementById('confirm-delete-btn').onclick = async () => {
            this.state.patients = this.state.patients.filter(p => p.id !== id);
            if (this.state.selectedId === id) this.state.selectedId = null;
            await this.save();
            this.closeModal();
            this.render();
        };
    }

    async deleteProblem(patientId, problemId) {
        this.showModal(`
            <div class="p-8 text-center animate-fade-in">
                <h3 class="text-xl font-black mb-2">Remove Problem?</h3>
                <p class="text-zinc-400 text-sm mb-8 leading-relaxed">This problem and its management plan will be deleted from the record.</p>
                <div class="flex gap-4">
                    <button onclick="app.closeModal()" class="flex-1 py-4 font-bold text-zinc-400">Cancel</button>
                    <button id="confirm-delete-prob-btn" class="flex-1 bg-zinc-900 text-white font-black py-4 rounded-2xl shadow-xl active:scale-95">Confirm Delete</button>
                </div>
            </div>
        `);

        document.getElementById('confirm-delete-prob-btn').onclick = async () => {
            const patient = this.state.patients.find(p => p.id === patientId);
            if (patient) {
                patient.problems = patient.problems.filter(pr => pr.id !== problemId);
                await this.save();
                this.render();
            }
            this.closeModal();
        };
    }

    async addProblem(patientId, title, plan, status = 'Active') {
        const patient = this.state.patients.find(p => p.id === patientId);
        if (!patient) return;
        patient.problems.push({
            id: crypto.randomUUID(),
            title,
            plan,
            status,
            created_at: new Date().toISOString()
        });
        await this.save();
        this.render();
    }

    async updateProblem(patientId, problemId, updates) {
        const patient = this.state.patients.find(p => p.id === patientId);
        if (!patient) return;
        patient.problems = patient.problems.map(pr => pr.id === problemId ? { ...pr, ...updates } : pr);
        await this.save();
        this.render();
    }

    async toggleProblem(patientId, problemId) {
        const patient = this.state.patients.find(p => p.id === patientId);
        if (!patient) return;
        const prob = patient.problems.find(pr => pr.id === problemId);
        if (prob) {
            const nextMap = { 'Active': 'Solved', 'Solved': 'Inactive', 'Inactive': 'Critical', 'Critical': 'Active' };
            prob.status = nextMap[prob.status] || 'Active';
        }
        await this.save();
        this.render();
    }

    async addCourseEntry(patientId, content, date = new Date().toISOString(), color = 'white') {
        const patient = this.state.patients.find(p => p.id === patientId);
        if (!patient) return;
        patient.course.unshift({
            id: crypto.randomUUID(),
            date,
            content,
            color
        });
        await this.save();
        this.render();
    }

    async updateCourseEntry(patientId, entryId, updates) {
        const patient = this.state.patients.find(p => p.id === patientId);
        if (!patient) return;
        patient.course = patient.course.map(e => e.id === entryId ? { ...e, ...updates } : e);
        await this.save();
        this.render();
    }

    async deleteCourseEntry(patientId, entryId) {
        this.showModal(`
            <div class="p-8 text-center animate-fade-in">
                <h3 class="text-xl font-black mb-2 text-zinc-900">Delete Timeline Block?</h3>
                <p class="text-zinc-400 text-sm mb-8  leading-relaxed">Are you sure you want to remove this clinical entry? History is important for continuity of care.</p>
                <div class="flex gap-4">
                    <button onclick="app.closeModal()" class="flex-1 py-4 font-bold text-zinc-400">Keep Entry</button>
                    <button id="confirm-delete-entry-btn" class="flex-1 bg-zinc-900 text-white font-black py-4 rounded-2xl shadow-xl active:scale-95">Delete Entry</button>
                </div>
            </div>
        `);

        document.getElementById('confirm-delete-entry-btn').onclick = async () => {
            const patient = this.state.patients.find(p => p.id === patientId);
            if (patient) {
                patient.course = patient.course.filter(e => e.id !== entryId);
                await this.save();
                this.render();
            }
            this.closeModal();
        };
    }

    // --- UI Rendering ---
    render() {
        this.renderPatientGrid();
        this.renderPatientDetail();
    }

    renderPatientGrid() {
        const getStatusColor = (status) => {
            const map = {
                'Admitted': 'bg-blue-500',
                'Discharged': 'bg-green-500',
                'Transfer': 'bg-amber-500'
            };
            return map[status] || 'bg-zinc-500';
        };

        this.patientGrid.innerHTML = this.state.patients.map(p => `
            <div onclick="app.selectPatient('${p.id}')" 
                 class="group relative cursor-pointer rounded-2xl p-4 flex flex-col gap-3 transition-all border-2 ${this.state.selectedId === p.id 
                    ? 'bg-zinc-900 border-zinc-900 text-white shadow-xl ring-4 ring-zinc-900/10 scale-[1.02]' 
                    : 'bg-white border-zinc-100 shadow-sm hover:border-zinc-300 hover:shadow-md hover:-translate-y-1'}">
                
                <div class="flex items-start justify-between w-full">
                    <div class="flex items-center gap-2">
                        <div class="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${this.state.selectedId === p.id ? 'bg-zinc-800' : 'bg-zinc-100'}">
                            <span class="text-xs font-black select-none">${p.bed_no}</span>
                        </div>
                        <div class="w-1.5 h-1.5 rounded-full ${getStatusColor(p.status)}"></div>
                    </div>
                    <div class="text-lg transition-transform group-hover:scale-125">${p.emoji || '🏥'}</div>
                </div>

                <div class="space-y-0.5 overflow-hidden">
                    <div class="font-bold truncate text-sm md:text-base tracking-tight">${p.name}</div>
                    <div class="flex items-center justify-between">
                        <div class="text-[10px] font-bold font-mono opacity-50">HN ${p.hn}</div>
                        <div class="text-[9px] font-black uppercase tracking-tighter opacity-40">${p.status}</div>
                    </div>
                </div>

                ${p.problems.length > 0 ? `
                    <div class="flex gap-1 overflow-hidden opacity-80">
                        ${[...new Set(p.problems.map(pr => pr.status))].slice(0, 3).map(status => {
                            const colors = {
                                'Critical': 'bg-orange-400',
                                'Active': 'bg-yellow-400',
                                'Solved': 'bg-green-400',
                                'Inactive': 'bg-zinc-300'
                            };
                            return `<div class="w-1.5 h-1.5 rounded-full ${colors[status] || 'bg-zinc-300'}"></div>`;
                        }).join('')}
                    </div>
                ` : ''}
            </div>
        `).join('') || `
            <div class="col-span-full py-20 text-center border-2 border-dashed border-zinc-100 rounded-[3rem] bg-zinc-50/30">
                <p class="text-zinc-400 font-medium tracking-tight">Empty Ward. Admit a patient to start.</p>
            </div>
        `;

        if (this.state.selectedId) {
            this.sidebarCol.className = "lg:col-span-5 hidden lg:block";
            this.detailCol.classList.remove('hidden');
        } else {
            this.sidebarCol.className = "lg:col-span-12";
            this.detailCol.classList.add('hidden');
        }
    }

    selectPatient(id) {
        this.state.selectedId = id;
        this.render();
    }

    renderPatientDetail() {
        if (!this.state.selectedId) return;
        const patient = this.state.patients.find(p => p.id === this.state.selectedId);
        if (!patient) return;

        const formatDate = (dateStr) => {
            const date = new Date(dateStr);
            return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        };

        this.detailCol.innerHTML = `
            <div class="bg-white rounded-[2.5rem] shadow-2xl shadow-zinc-200 border border-zinc-200 flex flex-col min-h-[750px] max-h-[85vh] overflow-hidden relative animate-fade-in">
                <!-- Header -->
                <div class="p-6 md:p-8 border-b border-zinc-100 flex flex-col md:flex-row md:items-center justify-between bg-zinc-50/50 gap-4">
                    <div class="flex items-center gap-4 md:gap-6 overflow-hidden">
                        <div class="w-12 h-12 md:w-16 md:h-16 bg-zinc-900 rounded-2xl md:rounded-3xl flex items-center justify-center text-white shrink-0 relative cursor-pointer group" onclick="app.showEditPatientModal('${patient.id}')">
                            <span class="text-lg md:text-2xl font-black">${patient.bed_no}</span>
                            <div class="absolute -bottom-1 -right-1 bg-white rounded-full w-6 h-6 flex items-center justify-center text-sm shadow-sm border border-zinc-100 group-hover:scale-110 transition-transform">${patient.emoji || '🏥'}</div>
                        </div>
                        <div class="overflow-hidden">
                            <div class="flex items-center gap-2">
                                <h2 class="text-xl md:text-2xl font-bold text-zinc-900 leading-tight truncate">${patient.name}</h2>
                                <span class="px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${patient.status === 'Discharged' ? 'bg-green-100 text-green-700' : patient.status === 'Transfer' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}">${patient.status || 'Admitted'}</span>
                            </div>
                            <div class="flex flex-wrap items-center gap-2 md:gap-4 mt-1">
                                <span class="text-[10px] md:text-xs font-bold font-mono px-2 py-0.5 md:py-1 bg-zinc-200 rounded text-zinc-600">HN ${patient.hn}</span>
                                <span class="text-[10px] md:text-xs font-medium text-zinc-400">Admitted ${formatDate(patient.admit_date)}</span>
                            </div>
                        </div>
                    </div>
                    <div class="flex items-center justify-end gap-1 md:gap-2">
                        <button onclick="app.showEditPatientModal('${patient.id}')" class="p-2 md:p-3 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 rounded-2xl transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button onclick="app.deletePatient('${patient.id}')" class="p-2 md:p-3 text-red-500 hover:bg-red-50 rounded-2xl transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                        <button onclick="app.closeDetail()" class="p-2 md:p-3 text-zinc-400 hover:bg-zinc-100 rounded-2xl transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                    </div>
                </div>

                <!-- Tabs -->
                <div class="flex px-4 md:px-8 border-b border-zinc-100 overflow-x-auto no-scrollbar">
                    <button onclick="app.activeTab = 'problems'; app.renderPatientDetail()" class="flex items-center gap-2 py-4 md:py-6 px-4 md:px-6 font-bold text-xs md:text-sm transition-all relative border-b-2 ${this.activeTab === 'problems' || !this.activeTab ? 'text-zinc-900 border-zinc-900' : 'text-zinc-400 border-transparent'}">Problems</button>
                    <button onclick="app.activeTab = 'course'; app.renderPatientDetail()" class="flex items-center gap-2 py-4 md:py-6 px-4 md:px-6 font-bold text-xs md:text-sm transition-all relative border-b-2 ${this.activeTab === 'course' ? 'text-zinc-900 border-zinc-900' : 'text-zinc-400 border-transparent'}">Clinical Course</button>
                </div>

                <!-- Content -->
                <div class="flex-1 overflow-auto p-4 md:p-8">
                    ${this.activeTab === 'course' ? this.renderCourse(patient) : this.renderProblems(patient)}
                </div>
            </div>
        `;
    }

    renderProblems(patient) {
        const getStatusStyles = (status) => {
            const map = {
                'Active': 'bg-yellow-50 border-yellow-200 text-yellow-700 shadow-yellow-100',
                'Inactive': 'bg-zinc-50 border-zinc-200 text-zinc-500 shadow-transparent opacity-60',
                'Solved': 'bg-green-50 border-green-200 text-green-700 shadow-green-100',
                'Critical': 'bg-orange-50 border-orange-200 text-orange-700 shadow-orange-100 ring-2 ring-orange-400'
            };
            return map[status] || map.Active;
        };

        const filter = this.problemFilter || 'All';
        const filteredProblems = patient.problems
            .filter(p => filter === 'All' || p.status === filter)
            .sort((a, b) => {
                const order = { 'Critical': 0, 'Active': 1, 'Solved': 2, 'Inactive': 3 };
                return order[a.status] - order[b.status];
            });

        return `
            <div class="space-y-6">
                <div class="flex items-center justify-between mb-2">
                    <div class="flex flex-col gap-1">
                        <h3 class="text-[10px] font-black uppercase tracking-widest text-zinc-400">Problem List</h3>
                        <div class="flex gap-2">
                            ${['All', 'Active', 'Critical', 'Solved', 'Inactive'].map(f => `
                                <button onclick="app.problemFilter = '${f}'; app.renderPatientDetail()" class="text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded-full transition-all ${filter === f ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-400 hover:bg-zinc-200'}">
                                    ${f}
                                </button>
                            `).join('')}
                        </div>
                    </div>
                    <button onclick="app.showAddProblemModal('${patient.id}')" class="bg-zinc-100 hover:bg-zinc-200 p-2 rounded-xl transition-all text-zinc-600">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    </button>
                </div>
                <div class="grid gap-4">
                    ${filteredProblems.map(prob => `
                        <div onclick="app.showEditProblemModal('${patient.id}', '${prob.id}')" 
                             class="group p-6 rounded-3xl border-2 transition-all flex flex-col gap-4 shadow-sm cursor-pointer hover:scale-[1.01] active:scale-[0.99] ${getStatusStyles(prob.status)}">
                            <div class="flex items-start gap-4">
                                <button onclick="event.stopPropagation(); app.toggleProblem('${patient.id}', '${prob.id}')" 
                                        class="mt-1 shrink-0 transition-transform active:scale-125">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                                </button>
                                <div class="flex-1 overflow-hidden">
                                    <div class="flex items-center justify-between gap-2">
                                        <div>
                                            <h4 class="font-bold text-lg truncate">${prob.title}</h4>
                                            <span class="text-[8px] font-black uppercase tracking-[0.2em] opacity-80">${prob.status}</span>
                                        </div>
                                        <div class="opacity-0 group-hover:opacity-100 p-2 hover:bg-black/5 rounded-lg transition-all">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                        </div>
                                    </div>
                                    <p class="text-sm mt-1 whitespace-pre-wrap font-medium">${prob.plan}</p>
                                </div>
                            </div>
                        </div>
                    `).join('') || '<div class="py-12 text-center text-zinc-400 text-sm">No problem entries match the filter.</div>'}
                </div>
            </div>
        `;
    }

    renderCourse(patient) {
        const getColorStyles = (color) => {
            const map = {
                'white': 'bg-white border-zinc-100',
                'blue': 'bg-blue-50 border-blue-200',
                'rose': 'bg-rose-50 border-rose-200',
                'amber': 'bg-amber-50 border-amber-200',
                'indigo': 'bg-indigo-50 border-indigo-200'
            };
            return map[color] || map.white;
        };

        const formatDate = (dateStr) => {
            const date = new Date(dateStr);
            return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        };

        const sortedCourse = [...patient.course].sort((a, b) => new Date(b.date) - new Date(a.date));

        return `
            <div class="space-y-6">
                <div class="flex items-center justify-between mb-2">
                    <h3 class="text-[10px] font-black uppercase tracking-widest text-zinc-400">Clinical Timeline</h3>
                    <button onclick="app.showAddCourseModal('${patient.id}')" class="bg-zinc-900 text-white px-6 py-3 rounded-2xl font-black text-sm shadow-xl flex items-center gap-2 hover:scale-105 transition-all">
                        + New Block
                    </button>
                </div>
                <div class="space-y-8 relative before:absolute before:left-5 before:top-4 before:bottom-4 before:w-0.5 before:bg-zinc-100">
                    ${sortedCourse.map(entry => `
                        <div class="relative pl-12 group cursor-pointer" onclick="app.showEditCourseModal('${patient.id}', '${entry.id}')">
                            <div class="absolute left-3 top-2 w-4 h-4 rounded-full bg-zinc-900 ring-4 ring-white z-10"></div>
                            <div class="border-2 p-6 rounded-[2rem] shadow-sm hover:shadow-md transition-all hover:scale-[1.01] ${getColorStyles(entry.color)}">
                                <div class="flex items-center justify-between mb-2">
                                    <span class="text-[10px] font-black uppercase tracking-widest text-zinc-400">${formatDate(entry.date)}</span>
                                    <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onclick="event.stopPropagation(); app.deleteCourseEntry('${patient.id}', '${entry.id}')" class="p-2 text-zinc-400 hover:text-red-500">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                        </button>
                                    </div>
                                </div>
                                <div class="text-zinc-700 font-medium text-sm leading-relaxed whitespace-pre-wrap">${entry.content}</div>
                            </div>
                        </div>
                    `).join('') || '<div class="py-12 text-center text-zinc-400 text-sm">Empty timeline.</div>'}
                </div>
            </div>
        `;
    }

    // --- Modal Controllers ---
    showModal(content) {
        this.modalContent.innerHTML = content;
        this.modalContainer.classList.remove('hidden');
    }

    closeModal() {
        this.modalContainer.classList.add('hidden');
    }

    closeDetail() {
        this.state.selectedId = null;
        this.render();
    }

    showAdmitModal() {
        this.showModal(`
            <div class="p-8 md:p-10">
                <h3 class="text-3xl font-black text-zinc-900 mb-6 font-sans">Patient Admission</h3>
                <form id="admit-form" class="space-y-6">
                    <div class="grid grid-cols-2 gap-4">
                        <div class="space-y-2">
                            <label class="text-[10px] font-black uppercase tracking-widest text-zinc-400 px-1">Bed / ID</label>
                            <input name="bed_no" required class="w-full px-6 py-4 rounded-2xl bg-zinc-50 border-2 border-transparent focus:border-zinc-900 outline-none font-bold text-xl" placeholder="A-01">
                        </div>
                        <div class="space-y-2">
                            <label class="text-[10px] font-black uppercase tracking-widest text-zinc-400 px-1">Emoji Identity</label>
                            <input name="emoji" value="🏥" class="w-full px-6 py-4 rounded-2xl bg-zinc-50 border-2 border-transparent focus:border-zinc-900 outline-none font-bold text-xl text-center">
                        </div>
                    </div>
                    <div class="space-y-2">
                        <label class="text-[10px] font-black uppercase tracking-widest text-zinc-400 px-1">Initial Status</label>
                        <select name="status" class="w-full px-6 py-4 rounded-2xl bg-zinc-50 border-2 border-transparent focus:border-zinc-900 outline-none font-bold">
                            <option value="Admitted">Admitted</option>
                            <option value="Discharged">Discharged</option>
                            <option value="Transfer">Transfer</option>
                        </select>
                    </div>
                    <div class="space-y-2">
                        <label class="text-[10px] font-black uppercase tracking-widest text-zinc-400 px-1">Hospital Number (HN)</label>
                        <input name="hn" required class="w-full px-6 py-4 rounded-2xl bg-zinc-50 border-2 border-transparent focus:border-zinc-900 outline-none font-bold" placeholder="HN-123456">
                    </div>
                    <div class="space-y-2">
                        <label class="text-[10px] font-black uppercase tracking-widest text-zinc-400 px-1">Full Name</label>
                        <input name="name" required class="w-full px-6 py-4 rounded-2xl bg-zinc-50 border-2 border-transparent focus:border-zinc-900 outline-none font-bold" placeholder="John Doe">
                    </div>
                    <div class="flex gap-4 pt-4">
                        <button type="button" onclick="app.closeModal()" class="flex-1 py-4 font-bold text-zinc-400">Cancel</button>
                        <button type="submit" class="flex-1 bg-zinc-900 text-white font-black py-4 rounded-2xl shadow-xl">Confirm Admiralty</button>
                    </div>
                </form>
            </div>
        `);
        document.getElementById('admit-form').onsubmit = (e) => {
            e.preventDefault();
            this.admitPatient(Object.fromEntries(new FormData(e.target)));
            this.closeModal();
        };
    }

    showEditPatientModal(patientId) {
        const patient = this.state.patients.find(p => p.id === patientId);
        this.showModal(`
            <div class="p-8 md:p-10">
                <h3 class="text-3xl font-black text-zinc-900 mb-6 font-sans">Modify Identity</h3>
                <form id="edit-patient-form" class="space-y-6">
                    <div class="grid grid-cols-2 gap-4">
                        <div class="space-y-2">
                            <label class="text-[10px] font-black uppercase tracking-widest text-zinc-400 px-1">Bed / ID</label>
                            <input name="bed_no" value="${patient.bed_no}" required class="w-full px-6 py-4 rounded-2xl bg-zinc-50 border-2 border-transparent focus:border-zinc-900 outline-none font-bold text-xl">
                        </div>
                        <div class="space-y-2">
                            <label class="text-[10px] font-black uppercase tracking-widest text-zinc-400 px-1">Emoji</label>
                            <input name="emoji" value="${patient.emoji || '🏥'}" class="w-full px-6 py-4 rounded-2xl bg-zinc-50 border-2 border-transparent focus:border-zinc-900 outline-none font-bold text-xl text-center">
                        </div>
                    </div>
                    <div class="space-y-2">
                        <label class="text-[10px] font-black uppercase tracking-widest text-zinc-400 px-1">Current Status</label>
                        <select name="status" class="w-full px-6 py-4 rounded-2xl bg-zinc-50 border-2 border-transparent focus:border-zinc-900 outline-none font-bold">
                            <option value="Admitted" ${patient.status === 'Admitted' ? 'selected' : ''}>Admitted</option>
                            <option value="Discharged" ${patient.status === 'Discharged' ? 'selected' : ''}>Discharged</option>
                            <option value="Transfer" ${patient.status === 'Transfer' ? 'selected' : ''}>Transfer</option>
                        </select>
                    </div>
                    <div class="space-y-2">
                        <label class="text-[10px] font-black uppercase tracking-widest text-zinc-400 px-1">Name</label>
                        <input name="name" value="${patient.name}" required class="w-full px-6 py-4 rounded-2xl bg-zinc-50 border-2 border-transparent focus:border-zinc-900 outline-none font-bold">
                    </div>
                    <div class="flex gap-4 pt-4">
                        <button type="button" onclick="app.closeModal()" class="flex-1 py-4 font-bold text-zinc-400">Cancel</button>
                        <button type="submit" class="flex-1 bg-zinc-900 text-white font-black py-4 rounded-2xl shadow-xl">Save Changes</button>
                    </div>
                </form>
            </div>
        `);
        document.getElementById('edit-patient-form').onsubmit = (e) => {
            e.preventDefault();
            this.updatePatient(patientId, Object.fromEntries(new FormData(e.target)));
            this.closeModal();
        };
    }

    showAddProblemModal(patientId) {
        this.showModal(`
            <div class="p-8">
                <h3 class="text-2xl font-black mb-6">New Problem Entry</h3>
                <form id="prob-form" class="space-y-4">
                    <div class="space-y-1">
                        <label class="text-[10px] font-black uppercase tracking-widest text-zinc-400">Diagnosis</label>
                        <input name="title" required autoFocus class="w-full px-4 py-3 rounded-xl bg-zinc-100 border-2 border-transparent focus:border-zinc-900 outline-none font-bold">
                    </div>
                    <div class="space-y-1">
                        <label class="text-[10px] font-black uppercase tracking-widest text-zinc-400">Status</label>
                        <select name="status" class="w-full px-4 py-3 rounded-xl bg-zinc-100 outline-none font-bold border-2 border-transparent focus:border-zinc-900">
                            <option value="Active">Active (Yellow)</option>
                            <option value="Critical">Critical (Orange)</option>
                            <option value="Inactive">Inactive (Gray)</option>
                            <option value="Solved">Solved (Green)</option>
                        </select>
                    </div>
                    <div class="space-y-1">
                        <label class="text-[10px] font-black uppercase tracking-widest text-zinc-400">Management Plan</label>
                        <textarea name="plan" class="w-full px-4 py-3 rounded-xl bg-zinc-100 border-2 border-transparent focus:border-zinc-900 outline-none h-40 font-medium text-sm"></textarea>
                    </div>
                    <button type="submit" class="w-full bg-zinc-900 text-white font-black py-4 rounded-2xl shadow-xl">Add Problem</button>
                </form>
            </div>
        `);
        document.getElementById('prob-form').onsubmit = (e) => {
            e.preventDefault();
            const data = Object.fromEntries(new FormData(e.target));
            this.addProblem(patientId, data.title, data.plan, data.status);
            this.closeModal();
        };
    }

    showEditProblemModal(patientId, problemId) {
        const patient = this.state.patients.find(p => p.id === patientId);
        const prob = patient.problems.find(p => p.id === problemId);
        this.showModal(`
            <div class="p-8">
                <h3 class="text-2xl font-black mb-6 text-zinc-900">Modify Problem</h3>
                <form id="prob-form-edit" class="space-y-4">
                    <div class="space-y-1">
                        <label class="text-[10px] font-black uppercase tracking-widest text-zinc-400">Diagnosis</label>
                        <input name="title" value="${prob.title}" required class="w-full px-4 py-3 rounded-xl bg-zinc-50 border-2 border-transparent focus:border-zinc-900 outline-none font-bold">
                    </div>
                    <div class="space-y-1">
                        <label class="text-[10px] font-black uppercase tracking-widest text-zinc-400">Status</label>
                        <select name="status" class="w-full px-4 py-3 rounded-xl bg-zinc-50 outline-none font-bold">
                            <option value="Active" ${prob.status === 'Active' ? 'selected' : ''}>Active (Yellow)</option>
                            <option value="Critical" ${prob.status === 'Critical' ? 'selected' : ''}>Critical (Orange)</option>
                            <option value="Inactive" ${prob.status === 'Inactive' ? 'selected' : ''}>Inactive (Gray)</option>
                            <option value="Solved" ${prob.status === 'Solved' ? 'selected' : ''}>Solved (Green)</option>
                        </select>
                    </div>
                    <div class="space-y-1">
                        <label class="text-[10px] font-black uppercase tracking-widest text-zinc-400">Management Plan</label>
                        <textarea name="plan" class="w-full px-4 py-3 rounded-xl bg-zinc-50 border-2 border-transparent focus:border-zinc-900 outline-none h-40 font-medium text-sm leading-relaxed">${prob.plan}</textarea>
                    </div>
                    <div class="pt-2 border-t border-zinc-100 flex flex-col gap-2">
                        <button type="submit" class="w-full bg-zinc-900 text-white font-black py-4 rounded-2xl shadow-xl active:scale-[0.98]">Update Problem</button>
                        <button type="button" onclick="app.deleteProblem('${patientId}', '${problemId}')" class="w-full text-red-500 font-bold py-2 text-sm">Delete Problem Permanently</button>
                    </div>
                </form>
            </div>
        `);
        document.getElementById('prob-form-edit').onsubmit = (e) => {
            e.preventDefault();
            this.updateProblem(patientId, problemId, Object.fromEntries(new FormData(e.target)));
            this.closeModal();
        };
    }

    showAddCourseModal(patientId) {
        this.showModal(`
            <div class="p-8">
                <h3 class="text-2xl font-black mb-6">New Timeline Block</h3>
                <form id="course-form" class="space-y-6">
                    <div class="flex items-center gap-4">
                        <div class="flex-1 space-y-1">
                            <label class="text-[10px] font-black uppercase tracking-widest text-zinc-400">Date</label>
                            <input type="date" name="date" value="${new Date().toISOString().split('T')[0]}" class="w-full bg-zinc-50 px-4 py-3 rounded-xl font-bold">
                        </div>
                        <div class="flex-1 space-y-1">
                            <label class="text-[10px] font-black uppercase tracking-widest text-zinc-400">Block Color</label>
                            <div class="flex gap-2">
                                ${['white', 'blue', 'rose', 'amber', 'indigo'].map(c => `
                                    <label class="cursor-pointer">
                                        <input type="radio" name="color" value="${c}" class="hidden peer" ${c === 'white' ? 'checked' : ''}>
                                        <div class="w-8 h-8 rounded-full border-2 border-transparent peer-checked:border-zinc-900 bg-${c === 'white' ? 'zinc-100' : c + '-200'}"></div>
                                    </label>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                    <textarea name="content" required autoFocus class="w-full px-6 py-4 rounded-3xl bg-zinc-50 border-2 border-transparent focus:border-zinc-900 outline-none h-60 font-medium text-base leading-relaxed" placeholder="Summarize events..."></textarea>
                    <button type="submit" class="w-full bg-zinc-900 text-white font-black py-4 rounded-2xl shadow-xl">Add to Story</button>
                </form>
            </div>
        `);
        document.getElementById('course-form').onsubmit = (e) => {
            e.preventDefault();
            const data = Object.fromEntries(new FormData(e.target));
            this.addCourseEntry(patientId, data.content, data.date, data.color);
            this.closeModal();
        };
    }

    showEditCourseModal(patientId, entryId) {
        const patient = this.state.patients.find(p => p.id === patientId);
        const entry = patient.course.find(e => e.id === entryId);
        this.showModal(`
            <div class="p-8">
                <h3 class="text-2xl font-black mb-6">Modify Block</h3>
                <form id="course-form-edit" class="space-y-6">
                    <div class="flex items-center gap-4">
                        <div class="flex-1 space-y-1">
                            <label class="text-[10px] font-black uppercase tracking-widest text-zinc-400">Date</label>
                            <input type="date" name="date" value="${entry.date.split('T')[0]}" class="w-full bg-zinc-100 px-4 py-3 rounded-xl font-bold">
                        </div>
                        <div class="flex-1 space-y-1">
                            <label class="text-[10px] font-black uppercase tracking-widest text-zinc-400">Color</label>
                            <div class="flex gap-2">
                                ${['white', 'blue', 'rose', 'amber', 'indigo'].map(c => `
                                    <label class="cursor-pointer">
                                        <input type="radio" name="color" value="${c}" class="hidden peer" ${entry.color === c ? 'checked' : ''}>
                                        <div class="w-8 h-8 rounded-full border-2 border-transparent peer-checked:border-zinc-900 bg-${c === 'white' ? 'zinc-100' : c + '-200'}"></div>
                                    </label>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                    <textarea name="content" required class="w-full px-6 py-4 rounded-3xl bg-zinc-100 border-2 border-transparent focus:border-zinc-900 outline-none h-60 font-medium text-base leading-relaxed">${entry.content}</textarea>
                    <button type="submit" class="w-full bg-zinc-900 text-white font-black py-4 rounded-2xl shadow-xl">Save Changes</button>
                </form>
            </div>
        `);
        document.getElementById('course-form-edit').onsubmit = (e) => {
            e.preventDefault();
            this.updateCourseEntry(patientId, entryId, Object.fromEntries(new FormData(e.target)));
            this.closeModal();
        };
    }

    showExportModal() {
        if (this.state.patients.length === 0) {
            alert('No patients to export.');
            return;
        }

        this.showModal(`
            <div class="p-8">
                <h3 class="text-2xl font-black mb-2">Export Data</h3>
                <p class="text-zinc-400 text-sm mb-6">Select patients to export to your clipboard.</p>
                <div class="max-h-60 overflow-y-auto space-y-2 mb-6 no-scrollbar">
                    ${this.state.patients.map(p => `
                        <label class="flex items-center gap-4 p-4 bg-zinc-50 rounded-2xl cursor-pointer hover:bg-zinc-100 transition-colors">
                            <input type="checkbox" name="export-patient" value="${p.id}" checked class="w-5 h-5 rounded-lg border-2 border-zinc-300 text-black focus:ring-0">
                            <div class="flex-1">
                                <div class="font-bold text-sm">${p.name}</div>
                                <div class="text-[10px] font-mono opacity-50">${p.bed_no} • HN ${p.hn}</div>
                            </div>
                        </label>
                    `).join('')}
                </div>
                <button id="export-btn" class="w-full bg-zinc-900 text-white font-black py-4 rounded-2xl shadow-xl flex items-center justify-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    Copy Selected Patients
                </button>
            </div>
        `);

        document.getElementById('export-btn').onclick = () => {
            const selectedIds = Array.from(document.querySelectorAll('input[name="export-patient"]:checked')).map(el => el.value);
            if (selectedIds.length === 0) {
                alert('Please select at least one patient.');
                return;
            }

            const selectedData = this.state.patients.filter(p => selectedIds.includes(p.id));
            navigator.clipboard.writeText(JSON.stringify(selectedData, null, 2))
                .then(() => {
                    const btn = document.getElementById('export-btn');
                    btn.innerHTML = '✓ Copied to Clipboard!';
                    btn.classList.replace('bg-zinc-900', 'bg-green-600');
                    setTimeout(() => this.closeModal(), 1000);
                });
        };
    }

    showImportModal() {
        this.showModal(`
            <div class="p-8">
                <h3 class="text-2xl font-black mb-2">Import Data</h3>
                <p class="text-zinc-400 text-sm mb-6">Paste patient JSON data here to add them to your ward.</p>
                <form id="import-form" class="space-y-6">
                    <textarea name="json" required class="w-full h-64 p-4 rounded-3xl bg-zinc-50 border-2 border-transparent focus:border-zinc-900 outline-none font-mono text-[10px] leading-relaxed" placeholder='[{"name": "...", "hn": "...", ...}]'></textarea>
                    <div class="flex gap-4">
                        <button type="button" onclick="app.closeModal()" class="flex-1 py-4 font-bold text-zinc-400">Cancel</button>
                        <button type="submit" class="flex-1 bg-zinc-900 text-white font-black py-4 rounded-2xl shadow-xl">Process Import</button>
                    </div>
                </form>
            </div>
        `);

        document.getElementById('import-form').onsubmit = async (e) => {
            e.preventDefault();
            try {
                const raw = new FormData(e.target).get('json');
                const imported = JSON.parse(raw);
                const patients = Array.isArray(imported) ? imported : [imported];
                
                // Add unique IDs to prevent collisions and ensure basic structure
                const newPatients = patients.map(p => ({
                    ...p,
                    id: crypto.randomUUID(),
                    course: p.course || [],
                    problems: p.problems || [],
                    status: p.status || 'Admitted',
                    emoji: p.emoji || '🏥'
                }));

                this.state.patients = [...this.state.patients, ...newPatients];
                await this.save();
                this.render();
                this.closeModal();
                alert(`Successfully imported ${newPatients.length} patient(s).`);
            } catch (err) {
                alert('Invalid JSON format. Please check the data and try again.');
            }
        };
    }
}

// Global instance
window.app = new WardApp();
