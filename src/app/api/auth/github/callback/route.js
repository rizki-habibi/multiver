import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { setDashboardAuthCookie } from "@/lib/auth/dashboardSession";
import { GITHUB_STATE_COOKIE,exchangeGithubCode,fetchGithubIdentity,githubRoleForUserId,githubUsersAllowed,isGithubConfigured } from "@/lib/auth/github";
export async function GET(request){
 const fail=(message,status=400)=>NextResponse.json({error:message},{status,headers:{"Cache-Control":"no-store"}});
 try{if(!isGithubConfigured())return fail("GitHub OAuth is not configured",503);const u=new URL(request.url),code=u.searchParams.get("code"),state=u.searchParams.get("state"),store=await cookies(),expected=store.get(GITHUB_STATE_COOKIE)?.value;store.delete(GITHUB_STATE_COOKIE);if(!code||!state||!expected||!safeEqual(state,expected))return fail("Invalid GitHub OAuth state");const token=await exchangeGithubCode(request,code),user=await fetchGithubIdentity(token),githubId=String(user.id),role=githubRoleForUserId(githubId);if(role!=="admin"&&!githubUsersAllowed())return fail("This Multiver instance only permits its configured GitHub administrator.",403);await setDashboardAuthCookie(store,request,{role,authProvider:"github",githubId,githubLogin:String(user.login||""),githubName:String(user.name||""),githubAvatar:String(user.avatar_url||"")});return NextResponse.redirect(new URL("/dashboard",request.url))}catch(e){console.error("[AUTH][github] callback failed:",e?.message||e);return fail("GitHub login failed",502)}
}
function safeEqual(a,b){const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&crypto.timingSafeEqual(x,y)}
