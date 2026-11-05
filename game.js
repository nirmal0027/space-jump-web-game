(() => {
'use strict';
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const $ = id => document.getElementById(id);
const W = 440;
let width=440,height=800,dpr=1,scale=1;
const suits = {
  cyan:{main:'#54eaf5',dark:'#1598b7',glow:'#7cf8ff'},
  pink:{main:'#ff79c9',dark:'#bd3d91',glow:'#ff9cdb'},
  lime:{main:'#b0f46b',dark:'#5baf43',glow:'#d5ff91'},
  gold:{main:'#ffd36c',dark:'#c58a27',glow:'#ffe7a0'}
};
let selectedSuit='cyan', state='menu', muted=false, audioCtx=null;
let best=0,lifetimeStars=0;
let player, platforms=[], pickups=[], particles=[], floaters=[], stars=[];
let cameraY=0, altitude=0, maxAltitude=0, runStars=0, platformsLanded=0;
let lastTime=0, elapsed=0, shake=0, pointerX=null, keys={left:false,right:false};
let powers={rocket:0,magnet:0,shield:0}, shieldUsed=false, combo=0, lastBounce=0;
const GRAVITY=1450, MOVE=310, BASE_JUMP=690;
const rand=(a,b)=>a+Math.random()*(b-a);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const safeRead=(key,fallback)=>{try{const v=localStorage.getItem(key);return v===null?fallback:JSON.parse(v)}catch(_){return fallback}};
const safeWrite=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value))}catch(_){}};
best=Number(safeRead('astroBest',0))||0;
lifetimeStars=Number(safeRead('astroLifetimeStars',0))||0;
muted=!!safeRead('astroMuted',false);
$('soundBtn').textContent=muted?'♫̸':'♫';
$('menuBest').textContent=best+' m'; $('menuStars').textContent=lifetimeStars+' ✦';

function resize(){
  const rect=canvas.getBoundingClientRect();
  dpr=Math.min(window.devicePixelRatio||1,2.5);
  width=rect.width;height=rect.height;scale=width/W;
  canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
  ctx.setTransform(dpr*scale,0,0,dpr*scale,0,0);
}
window.addEventListener('resize',resize); resize();

function audio(){
  if(muted)return null;
  try{audioCtx ||= new (window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==='suspended')audioCtx.resume();return audioCtx}catch(_){return null}
}
function tone(freq,duration,type='sine',volume=.07,slide=0){
  const ac=audio();if(!ac)return;
  const o=ac.createOscillator(),g=ac.createGain(),now=ac.currentTime;
  o.type=type;o.frequency.setValueAtTime(freq,now);
  if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(30,freq+slide),now+duration);
  g.gain.setValueAtTime(volume,now);g.gain.exponentialRampToValueAtTime(.001,now+duration);
  o.connect(g);g.connect(ac.destination);o.start(now);o.stop(now+duration);
}
const sfx={
  bounce(){tone(330,.12,'sine',.055,240)},
  spring(){tone(520,.28,'triangle',.09,850);setTimeout(()=>tone(900,.16,'sine',.05,-250),70)},
  break(){tone(180,.2,'sawtooth',.045,-120)},
  star(){tone(740,.12,'sine',.05,500);setTimeout(()=>tone(1120,.16,'sine',.035,-100),65)},
  rocket(){tone(110,.38,'sawtooth',.055,260)},
  over(){tone(300,.5,'triangle',.07,-220);setTimeout(()=>tone(160,.7,'sine',.05,-90),180)}
};
function toggleSound(){muted=!muted;safeWrite('astroMuted',muted);$('soundBtn').textContent=muted?'♫̸':'♫';if(!muted)tone(520,.08)}
$('soundBtn').addEventListener('click',toggleSound);

