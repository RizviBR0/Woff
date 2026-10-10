import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';
import * as slug from '../lib/room-slug.ts';
import * as title from '../lib/room-title.ts';

async function roomRequest({space={slug:'7543',name:'Design handoff'},denied=false}={}) {
  const calls=[];
  const source=await readFile(new URL('../app/[slug]/page.tsx',import.meta.url),'utf8');
  const {outputText}=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}});
  const exports={};
  const adapters={
    'react/jsx-runtime':jsx,
    'react':{cache:fn=>{const requestResults=new Map();return key=>{if(!requestResults.has(key))requestResults.set(key,fn(key));return requestResults.get(key);};}},
    'next/navigation':{notFound:()=>{throw new Error('not found');},redirect:url=>{throw new Error('redirect '+url);}},
    'next/headers':{cookies:async()=>({get:()=>undefined})},
    '@/components/space-container':{SpaceContainer:()=>null},
    '@/lib/display-name':{displayNameForDevice:()=> 'Room member'},
    '@/lib/room-slug':slug,
    '@/lib/room-title':title,
    '@/lib/supabase':{requireAnonymousUser:async()=>{calls.push({kind:'session'});return {user:{id:'current-member'},supabase:{rpc:async(name,input)=>{calls.push({name,input});return {data:{space,entries:[]},error:denied?{message:'access denied'}:null};}}};}},
  };
  vm.runInNewContext(outputText,{exports,require:name=>{assert.ok(name in adapters,'Unexpected dependency '+name);return adapters[name];}});
  const props=address=>({params:Promise.resolve({slug:address}),searchParams:Promise.resolve({})});
  return {calls,metadata:address=>exports.generateMetadata(props(address)),page:address=>exports.default(props(address))};
}

test('room metadata and page use the same authorized opening result',async()=>{
  const f=await roomRequest({space:{slug:'project-handoff',name:'Client deliverables'}});
  const metadata=await f.metadata('PROJECT-HANDOFF');
  const page=await f.page('project-handoff');
  assert.equal(metadata.title.absolute,'Client deliverables | Woff Space');
  assert.equal(page.props.space.name,'Client deliverables');
  assert.equal(f.calls.filter(c=>c.name==='open_space').length,1);
  assert.equal(f.calls.find(c=>c.name==='open_space').input.p_slug,'project-handoff');
  assert.equal(metadata.robots.index,false);
  assert.equal(metadata.referrer,'no-referrer');
});

test('denied room access cannot disclose a room name in metadata',async()=>{
  const f=await roomRequest({space:{slug:'7543',name:'Private client name'},denied:true});
  assert.equal((await f.metadata('7543')).title.absolute,'Room 7543 | Woff Space');
  await assert.rejects(f.page('7543'),/not found/);
  assert.equal(f.calls.filter(c=>c.name==='open_space').length,1);
});

test('invalid room addresses never create a session or query room metadata',async()=>{
  const f=await roomRequest();
  await f.metadata('../private');
  assert.equal(f.calls.length,0);
});

test('independent room requests retain their own names and unnamed rooms have a clear fallback',async()=>{
  const first=await roomRequest({space:{slug:'7543',name:'সাব্বিরের ফাইল'}});
  const second=await roomRequest({space:{slug:'7543',name:'Other member’s room'}});
  assert.equal((await first.metadata('7543')).title.absolute,'সাব্বিরের ফাইল | Woff Space');
  assert.equal((await second.metadata('7543')).title.absolute,'Other member’s room | Woff Space');
  const unnamed=await roomRequest({space:{slug:'7543',name:'  ',title:null}});
  assert.equal((await unnamed.metadata('7543')).title.absolute,'Room 7543 | Woff Space');
});
