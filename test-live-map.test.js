const test = require('node:test');
const assert = require('node:assert/strict');
const {createTracker,cloudflareVisitor,WINDOW_MS}=require('./server/utils/live-map');
test('presence deduplicates, changes country, expires and exposes only aggregates',()=>{
 let time=1000000; const t=createTracker({now:()=>time});
 t.record({address:'1.2.3.4',country:'AM'},'Browser');
 t.record({address:'1.2.3.4',country:'AM'},'Browser');
 assert.equal(t.snapshot().activeVisitors,1);
 t.record({address:'1.2.3.4',country:'US'},'Browser');
 assert.deepEqual(t.snapshot().countries,{US:1});
 assert.equal(JSON.stringify(t.snapshot()).includes('1.2.3.4'),false);
 time+=WINDOW_MS; assert.equal(t.snapshot().activeVisitors,0);
});
test('unknown countries and bots excluded; capacity bounded',()=>{
 const t=createTracker({maxVisitors:2});
 assert.equal(t.record({address:'a',country:'ZZ'},'Browser'),false);
 assert.equal(t.record({address:'a',country:'US'},'Googlebot'),false);
 for(const address of ['a','b','c'])t.record({address,country:'AM'},'Browser');
 assert.equal(t.snapshot().activeVisitors,2);
});
test('country headers require trusted Cloudflare edge and valid visitor IP',()=>{
 const headers={'cf-connecting-ip':'1.2.3.4','cf-ipcountry':'AM'};
 assert.equal(cloudflareVisitor({ip:'127.0.0.1',headers}),null);
 assert.deepEqual(cloudflareVisitor({ip:'104.16.1.1',headers}),{address:'1.2.3.4',country:'AM'});
 assert.equal(cloudflareVisitor({ip:'2606:4700::1',headers}).country,'AM');
 assert.equal(cloudflareVisitor({ip:'104.16.1.1',headers:{...headers,'cf-connecting-ip':'bad'}}),null);
});
