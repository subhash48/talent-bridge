// End-to-end checks of the three journeys on the e2e stack: the website, candidates (sign up, apply first,
// apply again at another employer), Alex's full workspace and Sam's Simple Hire. run.sh starts the stack and
// runs these; `bash e2e/run.sh sam alex` runs only those journeys.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright-core");
const pg = require("pg");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = process.env.E2E_WEB_URL ?? "http://localhost:3100";
const AUTH = process.env.E2E_AUTH_URL ?? "http://localhost:8200";
const DATABASE_URL = process.env.E2E_DATABASE_URL;
const PYTHON = process.env.E2E_PYTHON ?? "python";
const PASSWORD = "Demo-pass-2026"; // the seeded accounts' password in the stand-in auth server only
const results = [];
const only = new Set(process.argv.slice(2));
const SHOTS = process.env.E2E_SHOTS ?? path.join(HERE, "shots");

function check(name, ok, detail = "") {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : `  -- ${detail}`}`);
}

async function lastLink(email, kind) {
  const outbox = await (await fetch(`${AUTH}/__outbox`)).json();
  const mails = outbox.filter((mail) => mail.to === email.toLowerCase() && (!kind || mail.kind === kind));
  return mails.at(-1)?.link ?? null;
}

async function sql(query, params = []) {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    return (await client.query(query, params)).rows;
  } finally {
    await client.end();
  }
}

async function signIn(page, email, as = "employer", password = PASSWORD) {
  await page.goto(`${WEB}/login?as=${as}`);
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
}

/** Waits (up to 10 s) for the locator to show, then says whether it did. */
async function shows(locator) {
  try {
    await locator.first().waitFor({ state: "visible", timeout: 10000 });
    return true;
  } catch {
    return false;
  }
}

async function signOutAll(context) {
  await context.clearCookies();
}

const PDF = path.join(tmpdir(), "talent-bridge-e2e-resume.pdf");
writeFileSync(PDF, "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n");

async function website(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(WEB);
  check("hero headline kept", await page.getByRole("heading", { name: "Never leave another candidate wondering what's happening." }).isVisible());
  for (const label of ["Product", "For Recruiters", "For Small Businesses", "For Candidates", "About", "Contact"]) {
    check(`nav: ${label}`, await page.getByRole("navigation", { name: "Website" }).getByRole("link", { name: label, exact: true }).first().isVisible());
  }
  for (const id of ["product", "recruiters", "small-business", "candidates", "about", "contact"]) {
    check(`section #${id}`, (await page.locator(`section#${id}`).count()) === 1);
  }
  check("how it works steps", (await page.locator("#product li").count()) === 3);
  check("Know who needs attention", await page.getByText("Know who needs attention").isVisible());
  check("small business headline", await page.getByText("Hiring shouldn't require learning recruiting software.").isVisible());
  check("candidates headline", await page.getByText("One place for your hiring journey.").isVisible());
  check("about headline", await page.getByText("Hiring should feel better on both sides.").isVisible());
  check("official contact email shown", await page.getByRole("link", { name: "hello@talentbridge.example" }).isVisible());
  check("footer copyright", await page.getByText("© 2026 TalentBridge").isVisible());
  check("no made-up claims", !(await page.content()).match(/customers love|trusted by|backed by|funding|market leader/i));

  await page.fill("#contact-name", "Priya Nair");
  await page.fill("#contact-email", "priya@northwind.example");
  await page.selectOption("#contact-topic", "pilot");
  await page.fill("#contact-message", "We'd like to pilot TalentBridge.");
  await page.getByRole("button", { name: "Send message" }).click();
  await page.getByText("Thanks, Priya.").waitFor({ timeout: 10000 });
  const stored = await sql("select topic, email from contact_requests order by created_at desc limit 1");
  check("contact form stored", stored[0]?.topic === "pilot" && stored[0]?.email === "priya@northwind.example");

  await page.getByRole("contentinfo").getByRole("link", { name: "Privacy" }).click();
  await page.waitForURL("**/privacy");
  check("privacy page says it's a draft", await page.getByText(/not legal advice/).isVisible());
  await page.goto(`${WEB}/terms`);
  check("terms page says it's a draft", await page.getByText(/not legal advice/).isVisible());

  await page.goto(WEB);
  await page.getByRole("banner").getByRole("link", { name: "Sign in" }).click();
  await page.waitForURL("**/signin");
  check("sign in asks who you are", await page.getByRole("heading", { name: "How are you using TalentBridge?" }).isVisible());
  check("candidate choice", await page.getByRole("link", { name: /Candidate/ }).first().isVisible());
  check("employer choice", await page.getByRole("link", { name: /Employer \/ Recruiter/ }).isVisible());

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const small = await phone.newPage();
  await small.goto(WEB);
  const overflow = await small.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check("no sideways scroll on a phone", overflow <= 1, `overflow ${overflow}px`);
  await small.getByRole("button", { name: "Open menu" }).click();
  check("phone menu opens", await small.locator("#site-menu").isVisible());
  await small.screenshot({ path: path.join(SHOTS, "site-phone.png"), fullPage: false });
  await page.goto(WEB);
  await page.screenshot({ path: path.join(SHOTS, "site.png"), fullPage: true });
  check("no page errors on the website", errors.length === 0, errors.join(" | "));
  await phone.close();
  await context.close();
}

