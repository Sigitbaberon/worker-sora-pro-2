export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const method = req.method;

    // ========================
    // UTILS
    // ========================
    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

    const html = (body) =>
      new Response(body, { headers: { "Content-Type": "text/html; charset=utf-8" } });

    const hash = async (text) => {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
      return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
    };

    const getSession = async () => {
      const cookie = req.headers.get("Cookie") || "";
      const match = cookie.match(/session=([a-z0-9]+)/);
      if (!match) return null;
      return env.USERS_KV.get(`session:${match[1]}`);
    };

    // ========================
    // LOGIN / REGISTER PAGE
    // ========================
    if (url.pathname === "/") return html(loginPage);

    // ========================
    // DASHBOARD PAGE
    // ========================
    if (url.pathname === "/dashboard") {
      const email = await getSession();
      if (!email) return new Response("", { status: 302, headers: { Location: "/" } });
      return html(dashboardPage);
    }

    // ========================
    // AUTH API
    // ========================
    if (url.pathname === "/api/register" && method === "POST") {
      const { email, password } = await req.json();
      if (!email || !password) return json({ error: "Email dan password wajib diisi" }, 400);

      if (await env.USERS_KV.get(`user:${email}`))
        return json({ error: "Email sudah terdaftar" }, 400);

      await env.USERS_KV.put(`user:${email}`, JSON.stringify({
        email,
        password: await hash(password),
        coin: 5
      }));

      return json({ ok: true });
    }

    if (url.pathname === "/api/login" && method === "POST") {
      const { email, password } = await req.json();
      const raw = await env.USERS_KV.get(`user:${email}`);
      if (!raw) return json({ error: "Email / password salah" }, 401);

      const user = JSON.parse(raw);
      if (user.password !== await hash(password))
        return json({ error: "Email / password salah" }, 401);

      const sid = crypto.randomUUID().replace(/-/g, "");
      await env.USERS_KV.put(`session:${sid}`, email, { expirationTtl: 86400 });

      return new Response(JSON.stringify({ ok: true }), {
        headers: {
          "Set-Cookie": `session=${sid}; HttpOnly; Path=/`,
          "Content-Type": "application/json"
        }
      });
    }

    if (url.pathname === "/api/me") {
      const email = await getSession();
      if (!email) return json({ error: "Unauthorized" }, 401);
      const u = JSON.parse(await env.USERS_KV.get(`user:${email}`));
      return json({ email, coin: u.coin });
    }

    // ========================
    // SORA WATERMARK REMOVER API
    // ========================
    if (url.pathname === "/api/remove" && method === "POST") {
      const email = await getSession();
      if (!email) return json({ error: "Unauthorized" }, 401);

      const { video_url } = await req.json();
      if (!video_url || !video_url.startsWith("https://sora.chatgpt.com/")) {
        return json({ error: "URL tidak valid" }, 400);
      }

      const key = `user:${email}`;
      const user = JSON.parse(await env.USERS_KV.get(key));
      if (user.coin < 1) return json({ error: "Coin habis" }, 402);

      user.coin--;
      await env.USERS_KV.put(key, JSON.stringify(user));

      try {
        const res = await fetch("https://api.kie.ai/api/v1/jobs/createTask", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.SORA_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "sora-watermark-remover",
            input: { video_url }
          })
        });
        const data = await res.json();

        if (!data.data || !data.data.taskId)
          return json({ error: "Task gagal dibuat" }, 500);

        return json(data);
      } catch (err) {
        return json({ error: err.message }, 500);
      }
    }

    // ========================
    // STATUS API
    // ========================
    if (url.pathname === "/api/status") {
      const taskId = url.searchParams.get("taskId");
      if (!taskId) return json({ error: "taskId wajib" }, 400);

      try {
        const res = await fetch(`https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${taskId}`, {
          headers: { Authorization: `Bearer ${env.SORA_API_KEY}` }
        });
        const data = await res.json();
        return json(data);
      } catch (err) {
        return json({ error: err.message }, 500);
      }
    }

    return new Response("Worker Rax AI OK");
  }
};

