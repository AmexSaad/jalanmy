import {test} from 'node:test';
import assert from 'node:assert/strict';
import {activeReports, gpsSpeed, decodePolyline, TTL, inCoverage} from '../src/domain.mjs';
test('reports expire and invalid storage entries are discarded', () => {
  const now = 10000000;
  const valid = {id:'a', category:'Banjir', lon:103.7, lat:1.5, createdAt:now-100};
  assert.deepEqual(activeReports([valid, {...valid,createdAt:now-TTL}, {...valid,createdAt:now+1}, {...valid,category:'x'}, null, {...valid,lat:20}],now),[valid]);
  assert.deepEqual(activeReports({},now),[]);
});
test('unknown GPS speed is never displayed as zero', () => {
  assert.equal(gpsSpeed(null),null); assert.equal(gpsSpeed(-1),null); assert.equal(gpsSpeed(0),0); assert.equal(gpsSpeed(20),72);
});
test('Valhalla polyline6 geometry decodes in longitude/latitude order', () => {
  assert.deepEqual(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@',5),[[-120.2,38.5],[-120.95,40.7],[-126.453,43.252]]);
  assert.throws(() => decodePolyline('~'));
});
test('coverage rejects missing and out of region coordinates', () => {
  assert.equal(inCoverage(103.7,1.5),true); assert.equal(inCoverage(101.7,3.1),false); assert.equal(inCoverage(NaN,1.5),false);
});
