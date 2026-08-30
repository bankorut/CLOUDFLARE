// ==========================================
// CONFIGURATION & GLOBAL STATE
// ==========================================
const CONFIG = {
    GOOGLE_CLIENT_ID: '121466195081-m7kog8d7833erg7anuc5sjkfdvfru0d7.apps.googleusercontent.com',
    SUPER_ADMIN_EMAIL: 'danisvanandi@gmail.com',
    API_BASE: '/api'
};

let state = {
    user: JSON.parse(localStorage.getItem('app_user')) || null,
    token: localStorage.getItem('app_token') || null,
    selectedFile: null,
    currentAiTab: 'text'
};

// ==========================================
// INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    initDynamicBranding();
    initTheme();
    initGoogleAuth();
    updateAuthUI();
    loadFeed();
    loadStories();

    // Event Listener Enter Key untuk Chat AI
    document.getElementById('ai-text-input')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendAiMessage();
    });
});

// 1. Dynamic Naming berdasarkan Hostname
function initDynamicBranding() {
    const rawHostname = window.location.hostname;
    const cleanName = rawHostname === 'localhost' || rawHostname === '127.0.0.1' 
        ? 'DevSocial AI' 
        : rawHostname.split('.')[0].toUpperCase();
    
    document.getElementById('app-name').innerText = cleanName;
    document.getElementById('page-title').innerText = `${cleanName} - Cloudflare Serverless Social`;
}

// 2. Dark/Light Theme Mode
function initTheme() {
    const themeBtn = document.getElementById('theme-toggle');
    themeBtn.addEventListener('click', () => {
        const isDark = document.documentElement.classList.toggle('dark');
        themeBtn.innerHTML = isDark ? '<i class="fa-solid fa-moon"></i>' : '<i class="fa-solid fa-sun"></i>';
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
    });
}

// ==========================================
// AUTHENTICATION (GOOGLE GIS)
// ==========================================
function initGoogleAuth() {
    if (typeof google !== 'undefined') {
        google.accounts.id.initialize({
            client_id: CONFIG.GOOGLE_CLIENT_ID,
            callback: handleGoogleLoginResponse
        });
        
        google.accounts.id.renderButton(
            document.getElementById('auth-container'),
            { theme: 'outline', size: 'medium', type: 'standard' }
        );
    }
}

async function handleGoogleLoginResponse(response) {
    try {
        const res = await fetch(`${CONFIG.API_BASE}/auth/google`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ credential: response.credential })
        });
        
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Gagal login');

        state.user = data.user;
        state.token = data.token;
        localStorage.setItem('app_user', JSON.stringify(data.user));
        localStorage.setItem('app_token', data.token);

        updateAuthUI();
        alert(`Selamat datang kembali, ${data.user.name}!`);
    } catch (err) {
        alert(err.message);
    }
}

function updateAuthUI() {
    const authContainer = document.getElementById('auth-container');
    const adminBtn = document.getElementById('btn-admin-panel');
    const widgetAvatar = document.getElementById('widget-user-avatar');
    const widgetName = document.getElementById('widget-user-name');
    const widgetEmail = document.getElementById('widget-user-email');

    if (state.user) {
        authContainer.innerHTML = `
            <div class="flex items-center space-x-2">
                <img src="${state.user.avatar_url}" class="w-8 h-8 rounded-full border border-brand-500">
                <button onclick="logout()" class="px-3 py-1.5 rounded-lg bg-red-600/20 text-red-400 hover:bg-red-600 hover:text-white text-xs font-semibold">
                    Keluar
                </button>
            </div>
        `;
        widgetAvatar.src = state.user.avatar_url;
        widgetName.innerText = state.user.name;
        widgetEmail.innerText = state.user.email;

        // Tampilkan tombol Admin khusus Super Admin
        if (state.user.email === CONFIG.SUPER_ADMIN_EMAIL || state.user.role === 'admin') {
            adminBtn.classList.remove('hidden');
            adminBtn.onclick = toggleAdminModal;
        } else {
            adminBtn.classList.add('hidden');
        }
    } else {
        widgetAvatar.src = 'https://via.placeholder.com/80';
        widgetName.innerText = 'Tamu';
        widgetEmail.innerText = 'Silakan masuk dahulu';
        adminBtn.classList.add('hidden');
        initGoogleAuth();
    }
}

