import type { Address, LocalAccount } from "viem";

// What an account signs to set its display name.
export const profileMessage = (name: string) => `Firstrow display name: ${name}`;

export async function saveProfile(account: LocalAccount, name: string) {
  const signature = await account.signMessage({ message: profileMessage(name) });
  const res = await fetch("/api/profile", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address: account.address, name, signature }),
  });
  if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? "Couldn't save your name.");
}

export async function fetchNames(addresses: Address[]): Promise<Record<string, string>> {
  if (addresses.length === 0) return {};
  try {
    const res = await fetch(`/api/profile?addresses=${addresses.join(",")}`);
    return ((await res.json()) as { names: Record<string, string> }).names ?? {};
  } catch {
    return {};
  }
}

export const fetchName = async (address: Address) => (await fetchNames([address]))[address.toLowerCase()] ?? null;
