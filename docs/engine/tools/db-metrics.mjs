// Computes the data-quality metrics reported in docs/engine/metrics.json.
// Decrypts data.db.enc IN MEMORY (never writes plaintext to disk).
// Run from the frontend/ workspace so sql.js resolves:
//   cd frontend && DATA_KEY=<64 hex> node ../docs/engine/tools/db-metrics.mjs
// If DATA_KEY is unset it is read from scraper/.env.
import fs from "node:fs";
import { webcrypto } from "node:crypto";
import initSqlJs from "sql.js";

const key =
  process.env.DATA_KEY ??
  fs.readFileSync("../scraper/.env", "utf8").match(/DATA_KEY=([0-9a-f]{64})/)[1];
const enc = fs.readFileSync("public/data/data.db.enc");
const cryptoKey = await webcrypto.subtle.importKey("raw", Buffer.from(key, "hex"), "AES-GCM", false, ["decrypt"]);
const plain = new Uint8Array(
  await webcrypto.subtle.decrypt({ name: "AES-GCM", iv: enc.subarray(0, 12) }, cryptoKey, Buffer.concat([enc.subarray(28), enc.subarray(12, 28)])),
);
const SQL = await initSqlJs();
const db = new SQL.Database(plain);
const rows = (sqlText) => db.exec(sqlText)[0]?.values ?? [];
const one = (sqlText) => rows(sqlText)[0]?.[0];

const out = {
  measured_at: new Date().toISOString().slice(0, 10),
  encrypted_bytes: enc.length,
  results_total: one("select count(*) from results"),
  results_finished: one("select count(*) from results where dnf=0 and dns=0 and pos>0"),
  results_unlinked_finished: one("select count(*) from results where athlete_id=0 and dnf=0 and dns=0 and pos>0"),
  results_with_licence: one("select count(distinct result_id) from result_licences"),
  results_same_pos_duplicates: one("select count(*) from (select event_id, distance_id, pos, count(*) c from results where pos>0 group by 1,2,3 having c>1)"),
  athletes: one("select count(*) from athletes"),
  athletes_max_id: one("select max(id) from athletes"),
  athletes_with_one_result: one("select count(*) from (select athlete_id, count(*) c from athlete_results group by athlete_id having c=1)"),
  same_name_groups: one("select count(*) from (select name_lower, count(*) c from athletes group by name_lower having c>1)"),
  athlete_result_duplicate_slots: one("select count(*) from (select athlete_id, event_id, distance, count(*) c from athlete_results where athlete_id!=0 group by 1,2,3 having c>1)"),
  teams: one("select count(*) from teams"),
  teams_with_aliases: one("select count(*) from teams where alias_keys!='[]'"),
  teams_with_single_athlete: one("select count(*) from (select team_id, count(*) c from athlete_teams group by team_id having c=1)"),
  alias_rules: one("select count(*) from athlete_alias_rules"),
  result_assignments: one("select count(*) from result_assignments"),
  blocked_results: one("select count(*) from blocked_results"),
  distinct_raw_categories: one("select count(distinct category) from results"),
  participants_rows: one("select count(*) from participants"),
  upcoming_participant_link_rate: Object.fromEntries(
    rows("select e.name, sum(case when p.athlete_id>0 then 1 else 0 end)||'/'||count(*) from participants p join events e on e.id=p.event_id where e.has_results=0 group by e.id order by e.date"),
  ),
  suspicious_single_letter_participant_names: one("select count(*) from participants where length(name)=1"),
  coefficient_sample: rows(
    "select ar.event_name, aa.gender, ar.distance_finishers, ar.coefficient from aggregate_results ar join aggregate_athletes aa on aa.id=ar.aggregate_athlete_id where ar.event_id=(select max(event_id) from aggregate_results) and aa.distance='Granfondo' group by aa.gender",
  ),
};
console.log(JSON.stringify(out, null, 2));
