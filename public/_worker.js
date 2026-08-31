export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const path = url.pathname;
        const method = request.method;

        const corsHeaders = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
            "Cache-Control": "no-store, no-cache, must-revalidate"
        };

        if (method === "OPTIONS") return new Response(null, { headers: corsHeaders });

        try {
            if (path === "/api/posts" && method === "GET") {
                const { results } = await env.DB.prepare(`
                    SELECT posts.*, users.name as user_name
                    FROM posts LEFT JOIN users ON posts.user_id = users.id
                    ORDER BY posts.created_at DESC LIMIT 30
                `).all();
                return Response.json(results || [], { headers: corsHeaders });
            }

            if (path === "/api/posts" && method === "POST") {
                const { user_id, content } = await request.json();
                const id = crypto.randomUUID();
                await env.DB.prepare("INSERT INTO posts (id, user_id, content) VALUES (?, ?, ?)")
                    .bind(id, user_id || "anon", content || "").run();
                return Response.json({ success: true, id }, { headers: corsHeaders });
            }

            if (path === "/api/ai/chat" && method === "POST") {
                const { prompt } = await request.json();
                
                if (!env.AI) {
                    return Response.json({ response: "Error: Binding AI belum terhubung di Cloudflare Dashboard." }, { headers: corsHeaders });
                }

                try {
                    const aiRes = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
                        messages: [
                            { role: "system", content: "Kamu adalah asisten AI ramah dalam bahasa Indonesia." },
                            { role: "user", content: prompt || "Halo" }
                        ]
                    });

                    const reply = aiRes?.response || (typeof aiRes === 'string' ? aiRes : JSON.stringify(aiRes));
                    return Response.json({ response: reply }, { headers: corsHeaders });
                } catch (aiErr) {
                    return Response.json({ response: "Error Workers AI: " + aiErr.message }, { headers: corsHeaders });
                }
            }

            if (path === "/api/ai/image" && method === "POST") {
                const { prompt } = await request.json();
                const imageBinary = await env.AI.run("@cf/stabilityai/stable-diffusion-xl-base-1.0", { prompt: prompt || "cyberpunk city" });
                return new Response(imageBinary, { headers: { ...corsHeaders, "Content-Type": "image/jpeg" } });
            }

            return env.ASSETS.fetch(request);
        } catch (err) {
            return Response.json({ response: "Error Server: " + err.message }, { status: 500, headers: corsHeaders });
        }
    }
};