function makeStars(){
  stars=[];for(let i=0;i<100;i++)stars.push({x:rand(0,W),y:rand(0,1100),r:rand(.5,1.8),d:rand(.12,.9),phase:rand(0,6.28),a:rand(.25,.85)});
}
function platform(y,x,type='solid'){
  return {x,y,w:type==='spring'?76:rand(65,84),h:12,type,baseX:x,range:rand(18,55),speed:rand(.7,1.5)*(Math.random()<.5?-1:1),phase:rand(0,6.28),alive:true};
}
function makeRun(){
  state='playing';$('startScreen').hidden=true;$('pauseScreen').hidden=true;$('gameOverScreen').hidden=true;
  $('hud').hidden=false;$('touchControls').hidden=false;
  cameraY=0;altitude=0;maxAltitude=0;runStars=0;platformsLanded=0;elapsed=0;shake=0;combo=0;lastBounce=0;
  powers={rocket:0,magnet:0,shield:0};shieldUsed=false;particles=[];floaters=[];pickups=[];
  player={x:W/2,y:height/scale-125,vx:0,vy:-BASE_JUMP,tilt:0,squash:0,rocketParticle:0,face:1};
  platforms=[platform(player.y+65,W/2-38,'solid')];
  let y=player.y-105;
  for(let i=0;i<12;i++){let type=choosePlatform(i*100);platforms.push(platform(y,rand(12,W-90),type));y-=rand(82,112);maybePickup(y+rand(-30,25));}
  makeStars();lastTime=performance.now();requestAnimationFrame(loop);
}
function choosePlatform(heightUp){
  const difficulty=clamp(heightUp/7000,0,1);
  let r=Math.random();
  if(r<.10+difficulty*.16)return 'brittle';
  if(r<.22+difficulty*.16)return 'moving';
  if(r<.32)return 'spring';
  return 'solid';
}
function maybePickup(y){
  if(Math.random()<.26){const type=Math.random()<.66?'star':(['rocket','magnet','shield'][Math.floor(rand(0,3))]);pickups.push({x:rand(35,W-35),y,type,phase:rand(0,6.28),taken:false});}
}
function spawnParticle(x,y,color,n=8,speed=130){
  for(let i=0;i<n;i++){let a=rand(0,Math.PI*2),v=rand(speed*.35,speed);particles.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life:rand(.25,.65),max:.65,size:rand(2,5),color,gravity:220});}
}
function floatText(text,x,y,color='#a8f8ff'){floaters.push({text,x,y,life:1.1,color});}
function bounce(p){
  const now=elapsed;
  combo=now-lastBounce<2.2?combo+1:1;lastBounce=now;
  const spring=p.type==='spring';
  player.vy=-(spring?BASE_JUMP*1.85:BASE_JUMP)*(1+Math.min(combo-1,4)*.045);
  player.squash=1;platformsLanded++;
  spawnParticle(player.x,player.y+15,spring?'#ffd76b':'#8bf7ff',spring?16:9,spring?210:130);
  if(spring){sfx.spring();floatText('SUPER SPRING!',player.x,player.y-28,'#ffe18a');}
  else{sfx.bounce();if(combo>1)floatText('COMBO x'+combo,player.x,player.y-25);}
  if(p.type==='brittle'){p.alive=false;sfx.break();for(let i=0;i<10;i++)spawnParticle(p.x+rand(0,p.w),p.y,'#ff648e',1,220);}
}
function collect(item){
  item.taken=true;
  if(item.type==='star'){runStars++;lifetimeStars++;safeWrite('astroLifetimeStars',lifetimeStars);sfx.star();floatText('+150 ALTITUDE',player.x,player.y-38,'#ffdf7a');altitude+=150;}
  else if(item.type==='rocket'){powers.rocket=3.6;player.vy=-1150;sfx.rocket();floatText('ROCKET BOOST!',player.x,player.y-35,'#ff9a62');}
  else if(item.type==='magnet'){powers.magnet=6;floatText('STAR MAGNET',player.x,player.y-35,'#9df8ff');tone(620,.2,'sine',.06,250);}
  else if(item.type==='shield'){powers.shield=1;floatText('BUBBLE SHIELD',player.x,player.y-35,'#8eeaff');tone(480,.22,'sine',.06,300);}
}
function gameOver(){
  if(state!=='playing')return;
  if(powers.shield>0&&!shieldUsed){
    shieldUsed=true;powers.shield=0;player.y=cameraY+height/scale-100;player.vy=-BASE_JUMP*1.35;
    spawnParticle(player.x,player.y,'#8beeff',24,240);floatText('SHIELD SAVED YOU!',player.x,player.y-30);return;
  }
  state='over';sfx.over();$('hud').hidden=true;$('touchControls').hidden=true;
  const score=Math.floor(maxAltitude);
  const record=score>best;if(record){best=score;safeWrite('astroBest',best);}
  $('finalScore').textContent=score;$('runStars').textContent=runStars;$('runPlatforms').textContent=platformsLanded;$('runBest').textContent=best+' m';
  $('recordBadge').hidden=!record;$('gameOverTitle').textContent=record?'NEW GALAXY RECORD!':'NICE FLIGHT!';
  $('gameOverScreen').hidden=false;
}
function pause(){if(state==='playing'){state='paused';$('pauseScreen').hidden=false;}}
function resume(){if(state==='paused'){$('pauseScreen').hidden=true;state='playing';lastTime=performance.now();requestAnimationFrame(loop);}}
$('pauseBtn').addEventListener('click',pause);$('resumeBtn').addEventListener('click',resume);
$('restartBtn').addEventListener('click',makeRun);$('replayBtn').addEventListener('click',makeRun);
$('homeBtn').addEventListener('click',()=>{state='menu';$('gameOverScreen').hidden=true;$('startScreen').hidden=false;$('menuBest').textContent=best+' m';$('menuStars').textContent=lifetimeStars+' ✦';});
$('launchBtn').addEventListener('click',()=>{audio();makeRun()});
$('suitOptions').addEventListener('click',e=>{const b=e.target.closest('[data-suit]');if(!b)return;selectedSuit=b.dataset.suit;document.querySelectorAll('.suit-choice').forEach(x=>x.classList.toggle('selected',x===b));});

