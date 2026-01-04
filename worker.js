export default {
  async fetch(request) {
    const API_KEY = "2dec405ee7e26b88cbe4afb2738867db";
    const url = new URL(request.url);

    // ================= CREATE TASK =================
    if (url.pathname === "/api/create" && request.method === "POST") {
      const body = await request.json();

      const payload = {
        model: "sora-2-pro-text-to-video",
        input: {
          prompt: body.prompt,
          aspect_ratio: body.aspect_ratio || "landscape",
          n_frames: body.n_frames || "10",
          size: body.size || "high",
          remove_watermark: true
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
  <title>Sora 2 Pro Worker</title>
  <style>
    body { font-family: Arial; max-width: 600px; margin: auto; padding: 20px; }
    textarea { width: 100%; height: 120px; }
    button { padding: 10px; margin-top: 10px; }
    video { width: 100%; margin-top: 20px; }
  </style>
</head>
<body>

<h3>Sora 2 Pro – Text to Video</h3>

<textarea id="prompt" placeholder="Masukkan prompt video..."></textarea>
<br>
<button onclick="generate()">Generate</button>

<p id="status"></p>
<video id="video" controls></video>

<script>
async function generate() {
  document.getElementById("status").innerText = "Membuat task...";

  const res = await fetch("/api/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: document.getElementById("prompt").value
    })
  });

  const data = await res.json();
  poll(data.data.taskId);
}

async function poll(taskId) {
  document.getElementById("status").innerText = "Menunggu hasil...";
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
