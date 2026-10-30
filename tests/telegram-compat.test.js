const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

test('Telegram notifications, commands, callbacks and image uploads use the upgraded client', async () => {
  const requests=[];
  const server=http.createServer(async (req,res)=>{
    let parts=[]; for await (const c of req) parts.push(c);
    requests.push({method:req.url.split('/').pop(),body:Buffer.concat(parts),type:req.headers['content-type']});
    res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({ok:true,result:{message_id:1}}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const pkg=require('node-telegram-bot-api'), actual=pkg.TelegramBot;
  let instance;
  class LocalBot extends actual { constructor(token,options) { super(token,{...options,polling:false,baseApiUrl:`http://127.0.0.1:${server.address().port}`}); instance=this; } }
  const cache=require.cache[require.resolve('node-telegram-bot-api')]; const prev=cache.exports; cache.exports={...pkg,TelegramBot:LocalBot};
  const prevToken=process.env.TELEGRAM_BOT_TOKEN, prevChat=process.env.TELEGRAM_ADMIN_CHAT_ID;
  process.env.TELEGRAM_BOT_TOKEN='test'; process.env.TELEGRAM_ADMIN_CHAT_ID='42';
  const timeout=global.setTimeout, interval=global.setInterval; global.setTimeout=()=>0; global.setInterval=()=>0;
  try {
    const bot=require('../server/telegram'); bot.init(new Map());
    global.setTimeout=timeout; global.setInterval=interval;
    instance.processUpdate({update_id:1,message:{message_id:1,date:1,chat:{id:42,type:'private'},text:'/start'}});
    instance.processUpdate({update_id:2,callback_query:{id:'callback',data:'view:x',from:{id:43},message:{message_id:2,chat:{id:43,type:'private'}}}});
    bot.notifyStripeRenewal({name:'Test',username:'test'}, {duration:'1m',expiresAt:'later'});
    const image='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+tmxkAAAAASUVORK5CYII=';
    bot.notifySupportTicket({name:'Test',username:'test'}, {subject:'Sample',type:'bug',message:'Example',id:'00000000-0000-0000-0000-000000000000',image:{base64:image}});
    for(let i=0;i<40 && requests.length<5;i++) await new Promise(resolve=>setTimeout(resolve,25));
    assert(requests.filter(r=>r.method==='sendMessage').length>=3);
    assert(requests.some(r=>r.method==='answerCallbackQuery'));
    assert(requests.some(r=>r.method==='sendPhoto'&&r.type.startsWith('multipart/form-data')));
    const renewal=requests.find(r=>r.method==='sendMessage'&&r.body.toString().includes('Subscription'));
    assert(renewal && new URLSearchParams(renewal.body.toString()).get('link_preview_options'));
  } finally {
    global.setTimeout=timeout; global.setInterval=interval; cache.exports=prev;
    if(prevToken===undefined) delete process.env.TELEGRAM_BOT_TOKEN; else process.env.TELEGRAM_BOT_TOKEN=prevToken;
    if(prevChat===undefined) delete process.env.TELEGRAM_ADMIN_CHAT_ID; else process.env.TELEGRAM_ADMIN_CHAT_ID=prevChat;
    await new Promise(resolve=>server.close(resolve));
  }
});
