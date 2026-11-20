#!/usr/bin/env node
// 渠订通 · 公司电脑本地打印代理（v1.2 安全版）
// 推荐：QDT_AGENT_TOKEN=安全中心生成的Token QDT_URL=http://服务器:8282 node print-agent.mjs
// 兼容：QDT_COOKIE='qdt_session=管理员Cookie' QDT_URL=http://服务器:8282 node print-agent.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const URL_BASE=(process.env.QDT_URL||'http://127.0.0.1:8282').replace(/\/$/,'');
const TOKEN=String(process.env.QDT_AGENT_TOKEN||'').trim();
const COOKIE=String(process.env.QDT_COOKIE||'').trim();
const PRINTER=process.env.QDT_PRINTER||'';
const CMD=process.env.QDT_PRINT_CMD||'';
const DELAY=Number(process.env.QDT_DELAY||3000);
if(!TOKEN&&!COOKIE){console.error('缺少 QDT_AGENT_TOKEN 或 QDT_COOKIE');process.exit(1)}
let cachedCsrf='';
async function headers(extra={}){
  if(TOKEN)return {'Content-Type':'application/json','x-qdt-agent-token':TOKEN,...extra};
  if(!cachedCsrf){const r=await fetch(URL_BASE+'/api/auth/me',{headers:{Cookie:COOKIE}});const j=await r.json();if(!r.ok||!j.csrf)throw new Error('Cookie 模式获取 CSRF 失败：'+(j.reason||j.error||r.status));cachedCsrf=j.csrf}
  return {'Content-Type':'application/json',Cookie:COOKIE,'x-qdt-csrf':cachedCsrf,...extra};
}
async function api(p,o={}){const h=await headers(o.headers||{});const r=await fetch(URL_BASE+p,{...o,headers:h});const t=await r.text();let j;try{j=JSON.parse(t)}catch{j=t}if(!r.ok)throw new Error(j?.reason||j?.error||('HTTP '+r.status));return j}
function printText(text,printer){return new Promise((resolve,reject)=>{const file=path.join(os.tmpdir(),'qudingtong-'+Date.now()+'.txt');fs.writeFileSync(file,text);const cmd=CMD||((process.platform==='win32'?'notepad /p ':'lp ')+(printer?' -d '+printer+' ':'')+JSON.stringify(file));const sh=spawn(cmd,{shell:true,stdio:'inherit'});sh.on('exit',code=>{try{fs.unlinkSync(file)}catch{};code===0?resolve():reject(new Error('打印命令退出 '+code))});sh.on('error',reject)})}
async function tick(){try{const j=await api('/api/admin/print/jobs/pending');for(const job of j.rows||[]){try{await printText(job.payload,PRINTER||job.printer);await api('/api/admin/print/jobs/'+job.id+'/status',{method:'POST',body:JSON.stringify({status:'已打印'})});console.log('已打印',job.order_no)}catch(e){await api('/api/admin/print/jobs/'+job.id+'/status',{method:'POST',body:JSON.stringify({status:'失败',error:String(e.message||e)})});console.error('打印失败',job.order_no,e.message)}}}catch(e){console.error('轮询失败',e.message)}finally{setTimeout(tick,DELAY)}}
console.log('渠订通打印代理启动',URL_BASE,'模式',TOKEN?'独立Token':'Cookie+CSRF','间隔',DELAY,'ms');tick();
