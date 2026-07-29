// server.js —— 简历问答 Agent 后端
// 架构：UI -> /api/ask -> 检索上下文 -> 构造 system prompt -> Deepseek 生成 -> 返回
// 鉴权：DEEPSEEK_API_KEY 仅在服务端读取，绝不暴露给前端。
// 检索：知识库极小，默认全量注入（无需向量库）。如需向量库，替换 knowledge.retrieveTopK 即可。

require('dotenv').config();
const express = require('express');
const path = require('path');
const OpenAI = require('openai');
const { buildSystemPrompt } = require('./prompts');
const { buildContext, retrieveTopK } = require('./knowledge');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash';
const DEEPSEEK_BASE = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';

// ---- 推荐问题（HR 高频点击，双语）----
// 全部对应知识库中存在回答的问题，确保点选不会"答不上来"
const SUGGESTED_QUESTIONS = [
  { zh: '介绍一下你自己', en: 'Tell me about yourself' },
  { zh: '你为什么选择做招聘 / HR？', en: 'Why did you choose recruiting / HR?' },
  { zh: '你觉得自己最大的优点是什么？', en: 'What is your biggest strength?' },
  { zh: '你有哪些还需要提升的地方？', en: 'What areas do you still want to improve?' },
  { zh: '你在腾讯 / BIGO 的实习做了什么？', en: 'What did you do during your Tencent / BIGO internships?' },
  { zh: '你是怎么用 AI 工具提升招聘效率的？', en: 'How do you use AI tools to improve recruiting?' },
  { zh: '你的职业规划是什么？', en: 'What is your career plan?' },
  { zh: '你的英语水平如何？能做英文面试吗？', en: 'How is your English? Can you interview in English?' },
  { zh: '你对新电信 / 澳洲的经历怎么看？', en: 'How do you view your Australia / New Tel experience?' },
  { zh: '你未来想做哪个方向的招聘？', en: 'Which recruiting area do you want to pursue?' },
];

// ---- Deepseek 客户端（OpenAI 兼容协议）----
let deepseek = null;
if (process.env.DEEPSEEK_API_KEY) {
  deepseek = new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: DEEPSEEK_BASE,
  });
} else {
  console.warn('[WARN] DEEPSEEK_API_KEY 未设置 —— 服务将以"降级模式"运行（仅返回知识库兜底片段，不调用 LLM）。');
}

// ---- 简单内存缓存（避免重复提问重复计费）----
const cache = new Map(); // key: question|lang -> { answer, ts }
const CACHE_TTL_MS = (parseInt(process.env.CACHE_TTL_MIN || '30', 10)) * 60 * 1000;

// ---- 极简按 IP 限流 ----
const hits = new Map(); // ip -> [timestamps]
const RATE_LIMIT = parseInt(process.env.RATE_LIMIT_PER_MIN || '20', 10);
function rateLimited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter(t => now - t < 60000);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > RATE_LIMIT;
}

// 全量上下文（启动时构建一次）
const FULL_CONTEXT = buildContext();

app.post('/api/ask', async (req, res) => {
  const { question, lang } = req.body || {};
  if (!question || !question.trim()) {
    return res.status(400).json({ error: 'question is required' });
  }
  const language = (lang === 'en' || lang === 'EN') ? 'en' : 'zh';
  const cacheKey = `${question.trim()}|${language}`;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'local';

  // 限流
  if (rateLimited(ip)) {
    const fallback = retrieveTopK(question, 1)[0];
    return res.json({
      answer: fallback
        ? `（提问过于频繁，先给你一段相关资料）${fallback.answer}`
        : '提问过于频繁，请稍后再试。',
      degraded: true,
    });
  }

  // 缓存命中
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return res.json({ answer: cached.answer, cached: true });
  }

  // 无 Key：降级返回最相关片段
  if (!deepseek) {
    const top = retrieveTopK(question, 1)[0];
    const msg = top
      ? `（演示模式：未配置 DEEPSEEK_API_KEY，以下为资料库中最相关的一段）\n${top.answer}`
      : '（演示模式：未配置 DEEPSEEK_API_KEY，暂无法生成回答。）';
    cache.set(cacheKey, { answer: msg, ts: Date.now() });
    return res.json({ answer: msg, degraded: true });
  }

  // 正常流程：调用 Deepseek
  try {
    const systemPrompt = buildSystemPrompt(language, FULL_CONTEXT);
    const completion = await deepseek.chat.completions.create({
      model: MODEL,
      temperature: 0.3,            // 压低幻觉
      max_tokens: 500,             // 先短答，再按需展开
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: question },
      ],
    });
    const answer = completion.choices[0].message.content;
    cache.set(cacheKey, { answer, ts: Date.now() });
    res.json({ answer });
  } catch (err) {
    console.error('[Deepseek error]', err.message);
    // 失败兜底：返回知识库最相关片段
    const top = retrieveTopK(question, 1)[0];
    const msg = top
      ? `（生成服务暂时不可用，先给你资料库中最相关的一段）${top.answer}`
      : '生成服务暂时不可用，请稍后再试。';
    res.json({ answer: msg, degraded: true });
  }
});

// 推荐问题（前端渲染为可点击标签）
app.get('/api/questions', (req, res) => {
  res.json({ questions: SUGGESTED_QUESTIONS });
});

// 健康检查
app.get('/health', (req, res) => res.json({ ok: true, model: MODEL, hasKey: !!deepseek }));

// 静态前端
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`简历问答 Agent 运行中: http://localhost:${PORT}  (model=${MODEL})`);
});
