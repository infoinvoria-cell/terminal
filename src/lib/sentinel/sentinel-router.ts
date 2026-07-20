import type { ChatMessage } from "./providers/types";
import { ask, healthCheckProviders, stream } from "./providers/provider-router";

export async function routeChat(args: { messages: ChatMessage[]; requestedProvider?: string }) {
  return ask(args.messages, { requestedProvider: args.requestedProvider });
}

export async function getProviderStatuses(activeProvider?: "local" | "ollama" | "groq" | "anthropic" | "custom" | null) {
  return healthCheckProviders(activeProvider ?? null);
}

export async function routeStream(args: { messages: ChatMessage[]; requestedProvider?: string }) {
  return stream(args.messages, { requestedProvider: args.requestedProvider });
}
