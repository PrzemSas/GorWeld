// E2E responsive Battle task picker at short desktop and touch viewports.
let chromium;
for (const p of ["playwright", "/home/gorweld/forge-picks/node_modules/playwright"]) {
  try { ({ chromium } = require(p)); break; } catch (_) {}
}
const BASE = process.argv[2];
const EXE = process.env.ARC_CHROME || "/home/gorweld/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";
const results = [];
if (!chromium || !BASE) { console.error("użycie: node e2e-battle-layout.js <baseURL> (wymaga Playwright)"); process.exit(2); }
const ok = (name, pass, info) => { results.push(!!pass); console.log((pass ? "  ✓ " : "  ✗ ") + name + (info ? " " + JSON.stringify(info) : "")); };

async function check(browser, width, height, touch) {
  const context = await browser.newContext({ viewport: { width, height }, isMobile: touch, hasTouch: touch });
  const page = await context.newPage(); page.errors = []; const assetRequests=[],assetResponses=[];
  page.on("pageerror", e => page.errors.push(e.message));
  page.on("request",r=>{if(new URL(r.url()).pathname.includes("/battle-assets/"))assetRequests.push(r.url());});
  page.on("response",r=>{if(new URL(r.url()).pathname.includes("/battle-assets/"))assetResponses.push({url:r.url(),status:r.status()});});
  await page.addInitScript(() => { try { localStorage.setItem("gorweld_tut", "1"); localStorage.setItem("gorweld_lang", "en"); } catch (_) {} });
  await page.goto(BASE + "/index.html"); await page.waitForTimeout(1200);
  ok(`ordinary ARC load stays image-free at ${width}x${height}`,assetRequests.length===0,{assetRequests:assetRequests.length});
  const cacheHeader=await page.evaluate(async()=>{const response=await fetch("/index.html",{cache:"no-store"});return response.headers.get("cache-control");});
  ok("static dev server disables browser caching",cacheHeader==="no-store",{cacheControl:cacheHeader});
  await page.evaluate(() => { if (window.hideSplash) hideSplash(); if (openM && openM !== "battleModal") closeModal(openM); });
  const launchId = touch ? "#battleLaunchMobile" : "#battleLaunch";
  const visible = await page.locator(launchId).evaluate(el => getComputedStyle(el).display !== "none" && !el.hidden);
  if (visible) await page.locator(launchId).click({ force: true });
  await page.waitForTimeout(900);
  const loadedAssets=assetResponses.slice();
  ok(`Battle activation loads local assets at ${width}x${height}`,visible&&loadedAssets.length>0&&loadedAssets.every(r=>r.status===200&&new URL(r.url).origin===new URL(BASE).origin),loadedAssets);
  const result = await page.evaluate(() => {
    const modal = document.getElementById("battleModal"), shell = modal.querySelector(".bw-shell");
    const r = shell.getBoundingClientRect(), choices = [...document.querySelectorAll("#battleTaskChoices button")];
    const visibleChoices = choices.filter(el => getComputedStyle(el).display !== "none" && !el.hidden);
    const rects = visibleChoices.map(el => el.getBoundingClientRect());
    return { open: modal.classList.contains("open"), title: document.getElementById("battleTitle").textContent,
      choiceCount: visibleChoices.length, shellFits: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight,
      choicesFit: rects.length > 0 && rects.every(q => q.left >= 0 && q.right <= innerWidth && q.top >= 0 && q.bottom <= innerHeight),
      scrollable: shell.scrollHeight > shell.clientHeight || shell.clientHeight > 0 };
  });
  ok(`task picker reachable at ${width}x${height}${touch ? " touch" : ""}`, visible && result.open && result.choiceCount > 0 && result.shellFits && result.choicesFit && page.errors.length === 0,
    { launchVisible:visible, ...result, errors: page.errors });
  const fullscreen = await page.evaluate(() => {
    Object.defineProperty(document.documentElement,"requestFullscreen",{configurable:true,value:undefined});
    try { battleTryFullscreen(); return { threw:false, api:typeof document.documentElement.requestFullscreen }; }
    catch (e) { return { threw:true, message:e.message }; }
  });
  ok(`READY fullscreen guard tolerates missing API at ${width}x${height}`,!fullscreen.threw,{...fullscreen,errors:page.errors});
  await context.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox", "--mute-audio"] });
  try { await check(browser, 1024, 600, false); await check(browser, 800, 480, true); }
  catch (e) { console.error(e.stack || e); results.push(false); }
  finally { await browser.close(); }
  const pass = results.every(Boolean);
  console.log(pass ? `\n✓ przeszło (${results.length})` : `\n✗ NIE PRZESZŁO (${results.filter(x => !x).length}/${results.length})`);
  process.exit(pass ? 0 : 1);
})();
