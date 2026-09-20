import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const local=path.join(root,'.local');
const configPath=path.join(local,'source.json');
const config=fs.existsSync(configPath)?JSON.parse(fs.readFileSync(configPath,'utf8')):{};
const base=process.env.FEISHU_BASE_TOKEN||config.baseToken;
const table=process.env.FEISHU_TABLE_ID||config.tableId;
const view=process.env.FEISHU_VIEW_ID||config.viewId;
if(!base||!table)throw new Error('Set FEISHU_BASE_TOKEN and FEISHU_TABLE_ID, or create .local/source.json. See README.md.');
const old=JSON.parse(fs.readFileSync(path.join(root,'data/projects.json'),'utf8'));
const known=new Map(old.map(p=>[p.id,p]));
// Gallery drag order is not preserved by the API. Use the order verified in
// Feishu's visible gallery, and fail instead of guessing where new records go.
const sourceOrder=config.recordOrder??old.map(p=>p.id);
const rank=new Map(sourceOrder.map((id,i)=>[id,i]));
if(rank.size!==sourceOrder.length)throw new Error('Duplicate record ID in the verified Feishu gallery order.');
fs.mkdirSync(local,{recursive:true});
const stage=fs.mkdtempSync(path.join(local,'sync-'));
const run=args=>JSON.parse(execFileSync('lark-cli',args,{cwd:root,encoding:'utf8',maxBuffer:24*1024*1024}));
const plain=s=>String(s??'').replace(/\[([^\]]+)\]\([^)]+\)/g,'$1');
const urlOf=s=>String(s??'').match(/\]\((https?:\/\/[^)]+)\)$/)?.[1]||String(s??'');
const result=[];
let offset=0;
try{
  const schema=run(['base','+field-list','--base-token',base,'--table-id',table,'--as','user']);
  if(!schema.ok)throw new Error('Unable to read Feishu fields.');
  const fieldNames=new Set(schema.data.fields.map(f=>f.name));
  for(const name of ['名称','显示','简述','链接','标签','附件'])if(!fieldNames.has(name))throw new Error(`Missing required field: ${name}`);
  for(;;){
    const page=run(['base','+record-list','--base-token',base,'--table-id',table,...(view?['--view-id',view]:[]),...['名称','显示','简述','链接','标签','附件'].flatMap(field=>['--field-id',field]),'--limit','200','--offset',String(offset),'--as','user','--format','json']);
    if(!page.ok)throw new Error('Unable to read Feishu records.');
    const d=page.data;
    d.data.forEach((values,i)=>{
      const row=Object.fromEntries(d.fields.map((name,k)=>[name,values[k]]));
      const show=row['显示'];
      if(!(show==='是'||(Array.isArray(show)&&show.length===1&&show[0]==='是')))return;
      const id=d.record_id_list[i];
      if(!rank.has(id))throw new Error(`Record ${id} is not in the verified gallery order. Check its position in Feishu and update .local/source.json recordOrder before syncing.`);
      const existing=known.get(id);
      const slug=existing?.slug||`project-${id.toLowerCase().replace(/[^a-z0-9]/g,'')}`;
      const title=plain(row['名称']).trim();
      if(!title)throw new Error(`Visible record ${id} has no title.`);
      const url=urlOf(row['链接']);
      if(!/^https?:\/\//.test(url))throw new Error(`Invalid link for ${title}.`);
      const attachments=row['附件']??[];
      const image=attachments.find(a=>/\.(png|jpe?g|webp|gif)$/i.test(a.name));
      const video=attachments.find(a=>/\.mp4$/i.test(a.name));
      const p={id,slug,title:slug==='blog'?'个人博客':slug==='sidenote'?'SideNote 边角记':title,visible:true,summary:plain(row['简述']).replace(/\n/g,'，'),sourceSummary:plain(row['简述']),url,tags:row['标签']??[],image:null,imageAlt:title+'预览',width:1200,height:750,video:null};
      for(const [kind,attachment] of [['image',image],['video',video]]){
        if(!attachment)continue;
        const ext=path.extname(attachment.name).toLowerCase();
        const filename=slug+ext;
        const response=run(['docs','+media-download','--token',attachment.file_token,'--output',path.relative(root,path.join(stage,filename)),'--as','user']);
        if(!response.ok)throw new Error(`Unable to download ${title} ${kind}.`);
        p[kind]=filename;
        if(kind==='image'&&ext==='.png'){
          const bytes=fs.readFileSync(path.join(stage,filename));
          p.width=bytes.readUInt32BE(16);p.height=bytes.readUInt32BE(20);
        }
      }
      result.push(p);
    });
    if(!d.has_more)break;
    if(!d.data.length)throw new Error('Feishu returned empty page with has_more=true.');
    offset+=d.data.length;
  }
  const assets=path.join(root,'dist/assets');
  result.sort((a,b)=>rank.get(a.id)-rank.get(b.id));
  // Stage every download before changing the current snapshot.
  for(const name of fs.readdirSync(stage))fs.copyFileSync(path.join(stage,name),path.join(assets,name));
  const retained=new Set(result.flatMap(p=>[p.image,p.video]).filter(Boolean));
  for(const p of old)for(const name of [p.image,p.video]){
    if(name&&!retained.has(name)&&path.basename(name)===name)fs.rmSync(path.join(assets,name),{force:true});
  }
  fs.writeFileSync(path.join(root,'data/projects.json'),JSON.stringify(result,null,2)+'\n');
  execFileSync(process.execPath,[path.join(root,'scripts/build.mjs')],{stdio:'inherit'});
  console.log(`Synced ${result.length} visible Feishu records. No remote repository was changed.`);
}finally{fs.rmSync(stage,{recursive:true,force:true});}
