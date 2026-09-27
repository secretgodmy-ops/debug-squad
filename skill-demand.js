const SEARCH_ENDPOINT = process.env.JOB_SEARCH_ENDPOINT || 'https://api.bing.microsoft.com/v7.0/search';
const SEARCH_KEY = process.env.JOB_SEARCH_API_KEY;
const AI_ENDPOINT = process.env.AI_API_ENDPOINT || 'https://api.openai.com/v1/chat/completions';
const AI_KEY = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
const AI_MODEL = process.env.AI_MODEL || 'gpt-4o-mini';
const SEARCH_QUERY = process.env.JOB_SEARCH_QUERY || 'latest software developer job postings required skills India';
const MAX_RESULTS = Math.min(Math.max(Number(process.env.JOB_SEARCH_MAX_RESULTS) || 25, 5), 50);

const aliases = new Map([
  ['javascript', 'JavaScript'], ['js', 'JavaScript'], ['reactjs', 'React'], ['react.js', 'React'],
  ['nodejs', 'Node.js'], ['node.js', 'Node.js'], ['postgresql', 'PostgreSQL'], ['postgre sql', 'PostgreSQL'],
  ['mongodb', 'MongoDB'], ['mongo db', 'MongoDB'], ['amazon web services', 'AWS'],
  ['microsoft azure', 'Azure'], ['google cloud platform', 'Google Cloud'], ['kubernetes', 'Kubernetes'],
  ['springboot', 'Spring Boot'], ['spring boot', 'Spring Boot'], ['machine learning', 'Machine Learning'],
  ['artificial intelligence', 'Artificial Intelligence'], ['powerbi', 'Power BI'], ['power bi', 'Power BI']
]);

function normalizeSkill(value) {
  const cleaned = String(value || '').trim().replace(/\s+/g, ' ');
  if (!cleaned) return '';
  return aliases.get(cleaned.toLowerCase()) || cleaned.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function sourceText(item) {
  return `${item.name || ''} ${item.snippet || ''}`.replace(/<[^>]+>/g, ' ');
}

function skillMentioned(text, skill) {
  const terms = {
    React: ['react', 'react.js', 'reactjs'],
    JavaScript: ['javascript', 'js'],
    'Node.js': ['node.js', 'nodejs'],
    PostgreSQL: ['postgresql', 'postgre sql'],
    'Spring Boot': ['spring boot', 'springboot'],
    'Power BI': ['power bi', 'powerbi']
  }[skill] || [skill.toLowerCase()];
  const lower = text.toLowerCase();
  return terms.some((term) => lower.includes(term));
}

async function readJson(response, label) {
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch (_) { body = {}; }
  if (!response.ok) throw new Error(`${label} failed (${response.status}): ${body.error?.message || text.slice(0, 200)}`);
  return body;
}

async function searchJobs() {
  if (!SEARCH_KEY) throw new Error('JOB_SEARCH_API_KEY is not configured.');
  const url = new URL(SEARCH_ENDPOINT);
  url.searchParams.set('q', SEARCH_QUERY);
  url.searchParams.set('count', String(MAX_RESULTS));
  url.searchParams.set('freshness', 'Week');
  const response = await fetch(url, { headers: { 'Ocp-Apim-Subscription-Key': SEARCH_KEY } });
  const data = await readJson(response, 'Job search');
  const results = (data.webPages?.value || []).map((item) => ({
    name: String(item.name || '').slice(0, 300),
    snippet: String(item.snippet || '').slice(0, 1000),
    url: String(item.url || '')
  })).filter((item) => item.name || item.snippet);
  if (!results.length) throw new Error('Job search returned no usable results.');
  return results;
}

async function analyzeSkills(items) {
  if (!AI_KEY) throw new Error('AI_API_KEY or OPENAI_API_KEY is not configured.');
  const response = await fetch(AI_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${AI_KEY}` },
    body: JSON.stringify({
      model: AI_MODEL,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'Extract only concrete technical and workplace skills explicitly present in the supplied job-market text. Return JSON exactly as {"skills":["skill name"]}. Do not invent skills, job titles, companies, or counts.' },
        { role: 'user', content: JSON.stringify(items) }
      ]
    })
  });
  const data = await readJson(response, 'AI skill analysis');
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('AI returned no skill analysis.');
  let parsed;
  try { parsed = JSON.parse(content); } catch (_) { throw new Error('AI returned invalid JSON.'); }
  const skills = Array.isArray(parsed.skills) ? [...new Set(parsed.skills.map(normalizeSkill).filter(Boolean))] : [];
  if (!skills.length) throw new Error('AI returned no valid skills.');
  return skills;
}

async function refreshSkillDemand(SkillDemand) {
  const items = await searchJobs();
  const skills = await analyzeSkills(items);
  const corpus = items.map(sourceText);
  const sourceDate = new Date();
  const results = skills.map((skill) => {
    const demandCount = corpus.filter((text) => skillMentioned(text, skill)).length;
    return { skill_name: skill, demand_count: demandCount, source_date: sourceDate, last_updated: sourceDate,
      source_information: items.filter((item) => skillMentioned(sourceText(item), skill)).map((item) => ({ title: item.name, url: item.url })) };
  }).filter((result) => result.demand_count > 0);
  if (!results.length) throw new Error('AI skills did not match any retrieved source text.');

  await SkillDemand.bulkWrite(results.map((result) => ({
    updateOne: { filter: { skill_name: result.skill_name }, update: { $set: result }, upsert: true }
  })));
  await SkillDemand.deleteMany({ skill_name: { $nin: results.map((result) => result.skill_name) } });
  return { results, source_date: sourceDate, source_count: items.length };
}

module.exports = { refreshSkillDemand };