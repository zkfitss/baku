const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const cookieName='zkfits_admin';
async function digest(text){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}
async function token(env){return digest((env.SESSION_SECRET||'change-this-secret')+'|'+(env.ADMIN_PASSWORD||'')+'|zkfits-admin')}
function isAdmin(req,env){const c=req.headers.get('Cookie')||'';return c.split(';').some(x=>x.trim()===cookieName+'='+env.__token)}
function headersCookie(v,maxAge){return {'Set-Cookie':`${cookieName}=${v}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`}}
async function body(req){try{return await req.json()}catch{return {}}}
export async function onRequest({request,env}) {
  if(!env.DB)return json({error:'D1 binding DB is missing. Check wrangler.toml and Pages bindings.'},500);
  const url=new URL(request.url),path=url.pathname.replace(/^\/api\/?/,'').split('/').filter(Boolean),method=request.method;
  env.__token=await token(env);
  try {
    if(path[0]==='login'&&method==='POST'){const b=await body(request);if(!env.ADMIN_PASSWORD||b.password!==env.ADMIN_PASSWORD)return json({error:'Invalid login'},401);return new Response(JSON.stringify({ok:true}),{headers:{'Content-Type':'application/json',...headersCookie(env.__token,60*60*24*7)}})}
    if(path[0]==='logout')return new Response(JSON.stringify({ok:true}),{headers:{'Content-Type':'application/json',...headersCookie('',0)}});
    if(path[0]==='me')return isAdmin(request,env)?json({ok:true}):json({error:'Unauthorized'},401);
    if(path[0]==='store'&&method==='GET'){const p=await env.DB.prepare('SELECT * FROM products WHERE active=1 ORDER BY featured DESC,id DESC').all();const s=await env.DB.prepare('SELECT key,value FROM settings').all();return json({products:p.results||[],settings:Object.fromEntries((s.results||[]).map(x=>[x.key,x.value]))})}
    if(path[0]==='orders'&&method==='POST'){const b=await body(request);if(!b.customer_name||!b.phone||!b.address||!Array.isArray(b.items)||!b.items.length)return json({error:'Missing checkout fields'},400);const shipping=Number((await env.DB.prepare("SELECT value FROM settings WHERE key='shipping_fee'").first())?.value||250);const threshold=Number((await env.DB.prepare("SELECT value FROM settings WHERE key='free_shipping_threshold'").first())?.value||5000);const subtotal=Number(b.total)||0;const total=subtotal+(subtotal>=threshold?0:shipping);const r=await env.DB.prepare('INSERT INTO orders(customer_name,phone,address,items,total,payment_method) VALUES(?,?,?,?,?,?)').bind(b.customer_name,b.phone,b.address,JSON.stringify(b.items),total,b.payment_method||'Cash on Delivery').run();return json({ok:true,id:r.meta.last_row_id,total})}
    if(!isAdmin(request,env))return json({error:'Unauthorized'},401);
    if(path[0]==='admin'&&method==='GET'){const [p,o,s]=await Promise.all([env.DB.prepare('SELECT * FROM products ORDER BY id DESC').all(),env.DB.prepare('SELECT * FROM orders ORDER BY id DESC').all(),env.DB.prepare('SELECT key,value FROM settings').all()]);return json({products:p.results||[],orders:o.results||[],settings:Object.fromEntries((s.results||[]).map(x=>[x.key,x.value]))})}
    if(path[0]==='products'&&method==='POST'){const b=await body(request);const r=await env.DB.prepare('INSERT INTO products(title,category,description,price,sale_price,image,sizes,colors,stock,featured,active) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(b.title,b.category||'Women',b.description||'',Number(b.price)||0,b.sale_price?Number(b.sale_price):null,b.image||'',JSON.stringify(b.sizes||[]),JSON.stringify(b.colors||[]),Number(b.stock)||0,Number(b.featured)||0,b.active===0?0:1).run();return json({ok:true,id:r.meta.last_row_id})}
    if(path[0]==='products'&&path[1]&&method==='PUT'){const b=await body(request);await env.DB.prepare('UPDATE products SET title=?,category=?,description=?,price=?,sale_price=?,image=?,sizes=?,colors=?,stock=?,featured=?,active=? WHERE id=?').bind(b.title,b.category||'Women',b.description||'',Number(b.price)||0,b.sale_price?Number(b.sale_price):null,b.image||'',JSON.stringify(b.sizes||[]),JSON.stringify(b.colors||[]),Number(b.stock)||0,Number(b.featured)||0,b.active===0?0:1,Number(path[1])).run();return json({ok:true})}
    if(path[0]==='products'&&path[1]&&method==='DELETE'){await env.DB.prepare('DELETE FROM products WHERE id=?').bind(Number(path[1])).run();return json({ok:true})}
    if(path[0]==='orders'&&path[1]&&method==='PUT'){const b=await body(request);await env.DB.prepare('UPDATE orders SET status=? WHERE id=?').bind(b.status,Number(path[1])).run();return json({ok:true})}
    if(path[0]==='settings'&&method==='PUT'){const b=await body(request);for(const [k,v] of Object.entries(b)){await env.DB.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(k,String(v)).run()}return json({ok:true})}
    return json({error:'Not found'},404);
  } catch(e){return json({error:e.message||'Server error'},500)}
}
