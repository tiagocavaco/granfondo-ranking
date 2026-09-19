// Playwright audit used for docs/frontend. Run from the frontend/ workspace so
// @playwright/test resolves:
//   cd frontend && AUDIT_OUT=../docs/frontend/audit-output/shots node ../docs/frontend/tools/audit.mjs
// Requires the dev server on http://localhost:5173/granfondo-ranking (npm run dev)
// and Chromium installed (npx playwright install chromium).
// Produces full-page screenshots per route/viewport and report.json with
// overflow, tap-target, tiny-text, heading, payload and heap metrics.
import { chromium, devices } from "@playwright/test";
import fs from "node:fs";

const BASE = "http://localhost:5173/granfondo-ranking";
const OUT = process.env.AUDIT_OUT ?? "./audit-output/shots";
import { mkdirSync } from "node:fs"; mkdirSync(OUT, { recursive: true });
const report = { pages: [], console: [], timing: {}, network: [] };

const viewports = {
  desktop: { viewport: { width: 1440, height: 900 } },
  mobile: { ...devices["iPhone 14"], viewport: { width: 390, height: 844 } },
};

async function audit(page, name, vp) {
  await page.waitForTimeout(900);
  const metrics = await page.evaluate(() => {
    const overflow = document.documentElement.scrollWidth > window.innerWidth;
    const small = [];
    const tiny = [];
    for (const el of document.querySelectorAll("a,button,select,input")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.height < 36) small.push({ tag: el.tagName, text: (el.textContent||"").trim().slice(0,30), h: Math.round(r.height), w: Math.round(r.width) });
    }
    for (const el of document.querySelectorAll("body *")) {
      const cs = getComputedStyle(el);
      const fs = parseFloat(cs.fontSize);
      if (el.childNodes.length && [...el.childNodes].some(n => n.nodeType===3 && n.textContent.trim()) && fs < 11) {
        tiny.push({ fs, text: el.textContent.trim().slice(0,30) });
      }
    }
    const h1 = document.querySelectorAll("h1").length;
    const title = document.title;
    const lang = document.documentElement.lang;
    const metaDesc = !!document.querySelector('meta[name="description"]');
    return { overflow, scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth, smallTargets: small.length, smallSample: small.slice(0,8), tinyText: tiny.length, tinySample: tiny.slice(0,6), h1, title, metaDesc, lang, height: document.documentElement.scrollHeight };
  });
  const file = `${OUT}/${name}-${vp}.png`;
  await page.screenshot({ path: file, fullPage: true });
  report.pages.push({ name, vp, url: page.url(), file, ...metrics });
  console.log(name, vp, JSON.stringify({ overflow: metrics.overflow, small: metrics.smallTargets, tiny: metrics.tinyText, h1: metrics.h1, height: metrics.height }));
}

