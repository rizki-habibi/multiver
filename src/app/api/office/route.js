import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDashboardAuthSession } from "@/lib/auth/dashboardSession";
import { mutateOffice, officeView } from "@/lib/office/store";
async function owner(){const s=await getDashboardAuthSession((await cookies()).get("auth_token")?.value);return s?(s.githubId?String(s.githubId):"local-admin"):null}
export async function GET(){const id=await owner();if(!id)return NextResponse.json({error:"Unauthorized"},{status:401});try{return NextResponse.json(await officeView(id),{headers:{"Cache-Control":"no-store"}})}catch(e){return NextResponse.json({error:"Office storage unavailable"},{status:500})}}
export async function POST(request){const id=await owner();if(!id)return NextResponse.json({error:"Unauthorized"},{status:401});try{const b=await request.json();return NextResponse.json(await mutateOffice(id,b.action,b),{status:201})}catch(e){return NextResponse.json({error:e.message||"Office request failed"},{status:400})}}
