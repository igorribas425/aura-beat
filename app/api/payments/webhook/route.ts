import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
function validSignature(body:string, received:string|null, secret:string){if(!received)return false;const expected=createHmac("sha256",secret).update(body).digest("hex");const a=Buffer.from(expected);const b=Buffer.from(received.replace(/^sha256=/,""));return a.length===b.length&&timingSafeEqual(a,b)}
export async function POST(request:NextRequest){
 const secret=process.env.PAYMENT_WEBHOOK_SECRET; const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY; const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 if(!secret||!serviceKey||!url)return NextResponse.json({error:"Payment backend is not configured"},{status:503});
 const body=await request.text(); if(!validSignature(body,request.headers.get("x-aura-signature"),secret))return NextResponse.json({error:"Invalid signature"},{status:401});
 let event:{id?:string;status?:string};try{event=JSON.parse(body)}catch{return NextResponse.json({error:"Invalid JSON"},{status:400})}
 if(!event.id||!event.status)return NextResponse.json({error:"Missing event fields"},{status:400});
 const allowed:Record<string,string>={pending:"pending",processing:"processing",paid:"paid",failed:"failed",refunded:"refunded",cancelled:"cancelled"}; const status=allowed[event.status]; if(!status)return NextResponse.json({error:"Unknown status"},{status:422});
 const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}}); const {error}=await admin.from("payments").update({status,raw_status:event.status,updated_at:new Date().toISOString()}).eq("provider_payment_id",event.id); if(error)return NextResponse.json({error:"Persistence failed"},{status:500}); return NextResponse.json({received:true});
}