async function candidateSignup(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const email = `test.candidate.${Date.now()}@inbox.example`;
  await page.goto(`${WEB}/signup`);
  await page.fill("#first-name", "Test");
  await page.fill("#last-name", "Candidate");
  await page.fill("#email", email);
  await page.fill("#password", "short1");
  await page.fill("#confirm-password", "short1");
  await page.getByRole("button", { name: "Create account" }).click();
  check("weak password refused", await page.getByText("Use at least 8 characters.").isVisible());
  await page.fill("#password", "river-lamp-42");
  await page.fill("#confirm-password", "river-lamp-43");
  await page.getByRole("button", { name: "Create account" }).click();
  check("mismatched passwords refused", await page.getByText("The passwords don't match.").isVisible());
  await page.fill("#confirm-password", "river-lamp-42");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByText("Check your email to verify your account.").waitFor({ timeout: 10000 });
  check("signup asks to verify the email", true);
  const link = await lastLink(email, "signup");
  check("verification email sent", Boolean(link));
  await page.goto(link);
  await page.waitForURL("**/candidate**", { timeout: 20000 });
  check("verified signup opens the candidate portal", page.url().includes("/candidate"));
  const rows = await sql("select c.first_name, c.last_name, u.role from candidates c join users u on u.id = c.user_id where c.email = $1", [email]);
  check("candidate account created with the names given", rows[0]?.first_name === "Test" && rows[0]?.last_name === "Candidate" && rows[0]?.role === "candidate");
  await page.screenshot({ path: path.join(SHOTS, "candidate-new.png") });
  await signOutAll(context);
  await signIn(page, email, "candidate", "river-lamp-42");
  await page.waitForURL("**/candidate**", { timeout: 20000 });
  check("Test Candidate signs in with email and password", page.url().includes("/candidate"));
  await context.close();
}

