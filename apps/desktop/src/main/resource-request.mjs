export const resourceRequestHeaders = ({ cookies = [], sessionToken = "" } = {}) => {
  const headers = new Headers();
  const cookieHeader = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
  const normalizedSessionToken = typeof sessionToken === "string" ? sessionToken.trim() : "";

  if (cookieHeader) headers.set("Cookie", cookieHeader);
  if (normalizedSessionToken) headers.set("Authorization", `Bearer ${normalizedSessionToken}`);

  return headers;
};
