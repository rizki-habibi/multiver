import crypto from "node:crypto";
import { getAdapter } from "@/lib/db/driver.js";
import { parseJson, stringifyJson } from "@/lib/db/helpers/jsonCol.js";
const SCOPE="office",KEY_PREFIX="owner:";
function ownerKey(id){return KEY_PREFIX+String(id)}
function key(){const raw=String(process.env.ENCRYPTION_KEY||"").trim();if(!/^[0-9a-fA-F]{64}$/.test(raw))throw new Error("ENCRYPTION_KEY must be 64 hex characters");return Buffer.from(raw,"hex")}
function enc(v){if(!v)return "";const iv=crypto.randomBytes(12),c=crypto.createCipheriv("aes-256-gcm",key(),iv);const d=Buffer.concat([c.update(String(v),"utf8"),c.final()]);return [iv.toString("base64url"),c.getAuthTag().toString("base64url"),d.toString("base64url")].join(".")}
function dec(v){if(!v)return "";const [i,t,d]=String(v).split(".");const c=crypto.createDecipheriv("aes-256-gcm",key(),Buffer.from(i,"base64url"));c.setAuthTag(Buffer.from(t,"base64url"));return Buffer.concat([c.update(Buffer.from(d,"base64url")),c.final()]).toString("utf8")}
const empty=()=>({version:1,rooms:[],providers:[],characters:[],messages:{}});
async function get(id){const db=await getAdapter(),r=db.get("SELECT value FROM kv WHERE scope=? AND key=?",[SCOPE,ownerKey(id)]);return r?parseJson(r.value,empty()):empty()}
async function save(id,data){const db=await getAdapter();db.run("INSERT INTO kv(scope,key,value) VALUES(?,?,?) ON CONFLICT(scope,key) DO UPDATE SET value=excluded.value",[SCOPE,ownerKey(id),stringifyJson(data)]);return data}
const uuid=()=>crypto.randomUUID();
export async function officeView(id){const d=await get(id);return {...d,providers:d.providers.map(({encryptedApiKey,...p})=>({...p,apiKeyStored:Boolean(encryptedApiKey)}))}}
export async function mutateOffice(id,action,x={}){
 const d=await get(id);
 if(action==="create-room")d.rooms.push({id:uuid(),name:String(x.name||"Main Office").slice(0,80)});
 else if(action==="create-provider"){if(!x.baseUrl||!x.model)throw new Error("Provider base URL and model are required");d.providers.push({id:uuid(),name:String(x.name||"AI Provider").slice(0,80),baseUrl:String(x.baseUrl).trim(),model:String(x.model).trim(),apiType:x.apiType==="responses"?"responses":"chat",encryptedApiKey:enc(String(x.apiKey||"").trim())})}
 else if(action==="create-character")d.characters.push({id:uuid(),name:String(x.name||"Office Bot").slice(0,60),type:["Human","Pet","Bot","NPC","Custom"].includes(x.type)?x.type:"Bot",personality:String(x.personality||"Helpful and concise").slice(0,500),systemPrompt:String(x.systemPrompt||"You are a helpful assistant inside the Multiver Office.").slice(0,4000),providerId:String(x.providerId||""),roomId:String(x.roomId||d.rooms[0]?.id||"")});
 else if(action==="delete-room"){const id=String(x.id);d.rooms=d.rooms.filter(v=>v.id!==id);d.characters=d.characters.filter(v=>v.roomId!==id)}
 else if(action==="delete-provider"){const id=String(x.id);d.providers=d.providers.filter(v=>v.id!==id);d.characters=d.characters.map(v=>v.providerId===id?{...v,providerId:""}:v)}
 else if(action==="delete-character"){const id=String(x.id);d.characters=d.characters.filter(v=>v.id!==id);delete d.messages[id]}
 else throw new Error("Unknown Office action");
 await save(id,d);return officeView(id)
}
export async function getOfficeProvider(ownerId,providerId){const d=await get(ownerId),p=d.providers.find(v=>v.id===String(providerId));if(!p)throw new Error("Provider not found");return {...p,apiKey:dec(p.encryptedApiKey)}}
export async function getOfficeCharacter(ownerId,id){const d=await get(ownerId),c=d.characters.find(v=>v.id===String(id));if(!c)throw new Error("Character not found");return {character:c,messages:d.messages[c.id]||[]}}
export async function appendOfficeMessage(ownerId,id,m){const d=await get(ownerId);if(!d.characters.some(v=>v.id===String(id)))throw new Error("Character not found");d.messages[id]=(d.messages[id]||[]).concat({role:m.role,content:String(m.content).slice(0,20000),createdAt:new Date().toISOString()}).slice(-30);await save(ownerId,d)}