function logout() {
    state.user = null;
    state.token = null;
    localStorage.removeItem('app_user');
    localStorage.removeItem('app_token');
    location.reload();
}

// Helper authenticated fetch API
async function apiFetch(endpoint, options = {}) {
    options.headers = {
        ...options.headers,
        'Authorization': `Bearer ${state.token}`
    };
    const response = await fetch(`${CONFIG.API_BASE}${endpoint}`, options);
    if (response.status === 401) {
        logout();
        throw new Error('Sesi berakhir. Silakan login kembali.');
    }
    return response;
}

// ==========================================
// POSTS & MEDIA HANDLER
// ==========================================
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        state.selectedFile = file;
        const reader = new FileReader();
        reader.onload = (e) => {
            document.getElementById('media-preview-img').src = e.target.result;
            document.getElementById('media-preview').classList.remove('hidden');
        };
        reader.readAsDataURL(file);
    }
}

function removeMediaPreview() {
    state.selectedFile = null;
    document.getElementById('post-file').value = '';
    document.getElementById('media-preview').classList.add('hidden');
}

async function submitPost() {
    if (!state.user) return alert('Silakan login terlebih dahulu!');
    
    const content = document.getElementById('post-input').value.trim();
    if (!content && !state.selectedFile) return alert('Tuliskan sesuatu atau sertakan gambar!');

    const btn = document.getElementById('btn-submit-post');
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`;

    try {
        let mediaUrl = null;
        if (state.selectedFile) {
            mediaUrl = await uploadMediaToR2(state.selectedFile);
        }

        const res = await apiFetch('/posts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content, media_url: mediaUrl })
        });

        if (!res.ok) throw new Error('Gagal mengirim postingan');
        
        document.getElementById('post-input').value = '';
        removeMediaPreview();
        loadFeed();
    } catch (err) {
        alert(err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<span>Posting</span>`;
    }
}

