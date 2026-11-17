// Zero-dependency font parser checks. node --experimental-strip-types tests/check_font_data.ts
import assert from 'node:assert/strict';
import { parseFontZones } from '../src/fontData.ts';

const fixture = `console.log('load _tone_x');
var _tone_x={
	zones:[
		//_tone.Gd_pno_C0_R_
		{
			midi:0
			,originalPitch:2400
			,keyRangeLow:0
			,keyRangeHigh:27
			,coarseTune:0
			,fineTune:0
			,loopStart:133802
			,loopEnd:135153
			,sampleRate:44100
			,ahdsr:true
			,file:'SUQzBAAAAAAAI1RTU0UAAAAPAAAD//tAwA==' // base64 contains // too
		}
		,{
			midi:1
			,originalPitch:2400
			,keyRangeLow:28
			,keyRangeHigh:40
			,coarseTune:0
			,fineTune:0
			,loopStart:10
			,loopEnd:20
			,sampleRate:44100
			,sample:'AAAABBBB'
		}
	]
};`;

const zones = parseFontZones(fixture);
assert.equal(zones.length, 2);
assert.equal(zones[0].originalPitch, 2400);
assert.equal(zones[0].file, 'SUQzBAAAAAAAI1RTU0UAAAAPAAAD//tAwA==');
assert.equal(zones[1].sample, 'AAAABBBB');
assert.throws(() => parseFontZones('var x = 1;'), /missing object literal/);
assert.throws(() => parseFontZones('var x={ zones:1 };'), /no zones array/);

console.log('font parser checks passed');
