const { pool } = require('../utils/storage');
const { DURATION_DAYS } = require('../utils/premium');

// One row lock serializes every transition for the same provider order. The
// entitlement and paid state commit together, including on callback retries.
async function withOrder(orderId, provider, callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query('SELECT data FROM payment_transactions WHERE id=$1 FOR UPDATE', [orderId]);
    const order = result.rows[0]?.data;
    if (!order || order.provider !== provider) { await client.query('COMMIT'); return { status:'missing' }; }
    const resultValue = await callback(client, order);
    await client.query('COMMIT');
    return resultValue;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
async function updateOrder(client,id,updates) {
  await client.query('UPDATE payment_transactions SET data=data || $2::jsonb WHERE id=$1',[id,JSON.stringify(updates)]);
}
function sameAmount(a,b) { const x=Number(a),y=Number(b); return a!==undefined && a!==null && a!=='' && Number.isFinite(x) && Number.isFinite(y) && Math.abs(x-y)<0.01; }
async function grant(client,order,provider,now) {
  const days=DURATION_DAYS[order.duration]; if(!days) throw Error('Unknown pass duration');
  const users=await client.query('SELECT data FROM users WHERE id=$1 FOR UPDATE',[order.userId]);
  const user=users.rows[0]?.data; if(!user) throw Error('User not found');
  const existing=user.planExpiresAt && user.planExpiresAt!=='infinite' ? new Date(user.planExpiresAt) : null;
  if(existing && !Number.isFinite(existing.getTime())) throw Error('Invalid plan expiry');
  const base=existing && existing>now ? existing : now;
  const expiresAt=user.planExpiresAt==='infinite' ? 'infinite' : new Date(base.getTime()+days*86400000).toISOString();
  const updates={plan:'premium',planDuration:order.duration,planStartedAt:now.toISOString(),planExpiresAt:expiresAt,planSource:provider,planPaymentFailed:false,planPaymentAttempts:0,lastPaymentProvider:provider,lastPaymentAt:now.toISOString()};
  await client.query('UPDATE users SET data=data || $2::jsonb WHERE id=$1',[order.userId,JSON.stringify(updates)]);
}
async function prepareClick(orderId,request) {
  return withOrder(orderId,'click',async(client,order)=>{
    if(!sameAmount(request.amount,order.amount)) return {status:'amount'};
    if(order.state==='paid') return {status:'paid',order};
    if(order.state==='prepared') return String(order.clickTransId)===String(request.click_trans_id) ? {status:'prepared',order} : {status:'invalid'};
    if(order.state!=='pending') return {status:'invalid'};
    const changes={state:'prepared',clickTransId:request.click_trans_id,merchantPrepareId:Date.now(),preparedAt:new Date().toISOString()};
    await updateOrder(client,order.id,changes);return {status:'prepared',order:{...order,...changes}};
  });
}
async function completeClick(orderId,request) {
  return withOrder(orderId,'click',async(client,order)=>{
    if(!sameAmount(request.amount,order.amount)) return {status:'amount'};
    if(String(request.merchant_prepare_id)!==String(order.merchantPrepareId)||String(request.click_trans_id)!==String(order.clickTransId)) return {status:'invalid'};
    if(order.state==='paid') return {status:'paid',order};
    if(order.state==='cancelled') return {status:'cancelled',order};
    if(order.state!=='prepared') return {status:'invalid'};
    if(request.error===undefined || request.error===null || request.error==='' || !Number.isFinite(Number(request.error)) || Number(request.error)>0) return {status:'invalid'};
    const now=new Date();
    if(Number(request.error)<0) {await updateOrder(client,order.id,{state:'cancelled',cancelledAt:now.toISOString()});return {status:'cancelled',order};}
    await grant(client,order,'click',now);
    await updateOrder(client,order.id,{state:'paid',paidAt:now.toISOString()});
    return {status:'completed',order};
  });
}
async function createPayme(orderId,params) {
  return withOrder(orderId,'payme',async(client,order)=>{
    if(!Number.isSafeInteger(params.amount) || params.amount!==order.amountTiyin) return {status:'amount'};
    if(typeof params.id!=='string' || !params.id) return {status:'invalid'};
    if(order.paymeTransId) return order.paymeTransId===params.id ? {status:'created',order} : {status:'invalid'};
    if(order.state==='paid') return {status:'paid'};
    if(order.state!=='pending') return {status:'invalid'};
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',[`payme:${params.id}`]);
    const existing=await client.query("SELECT id FROM payment_transactions WHERE data->>'provider'='payme' AND data->>'paymeTransId'=$1 LIMIT 1",[params.id]);
    if(existing.rowCount) return {status:'invalid'};
    const changes={paymeTransId:params.id,paymeTime:params.time,paymeCreateTime:Date.now(),paymeState:1,state:'created'};
    await updateOrder(client,order.id,changes); return {status:'created',order:{...order,...changes}};
  });
}
async function performPayme(orderId,transactionId) {
  return withOrder(orderId,'payme',async(client,order)=>{
    if(order.paymeTransId!==transactionId) return {status:'missing'};
    if(order.paymeState===2) return {status:'paid',order};
    if(order.paymeState!==1) return {status:'invalid'};
    const now=new Date(),time=now.getTime();await grant(client,order,'payme',now);
    const changes={paymeState:2,paymePerformTime:time,state:'paid',paidAt:now.toISOString()};
    await updateOrder(client,order.id,changes);return {status:'completed',order:{...order,...changes}};
  });
}
async function cancelPayme(orderId,transactionId,reason) {
  return withOrder(orderId,'payme',async(client,order)=>{
    if(order.paymeTransId!==transactionId) return {status:'missing'};
    if(order.paymeState===-1 || order.paymeState===-2) return {status:'cancelled',order};
    if(order.paymeState!==1 && order.paymeState!==2) return {status:'invalid'};
    const changes={paymeState:order.paymeState===2?-2:-1,paymeCancelTime:Date.now(),paymeCancelReason:reason,state:'cancelled'};
    await updateOrder(client,order.id,changes);return {status:'cancelled',order:{...order,...changes}};
  });
}
module.exports={prepareClick,completeClick,createPayme,performPayme,cancelPayme};
