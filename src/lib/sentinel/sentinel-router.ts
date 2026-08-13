import type { ChatMessage, SentinelProviderId } from "./providers/types";
import { ask, healthCheckProviders, stream } from "./providers/provider-router";
import type { RoutingProfile } from "./providers/provider-router";

export type { RoutingProfile };

export async function routeChat(args: {
  messages: ChatMessage[];
  requestedProvider?: string;
  profile?: RoutingProfile;
  signal?: AbortSignal;
}) {
  return ask(args.messages, {
    requestedProvider: args.requestedProvider,
    profile: args.profile,
    signal: args.signal,
  });
}

export async function getProviderStatuses(activeProvider?: SentinelProviderId | null) {
  return healthCheckProviders(activeProvider ?? null);
}

export async function routeStream(args: {
  messages: ChatMessage[];
  requestedProvider?: string;
  profile?: RoutingProfile;
  signal?: AbortSignal;
}) {
  return stream(args.messages, {
    requestedProvider: args.requestedProvider,
    profile: args.profile,
    signal: args.signal,
  });
}
