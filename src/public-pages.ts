import type { Express } from "express";
import { TRIAL_PERIOD_DAYS } from "./access.js";
import { connectPageBody, landingConnectLead } from "./connect-page.js";
import { canonicalPublicOrigin } from "./public-url.js";

export const logo = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect width="256" height="256" rx="56" fill="#0e1a22"/><path d="M48 188h160" stroke="#8fd0c8" stroke-width="8" stroke-linecap="round"/><circle cx="72" cy="188" r="12" fill="#1f6f78"/><circle cx="128" cy="188" r="12" fill="#1f6f78"/><circle cx="184" cy="188" r="12" fill="#e7f2f4"/><path d="M128 188V64" stroke="#e7f2f4" stroke-width="8" stroke-linecap="round"/><path d="M128 68h72l-16 24 16 24h-72z" fill="#1f6f78"/></svg>`;

const shell = (title: string, body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Milestone</title><link rel="icon" href="/icon.svg"><style>
body{margin:0;background:#0e1a22;color:#e7f2f4;font:17px/1.6 system-ui}main{max-width:840px;margin:40px auto;padding:24px}a{color:#8fd0c8}h1{line-height:1.15;font-size:40px}h2{margin-top:32px}nav,footer{display:flex;flex-wrap:wrap;gap:18px}section{border:1px solid #2c4650;border-radius:16px;padding:22px;margin:22px 0}button,input,textarea{font:inherit;box-sizing:border-box}button{cursor:pointer;padding:12px 16px;border-radius:10px;border:0;background:#1f6f78;color:#fff;margin:8px 8px 8px 0}button.secondary{background:transparent;border:1px solid #6f9aa0;color:#e7f2f4}input,textarea{width:100%;padding:10px;border:1px solid #6f9aa0;border-radius:8px;background:#09141a;color:inherit}label{display:block;margin:12px 0}code,pre{overflow-wrap:anywhere}pre{overflow:auto;background:#09141a;padding:12px;border-radius:8px}[hidden]{display:none!important}#message{white-space:pre-wrap}
</style></head><body><main><nav><a href="/">Milestone</a><a href="/connect">Connect an assistant</a><a href="/support">Support</a></nav><h1>${title}</h1>${body}<footer><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/support">Support</a></footer></main></body></html>`;

export function page(title: string, body: string): string {
  return shell(title, body);
}

