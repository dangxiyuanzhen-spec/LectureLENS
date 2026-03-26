import express from "express";
import cors from "cors";
import multer from "multer";
import dotenv from "dotenv";
import OpenAI, { toFile } from "openai";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

const upload = multer({ storage: multer.memoryStorage() });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_KEY
});

const DEEPSEEK_KEY = process.env.DEEPSEEK_KEY;

app.get("/", (req, res) => {
  res.json({ ok: true, message: "LectureLens server running" });
});

app.post("/transcribe", upload.single("audio"), async (req, res) => {
  try {
    if (!process.env.OPENAI_KEY) {
      return res.status(500).json({ error: "OPENAI_KEY missing in .env" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No audio file uploaded" });
    }

    const file = await toFile(req.file.buffer, "lecture.webm", {
      type: req.file.mimetype || "audio/webm"
    });

    const response = await openai.audio.transcriptions.create({
      file,
      model: "whisper-1"
    });

    res.json({ text: response.text || "" });
  } catch (e) {
    console.error("Transcribe error:", e);
    res.status(500).json({ error: e.message || "Transcribe failed" });
  }
});

app.post("/analyze", async (req, res) => {
  try {
    if (!DEEPSEEK_KEY) {
      return res.status(500).json({ error: "DEEPSEEK_KEY missing in .env" });
    }

    const { text } = req.body || {};

    if (!text || !String(text).trim()) {
      return res.status(400).json({ error: "Text is empty" });
    }

    const prompt = `
请分析下面课堂内容，并且只返回 JSON：

{
  "translation": "",
  "summary": "",
  "terms": ["", ""],
  "exam_points": ["", ""]
}

要求：
1. translation：翻译成中文
2. summary：课堂重点总结
3. terms：提取 3-5 个专业术语
4. exam_points：提取 2-4 个可能考试重点

课堂内容：
${text}
`;

    const r = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${DEEPSEEK_KEY}`
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        temperature: 0.2,
        messages: [
          { role: "user", content: prompt }
        ]
      })
    });

    const data = await r.json();

    if (!r.ok) {
      console.error("DeepSeek error:", data);
      return res.status(r.status).json({
        error: data.error?.message || "Analyze failed"
      });
    }

    const content = data.choices?.[0]?.message?.content || "";

    try {
      return res.json(JSON.parse(content));
    } catch {
      const match = content.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          return res.json(JSON.parse(match[0]));
        } catch {}
      }

      return res.json({
        translation: content,
        summary: "",
        terms: [],
        exam_points: []
      });
    }
  } catch (e) {
    console.error("Analyze error:", e);
    res.status(500).json({ error: e.message || "Analyze failed" });
  }
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});