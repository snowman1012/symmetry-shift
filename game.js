(() => {
  'use strict';
  const {Physics,levels,edgesOf,pointDistance}=window.SymmetryPhysics;
  const NS='http://www.w3.org/2000/svg';
  const $=selector=>document.querySelector(selector);
  const grid=$('#grid'), ticks=$('#ticks'), geometry=$('#geometry'), player=$('#player');
  const menu=$('#menu'), game=$('#game'), status=$('#status'), goalMarkers=$('#goal-markers');
  const buttons=[...document.querySelectorAll('.transform')];
  const touchBar=$('#touch-controls');
  const touchButtons=[...document.querySelectorAll('[data-control]')];
  const keys=new Set();
  const pointers=new Map();
  let completed=0;
  let physics=new Physics(levels[0]), selectedId=null, timer=0, active=false;
  let lastTime=0, accumulator=0, winHandled=false;
  let boardWidth=600;
  const scale=()=>240/physics.level.radius;
  const px=x=>300+x*scale(), py=y=>300-y*scale();
  function refreshTouchButtons() {
    for(const button of touchButtons) {
      const pressed=[...pointers.values()].some(pointer=>pointer.button===button);
      button.classList.toggle('is-pressed',pressed);
      button.setAttribute('aria-pressed',String(pressed));
    }
  }
  function clearInput() {
    keys.clear();
    const captured=[...pointers.entries()];pointers.clear();
    for(const [id,pointer] of captured) {
      if(pointer.button.hasPointerCapture?.(id))pointer.button.releasePointerCapture(id);
    }
    refreshTouchButtons();
  }
  function releasePointer(event) {
    if(!pointers.delete(event.pointerId))return;
    refreshTouchButtons();
  }
  function movementDirection() {
    const held=[...pointers.values()];
    const right=keys.has('ArrowRight')||held.some(pointer=>pointer.action==='right');
    const left=keys.has('ArrowLeft')||held.some(pointer=>pointer.action==='left');
    return Number(right)-Number(left);
  }
  const make=(tag,attributes,parent)=>{
    const node=document.createElementNS(NS,tag);
    Object.entries(attributes).forEach(([key,value])=>node.setAttribute(key,value));
    parent.append(node);return node;
  };
  function drawGrid() {
    grid.replaceChildren();ticks.replaceChildren();
    const radius=physics.level.radius;
    for(let n=-radius;n<=radius;n++) {
      if(!n)continue;
      make('line',{x1:px(n),y1:60,x2:px(n),y2:540,class:'gridline'},grid);
      make('line',{x1:60,y1:py(n),x2:540,y2:py(n),class:'gridline'},grid);
      make('line',{x1:px(n),y1:297,x2:px(n),y2:303,class:'tick'},ticks);
      make('line',{x1:297,y1:py(n),x2:303,y2:py(n),class:'tick'},ticks);
      if(radius<=5 || n%2===0) {
        make('text',{x:px(n),y:315,class:'number'},ticks).textContent=n;
        make('text',{x:284,y:py(n),class:'number'},ticks).textContent=n;
      }
    }
    make('text',{x:288,y:314,class:'number'},ticks).textContent='0';
    goalMarkers.replaceChildren();
    make('circle',{cx:px(physics.level.goal.x),cy:py(physics.level.goal.y),r:7,class:'goal'},goalMarkers);
    make('circle',{cx:px(physics.level.goal.x),cy:py(physics.level.goal.y),r:2,class:'goal-core'},goalMarkers);
  }
  function drawShapes() {
    geometry.replaceChildren();
    // Paint every visible edge first, then every click target above them.
    for(const shape of physics.shapes) for(const {a,b} of edgesOf(shape))
      make('line',{x1:px(a.x),y1:py(a.y),x2:px(b.x),y2:py(b.y),class:'platform'+(selectedId===shape.id?' selected':'')},geometry);
    for(const shape of physics.shapes) {
      const path=shape.points.map((p,i)=>`${i?'L':'M'} ${px(p.x)} ${py(p.y)}`).join(' ')+(shape.closed?' Z':'');
      make('path',{d:path,class:'shape-hit',fill:'none','data-id':shape.id},geometry);
    }
  }
  function drawPlayer() {
    // Keep the feet anchored, but preserve a 24 CSS-pixel figure on large maps.
    const figureScale=Math.max(scale()*.6,24*600/boardWidth)/25;
    player.setAttribute('transform',`translate(${px(physics.pos.x)} ${py(physics.pos.y)}) scale(${figureScale})`);
  }
  function updateBoardSize() {
    boardWidth=$('#board').getBoundingClientRect?.().width||600;
    drawPlayer();
  }
  window.addEventListener('resize',updateBoardSize);
  if(typeof ResizeObserver!=='undefined') new ResizeObserver(updateBoardSize).observe($('#board'));
  function showMenu() {
    active=false;clearInput();menu.hidden=false;game.hidden=true;touchBar.hidden=true;
    const stageGrid=$('#stage-grid');stageGrid.replaceChildren();
    for(const level of levels) {
      const button=document.createElement('button');button.type='button';button.className='stage-button';
      button.textContent=`stage${level.number}`;button.disabled=level.number>completed+1;
      button.addEventListener('click',()=>startStage(level.number));stageGrid.append(button);
    }
  }
  function startStage(number) {
    clearTimeout(timer);physics.reset(levels[number-1]);selectedId=null;winHandled=false;
    clearInput();accumulator=0;lastTime=0;status.textContent='';
    buttons.forEach(button=>button.disabled=true);
    $('#game-title').textContent=`stage${number}`;
    menu.hidden=true;game.hidden=false;touchBar.hidden=false;active=true;
    drawGrid();drawShapes();updateBoardSize();
    $('#board').focus({preventScroll:true});
  }
  $('#reset').addEventListener('click',()=>startStage(physics.level.number));
  geometry.addEventListener('click',event=>{
    const hit=event.target.closest('[data-id]');
    if(!hit || physics.won)return;
    selectedId=hit.dataset.id;
    // Wide touch targets can overlap; select the nearest actual outline.
    const rect=$('#board').getBoundingClientRect?.();
    if(rect && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
      const point={x:((event.clientX-rect.left)*600/rect.width-300)/scale(),y:(300-(event.clientY-rect.top)*600/rect.height)/scale()};
      let nearest=Infinity;
      for(const shape of physics.shapes) {
        const gap=Math.min(...edgesOf(shape).map(edge=>pointDistance(point,edge.a,edge.b)));
        if(gap<nearest) {nearest=gap;selectedId=shape.id;}
      }
    }
    buttons.forEach(button=>button.disabled=false);drawShapes();
    $('#board').focus({preventScroll:true});
  });
  buttons.forEach(button=>button.addEventListener('click',()=>{
    if(!selectedId)return;
    physics.transform(selectedId,button.dataset.transform);drawShapes();
    $('#board').focus({preventScroll:true});
  }));
  for(const button of touchButtons) {
    button.addEventListener('pointerdown',event=>{
      if(!active || physics.won || (event.pointerType==='mouse' && event.button!==0))return;
      event.preventDefault();
      pointers.set(event.pointerId,{button,action:button.dataset.control});
      button.setPointerCapture?.(event.pointerId);
      refreshTouchButtons();
      if(button.dataset.control==='jump')physics.jump();
    });
    for(const name of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(name,releasePointer);
    button.addEventListener('contextmenu',event=>event.preventDefault());
    button.addEventListener('click',event=>{
      // Native keyboard/assistive activation; pointer taps jump on pointerdown.
      if(event.detail===0 && active && button.dataset.control==='jump')physics.jump();
    });
  }
  window.addEventListener('pointerup',releasePointer);
  window.addEventListener('pointercancel',releasePointer);
  window.addEventListener('keydown',event=>{
    if(!active)return;
    if(event.code==='AltLeft' || event.code==='AltRight' || event.key==='Alt') {
      event.preventDefault();if(!event.repeat)physics.jump();return;
    }
    if(event.code==='ArrowLeft' || event.code==='ArrowRight') {event.preventDefault();keys.add(event.code);}
  },{capture:true});
  window.addEventListener('keyup',event=>keys.delete(event.code));
  window.addEventListener('blur',clearInput);
  window.addEventListener('pagehide',clearInput);
  window.addEventListener('orientationchange',()=>{clearInput();updateBoardSize();});
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden) {clearInput();lastTime=0;accumulator=0;}
  });
  function frame(now) {
    if(active) {
      accumulator+=Math.min(lastTime?(now-lastTime)/1000:0, .05);
      const direction=movementDirection();
      while(accumulator>=1/120) {physics.tick(direction,1/120);accumulator-=1/120;}
      drawPlayer();
      if(physics.won && !winHandled) {
        winHandled=true;completed=Math.max(completed,physics.level.number);
        clearInput();
        status.textContent=`stage${physics.level.number} clear`;
        timer=setTimeout(showMenu,900);
      }
    }
    lastTime=now;requestAnimationFrame(frame);
  }
  showMenu();requestAnimationFrame(frame);
})();
