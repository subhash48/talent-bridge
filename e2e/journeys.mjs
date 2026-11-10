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
  check("hero headline", await page.getByRole("heading", { name: "Talent is everywhere. Find the real ones." }).isVisible());
  check("hero copy", await page.getByText("The work tells you who they are.").isVisible());
  check("hero: Explore the platform", (await page.getByRole("link", { name: "Explore the platform" }).getAttribute("href")) === "/product");
  check("hero: See how it works", (await page.getByRole("link", { name: "See how it works" }).first().getAttribute("href")) === "/#how-it-works");
  const concierge = page.getByPlaceholder("Tell us what you're looking for...");
  check("hero concierge", await concierge.isVisible());
  check("concierge question", await page.getByRole("heading", { name: "How can Hirvello help you?" }).isVisible());
  check("concierge promise", await page.getByText("We'll guide you to the right place.").isVisible());
  check("no sample candidates or suggestions", (await page.getByText(/Maya Chen|Daniel Okafor|Priya Raman|Strong fit|An office coordinator/).count()) === 0);
  // Photographs only where they're meant to be: one per audience in Who it's for and one in The product, no gallery anywhere else.
  check("no gallery of images", (await page.evaluate(() => [...document.images].filter((img) => !img.closest("#solutions, #product")).length)) <= 2);
  const nav = page.getByRole("navigation", { name: "Website" });
  for (const label of ["Home", "Find Jobs", "Product", "How it works", "Pricing"]) {
    check(`nav: ${label}`, await nav.getByRole("link", { name: label, exact: true }).first().isVisible());
  }
  check("nav: Home goes to the homepage", (await nav.getByRole("link", { name: "Home", exact: true }).getAttribute("href")) === "/");
  check("nav: five places, in order", (await nav.locator("a").allInnerTexts()).join("|") === "Home|Find Jobs|Product|How it works|Pricing");
  check("nav: no Solutions or Company menu", (await nav.getByRole("button").count()) === 0);
  const banner = page.getByRole("banner");
  check("Sign in in the header", await banner.getByRole("link", { name: "Sign in", exact: true }).isVisible());
  check("Book a demo in the header", (await banner.getByRole("link", { name: /^Book a demo/ }).getAttribute("href")) === "/book-a-demo");
  check("Create account in the header", await banner.getByRole("link", { name: "Create account", exact: true }).isVisible());
  check("no Employer portal in the header", (await banner.getByRole("link", { name: "Employer portal" }).count()) === 0);
  const bar = await banner.evaluate((el) => {
    const s = getComputedStyle(el);
    const line = [...el.querySelectorAll("div")].find((d) => getComputedStyle(d).height === "1px");
    return { bg: s.backgroundColor, shadow: s.boxShadow, radius: getComputedStyle(el.firstElementChild).borderRadius, line: line ? getComputedStyle(line).backgroundColor : null };
  });
  check("header is clear on the sky, no box", bar.bg === "rgba(0, 0, 0, 0)" && bar.shadow === "none" && bar.radius === "0px", JSON.stringify(bar));
  check("a thin line under the header", Boolean(bar.line) && bar.line !== "rgba(0, 0, 0, 0)", JSON.stringify(bar));

  // The home page from the top down: how it works, who it's for, the product, the invitation.
  for (const id of ["how-it-works", "solutions", "product"]) {
    check(`anchor #${id}`, (await page.locator(`#${id}`).count()) === 1);
  }
  await nav.getByRole("link", { name: "How it works", exact: true }).click();
  await page.waitForTimeout(1000);
  const stepsTop = await page.evaluate(() => document.getElementById("how-it-works").getBoundingClientRect().top);
  check("How it works scrolls to its three steps", stepsTop < 160 && (await page.getByRole("heading", { name: "Three steps. No noise." }).isVisible()), `top ${stepsTop}`);
  const steps = page.locator("#how-it-works");
  for (const [title, line] of [
    ["Say who you need", "Describe your role. Review before posting."],
    ["See the real ones", "See real evidence behind every match."],
    ["Keep everyone informed", "Keep candidates updated at every stage."],
  ]) {
    check(`step: ${title}`, (await steps.getByRole("heading", { name: new RegExp(`${title}$`) }).isVisible()) && (await steps.getByText(line).isVisible()));
  }
  check("each step shows the product, as one labelled picture", (await steps.getByRole("img").count()) === 3);
  check("no cards around the steps", (await steps.locator(".sky-card, .glass").count()) === 0);
  check("three ways in", (await page.locator('#solutions a[href^="/for-"]').count()) === 3);
  const ways = page.locator("#solutions");
  await ways.scrollIntoViewIfNeeded();
  for (const [title, line] of [
    ["Recruiters", "Run a clearer hiring process."],
    ["Candidates", "Know what happens next."],
    ["Small business", "Hire without the complexity."],
  ]) {
    check(`who it's for: ${title}`, (await ways.getByRole("heading", { name: title, exact: true }).isVisible()) && (await ways.getByText(line).isVisible()));
  }
  for (const img of await ways.locator("img").all()) await img.scrollIntoViewIfNeeded();
  const photos = await ways.locator("img").evaluateAll((imgs) => imgs.map((i) => ({ alt: i.alt, ok: i.complete && i.naturalWidth > 0 })));
  check("who it's for: three photos, loaded, described", photos.length === 3 && photos.every((p) => p.ok && p.alt.length > 20), JSON.stringify(photos));
  check("who it's for: no cards", (await ways.locator(".sky-card, .glass").count()) === 0);
  check("product glimpse", await page.getByRole("heading", { name: "A hiring system that keeps its word." }).isVisible());
  const product = page.locator("#product");
  for (const title of ["Communication gaps, noticed", "Updates, drafted", "An assistant that does the work", "Every application, followed"]) {
    check(`product: ${title}`, await product.getByRole("heading", { name: title, exact: true }).isVisible());
  }
  await product.locator("img").scrollIntoViewIfNeeded();
  check("product: the photo loads, described", await product.locator("img").evaluate((i) => i.complete && i.naturalWidth > 0 && i.alt.length > 20));
  check("product: the still of Today", (await product.getByText("Today", { exact: true }).isVisible()) && (await product.getByText("3 updates to review").isVisible()));
  check("product: no sample candidates", (await product.getByText(/Priya Nair|Marcus Lee|Sofia Alvarez/).count()) === 0);
  // The closing line: a heading, one sentence and two ways in, straight on the sky (no card, no beta label).
  const closing = page.locator("section[aria-labelledby=closing-title]");
  await closing.scrollIntoViewIfNeeded();
  check("closing line", await closing.getByRole("heading", { name: "Ready to hire with more clarity?" }).isVisible());
  check("closing: Get started signs up", (await closing.getByRole("link", { name: "Get started" }).getAttribute("href")) === "/start");
  check("closing: Book a demo", (await closing.getByRole("link", { name: "Book a demo" }).getAttribute("href")) === "/book-a-demo");
  check("closing: no card, no beta label", (await closing.locator(".sky-card, .glass").count()) === 0 && (await closing.getByText(/beta is open/i).count()) === 0);
  const footer = page.getByRole("contentinfo");
  await footer.scrollIntoViewIfNeeded();
  // The home page ends on its closing line alone: the footer's own invitation is left off here (it stays on the other pages).
  check("home: one closing invitation", (await page.getByText("Better hiring starts here.").count()) === 0 && (await footer.getByRole("link", { name: "Get started" }).count()) === 0);
  const footerLinks = {
    Product: "/product",
    "How it works": "/#how-it-works",
    Pricing: "/pricing",
    Recruiters: "/for-recruiters",
    Candidates: "/for-candidates",
    "Small business": "/for-small-businesses",
    About: "/about",
    Careers: "/about/careers",
    Contact: "/contact",
  };
  for (const [label, href] of Object.entries(footerLinks)) {
    check(`footer: ${label}`, (await footer.getByRole("navigation", { name: "Footer" }).getByRole("link", { name: label, exact: true }).getAttribute("href")) === href);
  }
  for (const heading of ["Product", "For you", "Company", "Follow Hirvello"]) {
    check(`footer heading: ${heading}`, await footer.locator("p", { hasText: new RegExp(`^${heading}$`) }).isVisible());
  }
  // The networks are named either way; they're links only when their address is configured (HIRVELLO_*_URL).
  for (const network of ["LinkedIn", "Instagram"]) {
    const link = footer.getByRole("link", { name: new RegExp(`^Hirvello on ${network}`) });
    if (await link.count()) {
      const href = await link.getAttribute("href");
      check(`footer: ${network} opens in a new tab`, (await link.getAttribute("target")) === "_blank" && (await link.getAttribute("rel")) === "noopener noreferrer" && href.startsWith("https://"), href);
    } else {
      check(`footer: ${network} named, not linked`, await footer.getByText(network, { exact: true }).isVisible());
    }
  }
  check("footer copyright", await footer.getByText("© 2026 Hirvello").isVisible());
  check("footer: no card around it", (await footer.locator(".sky-card, .glass").count()) === 0);
  check("no made-up claims", !(await page.content()).match(/customers love|trusted by|backed by|funding|market leader/i));

  // The concierge reads what you type and opens the flow that fits; when it can't tell, it asks.
  await concierge.scrollIntoViewIfNeeded();
  await page.locator("form button[type=submit]").first().click();
  // Still on the home page (the URL may carry #how-it-works from following the header's link above).
  check("concierge asks for a few words first", (await page.getByText("Tell us a little about what you need first.").isVisible()) && new URL(page.url()).pathname === "/", page.url());
  const ask = async (text) => {
    await page.goto(WEB);
    await concierge.fill(text);
    await concierge.press("Enter");
  };
  await ask("I'm a recruiter looking for developers.");
  await page.waitForURL("**/login?as=employer");
  check("recruiter intent opens the employer sign-in", await page.getByRole("heading", { name: "Sign in to your workspace" }).isVisible());
  await ask("I'm hiring staff for my café.");
  await page.waitForURL("**/signup/employer?mode=simple");
  check("small-business intent opens Simple Hire's onboarding", await page.getByRole("heading", { name: "Start hiring with Simple Hire" }).isVisible());
  await ask("Help me find work.");
  await page.waitForURL("**/login?as=candidate");
  check("candidate intent opens the candidate sign-in", await page.getByRole("heading", { name: "Sign in to Hirvello" }).isVisible());
  await ask("I want to find talent.");
  const choice = page.getByRole("dialog", { name: "Which of these is you?" });
  check("an unclear request asks who you are", (await choice.isVisible()) && page.url() === `${WEB}/`);
  for (const label of ["I'm a recruiter", "I own a small business", "I'm looking for a job"]) {
    check(`choice: ${label}`, await choice.getByRole("link", { name: new RegExp(`^${label}`) }).isVisible());
  }
  await choice.getByRole("link", { name: /^I own a small business/ }).click();
  await page.waitForURL("**/signup/employer?mode=simple");
  check("the choice opens that flow", page.url().endsWith("/signup/employer?mode=simple"));

  await page.goto(`${WEB}/pricing`);
  check("pricing page", await page.getByRole("heading", { name: "Free while we're in beta." }).isVisible());
  check("pricing names no price", !(await page.locator("main").innerText()).match(/\$\s?\d/));
  const pageFooter = page.getByRole("contentinfo");
  check("other pages keep the footer invitation", await pageFooter.getByRole("heading", { name: "Better hiring starts here." }).isVisible());
  check("footer: Get started signs up", (await pageFooter.getByRole("link", { name: "Get started" }).getAttribute("href")) === "/start");

  await page.goto(`${WEB}/for-small-businesses`);
  check("small business page", await page.getByRole("heading", { name: "Hiring shouldn't require learning recruiting software." }).isVisible());
  const hireSteps = (await page.locator("#small-business ol > li p:first-child").allInnerTexts()).join(" | ");
  check("small business: four steps, in order", hireSteps === "Post a job | See who applied | Contact the ones you like | Set up an interview", hireSteps);
  await page.goto(`${WEB}/for-candidates`);
  check("candidates page", await page.getByRole("heading", { name: "Know where every application stands." }).isVisible());
  check("candidates: the example is labelled as one", await page.getByText(/^An example account\./).isVisible());
  await page.goto(`${WEB}/for-recruiters`);
  check("recruiters page", await page.getByRole("heading", { name: "A workspace that keeps every candidate informed." }).isVisible());
  for (const group of ["Your pipeline", "Nobody left waiting", "Help along the way"]) {
    check(`recruiters: ${group}`, await page.getByRole("heading", { name: group, exact: true }).isVisible());
  }
  await page.goto(`${WEB}/about`);
  check("about page", await page.getByRole("heading", { name: "Hiring shouldn't go quiet." }).isVisible());
  await page.goto(`${WEB}/product`);
  check("product page", await page.getByRole("heading", { name: "What Hirvello does." }).isVisible());
  check("product: five numbered rows, each with its audience's page", (await page.locator("#product ol > li").count()) === 5 && (await page.locator('#product ol a[href^="/for-"]').count()) === 5);
  await page.goto(`${WEB}/about/careers`);
  check("company careers page", await page.getByRole("heading", { name: "Help hiring stop going quiet." }).isVisible());
  // The section labels are plain words now: no glowing dot beside them anywhere past the hero, on any page.
  for (const path of ["/", "/product", "/for-recruiters", "/pricing"]) {
    await page.goto(`${WEB}${path}`);
    check(`${path}: no dotted labels`, (await page.locator("main section:not([aria-labelledby=hero-title]) p > span[class~=\"size-1.5\"].bg-accent").count()) === 0);
  }
  await page.keyboard.press("Tab");
  check("skip link comes first and lands on the page", (await page.evaluate(() => document.activeElement?.textContent)) === "Skip to content");
  await page.keyboard.press("Enter");
  check("skip link target", page.url().endsWith("#main") && (await page.locator("main#main").count()) === 1);
  await page.goto(`${WEB}/start`);
  check("Get started asks how you'll use it", await page.getByRole("heading", { name: /get started/i }).isVisible());
  check("Get started offers three ways in", (await page.locator('main a[href^="/signup"]').count()) === 3);

  await page.goto(`${WEB}/contact`);
  // Two ways in, each with its own address, and one form that reaches the team its topic names.
  for (const [title, address] of [["Business inquiries", "business@hirvello.com"], ["Customer support", "support@hirvello.com"]]) {
    const main = page.locator("main");
    check(`contact: ${title}`, (await main.getByRole("heading", { name: title }).isVisible()) && (await main.getByRole("link", { name: address }).getAttribute("href")) === `mailto:${address}`);
  }
  await page.getByRole("button", { name: "Send message" }).click();
  check("contact form asks for a subject", await page.getByText("Add a subject.").isVisible());
  await page.getByLabel("Customer support").check();
  await page.fill("#contact-name", "Priya Nair");
  await page.fill("#contact-email", "priya@northwind.example");
  await page.fill("#contact-subject", "Can't see my applicants");
  await page.fill("#contact-message", "The Today page is empty since this morning.");
  await page.getByRole("button", { name: "Send message" }).click();
  await page.getByText("Thanks, Priya. Your message reached our support team").waitFor({ timeout: 10000 });
  const stored = await sql("select topic, email, message from contact_requests order by created_at desc limit 1");
  check(
    "support request stored with its subject",
    stored[0]?.topic === "support" && stored[0]?.email === "priya@northwind.example" && stored[0]?.message.startsWith("Subject: Can't see my applicants"),
  );
  const footerMail = await page.getByRole("contentinfo").locator('a[href^="mailto:"]').evaluateAll((links) => links.map((a) => a.getAttribute("href")));
  check("footer: business and support addresses", footerMail.join(" ") === "mailto:business@hirvello.com mailto:support@hirvello.com", footerMail.join(" "));
  await page.goto(`${WEB}/about`);
  for (const [name, address] of [["Subhash Galla", "subhash@hirvello.com"], ["Jordan Curri", "jordan.curri@hirvello.com"]]) {
    check(`about: ${name}`, (await page.getByText(name, { exact: true }).isVisible()) && (await page.getByRole("link", { name: address }).count()) === 1);
  }

  // Book a demo is the same form set to the pilot programme, with no inquiry type to pick.
  await page.goto(`${WEB}/book-a-demo`);
  check("demo page", await page.getByRole("heading", { name: "See Hirvello with your own roles." }).isVisible());
  check("demo page has no inquiry type to pick", (await page.locator('input[name="contact-topic"]').count()) === 0);
  check("demo page offers the business address", (await page.locator("main").getByRole("link", { name: "business@hirvello.com" }).count()) === 1);
  await page.getByRole("button", { name: "Request a demo" }).click();
  check("demo form checks its fields first", await page.getByText("Enter your full name.").isVisible());
  await page.fill("#contact-name", "Dana Whitfield");
  await page.fill("#contact-email", "dana@brightside.example");
  await page.fill("#contact-company", "Brightside Dental");
  await page.fill("#contact-message", "Two clinics, hiring front-desk staff.");
  await page.getByRole("button", { name: "Request a demo" }).click();
  await page.getByText("Thanks, Dana.").waitFor({ timeout: 10000 });
  const demo = await sql("select topic, company, email from contact_requests order by created_at desc limit 1");
  check("demo request stored as a pilot inquiry", demo[0]?.topic === "pilot" && demo[0]?.company === "Brightside Dental" && demo[0]?.email === "dana@brightside.example");

  await page.getByRole("contentinfo").getByRole("link", { name: "Privacy" }).click();
  await page.waitForURL("**/privacy");
  check("privacy page says it's a draft", await page.getByText(/not legal advice/).isVisible());
  await page.goto(`${WEB}/terms`);
  check("terms page says it's a draft", await page.getByText(/not legal advice/).isVisible());

  await page.goto(WEB);
  await page.getByRole("banner").getByRole("link", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/signin");
  check("sign in asks who you are", await page.getByRole("heading", { name: "How are you using Hirvello?" }).isVisible());
  check("candidate choice", await page.getByRole("link", { name: /Candidate/ }).first().isVisible());
  check("employer choice", await page.getByRole("link", { name: /Employer \/ Recruiter/ }).isVisible());
  await page.goto(WEB);
  await page.getByRole("banner").getByRole("link", { name: "Create account", exact: true }).click();
  await page.waitForURL("**/start");
  check("Sign up asks how you'll use Hirvello", await page.getByRole("heading", { name: /get started/i }).isVisible());

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const small = await phone.newPage();
  await small.goto(WEB);
  const overflow = await small.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check("no sideways scroll on a phone", overflow <= 1, `overflow ${overflow}px`);
  await small.getByRole("button", { name: "Open menu" }).click();
  check("phone menu opens", await small.locator("#site-menu").isVisible());
  check("phone menu: navigation and account links", (await small.locator("#site-menu a").allInnerTexts()).join("|") === "Home|Find Jobs|Product|How it works|Pricing|Sign in|Book a demo|Create account");
  await small.keyboard.press("Escape");
  check("phone menu closes on Escape", (await small.locator("#site-menu").count()) === 0);
  await small.getByRole("button", { name: "Open menu" }).click();
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
  const [role] = await sql("select id from jobs where title='Kitchen Assistant' limit 1");
  const next = `/jobs/${role.id}/apply`;
  await page.goto(`${WEB}/signup?next=${encodeURIComponent(next)}`);
  await page.fill("#full-name", "Test Candidate");
  await page.fill("#email", email);
  await page.fill("#password", "short1");
  await page.getByRole("button", { name: "Create account" }).click();
  check("weak password refused", await page.getByText("Use at least 8 characters.").isVisible());
  await page.fill("#password", "river-lamp-42");
  await page.getByRole("button", { name: "Show password" }).click();
  check("password visibility toggle", await page.locator("#password").getAttribute("type") === "text");
  await page.getByRole("button", { name: "Hide password" }).click();
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByText("Check your email to verify your account.").waitFor({ timeout: 10000 });
  check("signup asks to verify the email", true);
  const link = await lastLink(email, "signup");
  check("verification email sent", Boolean(link));
  await page.goto(link);
  await page.waitForURL(`${WEB}${next}`, { timeout: 20000 });
  check("email signup preserves the selected application", await shows(page.getByRole("heading", { name: "Applying as Test Candidate" })));
  const rows = await sql("select c.first_name, c.last_name, u.role from candidates c join users u on u.id = c.user_id where c.email = $1", [email]);
  check("candidate account created with the names given", rows[0]?.first_name === "Test" && rows[0]?.last_name === "Candidate" && rows[0]?.role === "candidate");
  await page.goto(`${WEB}/candidate`);
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
  await page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Kitchen Assistant", exact: true }) }).getByRole("link", { name: "View details" }).click();
  await page.waitForURL("**/jobs/**");
  check("careers page shows the pay", await shows(page.getByText("$18 an hour").first()));
  check("careers page shows the days", await shows(page.getByText("Friday + Saturday", { exact: true })));
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
  await page.getByText("Your application has been submitted. Create your Hirvello password").waitFor({ timeout: 15000 });
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
  check("activation opens Create your Hirvello password", await page.getByRole("heading", { name: "Create your Hirvello password" }).isVisible());
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
  await page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Platform Engineer", exact: true }) }).getByRole("link", { name: "View details" }).click();
  await page.getByRole("link", { name: /Apply/ }).first().click();
  await page.waitForURL("**/apply");
  await page.fill("#apply-first-name", "Sophia");
  await page.fill("#apply-last-name", "Martinez");
  await page.fill("#apply-email", "sophia.martinez@example.com");
  await page.fill("#apply-phone", "+44 20 7946 0958");
  await page.setInputFiles("#apply-resume", PDF);
  await page.getByRole("button", { name: "Submit application" }).click();
  // A first run: she already has an account. A rerun: she already applied to this one.
  await page.getByText(/You already have a Hirvello account|You've applied for/).first().waitFor({ timeout: 15000 });
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
  await page.getByRole("button", { name: "Continue", exact: true }).click();
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

async function jobBoard(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${WEB}/jobs`);
  check("public board opens without sign-in", await shows(page.getByRole("heading", { name: "Find your next opportunity." })));
  await page.screenshot({ path: path.join(SHOTS, "jobs-desktop.png"), fullPage: true });
  const tabs = page.getByRole("navigation", { name: "Who posted the job" });
  await tabs.getByRole("link", { name: /Small Business Jobs/ }).click();
  await page.waitForURL("**source=small_business");
  await page.locator('#job-results[aria-busy="false"]').waitFor();
  check("small business tab only lists small businesses", (await page.locator("article").count()) > 0 && await page.locator("article").filter({ hasText: "Posted by Recruiter" }).count() === 0);
  await tabs.getByRole("link", { name: /Recruiter Jobs/ }).click();
  await page.waitForURL("**source=recruiter");
  await page.locator('#job-results[aria-busy="false"]').waitFor();
  check("recruiter tab only lists recruiter jobs", (await page.locator("article").count()) > 0 && await page.locator("article").filter({ hasText: "Posted by Small Business" }).count() === 0);
  await page.goto(`${WEB}/jobs`);
  await page.fill("#jobs-q", "Kitchen");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.waitForURL("**q=Kitchen");
  await page.locator('#job-results[aria-busy="false"]').waitFor();
  check("keyword search returns the actual job", await page.locator("article").count() === 1 && await shows(page.getByRole("heading", { name: "Kitchen Assistant", exact: true })));
  await page.getByRole("button", { name: "Work arrangement", exact: true }).click();
  await page.getByRole("menuitemcheckbox", { name: "Remote", exact: true }).click();
  await page.keyboard.press("Escape");
  check("filters show a clear empty state", await shows(page.getByRole("heading", { name: "No jobs match these filters." })));
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await page.getByRole("link", { name: "View details", exact: true }).click();
  check("public detail includes source and pay", await shows(page.getByText("Posted by Small Business", { exact: true })) && await shows(page.getByText("$18 an hour", { exact: true })));
  await page.getByRole("link", { name: "Apply now", exact: true }).last().click();
  await page.waitForURL((url) => url.pathname.endsWith("/apply"));
  const applyUrl = page.url();
  await page.getByRole("main").getByRole("link", { name: "Sign in", exact: true }).click();
  await page.fill("#email", "sophia.martinez@example.com");
  await page.fill("#password", PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(applyUrl, { timeout: 20000 });
  check("sign in returns to the selected application", await shows(page.getByRole("heading", { name: "Applying as Sophia Martinez" })));
  await page.setInputFiles("#candidate-apply-resume", PDF);
  await page.getByLabel("Friday", { exact: true }).check();
  await page.getByRole("button", { name: "Submit application" }).click();
  check("signed-in application confirms submission", await shows(page.getByRole("heading", { name: /Application sent|You've already applied/ })));
  const rows = await sql("select a.id, co.name from applications a join jobs j on j.id=a.job_id join companies co on co.id=j.company_id join candidates c on c.id=a.candidate_id where c.email=$1 and j.title='Kitchen Assistant'", ["sophia.martinez@example.com"]);
  check("application saved to the correct employer once", rows.length === 1 && rows[0].name === "Sam's Cafe");
  await page.getByRole("link", { name: "View your applications" }).click();
  check("signed-in application is in the candidate dashboard", await shows(page.getByText("Kitchen Assistant", { exact: true })));
  await page.reload();
  check("refresh preserves the candidate session", await shows(page.getByText("Kitchen Assistant", { exact: true })) && page.url().includes("/candidate/applications"));
  await page.goto(applyUrl);
  await page.getByRole("heading", { name: "Applying as Sophia Martinez" }).waitFor();
  await page.setInputFiles("#candidate-apply-resume", PDF);
  await page.getByText(path.basename(PDF), { exact: true }).waitFor();
  await page.getByLabel("Friday", { exact: true }).check();
  await page.getByRole("button", { name: "Submit application" }).click();
  check("duplicate application is explained", await shows(page.getByRole("heading", { name: "You've already applied" })));
  if (!(await page.getByRole("heading", { name: "You've already applied" }).isVisible())) {
    console.error(await page.locator("main").innerText());
  }
  await page.goto(`${WEB}/candidate/applications`);
  await page.getByRole("button", { name: /Sophia Martinez/ }).click();
  await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
  await page.waitForURL("**reason=signed_out");
  check("logout returns to candidate sign-in", new URL(page.url()).searchParams.get("as") === "candidate");
  await page.goto(`${WEB}/candidate/applications`);
  check("protected candidate page redirects after logout", page.url().includes("/login"));
  for (const route of ["/jobs", "/login?as=candidate", "/signup"]) {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${WEB}${route}`);
    check(`mobile ${route} fits`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: path.join(SHOTS, `mobile-${route.split("?")[0].slice(1)}.png`), fullPage: true });
  }
  check("no browser errors in board/apply flow", errors.length === 0, errors.join(" | "));
  await context.close();
}

