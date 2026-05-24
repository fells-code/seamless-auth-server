export function roleGrantsAccess(grantedRole: string, requiredRole: string): boolean {
  const granted = grantedRole.trim();
  const required = requiredRole.trim();

  if (!granted || !required) {
    return false;
  }

  if (granted === required) {
    return true;
  }

  if (granted.endsWith(":*")) {
    const prefix = granted.slice(0, -2);
    return required === prefix || required.startsWith(`${prefix}:`);
  }

  if (!required.includes(":")) {
    return false;
  }

  if (!granted.includes(":")) {
    return required.startsWith(`${granted}:`);
  }

  const grantedParts = granted.split(":");
  const requiredParts = required.split(":");
  const grantedAction = grantedParts.at(-1);
  const requiredAction = requiredParts.at(-1);
  const grantedPrefix = grantedParts.slice(0, -1);
  const requiredPrefix = requiredParts.slice(0, -1);

  return (
    grantedAction === "write" &&
    requiredAction === "read" &&
    grantedPrefix.length === requiredPrefix.length &&
    grantedPrefix.every((part, index) => part === requiredPrefix[index])
  );
}

export function hasScopedRole(
  grantedRoles: unknown,
  requiredRoles: string | string[],
): boolean {
  if (!Array.isArray(grantedRoles)) {
    return false;
  }

  const granted = grantedRoles.filter(
    (role): role is string => typeof role === "string",
  );
  const required = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];

  return required.some((requiredRole) =>
    granted.some((grantedRole) => roleGrantsAccess(grantedRole, requiredRole)),
  );
}
