// Runs inside Maestro. Bob uploads today's steps (STEPS) with PUT /steps, like his phone would.
// Expects API, STEPS in env and output.bobToken from social-setup.js.
var tz = "Asia/Kolkata";
var ist = new Date(new Date().getTime() + 330 * 60000); // UTC+5:30, no DST
var pad = function (n) { return (n < 10 ? "0" : "") + n; };
var today = ist.getUTCFullYear() + "-" + pad(ist.getUTCMonth() + 1) + "-" + pad(ist.getUTCDate());
var res = http.request(API + "/steps", {
  method: "PUT",
  headers: { "Content-Type": "application/json", Authorization: "Bearer " + output.bobToken },
  body: JSON.stringify({ source: "HEALTHKIT", timezone: tz, reason: "live", days: [{ date: today, steps: parseInt(STEPS, 10) }] })
});
if (!res.ok) throw new Error("PUT /steps -> " + res.status + " " + res.body);
