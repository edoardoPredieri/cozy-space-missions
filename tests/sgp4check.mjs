import { twoline2satrec, sgp4 } from '../assets/vendor/satellite/index.js';
import fs from 'fs';

const data = JSON.parse(fs.readFileSync(new URL('./spacetrack-report-3.json', import.meta.url),'utf8'));
const cases = Array.isArray(data) ? data : (data.testCases || data.cases || Object.values(data)[0]);
console.log('casi nel file:', Array.isArray(cases) ? cases.length : typeof cases);
if (!Array.isArray(cases)) { console.log('chiavi:', Object.keys(data).slice(0,8)); process.exit(0); }
console.log('esempio:', JSON.stringify(cases[0]).slice(0,320));

let checked = 0, worstPos = 0, worstVel = 0, fails = 0;
for (const c of cases) {
  const l1 = c.tle_line_1, l2 = c.tle_line_2;
  const results = c.results;
  if (!l1 || !l2 || !results) continue;
  const rec = twoline2satrec(l1, l2);
  for (const r of results) {
    const t = r.time;
    const out = sgp4(rec, t);
    if (!out || !out.position) { if (r.known_pos) fails++; continue; }
    if (!r.known_pos) continue;
    const dp = Math.hypot(out.position.x - r.known_pos.x, out.position.y - r.known_pos.y, out.position.z - r.known_pos.z);
    const dv = Math.hypot(out.velocity.x - r.known_vel.x, out.velocity.y - r.known_vel.y, out.velocity.z - r.known_vel.z);
    worstPos = Math.max(worstPos, dp); worstVel = Math.max(worstVel, dv);
    checked++;
  }
}
console.log('punti verificati:', checked, '| errori:', fails);
console.log('errore massimo posizione:', worstPos.toExponential(3), 'km');
console.log('errore massimo velocità:', worstVel.toExponential(3), 'km/s');
