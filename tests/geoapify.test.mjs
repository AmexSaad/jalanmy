import {test} from 'node:test';
import assert from 'node:assert/strict';
import {geoRoutes,geoPlaces} from '../src/geoapify.mjs';
test('provider route converts metric distances and preserves turn and limit indexes',()=>{
 const result=geoRoutes({features:[{properties:{distance:1000,time:120,legs:[{polyline6:'test',steps:[{from_index:0,to_index:2,speed_limit:60,instruction:{type:'Left',text:'Turn left',streets:['Jalan Tebrau']}},{from_index:2,to_index:4,speed:80}]}]}}]});
 assert.equal(result.trip.summary.length,1);assert.equal(result.trip.legs[0].maneuvers[0].type,15);assert.equal(result.trip.legs[0].speedLimits[1].limit,null);
});
test('place results are constrained to Johor, Malaysia',()=>{
 assert.equal(geoPlaces({results:[{country_code:'my',state:'Johor',name:'A',lon:103.7,lat:1.5},{country_code:'sg',state:'Johor',name:'B'},{country_code:'my',state:'Melaka',name:'C'}]}).places.length,1);
});
test('empty provider route does not become a fake line',()=>assert.throws(()=>geoRoutes({features:[]})));
