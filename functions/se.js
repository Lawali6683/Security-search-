// Cloudflare Worker - https://security.pages.dev/api/se.js
// DSS Email & Password Intelligence API Proxy

const API_PASSWORD = '@dss/v1';
const TELEGRAM_BOT_TOKEN = 'YOUR_TELEGRAM_BOT_TOKEN';
const TELEGRAM_CHAT_ID = 'YOUR_CHAT_ID';

const TELEGRAM_BOTS = {
'@EmailLookupBot':{token:'emaillookup_bot_token',format:'full_email_intel'},
'@LeakCheckBot':{token:'leakcheck_bot_token',format:'breach_check'},
'@HIBPBot':{token:'hibp_bot_token',format:'haveibeenpwned'},
'@EmailSpyBot':{token:'emailspy_bot_token',format:'social_accounts'},
'@PasswordCheckBot':{token:'passwordcheck_bot_token',format:'password_breach'}
};

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

async function queryTelegramBot(botUsername, email) {
try{
const botConfig = TELEGRAM_BOTS[botUsername];
if(!botConfig) return {success:false,error:'Unknown bot',breaches:[]};

const message = `/check ${email}`;
const response = await fetch(`https://api.telegram.org/bot${botConfig.token}/sendMessage`, {
method:'POST',
headers:{'Content-Type':'application/json'},
body:JSON.stringify({
chat_id:TELEGRAM_CHAT_ID,
text:message,
parse_mode:'HTML'
})
});

if(!response.ok) return {success:false,error:'Bot request failed',breaches:[]};

await new Promise(r => setTimeout(r, 5000));

const updates = await fetch(`https://api.telegram.org/bot${botConfig.token}/getUpdates?offset=-1&timeout=10`);
const updatesData = await updates.json();

if(updatesData.ok && updatesData.result.length > 0){
const lastMessage = updatesData.result[updatesData.result.length - 1];
const responseText = lastMessage.message?.text || '';
const breaches = extractBreaches(responseText);
return {
success:true,
data:{
source:botUsername,
email:email,
response:responseText,
breaches:breaches,
timestamp:new Date().toISOString()
},
breaches:breaches
};
}

return {success:true,data:{source:botUsername,email:email,response:'Bot query submitted',status:'pending',breaches:[]},breaches:[]};
} catch(e){
return {success:false,error:e.message,breaches:[]};
}
}

function extractBreaches(text) {
const breaches = [];
const lines = text.split('\n');
let currentBreach = null;
for(const line of lines){
if(line.includes('breach') || line.includes('leak') || line.includes('hack')){
if(currentBreach) breaches.push(currentBreach);
currentBreach = {name:line.trim(),date:'',data:''};
} else if(currentBreach && line.includes('date')){
currentBreach.date = line.split(':')[1]?.trim() || '';
} else if(currentBreach){
currentBreach.data += line + ' ';
}
}
if(currentBreach) breaches.push(currentBreach);
return breaches;
}

async function handleAPIRequest(endpoint, method, name) {
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

const breaches = [];
if(data && typeof data === 'object'){
if(data.breaches) breaches.push(...data.breaches);
if(data.breach) breaches.push(data.breach);
if(data.results && Array.isArray(data.results)) breaches.push(...data.results);
}

return {
success: response.ok,
data: data,
http_status: response.status,
source: name,
url: endpoint,
timestamp: new Date().toISOString(),
breaches: breaches
};
} catch(e){
return {
success: false,
error: e.message,
source: name,
url: endpoint,
timestamp: new Date().toISOString(),
breaches: []
};
}
}

async function handlePasswordCheck(password) {
try{
const response = await fetchWithRetry(`https://haveibeenpwned.com/api/v3/pwnedpassword/${encodeURIComponent(password)}`);
const count = parseInt(await response.text());
return {
success: !isNaN(count),
data: {
password: password.substring(0, 4) + '****',
exposed: count > 0,
breach_count: count || 0,
message: count > 0 ? `Password found in ${count} breach(es)` : 'Password not found in known breaches'
},
breaches: count > 0 ? [{name:'HaveIBeenPwned',count:count,date:'Unknown'}] : []
};
} catch(e){
return {success:false,error:e.message,breaches:[]};
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
result = await handleAPIRequest(body.target, body.method, body.name);
} else if(body.type === 'telegram'){
result = await queryTelegramBot(body.bot, body.email);
} else if(body.type === 'password'){
result = await handlePasswordCheck(body.password);
} else {
result = {success:false,error:'Invalid request type',breaches:[]};
}

return new Response(JSON.stringify(result), {
headers:{'Content-Type':'application/json',...CORS_HEADERS}
});
} catch(e){
return new Response(JSON.stringify({success:false,error:e.message,breaches:[]}), {
headers:{'Content-Type':'application/json',...CORS_HEADERS}
});
}
}

addEventListener('fetch', event => {
event.respondWith(handleRequest(event.request));
});
