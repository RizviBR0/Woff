// Start browser-fixture.mjs first. This script never loads environment files.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServerClient } from '@supabase/ssr';
import { createFixturePool, asFixtureUser, fixtureSession, FIXTURE_API, FIXTURE_ANON_KEY, FIXTURE_DATABASE } from './browser-fixture-transport.mjs';

const base = 'http://localhost:3002';
const health = await (await fetch(`${FIXTURE_API}/__fixture/health`)).json();
assert.equal(health.database,FIXTURE_DATABASE);
const pool = createFixturePool();
const browser = await chromium.launch({ channel:'msedge',headless:true });
const pages = [];
const errors = [];
const hydrationErrors = [];
const forbiddenRequests = [];
const results = [];
await mkdir('internal/browser-smoke',{recursive:true});
async function context() {
  const value = await browser.newContext({ viewport:{width:1440,height:1000},acceptDownloads:true,timezoneId:'Asia/Dhaka' });
  // Intercepted document responses lose their loopback address-space metadata
  // in current Edge. Permit only this fixture origin to reach its local socket.
  await value.grantPermissions(['local-network-access'],{origin:base});
  await value.route('**/*',route => {
    const url = new URL(route.request().url());
    if (['localhost','127.0.0.1'].includes(url.hostname) || !['http:','https:'].includes(url.protocol)) return route.continue();
    if (url.hostname.endsWith('.supabase.co')) forbiddenRequests.push(url.origin);
    return route.abort();
  });
  value.on('page',page => {
    pages.push(page);
    page.on('pageerror',error => errors.push(error.message));
    page.on('console',message => {
      if (/hydration|hydrated|react error #418|server.rendered HTML|did not match|text content does not match/i.test(message.text())) hydrationErrors.push(message.text());
    });
  });
  return value;
}
async function poll(check,label,timeout=30000) {
  const end = Date.now()+timeout;
  while (!(await check())) { if (Date.now()>end) throw new Error(`Timed out: ${label}`); await new Promise(resolve=>setTimeout(resolve,150)); }
}
const queryRow = async (sql,args) => (await pool.query(sql,args)).rows[0];
const claims = user => ({sub:user,role:'authenticated'});
const rpc = async (user,sql,args) => asFixtureUser(pool,claims(user),async client => (await client.query(sql,args)).rows[0]?.result);
async function check(name,action) { await action(); results.push({name,passed:true}); console.log(`PASS ${name}`); }
async function roomReady(page) {
  await page.getByRole('textbox',{name:'Message',exact:true}).waitFor({timeout:60000});
  const skip = page.getByRole('button',{name:'Skip guide',exact:true});
  if (await skip.isVisible().catch(()=>false)) {
    // Initial room reconciliation can replace this transient guide while it
    // animates. Native keyboard activation does not wait on its moving bounds.
    await skip.press('Enter',{timeout:3000}).catch(async error=>{
      if (await skip.isVisible().catch(()=>false)) throw error;
    });
  }
}
async function privacy(page,privateValue) {
  await page.getByRole('button',{name:'Note options',exact:true}).click();
  await page.getByRole('menuitem',{name:privateValue?'Make Note Private':'Share Note with Room',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:privateValue?'Make Private':'Share Note',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
}
async function putSession(target,row) {
  const cookies = [];
  const client = createServerClient(FIXTURE_API,FIXTURE_ANON_KEY,{cookies:{getAll:()=>[],setAll:items=>cookies.push(...items)}});
  const session = fixtureSession(row);
  const {error} = await client.auth.setSession({access_token:session.access_token,refresh_token:session.refresh_token});
  assert.ifError(error);
  await target.addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:base,sameSite:'Lax'})));
}