async function uploadMediaToR2(file) {
    const formData = new FormData();
    formData.append('file', file);

    const res = await apiFetch('/upload', {
        method: 'POST',
        body: formData
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload gagal');
    return data.url;
}

async function loadFeed() {
    const feedContainer = document.getElementById('feed-container');
    try {
        const res = await fetch(`${CONFIG.API_BASE}/posts`);
        const posts = await res.json();

        if (posts.length === 0) {
            feedContainer.innerHTML = `<p class="text-center text-slate-500 py-8">Belum ada postingan.</p>`;
            return;
        }

        feedContainer.innerHTML = posts.map(post => `
            <div class="bg-slate-800 rounded-xl p-4 border border-slate-700 space-y-3">
                <div class="flex items-center justify-between">
                    <div class="flex items-center space-x-3">
                        <img src="${post.author_avatar || 'https://via.placeholder.com/40'}" class="w-10 h-10 rounded-full object-cover border border-slate-600">
                        <div>
                            <h4 class="font-bold text-white text-sm flex items-center">
                                ${post.author_name}
                                ${post.author_role === 'bot' ? '<span class="ml-2 bg-purple-600/30 text-purple-400 text-[10px] px-1.5 py-0.5 rounded border border-purple-500/30">BOT</span>' : ''}
                            </h4>
                            <span class="text-xs text-slate-400">${new Date(post.created_at).toLocaleString()}</span>
                        </div>
                    </div>
                </div>
                <p class="text-slate-200 text-sm whitespace-pre-line">${escapeHTML(post.content)}</p>
                ${post.media_url ? `<img src="${post.media_url}" class="rounded-lg w-full max-h-96 object-cover border border-slate-700">` : ''}
                
                <div class="flex items-center space-x-6 pt-2 border-t border-slate-700/50 text-slate-400 text-sm">
                    <button onclick="toggleLike('${post.id}')" class="hover:text-red-500 flex items-center space-x-1 ${post.user_liked ? 'text-red-500' : ''}">
                        <i class="fa-${post.user_liked ? 'solid' : 'regular'} fa-heart"></i>
                        <span>${post.like_count || 0}</span>
                    </button>
                    <div class="flex items-center space-x-1">
                        <i class="fa-regular fa-comment"></i>
                        <span>${post.comment_count || 0}</span>
                    </div>
                </div>
            </div>
        `).join('');
    } catch (err) {
        feedContainer.innerHTML = `<p class="text-center text-red-400 py-4">Gagal memuat postingan.</p>`;
    }
}

async function toggleLike(postId) {
    if (!state.user) return alert('Silakan login untuk menyukai!');
    try {
        await apiFetch(`/posts/${postId}/like`, { method: 'POST' });
        loadFeed();
    } catch (err) {
        alert(err.message);
    }
}

async function loadStories() {
    const storiesContainer = document.getElementById('stories-container');
    try {
        const res = await fetch(`${CONFIG.API_BASE}/stories`);
        const stories = await res.json();
        
        const storiesHTML = stories.map(story => `
            <div class="flex flex-col items-center space-y-1 cursor-pointer">
                <div class="w-14 h-14 rounded-full border-2 border-brand-500 p-0.5 bg-slate-700 overflow-hidden">
                    <img src="${story.media_url}" class="w-full h-full object-cover rounded-full">
                </div>
                <span class="text-xs text-slate-300 truncate w-14 text-center">${story.author_name}</span>
            </div>
        `).join('');
        
        storiesContainer.innerHTML = storiesContainer.firstElementChild.outerHTML + storiesHTML;
    } catch (err) {
        console.error('Failed to load stories', err);
    }
}

// ==========================================
// WORKERS AI INTERACTION
// ==========================================
function toggleAiModal() {
    document.getElementById('ai-modal').classList.toggle('hidden');
}

function switchAiTab(tab) {
    state.currentAiTab = tab;
    const textTab = document.getElementById('ai-tab-text');
    const imgTab = document.getElementById('ai-tab-image');
    const textBtn = document.getElementById('ai-tab-text-btn');
    const imgBtn = document.getElementById('ai-tab-img-btn');

    if (tab === 'text') {
        textTab.classList.remove('hidden');
        imgTab.classList.add('hidden');
        textBtn.className = "flex-1 py-2 text-sm font-semibold border-b-2 border-brand-500 text-brand-400";
        imgBtn.className = "flex-1 py-2 text-sm font-semibold border-b-2 border-transparent text-slate-400";
    } else {
        textTab.classList.add('hidden');
        imgTab.classList.remove('hidden');
        imgBtn.className = "flex-1 py-2 text-sm font-semibold border-b-2 border-brand-500 text-brand-400";
        textBtn.className = "flex-1 py-2 text-sm font-semibold border-b-2 border-transparent text-slate-400";
    }
}

function insertAiPrompt(promptText) {
    document.getElementById('ai-text-input').value = promptText;
}

async function sendAiMessage() {
    const input = document.getElementById('ai-text-input');
    const text = input.value.trim();
    if (!text) return;

    const msgBox = document.getElementById('ai-messages');
    msgBox.innerHTML += `<div class="bg-brand-600 text-white rounded-lg p-3 text-sm self-end max-w-[85%] ml-auto">${escapeHTML(text)}</div>`;
    input.value = '';
    msgBox.scrollTop = msgBox.scrollHeight;

    const loadingId = 'ai-loading-' + Date.now();
    msgBox.innerHTML += `<div id="${loadingId}" class="bg-slate-700/50 text-slate-400 rounded-lg p-3 text-sm self-start"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Berpikir...</div>`;
    msgBox.scrollTop = msgBox.scrollHeight;

    try {
        const res = await fetch(`${CONFIG.API_BASE}/ai/text`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: text })
        });
        const data = await res.json();
        document.getElementById(loadingId).outerHTML = `<div class="bg-slate-700/50 rounded-lg p-3 text-sm text-slate-200 self-start max-w-[85%]">${escapeHTML(data.response)}</div>`;
    } catch (err) {
        document.getElementById(loadingId).outerHTML = `<div class="bg-red-900/40 text-red-400 rounded-lg p-3 text-sm self-start">Gagal mendapatkan respon AI.</div>`;
    }
    msgBox.scrollTop = msgBox.scrollHeight;
}

