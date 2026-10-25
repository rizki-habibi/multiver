"use client";
import {usePathname} from "next/navigation";
import {useState} from "react";
const MODEL_URL="https://modelviewer.dev/shared-assets/models/RobotExpressive.glb";
export default function HomeRecoveryPanel(){
 const path=usePathname(),[busy,setBusy]=useState(false),[report,setReport]=useState(null);
 async function check(){setBusy(true);try{const r=await fetch("/api/diagnostics",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"check-and-recover"}),cache:"no-store"});setReport(await r.json());}catch{setReport({summary:"Tidak dapat menghubungi layanan diagnostik.",checks:[]});}finally{setBusy(false);}}
 if(path!=="/dashboard")return null;
 return <section className="mb-6 grid grid-cols-1 xl:grid-cols-2 gap-4">
 <div className="rounded-2xl border border-border-subtle bg-surface-1 p-5"><h2 className="text-lg font-semibold">Pemeriksaan & Pemulihan</h2><p className="mt-2 text-sm text-text-muted">Periksa status aplikasi, konfigurasi database, dan provider AI.</p><button type="button" onClick={check} disabled={busy} className="mt-4 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">{busy?"Memeriksa sistem...":"Periksa & Pulihkan Error"}</button>{report&&<div className="mt-4 rounded-xl border border-border-subtle p-4" aria-live="polite"><p>{report.summary}</p>{(report.checks||[]).map((c,i)=><p className="mt-2 text-sm" key={c.name+i}>{c.status==="ok"?"✓":c.status==="warning"?"⚠":"✕"} {c.name}: {c.detail}</p>)}</div>}</div>
 <div className="rounded-2xl border border-border-subtle bg-surface-1 p-4"><h2 className="font-semibold">Karakter 3D interaktif</h2><p className="text-xs text-text-muted">Model 3D publik dengan kontrol putar dan zoom</p><div className="mt-3 flex min-h-[240px] items-center justify-center overflow-hidden rounded-xl bg-surface-2"><model-viewer src={MODEL_URL} alt="Model karakter 3D interaktif" camera-controls auto-rotate shadow-intensity="1" style={{width:"100%",height:"240px"}} loading="lazy"/></div><p className="mt-3 text-xs text-text-muted">Pratinjau model GLB publik; belum avatar VTuber VRM dengan ekspresi wajah atau sinkronisasi suara.</p></div>
 </section>;
}