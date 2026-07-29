// knowledge.js —— 知识库加载、上下文构建、轻量检索（无需向量库）
// 说明：知识库仅 33 组问答，体量极小。默认策略是"全量注入"——
// 直接把全部 Q&A 作为上下文交给 LLM，最稳、零检索误差、成本最低。
// 同时提供 retrieveTopK 做"兜底片段"与未来切换到向量库的平滑过渡。

const fs = require('fs');
const path = require('path');

const DATA_PATH = process.env.DATA_PATH || path.join(__dirname, 'data', 'qa.json');

let DATA = null;
function load() {
  if (DATA) return DATA;
  const raw = fs.readFileSync(DATA_PATH, 'utf8');
  DATA = JSON.parse(raw);
  return DATA;
}

// 构建注入给 LLM 的上下文文本（中英文都用同一份 Q&A，问题本身多为中文）
function buildContext() {
  const data = load();
  const lines = [];
  for (const p of data.qa_pairs) {
    const mod = p.module ? `[${p.module}] ` : '';
    lines.push(`${mod}${p.question}\n答：${p.answer}`);
  }
  return lines.join('\n\n');
}

// 轻量关键词检索：用于错误兜底时返回"最相关的一段"
function tokenize(text) {
  // 中英文混合：英文按词，中文按字（二元也行，这里用单字+英文词）
  const en = (text.match(/[a-zA-Z]+/g) || []).map(w => w.toLowerCase());
  const zh = (text.match(/[一-龥]/g) || []);
  return new Set([...en, ...zh]);
}

function score(question, pair) {
  const qTokens = tokenize(question);
  const docTokens = tokenize(pair.question + ' ' + pair.answer);
  let hit = 0;
  qTokens.forEach(t => { if (docTokens.has(t)) hit += 1; });
  return hit;
}

// 返回与问题最相关的若干条（用于 fallback / 未来 RAG）
function retrieveTopK(question, k = 3) {
  const data = load();
  const ranked = data.qa_pairs
    .map(p => ({ p, s: score(question, p) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, k)
    .filter(x => x.s > 0)
    .map(x => x.p);
  return ranked;
}

module.exports = { load, buildContext, retrieveTopK };
