#!/usr/bin/env node
'use strict';
// Offline UI contract regression: extract only pure player-card construction,
// replace browser DOM with a tiny fake. No network or Minecraft commands.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('app/public/assets/app.js','utf8');
const from=source.indexOf('function inlinePlayerActions(name,entry){');
const until=source.indexOf('// Roles are matched only',from);
assert.ok(from>=0 && until>from,'player action renderer must exist');
const issued=[];
class Element{
 constructor(tag){this.tag=tag;this.children=[];this.attrs={};this.events={};this.className='';this.textContent='';}
 append(child){this.children.push(child);}
 setAttribute(key,value){this.attrs[key]=value;}
 addEventListener(event,callback){this.events[event]=callback;}
}
const ctx={document:{createElement:tag=>new Element(tag)},playerCommand:(command,name)=>issued.push([command,name])};
vm.createContext(ctx);
vm.runInContext(source.slice(from,until),ctx);
function buttons(entry){
 const outer=ctx.inlinePlayerActions('Alex Builder',entry);
 return outer.children;
}
function click(b){b.events.click();}
let a=buttons({permission_known:true,permission:'operator'});
assert.equal(a.length,2);
assert.equal(a[0].textContent,'✓ Allow');
assert.equal(a[0].attrs['aria-pressed'],'true');
assert.equal(a[1].textContent,'✓ OP');
assert.equal(a[1].attrs['aria-pressed'],'true');
click(a[0]);click(a[1]);
assert.deepEqual(issued,[['allowlist-remove','Alex Builder'],['deop','Alex Builder']]);
issued.length=0;
a=buttons({permission_known:true,permission:'member'});
assert.equal(a[1].textContent,'OP');
assert.equal(a[1].attrs['aria-pressed'],'false');
click(a[1]);
assert.deepEqual(issued,[['op','Alex Builder']]);
issued.length=0;
a=buttons(undefined);
assert.equal(a[0].textContent,'Allow');
assert.equal(a[0].attrs['aria-pressed'],'false');
assert.equal(a.length,3);
assert.equal(a[1].attrs['aria-pressed'],undefined);
assert.equal(a[2].textContent,'deOP');
click(a[0]);click(a[2]);
assert.deepEqual(issued,[['allowlist-add','Alex Builder'],['deop','Alex Builder']]);
console.log('OK: reversible Allow / OP buttons, checked-state and unknown-role safety');
