import test from 'node:test';
import assert from 'node:assert/strict';
import {gateway,normalizePhone} from '../sms.js';
test('normalizes Indian phone',()=>assert.equal(normalizePhone('+91 9164066966'),'9164066966'));
test('rejects invalid phone',()=>assert.throws(()=>normalizePhone('123'),/Invalid/));
test('demo does not call SMS provider',async()=>{const old=process.env.SMS_MODE;process.env.SMS_MODE='demo';const result=await gateway('9164066966','Test');assert.equal(result.status,'demo');if(old===undefined)delete process.env.SMS_MODE;else process.env.SMS_MODE=old});
test('SMSLocal success and error responses',async()=>{
 const vars=['SMS_MODE','SMS_PROVIDER','SMSLOCAL_API_KEY','SMSLOCAL_SENDER_ID','SMSLOCAL_DLT_TEMPLATE_ID'];const previous=Object.fromEntries(vars.map(k=>[k,process.env[k]]));const original=globalThis.fetch;
 try{Object.assign(process.env,{SMS_MODE:'live',SMS_PROVIDER:'smslocal',SMSLOCAL_API_KEY:'a'.repeat(32),SMSLOCAL_SENDER_ID:'ALERTS',SMSLOCAL_DLT_TEMPLATE_ID:'1207161234567890123'});let url;globalThis.fetch=async u=>{url=new URL(u);return {ok:true,text:async()=> '1987654321'}};assert.deepEqual(await gateway('9164066966','Hello'),{status:'submitted',id:'1987654321'});assert.equal(url.searchParams.get('number'),'9164066966');assert.equal(url.searchParams.get('key'),'a'.repeat(32));globalThis.fetch=async()=>({ok:true,text:async()=> '110'});await assert.rejects(gateway('9164066966','Hello'),/DLT template/)}finally{globalThis.fetch=original;for(const k of vars){if(previous[k]===undefined)delete process.env[k];else process.env[k]=previous[k]}}
});
test('phone provider sends through the Android gateway with no vendor key',async()=>{
 const vars=['SMS_MODE','SMS_PROVIDER','PHONE_GATEWAY_URL','PHONE_GATEWAY_TOKEN','PHONE_GATEWAY_DELAY_MS'];const previous=Object.fromEntries(vars.map(k=>[k,process.env[k]]));const original=globalThis.fetch;
 try{Object.assign(process.env,{SMS_MODE:'live',SMS_PROVIDER:'phone',PHONE_GATEWAY_URL:'http://192.168.1.50:8080/',PHONE_GATEWAY_TOKEN:'shared-secret',PHONE_GATEWAY_DELAY_MS:'0'});let captured;globalThis.fetch=async(u,o)=>{captured={url:String(u),options:o};return{ok:true,status:200,text:async()=>JSON.stringify({ok:true,id:'42'})}};
  assert.deepEqual(await gateway('9164066966','Hello'),{status:'submitted',id:'42'});
  assert.equal(captured.url,'http://192.168.1.50:8080/send');assert.equal(captured.options.headers['X-Gateway-Token'],'shared-secret');assert.deepEqual(JSON.parse(captured.options.body),{to:'+919164066966',body:'Hello'});
  globalThis.fetch=async()=>({ok:false,status:502,text:async()=>JSON.stringify({ok:false,error:'No SIM card'})});await assert.rejects(gateway('9164066966','Hello'),/No SIM card/)}finally{globalThis.fetch=original;for(const k of vars){if(previous[k]===undefined)delete process.env[k];else process.env[k]=previous[k]}}
});
test('textbelt free key and textbee providers',async()=>{
 const vars=['SMS_MODE','SMS_PROVIDER','TEXTBELT_KEY','TEXTBEE_API_KEY','TEXTBEE_DEVICE_ID'];const previous=Object.fromEntries(vars.map(k=>[k,process.env[k]]));const original=globalThis.fetch;
 try{Object.assign(process.env,{SMS_MODE:'live',SMS_PROVIDER:'textbelt',TEXTBELT_KEY:'textbelt'});let captured;globalThis.fetch=async(u,o)=>{captured={url:String(u),options:o};return{ok:true,status:200,json:async()=>({success:true,textId:777})}};
  assert.deepEqual(await gateway('9164066966','Hello'),{status:'submitted',id:'777'});
  assert.equal(captured.url,'https://textbelt.com/text');const form=new URLSearchParams(captured.options.body);assert.equal(form.get('phone'),'+919164066966');assert.equal(form.get('key'),'textbelt');assert.equal(form.get('message'),'Hello');
  globalThis.fetch=async()=>({ok:true,status:200,json:async()=>({success:false,error:'Out of quota'})});await assert.rejects(gateway('9164066966','Hello'),/Out of quota/);
  process.env.SMS_PROVIDER='textbee';process.env.TEXTBEE_API_KEY='tb-key';globalThis.fetch=async(u,o)=>{captured={url:String(u),options:o};return{ok:true,status:200,json:async()=>({data:{success:true,smsBatchId:'batch-1'}})}};
  assert.deepEqual(await gateway('9164066966','Hi'),{status:'submitted',id:'batch-1'});
  assert.equal(captured.url,'https://api.textbee.dev/api/v1/gateway/send-sms');assert.equal(captured.options.headers['x-api-key'],'tb-key');assert.deepEqual(JSON.parse(captured.options.body),{message:'Hi',recipients:['+919164066966']})}finally{globalThis.fetch=original;for(const k of vars){if(previous[k]===undefined)delete process.env[k];else process.env[k]=previous[k]}}
});
