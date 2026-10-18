const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const session = require('express-session');
const app = express();
app.use(express.json({limit:'10kb'}));
app.use(session({ secret: process.env.SESSION_SECRET || 'CHANGE_THIS_SESSION_SECRET_BEFORE_DEPLOY', resave:false, saveUninitialized:false, cookie:{ httpOnly:true, sameSite:'lax', secure: process.env.NODE_ENV === 'production', maxAge: 8*60*60*1000 }}));
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false });
const keyDurations = JSON.parse(fs.readFileSync(path.join(__dirname,'keys.json'),'utf8'));
app.get('/api/health', (_req,res)=>res.json({ok:true}));
app.post('/api/activate', async (req,res)=>{
  const key = String(req.body?.key || '').trim().toUpperCase();
  const deviceId = String(req.body?.deviceId || '').trim();
  if (!Object.prototype.hasOwnProperty.call(keyDurations,key) || !/^[A-Za-z0-9-]{8,160}$/.test(deviceId)) return res.status(400).json({ok:false,error:'invalid'});
  const duration = Number(keyDurations[key]);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // The key table is seeded from keys.json at server startup; row lock prevents simultaneous claims.
    const q = await client.query('SELECT device_id, expires_at, duration_ms, revoked FROM license_keys WHERE key=$1 FOR UPDATE',[key]);
    if (!q.rowCount) { await client.query('ROLLBACK'); return res.status(400).json({ok:false,error:'invalid'}); }
    const row=q.rows[0];
    if (row.revoked) { await client.query('ROLLBACK'); return res.status(403).json({ok:false,error:'revoked'}); }
    if (row.device_id && row.device_id !== deviceId) { await client.query('ROLLBACK'); return res.status(409).json({ok:false,error:'used'}); }
    let expiresAt=row.expires_at ? new Date(row.expires_at).getTime() : 0;
    if (!row.device_id) {
      expiresAt=Date.now()+duration;
      await client.query('UPDATE license_keys SET device_id=$2, activated_at=NOW(), expires_at=to_timestamp($3 / 1000.0) WHERE key=$1',[key,deviceId,expiresAt]);
    }
    if (expiresAt <= Date.now()) { await client.query('COMMIT'); return res.status(403).json({ok:false,error:'expired'}); }
    await client.query('COMMIT');
    return res.json({ok:true,expiresAt});
  } catch(err) { await client.query('ROLLBACK').catch(()=>{}); console.error(err); return res.status(500).json({ok:false,error:'server'}); }
  finally { client.release(); }
});

function requireAdmin(req,res,next){ if(req.session && req.session.isAdmin) return next(); return res.status(401).json({ok:false,error:'unauthorized'}); }
app.post('/api/admin/login',(req,res)=>{
  const password=String(req.body?.password||'');
  if(!process.env.ADMIN_PASSWORD){ return res.status(503).json({ok:false,error:'admin_password_not_configured'}); }
  if(password.length && crypto.timingSafeEqual(Buffer.from(password.padEnd(256,'\\0').slice(0,256)),Buffer.from(String(process.env.ADMIN_PASSWORD).padEnd(256,'\\0').slice(0,256)))){ req.session.isAdmin=true; return res.json({ok:true}); }
  return res.status(401).json({ok:false,error:'wrong_password'});
});
app.post('/api/admin/logout',(req,res)=>{req.session.destroy(()=>res.json({ok:true}));});
app.get('/api/admin/me',(req,res)=>res.json({ok:!!(req.session&&req.session.isAdmin)}));
app.get('/api/admin/keys',requireAdmin,async(req,res)=>{
 try { const q=await pool.query('SELECT key,duration_ms,device_id,activated_at,expires_at,revoked FROM license_keys ORDER BY key'); res.json({ok:true,keys:q.rows.map(r=>({...r,duration_ms:Number(r.duration_ms)}))}); }
 catch(e){console.error(e);res.status(500).json({ok:false,error:'server'});}
});
app.post('/api/admin/keys',requireAdmin,async(req,res)=>{
 const duration=Number(req.body?.durationMs); const count=Math.max(1,Math.min(100,Number(req.body?.count)||1));
 if(![3600000,86400000,604800000,2592000000,7776000000,31536000000].includes(duration)) return res.status(400).json({ok:false,error:'invalid_duration'});
 const made=[]; const client=await pool.connect();
 try { await client.query('BEGIN'); for(let i=0;i<count;i++){ let key; for(let tries=0;tries<10;tries++){ key='VNG-'+crypto.randomBytes(5).toString('hex').toUpperCase()+'-'+crypto.randomBytes(3).toString('hex').toUpperCase(); const q=await client.query('INSERT INTO license_keys(key,duration_ms) VALUES($1,$2) ON CONFLICT(key) DO NOTHING RETURNING key',[key,duration]); if(q.rowCount){made.push(key);break;} } } await client.query('COMMIT'); res.json({ok:true,keys:made}); }
 catch(e){await client.query('ROLLBACK').catch(()=>{});console.error(e);res.status(500).json({ok:false,error:'server'});} finally{client.release();}
});
app.post('/api/admin/keys/:key/revoke',requireAdmin,async(req,res)=>{try{const q=await pool.query('UPDATE license_keys SET revoked=TRUE WHERE key=$1 RETURNING key',[req.params.key]);if(!q.rowCount)return res.status(404).json({ok:false,error:'not_found'});res.json({ok:true});}catch(e){console.error(e);res.status(500).json({ok:false,error:'server'});}});
app.post('/api/admin/keys/:key/unrevoke',requireAdmin,async(req,res)=>{try{const q=await pool.query('UPDATE license_keys SET revoked=FALSE WHERE key=$1 RETURNING key',[req.params.key]);if(!q.rowCount)return res.status(404).json({ok:false,error:'not_found'});res.json({ok:true});}catch(e){console.error(e);res.status(500).json({ok:false,error:'server'});}});
app.delete('/api/admin/keys/:key',requireAdmin,async(req,res)=>{try{const q=await pool.query('DELETE FROM license_keys WHERE key=$1 AND device_id IS NULL RETURNING key',[req.params.key]);if(!q.rowCount)return res.status(409).json({ok:false,error:'only_unused_keys_can_be_deleted'});res.json({ok:true});}catch(e){console.error(e);res.status(500).json({ok:false,error:'server'});}});
app.get('/admin',(req,res)=>res.sendFile(path.join(__dirname,'public','admin.html')));

async function init(){
  await pool.query(`CREATE TABLE IF NOT EXISTS license_keys (key TEXT PRIMARY KEY, duration_ms BIGINT NOT NULL, device_id TEXT, activated_at TIMESTAMPTZ, expires_at TIMESTAMPTZ, revoked BOOLEAN NOT NULL DEFAULT FALSE)`);
  await pool.query('ALTER TABLE license_keys ADD COLUMN IF NOT EXISTS revoked BOOLEAN NOT NULL DEFAULT FALSE');
  for (const [key,duration] of Object.entries(keyDurations)) await pool.query('INSERT INTO license_keys(key,duration_ms) VALUES($1,$2) ON CONFLICT(key) DO NOTHING',[key,duration]);
  app.use(express.static(path.join(__dirname,'public')));
  app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
  const port=process.env.PORT||3000; app.listen(port,'0.0.0.0',()=>console.log(`VNG key server listening on ${port}`));
}
init().catch(err=>{console.error('Startup failed',err);process.exit(1)});
