export default {
  async fetch(req, env) {
    const url = new URL(req.url)
    const path = url.pathname
    const method = req.method

    // ========================
    // UTIL
    // ========================
    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } })

    const html = (body) =>
      new Response(body, { headers: { "Content-Type": "text/html; charset=utf-8" } })

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
    // UI
    // ========================
    if (path === "/") {
      return html(`
<!DOCTYPE html>
<html>
<head>
<title>Rax AI Login</title>
<style>
body{font-family:sans-serif;background:#111;color:#fff;display:flex;justify-content:center;align-items:center;height:100vh}
.box{width:300px}
input,button{width:100%;margin:5px 0;padding:10px}
</style>
</head>
<body>
<div class="box">
<h2>Rax AI</h2>
<input id="email" placeholder="Email">
<input id="password" type="password" placeholder="Password">
<button onclick="login()">Login</button>
<button onclick="register()">Daftar</button>
<p id="msg"></p>
</div>

<script>
async function login(){
  const r = await fetch('/api/login',{method:'POST',body:JSON.stringify({
    email:email.value,password:password.value
  })})
  if(r.ok) location='/dashboard'
  else msg.innerText='Login gagal'
}
async function register(){
  const r = await fetch('/api/register',{method:'POST',body:JSON.stringify({
    email:email.value,password:password.value
  })})
  msg.innerText = r.ok ? 'Daftar sukses, silakan login' : 'Gagal daftar'
}
</script>
</body>
</html>
`)
    }

    if (path === "/dashboard") {
      const email = await getSession()
      if (!email) return new Response("", { status: 302, headers: { Location: "/" } })

      return html(`
<!DOCTYPE html>
<html>
<head>
<title>Dashboard Rax AI</title>
<style>
body{font-family:sans-serif;background:#0b0b0b;color:#fff;padding:20px}
input,button{padding:10px;width:100%}
.box{max-width:500px;margin:auto}
</style>
</head>
<body>
<div class="box">
<h2>Watermark Remover</h2>
<p id="info">Loading...</p>
<input id="url" placeholder="URL video Sora">
<button onclick="run()">Remove Watermark</button>
<pre id="out"></pre>
</div>

<script>
async function me(){
  const r = await fetch('/api/me')
  const d = await r.json()
  info.innerText = 'User: '+d.email+' | Coin: '+d.coin
}
me()

async function run(){
  const r = await fetch('/api/remove',{method:'POST',body:JSON.stringify({
    video_url:url.value
  })})
  const d = await r.json()
  out.innerText = JSON.stringify(d,null,2)
}
</script>
</body>
</html>
`)
    }

    // ========================
    // AUTH API
    // ========================
    if (path === "/api/register" && method === "POST") {
      const { email, password } = await req.json()
      if (!email || !password) return json({ error: "Invalid" }, 400)

      if (await env.USERS_KV.get(`user:${email}`))
        return json({ error: "Exists" }, 400)

      await env.USERS_KV.put(`user:${email}`, JSON.stringify({
        email,
        password: await hash(password),
        coin: 5
      }))

      return json({ ok: true })
    }

    if (path === "/api/login" && method === "POST") {
      const { email, password } = await req.json()
      const raw = await env.USERS_KV.get(`user:${email}`)
      if (!raw) return json({ error: "Invalid" }, 401)

      const user = JSON.parse(raw)
      if (user.password !== await hash(password))
        return json({ error: "Invalid" }, 401)

      const sid = crypto.randomUUID().replace(/-/g, "")
      await env.USERS_KV.put(`session:${sid}`, email, { expirationTtl: 86400 })

      return new Response(JSON.stringify({ ok: true }), {
        headers: {
          "Set-Cookie": `session=${sid}; HttpOnly; Path=/`,
          "Content-Type": "application/json"
        }
      })
    }

    if (path === "/api/me") {
      const email = await getSession()
      if (!email) return json({ error: "Unauthorized" }, 401)
      const u = JSON.parse(await env.USERS_KV.get(`user:${email}`))
      return json({ email, coin: u.coin })
    }

    // ========================
    // SORA WATERMARK REMOVER
    // ========================
    if (path === "/api/remove" && method === "POST") {
      const email = await getSession()
      if (!email) return json({ error: "Unauthorized" }, 401)

      const { video_url } = await req.json()
      const key = `user:${email}`
      const user = JSON.parse(await env.USERS_KV.get(key))
      if (user.coin < 1) return json({ error: "Coin habis" }, 402)

      user.coin--
      await env.USERS_KV.put(key, JSON.stringify(user))

      const r = await fetch("https://api.kie.ai/api/v1/jobs/createTask", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.KIE_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "sora-watermark-remover",
          input: { video_url }
        })
      })

      return json(await r.json())
    }

    return new Response("Rax AI Worker OK")
  }
}