window.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight',' ','ArrowUp','ArrowDown'].includes(e.key))e.preventDefault();if(e.key==='ArrowLeft'||e.key.toLowerCase()==='a')keys.left=true;if(e.key==='ArrowRight'||e.key.toLowerCase()==='d')keys.right=true;if(e.key==='Escape'||e.key==='p'){if(state==='playing')pause();else if(state==='paused')resume();}});
window.addEventListener('keyup',e=>{if(e.key==='ArrowLeft'||e.key.toLowerCase()==='a')keys.left=false;if(e.key==='ArrowRight'||e.key.toLowerCase()==='d')keys.right=false;});
function bindTouch(id,dir){const el=$(id);el.addEventListener('pointerdown',e=>{e.preventDefault();keys[dir]=true;el.setPointerCapture(e.pointerId)});['pointerup','pointercancel','lostpointercapture'].forEach(ev=>el.addEventListener(ev,()=>keys[dir]=false));}
bindTouch('leftBtn','left');bindTouch('rightBtn','right');
canvas.addEventListener('pointerdown',e=>{if(state==='playing'){const r=canvas.getBoundingClientRect();pointerX=(e.clientX-r.left)/scale;canvas.setPointerCapture(e.pointerId)}});
canvas.addEventListener('pointermove',e=>{if(pointerX!==null){const r=canvas.getBoundingClientRect();pointerX=(e.clientX-r.left)/scale}});
['pointerup','pointercancel','lostpointercapture'].forEach(ev=>canvas.addEventListener(ev,()=>pointerX=null));

