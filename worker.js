export default {
  async fetch(request) {
    const API_KEY = "2dec405ee7e26b88cbe4afb2738867db";
    const url = new URL(request.url);

    // ================= CREATE TASK =================
    if (url.pathname === "/api/create" && request.method === "POST") {
      const body = await request.json();

      if (!body.video_url) {
        return new Response(
          JSON.stringify({ error: "video_url wajib diisi" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      const payload = {
        model: "sora-watermark-remover",
        input: {
          video_url: body.video_url
        }
      };

      const res = await fetch(
        "https://api.kie.ai/api/v1/jobs/createTask",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        }
      );

      return new Response(await res.text(), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // ================= CHECK STATUS =================
    if (url.pathname === "/api/status") {
      const taskId = url.searchParams.get("taskId");

      if (!taskId) {
        return new Response(
          JSON.stringify({ error: "taskId wajib" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      const res = await fetch(
        `https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${taskId}`,
        {
          headers: {
            "Authorization": `Bearer ${API_KEY}`
          }
        }
      );

      return new Response(await res.text(), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // ================= FRONTEND =================
    return new Response(html, {
      headers: { "Content-Type": "text/html" }
    });
  }
};

const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Sora Watermark Remover</title>
  <style>
    body { font-family: Arial; max-width: 600px; margin: auto; padding: 20px; }
    input { width: 100%; padding: 8px; }
    button { padding: 10px; margin-top: 10px; }
    video { width: 100%; margin-top: 20px; }
  </style>
</head>
<body>

<h3>Sora Watermark Remover</h3>

<input id="video_url" placeholder="Tempel URL video Sora (sora.chatgpt.com)" />
<br>
<button onclick="generate()">Remove Watermark</button>

<p id="status"></p>
<video id="video" controls></video>

<script>
async function generate() {
  const videoUrl = document.getElementById("video_url").value;

  if (!videoUrl) {
    alert("Masukkan video URL!");
    return;
  }

  document.getElementById("status").innerText = "Membuat task...";

  const res = await fetch("/api/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ video_url: videoUrl })
  });

  const data = await res.json();
  poll(data.data.taskId);
}

async function poll(taskId) {
  document.getElementById("status").innerText = "Memproses penghapusan watermark...";

  const timer = setInterval(async () => {
    const res = await fetch("/api/status?taskId=" + taskId);
    const data = await res.json();

    if (data.data.state === "success") {
      clearInterval(timer);
      const result = JSON.parse(data.data.resultJson);
      document.getElementById("video").src = result.resultUrls[0];
      document.getElementById("status").innerText = "Selesai";
    }

    if (data.data.state === "fail") {
      clearInterval(timer);
      document.getElementById("status").innerText =
        "Gagal: " + data.data.failMsg;
    }
  }, 3000);
}
</script>

</body>
</html>
`;
