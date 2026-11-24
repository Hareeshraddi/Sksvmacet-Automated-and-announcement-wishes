import db,{render} from './db.js';
import {sendViaPhone} from './phone-gateway.js';
export function normalizePhone(value){const s=String(value??'').replace(/[\s()+-]/g,'');const n=s.startsWith('91')&&s.length===12?s.slice(2):s;if(!/^[6-9]\d{9}$/.test(n))throw Error('Invalid Indian mobile number');return n}
const SMSLOCAL_ERRORS={101:'Invalid SMSLocal API key',102:'Sender ID not approved',103:'Invalid recipient',104:'Invalid route',105:'Invalid message',106:'Spam blocked',107:'Promotional message blocked',108:'Insufficient credits',109:'Promotional sending hours restricted',110:'DLT template not approved or content mismatch',111:'SMS operator route unavailable'};
export async function gateway(phone,body){
 if(process.env.SMS_MODE!=='live')return {status:'demo',id:null};
 const provider=process.env.SMS_PROVIDER||'smslocal';
 if(provider==='smslocal'){
  const key=process.env.SMSLOCAL_API_KEY,sender=process.env.SMSLOCAL_SENDER_ID,templateid=process.env.SMSLOCAL_DLT_TEMPLATE_ID;
  if(!key||!sender||!templateid)throw Error('SMSLocal requires SMSLOCAL_API_KEY, SMSLOCAL_SENDER_ID and SMSLOCAL_DLT_TEMPLATE_ID');
  if(!/^[a-f\d]{32}$/i.test(key))throw Error('SMSLocal API key must be 32 hexadecimal characters');
  const route=process.env.SMSLOCAL_ROUTE||'1';if(!['1','2'].includes(route))throw Error('Invalid SMSLocal route');
  const url=new URL('https://app.smslocal.in/api/smsapi');url.search=new URLSearchParams({key,route,sender,number:phone,sms:body,templateid}).toString();
  const response=await fetch(url,{signal:AbortSignal.timeout(15000)});const result=(await response.text()).trim();
  if(!response.ok)throw Error(`SMSLocal HTTP ${response.status}: ${result.slice(0,120)}`);
  if(SMSLOCAL_ERRORS[result])throw Error(`SMSLocal: ${SMSLOCAL_ERRORS[result]} (${result})`);
  if(!/^\d+$/.test(result))throw Error('Unrecognized SMSLocal response: '+result.slice(0,120));
  return {status:'submitted',id:result};
 }
 if(provider==='phone')return sendViaPhone(phone,body);
 if(provider==='fast2sms'){
  const key=process.env.FAST2SMS_API_KEY;if(!key)throw Error('FAST2SMS_API_KEY missing');
  const params=new URLSearchParams({route:process.env.FAST2SMS_ROUTE||'q',numbers:phone,message:body});
  if(process.env.FAST2SMS_SENDER_ID)params.set('sender_id',process.env.FAST2SMS_SENDER_ID);
  if(process.env.FAST2SMS_DLT_TEMPLATE_ID)params.set('template_id',process.env.FAST2SMS_DLT_TEMPLATE_ID);
  const response=await fetch('https://www.fast2sms.com/dev/bulkV2',{method:'POST',headers:{authorization:key,'Content-Type':'application/x-www-form-urlencoded'},body:params,signal:AbortSignal.timeout(15000)});
  const json=await response.json().catch(()=>({}));if(!response.ok||json.return===false)throw Error(String(json.message||`Gateway HTTP ${response.status}`));
  return {status:'submitted',id:String(json.request_id||json.message||'').slice(0,150)};
 }
 if(provider==='textbelt'){
  const key=process.env.TEXTBELT_KEY||'textbelt';
  const params=new URLSearchParams({phone:'+91'+phone,message:body,key});
  if(process.env.TEXTBELT_SENDER)params.set('sender',process.env.TEXTBELT_SENDER);
  let response;try{response=await fetch('https://textbelt.com/text',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:params,signal:AbortSignal.timeout(20000)})}catch(e){throw Error('Textbelt unreachable: '+(e.cause?.code||e.message))}
  const json=await response.json().catch(()=>({}));
  if(!response.ok||json.success===false)throw Error('Textbelt: '+(json.error||`HTTP ${response.status}`));
  return {status:'submitted',id:String(json.textId??'')};
 }
 if(provider==='textbee'){
  const key=process.env.TEXTBEE_API_KEY;if(!key)throw Error('TEXTBEE_API_KEY missing');
  const payload={message:body,recipients:['+91'+phone]};
  if(process.env.TEXTBEE_DEVICE_ID)payload.deviceId=process.env.TEXTBEE_DEVICE_ID;
  let response;try{response=await fetch('https://api.textbee.dev/api/v1/gateway/send-sms',{method:'POST',headers:{'x-api-key':key,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(20000)})}catch(e){throw Error('textbee unreachable: '+(e.cause?.code||e.message))}
  const json=await response.json().catch(()=>({}));
  if(!response.ok||json?.data?.success===false)throw Error('textbee: '+(json?.message||json?.error||json?.data?.message||`HTTP ${response.status}`));
  return {status:'submitted',id:String(json?.data?.smsBatchId||json?.data?.successCount||'')};
 }
 throw Error('Unsupported SMS provider: '+provider);
}
export async function smsStatus(){
 const provider=process.env.SMS_PROVIDER||'smslocal';
 if(provider==='phone'){
  try{const h=await phoneGatewayHealth();return {provider,configured:true,reachable:true,url:h.url,summary:`Phone reachable - ${h.device||'phone'} - ${h.latencyMs} ms`}}
  catch(e){return {provider,configured:Boolean(process.env.PHONE_GATEWAY_URL),reachable:false,error:e.message}}
 }
 if(provider==='textbelt'){
  const key=process.env.TEXTBELT_KEY||'textbelt';
  try{const response=await fetch('https://textbelt.com/quota/'+encodeURIComponent(key),{signal:AbortSignal.timeout(8000)});const json=await response.json().catch(()=>({}));if(!response.ok||json.success===false)throw Error(json.error||`HTTP ${response.status}`);return {provider,configured:true,reachable:true,quotaRemaining:json.quotaRemaining,summary:`Textbelt ready - ${json.quotaRemaining} message(s) left${key==='textbelt'?' on the free key':''}`}}
  catch(e){return {provider,configured:true,reachable:false,error:'Textbelt: '+e.message}}
 }
 if(provider==='fast2sms'){
  const key=process.env.FAST2SMS_API_KEY;
  if(!key)return {provider,configured:false,reachable:false,error:'FAST2SMS_API_KEY is not set'};
  try{const response=await fetch('https://www.fast2sms.com/dev/wallet?authorization='+encodeURIComponent(key),{signal:AbortSignal.timeout(10000)});const json=await response.json().catch(()=>({}));if(!response.ok||json.return===false)throw Error(json.message||`HTTP ${response.status}`);return {provider,configured:true,reachable:true,wallet:json.wallet,summary:`Fast2SMS key valid - wallet Rs ${Number(json.wallet||0).toFixed(2)} - sending needs a one-time Rs 100 recharge`}}
  catch(e){return {provider,configured:true,reachable:false,error:'Fast2SMS: '+e.message}}
 }
 if(provider==='textbee'){
  const key=process.env.TEXTBEE_API_KEY;
  if(!key)return {provider,configured:false,reachable:false,error:'TEXTBEE_API_KEY is not set'};
  try{const response=await fetch('https://api.textbee.dev/api/v1/gateway/devices',{headers:{'x-api-key':key},signal:AbortSignal.timeout(10000)});const json=await response.json().catch(()=>({}));if(!response.ok)throw Error(json.message||`HTTP ${response.status}`);const devices=Array.isArray(json.data)?json.data:[];const device=devices.find(d=>d.enabled!==false);return {provider,configured:true,reachable:true,devices:devices.length,summary:device?`textbee linked - ${devices.length} device(s) - ${device.model||'phone'}`:'textbee account reachable but no phone is linked'}}
  catch(e){return {provider,configured:true,reachable:false,error:'textbee: '+e.message}}
 }
 return {provider,configured:false,reachable:false,message:`No connection check is available for ${provider}`};
}
export async function checkSMSLocalDelivery(messageId){
 if(process.env.SMS_MODE!=='live'||process.env.SMS_PROVIDER!=='smslocal')throw Error('Delivery checks require live SMSLocal mode');
 if(!process.env.SMSLOCAL_API_KEY)throw Error('SMSLOCAL_API_KEY missing');
 const url=new URL('https://app.smslocal.in/api/dlrapi');url.search=new URLSearchParams({key:process.env.SMSLOCAL_API_KEY,messageid:String(messageId)}).toString();
 const response=await fetch(url,{signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Delivery lookup HTTP '+response.status);
 const rows=await response.json();if(!Array.isArray(rows))throw Error('Invalid delivery report response');return rows;
}
export async function send(person,body,type,uniqueKey=null){let phone=normalizePhone(person.phone);if(uniqueKey&&db.prepare('SELECT id FROM messages WHERE unique_key=?').get(uniqueKey))return {skipped:true};const result=db.prepare('INSERT INTO messages(person_id,phone,body,type,status,unique_key) VALUES(?,?,?,?,?,?)').run(person.id||null,phone,body,type,'processing',uniqueKey);try{const outcome=await gateway(phone,body);db.prepare('UPDATE messages SET status=?,provider_id=? WHERE id=?').run(outcome.status,outcome.id,result.lastInsertRowid);return outcome}catch(e){db.prepare('UPDATE messages SET status=?,error=? WHERE id=?').run('failed',e.message,result.lastInsertRowid);return {status:'failed',error:e.message}}}
export async function sendTemplate(person,type,extra={},key=null){const template=db.prepare('SELECT body FROM templates WHERE type=?').get(type);if(!template)throw Error('Template missing');return send(person,render(template.body,person,extra),type,key)}
