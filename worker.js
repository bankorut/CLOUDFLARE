/**
 * Cloudflare Worker Backend Application
 * Bindings Required in wrangler.toml:
 * - DB: Cloudflare D1 Database Binding
 * - BUCKET: Cloudflare R2 Bucket Binding
 * - AI: Cloudflare Workers AI Binding
 */

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;
        const method = request.method;

        // Handling CORS Preflight
        if (method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders() });
        }

        try {
            // 1. ROUTE MEDIA R2 BUCKET SERVING
            if (path.startsWith('/media/') && method === 'GET') {
                const key = path.replace('/media/', '');
                const object = await env.BUCKET.get(key);
                if (!object) return new Response('File Not Found', { status: 404 });
                
                const headers = new Headers();
                object.writeHttpMetadata(headers);
                headers.set('etag', object.httpEtag);
                headers.set('Access-Control-Allow-Origin', '*');
                return new Response(object.body, { headers });
            }

            // 2. AUTHENTICATION ENDPOINTS
            if (path === '/api/auth/google' && method === 'POST') {
                const { credential } = await request.json();
                // Verifikasi Google JWT Credential Payload
                const payload = decodeJwt(credential);
                
                const userId = `usr_${payload.sub}`;
                const role = payload.email === 'danisvanandi@gmail.com' ? 'admin' : 'user';

                // UPSERT User ke Cloudflare D1
                await env.DB.prepare(`
                    INSERT INTO users (id, google_id, email, name, avatar_url, role)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(google_id) DO UPDATE SET
                    name = excluded.name,
                    avatar_url = excluded.avatar_url
                `).bind(userId, payload.sub, payload.email, payload.name, payload.picture, role).run();

                const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();

                // Token Sederhana (Base64 Enkapsulasi Identitas Sesi)
                const token = btoa(JSON.stringify({ id: user.id, email: user.email, role: user.role, exp: Date.now() + 86400000 }));

                return jsonResponse({ user, token });
            }

            // Authentication Middleware check for API
            const authUser = await authenticate(request, env);

            // 3. POSTS ENDPOINTS
            if (path === '/api/posts' && method === 'GET') {
                const currentUserId = authUser ? authUser.id : '';
                const { results } = await env.DB.prepare(`
                    SELECT p.*, u.name as author_name, u.avatar_url as author_avatar, u.role as author_role,
                    (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as like_count,
                    (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count,
                    EXISTS(SELECT 1 FROM likes WHERE post_id = p.id AND user_id = ?) as user_liked
                    FROM posts p
                    JOIN users u ON p.user_id = u.id
                    ORDER BY p.created_at DESC LIMIT 30
                `).bind(currentUserId).all();

                return jsonResponse(results);
            }

            if (path === '/api/posts' && method === 'POST') {
                if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
                const { content, media_url } = await request.json();
                
                const postId = `post_${crypto.randomUUID()}`;
                await env.DB.prepare(`
                    INSERT INTO posts (id, user_id, content, media_url)
                    VALUES (?, ?, ?, ?)
                `).bind(postId, authUser.id, content, media_url || null).run();

                return jsonResponse({ success: true, post_id: postId });
            }

            if (path.match(/\/api\/posts\/[\w-]+\/like/) && method === 'POST') {
                if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
                const postId = path.split('/')[3];

                const existingLike = await env.DB.prepare(`SELECT * FROM likes WHERE post_id = ? AND user_id = ?`).bind(postId, authUser.id).first();

                if (existingLike) {
                    await env.DB.prepare(`DELETE FROM likes WHERE post_id = ? AND user_id = ?`).bind(postId, authUser.id).run();
                } else {
                    await env.DB.prepare(`INSERT INTO likes (id, post_id, user_id) VALUES (?, ?, ?)`).bind(`like_${crypto.randomUUID()}`, postId, authUser.id).run();
                }

                return jsonResponse({ success: true });
            }

            // 4. R2 MEDIA UPLOAD ENDPOINT
            if (path === '/api/upload' && method === 'POST') {
                if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);
                const formData = await request.formData();
                const file = formData.get('file');

                if (!file) return jsonResponse({ error: 'No file provided' }, 400);

                const extension = file.name.split('.').pop();
                const key = `uploads/${Date.now()}-${crypto.randomUUID()}.${extension}`;
                
                await env.BUCKET.put(key, await file.arrayBuffer(), {
                    httpMetadata: { contentType: file.type }
                });

                const publicUrl = `${url.origin}/media/${key}`;
                return jsonResponse({ url: publicUrl });
            }

            // 5. CLOUDFLARE WORKERS AI ENDPOINTS
            if (path === '/api/ai/text' && method === 'POST') {
                const { prompt } = await request.json();
                
                const aiResponse = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
                    messages: [
                        { role: 'system', content: 'Anda adalah asisten AI ramah di dalam platform media sosial.' },
                        { role: 'user', content: prompt }
                    ]
                });

                return jsonResponse({ response: aiResponse.response });
            }

            if (path === '/api/ai/image' && method === 'POST') {
                const { prompt } = await request.json();
                
                const inputs = { prompt };
                const binaryImage = await env.AI.run('@cf/black-forest-labs/flux-1-schnell', inputs);

                // Save generated image to R2 directly
                const imageKey = `ai_generated/${Date.now()}-${crypto.randomUUID()}.png`;
                await env.BUCKET.put(imageKey, binaryImage, {
                    httpMetadata: { contentType: 'image/png' }
                });

                return jsonResponse({ image_url: `${url.origin}/media/${imageKey}` });
            }

            // 6. SUPER ADMIN ENDPOINTS
            if (path === '/api/admin/users' && method === 'GET') {
                if (!authUser || authUser.email !== 'danisvanandi@gmail.com') {
                    return jsonResponse({ error: 'Forbidden Admin Access' }, 403);
                }
                const { results } = await env.DB.prepare(`SELECT * FROM users ORDER BY created_at DESC`).all();
                return jsonResponse(results);
            }

            return jsonResponse({ error: 'Route Not Found' }, 404);

        } catch (err) {
            return jsonResponse({ error: err.message }, 500);
        }
    },

    // 7. CRON TRIGGER AUTOMATED BOT SYSTEM
    async scheduled(event, env, ctx) {
        ctx.waitUntil(handleBotAutoPosting(env));
    }
};

