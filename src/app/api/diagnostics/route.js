import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
const has = (...keys) => keys.some((key) => Boolean(process.env[key]));
function diagnostics() {
 const checks = [
  {name:"Aplikasi berjalan",status:"ok",detail:"Endpoint diagnostik merespons."},
  {name:"Konfigurasi database",status:has("DATABASE_URL","POSTGRES_URL","MYSQL_URL","DB_HOST")?"ok":"warning",detail:has("DATABASE_URL","POSTGRES_URL","MYSQL_URL","DB_HOST")?"Variabel koneksi ditemukan; koneksi aktual belum diuji.":"Variabel koneksi umum tidak ditemukan. Periksa environment hosting."},
  {name:"Konfigurasi provider AI",status:has("OPENAI_API_KEY","ANTHROPIC_API_KEY","GEMINI_API_KEY","GOOGLE_API_KEY","OPENROUTER_API_KEY")?"ok":"warning",detail:has("OPENAI_API_KEY","ANTHROPIC_API_KEY","GEMINI_API_KEY","GOOGLE_API_KEY","OPENROUTER_API_KEY")?"Variabel provider umum ditemukan; nilainya tidak ditampilkan.":"Variabel API umum tidak ditemukan; provider tersimpan internal mungkin tetap tersedia."},
  {name:"Mode produksi",status:process.env.NODE_ENV==="production"?"ok":"warning",detail:process.env.NODE_ENV==="production"?"Mode produksi aktif.":"Mode produksi tidak terdeteksi."}
 ];
 return {ok:checks.every((item)=>item.status==="ok"),summary:"Pemeriksaan dasar selesai.",checks,recovery:{attempted:false,detail:"Tidak ada perubahan server otomatis dilakukan."},timestamp:new Date().toISOString()};
}
export async function GET(){return NextResponse.json(diagnostics(),{headers:{"Cache-Control":"no-store"}});}
export async function POST(request){try{const body=await request.json();if(body?.action!=="check-and-recover")return NextResponse.json({error:"Aksi tidak valid."},{status:400});return NextResponse.json(diagnostics(),{headers:{"Cache-Control":"no-store"}});}catch{return NextResponse.json({error:"Permintaan tidak valid."},{status:400});}}