async function applyFirst(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const email = `nora.quinn.${Date.now()}@inbox.example`;
  await page.goto(`${WEB}/careers`);
  await page.getByRole("link", { name: /Kitchen Assistant/ }).first().click();
  await page.waitForURL("**/careers/**");
  check("careers page shows the pay", await page.getByText("$18/hour").first().isVisible());
  check("careers page shows the days", await page.getByText("Friday + Saturday").first().isVisible());
  await page.getByRole("link", { name: /Apply/ }).first().click();
  await page.waitForURL("**/apply");
  await page.fill("#apply-first-name", "Nora");
  await page.fill("#apply-last-name", "Quinn");
  await page.fill("#apply-email", email);
  await page.fill("#apply-phone", "+1 503 555 0190");
  await page.fill("#apply-linkedin", "linkedin.com/in/nora-quinn");
  await page.fill("#apply-experience", "Line cook at a diner for two years.");
  await page.setInputFiles("#apply-resume", PDF);
  await page.getByRole("button", { name: "Submit application" }).click();
  check("days are required for this job", await page.getByText("Choose the days you can work.").isVisible());
  await page.getByLabel("Friday").check();
  await page.getByRole("button", { name: "Submit application" }).click();
  await page.getByText("Your application has been submitted. Create your TalentBridge password").waitFor({ timeout: 15000 });
  check("submitted, with the create-your-password message", true);
  const application = await sql(
    "select a.phone, a.availability, a.experience_note, a.linkedin_url from applications a join candidates c on c.id = a.candidate_id where c.email = $1",
    [email],
  );
  check("application stored with what was given", application[0]?.phone === "+1 503 555 0190" && JSON.stringify(application[0]?.availability) === '["friday"]');
  const link = await lastLink(email, "invite");
  check("activation link emailed", Boolean(link));
  await page.goto(link);
  await page.waitForURL("**/welcome", { timeout: 20000 });
  check("activation opens Create your TalentBridge password", await page.getByRole("heading", { name: "Create your TalentBridge password" }).isVisible());
  await page.fill("#password", "Kitchen-2026");
  await page.fill("#confirm-password", "Kitchen-2026");
  await page.getByRole("button", { name: "Create password and open my portal" }).click();
  await page.waitForURL("**/candidate", { timeout: 20000 });
  check("their application is in the portal", await shows(page.getByText("Kitchen Assistant").first()));
  const portal = await page.locator("main").innerText();
  check("the portal names Sam's Cafe's own contact", !portal.includes("Alex") && portal.includes("Sam"));
  await signOutAll(context);
  await signIn(page, email, "candidate", "Kitchen-2026");
  await page.waitForURL("**/candidate**", { timeout: 20000 });
  check("signs in with the new password, application there", await shows(page.getByText("Kitchen Assistant").first()));
  await page.screenshot({ path: path.join(SHOTS, "apply-first-portal.png") });
  await context.close();
}

