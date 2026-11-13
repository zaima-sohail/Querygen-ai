import { setServers } from "node:dns";

let configured = false;

export function configureMongoDns() {
  if (configured) {
    return;
  }

  const servers = process.env.MONGODB_DNS_SERVERS
    ?.split(",")
    .map((server) => server.trim())
    .filter(Boolean);

  if (servers?.length) {
    setServers(servers);
  }

  configured = true;
}
