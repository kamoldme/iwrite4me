const test=require('node:test');const assert=require('node:assert/strict');const crypto=require('node:crypto');
test('session tab fonts persist without changing legacy saves or accepting invalid values', {skip:process.env.RUN_STAGING_DB_TESTS!=='1'},async()=>{
 assert.equal(process.env.STAGING_MODE,'1');const {pool}=require('../server/utils/storage');assert.equal((await pool.query('select current_database() as name')).rows[0].name,'iwrite_staging');
 const express=require('express'),jwt=require('jsonwebtoken'),app=express();app.use(express.json());app.use('/documents',require('../server/routes/documents'));
 const telegram=require('../server/telegram');const originalNotify=telegram.notifySessionCompleted;telegram.notifySessionCompleted=()=>{};
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))});const user=crypto.randomUUID(),other=crypto.randomUUID(),doc=crypto.randomUUID();const base=`http://127.0.0.1:${server.address().port}`;
 const token=id=>jwt.sign({id,role:'user'},process.env.JWT_SECRET,{expiresIn:'1m'});async function request(method,id,path,body){let r=await fetch(base+path,{method,headers:{authorization:'Bearer '+token(id),'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()}}
 try {
  for(const id of [user,other])await pool.query('insert into users(id,data) values($1,$2)',[id,JSON.stringify({id,email:`${id}@example.invalid`,plan:'free',xp:0,streak:0,longestStreak:0,totalWords:0,totalSessions:0})]);
  await pool.query('insert into documents(id,data) values($1,$2)',[doc,JSON.stringify({id:doc,userId:user,title:'Font test',content:'first',mode:'zen',shareLinks:[],createdAt:new Date().toISOString()})]);
  const content='<!--iwrite-tab:Draft-->first words<!--iwrite-tab:Draft 2-->second words';
  let r=await request('PATCH',user,`/documents/${doc}`,{content,tabFonts:['fraunces','nunito']});assert.equal(r.status,200);assert.deepEqual(r.data.tabFonts,['fraunces','nunito']);assert.equal(r.data.content,content);
  r=await request('GET',user,`/documents/${doc}`);assert.equal(r.status,200);assert.deepEqual(r.data.tabFonts,['fraunces','nunito']);
  r=await request('PATCH',user,`/documents/${doc}`,{content:'legacy save'});assert.equal(r.status,200);assert.deepEqual(r.data.tabFonts,['fraunces','nunito']);
  r=await request('PATCH',user,`/documents/${doc}`,{content:'must not save',tabFonts:['bad-font']});assert.equal(r.status,400);
  r=await request('GET',user,`/documents/${doc}`);assert.equal(r.data.content,'legacy save');
  r=await request('PATCH',other,`/documents/${doc}`,{tabFonts:['serif']});assert.equal(r.status,404);
  r=await request('POST',user,`/documents/${doc}/complete`,{wordCount:4,duration:1,content,tabFonts:['fraunces','nunito']});assert.equal(r.status,200);assert.deepEqual(r.data.document.tabFonts,['fraunces','nunito']);assert.equal(r.data.document.content,content);
 } finally {telegram.notifySessionCompleted=originalNotify;await new Promise(resolve=>server.close(resolve));await pool.query("delete from logs where data->>'userId'=$1",[user]);await pool.query('delete from documents where id=$1',[doc]);await pool.query('delete from users where id=any($1::uuid[])',[[user,other]]);await pool.end();}
});