async function sophiaElsewhere(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${WEB}/careers`);
  await page.getByRole("link", { name: /Platform Engineer/ }).first().click();
  await page.getByRole("link", { name: /Apply/ }).first().click();
  await page.waitForURL("**/apply");
  await page.fill("#apply-first-name", "Sophia");
  await page.fill("#apply-last-name", "Martinez");
  await page.fill("#apply-email", "sophia.martinez@example.com");
  await page.fill("#apply-phone", "+44 20 7946 0958");
  await page.setInputFiles("#apply-resume", PDF);
  await page.getByRole("button", { name: "Submit application" }).click();
  // A first run: she already has an account. A rerun: she already applied to this one.
  await page.getByText(/You already have a TalentBridge account|You've applied for/).first().waitFor({ timeout: 15000 });
  check("Sophia is told she already has an account", true);
  const people = await sql("select count(*)::int as n from candidates where email = 'sophia.martinez@example.com'");
  const accounts = await sql("select count(*)::int as n from users where email = 'sophia.martinez@example.com'");
  check("no second candidate or account for Sophia", people[0].n === 1 && accounts[0].n === 1);
  await signIn(page, "sophia.martinez@example.com", "candidate");
  await page.waitForURL("**/candidate**", { timeout: 20000 });
  await page.goto(`${WEB}/candidate/applications`);
  check("the new application is in Sophia's portal", await shows(page.getByText("Platform Engineer").first()));
  check("her other employers are still there", await page.getByText("Harbor Robotics").first().isVisible());
  await signOutAll(context);
  await signIn(page, "sophia.martinez@example.com", "employer");
  check("a candidate on employer sign in is stopped", await shows(page.getByText("This is a candidate account.")));
  await context.close();
}

async function alex(browser) {
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await context.newPage();
  await signIn(page, "alex.chen@encord.example", "employer");
  await page.waitForURL("**/recruiter**", { timeout: 20000 });
  check("Alex lands in the full workspace", page.url().includes("/recruiter"));
  for (const label of ["Today", "Candidates", "Jobs", "Interviews", "Messages", "Analytics", "AI Assistant", "Settings"]) {
    check(`full workspace nav: ${label}`, (await page.getByRole("link", { name: label, exact: false }).count()) > 0);
  }
  await page.goto(`${WEB}/recruiter/candidates`);
  await page.getByText("Sophia Martinez").first().waitFor({ timeout: 15000 });
  const text = await page.locator("main").innerText();
  check("Alex sees Encord's pipeline", text.includes("Sophia Martinez"));
  check("Alex never sees Sam's Cafe applicants", !text.includes("Maria Lopez") && !text.includes("Sam's Cafe"));
  await page.goto(`${WEB}/recruiter/today`);
  check("Today still works", await page.getByRole("heading").first().isVisible());
  await page.goto(`${WEB}/hire`);
  await page.waitForURL("**/recruiter**", { timeout: 15000 });
  check("Simple Hire sends a full workspace to /recruiter", page.url().includes("/recruiter"));
  await page.goto(`${WEB}/recruiter/settings`);
  check("Alex sees the company's settings, read-only", await shows(page.getByText("Only your company's admin can change these.")));
  await page.screenshot({ path: path.join(SHOTS, "alex.png") });
  await context.close();
}

async function sam(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await signIn(page, "sam@samscafe.example", "employer");
  await page.waitForURL("**/hire", { timeout: 20000 });
  check("Sam lands in Simple Hire", page.url().endsWith("/hire"));
  check("What would you like to do?", await page.getByRole("heading", { name: "What would you like to do?" }).isVisible());
  for (const label of ["Post a job", "See applicants", "Contact candidates", "Schedule interview"]) {
    check(`big option: ${label}`, await page.getByRole("button", { name: label }).isVisible());
  }
  const nav = await page.getByRole("navigation", { name: "Simple Hire" }).first().innerText();
  check("minimal navigation", ["Home", "Jobs", "Applicants", "Messages"].every((label) => nav.includes(label)) && !/Analytics|Today|Interviews/.test(nav));
  check("no recruiting jargon on Home", !/SLA|pipeline|stage|Analytics/i.test(await page.locator("main").innerText()));
  await page.screenshot({ path: path.join(SHOTS, "sam-home.png") });
  await page.goto(`${WEB}/recruiter`);
  await page.waitForURL("**/hire", { timeout: 15000 });
  check("the full workspace sends Sam to Simple Hire", page.url().endsWith("/hire"));

  // Post a job by describing it.
  await page.fill("#hire-start", "Post a cashier job paying $16 an hour for weekend shifts.");
  await page.keyboard.press("Enter");
  await page.getByText("Ready to post").first().waitFor({ timeout: 20000 });
  await page.getByText("Ready to post", { exact: true }).first().waitFor({ timeout: 20000 });
  const cardText = await page.locator("main").innerText();
  check("Ready to post: Cashier", cardText.includes("Cashier"));
  check("preview: $16/hour", cardText.includes("$16/hour"));
  check("preview: weekend shifts", cardText.includes("Weekend shifts"));
  check("no giant form before Edit", (await page.locator('input[id$="-pay"]').count()) === 0);
  await page.getByRole("button", { name: "Edit" }).first().click();
  check("Edit opens the short form", (await page.locator('input[id$="-pay"]').count()) === 1);
  await page.getByRole("button", { name: "Post Job" }).first().click();
  await page.getByText("Posted").first().waitFor({ timeout: 20000 });
  const jobs = await sql("select j.status, j.pay, j.shift, j.work_days from jobs j join companies c on c.id = j.company_id where c.slug = 'sams-cafe' and j.title = 'Cashier'");
  check("the cashier job is posted and open", jobs[0]?.status === "open" && jobs[0]?.pay === "$16/hour");
  await page.screenshot({ path: path.join(SHOTS, "sam-posted.png") });

  // Demo applicants apply, the way real ones do (run.sh exports the backend's settings for this).
  const out = execFileSync(PYTHON, ["-m", "app.db.demo_applicants", "Cashier", "--company", "sams-cafe"], {
    cwd: HERE,
    encoding: "utf-8",
  });
  check("demo applicants applied", out.includes("6 demo applicants applied"), out.trim());

  await page.goto(`${WEB}/hire`);
  await page.fill("#hire-start", "Show me 3 applicants available weekends with customer service experience.");
  await page.keyboard.press("Enter");
  await page.getByText("Grace Liu").first().waitFor({ timeout: 20000 });
  const list = await page.locator("main").innerText();
  check("three applicants, with reasons", ["Grace Liu", "Omar Haddad", "Priya Raman"].every((name) => list.includes(name)));
  check("reasons are shown", list.includes("Cashier experience") && list.includes("Saturday available") && list.includes("Sunday available"));
  check("no score shown", !/score|rank/i.test(list));
  for (const name of ["Grace Liu", "Omar Haddad", "Priya Raman"]) await page.getByLabel(`Choose ${name}`).check();
  await page.screenshot({ path: path.join(SHOTS, "sam-applicants.png"), fullPage: true });

  await page.fill("#hire-prompt", "Show me their phone numbers.");
  await page.keyboard.press("Enter");
  await page.getByText("+1 503 555 0151").first().waitFor({ timeout: 20000 });
  const contacts = await page.locator("main").innerText();
  check("only the three chosen applicants' numbers", ["+1 503 555 0151", "+1 503 555 0152", "+1 503 555 0153"].every((number) => contacts.includes(number)) && !contacts.includes("+1 503 555 0154") && !contacts.includes("+1 503 555 0141"));
  check("each with the role they applied for", contacts.includes("Applied for Cashier"));

  await page.fill("#hire-prompt", "Ask them if they can interview Tuesday afternoon.");
  await page.keyboard.press("Enter");
  await page.getByText("Interview requests to send").first().waitFor({ timeout: 30000 });
  const requests = await page.locator("main").innerText();
  check("interview window shown", requests.includes("between 1 PM and 5 PM"));
  check("no calendar claimed", requests.includes("No calendar is connected"));
  const before = await sql("select count(*)::int as n from messages m join applications a on a.id = m.application_id join jobs j on j.id = a.job_id where j.title = 'Cashier'");
  check("nothing sent before Send", before[0].n === 0);
  await page.getByRole("button", { name: /Send 3 messages/ }).click();
  await page.getByText("Sent, interview booked").first().waitFor({ timeout: 30000 });
  const after = await sql("select count(*)::int as n from interviews i join applications a on a.id = i.application_id join jobs j on j.id = a.job_id where j.title = 'Cashier'");
  check("three interviews recorded after Send", after[0].n === 3);
  await page.screenshot({ path: path.join(SHOTS, "sam-sent.png"), fullPage: true });

  await page.goto(`${WEB}/hire/jobs`);
  await page.screenshot({ path: path.join(SHOTS, "sam-jobs.png"), fullPage: true });
  check("Jobs lists the cashier job", await shows(page.getByText("Cashier").first()));
  await page.goto(`${WEB}/hire/applicants`);
  await page.screenshot({ path: path.join(SHOTS, "sam-applicants-page.png") });
  check("Applicants shows the days they can work", await shows(page.getByText("Can work:").first()));
  await page.goto(`${WEB}/hire/messages`);
  await page.screenshot({ path: path.join(SHOTS, "sam-messages.png") });
  check("Messages has the conversations", await shows(page.getByText("Grace Liu").first()));
  check("no page errors in Simple Hire", errors.length === 0, errors.join(" | "));
  await context.close();

  // On a phone: the bottom bar, and nothing wider than the screen.
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const small = await phone.newPage();
  await signIn(small, "sam@samscafe.example", "employer");
  await small.waitForURL("**/hire", { timeout: 20000 });
  for (const where of ["/hire", "/hire/jobs", "/hire/applicants", "/hire/messages", "/hire/settings"]) {
    await small.goto(`${WEB}${where}`);
    await small.locator("main").waitFor();
    const overflow = await small.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(`phone: ${where} fits the screen`, overflow <= 1, `overflow ${overflow}px`);
  }
  await small.goto(`${WEB}/hire`);
  check("phone: bottom bar with four places", (await small.locator("nav[aria-label='Simple Hire'] li").count()) >= 4);
  await small.screenshot({ path: path.join(SHOTS, "sam-phone.png") });
  await phone.close();
}

async function employerSignup(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const email = `rosie.${Date.now()}@rosiesbakery.example`;
  await page.goto(`${WEB}/signup/employer?mode=simple`);
  check("Simple Hire signup", await page.getByRole("heading", { name: "Start hiring with Simple Hire" }).isVisible());
  await page.fill("#full-name", "Rosie Chen");
  await page.fill("#email", email);
  await page.fill("#password", "Bakery-2026");
  await page.fill("#confirm-password", "Bakery-2026");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByText("Check your email to verify it.").waitFor({ timeout: 10000 });
  await page.goto(await lastLink(email, "signup"));
  await page.waitForURL("**/onboarding/workspace**", { timeout: 20000 });
  check("onboarding asks which best describes you", await shows(page.getByText("Which best describes you?")));
  check("both ways to hire offered", (await page.getByText("Full Recruiting Workspace").isVisible()) && (await page.getByText("Simple Hire", { exact: true }).isVisible()));
  check("simple preselected from the button", await page.locator('input[name="mode"][value="simple"]').isChecked());
  await page.screenshot({ path: path.join(SHOTS, "onboarding.png") });
  await page.fill("#company", "Rosie's Bakery");
  await page.fill("#location", "Seattle, WA");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await page.waitForURL("**/hire", { timeout: 20000 });
  check("new small business lands in Simple Hire", await page.getByRole("heading", { name: "What would you like to do?" }).isVisible());
  await page.goto(`${WEB}/hire/applicants`);
  check("a new workspace sees nobody else's applicants", await shows(page.getByText("Nobody has applied yet")));
  const rows = await sql("select c.workspace_mode, u.role from users u join companies c on c.id = u.company_id where u.email = $1", [email]);
  check("workspace_mode = simple, as admin", rows[0]?.workspace_mode === "simple" && rows[0]?.role === "admin");
  await context.close();
}

if (!DATABASE_URL) {
  console.error("Set E2E_DATABASE_URL, or run these with e2e/run.sh.");
  process.exit(2);
}
mkdirSync(SHOTS, { recursive: true });
// An installed Chrome (or E2E_BROWSER=msedge): playwright-core downloads no browser of its own.
const browser = await chromium.launch({ channel: process.env.E2E_BROWSER ?? "chrome", headless: true });
const SCENARIOS = { website, candidateSignup, applyFirst, sophiaElsewhere, alex, sam, employerSignup };
for (const [name, run] of Object.entries(SCENARIOS)) {
  if (only.size && !only.has(name)) continue;
  console.log(`\n== ${name}`);
  try {
    await run(browser);
  } catch (error) {
    check(`${name} finished`, false, error.message.split("\n")[0]);
  }
}
await browser.close();
const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