for (const [vp, opts] of Object.entries(viewports)) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.on("console", (m) => { if (["error","warning"].includes(m.type())) report.console.push({ vp, type: m.type(), text: m.text().slice(0,300), url: page.url() }); });
  page.on("pageerror", (e) => report.console.push({ vp, type: "pageerror", text: String(e).slice(0,300), url: page.url() }));
  page.on("response", async (r) => { try { const h = r.headers(); if (r.url().includes("data.db.enc") || r.url().includes(".wasm")) report.network.push({ vp, url: r.url(), status: r.status(), len: h["content-length"], enc: h["content-encoding"] }); } catch {} });

  const t0 = Date.now();
  await page.goto(BASE + "/");
  // capture loading screen quickly
  await page.screenshot({ path: `${OUT}/00-loading-${vp}.png` });
  await page.waitForSelector("nav", { timeout: 120000 });
  report.timing[vp] = { dbReadyMs: Date.now() - t0 };
  await page.waitForTimeout(1500);
  const perf = await page.evaluate(() => JSON.stringify(performance.getEntriesByType("resource").filter(r=>r.name.includes("data.db.enc")||r.name.includes("wasm")).map(r=>({n:r.name.split("/").pop(), size:r.transferSize, dec:r.decodedBodySize, dur:Math.round(r.duration)}))));
  report.timing[vp].resources = JSON.parse(perf);
  const mem = await page.evaluate(() => performance.memory ? { usedJSHeapMB: Math.round(performance.memory.usedJSHeapSize/1048576), totalJSHeapMB: Math.round(performance.memory.totalJSHeapSize/1048576) } : null);
  report.timing[vp].memory = mem;

  await audit(page, "01-events-past", vp);
  // upcoming filter
  await page.getByRole("button", { name: "Upcoming" }).click();
  await audit(page, "02-events-upcoming", vp);
  await page.getByRole("button", { name: "All" }).first().click();
  // search test for bug
  await page.fill('input[type="search"]', "zzzzqqq");
  await page.waitForTimeout(400);
  const rowsAfterSearch = await page.locator('a[href*="/event/"]').count();
  report.searchBugRows = rowsAfterSearch;
  await page.fill('input[type="search"]', "");
  await page.getByRole("button", { name: "Past" }).click();

  const eventHrefs = await page.$$eval('a[href*="/event/"]', as => [...new Set(as.map(a => a.getAttribute("href")))]);
  report.eventHrefs = eventHrefs.slice(0, 5);
  const firstPast = eventHrefs.find(h => /\/event\/\d+$/.test(h));
  await page.goto("http://localhost:5173" + firstPast);
  await page.waitForSelector("table, text=Results", { timeout: 60000 }).catch(()=>{});
  await audit(page, "03-event-detail-results", vp);

  // upcoming event with participants/predictions
  await page.goto(BASE + "/");
  await page.waitForSelector("nav");
  await page.getByRole("button", { name: "Upcoming" }).click();
  await page.waitForTimeout(500);
  const upHrefs = await page.$$eval('a[href*="/event/"]', as => [...new Set(as.map(a => a.getAttribute("href")))]);
  const upcoming = upHrefs.find(h => /\/event\/\d+$/.test(h));
  const predictions = upHrefs.find(h => /predictions$/.test(h));
  if (upcoming) { await page.goto("http://localhost:5173" + upcoming); await page.waitForTimeout(1500); await audit(page, "04-event-upcoming-participants", vp); }
  if (predictions) { await page.goto("http://localhost:5173" + predictions); await page.waitForTimeout(1500); await audit(page, "05-predictions", vp); }

  await page.goto(BASE + "/ranking"); await page.waitForSelector("table", { timeout: 60000 }).catch(()=>{}); await audit(page, "06-athlete-ranking", vp);
  // expand a row
  await page.locator("tbody tr").nth(4).click().catch(()=>{}); await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/06b-athlete-ranking-expanded-${vp}.png` });
  const athleteHref = await page.$eval('a[href*="/athlete/"]', a => a.getAttribute("href")).catch(()=>null);

  await page.goto(BASE + "/teams"); await page.waitForSelector("table", { timeout: 60000 }).catch(()=>{}); await audit(page, "07-team-ranking", vp);
  const teamHref = await page.$eval('a[href*="/team/"]', a => a.getAttribute("href")).catch(()=>null);

  if (athleteHref) { await page.goto("http://localhost:5173" + athleteHref); await page.waitForTimeout(1500); await audit(page, "08-athlete-profile", vp); }
  if (teamHref) { await page.goto("http://localhost:5173" + teamHref); await page.waitForTimeout(1500); await audit(page, "09-team-profile", vp); }

  await page.goto(BASE + "/athletes"); await page.waitForTimeout(1200); await audit(page, "10-athletes", vp);
  await page.goto(BASE + "/compare"); await page.waitForTimeout(800); await audit(page, "11-compare-empty", vp);
  // compare two top athletes
  const ids = await page.evaluate(async () => null);
  await page.goto(BASE + "/ranking"); await page.waitForSelector("table", { timeout: 60000 }).catch(()=>{});
  const two = await page.$$eval('tbody a[href*="/athlete/"]', as => as.slice(0,2).map(a => a.getAttribute("href").split("/").pop()));
  if (two.length === 2) { await page.goto(`${BASE}/compare?a=${two[0]}&b=${two[1]}`); await page.waitForTimeout(2000); await audit(page, "12-compare-filled", vp); }
  await page.goto(BASE + "/ranking-info"); await page.waitForTimeout(600); await audit(page, "13-ranking-info", vp);
  await page.goto(BASE + "/teams-info"); await page.waitForTimeout(600); await audit(page, "14-teams-info", vp);
  await page.goto(BASE + "/predictions-info"); await page.waitForTimeout(600); await audit(page, "15-predictions-info", vp);
  await page.goto(BASE + "/does-not-exist"); await page.waitForTimeout(600); await audit(page, "16-404", vp);
  await page.goto(BASE + "/athlete/999999999"); await page.waitForTimeout(1000); await audit(page, "17-athlete-missing", vp);

  if (vp === "mobile") {
    await page.goto(BASE + "/"); await page.waitForSelector("nav");
    await page.getByRole("button", { name: /Rankings/ }).click(); await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/18-mobile-nav-open-mobile.png` });
  }
  await browser.close();
}
fs.writeFileSync(`${OUT}/../report.json`, JSON.stringify(report, null, 2));
console.log("DONE");
