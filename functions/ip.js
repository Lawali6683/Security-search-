
const API_PASSWORD = '@dss/v1';

const CORS_HEADERS = {
'Access-Control-Allow-Origin':'*',
'Access-Control-Allow-Methods':'GET,POST,OPTIONS',
'Access-Control-Allow-Headers':'Content-Type'
};

const USER_AGENTS = [
'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36',
'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/604.1',
'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0'
];

async function fetchWithRetry(url, options, retries = 3) {
for(let i = 0; i < retries; i++){
try{
const response = await fetch(url, {
...options,
headers:{
...options?.headers,
'User-Agent': USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
'Accept': 'application/json, text/plain, */*',
'Accept-Language': 'en-US,en;q=0.9,ha;q=0.8',
'Cache-Control': 'no-cache',
'Pragma': 'no-cache'
},
timeout: 15000
});
if(response.ok) return response;
if(response.status === 429 || response.status === 503){
await new Promise(r => setTimeout(r, 2000 * (i + 1)));
continue;
}
return response;
} catch(e){
if(i === retries - 1) throw e;
await new Promise(r => setTimeout(r, 1000 * (i + 1)));
}
}
}

async function handleAPIRequest(endpoint, method, name, category) {
try{
const response = await fetchWithRetry(endpoint, {
method: method || 'GET',
headers:{
'Accept': 'application/json, text/plain, */*',
'Origin': 'https://security.pages.dev',
'Referer': 'https://security.pages.dev/'
}
});

let data;
const contentType = response.headers.get('content-type') || '';
if(contentType.includes('application/json')){
data = await response.json();
} else if(contentType.includes('text/html')){
const text = await response.text();
data = {html_preview: text.substring(0, 500)};
} else {
data = await response.text();
}

let lat = null, lon = null, country = null, city = null, isp = null;
let org = null, hostname = null, timezone = null, zip = null;
let abuseConfidenceScore = 0, totalReports = 0, ports = [];
let as = null, device_type = null, os = null, browser = null;

if(data && typeof data === 'object'){
lat = data.lat || data.latitude || null;
lon = data.lon || data.longitude || data.lng || null;
country = data.country || data.country_name || data.countryCode || null;
city = data.city || null;
isp = data.isp || data.org || data.asn_org || null;
org = data.org || data.organization || null;
hostname = data.hostname || data.host || data.reverse_dns || null;
timezone = data.timezone || data.time_zone || null;
zip = data.zip || data.postal || data.zipCode || null;
abuseConfidenceScore = data.abuseConfidenceScore || data.confidence_score || 0;
totalReports = data.totalReports || data.reports || data.num_reports || 0;
ports = data.ports || data.open_ports || [];
as = data.as || data.asn || data.autonomous_system_number || null;
device_type = data.device_type || data.device || null;
os = data.os || data.operating_system || null;
browser = data.browser || data.user_agent || null;
}

return {
success: response.ok,
data: {
lat, lon, country, city, isp, org, hostname,
timezone, zip, abuseConfidenceScore, totalReports,
ports, as, device_type, os, browser,
raw: typeof data === 'object' ? JSON.stringify(data).substring(0,500) : String(data).substring(0,500)
},
http_status: response.status,
source: name,
url: endpoint,
timestamp: new Date().toISOString(),
category: category
};
} catch(e){
return {
success: false,
error: e.message,
source: name,
url: endpoint,
timestamp: new Date().toISOString(),
category: category
};
}
}

async function handleRequest(request) {
if(request.method === 'OPTIONS'){
return new Response(null, {headers: CORS_HEADERS});
}

try{
const body = await request.json();

if(body.password !== API_PASSWORD){
return new Response(JSON.stringify({success:false,error:'Unauthorized'}), {
status:401,
headers:{'Content-Type':'application/json',...CORS_HEADERS}
});
}

let result;
if(body.type === 'api'){
result = await handleAPIRequest(body.target, body.method, body.name, body.category);
} else {
result = {success:false,error:'Invalid request type'};
}

return new Response(JSON.stringify(result), {
headers:{'Content-Type':'application/json',...CORS_HEADERS}
});
} catch(e){
return new Response(JSON.stringify({success:false,error:e.message}), {
headers:{'Content-Type':'application/json',...CORS_HEADERS}
});
}
}

addEventListener('fetch', event => {
event.respondWith(handleRequest(event.request));
});
