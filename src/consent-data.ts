/**
 * What the server tells the consent page to show. The server decides everything that matters
 * (which client, which servers, who is signed in); the page only draws it.
 * Types only, so the web app can import this file without pulling in server code.
 */
export interface Brand {
  name: string;
  iconUrl: string;
}

export type ConsentPageData =
  | {
      kind: "consent";
      /** The AI app asking for access, as detected from its id and redirect host. */
      client: Brand;
      /** The name the client registered under. */
      clientName: string;
      clientId: string;
      /** A single requested server, or the first few enabled ones plus a count of the rest. */
      servers: { items: Brand[]; more: number; requested: boolean };
      user?: { name: string; username: string };
      redirectOrigin: string;
      scope?: string;
      /** The OAuth parameters to send back with the decision, as hidden form fields. */
      fields: Record<string, string>;
    }
  | { kind: "message"; title: string; message: string };