function update(dt){
  elapsed+=dt;
  const h=height/scale;
  let dir=(keys.right?1:0)-(keys.left?1:0);
  if(pointerX!==null)dir=clamp((pointerX-player.x)/45,-1,1);
  player.vx=dir*MOVE;player.x+=player.vx*dt;
  player.face=dir===0?player.face:Math.sign(dir);player.tilt+=(player.face*.35-player.tilt)*Math.min(1,dt*8);
  if(player.x<-14)player.x=W+14;if(player.x>W+14)player.x=-14;
  const wasRocket=powers.rocket>0;
  if(powers.rocket>0){powers.rocket=Math.max(0,powers.rocket-dt);player.vy=-1180;if(Math.random()<.8)spawnParticle(player.x+rand(-8,8),player.y+16,'#ff9c5e',1,100);}
  else player.vy+=GRAVITY*dt;
  player.y+=player.vy*dt;
  player.squash=Math.max(0,player.squash-dt*4);
  platforms.forEach(p=>{if(p.type==='moving'&&p.alive){p.x=p.baseX+Math.sin(elapsed*p.speed+p.phase)*p.range;p.x=clamp(p.x,0,W-p.w)}});
  // Landing is only checked while descending; platforms can be crossed freely while rising.
  if(player.vy>0&&!wasRocket){
    for(const p of platforms){if(!p.alive)continue;const prevY=player.y-player.vy*dt;
      if(prevY+15<=p.y&&player.y+15>=p.y&&player.x+13>p.x&&player.x-13<p.x+p.w){player.y=p.y-15;bounce(p);break;}
    }
  }
  if(powers.magnet>0){powers.magnet=Math.max(0,powers.magnet-dt);for(const it of pickups){if(it.type==='star'&&!it.taken){const dx=player.x-it.x,dy=player.y-it.y,d=Math.hypot(dx,dy);if(d<150){it.x+=dx/d*190*dt;it.y+=dy/d*190*dt;}}}}
  pickups.forEach(it=>{if(it.taken)return;it.phase+=dt*2.5;if(Math.hypot(player.x-it.x,player.y-it.y)<27)collect(it)});
  cameraY=Math.min(cameraY,player.y-h*.48);
  altitude=Math.max(0,Math.floor(-cameraY+Math.max(0,h-125)));
  maxAltitude=Math.max(maxAltitude,altitude);
  // Generate platforms above the camera; spacing and hazards scale with altitude.
  let topY=cameraY-170;
  let highest=platforms.reduce((m,p)=>p.alive?Math.min(m,p.y):m,Infinity);
  while(highest>topY){const diff=clamp(altitude/9000,0,1),gap=rand(86,111)+diff*34;highest-=gap;const p=platform(highest,rand(5,W-90),choosePlatform(altitude));platforms.push(p);if(Math.random()<.30)maybePickup(highest-rand(15,48));}
  platforms=platforms.filter(p=>p.y<cameraY+h+100&&p.alive||p.y<cameraY+h+100);
  pickups=pickups.filter(it=>!it.taken&&it.y<cameraY+h+100);
  particles.forEach(p=>{p.life-=dt;p.vy+=p.gravity*dt;p.x+=p.vx*dt;p.y+=p.vy*dt});
  particles=particles.filter(p=>p.life>0);
  floaters.forEach(f=>{f.life-=dt;f.y-=30*dt});floaters=floaters.filter(f=>f.life>0);
  stars.forEach(s=>{s.y+=s.d*dt*23;if(s.y>h+10)s.y=-10;s.phase+=dt*2});
  if(player.y>cameraY+h+35)gameOver();
  $('altitude').textContent=altitude+' m';$('stars').textContent=runStars;
  renderPowers();
}
function renderPowers(){
  const list=$('powerList');const entries=[['ROCKET',powers.rocket,3.6,'#ff9d62'],['MAGNET',powers.magnet,6,'#7af3ff'],['SHIELD',powers.shield,1,'#a4eaff']].filter(x=>x[1]>0);
  list.innerHTML=entries.map(([n,v,max,c])=>`<div class="power">${n}<span style="float:right">${v.toFixed(1)}s</span><div class="power-track"><div class="power-fill" style="width:${v/max*100}%;background:${c}"></div></div></div>`).join('');
}
function background(h){
  const t=clamp(altitude/12000,0,1);
  const g=ctx.createLinearGradient(0,0,0,h);
  g.addColorStop(0,`rgb(${Math.round(12-7*t)},${Math.round(17-12*t)},${Math.round(54-30*t)})`);
  g.addColorStop(.55,`rgb(${Math.round(34-25*t)},${Math.round(22-18*t)},${Math.round(83-62*t)})`);
  g.addColorStop(1,`rgb(${Math.round(9-7*t)},${Math.round(9-7*t)},${Math.round(34-29*t)})`);
  ctx.fillStyle=g;ctx.fillRect(0,0,W,h);
  // Nebula haze
  const neb=ctx.createRadialGradient(W*.72,h*.35,10,W*.72,h*.35,W*.72);
  neb.addColorStop(0,`rgba(104,54,174,${.17*(1-t*.5)})`);neb.addColorStop(1,'rgba(40,20,90,0)');
  ctx.fillStyle=neb;ctx.fillRect(0,0,W,h);
}
function drawPlatform(p){
  if(!p.alive)return;
  const colors={solid:['#22d69d','#087d70'],moving:['#62edff','#168ba9'],brittle:['#ff668e','#a52e60'],spring:['#ffe17a','#b87920']};
  const [a,b]=colors[p.type];ctx.save();ctx.translate(p.x,p.y-cameraY);
  ctx.shadowColor=a;ctx.shadowBlur=12;ctx.fillStyle=b;roundRect(0,3,p.w,p.h,6);ctx.fill();
  ctx.shadowBlur=0;ctx.fillStyle=a;roundRect(0,0,p.w,p.h-3,6);ctx.fill();
  ctx.fillStyle='#ffffff55';roundRect(7,2,p.w-14,2,2);ctx.fill();
  if(p.type==='spring'){ctx.strokeStyle='#fff3b0';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(p.w/2-12,0);ctx.lineTo(p.w/2-6,-7);ctx.lineTo(p.w/2,0);ctx.lineTo(p.w/2+6,-7);ctx.lineTo(p.w/2+12,0);ctx.stroke();}
  ctx.restore();
}
function roundRect(x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r)}
function drawPlayer(){
  const y=player.y-cameraY,s=suits[selectedSuit];
  ctx.save();ctx.translate(player.x,y);ctx.rotate(player.tilt);
  const squash=player.squash;ctx.scale(1+squash*.18,1-squash*.2);
  // backpack
  ctx.fillStyle=s.dark;roundRect(-19,-1,9,26,5);ctx.fill();
  // legs and boots
  ctx.fillStyle='#dcecff';roundRect(-12,14,9,13,4);ctx.fill();roundRect(3,14,9,13,4);ctx.fill();
  ctx.fillStyle=s.dark;roundRect(-14,23,13,7,3);ctx.fill();roundRect(1,23,13,7,3);ctx.fill();
  // body
  ctx.shadowColor=s.glow;ctx.shadowBlur=13;ctx.fillStyle=s.main;roundRect(-16,-11,32,31,12);ctx.fill();ctx.shadowBlur=0;
  ctx.fillStyle='#f3fbff';roundRect(-7,-2,14,12,4);ctx.fill();
  ctx.fillStyle=s.dark;ctx.beginPath();ctx.arc(0,4,3,0,Math.PI*2);ctx.fill();
  // arms
  ctx.strokeStyle='#e9f6ff';ctx.lineWidth=7;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-13,-5);ctx.lineTo(-22,4+Math.sin(elapsed*9)*2);ctx.moveTo(13,-5);ctx.lineTo(22,4-Math.sin(elapsed*9)*2);ctx.stroke();
  // helmet
  ctx.shadowColor=s.glow;ctx.shadowBlur=15;ctx.fillStyle='#eaf7ff';ctx.beginPath();ctx.arc(0,-20,18,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
  ctx.fillStyle='#132c53';ctx.beginPath();ctx.ellipse(0,-20,14,12,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#83edff';ctx.globalAlpha=.75;ctx.beginPath();ctx.ellipse(-5,-25,5,2.5,-.5,0,Math.PI*2);ctx.fill();
  ctx.globalAlpha=.22;ctx.beginPath();ctx.ellipse(6,-15,3,1.5,.5,0,Math.PI*2);ctx.fill();
  ctx.restore();
}
function render(){
  const h=height/scale;ctx.save();ctx.setTransform(dpr*scale,0,0,dpr*scale,0,0);
  if(shake>0){ctx.translate(rand(-shake,shake),rand(-shake,shake));shake*=.85;}
  background(h);
  stars.forEach(s=>{const y=((s.y-cameraY*s.d*.15)% (h+20)+h+20)%(h+20);ctx.globalAlpha=s.a*(.55+.45*Math.sin(s.phase));ctx.fillStyle='#d9f7ff';ctx.beginPath();ctx.arc(s.x,y,s.r,0,Math.PI*2);ctx.fill()});ctx.globalAlpha=1;
  // distant glowing orbital arcs
  ctx.strokeStyle='#9c9dff12';ctx.lineWidth=1;for(let i=0;i<3;i++){ctx.beginPath();ctx.ellipse(220,((i*260-cameraY*.18)%(h+300))-100,250,55,0,0,Math.PI*2);ctx.stroke();}
  platforms.forEach(drawPlatform);
  pickups.forEach(it=>{if(it.taken)return;const y=it.y-cameraY;ctx.save();ctx.translate(it.x,y+Math.sin(it.phase)*4);if(it.type==='star'){ctx.shadowColor='#ffe27b';ctx.shadowBlur=15;ctx.fillStyle='#ffe27b';ctx.font='24px serif';ctx.textAlign='center';ctx.fillText('✦',0,8)}else{const c={rocket:'#ff9a61',magnet:'#71f3ff',shield:'#9adfff'}[it.type];ctx.shadowColor=c;ctx.shadowBlur=15;ctx.fillStyle=c;ctx.beginPath();ctx.arc(0,0,12,0,Math.PI*2);ctx.fill();ctx.fillStyle='#13244a';ctx.font='bold 12px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText({rocket:'↑',magnet:'✧',shield:'◇'}[it.type],0,1)}ctx.restore()});
  particles.forEach(p=>{ctx.globalAlpha=clamp(p.life/p.max,0,1);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y-cameraY,p.size,0,Math.PI*2);ctx.fill()});ctx.globalAlpha=1;
  floaters.forEach(f=>{ctx.globalAlpha=clamp(f.life,0,1);ctx.fillStyle=f.color;ctx.font='bold 11px Orbitron,monospace';ctx.textAlign='center';ctx.fillText(f.text,f.x,f.y-cameraY)});ctx.globalAlpha=1;
  if(state==='playing'){drawPlayer();if(powers.shield>0){ctx.strokeStyle='#8deeffaa';ctx.lineWidth=2;ctx.shadowColor='#8deeff';ctx.shadowBlur=15;ctx.beginPath();ctx.arc(player.x,player.y-cameraY,29,0,Math.PI*2);ctx.stroke();ctx.shadowBlur=0;}}
  ctx.restore();
}
function loop(now){
  if(state!=='playing')return;
  const dt=Math.min((now-lastTime)/1000,.032);lastTime=now;
  update(dt);render();
  if(state==='playing')requestAnimationFrame(loop);
}
function idleRender(now){
  if(state!=='menu')return;
  elapsed=now/1000;cameraY=0;
  if(!stars.length)makeStars();
  const h=height/scale;background(h);
  stars.forEach(s=>{const y=(s.y+now*.004*s.d)%(h+10);ctx.globalAlpha=s.a*(.55+.45*Math.sin(now*.001+s.phase));ctx.fillStyle='#d9f7ff';ctx.beginPath();ctx.arc(s.x,y,s.r,0,Math.PI*2);ctx.fill()});ctx.globalAlpha=1;
  requestAnimationFrame(idleRender);
}
makeStars();requestAnimationFrame(idleRender);
})();