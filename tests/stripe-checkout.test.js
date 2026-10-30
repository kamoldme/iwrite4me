const test=require('node:test'); const assert=require('node:assert/strict');
const {checkoutGrant}=require('../server/services/stripeCheckout');
test('checkout grants require a completed paid or valid trial subscription',()=>{
 const now=1800000000000, session={status:'complete',mode:'subscription',payment_status:'paid'}, active={id:'sub',status:'active'}, trial={id:'sub',status:'trialing',trial_end:now/1000+60};
 assert.deepEqual(checkoutGrant(session,active,now),{isTrial:false});
 assert.deepEqual(checkoutGrant({...session,payment_status:'no_payment_required'},trial,now),{isTrial:true});
 for(const bad of [ {...session,status:'open'}, {...session,mode:'payment'}, {...session,payment_status:'unpaid'} ]) assert.equal(checkoutGrant(bad,active,now),null);
 for(const bad of [{...active,status:'canceled'},{...active,status:'past_due'}, {...trial,trial_end:now/1000-1}]) assert.equal(checkoutGrant(session,bad,now),null);
});

test('checkout verification and signed webhook never grant unpaid or expired subscriptions', {skip:process.env.RUN_STAGING_DB_TESTS!=='1'}, async()=>{
 assert.equal(process.env.STAGING_MODE,'1'); const {pool}=require('../server/utils/storage'); assert.equal((await pool.query('select current_database() as name')).rows[0].name,'iwrite_staging');
 const {randomUUID}=require('node:crypto'), jwt=require('jsonwebtoken'), RealStripe=require('stripe');
 const id=randomUUID(), subId=`sub_test_${id}`, sessionId=`cs_test_${id}`, key='whsec_checkout_test';
 let subscription={id:subId,status:'active'}, session={id:sessionId,status:'complete',mode:'subscription',payment_status:'unpaid',subscription:subId,customer:'cus_test',metadata:{userId:id,duration:'1m'}};
 const verifier=new RealStripe('sk_test_mock'); function FakeStripe(){return {webhooks:verifier.webhooks,subscriptions:{retrieve:async()=>subscription},checkout:{sessions:{retrieve:async()=>({...session,subscription})}}};}
 const cache=require.cache[require.resolve('stripe')],original=cache.exports;cache.exports=FakeStripe; process.env.STRIPE_SECRET_KEY='sk_test_mock';process.env.STRIPE_WEBHOOK_SECRET=key;process.env.JWT_SECRET='checkout_test_secret';
 const {router,stripeWebhookHandler}=require('../server/routes/stripe'),express=require('express'),app=express();app.post('/webhook',express.raw({type:'application/json'}),stripeWebhookHandler);app.use('/stripe',router);
 const server=await new Promise(resolve=>{let s=app.listen(0,'127.0.0.1',()=>resolve(s))});const base=`http://127.0.0.1:${server.address().port}`;const auth=jwt.sign({id,email:'test@example.invalid',role:'user'},process.env.JWT_SECRET);
 async function verify(){let r=await fetch(`${base}/stripe/verify-session?session_id=${sessionId}`,{headers:{Authorization:'Bearer '+auth}});assert.equal(r.status,200);return r.json()}
 async function webhook(type='checkout.session.completed'){let body=JSON.stringify({id:`evt_${id}`,type,data:{object:session}});let signature=verifier.webhooks.generateTestHeaderString({payload:body,secret:key});return fetch(base+'/webhook',{method:'POST',headers:{'content-type':'application/json','stripe-signature':signature},body})}
 async function plan(){return (await pool.query('select data from users where id=$1',[id])).rows[0].data.plan}
 try {
  await pool.query('insert into users (id,data) values ($1,$2)',[id,JSON.stringify({id,email:'test@example.invalid',plan:'free'})]);
  assert.equal((await verify()).success,false); assert.equal((await webhook()).status,200); assert.equal(await plan(),'free');
  session={...session,payment_status:'no_payment_required'};subscription={...subscription,status:'trialing',trial_end:Math.floor(Date.now()/1000)-60};
  assert.equal((await verify()).success,false);assert.equal((await webhook()).status,200);assert.equal(await plan(),'free');
  session={...session,payment_status:'paid'};subscription={id:subId,status:'active'};
  assert.equal((await webhook('checkout.session.async_payment_succeeded')).status,200);assert.equal(await plan(),'premium');assert.equal((await verify()).alreadyProcessed,true);
 } finally {await new Promise(r=>server.close(r));await new Promise(r=>setTimeout(r,100));await pool.query("delete from logs where data->>'userId'=$1",[id]);await pool.query('delete from users where id=$1',[id]);await pool.end();cache.exports=original;}
});
