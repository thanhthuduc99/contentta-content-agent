#!/usr/bin/env node
// Scrape github.com/trending?since=weekly → top 25 repo, filter AI/ML/LLM/agent.
// Output JSON ra stdout: [{owner, name, full_name, stars_total, stars_this_week, description, url, language}]
// No GITHUB_TOKEN cần.

const TRENDING_URL = 'https://github.com/trending?since=weekly';
const AI_KEYWORDS = /\b(AI|LLM|GPT|Claude|Gemini|agent|RAG|MCP|llama|mistral|embed|vector|fine[-\s]?tun|prompt|inference|transformer|diffusion|chatbot|copilot|autonomous)\b/i;

function strip(html) {
  return html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
             .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}

const res = await fetch(TRENDING_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } });
if (!res.ok) { console.error('trending fail', res.status); process.exit(1); }
const html = await res.text();

// Articles structure: <article class="Box-row"> ... </article>
const articles = html.split(/<article\s+class="Box-row">/).slice(1);
const repos = [];
for (const block of articles) {
  const end = block.indexOf('</article>');
  const body = end >= 0 ? block.slice(0, end) : block;
  // Find canonical repo link: href="/owner/name" where neither contains slash, skip /sponsors/ and /trending paths
  let owner = null, name = null;
  const linkRe = /href="\/([A-Za-z0-9][\w.-]*?)\/([A-Za-z0-9][\w.-]*?)"/g;
  let lm;
  while ((lm = linkRe.exec(body))) {
    const o = lm[1], n = lm[2];
    if (o === 'sponsors' || o === 'trending' || o === 'topics' || o === 'collections') continue;
    if (n === 'stargazers' || n === 'forks') continue;
    owner = o; name = n;
    break;
  }
  if (!owner || !name) continue;
  // description: <p class="col-9 ...">...</p>
  const descMatch = body.match(/<p\s+class="col-9[^"]*"[^>]*>([\s\S]*?)<\/p>/);
  const description = descMatch ? strip(descMatch[1]).replace(/\s+/g, ' ') : '';
  // language: <span itemprop="programmingLanguage">X</span>
  const langMatch = body.match(/programmingLanguage[^>]*>([^<]+)</);
  const language = langMatch ? langMatch[1].trim() : null;
  // stars total: first svg star icon followed by number — find pattern "octicon-star" .. then number
  const totalMatch = body.match(/octicon-star[^>]*><\/svg>\s*([\d,]+)/);
  const stars_total = totalMatch ? Number(totalMatch[1].replace(/,/g, '')) : null;
  // stars this period: "X stars this week" / "X stars today"
  const periodMatch = body.match(/([\d,]+)\s+stars?\s+this\s+(week|month|today)/i);
  const stars_this_week = periodMatch ? Number(periodMatch[1].replace(/,/g, '')) : null;

  const matchesAI = AI_KEYWORDS.test(description) || AI_KEYWORDS.test(name);
  repos.push({
    owner, name, full_name: `${owner}/${name}`,
    url: `https://github.com/${owner}/${name}`,
    description, language, stars_total, stars_this_week,
    ai_relevant: matchesAI,
  });
}

const aiRepos = repos.filter(r => r.ai_relevant);
console.log(JSON.stringify({
  total_scraped: repos.length,
  ai_filtered: aiRepos.length,
  ai_repos: aiRepos.slice(0, 12),
  all_repos: repos.slice(0, 25),
}, null, 2));
