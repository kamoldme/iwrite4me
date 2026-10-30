const test=require('node:test'); const assert=require('node:assert/strict');const crypto=require('node:crypto');
test('local payment callbacks serialize grants, retries, cancellation and validation', {skip:process.env.RUN_STAGING_DB_TESTS!=='1'}, async()=>{
 assert.equal(process.env.STAGING_MODE,'1'); const {pool}=require('../server/utils/storage');assert.equal((await pool.query('select current_database() as name')).rows[0].name,'iwrite_staging');
 process.env.CLICK_SERVICE_ID='123';process.env.CLICK_MERCHANT_ID='merchant';process.env.CLICK_SECRET_KEY='test-click-secret';process.env.PAYME_MERCHANT_ID='test';process.env.PAYME_KEY='test-payme-secret';process.env.ATMOS_CONSUMER_KEY='test';process.env.ATMOS_CONSUMER_SECRET='test';process.env.ATMOS_STORE_ID='test';
 const express=require('express'),app=express();app.use(express.json());app.use('/click',require('../server/routes/click'));app.use('/payme',require('../server/routes/payme'));app.use('/atmos',require('../server/routes/atmos'));app.use('/payments',require('../server/routes/payments'));
 const server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s))});const base=`http://127.0.0.1:${server.address().port}`;
 const user=crypto.randomUUID(), click=crypto.randomUUID(),cancel=crypto.randomUUID(),payme=crypto.randomUUID(),payme2=crypto.randomUUID();let ids=[click,cancel,payme,payme2];
 async function insertOrder(id,provider,extra={}){let x={id,provider,userId:user,duration:'1m',amount:1000,amountTiyin:100000,state:'pending',...extra};await pool.query('insert into payment_transactions(id,data) values($1,$2)',[id,JSON.stringify(x)])}
 function sign(body){let raw=String(body.click_trans_id)+String(body.service_id)+'test-click-secret'+String(body.merchant_trans_id)+(String(body.action)==='1'?String(body.merchant_prepare_id):'')+String(body.amount)+String(body.action)+String(body.sign_time);return {...body,sign_string:crypto.createHash('md5').update(raw).digest('hex')}}
 async function clickCall(path,body){let r=await fetch(base+'/click/'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(sign(body))});return r.json()}
 async function rpc(method,params){let r=await fetch(base+'/payme/',{method:'POST',headers:{'content-type':'application/json',authorization:'Basic '+Buffer.from('Paycom:test-payme-secret').toString('base64')},body:JSON.stringify({id:1,method,params})});return r.json()}
 function clickData(id,txn,action,amount=1000){return {click_trans_id:txn,service_id:123,merchant_trans_id:id,amount,action,sign_time:'2026-10-30 00:00:00',error:0}}
 try {
  await pool.query('insert into users(id,data) values($1,$2)',[user,JSON.stringify({id:user,email:`test-${user}@example.invalid`,plan:'free'})]);for(const id of [click,cancel])await insertOrder(id,'click');for(const id of [payme,payme2])await insertOrder(id,'payme');
  let invalid=await fetch(base+'/click/prepare',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...clickData(click,1,0),sign_string:'incorrect'})});assert.equal((await invalid.json()).error,-1);
  assert.equal((await (await fetch(base+'/payments/config')).json()).providers.atmos,false);
  const atmos=await fetch(base+'/atmos/callback',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});assert.equal(atmos.status,503);
  assert.equal((await clickCall('prepare',clickData(click,1,0,'bad'))).error,-2);
  const prep=await Promise.all(Array.from({length:4},()=>clickCall('prepare',clickData(click,1,0))));assert(prep.every(x=>x.error===0));assert.equal(new Set(prep.map(x=>x.merchant_prepare_id)).size,1);
  let done={...clickData(click,1,1),merchant_prepare_id:prep[0].merchant_prepare_id};const completed=await Promise.all(Array.from({length:5},()=>clickCall('complete',done)));assert.equal(completed.filter(x=>x.error===0).length,1);assert.equal(completed.filter(x=>x.error===-4).length,4);
  assert.equal((await clickCall('complete',{...done,error:-1})).error,-4);
  const cp=await clickCall('prepare',clickData(cancel,2,0));let cd={...clickData(cancel,2,1),merchant_prepare_id:cp.merchant_prepare_id,error:-1};assert.equal((await clickCall('complete',cd)).error,-9);assert.equal((await clickCall('complete',{...cd,error:0})).error,-9);
  const params={id:'payme-transaction-'+user,time:Date.now(),amount:100000,account:{order_id:payme}};const creates=await Promise.all(Array.from({length:4},()=>rpc('CreateTransaction',params)));assert(creates.every(x=>x.result?.state===1));assert.equal(new Set(creates.map(x=>x.result.create_time)).size,1);
  assert((await rpc('CreateTransaction',{...params,account:{order_id:payme2}})).error);
  const raceA=crypto.randomUUID(),raceB=crypto.randomUUID();ids.push(raceA,raceB);await insertOrder(raceA,'payme');await insertOrder(raceB,'payme');
  const raceId='race-'+user;const collision=await Promise.all([raceA,raceB].map(order_id=>rpc('CreateTransaction',{id:raceId,time:Date.now(),amount:100000,account:{order_id}})));assert.equal(collision.filter(x=>x.result?.state===1).length,1);assert.equal(collision.filter(x=>x.error).length,1);
  let performs=await Promise.all(Array.from({length:5},()=>rpc('PerformTransaction',{id:params.id})));assert(performs.every(x=>x.result?.state===2));assert.equal(new Set(performs.map(x=>x.result.perform_time)).size,1);
  const firstCancel=await rpc('CancelTransaction',{id:params.id,reason:1}),secondCancel=await rpc('CancelTransaction',{id:params.id,reason:1});assert.equal(firstCancel.result.state,-2);assert.equal(secondCancel.result.cancel_time,firstCancel.result.cancel_time);assert((await rpc('PerformTransaction',{id:params.id})).error);
  const u=(await pool.query('select data from users where id=$1',[user])).rows[0].data;const days=(new Date(u.planExpiresAt)-Date.now())/86400000;assert(days>59.9 && days<=60.01);
 } finally {await new Promise(r=>server.close(r));await new Promise(r=>setTimeout(r,150));await pool.query("delete from logs where data->>'userId'=$1",[user]);await pool.query('delete from payment_transactions where id=any($1::uuid[])',[ids]);await pool.query('delete from users where id=$1',[user]);await pool.end();}
});