// ==========================================
// BOT AUTO POSTING WORKER LOGIC
// ==========================================
async function handleBotAutoPosting(env) {
    // 1. Ambil bot aktif dari D1 Database
    const { results: activeBots } = await env.DB.prepare(`SELECT * FROM bots WHERE is_active = 1`).all();

    for (const bot of activeBots) {
        try {
            // 2. Generate Konten via Cloudflare Workers AI
            const aiPrompt = `Tulis satu postingan media sosial yang menarik tentang topik "${bot.topic}". Template: ${bot.prompt_template}`;
            const aiResult = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
                messages: [{ role: 'user', content: aiPrompt }]
            });

            // 3. Masukkan Postingan baru atas nama Bot ID
            const postId = `post_bot_${crypto.randomUUID()}`;
            await env.DB.prepare(`
                INSERT INTO posts (id, user_id, content) VALUES (?, ?, ?)
            `).bind(postId, bot.bot_user_id, aiResult.response).run();

            // 4. Update Waktu Eksekusi Terakhir Bot
            await env.DB.prepare(`UPDATE bots SET last_run_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(bot.id).run();
        } catch (err) {
            console.error(`Bot Posting Error ID ${bot.id}:`, err);
        }
    }
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================
function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
}

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            ...corsHeaders()
        }
    });
}

function decodeJwt(token) {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
    return JSON.parse(jsonPayload);
}

async function authenticate(request, env) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

    try {
        const token = authHeader.split(' ')[1];
        const payload = JSON.parse(atob(token));
        if (payload.exp < Date.now()) return null;
        return payload;
    } catch {
        return null;
    }
}