try {
  const ownerContext = await context();
  const ownerPage = await ownerContext.newPage();
  let room,note;
  await check('fresh anonymous browser creates a Free handoff with a seeded note',async()=>{
    await ownerPage.goto(`${base}/new?template=project-handoff`);
    await roomReady(ownerPage);
    const slug = new URL(ownerPage.url()).pathname.slice(1);
    assert.match(slug,/^\d{4}$/);
    room = await queryRow('select * from public.spaces where slug=$1',[slug]);
    note = await queryRow('select n.* from public.notes n join public.entries e on e.id=n.entry_id where e.space_id=$1',[room.id]);
    assert.equal(room.is_pro,false);
    assert.equal(room.retention_days,2);
    assert.match(note.content_html,/Keep a copy/);
    assert.equal(note.created_by_user_id,room.creator_device_id);
    await poll(()=>ownerPage.evaluate(()=>!new URL(location.href).searchParams.has('rk')),'secret URL cleanup');
    const entry = await queryRow('select created_at from public.entries where id=$1',[note.entry_id]);
    const expectedLocalTime = new Intl.DateTimeFormat('en-US',{hour:'numeric',minute:'2-digit',hour12:true,timeZone:'Asia/Dhaka'}).format(entry.created_at);
    const time = ownerPage.locator(`#entry-${note.entry_id} time`).first();
    await poll(async()=>await time.innerText()===expectedLocalTime,'visitor-local entry timestamp');
    await roomReady(ownerPage); // The guide effect can run after SSR controls appear.
    const ssr = await (await ownerPage.request.get(ownerPage.url())).text();
    assert.ok(ssr.includes(entry.created_at.toISOString().slice(11,16)+' UTC'),'Entry SSR contains stable UTC fallback');
    await ownerPage.screenshot({caret:'initial',path:'internal/browser-smoke/free-handoff.png'});
  });
  const ownerId = room.creator_device_id;
  await check('initial socket connection recovers a write made after the server page snapshot', async () => {
    const marker='Entry created during initial connection gap';
    const roomUrl=`${base}/${room.slug}`;
    await ownerPage.route(roomUrl,async route=>{
      if(!route.request().isNavigationRequest())return route.continue();
      const response=await route.fetch();
      await asFixtureUser(pool,claims(ownerId),client=>client.query(
        'insert into public.entries(space_id,kind,text,created_by_device_id) values($1,\'text\',$2,$3)',
        [room.id,marker,ownerId]));
      await route.fulfill({response});
    },{times:1});
    try {
      await ownerPage.goto(roomUrl);
      await ownerPage.getByText(marker,{exact:true}).waitFor({timeout:30000});
      await roomReady(ownerPage);
      const initiallyExpanded=ownerPage.getByRole('button',{name:'Collapse sidebar',exact:true}).filter({visible:true});
      if (await initiallyExpanded.isVisible()) await initiallyExpanded.click();
      const expand=ownerPage.getByRole('button',{name:'Expand sidebar',exact:true}).filter({visible:true});
      assert.equal(await expand.getAttribute('aria-expanded'),'false');
      assert.equal(await ownerPage.getByRole('button',{name:'Settings',exact:true}).filter({visible:true}).count(),1);
      await expand.click();
      const collapse=ownerPage.getByRole('button',{name:'Collapse sidebar',exact:true}).filter({visible:true});
      assert.equal(await collapse.getAttribute('aria-expanded'),'true');
      await collapse.click();
    } finally { await ownerPage.unroute(roomUrl); }
  });
  await check('long invitation share modal stays bounded on desktop and mobile', async () => {
    const shareButton = ownerPage.getByRole('button',{name:'Share room',exact:true});
    await shareButton.first().click();
    const dialog = ownerPage.getByRole('dialog');
    await dialog.getByRole('heading',{name:'Share Space',exact:true}).waitFor();
    for (const viewport of [{width:1440,height:1000},{width:390,height:844},{width:320,height:568}]) {
      await ownerPage.setViewportSize(viewport);
      const bounded = await dialog.evaluate(element => {
        const box=element.getBoundingClientRect();
        const link=element.querySelector('#space-share-link');
        const copy=[...element.querySelectorAll('button')].find(button=>button.textContent?.includes('Copy'));
        const within=child=>{const rect=child.getBoundingClientRect();return rect.left>=box.left-1&&rect.right<=box.right+1;};
        return box.left>=0&&box.right<=innerWidth&&element.scrollWidth<=element.clientWidth+1&&within(link)&&within(copy);
      });
      assert.equal(bounded,true,`Modal must fit ${viewport.width}px`);
    }
    await ownerPage.screenshot({caret:'initial',path:'internal/browser-smoke/share-modal-mobile.png'});
    await dialog.getByRole('button',{name:'Close',exact:true}).click();
    await ownerPage.setViewportSize({width:1440,height:1000});
  });
  const recoveryKey = await ownerPage.evaluate(slug=>localStorage.getItem(`woff_recovery_${slug}`),room.slug);
  const firstInvite = await ownerPage.evaluate(slug=>localStorage.getItem(`woff_invite_${slug}`),room.slug);
  assert.match(recoveryKey,/^[A-F0-9]{32}$/);
  assert.match(firstInvite,/^[a-f0-9]{64}$/);
  await ownerPage.locator(`a[href="/${room.slug}/${note.slug}"]`).first().click();
  await ownerPage.locator('.tiptap').waitFor({timeout:60000});
  await check('privacy mutation flushes pending edits and subsequent autosave keeps privacy',async()=>{
    await ownerPage.locator('.tiptap').fill('Pending edit before privacy');
    await privacy(ownerPage,true);
    await ownerPage.locator('.tiptap').fill('Private autosave after the privacy version change — বাংলা');
    await poll(async()=>{const saved=await queryRow('select * from public.notes where id=$1',[note.id]); return saved.is_locked && saved.content_html.includes('Private autosave');},'private autosave');
    await ownerPage.getByText('Saved in this space',{exact:true}).filter({visible:true}).first().waitFor();
  });
  await check('force overwrite reads the latest SQL version after three remote revisions',async()=>{
    let current = await queryRow('select version from public.notes where id=$1',[note.id]);
    for (let revision=1; revision<=3; revision++) {
      current = await rpc(ownerId,'select public.save_note_snapshot($1,$2,$3,$4,$5) result',[note.slug,'Remote revision',`<p>Remote revision ${revision}</p>`,{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:`Remote revision ${revision}`}]}]},current.version]);
    }
    await ownerPage.locator('.tiptap').fill('Local overwrite after three remote versions');
    await ownerPage.getByRole('button',{name:'Keep My Edits (Overwrite)',exact:true}).waitFor({timeout:30000});
    await ownerPage.getByRole('button',{name:'Keep My Edits (Overwrite)',exact:true}).click();
    await poll(async()=>{const saved=await queryRow('select version,content_html from public.notes where id=$1',[note.id]); return saved.version===current.version+1 && saved.content_html.includes('Local overwrite after three');},'latest-version overwrite');
    await ownerPage.getByRole('dialog').waitFor({state:'hidden'});
  });
  const guestContext = await context();
  const guestPage = await guestContext.newPage();
  await check('private note content is denied by real RLS and by its browser reader route',async()=>{
    await guestPage.goto(`${base}/s/${firstInvite}`);
    await roomReady(guestPage);
    const guest = (await pool.query('select user_id from public.space_members where space_id=$1 and user_id<>$2',[room.id,ownerId])).rows[0].user_id;
    const visible = await asFixtureUser(pool,claims(guest),client=>client.query('select content_html from public.notes where id=$1',[note.id]));
    assert.equal(visible.rowCount,0);
    await guestPage.goto(`${base}/n/${note.slug}`);
    await guestPage.getByRole('heading',{level:1}).first().waitFor({timeout:60000});
    assert.equal(await guestPage.locator('.tiptap[contenteditable="true"]').count(),0);
    assert.ok(!(await guestPage.locator('body').innerText()).includes('Local overwrite after three'));
  });
  await privacy(ownerPage,false);
  await check('note clipboard and QR use a permission-bearing invitation for a fresh receiver',async()=>{
    await ownerPage.getByRole('button',{name:'Share',exact:true}).click();
    const dialog=ownerPage.getByRole('dialog');
    await dialog.getByRole('button',{name:'Copy Note Link',exact:true}).waitFor();
    await poll(()=>dialog.getByRole('button',{name:'Copy Note Link',exact:true}).isEnabled(),'prepared note sharing');
    await dialog.getByAltText('Note share QR code').waitFor();
    assert.ok((await dialog.innerText()).includes("room's shared content"));
    // Capture the clipboard API's exact argument without reading the user's clipboard.
    await ownerPage.evaluate(()=>{window.__copiedNote='';navigator.clipboard.writeText=async value=>{window.__copiedNote=value;};});
    await dialog.getByRole('button',{name:'Copy Note Link',exact:true}).click();
    const copied=await ownerPage.evaluate(()=>window.__copiedNote);
    assert.match(copied,new RegExp(`^${base}/s/[a-f0-9]{64}\\?note=${note.slug}$`));
    const freshContext=await context();
    const freshReader=await freshContext.newPage();
    await freshReader.goto(copied);
    await freshReader.locator('.tiptap').waitFor({timeout:60000});
    assert.ok((await freshReader.locator('.tiptap').innerText()).includes('Local overwrite after three'));
    assert.equal(await freshReader.locator('.tiptap[contenteditable="true"]').count(),0);
    await dialog.getByRole('button',{name:'Close',exact:true}).click();
    await freshContext.close();
  });
  await ownerPage.goto(`${base}/${room.slug}`); await roomReady(ownerPage);
  await guestPage.goto(`${base}/s/${firstInvite}`); await roomReady(guestPage);
  await check('owner invitation rotation invalidates an existing recipient session',async()=>{
    const settings=ownerPage.getByRole('button',{name:'Settings',exact:true}).filter({visible:true}).first();
    // Next's development indicator overlaps this collapsed bottom-left icon.
    // Exercise the native keyboard activation through its accessible name.
    await settings.focus();
    await settings.press('Enter');
    await ownerPage.getByRole('button',{name:'Revoke access & create new link',exact:true}).click();
    await poll(()=>ownerPage.evaluate(({slug,token})=>localStorage.getItem(`woff_invite_${slug}`)!==token,{slug:room.slug,token:firstInvite}),'invitation rotation');
    await guestPage.goto(`${base}/${room.slug}`);
    await guestPage.getByRole('heading',{name:'This sharing space is unavailable',exact:true}).waitFor();
  });
  const nextInvite = await ownerPage.evaluate(slug=>localStorage.getItem(`woff_invite_${slug}`),room.slug);
  await guestPage.goto(`${base}/s/${nextInvite}`); await roomReady(guestPage);
  await check('automatic ownership recovery replaces the stale cached invitation and key',async()=>{
    await guestPage.evaluate(({slug,key,id,owner})=>{
      localStorage.setItem(`woff_recovery_${slug}`,key);
      localStorage.setItem(`woff_recovery_room_${slug}`,id);
      localStorage.setItem(`woff_recovery_owner_${slug}`,owner);
    },{slug:room.slug,key:recoveryKey,id:room.id,owner:ownerId});
    await guestPage.reload();
    await poll(async()=> (await queryRow('select creator_device_id from public.spaces where id=$1',[room.id])).creator_device_id!==ownerId,'owner recovery');
    await poll(()=>guestPage.evaluate(({slug,old})=>{const token=localStorage.getItem(`woff_invite_${slug}`);return token&&token!==old;},{slug:room.slug,old:nextInvite}),'new recovery invitation');
    const replaced = await guestPage.evaluate(slug=>({key:localStorage.getItem(`woff_recovery_${slug}`),token:localStorage.getItem(`woff_invite_${slug}`)}),room.slug);
    assert.notEqual(replaced.key,recoveryKey);
    const reader = await (await context()).newPage();
    await reader.goto(`${base}/s/${replaced.token}`); await roomReady(reader);
    await guestPage.screenshot({caret:'initial',path:'internal/browser-smoke/recovered-room.png'});
  });
  const senderId = randomUUID();
  const sender = await queryRow("insert into auth.users(id,email,email_confirmed_at,is_anonymous) values($1,'browser-sender@example.test',now(),false) returning *",[senderId]);
  await rpc(senderId,'select public.ensure_sender_account() result');
  await pool.query("update public.sender_entitlements set plan='pro',status='active',pro_until=now()+interval '1 month' where user_id=$1",[senderId]);
  const senderContext = await context(); await putSession(senderContext,sender);
  const senderPage = await senderContext.newPage();
  let proRoom;
  await check('verified Pro dashboard creates a bounded read-only handoff from its template',async()=>{
    await senderPage.goto(`${base}/dashboard`);
    await senderPage.getByRole('button',{name:'Create from template',exact:true}).waitFor({timeout:60000});
    await senderPage.getByRole('button',{name:'Create from template',exact:true}).click();
    await roomReady(senderPage);
    proRoom = await queryRow('select * from public.spaces where creator_device_id=$1 order by created_at desc limit 1',[senderId]);
    assert.equal(proRoom.retention_days,7); assert.equal(proRoom.delivery_mode,'read_only');
    assert.ok(Date.parse(proRoom.expires_at)-Date.now() < 8*86400000);
    // Supabase may serialize timestamptz with a different precision/offset;
    // locate the expiry semantically instead of assuming its string encoding.
    const expiryTime = senderPage.locator('time').filter({hasText:await senderPage.evaluate(value=>new Date(value).toLocaleString(),proRoom.expires_at.toISOString())});
    await expiryTime.first().waitFor();
    const ssr = await (await senderPage.request.get(senderPage.url())).text();
    const iso = proRoom.expires_at.toISOString();
    assert.ok(ssr.includes(`${iso.slice(0,10)} ${iso.slice(11,16)} UTC`),'Room expiry SSR contains stable UTC fallback');
    const token = await senderPage.evaluate(slug=>localStorage.getItem(`woff_invite_${slug}`),proRoom.slug);
    const reader = await (await context()).newPage();
    await reader.goto(`${base}/s/${token}`);
    await reader.getByText('Read-only delivery • Download what you need before expiry',{exact:false}).waitFor({timeout:60000});
    assert.equal(await reader.getByRole('textbox',{name:'Message',exact:true}).count(),0);
    assert.equal(await reader.getByRole('button',{name:'Create note',exact:true}).count(),0);
    await reader.screenshot({caret:'initial',path:'internal/browser-smoke/read-only-delivery.png'});
  });
  await check('dashboard search handles names, room codes, and no-match state',async()=>{
    await senderPage.goto(`${base}/dashboard`);
    const search = senderPage.getByRole('searchbox',{name:'Search your rooms',exact:true});
    await search.waitFor();
    await search.fill(proRoom.slug);
    assert.equal(await senderPage.getByRole('button',{name:'Open room',exact:true}).count(),0); // Open room is a link, not a mutation button.
    await senderPage.getByRole('link',{name:'Open room',exact:true}).waitFor();
    await search.fill('Project handoff'); await senderPage.getByRole('link',{name:'Open room',exact:true}).waitFor();
    await search.fill('no-such-project-in-fixture');
    await senderPage.getByText('No rooms match your search.',{exact:true}).waitFor();
    await search.fill('');
    await senderPage.screenshot({caret:'initial',path:'internal/browser-smoke/pro-dashboard.png'});
  });
  await check('paused entitlement removes Pro controls while existing delivery stays readable',async()=>{
    // Seed the canonical state produced by apply_sender_billing_event for a
    // paused subscription, rather than an impossible status-only update.
    await pool.query("update public.sender_entitlements set status='paused',plan='free',pro_until=now(),grace_until=null where user_id=$1",[senderId]);
    await senderPage.reload();
    await senderPage.getByRole('button',{name:'Create a free room',exact:true}).waitFor();
    assert.equal(await senderPage.getByRole('button',{name:'Create from template',exact:true}).count(),0);
    assert.equal(await senderPage.getByRole('button',{name:'Handoff settings',exact:true}).count(),0);
    await senderPage.screenshot({caret:'initial',path:'internal/browser-smoke/free-dashboard.png'});
    await senderPage.goto(`${base}/${proRoom.slug}`); await roomReady(senderPage);
    assert.equal((await queryRow('select retention_days from public.spaces where id=$1',[proRoom.id])).retention_days,7);
  });
  assert.deepEqual(errors,[],'Browser runtime errors');
  assert.deepEqual(hydrationErrors,[],'Cross-timezone hydration errors');
  assert.deepEqual(forbiddenRequests,[],'Attempted hosted Supabase request');
  const final = await (await fetch(`${FIXTURE_API}/__fixture/health`)).json();
  assert.deepEqual(final.stats.unsupported,[],'Unsupported transport endpoint used');
  await writeFile('internal/browser-smoke/results.json',JSON.stringify({results,transport:final.stats,timezones:{server:'UTC',browser:'Asia/Dhaka'},hydrationErrors,limitations:['No hosted SMTP/provider checkout','No Storage/TUS HTTP behavior','Realtime acknowledgement only; no change delivery','Fresh local PG schema and fixture Auth/JWT, not hosted Auth verification']},null,2));
  console.log(`PASS ${results.length} local browser journeys against migrated PostgreSQL and real RLS.`);
} catch (error) {
  for (let index=0;index<pages.length;index++) await pages[index].screenshot({caret:'initial',path:`internal/browser-smoke/failure-${index}.png`}).catch(()=>{});
  throw error;
} finally { await browser.close(); await pool.end(); }
