import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const argv=process.argv.slice(2), root=path.resolve(argv[0]??process.cwd());
const checks=[];
const check=(name,ok,detail)=>checks.push({name,ok,detail});
check('Node.js',Number(process.versions.node.split('.')[0])>=22,'Requiere Node 22.22 o superior');
for(const file of ['package.json','wrangler.jsonc','business.config.json']) check(file,fs.existsSync(path.join(root,file)),'Archivo necesario');
if(fs.existsSync(path.join(root,'business.config.json'))) {
  const c=JSON.parse(fs.readFileSync(path.join(root,'business.config.json'),'utf8'));
  check('Zona horaria',['America/Monterrey','America/Mexico_City'].includes(c.timezone),c.timezone);
  check('Catálogo',Array.isArray(c.services)&&c.services.length>0,c.services.length+' servicios');
}
check('Dependencias',fs.existsSync(path.join(root,'node_modules')),'Ejecuta npm ci');
check('Secretos locales',fs.existsSync(path.join(root,'.dev.vars')),'Ejecuta npm run setup. No se muestran valores.');
if(fs.existsSync(path.join(root,'wrangler.jsonc'))) {
  const c=JSON.parse(fs.readFileSync(path.join(root,'wrangler.jsonc'),'utf8'));
  const db=c.d1_databases?.[0]?.database_id;
  check('D1 remoto',!!db&&db!=='00000000-0000-0000-0000-000000000000','Pendiente hasta crear tu D1 y sustituir database_id; no impide trabajar en local');
}
console.log(JSON.stringify({root,checkedAt:new Date().toISOString(),checks,networkCalls:0,voiceTested:false},null,2));
const required=checks.filter(c=>c.name!=='D1 remoto');
if(required.some(c=>!c.ok))process.exitCode=1;
