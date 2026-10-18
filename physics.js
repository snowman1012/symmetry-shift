(function (root) {
  'use strict';
  const GRAVITY = 14;
  const JUMP_SPEED = Math.sqrt(2 * GRAVITY);
  // A full jump rises one unit and travels at most one unit sideways.
  const AIR_SPEED = GRAVITY / (2 * JUMP_SPEED);
  const WALK_SPEED = 2.6;
  const EPS = 1e-7;
  const reflect = (p, mode) => ({
    x: mode === 'y' || mode === 'o' ? -p.x : mode === 'd' ? p.y : p.x,
    y: mode === 'x' || mode === 'o' ? -p.y : mode === 'd' ? p.x : p.y
  });
  const copy = p => ({ x: p.x, y: p.y });
  const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
  const pointDistance = (p,a,b) => {
    const dx=b.x-a.x, dy=b.y-a.y;
    const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy || 1)));
    return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
  };
  const cross = (a,b) => a.x*b.y-a.y*b.x;
  const intersection = (a,b,c,d) => {
    const r={x:b.x-a.x,y:b.y-a.y}, s={x:d.x-c.x,y:d.y-c.y};
    const denominator=cross(r,s);
    if (Math.abs(denominator)<EPS) return null;
    const offset={x:c.x-a.x,y:c.y-a.y};
    const t=cross(offset,s)/denominator, u=cross(offset,r)/denominator;
    return t>=-EPS && t<=1+EPS && u>=-EPS && u<=1+EPS ? {x:a.x+t*r.x,y:a.y+t*r.y,t} : null;
  };
  const edgesOf = shape => {
    const result=shape.points.slice(1).map((b,i)=>({a:shape.points[i],b,shape,index:i}));
    if(shape.closed) result.push({a:shape.points.at(-1),b:shape.points[0],shape,index:shape.points.length-1});
    return result;
  };
  const yAt = (edge,x) => {
    const {a,b}=edge;
    if(Math.abs(b.x-a.x)<EPS || x<Math.min(a.x,b.x)-EPS || x>Math.max(a.x,b.x)+EPS) return null;
    return a.y+(b.y-a.y)*(x-a.x)/(b.x-a.x);
  };
  function piece(kind,x,y,width,rise) {
    if(kind==='triangle') return {closed:true,points:[{x,y},{x:x+width,y:y+rise},{x:x+width,y:y+rise-.45}]};
    if(kind==='parabola' || kind==='arc') return {points:Array.from({length:33},(_,i)=>{
      const t=i/32;
      const height=kind==='parabola' ? .3*t+.7*t*t : 1-Math.sqrt(Math.max(0,1-t*t));
      return {x:x+width*t,y:y+rise*height};
    })};
    return {points:[{x,y},{x:x+width,y:y+rise}]};
  }
  const specs=[
    {radius:4,kinds:['line'],modes:['y'],width:2,rise:1.2,gap:0,step:0},
    {radius:5,kinds:['line','line'],modes:['y','x'],width:1.6,rise:1.3,gap:.6,step:.05},
    {radius:7,kinds:['line','triangle','line'],modes:['y','o','x'],width:1.6,rise:1.3,gap:.65,step:.1},
    {radius:8,kinds:['line','parabola','arc'],modes:[['d','x'],['d','y'],['x','d']],width:1.8,rise:1.5,gap:.7,step:.12}
  ];
  const levels=specs.map((spec,index)=>{
    const shapes=spec.kinds.map((kind,i)=>{
      const x=i*(spec.width+spec.gap), y=i*(spec.rise+spec.step);
      const desired=piece(kind,x,y,spec.width,spec.rise);
      const solution=Array.isArray(spec.modes[i]) ? spec.modes[i] : [spec.modes[i]];
      // Invert the complete sequence to generate a genuine geometry puzzle.
      const initial=desired.points.map(p=>[...solution].reverse().reduce((point,mode)=>reflect(point,mode),p));
      return {id:`shape-${i+1}`,kind,closed:Boolean(desired.closed),solution,
        solvedPoints:desired.points.map(copy),points:initial};
    });
    return {number:index+1,radius:spec.radius,goal:copy(shapes.at(-1).solvedPoints[shapes.at(-1).kind==='triangle'?1:shapes.at(-1).solvedPoints.length-1]),shapes};
  });
  // The final puzzle doubles back across the plane instead of repeating ramps.
  const finalShapes=[
    {kind:'hook',solution:['d','x'],points:[{x:0,y:0},{x:1.25,y:.8},{x:.8,y:1.65},{x:2.2,y:2.4},{x:3.2,y:2.4}]},
    {kind:'kite',closed:true,solution:['x','d'],points:[{x:3.9,y:2.5},{x:5.5,y:3.4},{x:5,y:4.5},{x:4.3,y:4}]},
    {kind:'semicircle',solution:['d','x'],points:Array.from({length:65},(_,i)=>{
      const angle=Math.PI*i/64;
      return {x:3.2+1.1*Math.cos(angle),y:4.7+1.1*Math.sin(angle)};
    })},
    {kind:'trapezoid',closed:true,solution:['x','d'],points:[{x:1.4,y:4.9},{x:.6,y:6},{x:-1.3,y:6.6},{x:-.6,y:5.25}]},
    {kind:'star',closed:true,solution:['d','x'],points:Array.from({length:10},(_,i)=>{
      const angle=Math.PI*i/5, radius=i%2?.48:1.1;
      return {x:-3.1+radius*Math.cos(angle),y:6.9+radius*Math.sin(angle)};
    })}
  ].map((shape,i)=>({...shape,id:`shape-${i+1}`,solvedPoints:shape.points.map(copy),
    points:shape.points.map(p=>[...shape.solution].reverse().reduce((point,mode)=>reflect(point,mode),p))}));
  levels.push({number:5,radius:10,goal:copy(finalShapes[4].solvedPoints[2]),shapes:finalShapes});
  class Physics {
    constructor(level) { this.reset(level); }
    reset(level) {
      this.level=level;
      this.shapes=level.shapes.map(s=>({...s,points:s.points.map(copy),moves:0}));
      this.pos={x:0,y:0}; this.vy=0; this.grounded=true;
      this.support=null; this.jumpIgnoreId=null; this.won=false;
      this.visited=new Set();
    }
    edges() {return this.shapes.flatMap(edgesOf);}
    supportAt(p,direction=0) {
      const candidates=this.edges().filter(e=>{
        const surface=yAt(e,p.x);
        return surface!==null && Math.abs(p.y-surface)<.012;
      });
      candidates.sort((a,b)=>{
        const forward=e=>direction>0?Math.max(e.a.x,e.b.x)>p.x+EPS:direction<0?Math.min(e.a.x,e.b.x)<p.x-EPS:true;
        const score=e=>{
          const ascent=(direction||1)*Math.atan((e.b.y-e.a.y)/(e.b.x-e.a.x));
          return (forward(e)?1000:0)+(ascent>EPS?100:0)+(this.support?.shape.id===e.shape.id?10:0)+(this.support?.shape.id===e.shape.id && this.support.index===e.index?1:0)+ascent;
        };
        return score(b)-score(a);
      });
      return candidates[0]||null;
    }
    transform(id,mode) {
      const shape=this.shapes.find(s=>s.id===id);
      if(!shape || this.won) return;
      shape.points=shape.points.map(p=>reflect(p,mode)); shape.moves++;
      this.support=null;
      if(this.pos.y>.001 && !this.supportAt(this.pos)) this.grounded=false;
    }
    catchEndpoint(direction,forJump=false) {
      if(this.vy>EPS)return false;
      const candidates=[];
      for(const edge of this.edges()) {
        if(Math.abs(edge.b.x-edge.a.x)<EPS)continue;
        for(const tip of [edge.a,edge.b]) {
          if(Math.abs(this.pos.x-tip.x)>.13 || Math.abs(this.pos.y-tip.y)>.16)continue;
          const x=Math.max(Math.min(edge.a.x,edge.b.x),Math.min(Math.max(edge.a.x,edge.b.x),this.pos.x));
          const surface=yAt(edge,x);
          if(surface===null || Math.abs(surface-this.pos.y)>.18)continue;
          const forward=direction>0 ? Math.max(edge.a.x,edge.b.x)>x+EPS : direction<0 ? Math.min(edge.a.x,edge.b.x)<x-EPS : forJump;
          if(!forward)continue;
          candidates.push({edge,x,y:surface,error:Math.hypot(this.pos.x-x,this.pos.y-surface),slope:(edge.b.y-edge.a.y)/(edge.b.x-edge.a.x)});
        }
      }
      candidates.sort((a,b)=>a.error-b.error || b.slope-a.slope);
      const contact=candidates[0];
      if(!contact)return false;
      this.pos={x:contact.x,y:contact.y};this.vy=0;this.grounded=true;
      this.support=contact.edge;this.jumpIgnoreId=null;this.visited.add(contact.edge.shape.id);
      return true;
    }
    jump() {
      if(!this.grounded)this.catchEndpoint(0,true);
      if(!this.grounded || this.won) return false;
      this.jumpIgnoreId=this.supportAt(this.pos)?.shape.id||null;
      this.support=null; this.grounded=false; this.vy=JUMP_SPEED;
      return true;
    }
    bodyBlocked(p,ignored=[],previous=null) {
      const penetration=(position,edge)=>{
        const low={x:position.x,y:position.y+.13}, high={x:position.x,y:position.y+.53};
        const gap=intersection(low,high,edge.a,edge.b) ? 0 : Math.min(pointDistance(low,edge.a,edge.b),pointDistance(high,edge.a,edge.b),pointDistance(edge.a,low,high),pointDistance(edge.b,low,high));
        return Math.max(0,.075-gap);
      };
      return this.edges().some(edge=>{
        if(ignored.includes(edge.shape.id))return false;
        // A walkable edge supports the feet. Its slope must not trap the torso
        // before the feet can reach the landing surface, especially near tips.
        const surface=yAt(edge,p.x);
        if(surface!==null && p.y>=surface-.012)return false;
        const depth=penetration(p,edge);
        if(depth<=EPS)return false;
        // Existing contact must allow movement that leaves or slides out of it.
        const oldDepth=previous?penetration(previous,edge):0;
        return !(oldDepth>EPS && depth<=oldDepth+EPS);
      });
    }
    walk(direction,dt) {
      let edge=this.supportAt(this.pos,direction);
      if(!edge && this.pos.y>.005) {this.grounded=false;return;}
      if(!edge) {
        const next={x:this.pos.x+direction*WALK_SPEED*dt,y:0};
        if(!this.bodyBlocked(next,[],this.pos)) this.pos=next;
        this.support=null; return;
      }
      let remaining=WALK_SPEED*dt;
      for(let iteration=0;iteration<50 && remaining>EPS;iteration++) {
        const target=direction>0?(edge.a.x>edge.b.x?edge.a:edge.b):(edge.a.x<edge.b.x?edge.a:edge.b);
        const length=distance(this.pos,target);
        if(length>remaining) {
          const ratio=remaining/length;
          const next={x:this.pos.x+(target.x-this.pos.x)*ratio,y:this.pos.y+(target.y-this.pos.y)*ratio};
          if(!this.bodyBlocked(next,[edge.shape.id],this.pos)) this.pos=next;
          remaining=0;
        } else {
          this.pos=copy(target); remaining-=length;
          const next=this.edges().filter(e=>!(e.shape.id===edge.shape.id && e.index===edge.index) && Math.abs(e.b.x-e.a.x)>EPS && (distance(e.a,this.pos)<EPS || distance(e.b,this.pos)<EPS) && (direction>0?Math.max(e.a.x,e.b.x)>this.pos.x+EPS:Math.min(e.a.x,e.b.x)<this.pos.x-EPS));
          if(next.length) edge=next[0];
          else if(remaining>EPS) {this.grounded=false;this.support=null;this.vy=0;this.jumpIgnoreId=edge.shape.id;this.pos.x+=direction*remaining;return;}
        }
      }
      this.support=edge; this.visited.add(edge.shape.id);
    }
    airborne(direction,dt) {
      const old=copy(this.pos);
      if(this.jumpIgnoreId && !this.edges().some(e=>e.shape.id===this.jumpIgnoreId && pointDistance(old,e.a,e.b)<.22)) this.jumpIgnoreId=null;
      let nextX=old.x+direction*AIR_SPEED*dt;
      if(this.bodyBlocked({x:nextX,y:old.y},[this.jumpIgnoreId],old)) nextX=old.x;
      const next={x:nextX,y:old.y+this.vy*dt-.5*GRAVITY*dt*dt};
      this.vy-=GRAVITY*dt;
      let landing=null;
      if(this.vy<=0) {
        for(const edge of this.edges()) {
          if(Math.abs(edge.b.x-edge.a.x)<EPS) continue;
          const hit=intersection(old,next,edge.a,edge.b);
          const continuesOnSurface=yAt(edge,next.x)!==null;
          if(hit && (hit.t>EPS || continuesOnSurface) && (!landing || hit.t<landing.hit.t)) landing={edge,hit};
        }
      }
      if(landing) {
        this.pos={x:landing.hit.x,y:landing.hit.y};this.support=landing.edge;
        this.grounded=true;this.vy=0;this.jumpIgnoreId=null;this.visited.add(landing.edge.shape.id);
      } else if(next.y<=0 && old.y>=0 && this.vy<=0) {
        this.pos={x:next.x,y:0};this.vy=0;this.grounded=true;this.support=null;this.jumpIgnoreId=null;
      } else if(next.y>old.y+EPS && this.bodyBlocked(next,[this.jumpIgnoreId],{x:nextX,y:old.y})) {
        this.pos={x:next.x,y:old.y};this.vy=0;
      } else this.pos=next;
    }
    tick(direction,dt) {
      if(this.won)return;
      if(!this.grounded && direction)this.catchEndpoint(direction);
      const wasGrounded=this.grounded;
      if(this.grounded && direction) this.walk(direction,dt);
      if(!this.grounded) this.airborne(direction,wasGrounded?dt*.5:dt);
      this.pos.x=Math.max(-this.level.radius,Math.min(this.level.radius,this.pos.x));
      const goal=this.level.goal;
      const shapeAtGoal=this.edges().some(e=>pointDistance(goal,e.a,e.b)<.025);
      const allMoved=this.shapes.every(s=>s.moves>0 && s.points.some((p,i)=>distance(p,this.level.shapes.find(initial=>initial.id===s.id).points[i])>.01));
      this.won=this.grounded && distance(this.pos,goal)<.085 && shapeAtGoal && allMoved;
    }
  }
  const api={Physics,levels,reflect,edgesOf,pointDistance,GRAVITY,JUMP_SPEED,AIR_SPEED};
  if(typeof module!=='undefined' && module.exports) module.exports=api;
  root.SymmetryPhysics=api;
})(globalThis);