async function googleAuth(browser) {
  const email = `google.${Date.now()}@inbox.example`;
  const context = await browser.newContext();
  const page = await context.newPage();
  const configure = async (data) => fetch(`${AUTH}/__google`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
  await configure({ email, fullName: "Google Candidate", cancel: false, enabled: true });
  const [role] = await sql("select id from jobs where title='Kitchen Assistant' limit 1");
  const next = `/jobs/${role.id}/apply`;
  await page.goto(`${WEB}/signup?next=${encodeURIComponent(next)}`);
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await page.waitForURL(`${WEB}${next}`, { timeout: 20000 });
  check("Google signup returns to the selected application", await shows(page.getByRole("heading", { name: "Applying as Google Candidate" })));
  check("first Google sign-in creates a candidate", (await sql("select u.role from users u join candidates c on c.user_id=u.id where c.email=$1", [email]))[0]?.role === "candidate");
  await page.goto(`${WEB}/candidate`);
  await page.reload();
  check("Google session survives refresh", page.url().endsWith("/candidate"));
  await context.clearCookies();
  await page.goto(`${WEB}/login?as=candidate`);
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await page.waitForURL("**/candidate", { timeout: 20000 });
  check("returning Google user reuses the account", (await sql("select id from candidates where email=$1", [email])).length === 1);
  await context.clearCookies();
  await configure({ cancel: true });
  await page.goto(`${WEB}/login?as=candidate`);
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await page.waitForURL("**reason=google_cancelled", { timeout: 15000 });
  check("Google cancellation returns a helpful notice", await shows(page.getByRole("alert")));
  await configure({ email: "sam@samscafe.example", cancel: false });
  await page.goto(`${WEB}/login?as=employer`);
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await page.waitForURL("**/hire", { timeout: 15000 });
  check("Google employer reaches its existing workspace", true);
  await context.clearCookies();
  await page.goto(`${WEB}/login?as=candidate`);
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await page.waitForURL("**reason=wrong_account", { timeout: 15000 });
  check("Google on candidate page never changes an employer's role", (await sql("select role from users where email='sam@samscafe.example'"))[0].role === "admin");
  await configure({ email: `owner.${Date.now()}@inbox.example`, fullName: "Google Owner" });
  await page.goto(`${WEB}/signup/employer?mode=simple`);
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await page.waitForURL("**/onboarding/workspace**", { timeout: 15000 });
  check("new Google employer must create a workspace", await shows(page.getByText("Which best describes you?")));
  await page.fill("#company", "Google Test Bakery");
  await page.fill("#location", "Austin, TX");
  await page.getByRole("button", { name: "Create workspace", exact: true }).click();
  await page.waitForURL("**/hire", { timeout: 15000 });
  check("Google employer signup creates its own Simple Hire workspace", true);
  await context.clearCookies();
  await configure({ enabled: false });
  await page.goto(`${WEB}/signup`);
  await page.getByRole("button", { name: "Continue with Google" }).click();
  check("disabled Google provider gives email fallback", await shows(page.getByText("Google sign-in isn't available right now. Use your email and password.")));
  await configure({ enabled: true });

  // A return address that isn't on Supabase's Redirect URLs list sends people to the Site URL, the home page,
  // with the code: the app still finishes the sign-in and goes back to where it was going.
  await context.clearCookies();
  await configure({ email: `google.site.${Date.now()}@inbox.example`, fullName: "Site Fallback", cancel: false, siteUrl: `${WEB}/` });
  await page.goto(`${WEB}/signup?next=${encodeURIComponent(next)}`);
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await page.waitForURL(`${WEB}${next}`, { timeout: 20000 });
  check("Google sent to the home page still returns to the application", await shows(page.getByRole("heading", { name: "Applying as Site Fallback" })));
  await context.clearCookies();
  await page.goto(`${WEB}/login?as=candidate`);
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await page.waitForURL("**/candidate", { timeout: 20000 });
  check("returning Google sign-in sent to the home page opens the portal", page.url() === `${WEB}/candidate`);
  await context.clearCookies();
  await configure({ cancel: true });
  await page.goto(`${WEB}/login?as=candidate`);
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await page.waitForURL("**reason=google_cancelled", { timeout: 15000 });
  check("cancelled Google sent to the home page still says so", await shows(page.getByRole("alert")));
  await page.goto(`${WEB}/?code=not-a-real-code`);
  await page.waitForURL("**/login?reason=link_invalid", { timeout: 15000 });
  check("a stray code on the home page is refused, not ignored", true);
  await configure({ cancel: false, siteUrl: null });
  await context.close();
}

async function employerJobBoard(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const publicPage = await context.newPage();
  await signIn(page, "alex.chen@encord.example");
  await page.waitForURL("**/recruiter/**");
  await page.goto(`${WEB}/recruiter/jobs`);
  await page.getByRole("button", { name: "Create job", exact: true }).click();
  const title = `Board Engineer ${Date.now()}`;
  await page.fill("#new-job-title", title);
  await page.fill("#new-job-location", "Austin, TX");
  await page.selectOption("#new-job-arrangement", "remote");
  await page.fill("#new-job-salary-min", "100000");
  await page.fill("#new-job-salary-max", "120000");
  await page.fill("#new-job-description", "Help build a more thoughtful hiring experience.");
  await page.getByRole("dialog").getByRole("button", { name: "Create job", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  const [job] = await sql("select id, posted_by from jobs where title=$1", [title]);
  check("recruiter form persists the employer's source", job?.posted_by === "recruiter");
  await publicPage.goto(`${WEB}/jobs?q=${encodeURIComponent(title)}`);
  check("new recruiter job appears automatically", await shows(publicPage.getByRole("heading", { name: title, exact: true })));
  check("new recruiter job shows structured pay", await shows(publicPage.getByText("$100k–$120k a year", { exact: true })));
  await page.goto(`${WEB}/recruiter/jobs/${job.id}`);
  await page.getByRole("button", { name: "Edit job", exact: true }).click();
  await page.getByLabel("Show on the Hirvello job board").uncheck();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await publicPage.goto(`${WEB}/jobs/${job.id}`);
  check("making a job private removes its public detail", await shows(publicPage.getByText("This role isn't open anymore", { exact: true })));
  await page.getByRole("button", { name: "Edit job", exact: true }).click();
  await page.getByLabel("Show on the Hirvello job board").check();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Close role", exact: true }).click();
  await page.getByRole("button", { name: "Reopen role", exact: true }).waitFor();
  await publicPage.goto(`${WEB}/jobs/${job.id}`);
  check("closing a job removes its public detail", await shows(publicPage.getByText("This role isn't open anymore", { exact: true })));
  await context.close();
}

async function passwordReset(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${WEB}/forgot-password?as=candidate`);
  await page.fill("#email", "sophia.martinez@example.com");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await page.getByText(/we've sent it a link to reset/).waitFor();
  const link = await lastLink("sophia.martinez@example.com", "recovery");
  await page.goto(link);
  await page.waitForURL("**/reset-password", { timeout: 15000 });
  await page.fill("#password", "Changed-pass-2026");
  await page.fill("#confirm-password", "Mismatch-pass-2026");
  await page.getByRole("button", { name: "Set new password" }).click();
  check("reset refuses mismatched confirmation", await shows(page.getByText("The passwords don't match.")));
  await page.fill("#confirm-password", "Changed-pass-2026");
  await page.getByRole("button", { name: "Set new password" }).click();
  await page.waitForURL("**/candidate", { timeout: 15000 });
  await context.clearCookies();
  await signIn(page, "sophia.martinez@example.com", "candidate", "Changed-pass-2026");
  await page.waitForURL("**/candidate", { timeout: 15000 });
  check("reset password works at next sign-in", true);
  await context.clearCookies();
  await page.goto(`${WEB}/auth/confirm?code=expired`);
  check("invalid confirmation link is explained", page.url().includes("reason=link_invalid"));
  // Restore the fixture's password for other journeys, through the test-only auth endpoint.
  await fetch(`${AUTH}/__seed`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "sophia.martinez@example.com", password: PASSWORD }) });
  await context.close();
}

if (!DATABASE_URL) {
  console.error("Set E2E_DATABASE_URL, or run these with e2e/run.sh.");
  process.exit(2);
}
mkdirSync(SHOTS, { recursive: true });
// An installed Chrome (or E2E_BROWSER=msedge): playwright-core downloads no browser of its own.
const browser = await chromium.launch({ channel: process.env.E2E_BROWSER ?? "chrome", headless: true });
// The job board's sample employers (backend/app/db/board_samples.py) and their Simple Hire test owner. Last, so
// the other journeys see the board as the demo seed left it.
async function boardSamples(browser) {
  const owner = "owner.bluebird@inbox.example";
  await fetch(`${AUTH}/__seed`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: owner, password: PASSWORD }) });
  const run = (...args) => execFileSync(PYTHON, ["-m", "app.db.board_samples", ...args], { cwd: HERE, encoding: "utf-8" });
  const out = run("--owner", owner);
  check("samples added with their owner", out.includes("10 companies, 10 jobs") && out.includes("signs in with its Supabase account"), out.trim());
  check("running it again adds nothing", run().includes("0 companies, 0 jobs"));
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${WEB}/jobs?source=recruiter`);
  await page.locator('#job-results[aria-busy="false"]').waitFor();
  for (const company of ["Fernbrook Analytics", "Halcyon Health", "Ridgeline Freight", "Lanternfish Learning", "Solvane Energy"]) {
    check(`recruiter tab lists ${company}`, await page.locator("article").filter({ hasText: company }).count() === 1);
  }
  await page.goto(`${WEB}/jobs?source=small_business`);
  await page.locator('#job-results[aria-busy="false"]').waitFor();
  for (const company of ["Bluebird Coffee Co.", "Greenleaf Landscaping", "Elm Street Auto Repair", "Sunny Paws Pet Care", "Harbor Lane Dental"]) {
    check(`small business tab lists ${company}`, await page.locator("article").filter({ hasText: company }).filter({ hasText: "Posted by Small Business" }).count() === 1);
  }
  await page.screenshot({ path: path.join(SHOTS, "jobs-small-business-samples.png"), fullPage: true });
  await signIn(page, owner);
  await page.waitForURL("**/hire**", { timeout: 20000 });
  check("small business test login opens Simple Hire", await shows(page.getByRole("heading", { name: "What would you like to do?" })));
  await page.goto(`${WEB}/hire/jobs`);
  check("the owner's Jobs page lists Bluebird's barista job", await shows(page.getByText("Barista").first()));
  check("and no other employer's job", await page.getByText("Senior Data Engineer").count() === 0 && await page.getByText("Dog Walker").count() === 0);
  const [mine] = await sql("select count(*)::int as n from jobs j join users u on u.company_id = j.company_id where u.email = $1", [owner]);
  check("the owner's workspace has only its own job", mine.n === 1);
  await context.close();
  check("hide closes the samples", run("--hide").includes("Closed 10 sample jobs"));
  const [open] = await sql("select count(*)::int as n from jobs j join companies c on c.id = j.company_id where c.slug = 'bluebird-coffee' and j.status = 'open'");
  check("hidden samples are off the board", open.n === 0);
}

const SCENARIOS = { website, candidateSignup, applyFirst, sophiaElsewhere, alex, sam, employerSignup, jobBoard, googleAuth, employerJobBoard, passwordReset, boardSamples };
for (const [name, run] of Object.entries(SCENARIOS)) {
  if (only.size && !only.has(name)) continue;
  console.log(`\n== ${name}`);
  try {
    await run(browser);
  } catch (error) {
    check(`${name} finished`, false, error.message.split("\n")[0]);
    console.error(error.message);
    for (const context of browser.contexts()) {
      for (const page of context.pages()) {
        console.error(`Page at failure: ${page.url()}`);
        await page.screenshot({ path: path.join(SHOTS, `${name}-failure.png`), fullPage: true }).catch(() => {});
      }
      await context.close();
    }
  }
}
await browser.close();
const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
