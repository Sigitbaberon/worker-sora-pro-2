export default {
  async fetch(req, env) {
    const url = new URL(req.url)
    const path = url.pathname
    const method = req.method

    const json = (d, s = 200) =>
      new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json" } })

    const html = (b) =>
      new Response(b, { headers: { "Content-Type": "text/html; charset=utf-8" } })

    const hash = async (t) => {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t))
      return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("")
    }

    const getSession = async () => {
      const c = req.headers.get("Cookie") || ""
      const m = c.match(/session=([a-z0-9]+)/)
      if (!m) return null
      return env.USERS_KV.get(`session:${m[1]}`)
    }

    /* ================= UI LOGIN ================= */
    if (path === "/") {
      return html(`
<!DOCTYPE html>
<html>
<head>
<title>Rax AI</title>
<style>
body{
  background:#0f0f0f;color:#fff;font-family:Inter,system-ui;
  display:flex;align-items:center;justify-content:center;height:100vh
}
.card{
  width:320px;background:#161616;padding:24px;border-radius:14px;
  box-shadow:0 0 30px rgba(0,0,0,.6)
}
h2{text-align:center;margin-bottom:20px}
input,button{
  width:100%;padding:12px;border-radius:8px;border:none;margin:6px 0
}
input{background:#222;color:#fff}
button{background:#4f46e5;color:#fff;cursor:pointer}
button:hover{opacity:.9}
.msg{min-height:20px;text-align:center;font-size:13px;color:#aaa}
</style>
</head>
<body>
<div class="card">
<h2>Rax AI</h2>
<input id="email" placeholder="Email">
<input id="password" type="password" placeholder="Password">
<button onclick="login()">Login</button>
<button onclick="register()">Daftar</button>
<div class="msg" id="msg"></div>
</div>

<script>
async function login(){
  msg.innerText='Loading...'
  const r=await fetch('/api/login',{method:'POST',body:JSON.stringify({email:email.value,password:password.value})})
  r.ok?location='/dashboard':msg.innerText='Login gagal'
}
async function register(){
  msg.innerText='Loading...'
  const r=await fetch('/api/register',{method:'POST',body:JSON.stringify({email:email.value,password:password.value})})
  msg.innerText=r.ok?'Daftar berhasil':'Gagal daftar'
}
</script>
</body>
</html>
`)
    }

    /* ================= DASHBOARD ================= */
    if (path === "/dashboard") {
      const email = await getSession()
      if (!email) return new Response("", { status: 302, headers: { Location: "/" } })

      return html(`
<!DOCTYPE html>
<html>
<head>
<title>Dashboard Rax AI</title>
<style>
body{background:#0b0b0b;color:#fff;font-family:Inter,system-ui;padding:20px}
.container{max-width:520px;margin:auto}
.card{
  background:#151515;padding:20px;border-radius:16px;
  box-shadow:0 0 20px rgba(0,0,0,.5)
}
h2{margin:0 0 10px}
.info{font-size:13px;color:#aaa;margin-bottom:15px}
input,button{
  width:100%;padding:12px;border-radius:10px;border:none;margin:6px 0
}
input{background:#222;color:#fff}
button{background:#22c55e;color:#000;font-weight:600;cursor:pointer}
button:disabled{opacity:.5}
pre{
  background:#000;padding:12px;border-radius:10px;
  font-size:12px;overflow:auto
}
</style>
</head>
<body>
<div class="container">
<div class="card">
<h2>Watermark Remover</h2>
<div class="info" id="info">Loading...</div>
<input id="url" placeholder="Tempel URL video Sora">
<button id="btn" onclick="run()">Remove Watermark</button>
<pre id="out"></pre>
</div>
</div>

<script>
async function me(){
  const r=await fetch('/api/me')
  const d=await r.json()
  info.innerText=\`User: \${d.email} | Coin: \${d.coin}\`
}
me()

async function run(){
  btn.disabled=true
  out.innerText='Processing...'
  const r=await fetch('/api/remove',{method:'POST',body:JSON.stringify({video_url:url.value})})
  const d=await r.json()
  out.innerText=JSON.stringify(d,null,2)
  btn.disabled=false
}
</script>
</body>
</html>
`)
    }

    /* ================= AUTH ================= */
    if (path === "/api/register" && method === "POST") {
      const { email, password } = await req.json()
      if (await env.USERS_KV.get(`user:${email}`)) return json({}, 400)
      await env.USERS_KV.put(`user:${email}`, JSON.stringify({ email, password: await hash(password), coin: 5 }))
      return json({ ok: true })
    }

    if (path === "/api/login" && method === "POST") {
      const { email, password } = await req.json()
      const raw = await env.USERS_KV.get(`user:${email}`)
      if (!raw) return json({}, 401)
      const u = JSON.parse(raw)
      if (u.password !== await hash(password)) return json({}, 401)
      const sid = crypto.randomUUID().replace(/-/g, "")
      await env.USERS_KV.put(`session:${sid}`, email, { expirationTtl: 86400 })
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Set-Cookie": `session=${sid}; HttpOnly; Path=/` }
      })
    }

    if (path === "/api/me") {
      const email = await getSession()
      const u = JSON.parse(await env.USERS_KV.get(`user:${email}`))
      return json({ email, coin: u.coin })
    }

    /* ================= REMOVE ================= */
    if (path === "/api/remove" && method === "POST") {
      const email = await getSession()
      const key = `user:${email}`
      const u = JSON.parse(await env.USERS_KV.get(key))
      if (u.coin < 1) return json({ error: "Coin habis" }, 402)
      u.coin--
      await env.USERS_KV.put(key, JSON.stringify(u))

      const r = await fetch("https://api.kie.ai/api/v1/jobs/createTask", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.KIE_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "sora-watermark-remover",
          input: { video_url: (await req.json()).video_url }
        })
      })

      return json(await r.json())
    }

    return new Response("Rax AI Worker OK")
  }
      }