// ========================
// LOGIN PAGE HTML
// ========================
const loginPage = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Rax AI Login</title>
<style>
body { font-family:sans-serif; display:flex; justify-content:center; align-items:center; min-height:100vh; background:#121212; color:#fff; }
.box { background:#1f1f1f; padding:30px; border-radius:10px; width:320px; box-shadow:0 0 20px rgba(0,0,0,0.5); }
input, button { width:100%; padding:10px; margin:8px 0; border-radius:5px; border:none; font-size:14px; }
button { background:#4CAF50; color:#fff; cursor:pointer; transition:0.2s; }
button:hover { background:#45a049; }
#msg { color:#f44336; margin-top:10px; font-size:14px; }
</style>
</head>
<body>
<div class="box">
<h2>Rax AI Login</h2>
<input id="email" placeholder="Email">
<input id="password" type="password" placeholder="Password">
<button onclick="login()">Login</button>
<button onclick="register()">Daftar</button>
<p id="msg"></p>
</div>

<script>
async function login() {
  const r = await fetch('/api/login', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({email:email.value,password:password.value})
  });
  const data = await r.json();
  if(r.ok){ location='/dashboard'; } else { msg.innerText = data.error; }
}

async function register() {
  const r = await fetch('/api/register', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({email:email.value,password:password.value})
  });
  const data = await r.json();
  msg.innerText = r.ok ? 'Daftar sukses, silakan login' : data.error;
}
</script>
</body>
</html>
`;

// ========================
// DASHBOARD PAGE HTML
// ========================
const dashboardPage = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Rax AI Dashboard</title>
<style>
body { font-family:Arial; background:#121212; color:#fff; margin:0; padding:0; }
header { background:#1f1f1f; padding:20px; text-align:center; font-size:24px; font-weight:bold; }
.container { max-width:600px; margin:20px auto; padding:20px; background:#1f1f1f; border-radius:10px; box-shadow:0 0 15px rgba(0,0,0,0.5); }
input { width:100%; padding:10px; margin:8px 0; border-radius:5px; border:none; font-size:14px; }
button { width:100%; padding:10px; margin:8px 0; border-radius:5px; border:none; background:#4CAF50; color:#fff; cursor:pointer; font-size:16px; transition:0.2s; }
button:hover { background:#45a049; }
#status { font-weight:bold; margin-top:10px; }
#status.loading { color:#ff9800; }
#status.success { color:#4caf50; }
#status.error { color:#f44336; }
video { width:100%; margin-top:20px; border-radius:8px; }
.user-info { margin-bottom:15px; font-size:14px; color:#ccc; }
</style>
</head>
<body>
<header>Rax AI Dashboard</header>
<div class="container">
<div class="user-info" id="user-info">Loading user info...</div>
<input id="video_url" placeholder="Tempel URL video Sora (sora.chatgpt.com)" />
<button id="remove-btn" onclick="removeWatermark()">Remove Watermark</button>
<button onclick="logout()">Logout</button>
<p id="status"></p>
<video id="video" controls></video>
</div>

<script>
const statusEl = document.getElementById("status");
const btn = document.getElementById("remove-btn");

async function getUser() {
  const r = await fetch('/api/me');
  const d = await r.json();
  if(d.error){ document.getElementById('user-info').innerText=d.error; return; }
  document.getElementById('user-info').innerText = 'User: ' + d.email + ' | Coin: ' + d.coin;
}

async function removeWatermark() {
  const videoUrl = document.getElementById("video_url").value;
  if(!videoUrl){ alert("Masukkan URL video!"); return; }

  statusEl.innerText = "Membuat task...";
  statusEl.className = "loading";
  btn.disabled = true;

  try {
    const res = await fetch("/api/remove", {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ video_url: videoUrl })
    });
    const data = await res.json();

    if(data.error){ 
      statusEl.innerText = data.error; 
      statusEl.className = "error";
      btn.disabled = false;
      return; 
    }

    if(!data.data || !data.data.taskId){
      statusEl.innerText = "Task gagal dibuat";
      statusEl.className = "error";
      btn.disabled = false;
      return;
    }

    pollTask(data.data.taskId);

  } catch(err){
    statusEl.innerText = "Error: " + err.message;
    statusEl.className = "error";
    btn.disabled = false;
  }
}

function pollTask(taskId){
  statusEl.innerText = "Memproses penghapusan watermark...";
  statusEl.className = "loading";

  const timer = setInterval(async () => {
    try {
      const res = await fetch("/api/status?taskId=" + taskId);
      const data = await res.json();

      if(data.error){ clearInterval(timer); statusEl.innerText=data.error; statusEl.className="error"; btn.disabled=false; return; }

      if(data.data.state==="success"){
        clearInterval(timer);
        const result = JSON.parse(data.data.resultJson);
        document.getElementById("video").src = result.resultUrls[0];
        statusEl.innerText = "Selesai (URL sudah dicopy)";
        statusEl.className = "success";
        navigator.clipboard.writeText(result.resultUrls[0]);
        btn.disabled = false;
        getUser(); // update coin
      }

      if(data.data.state==="fail"){
        clearInterval(timer);
        statusEl.innerText = "Gagal: " + data.data.failMsg;
        statusEl.className = "error";
        btn.disabled = false;
      }
    } catch(err){
      clearInterval(timer);
      statusEl.innerText = "Error: " + err.message;
      statusEl.className = "error";
      btn.disabled = false;
    }
  }, 3000);
}

function logout(){
  document.cookie = "session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
  location="/";
}

getUser();
</script>
</body>
</html>
`;
