export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;
        const method = request.method;

        const corsHeaders = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        };

        if (method === "OPTIONS") {
            return new Response(null, { headers: corsHeaders });
        }

        try {
            // GET POSTS
            if (path === "/api/posts" && method === "GET") {
                const { results } = await env.DB.prepare(`
                    SELECT posts.*, users.name as user_name, users.picture as user_picture
                    FROM posts
                    LEFT JOIN users ON posts.user_id = users.id
                    ORDER BY posts.created_at DESC LIMIT 30
                `).all();
                return Response.json(results, { headers: corsHeaders });
            }

            // CREATE POST
            if (path === "/api/posts" && method === "POST") {
                const { user_id, content, media_url } = await request.json();
                const id = crypto.randomUUID();
                await env.DB.prepare(
                    "INSERT INTO posts (id, user_id, content, media_url) VALUES (?, ?, ?, ?)"
                ).bind(id, user_id, content || "", media_url || "").run();
                return Response.json({ success: true, id }, { headers: corsHeaders });
            }

            // SYNC USER
            if (path === "/api/users/sync" && method === "POST") {
                const { id, email, name, picture, role } = await request.json();
                await env.DB.prepare(`
                    INSERT INTO users (id, email, name, picture, role)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(email) DO UPDATE SET name=?, picture=?, role=?
                `).bind(id, email, name, picture, role, name, picture, role).run();
                return Response.json({ success: true }, { headers: corsHeaders });
            }

            // UPLOAD TO R2
            if (path === "/api/upload" && method === "POST") {
                const formData = await request.formData();
                const file = formData.get("file");
                const key = `${Date.now()}-${file.name}`;
                await env.BUCKET.put(key, file.stream(), {
                    httpMetadata: { contentType: file.type }
                });
                return Response.json({ url: `/api/media/${key}` }, { headers: corsHeaders });
            }

            // SERVE R2 MEDIA
            if (path.startsWith("/api/media/")) {
                const key = path.replace("/api/media/", "");
                const object = await env.BUCKET.get(key);
                if (!object) return new Response("Not Found", { status: 404 });
                const headers = new Headers();
                object.writeHttpMetadata(headers);
                headers.set("etag", object.httpEtag);
                return new Response(object.body, { headers });
            }

            // WORKERS AI CHAT
            if (path === "/api/ai/chat" && method === "POST") {
                const { prompt } = await request.json();
                const aiRes = await env.AI.run("@cf/meta/llama-3-8b-instruct", {
                    messages: [
                        { role: "system", content: "Kamu adalah asisten AI ramah di aplikasi sosial media." },
                        { role: "user", content: prompt }
                    ]
                });
                return Response.json({ response: aiRes.response }, { headers: corsHeaders });
            }

            // WORKERS AI IMAGE
            if (path === "/api/ai/image" && method === "POST") {
                const { prompt } = await request.json();
                const imageBinary = await env.AI.run(
                    "@cf/stabilityai/stable-diffusion-xl-base-1.0",
                    { prompt }
                );
                return new Response(imageBinary, {
                    headers: { ...corsHeaders, "Content-Type": "image/jpeg" }
                });
            }

            return env.ASSETS ? env.ASSETS.fetch(request) : new Response("Not Found", { status: 404 });

        } catch (err) {
            return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
        }
    },

    // CRON TRIGGER BOT AUTOMATION
    async scheduled(event, env, ctx) {
        const { results: bots } = await env.DB.prepare("SELECT * FROM bots WHERE is_active = 1").all();
        for (const bot of bots) {
            const aiRes = await env.AI.run("@cf/meta/llama-3-8b-instruct", {
                messages: [{ role: "user", content: bot.persona_prompt }]
            });
            const postId = crypto.randomUUID();
            await env.DB.prepare("INSERT INTO posts (id, user_id, content, is_bot) VALUES (?, ?, ?, 1)")
                .bind(postId, bot.id, aiRes.response)
                .run();
        }
    }
};
