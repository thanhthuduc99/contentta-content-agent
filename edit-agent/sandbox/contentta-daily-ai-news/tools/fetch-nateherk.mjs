#!/usr/bin/env node
// Resolve channel ID cho @nateherk rồi fetch RSS feed → 5 video mới nhất.
// Output JSON ra stdout: [{videoId, title, description, published, url}]

const HANDLE_URL = 'https://www.youtube.com/@nateherk';

async function resolveChannelId() {
  const res = await fetch(HANDLE_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  if (!res.ok) throw new Error(`channel page ${res.status}`);
  const html = await res.text();
  const m = html.match(/"channelId":"(UC[A-Za-z0-9_-]{22})"/)
        || html.match(/channel\/(UC[A-Za-z0-9_-]{22})/)
        || html.match(/"externalId":"(UC[A-Za-z0-9_-]{22})"/);
  if (!m) throw new Error('cannot find channelId');
  return m[1];
}

function decodeEntities(s) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#39;/g, "'");
}

function parseRssEntries(xml, limit = 5) {
  const entries = [];
  const re = /<entry>([\s\S]*?)<\/entry>/g;
  let m;
  while ((m = re.exec(xml)) && entries.length < limit) {
    const body = m[1];
    const videoId = body.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1];
    const title = body.match(/<title>([^<]+)<\/title>/)?.[1];
    const published = body.match(/<published>([^<]+)<\/published>/)?.[1];
    const description = body.match(/<media:description>([\s\S]*?)<\/media:description>/)?.[1] || '';
    if (!videoId) continue;
    entries.push({
      videoId,
      title: decodeEntities(title || ''),
      description: decodeEntities(description).trim(),
      published,
      url: `https://www.youtube.com/watch?v=${videoId}`,
    });
  }
  return entries;
}

const channelId = await resolveChannelId();
const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
const res = await fetch(rssUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
if (!res.ok) { console.error('rss fail', res.status); process.exit(1); }
const xml = await res.text();
const items = parseRssEntries(xml, 5);
console.log(JSON.stringify({ channelId, channel: '@nateherk', items }, null, 2));
