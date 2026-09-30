// Runs inside Maestro (GraalJS). Registers friend "Bob Buddy" through the API and makes him a friend of
// the app user (by the app user's friend code). Expects EMAIL, PASSWORD, API in env.
var api = API;
function call(method, path, token, body) {
  var headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = "Bearer " + token;
  var res = http.request(api + path, { method: method, headers: headers, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(method + " " + path + " -> " + res.status + " " + res.body);
  return res.body ? json(res.body) : {};
}
var a = call("POST", "/auth/login", null, { email: EMAIL, password: PASSWORD });
var stamp = "" + new Date().getTime();
var b = call("POST", "/auth/register", null, {
  email: "e2e-bob-" + stamp + "@example.com",
  password: "e2e-password",
  displayName: "Bob Buddy",
  timezone: "Asia/Kolkata"
});
call("POST", "/friends", b.accessToken, { friendCode: a.user.friendCode });
output.bobToken = b.accessToken;
output.friendCode = a.user.friendCode;
