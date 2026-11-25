import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createContentPressure } from './resource-pressure.js';
test('API pressure distinguishes process telemetry and recovers with hysteresis', async () => {
  let time=0,busy=0.1,memory=100;
  const pressure=createContentPressure({clock:()=>time,utilization:()=>({utilization:busy}),rss:()=>memory,readLimit:async()=>'1000'});
  assert.equal((await pressure.observe()).paused,false);
  time+=3000;busy=.9;assert.equal((await pressure.observe()).paused,true);
  time+=3000;busy=.6;assert.equal((await pressure.observe()).paused,true);
  time+=3000;busy=.1;assert.equal((await pressure.observe()).paused,false);
  time+=3000;memory=850;assert.equal((await pressure.observe()).paused,true);
  time+=3000;memory=700;assert.equal((await pressure.observe()).paused,true);
  time+=3000;memory=500;const result=await pressure.observe();assert.equal(result.paused,false);assert.equal(result.hostTelemetry,false);
});
