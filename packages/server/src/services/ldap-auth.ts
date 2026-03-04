import { Client } from "ldapts";

export type AuthMode = "local" | "ldap";

export function getAuthMode(): AuthMode {
  const mode = (process.env.AUTH_MODE || "local").toLowerCase();
  if (mode === "ldap") return "ldap";
  return "local";
}

export function isLdapMode(): boolean {
  return getAuthMode() === "ldap";
}

/**
 * Authenticate a user via LDAP simple bind.
 * Returns true on success, false on invalid credentials.
 * Throws on connection/configuration errors.
 */
export async function authenticateLdap(
  username: string,
  password: string,
): Promise<boolean> {
  const url = process.env.LDAP_URL;
  const dnTemplate = process.env.LDAP_BIND_DN_TEMPLATE;

  if (!url || !dnTemplate) {
    throw new Error(
      "LDAP_URL and LDAP_BIND_DN_TEMPLATE must be set when AUTH_MODE=ldap",
    );
  }

  const dn = dnTemplate.replace("{}", username);

  const client = new Client({
    url,
    timeout: 5000,
    connectTimeout: 5000,
  });

  try {
    await client.bind(dn, password);
    return true;
  } catch (err: any) {
    // LDAP "invalid credentials" error code
    if (err.code === 49 || err.message?.includes("Invalid credentials")) {
      return false;
    }
    throw err;
  } finally {
    try {
      await client.unbind();
    } catch {
      // ignore unbind errors
    }
  }
}
