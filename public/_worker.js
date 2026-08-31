export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const path = url.pathname;
        const method = request.method;

        const corsHeaders = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
            "Cache-Control": "no-store"
        };

        if (method === "OPTIONS") return new Response(null, { headers: corsHeaders });

        try {
            // GET POSTS WITH LIKES COUNT
            if (path === "/api/posts" && method === "GET") {
                const { results } = await env.DB.prepare(`
                    SELECT posts.*, users.name as user_name, users.picture as user_picture,
                    (SELECT COUNT(*) FROM likes WHERE likes.post_id = posts.id) as likes_count
                    FROM posts LEFT JOIN users ON posts.user_id = users.id
                    ORDER BY posts.created_at DESC LIMIT 30
                `).all();
                return Response.json(results || [], { headers: corsHeaders });
            }

            // CREATE POST
            if (path === "/api/posts" && method === "POST") {
                const { user_id, content, media_url } = await request.json();
                const id = crypto.randomUUID();
                await env.DB.prepare("INSERT INTO posts (id, user_id, content, media_url) VALUES (?, ?, ?, ?)")
                    .bind(id, user_id || "anon", content || "", media_url || "").run();
                return Response.json({ success: true, id }, { headers: corsHeaders });
            }

            // DELETE POST
            if (path.startsWith("/api/posts/") && method === "DELETE") {
                const id = path.split("/")[3];
                await env.DB.prepare("DELETE FROM posts WHERE id = ?").bind(id).run();
                return Response.json({ success: true }, { headers: corsHeaders });
            }

            // LIKE POST
            if (path.endsWith("/like") && method === "POST") {
                const postId = path.split("/")[3];
                const { user_id } = await request.json();
                const likeId = crypto.randomUUID();
                await env.DB.prepare("INSERT OR IGNORE INTO likes (id, post_id, user_id) VALUES (?, ?, ?)")
                    .bind(likeId, postId, user_id).run();
                return Response.json({ success: true }, { headers: corsHeaders });
            }

            // COMMENTS API
            if (path.includes("/comments") && method === "GET") {
                const postId = path.split("/")[3];
                const { results } = await env.DB.prepare(`
                    SELECT comments.*, users.name as user_name FROM comments
                    LEFT JOIN users ON comments.user_id = users.id
                    WHERE post_id = ? ORDER BY comments.created_at ASC
                `).bind(postId).all();
                return Response.json(results || [], { headers: corsHeaders });
            }

            if (path.includes("/comments") && method === "POST") {
                const postId = path.split("/")[3];
                const { user_id, content } = await request.json();
                const id = crypto.randomUUID();
                await env.DB.prepare("INSERT INTO comments (id, post_id, user_id, content) VALUES (?, ?, ?, ?)")
                    .bind(id, postId, user_id, content).run();
                return Response.json({ success: true }, { headers: corsHeaders });
            }

            // STORIES API
            if (path === "/api/stories" && method === "GET") {
                const { results } = await env.DB.prepare(`
                    SELECT stories.*, users.name as user_name FROM stories
                    LEFT JOIN users ON stories.user_id = users.id
                    WHERE datetime(expires_at) > datetime('now')
                    ORDER BY stories.created_at DESC
                `).all();
                return Response.json(results || [], { headers: corsHeaders });
            }

            if (path === "/api/stories" && method === "POST") {
                const { user_id, media_url, caption } = await request.json();
                const id = crypto.randomUUID();
                const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
                await env.DB.prepare("INSERT INTO stories (id, user_id, media_url, caption, expires_at) VALUES (?, ?, ?, ?, ?)")
                    .bind(id, user_id, media_url, caption || "", expiresAt).run();
                return Response.json({ success: true }, { headers: corsHeaders });
            }

            // R2 MEDIA UPLOAD
            if (path === "/api/upload" && method === "POST") {
                const formData = await request.formData();
                const file = formData.get("file");
                const key = `${Date.now()}-${file.name}`;
                await env.BUCKET.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
                return Response.json({ url: `/api/media/${key}` }, { headers: corsHeaders });
            }

            if (path.startsWith("/api/media/")) {
                const key = path.replace("/api/media/", "");
                const object = await env.BUCKET.get(key);
                if (!object) return new Response("Not Found", { status: 404 });
                const headers = new Headers();
                object.writeHttpMetadata(headers);
                return new Response(object.body, { headers });
            }

            // USER SYNC & DELETE
            if (path === "/api/users/sync" && method === "POST") {
                const { id, email, name, picture, role } = await request.json();
                await env.DB.prepare(`
                    INSERT INTO users (id, email, name, picture, role) VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(email) DO UPDATE SET name=?, picture=?, role=?
                `).bind(id, email, name, picture, role, name, picture, role).run();
                return Response.json({ success: true }, { headers: corsHeaders });
            }

            if (path.startsWith("/api/users/") && method === "DELETE") {
                const id = path.split("/")[3];
                await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(id).run();
                return Response.json({ success: true }, { headers: corsHeaders });
            }

            // ADMIN APIS
            if (path === "/api/admin/bots" && method === "GET") {
                const { results } = await env.DB.prepare("SELECT * FROM bots").all();
                return Response.json(results || [], { headers: corsHeaders });
            }

            if (path === "/api/admin/bots" && method === "POST") {
                const { name, persona_prompt } = await request.json();
                const id = crypto.randomUUID();
                await env.DB.prepare("INSERT INTO bots (id, name, persona_prompt) VALUES (?, ?, ?)")
                    .bind(id, name, persona_prompt).run();
                return Response.json({ success: true }, { headers: corsHeaders });
            }

            if (path.startsWith("/api/admin/bots/") && method === "DELETE") {
                const id = path.split("/")[4];
                await env.DB.prepare("DELETE FROM bots WHERE id = ?").bind(id).run();
                return Response.json({ success: true }, { headers: corsHeaders });
            }

            if (path === "/api/admin/users" && method === "GET") {
                const { results } = await env.DB.prepare("SELECT * FROM users").all();
                return Response.json(results || [], { headers: corsHeaders });
            }

            // WORKERS AI API
            if (path === "/api/ai/chat" && method === "POST") {
                const { prompt } = await request.json();
                const aiRes = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
                    messages: [
                        { role: "system", content: "Kamu adalah asisten AI cerdas di aplikasi Cloudflare Social." },
                        { role: "user", content: prompt || "Halo" }
                    ]
                });
                return Response.json({ response: aiRes?.response || JSON.stringify(aiRes) }, { headers: corsHeaders });
            }

            if (path === "/api/ai/image" && method === "POST") {
                const { prompt } = await request.json();
                const imageBinary = await env.AI.run("@cf/stabilityai/stable-diffusion-xl-base-1.0", { prompt: prompt || "cyberpunk city" });
                return new Response(imageBinary, { headers: { ...corsHeaders, "Content-Type": "image/jpeg" } });
            }

            return env.ASSETS ? env.ASSETS.fetch(request) : new Response("Not Found", { status: 404 });
        } catch (err) {
            return Response.json({ response: "Error: " + err.message }, { status: 500, headers: corsHeaders });
        }
    },

    // CRON TRIGGER AUTOMATION FOR BOTS
    async scheduled(event, env, ctx) {
        const { results: bots } = await env.DB.prepare("SELECT * FROM bots WHERE is_active = 1").all();
        for (const bot of bots) {
            const aiRes = await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
                messages: [{ role: "user", content: bot.persona_prompt }]
            });
            const postId = crypto.randomUUID();
            await env.DB.prepare("INSERT INTO posts (id, user_id, content, is_bot) VALUES (?, ?, ?, 1)")
                .bind(postId, bot.id, aiRes.response)
                .run();
        }
    }
};
