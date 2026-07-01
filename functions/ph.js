// Cloudflare Worker - https://security.pages.dev/api/ph.js
// DSS Intelligence API Proxy & Telegram Bot Interface

const API_PASSWORD = '@dss/v1';
const TELEGRAM_BOT_TOKEN = 'YOUR_TELEGRAM_BOT_TOKEN';
const TELEGRAM_CHAT_ID = 'YOUR_CHAT_ID';

const TELEGRAM_BOTS = {
'@TruecallerBot': {token:'truecaller_bot_token',format:'name,carrier,location'},
'@PhoneLookupBot': {token:'phonelookup_bot_token',format:'full_intel'},
'@NumberTrackerBot': {token:'numbertracker_bot_token',format:'location'},
'@PhoneSpyBot': {token:'phonespy_bot_token',format:'social_accounts'},
'@SMSGrabberBot': {token:'smsgrabber_bot_token',format:'sms'},
'@CallRecorderBot': {token:'callrecorder_bot_token',format:'calls'},
'@WhatsAppSpyBot': {token:'whatsappspy_bot_token',format:'whatsapp'},
'@TelegramOSINTBot': {token:'telegramosint_bot_token',format:'telegram'},
'@FacebookLookupBot': {token:'facebooklookup_bot_token',format:'facebook'},
'@InstagramLookupBot': {token:'instagramlookup_bot_token',format:'instagram'},
'@PhoneSearchBot': {token:'phonesearch_bot_token',format:'public_records'},
'@SIMSwapBot': {token:'simswap_bot_token',format:'sim_status'},
'@LocationBot': {token:'location_bot_token',format:'gps'},
'@SS7LocateBot': {token:'ss7locate_bot_token',format:'ss7'},
'@PhoneTrackerProBot': {token:'phonetrackerpro_bot_token',format:'realtime'},
'@GlobalTrackBot': {token:'globaltrack_bot_token',format:'global'},
'@IMSI_SS7_Bot': {token:'imsi_ss7_bot_token',format:'imsi'}
};

const CORS_HEADERS = {
'Access-Control-Allow-Origin': '*',
'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
'Access-Control-Allow-Headers': 'Content-Type'
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

async function queryTelegramBot(botUsername, phoneNumber) {
try{
const botConfig = TELEGRAM_BOTS[botUsername];
if(!botConfig) return {success:false,error:'Unknown bot'};

const message = `/track ${phoneNumber}`;
const response = await fetch(`https://api.telegram.org/bot${botConfig.token}/sendMessage`, {
method:'POST',
headers:{'Content-Type':'application/json'},
body:JSON.stringify({
chat_id:TELEGRAM_CHAT_ID,
text:message,
parse_mode:'HTML'
})
});

if(!response.ok) return {success:false,error:'Bot request failed'};

await new Promise(r => setTimeout(r, 5000));

const updates = await fetch(`https://api.telegram.org/bot${botConfig.token}/getUpdates?offset=-1&timeout=10`);
const updatesData = await updates.json();

if(updatesData.ok && updatesData.result.length > 0){
const lastMessage = updatesData.result[updatesData.result.length - 1];
return {
success:true,
data:{
source:botUsername,
phone:phoneNumber,
response:lastMessage.message?.text || 'No response text',
timestamp:new Date().toISOString()
}
};
}

return {success:true,data:{source:botUsername,phone:phoneNumber,response:'Bot query submitted',status:'pending'}};
} catch(e){
return {success:false,error:e.message};
}
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

return {
success: response.ok,
data: data,
http_status: response.status,
source: name,
url: endpoint,
timestamp: new Date().toISOString()
};
} catch(e){
return {
success: false,
error: e.message,
source: name,
url: endpoint,
timestamp: new Date().toISOString()
};
}
}

async function handleTelegramBotRequest(botName, phoneNumber) {
return await queryTelegramBot(botName, phoneNumber);
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
result = await handleTelegramBotRequest(body.bot, body.number);
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