function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function landingPage(input: { appBaseUrl: string; supabaseUrl: string; supabaseAnonKey: string }): string {
  const origin = canonicalPublicOrigin(input.appBaseUrl);
  const configured = Boolean(input.supabaseUrl && input.supabaseAnonKey);
  const config = jsonForScript({
    url: input.supabaseUrl,
    key: input.supabaseAnonKey,
    base: origin
  });
  const oauthNote = configured
    ? `<p>Sign in with your account. Do not paste an API key or password into an MCP header.</p>`
    : `<p>OAuth is not configured on this process yet. Set the authorization server environment before asking an assistant to sign in. Do not paste an API key into a header.</p>`;
  return shell("Approved milestones and what done means", `${landingConnectLead(origin)}
<p>Milestone keeps a freelancer's approved milestone definitions and the acceptance criteria that say what done means. An assistant reads that record before it answers. It cannot say a milestone is complete, or that the next payment is released, unless those saved acceptance criteria were met. It cannot invent an extra deliverable or mark work done that was not saved.</p>
${oauthNote}
<p id="signedOut">Milestone tools need Pro or an active trial.</p>
<section id="account" hidden><p id="email"></p><p id="status" role="status"></p><button class="secondary" id="signOut" type="button">Sign out</button><button class="secondary" id="refresh" type="button">Refresh subscription status</button></section>
<section id="plans"><h2>Trial, then Pro</h2><p>Start a ${TRIAL_PERIOD_DAYS}-day trial. Billing interval and payment terms are shown at checkout. This page does not list a price.</p>
<button type="button" class="checkout" data-plan="monthly">Start monthly trial</button>
<button type="button" class="checkout" data-plan="annual">Start yearly trial</button></section>
<p id="message" role="status"></p>
${configured ? `<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.115.0/dist/umd/supabase.js"></script>` : ""}
<script>
(function(){
  var cfg=${config};
  var token="";
  var client=null;
  function el(id){return document.getElementById(id)}
  function say(text){el("message").textContent=text}
  async function loadAccount(){
    var response=await fetch("/api/account",{headers:{Authorization:"Bearer "+token}});
    var body=await response.json();
    if(!response.ok) throw new Error(body.error||"Sign in again.");
    el("email").textContent=body.email||"Signed in";
    el("status").textContent=body.subscriptionStatus==="trialing"?"Milestone Pro · Trial in progress":body.subscriptionStatus==="active"?"Milestone Pro · Active":"Signed in. Start a ${TRIAL_PERIOD_DAYS}-day trial to use Milestone tools.";
    el("account").hidden=false;
    el("signedOut").hidden=true;
    el("plans").hidden=Boolean(body.access);
  }
  function signedOut(){token="";el("account").hidden=true;el("signedOut").hidden=false;el("plans").hidden=false}
  document.querySelectorAll(".checkout").forEach(function(button){
    button.onclick=async function(){
      if(!cfg.url||!cfg.key){say("Sign-in is not configured on this server yet.");return}
      if(!token){say("Sign in first, then start a trial.");return}
      button.disabled=true;
      try{
        var response=await fetch("/billing/checkout",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({plan:button.getAttribute("data-plan")})});
        var body=await response.json();
        if(!response.ok) throw new Error(body.error||"Unable to start checkout");
        location.href=body.url;
      }catch(error){say(error.message);button.disabled=false}
    };
  });
  if(!cfg.url||!cfg.key||!window.supabase){signedOut();return}
  client=window.supabase.createClient(cfg.url,cfg.key,{auth:{flowType:"implicit",persistSession:true,detectSessionInUrl:true,autoRefreshToken:true}});
  function resumePlugin(){
    try{
      var saved=sessionStorage.getItem("milestonePluginReturn"); if(!saved) return false;
      sessionStorage.removeItem("milestonePluginReturn");
      var pending=JSON.parse(saved);
      if(!pending||typeof pending.createdAt!=="number"||Date.now()-pending.createdAt>600000) return false;
      location.assign(pending.id?"/oauth/consent?authorization_id="+encodeURIComponent(pending.id):"/connections");
      return true;
    }catch(error){return false}
  }
  client.auth.onAuthStateChange(function(_event,session){
    token=session&&session.access_token?session.access_token:"";
    if(token){ if(resumePlugin()) return; loadAccount().catch(function(error){say(error.message)}); }
    else signedOut();
  });
  client.auth.getSession().then(function(result){
    var session=result.data&&result.data.session;
    token=session&&session.access_token?session.access_token:"";
    if(token){ if(resumePlugin()) return; return loadAccount(); }
    signedOut();
  }).catch(function(error){say(error.message)});
  var google=document.createElement("button");
  google.type="button";
  google.textContent="Continue with Google";
  el("signedOut").appendChild(google);
  google.onclick=async function(){
    google.disabled=true;
    try{var result=await client.auth.signInWithOAuth({provider:"google",options:{redirectTo:cfg.base+"/"}});if(result.error) throw result.error}
    catch(error){say(error.message||String(error));google.disabled=false}
  };
  el("signOut").onclick=async function(){await client.auth.signOut();signedOut();location.href="/"};
  el("refresh").onclick=function(){if(token) loadAccount().catch(function(error){say(error.message)})};
  var checkout=new URLSearchParams(location.search).get("checkout");
  if(checkout==="success") say("Checkout completed. Your subscription is being confirmed.");
  if(checkout==="cancelled") say("Checkout was cancelled. No changes were made.");
})();
</script>`);
}

const privacyPolicy = `<p>Effective October 5, 2026. Milestone is operated by Ouroboros Apps (Lawrence Hutchins). Contact the operator through the <a href="/support">support form</a>.</p>
<h2>Information we process</h2>
<p>We process account identifiers and the account email provided at sign-in, subscription status and billing references, and the freelance records you intentionally save: milestone definitions, acceptance criteria, deliverables, saved work, and the wording an assistant may tell a client. Those records can include a client name and project details you choose to store. Support requests contain the reply email and message you provide.</p>
<p>We do not receive every assistant conversation. Tools receive only their submitted arguments. Do not include passwords, payment card details, or unrelated personal information in milestone records. Submit only information you have the right to share.</p>
<h2>Why and where</h2>
<p>We use this information to provide Milestone, authenticate users, enforce subscriptions, respond to support, prevent abuse, and meet legal obligations. Supabase provides authentication. Vercel hosts the service. Google provides optional sign-in. Stripe processes payments. We do not store complete card numbers. Connected MCP hosts, including ChatGPT, Claude, Gemini, Grok, Cursor, and other clients you authorize, receive the milestone definitions, acceptance criteria, deliverables, saved work, client wording, account email, and subscription status their authorized tools request, and they apply their own privacy terms. Service providers may process information outside your country.</p>
<h2>Control and retention</h2>
<p>We do not sell milestone records or use them to train our own models. Saved milestone definitions, acceptance criteria, deliverables, work, and client wording remain until you request deletion. Disconnecting an assistant stops future tool access and does not delete the saved record. Deletion removes the live milestone records we hold. Provider backups may persist according to provider retention and are not an instant erasure guarantee. Billing records may be retained for required accounting or dispute handling.</p>
<p>Use <a href="/support">support</a> to request account deletion, correction, access, or questions about retention. Support records are kept while resolving the request and as needed for security or legal obligations. The service uses sign-in storage to maintain your session. No advertising trackers are included.</p>
<h2>Security and changes</h2>
<p>Account authentication limits connected tools to the signed-in account's milestone records. No service can promise absolute security. We publish policy changes here with an updated effective date. If local privacy law gives you additional rights, you may exercise them through support.</p>`;

export function installPublicPages(app: Express, baseUrl: string, supabaseUrl: string, supabaseAnonKey: string) {
  app.get("/icon.svg", (_req, res) => res.type("svg").send(logo));
  app.get("/connect", (_req, res) => res.type("html").send(page("Connect an assistant", connectPageBody(baseUrl))));
  app.get("/access", (_req, res) => res.type("html").send(page("Milestone access", `<p>Milestone tools are available with an active Pro subscription or trial. This connection has no entitlement at present. It cannot change your plan or start a purchase.</p><p><a href="/">Review the account</a> or <a href="/support">contact support</a> if access looks incorrect.</p>`)));
  app.get("/privacy", (_req, res) => res.type("html").send(page("Privacy policy", privacyPolicy)));
  app.get("/terms", (_req, res) => res.type("html").send(page("Terms of service", `<p>Effective October 4, 2026. These terms govern Milestone, offered under the Hutchins App Studio brand. Questions go through <a href="/support">support</a>.</p><h2>Your records</h2><p>You retain rights in the milestone definitions you submit. You grant the operator permission to host and transmit them only to provide the service. Submit only information you have the right to use.</p><h2>Accounts and paid access</h2><p>Milestone tools require Pro or an active trial. A new subscription starts with a ${TRIAL_PERIOD_DAYS}-day trial. Billing interval, trial end, and payment terms are shown at checkout. This service does not display a price on its own pages. Manage cancellation through the billing portal. Cancellation does not delete saved records.</p><h2>Limits</h2><p>The assistant chooses when to call tools. Milestone refuses saying a milestone is complete or that the next payment is released unless the saved acceptance criteria were met, and it refuses an extra deliverable or marking unsaved work done. It cannot promise that every assistant will ask before it speaks. Review the approved milestones and what the assistant may tell the client.</p>`)));
  app.get("/support", (_req, res) => res.type("html").send(page("Contact Milestone", `<section><h2>Use with Grok</h2><ol><li>Go to <a href="https://grok.com/connectors">grok.com/connectors</a>.</li><li>Choose New Connector → Custom.</li><li>Paste <code>https://milestone-continuity2.vercel.app/mcp</code>.</li><li>Sign in.</li></ol><p>Full install steps for every assistant are on <a href="/connect">Connect an assistant</a>.</p></section><p>Send a support, billing, or privacy request. Do not include passwords, tokens, or payment card details.</p><form id="support"><label>Reply email<input name="email" type="email" required maxlength="254"></label><label>How can we help?<textarea name="message" required minlength="10" maxlength="4000" rows="7"></textarea></label><button>Send request</button></form><p id="message" role="status"></p><script>document.getElementById("support").onsubmit=async function(event){event.preventDefault();var button=this.querySelector("button");button.disabled=true;try{var response=await fetch("/api/support",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:this.email.value,message:this.message.value})});var body=await response.json();if(!response.ok) throw Error(body.error||"Unable to send");document.getElementById("message").textContent="Request received. Reference: "+body.id;this.reset()}catch(error){document.getElementById("message").textContent=error.message}finally{button.disabled=false}};</script>`)));
  app.get(["/", "/app"], (_req, res) => {
    res.type("html").send(landingPage({ appBaseUrl: baseUrl, supabaseUrl, supabaseAnonKey }));
  });
}
