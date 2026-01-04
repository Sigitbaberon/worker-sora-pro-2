export default {
  async fetch(req, env) {
    const url = new URL(req.url)
    const path = url.pathname
    const method = req.method

    // ========================
    // UTILS
    // ========================
    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } })

    const hash = async (text) => {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
      return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("")
    }

    const getSession = async () => {
      const cookie = req.headers.get("Cookie") || ""
      const match = cookie.match(/session=([a-z0-9]+)/)
      if (!match) return null
      return env.USERS_KV.get(`session:${match[1]}`)
    }

    // ========================
    // AUTH
    // ========================
    if (path === "/api/register" && method === "POST") {
      const { email, password } = await req.json()
      if (!email || !password) return json({ error: "Invalid input" }, 400)

      const key = `user:${email}`
      if (await env.USERS_KV.get(key)) return json({ error: "User exists" }, 400)

      await env.USERS_KV.put(key, JSON.stringify({
        email,
        password: await hash(password),
        coin: 5
      }))

      return json({ success: true })
    }

    if (path === "/api/login" && method === "POST") {
      const { email, password } = await req.json()
      const userRaw = await env.USERS_KV.get(`user:${email}`)
      if (!userRaw) return json({ error: "Invalid login" }, 401)

      const user = JSON.parse(userRaw)
      if (user.password !== await hash(password)) return json({ error: "Invalid login" }, 401)

      const sessionId = crypto.randomUUID().replace(/-/g, "")
      await env.USERS_KV.put(`session:${sessionId}`, email, { expirationTtl: 86400 })

      return new Response(JSON.stringify({ success: true }), {
        headers: {
          "Set-Cookie": `session=${sessionId}; HttpOnly; Path=/; Max-Age=86400`,
          "Content-Type": "application/json"
        }
      })
    }

    if (path === "/api/me") {
      const email = await getSession()
      if (!email) return json({ error: "Unauthorized" }, 401)

      const user = JSON.parse(await env.USERS_KV.get(`user:${email}`))
      return json({ email, coin: user.coin })
    }

    // ========================
    // WATERMARK REMOVER
    // ========================
    if (path === "/api/remove" && method === "POST") {
      const email = await getSession()
      if (!email) return json({ error: "Unauthorized" }, 401)

      const { video_url } = await req.json()
      if (!video_url) return json({ error: "Missing video_url" }, 400)

      const key = `user:${email}`
      const user = JSON.parse(await env.USERS_KV.get(key))
      if (user.coin < 1) return json({ error: "Coin habis" }, 402)

      // potong coin
      user.coin -= 1
      await env.USERS_KV.put(key, JSON.stringify(user))

      const res = await fetch("https://api.kie.ai/api/v1/jobs/createTask", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.KIE_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "sora-watermark-remover",
          input: { video_url }
        })
      })

      const data = await res.json()
      return json(data)
    }

    if (path === "/api/status") {
      const email = await getSession()
      if (!email) return json({ error: "Unauthorized" }, 401)

      const taskId = url.searchParams.get("taskId")
      if (!taskId) return json({ error: "Missing taskId" }, 400)

      const res = await fetch(
        `https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${taskId}`,
        { headers: { "Authorization": `Bearer ${env.KIE_API_KEY}` } }
      )

      return json(await res.json())
    }

    // ========================
    // FALLBACK
    // ========================
    return new Response("Rax AI Worker OK", { status: 200 })
  }
        }
