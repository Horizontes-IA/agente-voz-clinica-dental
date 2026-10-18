import business from "../business.config.json";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
export const ZONE = business.timezone;
export const now = () => new Date().toISOString();
export const today = () => formatInTimeZone(new Date(), ZONE, "yyyy-MM-dd");
export interface Service {
  id: string;
  name: string;
  duration: number;
  buffer: number;
  price: number | null;
  specialty: string;
  enabled: number;
  description: string;
}
export interface Provider {
  id: string;
  name: string;
  specialty: string;
  initials: string;
  color: string;
  weekdays: string;
  start_hour: number;
  end_hour: number;
}
export interface Patient {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  initials: string;
  is_demo: number;
  created_at: string;
}
export interface Appointment {
  id: string;
  patient_id: string;
  provider_id: string;
  service_id: string;
  chair: number;
  starts_at: string;
  ends_at: string;
  occupied_until: string;
  status: string;
  version: number;
  source: string;
  notes: string;
  patient_name?: string;
  service_name?: string;
  provider_name?: string;
  color?: string;
  initials?: string;
  price?: number;
}
export interface Knowledge {
  id: string;
  title: string;
  category: string;
  content: string;
  version: number;
  published_version: number;
  remote_id: string | null;
  updated_at: string;
}
export interface AgentSettings {
  name: string;
  first_message: string;
  instructions: string;
  voice_id: string;
  llm: string;
  active: boolean;
  speed: number;
  max_duration: number;
  version: number;
  published_version: number;
  remote_agent_id: string;
  last_published_at: string | null;
}
export const defaultAgent: AgentSettings = {name:business.agent.name,first_message: "Hola, soy "+business.agent.name+", asistente virtual de "+business.name+". ¿Quieres agendar una cita o necesitas información?", instructions:business.agent.instructions,voice_id:"",llm:"gpt-4.1",active:true,speed:1,max_duration:600,version:1,published_version:0,remote_agent_id:"",last_published_at:null};
export async function getSettings(db: D1Database): Promise<AgentSettings> {
  const row = await db
    .prepare("SELECT value FROM settings WHERE key='agent'")
    .first<{ value: string }>();
  return row ? { ...defaultAgent, ...JSON.parse(row.value) } : defaultAgent;
}
export async function putSettings(db: D1Database, value: AgentSettings) {
  await db
    .prepare(
      "INSERT INTO settings(key,value) VALUES('agent',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=datetime('now')",
    )
    .bind(JSON.stringify(value))
    .run();
}
export async function activity(
  db: D1Database,
  type: string,
  title: string,
  detail = "",
  source = "staff",
) {
  await db
    .prepare(
      "INSERT INTO activities(id,type,title,detail,source) VALUES(?,?,?,?,?)",
    )
    .bind(crypto.randomUUID(), type, title, detail, source)
    .run();
}
export const appointmentQuery = `SELECT a.*,p.name patient_name,p.initials,s.name service_name,s.price,pr.name provider_name,pr.color FROM appointments a JOIN patients p ON p.id=a.patient_id JOIN services s ON s.id=a.service_id JOIN providers pr ON pr.id=a.provider_id`;
export const kbSeeds = business.knowledge;
export async function seed(db: D1Database) {
  if ((await db.prepare('SELECT COUNT(*) n FROM providers').first<{n:number}>())?.n) return;
  const statements: D1PreparedStatement[] = [];
  for (const p of business.providers) statements.push(db.prepare('INSERT INTO providers(id,name,specialty,initials,color,weekdays,start_hour,end_hour) VALUES(?,?,?,?,?,?,?,?)').bind(p.id,p.name,p.specialty,p.initials,p.color,p.weekdays,p.start_hour,p.end_hour));
  for (const s of business.services) statements.push(db.prepare('INSERT INTO services(id,name,duration,buffer,price,description,specialty) VALUES(?,?,?,?,?,?,?)').bind(s.id,s.name,s.duration,s.buffer,s.price,s.description,s.specialty));
  const names = ['Mariana García','Carlos Hernández','Valeria López','Diego Martínez','Sofía Rodríguez','Andrés Pérez','Camila González','Sebastián Ramírez','Regina Torres','Emiliano Flores','Ximena Sánchez','Mateo Rivera','Lucía Gómez','Daniel Ortiz','Renata Cruz','Santiago Reyes','Ana Morales','Pablo Mendoza','Isabella Castro','Alejandro Vargas'];
  names.forEach((name,i) => statements.push(db.prepare('INSERT INTO patients(id,name,phone,email,initials) VALUES(?,?,?,?,?)').bind('patient-'+(i+1),name,'+52810000'+String(i+1).padStart(4,'0'),'demo'+(i+1)+'@example.com',name.split(' ').map(n=>n[0]).join(''))));
  for (const d of kbSeeds) {
    statements.push(db.prepare('INSERT INTO knowledge_documents(id,title,category,content) VALUES(?,?,?,?)').bind(d.id,d.title,d.category,d.content));
    statements.push(db.prepare('INSERT INTO knowledge_revisions(id,document_id,version,content) VALUES(?,?,1,?)').bind(crypto.randomUUID(),d.id,d.content));
  }
  statements.push(db.prepare("INSERT INTO settings(key,value) VALUES('agent',?)").bind(JSON.stringify(defaultAgent)));
  let n=0;
  for (let offset=0;offset<14;offset++) {
    const date=new Date(today()+'T12:00:00Z'); date.setUTCDate(date.getUTCDate()+offset);
    const dow=date.getUTCDay(), localDate=date.toISOString().slice(0,10);
    const eligible=business.providers.filter(p=>p.weekdays.split(',').map(Number).includes(dow));
    for(let index=0;index<4 && eligible.length;index++) {
      const p=eligible[index%eligible.length];
      const services=business.services.filter(s=>s.specialty===p.specialty);
      const s=services[index%services.length];
      // Two appointments per provider, spaced far enough for the longest supported service.
      const hour=p.start_hour+Math.floor(index/eligible.length)*5;
      if(hour*60+s.duration+s.buffer>Math.min(dow===6?14:19,p.end_hour)*60) continue;
      const start=fromZonedTime(localDate+'T'+String(hour).padStart(2,'0')+':00:00',ZONE);
      if(start.getTime()<Date.now()) continue;
      const end=new Date(start.getTime()+s.duration*60000), occupied=new Date(end.getTime()+s.buffer*60000);
      // At most two resources can be occupied; choose a distinct time for the third professional.
      if(index%eligible.length>=2) continue;
      statements.push(db.prepare('INSERT INTO appointments(id,patient_id,provider_id,service_id,chair,starts_at,ends_at,occupied_until,status,source) VALUES(?,?,?,?,?,?,?,?,?,?)').bind('seed-appointment-'+n,'patient-'+((n%20)+1),p.id,s.id,(index%2)+1,start.toISOString(),end.toISOString(),occupied.toISOString(),n%3===0?'confirmed':'booked','demo'));
      n++;
    }
  }
  statements.push(db.prepare('INSERT INTO activities(id,type,title,detail,source) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),'system','Tu demo está lista','Se cargaron 20 personas ficticias y servicios configurados.','demo'));
  await db.batch(statements);
}
