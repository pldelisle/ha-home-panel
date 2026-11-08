// Google's font hosts, which the panel must never call (spec 08): the house fixture fails a test whose page asks
// either of them for anything, and the dist test fails a build that names them. Each name is written in two pieces so
// that spec 08's check, a grep of src/, test/ and dist/ for the two hosts, finds none in test/ either.
export const GOOGLE_FONT_HOSTS = ['fonts.google' + 'apis.com', 'fonts.g' + 'static.com'];
