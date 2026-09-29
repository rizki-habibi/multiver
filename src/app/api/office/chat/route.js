import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDashboardAuthSession } from "@/lib/auth/dashboardSession";
import { getOfficeCharacter,getOfficeProvider,appendOfficeMessage } from "@/lib/office/store";
import { assertPublicUrlResolved } from "@/shared/utils/ssrfGuard.js";
export const runtime="nodejs",dynamic="force-dynamic",maxDuration=300;
async function owner(){const s=await getDashboardAuthSession((await cookies()).get("auth_token")?.value);return s?(s.githubId?String(s.githubId):"local-admin"):null}
export async function POST(request){
 const ownerId=await owner();if(!ownerId)return NextResponse.json({error:"Unauthorized"},{status:401});
 const b=await request.json().catch(()=>({})),id=String(b.characterId||""),message=String(b.message||"").trim();if(!id||!message)return NextResponse.json({error:"characterId and message are required"},{status:400});if(message.length>20000)return NextResponse.json({error:"Message too large"},{status:413});
 try{
  const {character,messages}=await getOfficeCharacter(ownerId,id),provider=await getOfficeProvider(ownerId,character.providerId);await assertPublicUrlResolved(provider.baseUrl);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),120000),abort=()=>controller.abort();request.signal.addEventListener("abort",abort,{once:true});
  const url=provider.apiType==="responses"?provider.baseUrl.replace(/\/+$/,"")+"/responses":provider.baseUrl.replace(/\/+$/,"").endsWith("/chat/completions")?provider.baseUrl:provider.baseUrl.replace(/\/+$/,"")+"/chat/completions";
  const payload=provider.apiType==="responses"?{model:provider.model,input:[{role:"system",content:character.systemPrompt},{role:"user",content:message}],stream:true}:{model:provider.model,messages:[{role:"system",content:character.systemPrompt},...messages.slice(-12),{role:"user",content:message}],stream:true};
  const headers={"Content-Type":"application/json","Accept":"text/event-stream","User-Agent":"Multiver-Office-Bot"};if(provider.apiKey)headers.Authorization="Bearer "+provider.apiKey;
  const upstream=await fetch(url,{method:"POST",headers,body:JSON.stringify(payload),signal:controller.signal,redirect:"error"});if(!upstream.ok){clearTimeout(timer);return NextResponse.json({error:"Provider request failed: HTTP "+upstream.status},{status:502})}
  const encoder=new TextEncoder(),decoder=new TextDecoder();let answer="";
  const stream=new ReadableStream({async start(c){try{const reader=upstream.body?.getReader();if(!reader)throw new Error("Provider returned no stream");while(true){const q=await reader.read();if(q.done)break;const chunk=decoder.decode(q.value,{stream:true});answer+=extractText(chunk);c.enqueue(encoder.encode(chunk))}if(answer.trim()){await appendOfficeMessage(ownerId,id,{role:"user",content:message});await appendOfficeMessage(ownerId,id,{role:"assistant",content:answer})}c.close()}catch(e){c.error(e)}finally{clearTimeout(timer);request.signal.removeEventListener("abort",abort)}} ,cancel(){controller.abort();clearTimeout(timer)}});
  return new Response(stream,{headers:{"Content-Type":"text/event-stream; charset=utf-8","Cache-Control":"no-cache, no-transform","Connection":"keep-alive","X-Accel-Buffering":"no"}});
 }catch(e){return NextResponse.json({error:e.name==="AbortError"?"Provider timeout":e.message||"Office provider failed"},{status:e.name==="AbortError"?504:502})}
}
function extractText(chunk){return chunk.split("\n").map(l=>{if(!l.startsWith("data:"))return "";const x=l.slice(5).trim();if(!x||x==="[DONE]")return "";try{const j=JSON.parse(x);return j.choices?.[0]?.delta?.content||j.output_text||j.delta?.text||""}catch{return ""}}).join("")}
