// Cloudflare Worker - https://security.pages.dev/api/nbn.js
// DSS NBN Intelligence API Proxy

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

async function handleAPIRequest(endpoint, method, name, isPhoto) {
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
} else if(contentType.includes('image')){
const buffer = await response.arrayBuffer();
const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
data = {photo_url: `data:${contentType};base64,${base64}`};
} else if(contentType.includes('text/html')){
const text = await response.text();
data = {html_preview: text.substring(0, 500)};
} else {
data = await response.text();
}

let photo_url = null;
if(isPhoto && response.ok){
photo_url = data.photo_url || data.url || null;
}

let full_name = null;
let date_of_birth = null;
let phone = null;
let address = null;
let email = null;

if(data && typeof data === 'object'){
full_name = data.full_name || data.fullName || data.name || data.surname + ' ' + data.first_name || null;
date_of_birth = data.date_of_birth || data.dob || data.birthDate || null;
phone = data.phone || data.phone_number || data.mobile || null;
address = data.address || data.residence_address || data.home_address || null;
email = data.email || data.email_address || null;
}

return {
success: response.ok,
data: data,
http_status: response.status,
source: name,
url: endpoint,
timestamp: new Date().toISOString(),
photo_url: photo_url,
isPhoto: isPhoto,
full_name: full_name,
date_of_birth: date_of_birth,
phone: phone,
address: address,
email: email
};
} catch(e){
return {
success: false,
error: e.message,
source: name,
url: endpoint,
timestamp: new Date().toISOString(),
isPhoto: isPhoto,
photo_url: null
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
result = await handleAPIRequest(body.target, body.method, body.name, body.isPhoto || false);
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
