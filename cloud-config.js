/* The two values that connect this site to its backend.
 *
 * Paste them in from the Supabase dashboard (Settings → API Keys) and the
 * sign-in button, the suggestion form and the admin queue all wake up. Leave
 * them empty and the site behaves exactly as it did before any of that
 * existed: no sign-in, no forms, nothing to break.
 *
 * For `anonKey` use the **publishable** key (`sb_publishable_…`). The older
 * `anon` key still works and can go here unchanged, but Supabase is retiring
 * it at the end of 2026, so a new project should start on the new one.
 *
 * Both values are meant to be public. A publishable key identifies the
 * project; it does not grant anything. What a visitor may read or write is
 * decided by the row-level security rules in supabase-setup.sql, on the
 * server, where nobody can edit them. Never paste a `secret` or
 * `service_role` key here: those really are master keys.
 *
 * Who counts as admin is not set here either. It lives in the `admins` table
 * in the database, so it cannot be changed by editing a file that ships to
 * every visitor.
 */
window.CHISHIKUNEM_CLOUD = {
  url: 'https://sebkqfiamwkgdexkdalp.supabase.co',
  anonKey: 'sb_publishable_CRfGs2_WSOwAEH5gZC67hg_jBwUtyMT',
};
