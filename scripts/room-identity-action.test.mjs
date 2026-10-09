import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as slug from '../lib/room-slug.ts';

async function actionFixture({authError, rpcError, response = {space:{id:'room-id',slug:'sabbir',name:'Sabbir'}}}={}) {
  const calls=[];
  const source=await readFile(new URL('../lib/dashboard-actions.ts',import.meta.url),'utf8');
  const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports={};
  vm.runInNewContext(output,{exports,require(name){
    if(name==='@/lib/room-slug')return slug;
    if(name==='@/lib/account')return {requireVerifiedSender:async()=>{
      if(authError)throw new Error(authError);
      return {supabase:{rpc:async(name,input)=>{calls.push({name,input});return {data:response,error:rpcError}}}};
    }};
    throw new Error('Unexpected dependency: '+name);
  }});
  return {update:exports.updateRoomIdentity,calls};
}

test('room identity action uses the verified client and sends canonical name and URL to guarded RPC',async()=>{
  const {update,calls}=await actionFixture();const result=await update('room-id','  Sabbir  ',' SABBIR ');
  assert.equal(result.ok,true);assert.equal(result.space.id,'room-id');assert.deepEqual(JSON.parse(JSON.stringify(calls)),[{name:'update_room_identity',input:{p_space_id:'room-id',p_name:'Sabbir',p_slug:'sabbir'}}]);
});
test('invalid or reserved URLs and blank or long names cannot reach identity RPC',async()=>{
  const {update,calls}=await actionFixture();
  for(const [name,address] of [['','sabbir'],['x'.repeat(121),'sabbir'],['Sabbir','dashboard'],['Sabbir','../sabbir'],['Sabbir','sabbir--files'],['Sabbir','x'.repeat(41)]])assert.equal((await update('room-id',name,address)).ok,false);
  assert.equal(calls.length,0);
});
test('name-only edits preserve the URL with a null RPC argument',async()=>{
  const {update,calls}=await actionFixture();assert.equal((await update('room-id','সাব্বিরের ফাইল')).ok,true);assert.equal(calls[0].input.p_slug,null);
});
test('expected conflicts and Pro denial are serialized for readable production form errors',async()=>{
  for(const [message,expected] of [['That room code or URL is already in use',/already in use/],['Pro is required',/Pro is required/],['Room owner required',/rooms you own/],['Too many room changes',/try again later/]]){
    const {update}=await actionFixture({rpcError:{message}});const result=await update('room-id','Sabbir','sabbir');assert.equal(result.ok,false);assert.match(result.error,expected);
  }
});
test('authentication and unexpected database failures remain failures without exposing provider details',async()=>{
  const denied=await actionFixture({authError:'Private auth detail'});assert.equal((await denied.update('room-id','Sabbir','sabbir')).ok,false);assert.equal(denied.calls.length,0);
  const failed=await actionFixture({rpcError:{message:'Private SQL / credential detail'}});const result=await failed.update('room-id','Sabbir','sabbir');assert.equal(result.ok,false);assert.doesNotMatch(result.error,/Private SQL|credential|Private auth/);
});
