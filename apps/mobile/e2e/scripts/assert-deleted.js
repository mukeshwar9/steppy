// Runs inside Maestro. After "Delete account" the old credentials must no longer log in (401).
var res = http.request(API + "/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD })
});
if (res.status !== 401) throw new Error("Deleted account can still log in: HTTP " + res.status);
