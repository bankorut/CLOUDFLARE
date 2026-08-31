let currentUser = JSON.parse(localStorage.getItem('currentUser')) || null;
let selectedFile = null;

document.addEventListener("DOMContentLoaded", () => {
    if (currentUser) updateAuthUI();
    loadPosts();
});

function handleGoogleLogin(response) {
    const payload = parseJwt(response.credential);
    currentUser = {
        id: payload.sub,
        email: payload.email,
        name: payload.name,
        picture: payload.picture,
        role: payload.email === 'danisvanandi@gmail.com' ? 'admin' : 'user'
    };
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    updateAuthUI();
    syncUserBackend(currentUser);
}

function parseJwt(token) {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(window.atob(base64));
}

function updateAuthUI() {
    if (!currentUser) return;
    document.getElementById('google-auth-container').classList.add('hidden');
    document.getElementById('user-profile-btn').classList.remove('hidden');
    document.getElementById('user-avatar').src = currentUser.picture;
    document.getElementById('modal-user-avatar').src = currentUser.picture;
    document.getElementById('modal-user-name').innerText = currentUser.name;
    document.getElementById('modal-user-email').innerText = currentUser.email;

    if (currentUser.role === 'admin') {
        document.getElementById('admin-panel-btn').classList.remove('hidden');
    }
}

async function syncUserBackend(user) {
    await fetch('/api/users/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(user)
    });
}

function previewFile(input) {
    if (input.files && input.files[0]) {
        selectedFile = input.files[0];
        const reader = new FileReader();
        reader.onload = (e) => {
            document.getElementById('media-preview').src = e.target.result;
            document.getElementById('media-preview-container').classList.remove('hidden');
        };
        reader.readAsDataURL(selectedFile);
    }
}

function clearMediaPreview() {
    selectedFile = null;
    document.getElementById('media-preview-container').classList.add('hidden');
    document.getElementById('post-file-input').value = '';
}

async function submitPost() {
    const content = document.getElementById('post-input').value.trim();
    if (!content && !selectedFile) return alert('Isi postingan atau gambar terlebih dahulu!');
    if (!currentUser) return alert('Silakan login dengan Google terlebih dahulu!');

    let mediaUrl = null;
    if (selectedFile) {
        const formData = new FormData();
        formData.append('file', selectedFile);
        const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
        const uploadData = await uploadRes.json();
        mediaUrl = uploadData.url;
    }

    const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            user_id: currentUser.id,
            content,
            media_url: mediaUrl
        })
    });

    if (res.ok) {
        document.getElementById('post-input').value = '';
        clearMediaPreview();
        loadPosts();
    }
}

async function loadPosts() {
    try {
        const res = await fetch('/api/posts');
        const posts = await res.json();
        const feed = document.getElementById('posts-feed');
        
        if (!posts.length) {
            feed.innerHTML = '<div class="text-center py-10 text-gray-500">Belum ada postingan.</div>';
            return;
        }

        feed.innerHTML = posts.map(p => `
            <div class="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-3">
                <div class="flex items-center justify-between">
                    <div class="flex items-center space-x-3">
                        <img src="${p.user_picture || 'https://via.placeholder.com/40'}" class="w-9 h-9 rounded-full object-cover border border-gray-700">
                        <div>
                            <h4 class="font-bold text-sm text-gray-200">${p.user_name || 'Anonim'}</h4>
                            <span class="text-xs text-gray-500">${new Date(p.created_at).toLocaleString('id-ID')}</span>
                        </div>
                    </div>
                </div>
                ${p.content ? `<p class="text-sm text-gray-300 leading-relaxed">${p.content}</p>` : ''}
                ${p.media_url ? `<img src="${p.media_url}" class="rounded-xl w-full max-h-96 object-cover border border-gray-800">` : ''}
            </div>
        `).join('');
    } catch (e) {
        console.error(e);
    }
}

async function sendAiRequest() {
    const input = document.getElementById('ai-input');
    const text = input.value.trim();
    if (!text) return;

    const chatContainer = document.getElementById('ai-chat-messages');
    chatContainer.innerHTML += `<div class="bg-orange-500/20 text-orange-300 p-3 rounded-xl max-w-[85%] text-sm ml-auto">${text}</div>`;
    input.value = '';
    chatContainer.scrollTop = chatContainer.scrollHeight;

    if (text.startsWith('/image ')) {
        const prompt = text.replace('/image ', '');
        const res = await fetch('/api/ai/image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt })
        });
        const blob = await res.blob();
        const imgUrl = URL.createObjectURL(blob);
        chatContainer.innerHTML += `<div class="bg-gray-800 p-2 rounded-xl max-w-[85%] text-sm"><img src="${imgUrl}" class="rounded-lg w-full"></div>`;
    } else {
        const res = await fetch('/api/ai/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: text })
        });
        const data = await res.json();
        chatContainer.innerHTML += `<div class="bg-gray-800 text-gray-300 p-3 rounded-xl max-w-[85%] text-sm">${data.response}</div>`;
    }
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function setAiInput(val) {
    document.getElementById('ai-input').value = val;
}

function logout() {
    localStorage.removeItem('currentUser');
    location.reload();
}
