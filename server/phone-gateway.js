// Sends real SMS through an Android phone on the same network.
// No vendor API key is used: the phone's own SIM sends the message.
const gatewayURL = () => String(process.env.PHONE_GATEWAY_URL || '').trim().replace(/\/+$/, '');
const token = () => String(process.env.PHONE_GATEWAY_TOKEN || '');
const delay = () => Math.max(0, Number(process.env.PHONE_GATEWAY_DELAY_MS ?? 1200));
const timeout = () => Math.max(1000, Number(process.env.PHONE_GATEWAY_TIMEOUT_MS ?? 30000));

function headers(extra = {}) {
  const h = { 'Content-Type': 'application/json', ...extra };
  if (token()) h['X-Gateway-Token'] = token();
  return h;
}

function requireURL() {
  const url = gatewayURL();
  if (!url) throw Error('PHONE_GATEWAY_URL is not set (for example http://192.168.1.50:8080)');
  if (!/^https?:\/\//i.test(url)) throw Error('PHONE_GATEWAY_URL must start with http:// or https://');
  return url;
}

function parseReply(text) {
  const raw = String(text || '').trim();
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return { id: raw.slice(0, 150) }; }
}

export async function phoneGatewayHealth() {
  const url = requireURL();
  const started = Date.now();
  let response;
  try {
    response = await fetch(url + '/health', { headers: headers(), signal: AbortSignal.timeout(Math.min(timeout(), 6000)) });
  } catch (e) {
    throw Error(`Cannot reach phone gateway at ${url}. Is the bridge running and on the same Wi-Fi? (${e.cause?.code || e.message})`);
  }
  const body = parseReply(await response.text());
  if (!response.ok) throw Error(`Phone gateway HTTP ${response.status}`);
  if (body.ok === false) throw Error(body.error || 'Phone gateway reported an error');
  return { reachable: true, latencyMs: Date.now() - started, url, device: body.device || null, port: body.port || null };
}

async function deliver(phone, body) {
  const url = requireURL();
  let response;
  try {
    response = await fetch(url + '/send', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ to: '+91' + phone, body }),
      signal: AbortSignal.timeout(timeout())
    });
  } catch (e) {
    throw Error(`Cannot reach phone gateway at ${url}. Is the bridge running and on the same Wi-Fi? (${e.cause?.code || e.message})`);
  }
  const text = await response.text();
  const result = parseReply(text);
  if (!response.ok || result.ok === false) throw Error(`Phone gateway: ${result.error || text.slice(0, 160) || 'HTTP ' + response.status}`);
  return { status: 'submitted', id: String(result.id ?? result.messageId ?? Date.now()).slice(0, 150) };
}

// One message at a time: a single SIM cannot send in parallel, and carriers
// rate-limit bursts. A module-level chain keeps sends ordered and spaced.
let chain = Promise.resolve();
let sentOnce = false;
export function sendViaPhone(phone, body) {
  const run = chain.then(async () => {
    if (sentOnce && delay()) await new Promise(r => setTimeout(r, delay()));
    sentOnce = true;
    return deliver(phone, body);
  });
  chain = run.catch(() => {});
  return run;
}
