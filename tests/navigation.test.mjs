import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cumulative,project,instruction,aheadReport} from '../src/navigation.mjs';
test('route projection follows segment rather than nearest vertex',()=>{const route=[[103.7,1.5],[103.71,1.5]],p=project([103.705,1.5001],route,cumulative(route));assert.ok(p.distance<12&&p.progress>550&&p.progress<560);});
test('alerts exclude reports behind driver or on a parallel road',()=>{const route=[[103.7,1.5],[103.72,1.5]],lengths=cumulative(route);assert.equal(aheadReport({lon:103.701,lat:1.5},route,500,lengths,[103.705,1.5]),null);assert.equal(aheadReport({lon:103.71,lat:1.502},route,500,lengths,[103.705,1.5]),null);assert.ok(aheadReport({lon:103.71,lat:1.5},route,500,lengths,[103.705,1.5])>0);});
test('Malay instruction includes road and roundabout exit',()=>{assert.equal(instruction({type:15,street_names:['Jalan Tebrau']}),'Belok kiri ke Jalan Tebrau');assert.match(instruction({type:27,roundabout_exit_count:3}),/3/);});