async function generateAiImage() {
    const prompt = document.getElementById('ai-img-prompt').value.trim();
    if (!prompt) return alert('Masukkan deskripsi gambar!');

    const btn = document.getElementById('btn-gen-img');
    const resultBox = document.getElementById('ai-img-result');

    btn.disabled = true;
    btn.innerText = 'Menggenerasi Gambar...';
    resultBox.innerHTML = `<i class="fa-solid fa-compact-disc fa-spin text-purple-400 text-3xl"></i>`;

    try {
        const res = await fetch(`${CONFIG.API_BASE}/ai/image`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        resultBox.innerHTML = `
            <div class="space-y-2 text-center w-full">
                <img src="${data.image_url}" class="rounded-lg max-h-64 mx-auto border border-slate-700 w-full object-cover">
                <button onclick="useAiImageForPost('${data.image_url}')" class="px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded text-xs font-semibold">Gunakan di Postingan</button>
            </div>
        `;
    } catch (err) {
        resultBox.innerHTML = `<span class="text-xs text-red-400">Gagal membuat gambar: ${err.message}</span>`;
    } finally {
        btn.disabled = false;
        btn.innerText = 'Generate Gambar';
    }
}

function useAiImageForPost(url) {
    document.getElementById('media-preview-img').src = url;
    document.getElementById('media-preview').classList.remove('hidden');
    toggleAiModal();
}

// ==========================================
// SUPER ADMIN PANEL
// ==========================================
function toggleAdminModal() {
    const modal = document.getElementById('admin-modal');
    modal.classList.toggle('hidden');
    if (!modal.classList.contains('hidden')) {
        loadAdminUsers();
    }
}

async function loadAdminUsers() {
    const body = document.getElementById('admin-modal-body');
    body.innerHTML = `<i class="fa-solid fa-spinner fa-spin text-amber-400"></i> Memuat data user...`;

    try {
        const res = await apiFetch('/admin/users');
        const users = await res.json();

        body.innerHTML = `
            <table class="w-full text-left text-xs text-slate-300">
                <thead class="bg-slate-900 text-slate-400 uppercase">
                    <tr>
                        <th class="p-2">User</th>
                        <th class="p-2">Role</th>
                        <th class="p-2">Status</th>
                        <th class="p-2">Aksi</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-700">
                    ${users.map(u => `
                        <tr>
                            <td class="p-2 flex items-center space-x-2">
                                <img src="${u.avatar_url}" class="w-6 h-6 rounded-full">
                                <div><p class="font-bold text-white">${u.name}</p><p class="text-[10px] text-slate-500">${u.email}</p></div>
                            </td>
                            <td class="p-2">${u.role}</td>
                            <td class="p-2">${u.is_banned ? '<span class="text-red-400">Banned</span>' : '<span class="text-green-400">Aktif</span>'}</td>
                            <td class="p-2">
                                <button onclick="toggleBanUser('${u.id}', ${u.is_banned})" class="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-[10px]">
                                    ${u.is_banned ? 'Unban' : 'Ban'}
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    } catch (err) {
        body.innerHTML = `<p class="text-red-400">Akses ditolak atau gagal memuat data.</p>`;
    }
}

function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}
